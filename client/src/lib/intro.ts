/**
 * Intro animada da marca ao abrir o app (celular e tablet).
 *
 * Regras puras, para o teste: quando aparece e a geometria do trevo. O
 * desenho e o movimento moram em `components/IntroDaMarca.tsx` e nas classes
 * `.intro-*` do `index.css`.
 */

/** Uma vez por sessão do navegador: recarregar a página não repete. */
export const INTRO_CHAVE = "rifa.intro";
/** Do computador (`lg`, 1024 px) em diante não há intro. */
export const INTRO_LARGURA_MAX = 1023;
/** Quanto dura o movimento (o último coração bate perto de 3,1 s). */
export const INTRO_DURACAO_MS = 3400;
/** Com o movimento reduzido, a logo pronta fica só este tempo. */
export const INTRO_PARADA_MS = 1000;
/** A saída: a tela branca some em fade. */
export const INTRO_SAIDA_MS = 400;
/** Imagens que não chegaram nesse prazo não seguram a intro. */
export const INTRO_ESPERA_IMAGENS_MS = 800;

/** Painel é ferramenta de trabalho: quem entra nele não vê a intro. */
export const ROTAS_SEM_INTRO = ["/admin", "/afiliado", "/cambista"];

export interface ContextoDaIntro {
  largura: number;
  caminho: string;
  jaViuNaSessao: boolean;
  /** `navigator.webdriver`: a auditoria de telas e as provas não podem ver a intro por cima. */
  automatizado: boolean;
  /** Dentro de um iframe (a pré-visualização do template em Aparência). */
  emMoldura: boolean;
}

export function deveMostrarIntro(c: ContextoDaIntro): boolean {
  if (c.largura > INTRO_LARGURA_MAX) return false;
  if (c.jaViuNaSessao || c.automatizado || c.emMoldura) return false;
  return !ROTAS_SEM_INTRO.some((r) => c.caminho === r || c.caminho.startsWith(`${r}/`));
}

/**
 * O trevo de 4 folhas, o mesmo dos ícones (`docs/marca`): cada folha tem dois
 * lóbulos redondos tangentes às frestas diagonais e a ponta no centro.
 * Unidades do `viewBox` (-660 … 660), centro em (0, 0).
 */
export const FOLHA = (() => {
  const c = 12; // meia fresta entre as folhas
  const largura = 700;
  const comprimento = 640;
  const r = (comprimento - largura / 2 - c) / Math.SQRT2;
  const d = largura / 2 - r;
  const h = d + c + r * Math.SQRT2;
  return { c, r, d, h };
})();

type Ponto = [number, number];

/** De coordenadas da folha (v de lado, u para fora) para o SVG, girando de 90 em 90 graus. */
function paraOSvg([v, u]: Ponto, quarto: number): Ponto {
  let p: Ponto = [v, -u]; // folha de cima
  for (let i = 0; i < quarto; i++) p = [-p[1], p[0]];
  return [Math.round(p[0] * 10) / 10, Math.round(p[1] * 10) / 10];
}

export interface FolhaDesenhada {
  poligono: string;
  circulos: { cx: number; cy: number }[];
  /** A metade virada para a luz (alto à esquerda) e a outra, mais escura. */
  metadeClara: string;
  metadeEscura: string;
}

export function folhasDoTrevo(): FolhaDesenhada[] {
  const { c, r, d, h } = FOLHA;
  const t = r / Math.SQRT2;
  const local: Ponto[] = [[0, c], [d + t, h - t], [d, h], [-d, h], [-d - t, h - t]];
  const lado = (sinal: 1 | -1): Ponto[] => [[0, -40], [sinal * 700, -40], [sinal * 700, 700], [0, 700]];
  const txt = (pts: Ponto[], q: number) => pts.map((p) => paraOSvg(p, q).join(",")).join(" ");
  return [0, 1, 2, 3].map((q) => {
    // cima e direita escurecem o lado de v positivo; baixo e esquerda, o de v negativo
    const escuro: 1 | -1 = q < 2 ? 1 : -1;
    return {
      poligono: txt(local, q),
      circulos: ([[d, h], [-d, h]] as Ponto[]).map((p) => {
        const [cx, cy] = paraOSvg(p, q);
        return { cx, cy };
      }),
      metadeClara: txt(lado(escuro === 1 ? -1 : 1), q),
      metadeEscura: txt(lado(escuro), q),
    };
  });
}

export const RAIO_DO_LOBULO = Math.round(FOLHA.r * 10) / 10;

/**
 * O contorno de uma folha num `path` só (o polígono e os dois lóbulos, todos
 * no mesmo sentido, para a regra "nonzero" somar em vez de furar). Um
 * `clipPath` com um filho só desenha igual em todo lugar — o recorte com
 * polígono e círculos separados saía furado fora do navegador (librsvg).
 */
export function contornoDaFolha(f: FolhaDesenhada): string {
  const pts = f.poligono.split(" ").map((p) => p.split(",").map(Number));
  let area = 0;
  for (let i = 0; i < pts.length; i++) {
    const [x1, y1] = pts[i];
    const [x2, y2] = pts[(i + 1) % pts.length];
    area += x1 * y2 - x2 * y1;
  }
  const giro = area > 0 ? 1 : 0;
  const r = RAIO_DO_LOBULO;
  const poligono = `M${pts.map((p) => p.join(" ")).join("L")}Z`;
  const lobulos = f.circulos
    .map(({ cx, cy }) => `M${cx - r} ${cy}A${r} ${r} 0 1 ${giro} ${cx + r} ${cy}A${r} ${r} 0 1 ${giro} ${cx - r} ${cy}Z`)
    .join("");
  return poligono + lobulos;
}

/**
 * As cores do trevo, as mesmas do ícone do app (`docs/marca/icone-folha-da-
 * direita-vermelha.png`): as folhas verdes num degradê da luz (alto à
 * esquerda) para a sombra, e a folha da direita vermelha. Cada folha tem a
 * metade clara e a escura, como no ícone.
 */
export const DEGRADE_CLARO: [number, string][] = [
  [0, "#9cca29"], [0.167, "#9cca29"], [0.333, "#79bf2a"], [0.5, "#4ba833"], [0.667, "#0a8832"], [0.833, "#00712f"], [1, "#016031"],
];
export const DEGRADE_ESCURO: [number, string][] = [
  [0, "#9cca29"], [0.167, "#9cca29"], [0.333, "#5cb030"], [0.5, "#168f34"], [0.667, "#017d32"], [0.833, "#016031"], [1, "#016031"],
];

export const DEGRADE_VERMELHO_CLARO: [number, string][] = [
  [0, "#e4353c"], [0.55, "#d92b32"], [1, "#c7232b"],
];
export const DEGRADE_VERMELHO_ESCURO: [number, string][] = [
  [0, "#cf242c"], [0.55, "#bd1e26"], [1, "#a51920"],
];
/** A folha vermelha (a da direita, como no ícone), na ordem de `folhasDoTrevo()`. */
export const FOLHA_VERMELHA = 1;

/**
 * A abertura: antes de o JavaScript chegar, o `index.html` já desenha o trevo
 * no meio da tela branca (`#abertura`), no lugar em que o celular mostrou o
 * ícone. A intro começa com o trevo ali e o leva ao lugar dele na logo — sem
 * tela branca entre o ícone e a intro. O `index.html` repete a regra de
 * `deveMostrarIntro()` (o teste confere) e este tamanho.
 */
export const ABERTURA_ID = "abertura";
export const ABERTURA_TREVO_PX = 136;
/** Se o app não abrir, a abertura sai sozinha (nunca prende a tela). */
export const ABERTURA_PRAZO_MS = 8000;

/**
 * Onde cada peça fica, em % da caixa da logo (1520 × 1302 px da logo oficial):
 * as imagens saem de `client/public/intro/`, recortadas da logo oficial.
 */
export const PECAS_DA_INTRO = {
  proporcao: 1520 / 1302,
  trevo: { left: 35.949, top: 0.109, width: 30.734 },
  textoLoterias: { src: "/intro/texto-loterias.webp", left: 0.329, top: 32.488, width: 99.013 },
  textoDoBem: { src: "/intro/texto-do-bem.webp", left: 8.289, top: 59.601, width: 81.974 },
  sublinhado: { src: "/intro/sublinhado.webp", left: 29.013, top: 72.427, width: 70.461 },
  coracaoEsq: { src: "/intro/coracao-esq.webp", left: 17.171, top: 20.891, width: 12.961 },
  coracaoDir: { src: "/intro/coracao-dir.webp", left: 69.868, top: 16.129, width: 15.921 },
} as const;

/**
 * O trevo em SVG puro (texto), para onde o React ainda não chegou: a abertura
 * do `index.html` e os arquivos de `docs/marca`. O mesmo desenho de
 * `TrevoDaMarca`; `npm run logo-escrita` grava esta saída no `index.html` (o
 * teste confere que está igual).
 */
export function svgDoTrevo(prefixo: string, atributos = ""): string {
  const degrade = (id: string, paradas: [number, string][]) =>
    `<linearGradient id="${prefixo}${id}" gradientUnits="userSpaceOnUse" x1="-660" y1="-660" x2="660" y2="660">${paradas
      .map(([o, cor]) => `<stop offset="${o}" stop-color="${cor}"/>`)
      .join("")}</linearGradient>`;
  const folhas = folhasDoTrevo();
  const recortes = folhas
    .map(
      (f, i) =>
        `<clipPath id="${prefixo}f${i}"><path d="${contornoDaFolha(f)}"/></clipPath>`,
    )
    .join("");
  const desenho = folhas
    .map((f, i) => {
      const v = i === FOLHA_VERMELHA;
      return `<g clip-path="url(#${prefixo}f${i})"><polygon points="${f.metadeClara}" fill="url(#${prefixo}${v ? "vc" : "c"})"/><polygon points="${f.metadeEscura}" fill="url(#${prefixo}${v ? "ve" : "e"})"/></g>`;
    })
    .join("");
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-660 -660 1320 1320"${atributos ? ` ${atributos}` : ""}>` +
    `<defs>${degrade("c", DEGRADE_CLARO)}${degrade("e", DEGRADE_ESCURO)}${degrade("vc", DEGRADE_VERMELHO_CLARO)}${degrade(
      "ve",
      DEGRADE_VERMELHO_ESCURO,
    )}${recortes}</defs>${desenho}</svg>`
  );
}
