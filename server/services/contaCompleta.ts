/**
 * Completar a conta criada pelo Google: CPF e telefone provado.
 *
 * O CPF só entra quando ainda não há um (depois dele, mudar é assunto do
 * atendimento — é a identidade do reembolso) e o índice único entre contas
 * decide o repetido. O telefone só vira o da conta depois do código do
 * WhatsApp **neste número**; número que já é de outra pessoa é recusado
 * antes de enviar qualquer coisa.
 */
import type { Request } from "express";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "../db";
import { buyers } from "@shared/schema";
import { cpfValido, normalizePhone } from "@shared/format";
import { ehTelefoneProvisorio } from "@shared/google";
import { checkOtp, issueOtp } from "../auth";
import { isUniqueViolation } from "../pgError";
import { notify } from "../notifications";
import { guardOtp, guardOtpVerify, identify } from "./antifraude";
import { ContaError, compradorDaSessao, encerrarOutrasSessoes } from "./contaComprador";

export async function completarCpf(req: Request, bruto: string) {
  const sessao = compradorDaSessao(req);
  const cpf = String(bruto ?? "").replace(/\D/g, "");
  if (!cpfValido(cpf)) throw new ContaError("CPF inválido.");
  try {
    const [c] = await db
      .update(buyers)
      .set({ cpf })
      .where(and(eq(buyers.id, sessao.id), isNull(buyers.cpf), isNull(buyers.excluidoEm)))
      .returning({ id: buyers.id });
    if (!c) throw new ContaError("O CPF desta conta já foi informado.", 409);
  } catch (err) {
    if (isUniqueViolation(err, "uq_buyers_conta_cpf")) {
      throw new ContaError("Já existe uma conta com este CPF. Entre nela com a senha.", 409);
    }
    throw err;
  }
}

/** Manda o código para o número novo. Devolve o código só quando o envio é de mentira (dev). */
export async function pedirCodigoDoTelefone(req: Request, bruto: string): Promise<string> {
  const sessao = compradorDaSessao(req);
  const phone = normalizePhone(String(bruto ?? ""));
  if (phone.length < 10) throw new ContaError("Telefone inválido.");
  const [c] = await db.select().from(buyers).where(eq(buyers.id, sessao.id));
  if (!c || c.excluidoEm) throw new ContaError("Conta não encontrada.", 404);
  if (!ehTelefoneProvisorio(c.phone)) throw new ContaError("O telefone desta conta já foi confirmado.", 409);

  const veredito = await guardOtp(phone, identify(req));
  if (!veredito.allowed) throw new ContaError(veredito.reason ?? "Muitas tentativas.", 429);
  // Número que já é de outro cadastro não vira o desta conta: seria tomar o
  // histórico de compras dele. (O índice único decide na confirmação.)
  const [dono] = await db.select({ id: buyers.id }).from(buyers).where(eq(buyers.phone, phone));
  if (dono) throw new ContaError("Este telefone já tem cadastro. Entre com ele pela senha ou use outro número.", 409);

  const code = await issueOtp(req, phone);
  await notify({ to: phone, template: "codigo_acesso", params: { codigo: code }, dedupeKey: `otp:${phone}:${Date.now()}` });
  return code;
}

export async function confirmarTelefone(req: Request, codigo: string) {
  const sessao = compradorDaSessao(req);
  const phone = req.session.otp?.phone;
  if (!phone) throw new ContaError("Peça um código novo.");
  const veredito = await guardOtpVerify(phone, identify(req));
  if (!veredito.allowed) throw new ContaError(veredito.reason ?? "Muitas tentativas.", 429);
  if (!(await checkOtp(req, String(codigo ?? "").trim()))) throw new ContaError("Código incorreto ou expirado.", 401);
  try {
    const [c] = await db
      .update(buyers)
      .set({ phone, telefoneConfirmadoEm: new Date() })
      .where(and(eq(buyers.id, sessao.id), isNull(buyers.excluidoEm), eq(buyers.phone, sessao.phone)))
      .returning({ id: buyers.id });
    if (!c) throw new ContaError("O telefone desta conta mudou. Recarregue a página.", 409);
  } catch (err) {
    if (isUniqueViolation(err, "uq_buyers_phone")) {
      throw new ContaError("Este telefone já tem cadastro. Use outro número.", 409);
    }
    throw err;
  }
  // Provou o número: a sessão passa a ser dele e as outras saem.
  req.session.buyer = { ...sessao, phone, confirmado: true };
  await encerrarOutrasSessoes(sessao.id, req.sessionID);
}
