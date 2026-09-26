/**
 * Conta do apostador — regras puras, lidas pelo servidor (que decide) e pela
 * tela (que avisa antes de enviar).
 *
 * O ponto delicado: sem confirmar o telefone, qualquer um criaria conta com o
 * número de outra pessoa e veria as compras dela. Por isso a conta separa o
 * que prova e o que não prova:
 *
 * - compra feita **dentro da conta** é da conta, sempre;
 * - compra feita pelo telefone, sem entrar (o jeito antigo), só aparece
 *   depois que o telefone é confirmado pelo código do WhatsApp.
 */
import { cpfValido, normalizePhone } from "./format";
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
  email?: string;
  senha: string;
}

/** Devolve o problema, ou `null` se o cadastro pode seguir. */
export function problemaNoCadastro(c: CadastroComprador): string | null {
  if ((c.nome ?? "").trim().length < 3) return "Informe seu nome completo.";
  const tel = normalizePhone(c.telefone ?? "");
  if (tel.length < 10 || tel.length > 11) return "Informe o WhatsApp com DDD.";
  if (!cpfValido(c.cpf ?? "")) return "Informe um CPF válido.";
  const email = (c.email ?? "").trim();
  if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return "E-mail inválido.";
  return senhaInvalida(c.senha ?? "", "buyer");
}

/**
 * O pedido aparece para esta sessão? Compra feita dentro da conta, sempre;
 * compra pelo telefone, só com o telefone confirmado.
 */
export function pedidoVisivel(p: { viaConta: boolean }, telefoneConfirmado: boolean): boolean {
  return p.viaConta || telefoneConfirmado;
}

/** Como o titular aparece depois de excluir a conta (LGPD). */
export const NOME_EXCLUIDO = "Titular removido";
