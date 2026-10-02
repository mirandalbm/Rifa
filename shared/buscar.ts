/**
 * Buscar — regras puras (as mesmas no servidor e na tela).
 *
 * A tela Buscar do console: o campo no topo e, embaixo, a grade das
 * publicações mais novas. Com texto, a busca acha rifas (título, prêmio e
 * nome da organização), organizações (nome ou endereço) e, só se a
 * plataforma ligar, o apostador pelo `@apelido` exato.
 *
 * - **A tabela é da plataforma** (`ConfigBusca`): quais tipos de resultado
 *   entram. Apostador nasce desligado — é pessoa, não vitrine.
 * - **Só o que a vitrine mostraria**: rifa no ar, não travada, não
 *   demonstração, de organização nem arquivada nem banida.
 * - **Por padrão, as mais novas primeiro**, paginadas por chave (nada de
 *   `OFFSET`). A pessoa pode escolher "Mais curtidas" (o contador real da
 *   publicação, nunca um número inventado, e sem mostrar o número) e filtrar
 *   por **estado**: aqui o filtro é escolha explícita dela, como em
 *   `/estado/UF` — a vitrine, que ordena sozinha, continua sem esconder nada.
 */
import { ufValida, type UF } from "./endereco";

export const TIPOS_DA_BUSCA = {
  rifas: "Rifas (título, prêmio e organização)",
  organizacoes: "Organizações (nome e endereço)",
  apostadores: "Apostadores (só pelo @apelido exato)",
} as const;
export type TipoDaBusca = keyof typeof TIPOS_DA_BUSCA;

export type ConfigBusca = Record<TipoDaBusca, boolean>;

/** Apostador nasce desligado: perfil de pessoa só entra se a plataforma quiser. */
export const CONFIG_BUSCA_PADRAO: ConfigBusca = { rifas: true, organizacoes: true, apostadores: false };

/** Só as chaves conhecidas: isto vem do corpo da requisição. */
export function validarConfigBusca(entrada: unknown): ConfigBusca {
  const e = (entrada && typeof entrada === "object" ? entrada : {}) as Partial<Record<TipoDaBusca, unknown>>;
  return {
    rifas: e.rifas === undefined ? CONFIG_BUSCA_PADRAO.rifas : e.rifas === true,
    organizacoes: e.organizacoes === undefined ? CONFIG_BUSCA_PADRAO.organizacoes : e.organizacoes === true,
    apostadores: e.apostadores === undefined ? CONFIG_BUSCA_PADRAO.apostadores : e.apostadores === true,
  };
}

export const BUSCA_TEXTO_MIN = 2;
export const BUSCA_TEXTO_MAX = 60;
/** 18 = seis fileiras de três, como a grade do Instagram. */
export const BUSCA_PAGINA = 18;
export const BUSCA_ORGANIZACOES_MAX = 5;
/** Buscas por pessoa por minuto: a grade pagina e o campo digita. */
export const BUSCAS_POR_MINUTO = 60;

export const semAcento = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export interface TermoDaBusca {
  /** Sem acento, minúsculo, sem espaço repetido. */
  texto: string;
  /** O apelido pedido (`@ana`), se o texto começava com `@`. */
  apelido: string | null;
}

/** O que a pessoa digitou, limpo — ou `null` se é curto demais para buscar. */
export function interpretarTermo(bruto: unknown): TermoDaBusca | null {
  if (typeof bruto !== "string") return null;
  const limpo = semAcento(bruto).replace(/\s+/g, " ").trim().slice(0, BUSCA_TEXTO_MAX);
  const arroba = limpo.startsWith("@");
  const texto = (arroba ? limpo.slice(1) : limpo).trim();
  if (texto.length < BUSCA_TEXTO_MIN) return null;
  return { texto, apelido: arroba ? texto : null };
}

/** `%` e `_` do texto digitado são letras, não curinga. */
export const escaparCuringa = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`);

/** A busca está ligada e tem algum tipo de resultado a mostrar? */
export const algumTipoLigado = (c: ConfigBusca) => c.rifas || c.organizacoes || c.apostadores;

/* ------------------------------------------------------------------ *
 * Ordem e estado (escolhas da pessoa, vindas da URL: só valor conhecido)
 * ------------------------------------------------------------------ */

export const ORDENS_DA_BUSCA = { novas: "Mais novas", curtidas: "Mais curtidas" } as const;
export type OrdemDaBusca = keyof typeof ORDENS_DA_BUSCA;

/** Qualquer coisa fora da lista é a ordem de sempre (as mais novas). */
export function interpretarOrdem(bruto: unknown): OrdemDaBusca {
  return bruto === "curtidas" ? "curtidas" : "novas";
}

/** A UF pedida (`sp` ou `SP`), ou `null`: valor fora da lista não filtra. */
export function interpretarEstado(bruto: unknown): UF | null {
  if (typeof bruto !== "string") return null;
  const uf = bruto.trim().toUpperCase();
  return ufValida(uf) ? uf : null;
}

/**
 * O cursor de "Mais curtidas" é `<curtidas>|<id>`: o par decide a ordem
 * (curtidas empatam o tempo todo). Vem da URL: só o formato exato vale, o
 * resto é a primeira página — nunca erro nem SQL.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const fazerCursorDeCurtidas = (curtidas: number, id: string) => `${curtidas}|${id}`;
export function lerCursorDeCurtidas(texto: unknown): { curtidas: number; id: string } | null {
  if (typeof texto !== "string") return null;
  const [n, id, ...resto] = texto.split("|");
  if (resto.length || !n || !id || !/^\d{1,9}$/.test(n) || !UUID.test(id)) return null;
  return { curtidas: Number(n), id };
}
