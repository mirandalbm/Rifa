/**
 * Conta do apostador — regras puras, lidas pelo servidor (que decide) e pela
 * tela (que avisa antes de enviar).
 *
 * O ponto delicado: sem confirmar o telefone, qualquer um criaria conta com o
 * número de outra pessoa e veria as compras dela. Por isso a conta separa o
 * que prova e o que não prova:
 *
 * - compra feita **dentro da conta** é da conta, sempre;
 * - compra feita antes, só pelo telefone, vem junto quando o CPF dela bate
 *   com o do cadastro (o CPF é a prova — o telefone sozinho não é);
 * - o que sobrar (compra antiga sem CPF gravado) só aparece depois que o
 *   telefone é confirmado pelo código do WhatsApp.
 */
import { cpfValido, normalizePhone } from "./format";
import { cepValido } from "./endereco";
import { senhaInvalida } from "./senha";

export type TipoIdentificador = "email" | "digitos";

/**
 * O apostador entra com telefone, CPF ou e-mail. Telefone com DDD e CPF têm
 * 11 dígitos os dois — então dígitos são procurados nas duas colunas, e a
 * senha decide.
 */
export function tipoDoIdentificador(entrada: string): TipoIdentificador | null {
  const t = entrada.trim();
  if (t.includes("@")) return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(t) ? "email" : null;
  const d = normalizePhone(t);
  return d.length >= 10 && d.length <= 13 ? "digitos" : null;
}

export interface CadastroComprador {
  nome: string;
  telefone: string;
  cpf: string;
  /** Diz a cidade e o estado: a vitrine põe primeiro as rifas perto. */
  cep: string;
  email?: string;
  senha: string;
}

/** Devolve o problema, ou `null` se o cadastro pode seguir. */
export function problemaNoCadastro(c: CadastroComprador): string | null {
  if ((c.nome ?? "").trim().length < 3) return "Informe seu nome completo.";
  const tel = normalizePhone(c.telefone ?? "");
  if (tel.length < 10 || tel.length > 11) return "Informe o WhatsApp com DDD.";
  if (!cpfValido(c.cpf ?? "")) return "Informe um CPF válido.";
  if (!cepValido(c.cep ?? "")) return "Informe o CEP (8 números).";
  const email = (c.email ?? "").trim();
  if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return "E-mail inválido.";
  return senhaInvalida(c.senha ?? "", "buyer");
}

/** O que a conta já provou sobre as compras feitas fora dela. */
export interface Titularidade {
  /** Telefone provado pelo código do WhatsApp: tudo do telefone é da conta. */
  telefoneConfirmado: boolean;
  /** CPF das compras antigas bateu no cadastro: o que existia até aqui é da conta. */
  comprasVinculadasEm: Date | null;
}

/**
 * O pedido aparece na conta? Feito dentro dela, sempre. Feito pelo telefone,
 * sem entrar: se o telefone foi provado, ou se o pedido já existia quando o
 * CPF das compras bateu no cadastro.
 */
export function pedidoVisivel(
  p: { viaConta: boolean; createdAt: Date },
  t: Titularidade,
): boolean {
  if (p.viaConta || t.telefoneConfirmado) return true;
  return Boolean(t.comprasVinculadasEm && p.createdAt <= t.comprasVinculadasEm);
}

/**
 * Reembolso é mais exigente que ver: dinheiro sai. Compra feita pelo
 * telefone e ligada só pelo CPF pode pedir reembolso quando foi paga por Pix
 * online — o dinheiro volta para a conta que pagou, não para quem pede. Venda
 * de cambista devolve à mão (chave Pix informada), então exige o telefone
 * provado.
 */
export function podePedirReembolso(
  p: { viaConta: boolean; createdAt: Date; method: string },
  t: Titularidade,
): boolean {
  if (p.viaConta || t.telefoneConfirmado) return true;
  return pedidoVisivel(p, t) && p.method === "pix_online";
}

/** Como o titular aparece depois de excluir a conta (LGPD). */
export const NOME_EXCLUIDO = "Titular removido";
