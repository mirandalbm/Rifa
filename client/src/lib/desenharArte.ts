import {
  CORES_DO_TEXTO,
  FONTES_DO_EDITOR,
  contornoDa,
  quebrarEmLinhas,
  retanguloDoFundo,
  type Camada,
  type Enquadramento,
} from "@shared/editorImagem";
import bricolage800 from "@fontsource/bricolage-grotesque/files/bricolage-grotesque-latin-800-normal.woff2?url";
import instrument600 from "@fontsource/instrument-sans/files/instrument-sans-latin-600-normal.woff2?url";
import dmMono500 from "@fontsource/dm-mono/files/dm-mono-latin-500-normal.woff2?url";

/**
 * O desenho do editor de imagem (Fase C) no canvas do navegador. A mesma
 * função faz a prévia (em escala menor) e a imagem final (1080 de largura):
 * o que a pessoa vê é o que sai. Só desenha dados que já passaram pela régua
 * (`validarCamadas`); preço, selo e QR vêm do servidor.
 */

export interface RecursosDoDesenho {
  fundo: CanvasImageSource | null;
  medidaDoFundo: { largura: number; altura: number } | null;
  logo: CanvasImageSource | null;
  nomeDaOrganizacao: string;
  /** Os módulos do QR (`true` = escuro), quadrado. */
  qr: boolean[][] | null;
  preco: string;
  selo: string | null;
}

export interface Caixa {
  x: number;
  y: number;
  largura: number;
  altura: number;
}

const VERDE = CORES_DO_TEXTO.verde.hex;
const AZUL = CORES_DO_TEXTO.azul.hex;
const TINTA = CORES_DO_TEXTO.tinta.hex;
const EMOJI = '"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",system-ui,sans-serif';

export function fonteDoCanvas(fonte: keyof typeof FONTES_DO_EDITOR, px: number): string {
  const f = FONTES_DO_EDITOR[fonte];
  return `${f.peso} ${Math.round(px)}px "${f.familia}", system-ui, sans-serif`;
}

/**
 * Os arquivos das fontes vêm do próprio site (os do `@fontsource`, os mesmos
 * das artes prontas do servidor): a imagem sai nas fontes da plataforma mesmo
 * se o Google Fonts não carregar. Sem elas, o canvas usaria a do sistema.
 */
const ARQUIVOS_DAS_FONTES: Record<keyof typeof FONTES_DO_EDITOR, string> = {
  titulo: bricolage800,
  texto: instrument600,
  numero: dmMono500,
};

let fontesCarregadas: Promise<void> | null = null;

/** Carrega as fontes da plataforma antes de desenhar (uma vez por página). */
export function carregarFontesDoEditor(): Promise<void> {
  if (typeof document === "undefined" || !document.fonts || typeof FontFace === "undefined") return Promise.resolve();
  fontesCarregadas ??= Promise.all(
    (Object.keys(FONTES_DO_EDITOR) as (keyof typeof FONTES_DO_EDITOR)[]).map(async (f) => {
      const { familia, peso } = FONTES_DO_EDITOR[f];
      try {
        const face = new FontFace(familia, `url(${ARQUIVOS_DAS_FONTES[f]}) format("woff2")`, { weight: String(peso) });
        document.fonts.add(await face.load());
      } catch {
        // Sem o arquivo, fica a do Google (se carregou) ou a do sistema.
      }
    }),
  ).then(() => undefined);
  return fontesCarregadas;
}

function retanguloArredondado(ctx: CanvasRenderingContext2D, x: number, y: number, l: number, a: number, r: number) {
  ctx.beginPath();
  ctx.roundRect(x, y, l, a, r);
}

/**
 * Desenha a imagem inteira em `ctx` (o canvas tem `largura × escala` de
 * largura) e devolve a caixa de cada camada, na medida da imagem final, para
 * a tela saber em qual o dedo tocou.
 */
export function desenharImagem(
  ctx: CanvasRenderingContext2D,
  p: {
    largura: number;
    altura: number;
    escala: number;
    enquadramento: Enquadramento;
    camadas: Camada[];
    recursos: RecursosDoDesenho;
    selecionada?: number | null;
  },
): Caixa[] {
  const { largura: W, altura: H, recursos: r } = p;
  ctx.save();
  ctx.setTransform(p.escala, 0, 0, p.escala, 0, 0);
  ctx.clearRect(0, 0, W, H);

  // Fundo: a foto cobrindo tudo ou, sem foto, o degradê da casa.
  if (r.fundo && r.medidaDoFundo) {
    const f = retanguloDoFundo(r.medidaDoFundo, { largura: W, altura: H }, p.enquadramento);
    ctx.drawImage(r.fundo, f.x, f.y, f.largura, f.altura);
  } else {
    const g = ctx.createLinearGradient(0, 0, W, H);
    g.addColorStop(0, VERDE);
    g.addColorStop(1, AZUL);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  }

  const caixas = p.camadas.map((c) => desenharCamada(ctx, c, W, H, r));

  if (p.selecionada != null && caixas[p.selecionada]) {
    const c = caixas[p.selecionada];
    ctx.save();
    ctx.lineWidth = 4;
    ctx.setLineDash([16, 10]);
    ctx.strokeStyle = "#ffffff";
    ctx.shadowColor = "rgba(0,0,0,0.6)";
    ctx.shadowBlur = 6;
    ctx.strokeRect(c.x - 8, c.y - 8, c.largura + 16, c.altura + 16);
    ctx.restore();
  }
  ctx.restore();
  return caixas;
}

function desenharCamada(ctx: CanvasRenderingContext2D, c: Camada, W: number, H: number, r: RecursosDoDesenho): Caixa {
  const cx = c.x * W;
  const cy = c.y * H;
  const lado = c.tamanho * W;
  ctx.save();
  try {
    if (c.tipo === "texto") return desenharTexto(ctx, c, cx, cy, W);
    if (c.tipo === "emoji") {
      ctx.font = `${Math.round(lado)}px ${EMOJI}`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(c.emoji, cx, cy);
      return { x: cx - lado / 2, y: cy - lado / 2, largura: lado, altura: lado };
    }
    if (c.tipo === "preco" || c.tipo === "selo") {
      const texto = c.tipo === "preco" ? r.preco : (r.selo ?? "");
      let px = lado * 0.5;
      const fonte = c.tipo === "preco" ? "numero" : "texto";
      ctx.font = fonteDoCanvas(fonte, px);
      // O que não cabe na largura encolhe: o selo é comprido.
      const max = W * 0.9 - lado * 0.8;
      const medido = ctx.measureText(texto).width;
      if (medido > max) {
        px *= max / medido;
        ctx.font = fonteDoCanvas(fonte, px);
      }
      const l = ctx.measureText(texto).width + lado * 0.8;
      const a = lado;
      const x = cx - l / 2;
      const y = cy - a / 2;
      ctx.shadowColor = "rgba(0,0,0,0.3)";
      ctx.shadowBlur = a * 0.25;
      ctx.shadowOffsetY = a * 0.06;
      retanguloArredondado(ctx, x, y, l, a, a / 2);
      ctx.fillStyle = c.tipo === "preco" ? VERDE : "#ffffff";
      ctx.fill();
      ctx.shadowColor = "transparent";
      ctx.fillStyle = c.tipo === "preco" ? "#ffffff" : TINTA;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(texto, cx, cy + px * 0.04);
      return { x, y, largura: l, altura: a };
    }
    if (c.tipo === "logo") {
      const raio = lado / 2;
      ctx.shadowColor = "rgba(0,0,0,0.35)";
      ctx.shadowBlur = lado * 0.1;
      ctx.beginPath();
      ctx.arc(cx, cy, raio, 0, Math.PI * 2);
      ctx.fillStyle = "#ffffff";
      ctx.fill();
      ctx.shadowColor = "transparent";
      const dentro = raio * 0.92;
      ctx.beginPath();
      ctx.arc(cx, cy, dentro, 0, Math.PI * 2);
      ctx.clip();
      if (r.logo) {
        ctx.drawImage(r.logo, cx - dentro, cy - dentro, dentro * 2, dentro * 2);
      } else {
        ctx.fillStyle = VERDE;
        ctx.fill();
        ctx.fillStyle = "#ffffff";
        ctx.font = fonteDoCanvas("titulo", dentro);
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText((r.nomeDaOrganizacao.trim()[0] ?? "?").toUpperCase(), cx, cy);
      }
      return { x: cx - raio, y: cy - raio, largura: lado, altura: lado };
    }
    // QR: quadrado branco com a margem que o leitor precisa.
    const x = cx - lado / 2;
    const y = cy - lado / 2;
    ctx.shadowColor = "rgba(0,0,0,0.3)";
    ctx.shadowBlur = lado * 0.06;
    retanguloArredondado(ctx, x, y, lado, lado, lado * 0.06);
    ctx.fillStyle = "#ffffff";
    ctx.fill();
    ctx.shadowColor = "transparent";
    if (r.qr) {
      const n = r.qr.length;
      const margem = lado * 0.08;
      const passo = (lado - margem * 2) / n;
      ctx.fillStyle = "#000000";
      for (let i = 0; i < n; i++) {
        for (let j = 0; j < n; j++) {
          if (r.qr[i][j]) ctx.fillRect(x + margem + j * passo, y + margem + i * passo, passo + 0.5, passo + 0.5);
        }
      }
    }
    return { x, y, largura: lado, altura: lado };
  } finally {
    ctx.restore();
  }
}

function desenharTexto(ctx: CanvasRenderingContext2D, c: Extract<Camada, { tipo: "texto" }>, cx: number, cy: number, W: number): Caixa {
  const px = c.tamanho * W;
  ctx.font = fonteDoCanvas(c.fonte, px);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.lineJoin = "round";
  const linhas = quebrarEmLinhas(c.texto, W * 0.88, (t) => ctx.measureText(t).width);
  const entre = px * 1.12;
  const altura = entre * linhas.length;
  const topo = cy - altura / 2 + entre / 2;
  const largura = Math.max(...linhas.map((l) => ctx.measureText(l).width), 1);
  const cor = CORES_DO_TEXTO[c.cor].hex;
  linhas.forEach((linha, i) => {
    const y = topo + i * entre;
    if (c.sombra) {
      ctx.shadowColor = "rgba(0,0,0,0.5)";
      ctx.shadowBlur = px * 0.18;
      ctx.shadowOffsetY = px * 0.06;
    }
    if (c.contorno) {
      ctx.lineWidth = Math.max(2, px * 0.14);
      ctx.strokeStyle = contornoDa(c.cor);
      ctx.strokeText(linha, cx, y);
      ctx.shadowColor = "transparent";
    }
    ctx.fillStyle = cor;
    ctx.fillText(linha, cx, y);
    ctx.shadowColor = "transparent";
  });
  return { x: cx - largura / 2, y: cy - altura / 2, largura, altura };
}

/** A camada que o ponto toca (a de cima primeiro), ou `null`. */
export function camadaNoPonto(caixas: Caixa[], x: number, y: number): number | null {
  for (let i = caixas.length - 1; i >= 0; i--) {
    const c = caixas[i];
    if (x >= c.x && x <= c.x + c.largura && y >= c.y && y <= c.y + c.altura) return i;
  }
  return null;
}
