/**
 * O presente: desconto de primeira compra pago pela plataforma, mandado
 * pelo campo de comentários com o link de indicação de quem convida.
 * Regras em `shared/presente.ts`.
 */
import { and, eq, sql } from "drizzle-orm";
import { db } from "../db";
import { buyers, orders, presenteCreditos } from "@shared/schema";
import { creditoDoPresente, descontoDoPresente } from "@shared/presente";
import { normalizePhone } from "@shared/format";
import { garantirCodigoDeIndicacao, indicadorPorCodigo } from "./bonus";
import { getPlataforma } from "./settings";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * Quanto do pedido a plataforma paga pelo presente. Zero (sem presente)
 * quando: desligado, venda de cambista, compra fora da conta (o CPF único
 * entre contas é o que faz o desconto ser um por pessoa), código inválido,
 * autoindicação (mesmo comprador, telefone ou CPF) ou quem compra já tem
 * compra paga. Dois pedidos ao mesmo tempo: quem decide é o índice
 * `uq_presente_por_comprador`, na gravação.
 */
export async function presenteDoPedido(p: {
  buyerId: string;
  contaId?: string;
  sellerId?: string;
  codigo?: string | null;
  totalCents: number;
}): Promise<{ cents: number; deId: string | null }> {
  const nada = { cents: 0, deId: null };
  if (p.sellerId || !p.contaId || !p.codigo || p.contaId !== p.buyerId) return nada;
  const cfg = (await getPlataforma()).presente;
  if (!cfg.ligado) return nada;
  const de = await indicadorPorCodigo(p.codigo);
  if (!de || de.id === p.buyerId) return nada;
  const [eu] = await db
    .select({ phone: buyers.phone, cpf: buyers.cpf, senha: buyers.passwordHash })
    .from(buyers)
    .where(eq(buyers.id, p.buyerId));
  // Conta de verdade (senha e CPF): sessão só de código do WhatsApp não basta.
  if (!eu?.senha || !eu.cpf) return nada;
  if (normalizePhone(eu.phone) === normalizePhone(de.phone)) return nada;
  const cpf = (v: string | null) => (v ?? "").replace(/\D/g, "");
  if (cpf(eu.cpf) && cpf(eu.cpf) === cpf(de.cpf)) return nada;
  const [jaComprou] = await db
    .select({ id: orders.id })
    .from(orders)
    .where(and(eq(orders.buyerId, p.buyerId), sql`${orders.status} in ('paid', 'refunded')`, sql`${orders.method} <> 'bonus'`))
    .limit(1);
  if (jaComprou) return nada;
  const cents = descontoDoPresente(p.totalCents, cfg);
  return cents > 0 ? { cents, deId: de.id } : nada;
}

/** Na transação do pagamento: a parte da promotora no desconto vira crédito dela. */
export async function lancarCreditoDoPresente(
  tx: Tx,
  p: {
    organizationId: string;
    orderId: string;
    presenteCents: number;
    platformPct: number;
    commissionPct: number;
    comissaoGuardada: boolean;
  },
) {
  const valor = creditoDoPresente(p);
  if (valor <= 0) return;
  await tx
    .insert(presenteCreditos)
    .values({ organizationId: p.organizationId, orderId: p.orderId, amountCents: valor })
    .onConflictDoNothing();
}

/**
 * Na transação do estorno: o crédito do presente sai junto. O que já foi
 * repassado no acerto não volta sozinho — fica como pago e vai para o log,
 * como a comissão já sacada: engolir calado seria esconder dinheiro que saiu.
 */
export async function cancelarCreditoDoPresente(tx: Tx, orderId: string) {
  await tx
    .update(presenteCreditos)
    .set({ status: "cancelado" })
    .where(and(eq(presenteCreditos.orderId, orderId), eq(presenteCreditos.status, "devido")));
  const [repassado] = await tx
    .select({ amountCents: presenteCreditos.amountCents })
    .from(presenteCreditos)
    .where(and(eq(presenteCreditos.orderId, orderId), eq(presenteCreditos.status, "pago")));
  if (repassado) {
    console.warn(`[presente] estorno do pedido ${orderId}: ${repassado.amountCents} centavos de crédito já tinham sido repassados`);
  }
}

/** O que a tela de quem recebe mostra: a oferta e o primeiro nome de quem mandou. */
export async function presentePublico(codigo: string) {
  const cfg = (await getPlataforma()).presente;
  if (!cfg.ligado) return { ligado: false as const };
  const de = await indicadorPorCodigo(codigo);
  if (!de) return { ligado: true as const, valido: false as const, pct: cfg.pct, tetoCents: cfg.tetoCents };
  const [b] = await db.select({ name: buyers.name }).from(buyers).where(eq(buyers.id, de.id));
  return {
    ligado: true as const,
    valido: true as const,
    de: (b?.name ?? "").trim().split(/\s+/)[0] ?? "",
    pct: cfg.pct,
    tetoCents: cfg.tetoCents,
  };
}

/** O código de quem manda o presente (o mesmo link de indicação). */
export async function meuCodigoDePresente(buyerId: string) {
  const cfg = (await getPlataforma()).presente;
  if (!cfg.ligado) return { ligado: false as const };
  return { ligado: true as const, codigo: await garantirCodigoDeIndicacao(buyerId), pct: cfg.pct, tetoCents: cfg.tetoCents };
}
