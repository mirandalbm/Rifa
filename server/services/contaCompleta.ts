/**
 * Completar a conta: o CPF e o telefone provado da conta do Google, e a
 * confirmação do telefone da conta com senha que ainda não o provou.
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
import { guardOtp, guardOtpVerify, hit, identify } from "./antifraude";
import { ContaError, compradorDaSessao, encerrarOutrasSessoes } from "./contaComprador";

export async function completarCpf(req: Request, bruto: string) {
  const sessao = compradorDaSessao(req);
  const cpf = String(bruto ?? "").replace(/\D/g, "");
  if (!cpfValido(cpf)) throw new ContaError("CPF inválido.");
  // Conta o palpite antes de gravar: o "já existe" revela quem é apostador, e o
  // dígito verificador é a única prova do CPF (sem limite, dava para varrer CPFs).
  const id = identify(req);
  if ((await hit(`conta-cpf:${sessao.id}`, 24 * 60, 5)).excedeu || (await hit(`conta-cpf-ip:${id.ipHash ?? "sem-origem"}`, 60, 20)).excedeu) {
    throw new ContaError("Muitas tentativas de CPF. Tente mais tarde.", 429);
  }
  try {
    const [c] = await db
      .update(buyers)
      .set({ cpf })
      .where(and(eq(buyers.id, sessao.id), isNull(buyers.cpf), isNull(buyers.excluidoEm)))
      .returning({ id: buyers.id });
    if (!c) throw new ContaError("O CPF desta conta já foi informado.", 409);
  } catch (err) {
    if (isUniqueViolation(err, "uq_buyers_conta_cpf")) {
      throw new ContaError("Não foi possível usar este CPF. Se ele já é seu, entre na conta com a senha.", 409);
    }
    throw err;
  }
}

/**
 * Manda o código do WhatsApp. Devolve o código só quando o envio é de mentira (dev).
 *
 * Dois casos, e quem decide é o telefone **gravado na conta**, nunca o corpo:
 * - provisório (conta do Google): o código vai ao número novo que a pessoa
 *   digitou, e ele só vira o da conta na confirmação;
 * - real e ainda não confirmado (conta com senha): o código vai ao telefone
 *   da conta e o número do corpo é ignorado — quem pede não escolhe para
 *   onde o código vai. Já confirmado, 409.
 */
export async function pedirCodigoDoTelefone(req: Request, bruto: string): Promise<string> {
  const sessao = compradorDaSessao(req);
  const [c] = await db.select().from(buyers).where(eq(buyers.id, sessao.id));
  if (!c || c.excluidoEm) throw new ContaError("Conta não encontrada.", 404);
  const provisorio = ehTelefoneProvisorio(c.phone);

  let phone: string;
  if (provisorio) {
    phone = normalizePhone(String(bruto ?? ""));
    if (phone.length < 10) throw new ContaError("Telefone inválido.");
  } else {
    if (c.telefoneConfirmadoEm) throw new ContaError("O telefone desta conta já foi confirmado.", 409);
    phone = c.phone;
  }

  const veredito = await guardOtp(phone, identify(req));
  if (!veredito.allowed) throw new ContaError(veredito.reason ?? "Muitas tentativas.", 429);
  if (provisorio) {
    // Número que já é de outro cadastro não vira o desta conta: seria tomar o
    // histórico de compras dele. (O índice único decide na confirmação.)
    const [dono] = await db.select({ id: buyers.id }).from(buyers).where(eq(buyers.phone, phone));
    if (dono) throw new ContaError("Este telefone já tem cadastro. Entre com ele pela senha ou use outro número.", 409);
  }

  const code = await issueOtp(req, phone);
  await notify({ to: phone, template: "codigo_acesso", params: { codigo: code }, dedupeKey: `otp:${phone}:${Date.now()}` });
  return code;
}

/**
 * Grava o telefone provado **sem trocar a sessão** (nada de `regenerate`: o
 * "lembrar" e o resto da sessão ficam). A sessão que provou passa a valer
 * como confirmada e as outras da conta saem — é a primeira prova do
 * telefone, e quem entrou antes pela senha pode não ser o dono.
 *
 * No telefone real, o número provado tem de ser **o da conta**: provar outro
 * pelo "Minhas compras" (`/my-quotas/request-code`) e chamar aqui é 409, nada
 * gravado. Dois cliques com o mesmo código ao mesmo tempo: o `UPDATE`
 * condicional grava uma vez só, e o segundo recebe o mesmo sucesso — ele
 * também provou o número, e um 409 deixaria a cópia dele da sessão, salva
 * por último, apagar a marca de confirmada que o primeiro gravou.
 */
export async function confirmarTelefone(req: Request, codigo: string) {
  const sessao = compradorDaSessao(req);
  const phone = req.session.otp?.phone;
  if (!phone) throw new ContaError("Peça um código novo.");
  const [c] = await db.select().from(buyers).where(eq(buyers.id, sessao.id));
  if (!c || c.excluidoEm) throw new ContaError("Conta não encontrada.", 404);
  const real = !ehTelefoneProvisorio(c.phone);
  if (real && phone !== c.phone) {
    throw new ContaError("O código pedido é de outro número. Peça o código por aqui, para o telefone da conta.", 409);
  }
  const veredito = await guardOtpVerify(phone, identify(req));
  if (!veredito.allowed) throw new ContaError(veredito.reason ?? "Muitas tentativas.", 429);
  if (!(await checkOtp(req, String(codigo ?? "").trim()))) throw new ContaError("Código incorreto ou expirado.", 401);

  if (real) {
    // As outras sessões saem ANTES de gravar: se o DELETE falhar, nada fica
    // confirmado e a pessoa pede outro código. Na ordem inversa, a conta já
    // estaria confirmada e quem entrou pela senha sem ser dono ficaria de pé.
    await encerrarOutrasSessoes(sessao.id, req);
    const [gravou] = await db
      .update(buyers)
      .set({ telefoneConfirmadoEm: new Date() })
      .where(
        and(
          eq(buyers.id, sessao.id),
          isNull(buyers.excluidoEm),
          eq(buyers.phone, phone),
          eq(buyers.phone, sessao.phone),
          isNull(buyers.telefoneConfirmadoEm),
        ),
      )
      .returning({ id: buyers.id });
    if (!gravou) {
      // Outro clique gravou primeiro? Então é o mesmo sucesso; qualquer outra
      // coisa (número mudado, conta excluída) é 409.
      const [agora] = await db
        .select({ phone: buyers.phone, em: buyers.telefoneConfirmadoEm, excluidoEm: buyers.excluidoEm })
        .from(buyers)
        .where(eq(buyers.id, sessao.id));
      const mesmo = Boolean(agora && !agora.excluidoEm && agora.em && agora.phone === phone && phone === sessao.phone);
      if (!mesmo) throw new ContaError("O telefone desta conta mudou. Recarregue a página.", 409);
    }
  } else {
    try {
      const [gravou] = await db
        .update(buyers)
        .set({ phone, telefoneConfirmadoEm: new Date() })
        .where(and(eq(buyers.id, sessao.id), isNull(buyers.excluidoEm), eq(buyers.phone, sessao.phone)))
        .returning({ id: buyers.id });
      if (!gravou) throw new ContaError("O telefone desta conta mudou. Recarregue a página.", 409);
    } catch (err) {
      if (isUniqueViolation(err, "uq_buyers_phone")) {
        throw new ContaError("Este telefone já tem cadastro. Use outro número.", 409);
      }
      throw err;
    }
  }
  // Provou o número: a sessão que já existe passa a ser dele e as outras saem
  // (no telefone real, já saíram antes do UPDATE).
  if (!real) await encerrarOutrasSessoes(sessao.id, req);
  req.session.buyer = { ...sessao, phone, confirmado: true, porCodigoEm: Date.now() };
}
