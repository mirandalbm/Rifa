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
 * - **Sem texto, as mais novas primeiro**, paginadas por chave (nada de
 *   `OFFSET`); a região ordena na vitrine, aqui não há ordem por popularidade.
 */

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
