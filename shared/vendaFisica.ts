/**
 * Venda na mão do cambista: o que a rota lê do corpo e da URL, em regra pura
 * (servidor e teste leem igual).
 *
 * Nada aqui decide preço, cota ou meio de pagamento ligado: isso é do servidor
 * (`services/orders.ts`). Aqui só se separa o que tem o formato certo do que
 * não tem, para o erro de preenchimento virar 4xx e nunca 500.
 */

/** O meio que o cambista recolheu. Cartão não é aceito. */
export type MeioFisico = "dinheiro" | "pix_maquininha";

const MEIOS: readonly MeioFisico[] = ["dinheiro", "pix_maquininha"];

/** `orders.code` é `int4`. */
const CODIGO_MAX = 2_147_483_647;

/**
 * O código da venda na URL: inteiro positivo, em dígitos. O que não for isso
 * não existe (`null`) — nunca vira `NaN`, `Infinity` ou número fora do `int4`
 * no SQL (era 500 em `abc`, `12.5` e `2147483648`).
 */
export function codigoDaVenda(texto: unknown): number | null {
  if (typeof texto !== "string" || !/^[0-9]{1,10}$/.test(texto)) return null;
  const n = Number(texto);
  return n > 0 && n <= CODIGO_MAX ? n : null;
}

/** O meio vindo do corpo: só o texto exato (uma lista `["dinheiro"]` virava "dinheiro" no `String()`). */
export function lerMeioFisico(valor: unknown): MeioFisico | null {
  return typeof valor === "string" && (MEIOS as readonly string[]).includes(valor) ? (valor as MeioFisico) : null;
}

/** O comprovante da maquininha (NSU ou código de autorização): letras, números e `. _ / -`. */
export const AUTORIZACAO_MAX = 40;
const AUTORIZACAO_RE = /^[A-Za-z0-9._/-]+$/;
/**
 * O terminal: o nome do aparelho (o invólucro manda "Ton POS Android"). Não sai
 * no bilhete, então a régua é só tamanho e nenhum caractere de controle (uma
 * quebra de linha no registro da venda).
 */
export const TERMINAL_MAX = 60;
const TERMINAL_RE = /^[^\p{C}]+$/u;

export type ComprovanteDaMaquininha =
  | { ok: true; posAuthCode?: string; posTerminal?: string }
  | { ok: false; message: string };

/**
 * O que o cambista manda do comprovante vai para o bilhete, que é público pelo
 * código do pedido e sai impresso: texto livre ali seria um canal para
 * "pague no Pix para…" (o golpe de levar o apostador para fora da plataforma),
 * e sem teto gravava megabytes. Ausente (ou vazio) é permitido — o cambista
 * sem maquininha não tem comprovante.
 */
export function lerComprovanteDaMaquininha(autorizacao: unknown, terminal: unknown): ComprovanteDaMaquininha {
  const saida: { ok: true; posAuthCode?: string; posTerminal?: string } = { ok: true };
  if (autorizacao !== undefined && autorizacao !== null && autorizacao !== "") {
    if (typeof autorizacao !== "string" || autorizacao.length > AUTORIZACAO_MAX || !AUTORIZACAO_RE.test(autorizacao)) {
      return { ok: false, message: `O código de autorização da maquininha só leva letras, números e . _ / - (até ${AUTORIZACAO_MAX}).` };
    }
    saida.posAuthCode = autorizacao;
  }
  if (terminal !== undefined && terminal !== null && terminal !== "") {
    if (typeof terminal !== "string" || terminal.length > TERMINAL_MAX || !TERMINAL_RE.test(terminal)) {
      return { ok: false, message: `O nome do terminal da maquininha é texto de uma linha, de até ${TERMINAL_MAX} caracteres.` };
    }
    saida.posTerminal = terminal;
  }
  return saida;
}

/**
 * Teto de vendas novas por cambista: a venda dele é isenta dos limites de
 * comprador (presencial, ele responde no acerto), mas uma conta que reserva
 * sem parar prende o estoque da rifa — o ataque de bloqueio de estoque feito
 * de dentro. Folgado para o balcão (uma venda a cada 5 s no máximo).
 */
export const VENDAS_DO_CAMBISTA_POR_JANELA = { minutos: 10, limite: 120 } as const;
