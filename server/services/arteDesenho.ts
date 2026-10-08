/**
 * O desenho das artes sem banco (`server/services/artes.ts` busca os dados
 * e junta o fundo): o texto em contornos, o QR e a camada de cima. Separado
 * para os testes rodarem sem Postgres.
 */
import { createRequire } from "node:module";
import * as fontkit from "fontkit";
import QRCode from "qrcode";
import {
  AREA_SEGURA_DO_VERTICAL,
  FORMATOS_DA_ARTE,
  rodapeDaArte,
  textosDaArte,
  type DadosDaArte,
  type FormatoDaArte,
  type TipoDeArte,
} from "@shared/artes";

// ---------------------------------------------------------------- fontes

const exigir = createRequire(import.meta.url);
const FONTES = {
  titulo: "@fontsource/bricolage-grotesque/files/bricolage-grotesque-latin-800-normal.woff",
  premio: "@fontsource/bricolage-grotesque/files/bricolage-grotesque-latin-700-normal.woff",
  texto: "@fontsource/instrument-sans/files/instrument-sans-latin-500-normal.woff",
  forte: "@fontsource/instrument-sans/files/instrument-sans-latin-700-normal.woff",
  numero: "@fontsource/dm-mono/files/dm-mono-latin-500-normal.woff",
} as const;
type NomeDaFonte = keyof typeof FONTES;
const abertas = new Map<NomeDaFonte, fontkit.Font>();

function fonte(nome: NomeDaFonte): fontkit.Font {
  let f = abertas.get(nome);
  if (!f) {
    f = fontkit.openSync(exigir.resolve(FONTES[nome]));
    abertas.set(nome, f);
  }
  return f;
}

/** Só o que a fonte latina desenha: o resto (emoji, outra escrita) sai. */
function limparTexto(texto: string): string {
  return texto
    .normalize("NFC")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/[^ -ɏ–—‘-”•…ºª°·]/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function larguraDoTexto(nome: NomeDaFonte, texto: string, tamanho: number): number {
  const f = fonte(nome);
  return (f.layout(texto).advanceWidth * tamanho) / f.unitsPerEm;
}

/** O texto como contornos SVG, com a linha de base em `y`. */
export function textoEmContorno(
  nome: NomeDaFonte,
  texto: string,
  x: number,
  y: number,
  tamanho: number,
  cor: string,
): string {
  const f = fonte(nome);
  const run = f.layout(texto);
  const k = tamanho / f.unitsPerEm;
  let cx = 0;
  const partes: string[] = [];
  run.glyphs.forEach((g, i) => {
    const p = run.positions[i];
    const d = g.path.toSVG();
    if (d) {
      const gx = x + (cx + p.xOffset) * k;
      const gy = y - p.yOffset * k;
      partes.push(`<path transform="translate(${gx.toFixed(2)} ${gy.toFixed(2)}) scale(${k.toFixed(5)} ${(-k).toFixed(5)})" d="${d}"/>`);
    }
    cx += p.xAdvance;
  });
  return `<g fill="${cor}">${partes.join("")}</g>`;
}

/**
 * Quebra o texto em até `maxLinhas` linhas de `largura`; o que sobra vira
 * reticências na última. Palavra maior que a linha é cortada.
 */
export function quebrarTexto(nome: NomeDaFonte, texto: string, tamanho: number, largura: number, maxLinhas: number): string[] {
  const palavras = limparTexto(texto).split(" ").filter(Boolean);
  const linhas: string[] = [];
  let atual = "";
  for (const p of palavras) {
    const tentativa = atual ? `${atual} ${p}` : p;
    if (larguraDoTexto(nome, tentativa, tamanho) <= largura || !atual) atual = tentativa;
    else {
      linhas.push(atual);
      atual = p;
    }
  }
  if (atual) linhas.push(atual);
  const cabe = (l: string) => larguraDoTexto(nome, l, tamanho) <= largura;
  const cortar = (l: string) => {
    let s = l;
    while (s.length > 1 && !cabe(`${s}…`)) s = s.slice(0, -1).trimEnd();
    return `${s}…`;
  };
  if (linhas.length > maxLinhas) {
    const ficam = linhas.slice(0, maxLinhas);
    ficam[maxLinhas - 1] = cortar(ficam[maxLinhas - 1]);
    return ficam;
  }
  return linhas.map((l) => (cabe(l) ? l : cortar(l)));
}

// ---------------------------------------------------------------- QR

/** O QR como um caminho só, num quadrado de `lado` px com a margem branca. */
export function qrEmContorno(url: string, x: number, y: number, lado: number, cor = "#0b1f14"): string {
  const qr = QRCode.create(url, { errorCorrectionLevel: "M" });
  const n = qr.modules.size;
  const margem = 2;
  const k = lado / (n + margem * 2);
  let d = "";
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if (qr.modules.data[r * n + c]) d += `M${c + margem} ${r + margem}h1v1h-1z`;
    }
  }
  return (
    `<rect x="${x}" y="${y}" width="${lado}" height="${lado}" rx="12" fill="#ffffff"/>` +
    `<path transform="translate(${x} ${y}) scale(${k.toFixed(5)})" fill="${cor}" shape-rendering="crispEdges" d="${d}"/>`
  );
}

// ---------------------------------------------------------------- camada

export interface RifaDaArte {
  id: string;
  slug: string;
  organizationId: string;
  orgNome: string;
  /** A cor de destaque da organização (`#rrggbb`, contraste já conferido), senão o verde. */
  destaque: string;
  dados: DadosDaArte;
  /** A capa: o banner, senão a primeira foto, senão o pôster do primeiro vídeo. */
  capaKey: string | null;
}

export interface PedidoDeArte {
  rifa: RifaDaArte;
  tipo: TipoDeArte;
  formato: FormatoDaArte;
  /** O endereço do QR e do rodapé (o link do afiliado, com o código dele). */
  url: string;
}

const MARGEM = 64;

/** Monta a camada de cima (SVG) e diz onde vai a foto da organização. */
export function camadaDaArte(p: PedidoDeArte, comLogo: boolean): { svg: string; logo: { x: number; y: number; lado: number } } {
  const { largura, altura } = FORMATOS_DA_ARTE[p.formato];
  const vertical = p.formato === "vertical";
  const topo = vertical ? AREA_SEGURA_DO_VERTICAL.topo : MARGEM - 8;
  const base = altura - (vertical ? AREA_SEGURA_DO_VERTICAL.base : MARGEM);
  const util = largura - MARGEM * 2;
  const t = textosDaArte(p.tipo, p.rifa.dados);
  const branco = "#ffffff";
  const suave = "#e6efe9";

  // De baixo para cima: rodapé (QR e endereço), linhas, prêmio, destaque, chamada.
  // Se não couber, tudo encolhe junto, até três vezes.
  for (let escala = 1; ; escala -= 0.12) {
    const partes: string[] = [];
    const qr = Math.round(200 * escala);
    let y = base;
    // Rodapé.
    const rodapeTopo = y - qr;
    partes.push(qrEmContorno(p.url, MARGEM, rodapeTopo, qr));
    const tx = MARGEM + qr + 28;
    const larguraDoRodape = largura - MARGEM - tx;
    const endereco = p.url.replace(/^https?:\/\//, "");
    const tEnd = Math.min(30 * escala, (30 * escala * larguraDoRodape) / Math.max(1, larguraDoTexto("numero", endereco, 30 * escala)));
    const [chamadaDoRodape, avisoDoRodape] = rodapeDaArte(p.tipo, p.rifa.dados.vende);
    partes.push(textoEmContorno("forte", chamadaDoRodape, tx, rodapeTopo + 48 * escala, 36 * escala, branco));
    partes.push(textoEmContorno("numero", endereco, tx, rodapeTopo + 96 * escala, tEnd, suave));
    partes.push(textoEmContorno("texto", quebrarTexto("texto", avisoDoRodape, 26 * escala, larguraDoRodape, 1)[0] ?? "", tx, rodapeTopo + 142 * escala, 26 * escala, suave));
    y = rodapeTopo - 40 * escala;

    // Linhas de apoio, de baixo para cima.
    const tamLinha = 32 * escala;
    const linhas = t.linhas.flatMap((l) => quebrarTexto("texto", l, tamLinha, util, 2));
    for (let i = linhas.length - 1; i >= 0; i--) {
      partes.push(textoEmContorno("texto", linhas[i], MARGEM, y, tamLinha, suave));
      y -= tamLinha * 1.35;
    }
    y -= 16 * escala;

    // O prêmio.
    const tamPremio = (p.formato === "quadrado" ? 52 : 60) * escala;
    const premio = quebrarTexto("premio", t.titulo, tamPremio, util, p.formato === "quadrado" ? 2 : 3);
    for (let i = premio.length - 1; i >= 0; i--) {
      partes.push(textoEmContorno("premio", premio[i], MARGEM, y, tamPremio, branco));
      y -= tamPremio * 1.12;
    }
    y -= 20 * escala;

    // O destaque (o número grande): uma linha, encolhe até caber.
    const destaque = t.destaque ? limparTexto(t.destaque) : "";
    if (destaque) {
      let tam = (p.formato === "quadrado" ? 104 : 124) * escala;
      const w = larguraDoTexto("titulo", destaque, tam);
      if (w > util) tam = (tam * util) / w;
      partes.push(textoEmContorno("titulo", destaque, MARGEM, y, tam, branco));
      y -= tam * 1.05;
    }

    // A chamada numa pílula na cor da organização.
    const tamChamada = 30 * escala;
    const chamada = limparTexto(t.chamada).toUpperCase();
    const wChamada = larguraDoTexto("forte", chamada, tamChamada);
    const hPilula = tamChamada * 1.8;
    const yPilula = y - hPilula;
    partes.push(`<rect x="${MARGEM}" y="${yPilula.toFixed(1)}" width="${(wChamada + 44 * escala).toFixed(1)}" height="${hPilula.toFixed(1)}" rx="${(hPilula / 2).toFixed(1)}" fill="${p.rifa.destaque}"/>`);
    partes.push(textoEmContorno("forte", chamada, MARGEM + 22 * escala, yPilula + hPilula / 2 + tamChamada * 0.36, tamChamada, branco));

    // O cabeçalho: foto e nome da organização.
    const lado = 88;
    const nomeX = comLogo ? MARGEM + lado + 20 : MARGEM;
    const nome = quebrarTexto("forte", p.rifa.orgNome, 34, largura - nomeX - MARGEM, 1)[0] ?? "";
    const cabecalho =
      (comLogo ? `<circle cx="${MARGEM + lado / 2}" cy="${topo + lado / 2}" r="${lado / 2 + 4}" fill="${branco}"/>` : "") +
      textoEmContorno("forte", nome, nomeX, topo + lado / 2 + 12, 34, branco);

    const cabe = yPilula > topo + lado + 24;
    if (!cabe && escala > 0.65) continue;

    // Escurece em cima (para o nome) e de baixo até acima da chamada (para o texto).
    const inicioDoEscuro = Math.max(0, (yPilula - 160) / altura);
    const svg =
      `<svg xmlns="http://www.w3.org/2000/svg" width="${largura}" height="${altura}" viewBox="0 0 ${largura} ${altura}">` +
      `<defs>` +
      `<linearGradient id="b" x1="0" y1="0" x2="0" y2="1"><stop offset="${inicioDoEscuro.toFixed(3)}" stop-color="#000" stop-opacity="0"/><stop offset="${Math.min(1, inicioDoEscuro + 0.18).toFixed(3)}" stop-color="#000" stop-opacity="0.62"/><stop offset="1" stop-color="#000" stop-opacity="0.86"/></linearGradient>` +
      `<linearGradient id="c" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#000" stop-opacity="0.55"/><stop offset="1" stop-color="#000" stop-opacity="0"/></linearGradient>` +
      `</defs>` +
      `<rect width="${largura}" height="${altura}" fill="url(#b)"/>` +
      `<rect width="${largura}" height="${topo + lado + 120}" fill="url(#c)"/>` +
      cabecalho +
      partes.join("") +
      `</svg>`;
    return { svg, logo: { x: MARGEM, y: topo, lado } };
  }
}

