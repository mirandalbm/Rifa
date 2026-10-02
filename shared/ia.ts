/**
 * Assistente de IA nos painéis (Chatbase) — regras puras, lidas pelo servidor
 * (que conversa com o Chatbase e conta o uso) e pela tela (a coluna).
 *
 * A conversa passa **pelo nosso servidor**: o navegador fala só com
 * `/api/ia/*`, e o servidor fala com a API do Chatbase com a chave que nunca
 * sai dele. Assim cada mensagem é contada (a API diz quantos créditos gastou),
 * nenhum script de terceiro roda na página do painel e o dado pessoal de
 * cliente é barrado antes de sair (`problemaNaMensagemDaIA`).
 *
 * Quem tem: o **administrador master** (gratuito), o **organizador** e o
 * **afiliado** (pagos — cada um no próprio login e no próprio recorte). Nasce
 * desligado, e organizador e afiliado têm interruptores à parte, também
 * desligados, até a cobrança existir.
 */
import type { Role } from "./access";

export interface ConfigIA {
  /** Sem isto o botão não existe e o servidor não conversa. */
  ligado: boolean;
  /** O id do agente no Chatbase (vai no caminho da API). */
  agenteId: string;
  /** O organizador também vê o assistente. Nasce desligado (uso pago). */
  paraOrganizador: boolean;
  /** O afiliado também vê o assistente. Nasce desligado (uso pago). */
  paraAfiliado: boolean;
}

export const CONFIG_IA_PADRAO: ConfigIA = { ligado: false, agenteId: "", paraOrganizador: false, paraAfiliado: false };

/** O id do agente vai no caminho da URL da API: só letras, números, `_` e `-`. */
export const AGENTE_ID_RE = /^[A-Za-z0-9_-]{8,64}$/;

const erro = (m: string) => Object.assign(new Error(m), { status: 400 });

/** Só as chaves conhecidas: isto vem do corpo da requisição. */
export function validarConfigIA(entrada: unknown): ConfigIA {
  if (entrada === undefined || entrada === null) return CONFIG_IA_PADRAO;
  if (typeof entrada !== "object") throw erro("Configuração do assistente inválida.");
  const e = entrada as Record<string, unknown>;
  const agenteId = typeof e.agenteId === "string" ? e.agenteId.trim() : "";
  if (agenteId && !AGENTE_ID_RE.test(agenteId)) {
    throw erro("O id do agente tem de 8 a 64 caracteres: letras, números, _ e -.");
  }
  const ligado = e.ligado === true;
  if (ligado && !agenteId) throw erro("Informe o id do agente do Chatbase antes de ligar o assistente.");
  return { ligado, agenteId, paraOrganizador: e.paraOrganizador === true, paraAfiliado: e.paraAfiliado === true };
}

/** Os papéis que podem ter o assistente. Cambista e apostador, nunca. */
export const PAPEIS_COM_IA: readonly Role[] = ["admin", "organizer", "affiliate"];

export function papelTemIA(role: Role | undefined): boolean {
  return role !== undefined && PAPEIS_COM_IA.includes(role);
}

/** Quem enxerga o assistente: o master com a IA ligada; organizador e afiliado só com o interruptor de cada um. */
export function quemTemIA(role: Role | undefined, config: ConfigIA): boolean {
  if (!config.ligado || !config.agenteId || !papelTemIA(role)) return false;
  if (role === "organizer") return config.paraOrganizador;
  if (role === "affiliate") return config.paraAfiliado;
  return true;
}

/**
 * Quem responde pelo uso (e, na cobrança, quem paga): a plataforma (master,
 * gratuito), a organização do organizador ou o cadastro do afiliado. Sai
 * sempre da sessão, nunca do que o navegador manda.
 */
export type TitularDaIA = { tipo: "plataforma" } | { tipo: "organizacao"; id: string } | { tipo: "afiliado"; id: string };

export function titularDaIA(u: { role: Role; organizationId?: string | null; affiliateId?: string | null }): TitularDaIA | null {
  if (u.role === "admin") return { tipo: "plataforma" };
  if (u.role === "organizer" && u.organizationId) return { tipo: "organizacao", id: u.organizationId };
  if (u.role === "affiliate" && u.affiliateId) return { tipo: "afiliado", id: u.affiliateId };
  return null;
}

/** O identificador que o Chatbase conhece: opaco, nunca e-mail nem nome. */
export function idDaIA(userId: string): string {
  return `rifa-u-${userId}`;
}

export const MENSAGEM_IA_MAX = 2000;
/** Por pessoa, na janela: conversa, não robô. */
export const IA_MENSAGENS_POR_JANELA = 20;
export const IA_JANELA_MIN = 5;

/**
 * Desfaz o disfarce antes de procurar número: dígito de largura cheia (NFKC),
 * caractere invisível (`\p{Cf}`, como o espaço de largura zero) e qualquer
 * traço Unicode (meia-risca do Word, sinal de menos) viram o traço comum.
 */
export function normalizarParaChecar(t: string): string {
  return t
    .normalize("NFKC")
    .replace(/\p{Cf}/gu, "")
    .replace(/[\p{Pd}\u2212]/gu, "-");
}

/** Separador entre blocos de dígitos (depois de normalizar). A barra e os dois-pontos ficam de fora: são data e hora. */
const SEP = "[\\s.,_-]";
const EMAIL = /[^\s@]+@[^\s@]+\.[^\s@]+/;
/** CPF: 3+3+3+2 dígitos, com ou sem separador. */
const CPF = new RegExp(`(?<!\\d)\\d{3}${SEP}?\\d{3}${SEP}?\\d{3}${SEP}?\\d{2}(?!\\d)`);
/** Telefone com DDD (fixo ou celular), com ou sem +55. */
const TELEFONE_COM_DDD = new RegExp(`(?<!\\d)(?:\\+?55${SEP}?)?\\(?\\d{2}\\)?${SEP}?(?:9${SEP}?)?\\d{4}${SEP}?\\d{4}(?!\\d)`);
/** Celular sem DDD escrito com separador (9XXXX-XXXX). Sem separador, 9 dígitos é o código do carrinho. */
const CELULAR_SEM_DDD = new RegExp(`(?<!\\d)9\\d{4}${SEP}\\d{4}(?!\\d)`);
/** 10 dígitos seguidos ou mais: telefone ou CPF sem separador, conta. O pedido (8) e o carrinho (9) passam. */
const DIGITOS_DEMAIS = /\d{10,}/;

/**
 * O que barra a mensagem antes de ela sair para o Chatbase. Dado pessoal de
 * cliente (telefone, CPF, e-mail) **nunca** vai para a IA — para falar de um
 * pedido ou de um cliente, o código do pedido ou o ID do cliente bastam.
 * Data, hora, códigos de pedido e números de cota passam. O telefone fixo
 * sem DDD (XXXX-XXXX) passa também: confunde com faixa de cotas ("2001-3000").
 */
export function problemaNaMensagemDaIA(texto: unknown): string | null {
  const t = typeof texto === "string" ? texto.trim() : "";
  if (!t) return "Escreva a mensagem.";
  if (t.length > MENSAGEM_IA_MAX) return `A mensagem passa de ${MENSAGEM_IA_MAX} caracteres.`;
  const n = normalizarParaChecar(t);
  if (EMAIL.test(n) || CPF.test(n) || TELEFONE_COM_DDD.test(n) || CELULAR_SEM_DDD.test(n) || DIGITOS_DEMAIS.test(n)) {
    return "Não envie telefone, CPF ou e-mail ao assistente — dado pessoal de cliente não sai da plataforma. Use o código do pedido ou o ID do cliente.";
  }
  return null;
}

/** O texto de uma mensagem do Chatbase: só as partes de texto, na ordem. */
export function textoDasPartes(partes: unknown): string {
  if (!Array.isArray(partes)) return "";
  return partes
    .filter((p): p is { type: "text"; text: string } => !!p && typeof p === "object" && (p as { type?: unknown }).type === "text" && typeof (p as { text?: unknown }).text === "string")
    .map((p) => p.text)
    .join("\n")
    .trim();
}

/**
 * Créditos de uma resposta, em **milésimos** (inteiro, exato): 2 créditos =
 * 2000, meio crédito = 500. Nada é arredondado aqui — quem arredonda é a
 * cobrança, sobre a soma. Valor ausente ou inválido vira `null` ("sem
 * medida"), nunca zero: zero seria uso de graça sem ninguém saber.
 */
export function milicreditosUsados(v: unknown): number | null {
  if (typeof v !== "number" && typeof v !== "string") return null;
  if (typeof v === "string" && v.trim() === "") return null;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 1000) : null;
}

export interface MensagemDaIA {
  id: string;
  papel: "voce" | "assistente";
  texto: string;
  /** Milissegundos. */
  criadoEm: number;
}

export interface SessaoDaIA {
  ligado: boolean;
}
