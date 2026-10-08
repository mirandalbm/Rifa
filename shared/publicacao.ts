/**
 * A publicação da rifa, como no Instagram: carrossel de até 10 peças
 * (imagens e vídeos), a legenda da organização e a barra de ações —
 * curtir (o trevo), comentar, republicar, compartilhar e salvar — com os
 * contadores. Regras puras: a tela e o servidor usam as mesmas.
 */
import { temLinkOuTelefone } from "./comentarios";

/** Peças no carrossel, contando o banner (a capa). */
export const MAX_CARROSSEL = 10;
/** Até 3 minutos o vídeo entra como reels (em pé, tocando no próprio carrossel)… */
export const REELS_MAX_S = 180;
/** …e até 15 minutos, como vídeo do feed. Mais que isso não entra. */
export const VIDEO_MAX_S = 900;

export type FormatoDoVideo = "reels" | "feed";

/** O formato pela duração **medida no servidor** (nunca a informada pelo navegador). */
export function formatoDoVideo(segundos: number): FormatoDoVideo | null {
  if (!(segundos > 0)) return null;
  if (segundos <= REELS_MAX_S) return "reels";
  if (segundos <= VIDEO_MAX_S) return "feed";
  return null;
}

export function duracao(segundos: number): string {
  const s = Math.round(segundos);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${ss}` : `${m}:${ss}`;
}

/** "Ainda cabe?": o banner, as fotos e os vídeos, juntos, até `MAX_CARROSSEL`. */
export function cabeNoCarrossel(pecasAtuais: number) {
  return pecasAtuais < MAX_CARROSSEL;
}

/* ------------------------------------------------------------------ *
 * Formato da peça (proporção), como no Instagram
 * ------------------------------------------------------------------ */

/**
 * Os quatro formatos do Instagram. No feed: retrato 4:5 (o recomendado),
 * quadrado 1:1 e paisagem 1,91:1; vertical 9:16 é o de reels e stories.
 * `razao` é largura ÷ altura; `classe` é a do Tailwind para a caixa.
 */
export const FORMATOS = {
  retrato: { rotulo: "Retrato 4:5", razao: 4 / 5, classe: "aspect-[4/5]", classeMd: "md:aspect-[4/5]", recomendado: "1080 × 1350" },
  quadrado: { rotulo: "Quadrado 1:1", razao: 1, classe: "aspect-square", classeMd: "md:aspect-square", recomendado: "1080 × 1080" },
  paisagem: { rotulo: "Paisagem 1,91:1", razao: 1.91, classe: "aspect-[191/100]", classeMd: "md:aspect-[191/100]", recomendado: "1080 × 566" },
  vertical: { rotulo: "Vertical 9:16", razao: 9 / 16, classe: "aspect-[9/16]", classeMd: "md:aspect-[9/16]", recomendado: "1080 × 1920" },
} as const;

export type Formato = keyof typeof FORMATOS;

/** Sem medida (peça antiga, vídeo enviado antes da medição), vale o retrato — o de antes. */
export const FORMATO_PADRAO: Formato = "retrato";

/**
 * O formato mais próximo da peça, pelas dimensões **medidas no servidor**.
 * As fronteiras do feed ficam no meio (em escala logarítmica) entre dois
 * formatos vizinhos: 4:3 cai em quadrado e 16:9 em paisagem. A do vertical
 * é mais baixa (0,65): a foto 2:3 de câmera é retrato, como no Instagram,
 * e só o que é de fato em pé de tela (3:5, 9:16) vira vertical. Foto de
 * celular em pé (3:4) é retrato.
 */
export function formatoDaPeca(largura: number | null | undefined, altura: number | null | undefined): Formato {
  if (!largura || !altura || largura <= 0 || altura <= 0) return FORMATO_PADRAO;
  const r = largura / altura;
  const meio = (a: number, b: number) => Math.sqrt(a * b);
  if (r < 0.65) return "vertical";
  if (r < meio(FORMATOS.retrato.razao, FORMATOS.quadrado.razao)) return "retrato";
  if (r < meio(FORMATOS.quadrado.razao, FORMATOS.paisagem.razao)) return "quadrado";
  return "paisagem";
}

/**
 * A regra de ouro do carrossel: **a primeira peça define o formato de
 * todas**. As seguintes são cortadas ao centro (`object-cover`) para caber
 * na mesma caixa — por isso o assunto vai no meio da foto.
 */
export function formatoDoCarrossel(pecas: { largura?: number | null; altura?: number | null }[]): Formato {
  const primeira = pecas[0];
  return primeira ? formatoDaPeca(primeira.largura, primeira.altura) : FORMATO_PADRAO;
}

/**
 * A caixa do carrossel (classe do Tailwind). Com `retratoNoCelular` (a rifa
 * de demonstração ou de teste), o celular fica no retrato 4:5, como era antes
 * de a imagem de exemplo ganhar a medida, e só do tablet em diante (`md`)
 * vale o formato medido: o problema da caixa em pé com a arte horizontal era
 * da web. O vertical não muda (o perfil vai por cima dele em toda largura).
 */
export function caixaDoCarrossel(formato: Formato, retratoNoCelular = false): string {
  if (!retratoNoCelular || formato === "retrato" || formato === "vertical") return FORMATOS[formato].classe;
  return `${FORMATOS.retrato.classe} ${FORMATOS[formato].classeMd}`;
}

/**
 * Largura e altura de uma imagem de exemplo em SVG guardada como data URI
 * (perfil de demonstração e "Preencher com exemplo"): os atributos `width` e
 * `height` da tag `<svg>`. Sem a medida gravada, o carrossel cai no retrato e
 * a arte horizontal fica numa caixa em pé. O envio de verdade não passa por
 * aqui: quem mede é o servidor, lendo o arquivo.
 */
export function medidaDoSvg(dataUri: string): { largura: number; altura: number } | null {
  const prefixo = "data:image/svg+xml;base64,";
  if (!dataUri.startsWith(prefixo)) return null;
  let texto: string;
  try {
    texto = atob(dataUri.slice(prefixo.length, prefixo.length + 4000));
  } catch {
    return null;
  }
  const tag = /<svg\b[^>]*>/.exec(texto)?.[0];
  if (!tag) return null;
  const valor = (nome: string) => {
    const m = new RegExp(`\\s${nome}="(\\d{1,5})"`).exec(tag);
    const n = m ? Number(m[1]) : 0;
    return n >= 1 && n <= 10_000 ? n : null;
  };
  const largura = valor("width");
  const altura = valor("height");
  return largura && altura ? { largura, altura } : null;
}

/**
 * No vertical (9:16) a peça ocupa a tela, e o perfil da promotora vai **por
 * cima** dela, como no reels; nos outros três, **acima**, fora da imagem.
 * A faixa de cima de 220 px em 1920 (11,5%) é a área que a interface cobre
 * — texto importante da arte fica fora dela e dos 450 px de baixo.
 */
export function perfilPorCima(formato: Formato) {
  return formato === "vertical";
}

/** Áreas seguras do 9:16, em fração da altura e da largura (220/1920, 450/1920, 35/1080). */
export const AREA_SEGURA = { topo: 220 / 1920, base: 450 / 1920, lados: 35 / 1080 } as const;

/* ------------------------------------------------------------------ *
 * Legenda
 * ------------------------------------------------------------------ */

export const LEGENDA_MAX = 2200;

/**
 * A legenda que a organização escreve embaixo da publicação. A mesma régua
 * do comentário: sem link e sem telefone — o contato dela está no perfil,
 * pelos links conferidos, e "chama no zap" na legenda é o começo do Pix por
 * fora. Vazia é permitida (apaga a legenda).
 */
export function problemaNaLegenda(texto: unknown): string | null {
  const t = typeof texto === "string" ? texto.trim() : "";
  if (t.length > LEGENDA_MAX) return `A legenda passa de ${LEGENDA_MAX} caracteres.`;
  const p = temLinkOuTelefone(t);
  return p ? `A legenda ${p.charAt(0).toLowerCase()}${p.slice(1)}` : null;
}

export function limparLegenda(texto: string) {
  return texto.trim().replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n");
}

/* ------------------------------------------------------------------ *
 * Barra de ações
 * ------------------------------------------------------------------ */

export const ACOES = ["curtida", "republicacao", "salvo"] as const;
export type Acao = (typeof ACOES)[number];

/** 999 → "999"; 1.234 → "1.234"; 12.345 → "12,3 mil"; 1.234.567 → "1,2 mi". */
export function contadorCurto(n: number): string {
  if (n < 10_000) return n.toLocaleString("pt-BR");
  const um = (v: number) => (Math.floor(v * 10) / 10).toLocaleString("pt-BR", { maximumFractionDigits: 1 });
  if (n < 1_000_000) return `${um(n / 1000)} mil`;
  return `${um(n / 1_000_000)} mi`;
}

/**
 * "Há 3 dias", como embaixo da publicação no Instagram. Até uma semana é
 * relativo; depois, a data ("16 de setembro", com o ano se for outro).
 */
export function quandoPublicou(iso: string | Date | null | undefined, agora = new Date()): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  const min = Math.max(0, Math.floor((agora.getTime() - d.getTime()) / 60_000));
  if (min < 1) return "Agora";
  if (min < 60) return `Há ${min} ${min === 1 ? "minuto" : "minutos"}`;
  const h = Math.floor(min / 60);
  if (h < 24) return `Há ${h} ${h === 1 ? "hora" : "horas"}`;
  const dias = Math.floor(h / 24);
  if (dias < 7) return `Há ${dias} ${dias === 1 ? "dia" : "dias"}`;
  return d.toLocaleDateString("pt-BR", {
    day: "numeric",
    month: "long",
    ...(d.getFullYear() !== agora.getFullYear() ? { year: "numeric" } : {}),
    timeZone: "America/Sao_Paulo",
  });
}
