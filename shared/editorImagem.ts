/**
 * Editor de imagem no navegador (Fase C do `docs/PLANO-FERRAMENTAS.md`).
 *
 * A organização monta uma imagem de divulgação: um fundo (foto da rifa, foto
 * do aparelho ou uma arte pronta da Fase A), o enquadramento num dos três
 * formatos das redes e as figurinhas por cima. Quem desenha é o canvas do
 * navegador; a imagem pronta entra pelo envio de sempre (`ingest`), como
 * qualquer foto.
 *
 * O que não pode afrouxar:
 * - **As camadas são dados**, nunca HTML ou imagem do navegador: tipo, texto,
 *   fonte e cor de listas fixas, tamanho e posição em faixas. `validarCamadas()`
 *   guarda só as chaves conhecidas — servidor e tela usam a mesma régua.
 * - **O texto passa pela régua antes de virar imagem**: depois de virar pixel,
 *   nenhuma varredura o lê. Sem link e sem telefone (a régua do comentário) e,
 *   aqui, **o pedido de Pix por fora é recusado** (no texto da legenda ele só
 *   vira denúncia; na imagem, ninguém o leria de novo).
 * - **As informações oficiais não são editáveis**: preço e selo SPA/MF saem da
 *   rifa (a camada guarda só onde e de que tamanho), e o QR leva o endereço da
 *   rifa que o servidor devolve.
 */
import { temLinkOuTelefone } from "./comentarios";
import { EMOJIS_DA_FIGURINHA } from "./figurinhasStory";
import { FORMATOS_DA_ARTE, type FormatoDaArte } from "./artes";

export const TIPOS_DE_CAMADA = ["texto", "emoji", "preco", "selo", "logo", "qr"] as const;
export type TipoDeCamada = (typeof TIPOS_DE_CAMADA)[number];

/** As camadas que saem da rifa: uma de cada, e nada nelas é digitado. */
export const CAMADAS_OFICIAIS = ["preco", "selo", "logo", "qr"] as const satisfies readonly TipoDeCamada[];

export const ROTULO_DA_CAMADA: Record<TipoDeCamada, string> = {
  texto: "Texto",
  emoji: "Emoji",
  preco: "Preço da cota",
  selo: "Selo SPA/MF",
  logo: "Foto da organização",
  qr: "QR da rifa",
};

export const CAMADAS_MAX = 8;
export const TEXTO_DA_CAMADA_MAX = 80;

/** As fontes da plataforma (as mesmas das artes prontas). */
export const FONTES_DO_EDITOR = {
  titulo: { familia: "Bricolage Grotesque", peso: 800, rotulo: "Título" },
  texto: { familia: "Instrument Sans", peso: 600, rotulo: "Simples" },
  numero: { familia: "DM Mono", peso: 500, rotulo: "Número" },
} as const;
export type FonteDoEditor = keyof typeof FONTES_DO_EDITOR;

/**
 * As cores do texto: as da casa (verde e azul), branco e a tinta. Amarelo não
 * faz parte do padrão. O contorno é sempre a cor oposta (`contornoDa`).
 */
export const CORES_DO_TEXTO = {
  branco: { hex: "#ffffff", rotulo: "Branco" },
  tinta: { hex: "#0b1f14", rotulo: "Preto" },
  verde: { hex: "#00873e", rotulo: "Verde" },
  azul: { hex: "#0a6fd6", rotulo: "Azul" },
} as const;
export type CorDoTexto = keyof typeof CORES_DO_TEXTO;

export function contornoDa(cor: CorDoTexto): string {
  return cor === "branco" ? "#0b1f14" : "#ffffff";
}

/** O tamanho é a altura da camada em fração da largura da imagem (1080). */
export const TAMANHO_MIN = 0.04;
export const TAMANHO_MAX = 0.6;
/** O centro da camada, em fração da largura e da altura, sempre dentro da imagem. */
export const POSICAO_MIN = 0.05;
export const POSICAO_MAX = 0.95;

export type Camada =
  | { tipo: "texto"; x: number; y: number; tamanho: number; texto: string; fonte: FonteDoEditor; cor: CorDoTexto; contorno: boolean; sombra: boolean }
  | { tipo: "emoji"; x: number; y: number; tamanho: number; emoji: string }
  | { tipo: "preco" | "selo" | "logo" | "qr"; x: number; y: number; tamanho: number };

const TAMANHO_PADRAO: Record<TipoDeCamada, number> = {
  texto: 0.09,
  emoji: 0.14,
  preco: 0.1,
  selo: 0.07,
  logo: 0.16,
  qr: 0.22,
};

/**
 * A camada nova, num lugar que não cobre as outras no começo: o texto em cima,
 * a foto da organização no canto de cima, o preço e o QR lado a lado embaixo
 * e o selo no pé.
 */
export function camadaNova(tipo: TipoDeCamada): Camada {
  const tamanho = TAMANHO_PADRAO[tipo];
  if (tipo === "texto") return { tipo, x: 0.5, y: 0.3, tamanho, texto: "Seu texto", fonte: "titulo", cor: "branco", contorno: true, sombra: true };
  if (tipo === "emoji") return { tipo, x: 0.5, y: 0.5, tamanho, emoji: EMOJIS_DA_FIGURINHA[0].emoji };
  if (tipo === "qr") return { tipo, x: 0.8, y: 0.76, tamanho };
  if (tipo === "logo") return { tipo, x: 0.15, y: 0.12, tamanho };
  if (tipo === "selo") return { tipo, x: 0.5, y: 0.94, tamanho };
  return { tipo, x: 0.36, y: 0.76, tamanho };
}

function faixa(v: unknown, min: number, max: number, nome: string): number {
  const n = typeof v === "number" ? v : Number.NaN;
  if (!Number.isFinite(n)) throw new Error(`Falta ${nome} da camada.`);
  return Math.round(Math.min(max, Math.max(min, n)) * 1000) / 1000;
}

export function limparTextoDaCamada(t: string): string {
  return t.replace(/\s+/g, " ").trim();
}

/** O problema do texto (régua do comentário), ou `null`. A varredura do Pix por fora é à parte. */
export function problemaNoTextoDaCamada(texto: string): string | null {
  if (!texto) return "Escreva o texto.";
  if (texto.length > TEXTO_DA_CAMADA_MAX) return `O texto tem até ${TEXTO_DA_CAMADA_MAX} caracteres.`;
  const p = temLinkOuTelefone(texto);
  return p ? `No texto: ${p.charAt(0).toLowerCase()}${p.slice(1)}` : null;
}

/**
 * Confere a lista que veio do navegador. Lança `Error` com a mensagem para a
 * tela; devolve só as chaves conhecidas. `temSelo`: a rifa tem autorização
 * (sem ela, não há selo para pôr).
 */
export function validarCamadas(lista: unknown, opcoes: { temSelo: boolean }): Camada[] {
  if (!Array.isArray(lista)) throw new Error("As camadas vêm numa lista.");
  if (lista.length > CAMADAS_MAX) throw new Error(`Cabem até ${CAMADAS_MAX} camadas.`);
  const vistas = new Set<string>();
  return lista.map((item): Camada => {
    if (!item || typeof item !== "object" || Array.isArray(item)) throw new Error("Camada inválida.");
    const c = item as Record<string, unknown>;
    const tipo = c.tipo;
    if (typeof tipo !== "string" || !(TIPOS_DE_CAMADA as readonly string[]).includes(tipo)) throw new Error("Esse tipo de camada não existe.");
    const x = faixa(c.x, POSICAO_MIN, POSICAO_MAX, "a posição");
    const y = faixa(c.y, POSICAO_MIN, POSICAO_MAX, "a posição");
    const tamanho = faixa(c.tamanho, TAMANHO_MIN, TAMANHO_MAX, "o tamanho");
    if ((CAMADAS_OFICIAIS as readonly string[]).includes(tipo)) {
      if (vistas.has(tipo)) throw new Error(`Só cabe uma camada "${ROTULO_DA_CAMADA[tipo as TipoDeCamada]}".`);
      if (tipo === "selo" && !opcoes.temSelo) throw new Error("O selo SPA/MF precisa da autorização da rifa.");
      vistas.add(tipo);
      return { tipo: tipo as "preco" | "selo" | "logo" | "qr", x, y, tamanho };
    }
    if (tipo === "emoji") {
      const emoji = typeof c.emoji === "string" ? c.emoji : "";
      if (!EMOJIS_DA_FIGURINHA.some((e) => e.emoji === emoji)) throw new Error("Escolha um dos emojis da lista.");
      return { tipo, x, y, tamanho, emoji };
    }
    const texto = typeof c.texto === "string" ? limparTextoDaCamada(c.texto) : "";
    const problema = problemaNoTextoDaCamada(texto);
    if (problema) throw new Error(problema);
    const fonte = typeof c.fonte === "string" && Object.hasOwn(FONTES_DO_EDITOR, c.fonte) ? (c.fonte as FonteDoEditor) : null;
    if (!fonte) throw new Error("Escolha uma das fontes da lista.");
    const cor = typeof c.cor === "string" && Object.hasOwn(CORES_DO_TEXTO, c.cor) ? (c.cor as CorDoTexto) : null;
    if (!cor) throw new Error("Escolha uma das cores da lista.");
    return { tipo: "texto", x, y, tamanho, texto, fonte, cor, contorno: c.contorno === true, sombra: c.sombra === true };
  });
}

/** Os textos digitados, para a varredura do Pix por fora. */
export function textosDasCamadas(camadas: Camada[]): string {
  return camadas.flatMap((c) => (c.tipo === "texto" ? [c.texto] : [])).join(" · ");
}

/* ------------------------------------------------------------------ *
 * Enquadramento do fundo
 * ------------------------------------------------------------------ */

export const ZOOM_MIN = 1;
export const ZOOM_MAX = 4;

/**
 * Onde a foto fica: o zoom (1 = cobre a imagem inteira, sem faixa vazia) e o
 * ponto da foto que vai no centro, em fração (0,5 = o meio).
 */
export interface Enquadramento {
  zoom: number;
  cx: number;
  cy: number;
}

export const ENQUADRAMENTO_INICIAL: Enquadramento = { zoom: 1, cx: 0.5, cy: 0.5 };

/**
 * O retângulo em que a foto é desenhada para cobrir a imagem — nunca sobra
 * faixa vazia: o centro é puxado de volta até a foto encostar na borda.
 */
export function retanguloDoFundo(
  foto: { largura: number; altura: number },
  imagem: { largura: number; altura: number },
  e: Enquadramento,
): { x: number; y: number; largura: number; altura: number } {
  const zoom = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, e.zoom));
  const escala = Math.max(imagem.largura / foto.largura, imagem.altura / foto.altura) * zoom;
  const largura = foto.largura * escala;
  const altura = foto.altura * escala;
  const x = imagem.largura / 2 - e.cx * largura;
  const y = imagem.altura / 2 - e.cy * altura;
  return {
    x: Math.min(0, Math.max(imagem.largura - largura, x)),
    y: Math.min(0, Math.max(imagem.altura - altura, y)),
    largura,
    altura,
  };
}

/** O enquadramento com o centro dentro do que a foto alcança (para arrastar sem "colar" fora). */
export function enquadramentoLimitado(
  foto: { largura: number; altura: number },
  imagem: { largura: number; altura: number },
  e: Enquadramento,
): Enquadramento {
  const zoom = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, e.zoom));
  const r = retanguloDoFundo(foto, imagem, { ...e, zoom });
  return { zoom, cx: (imagem.largura / 2 - r.x) / r.largura, cy: (imagem.altura / 2 - r.y) / r.altura };
}

/**
 * O assunto da foto (o recorte atento do `sharp`, `position: "attention"`),
 * em fração da foto: é o ponto de partida do enquadramento — a foto da rifa
 * já abre centrada no prêmio, não no meio. A pessoa arrasta dali.
 */
export interface Foco {
  x: number;
  y: number;
}

/**
 * O `sharp` devolve o ponto de atenção na medida da foto **redimensionada,
 * antes do corte** (`cover` para um quadrado de `lado`): a escala é
 * `lado / menor lado` da foto. Volta em fração; fora da foto, `null`.
 */
export function focoEmFracao(atencao: { x?: number; y?: number }, foto: { largura: number; altura: number }, lado: number): Foco | null {
  if (typeof atencao.x !== "number" || typeof atencao.y !== "number" || foto.largura <= 0 || foto.altura <= 0 || lado <= 0) return null;
  const escala = lado / Math.min(foto.largura, foto.altura);
  const x = atencao.x / (foto.largura * escala);
  const y = atencao.y / (foto.altura * escala);
  if (!Number.isFinite(x) || !Number.isFinite(y) || x < 0 || x > 1 || y < 0 || y > 1) return null;
  return { x: Math.round(x * 1000) / 1000, y: Math.round(y * 1000) / 1000 };
}

/** O enquadramento que começa no assunto (sem zoom); sem foco, o meio. */
export function enquadramentoDoFoco(foco: Foco | null | undefined): Enquadramento {
  if (!foco || !Number.isFinite(foco.x) || !Number.isFinite(foco.y)) return ENQUADRAMENTO_INICIAL;
  const limitar = (v: number) => Math.min(1, Math.max(0, v));
  return { zoom: 1, cx: limitar(foco.x), cy: limitar(foco.y) };
}

/* ------------------------------------------------------------------ *
 * Desenho
 * ------------------------------------------------------------------ */

export function medidasDoFormato(formato: FormatoDaArte) {
  const { largura, altura } = FORMATOS_DA_ARTE[formato];
  return { largura, altura };
}

/**
 * Quebra o texto em linhas que caibam em `largura`, com a medida do canvas
 * (`medir`). Palavra maior que a linha fica sozinha nela.
 */
export function quebrarEmLinhas(texto: string, largura: number, medir: (t: string) => number): string[] {
  const linhas: string[] = [];
  let atual = "";
  for (const palavra of texto.split(" ").filter(Boolean)) {
    const tentativa = atual ? `${atual} ${palavra}` : palavra;
    if (!atual || medir(tentativa) <= largura) atual = tentativa;
    else {
      linhas.push(atual);
      atual = palavra;
    }
  }
  if (atual) linhas.push(atual);
  return linhas;
}

/** O nome do arquivo exportado. */
export function nomeDaImagemDoEditor(slug: string, formato: FormatoDaArte): string {
  return `${slug}-editor-${formato}.jpg`;
}

/** Quantas conferências do texto por pessoa (cada uma roda a régua e a varredura). */
/** Quantos focos (o assunto de uma foto) por pessoa na janela: cada um que não está guardado abre a foto no servidor. */
export const FOCOS_POR_JANELA = { minutos: 10, limite: 120 };
export const CONFERENCIAS_POR_JANELA = { minutos: 10, limite: 60 } as const;
