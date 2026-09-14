/**
 * Cobrança da plataforma sobre as organizações.
 *
 * Duas portas de entrada, um razão só (`platform_charges`):
 *
 * - `lancarTaxaDaVenda()` roda dentro da transação que confirma o pagamento,
 *   junto com a comissão. Tem que ser na mesma transação: taxa lançada fora
 *   dela sobreviveria a um rollback e cobraria por uma venda que não existiu.
 * - `lancarMensalidades()` roda no relógio quando o mês vira.
 *
 * A ordem do rateio é a regra que não se negocia: **a plataforma sai antes**,
 * e a comissão do afiliado ou do cambista incide sobre o que sobrou. Quem faz
 * essa conta é `splitOrder()`, em `shared/pricing.ts`.
 */
import { and, eq, sql, desc, isNull } from "drizzle-orm";
import { db } from "../db";
import { organizations, platformCharges, orders, campaigns } from "@shared/schema";
import {
  validateBillingPlan,
  platformPctFor,
  monthlyCentsFor,
  competenciaAnterior,
  type BillingPlan,
  type BillingMode,
} from "@shared/billing";

export class BillingError extends Error {
  constructor(message: string, readonly status = 400) {
    super(message);
    this.name = "BillingError";
  }
}

/** O contrato de uma organização, já normalizado. */
export function planOf(org: {
  billingMode: BillingMode;
  platformFeePct: number;
  monthlyCents: number;
}): BillingPlan {
  return {
    mode: org.billingMode,
    platformFeePct: org.platformFeePct,
    monthlyCents: org.monthlyCents,
  };
}

export async function planOfOrganization(organizationId: string): Promise<BillingPlan> {
  const [org] = await db
    .select({
      billingMode: organizations.billingMode,
      platformFeePct: organizations.platformFeePct,
      monthlyCents: organizations.monthlyCents,
    })
    .from(organizations)
    .where(eq(organizations.id, organizationId));

  if (!org) throw new BillingError("Organização não encontrada.", 404);
  return planOf(org);
}

export async function setBillingPlan(
  organizationId: string,
  candidate: Partial<BillingPlan>,
) {
  const plano = validateBillingPlan(candidate);

  const [org] = await db
    .update(organizations)
    .set({
      billingMode: plano.mode,
      platformFeePct: plano.platformFeePct,
      monthlyCents: plano.monthlyCents,
    })
    .where(eq(organizations.id, organizationId))
    .returning();

  if (!org) throw new BillingError("Organização não encontrada.", 404);
  return plano;
}

/* ------------------------------------------------------------------ *
 * Taxa por venda
 * ------------------------------------------------------------------ */

/**
 * Lança a taxa da plataforma sobre uma venda paga.
 *
 * Recebe a transação de propósito: isto acontece dentro do mesmo `BEGIN` que
 * marca o pedido como pago. `onConflictDoNothing` sobre o índice do pedido
 * fecha a porta do webhook chamado duas vezes.
 */
export async function lancarTaxaDaVenda(
  tx: Pick<typeof db, "insert">,
  params: {
    organizationId: string;
    orderId: string;
    amountCents: number;
    pct: number;
  },
) {
  if (params.amountCents <= 0) return;

  await tx
    .insert(platformCharges)
    .values({
      organizationId: params.organizationId,
      kind: "venda",
      orderId: params.orderId,
      amountCents: params.amountCents,
      pct: params.pct,
    })
    .onConflictDoNothing();
}

/* ------------------------------------------------------------------ *
 * Mensalidade
 * ------------------------------------------------------------------ */

/**
 * Lança a mensalidade de quem está no modo `mensalidade` e ainda não foi
 * cobrado naquela competência.
 *
 * Cobra o mês **anterior**, não o corrente: mensalidade lançada no dia 1º
 * para o mês que começa é cobrança antecipada, e quem cancelar no dia 3 já
 * está devendo por 28 dias que não usou.
 *
 * Idempotente pelo índice `(organização, competência)` — pode rodar a cada
 * minuto, em quantas réplicas for.
 */
export async function lancarMensalidades(agora = new Date()): Promise<number> {
  const competencia = competenciaAnterior(agora);

  const ativas = await db
    .select()
    .from(organizations)
    .where(
      and(eq(organizations.billingMode, "mensalidade"), eq(organizations.active, true)),
    );

  let lancadas = 0;
  for (const org of ativas) {
    const valor = monthlyCentsFor(planOf(org));
    if (valor <= 0) continue;

    const [criada] = await db
      .insert(platformCharges)
      .values({
        organizationId: org.id,
        kind: "mensalidade",
        competencia,
        amountCents: valor,
      })
      .onConflictDoNothing()
      .returning({ id: platformCharges.id });

    if (criada) lancadas++;
  }

  return lancadas;
}

/* ------------------------------------------------------------------ *
 * Leitura
 * ------------------------------------------------------------------ */

/** O extrato de uma organização: o que ela deve e o que já pagou. */
export async function extratoDa(organizationId: string, limite = 100) {
  const linhas = await db
    .select({
      charge: platformCharges,
      orderCode: orders.code,
      campanha: campaigns.title,
    })
    .from(platformCharges)
    .leftJoin(orders, eq(orders.id, platformCharges.orderId))
    .leftJoin(campaigns, eq(campaigns.id, orders.campaignId))
    .where(eq(platformCharges.organizationId, organizationId))
    .orderBy(desc(platformCharges.createdAt))
    .limit(limite);

  const [totais] = await db
    .select({
      abertoCents: sql<number>`coalesce(sum(${platformCharges.amountCents}) FILTER (WHERE ${platformCharges.status} = 'aberta'), 0)::int`,
      pagoCents: sql<number>`coalesce(sum(${platformCharges.amountCents}) FILTER (WHERE ${platformCharges.status} = 'paga'), 0)::int`,
    })
    .from(platformCharges)
    .where(eq(platformCharges.organizationId, organizationId));

  return { linhas, totais };
}

/** A carteira da plataforma: quanto cada organização deve. */
export async function carteiraDaPlataforma() {
  return db
    .select({
      organizationId: organizations.id,
      name: organizations.name,
      mode: organizations.billingMode,
      platformFeePct: organizations.platformFeePct,
      monthlyCents: organizations.monthlyCents,
      active: organizations.active,
      abertoCents: sql<number>`coalesce(sum(${platformCharges.amountCents}) FILTER (WHERE ${platformCharges.status} = 'aberta'), 0)::int`,
      pagoCents: sql<number>`coalesce(sum(${platformCharges.amountCents}) FILTER (WHERE ${platformCharges.status} = 'paga'), 0)::int`,
      lancamentos: sql<number>`count(${platformCharges.id})::int`,
    })
    .from(organizations)
    .leftJoin(platformCharges, eq(platformCharges.organizationId, organizations.id))
    .groupBy(organizations.id)
    .orderBy(organizations.name);
}

/** Dá baixa no que está em aberto de uma organização. */
export async function darBaixa(organizationId: string): Promise<number> {
  const linhas = await db
    .update(platformCharges)
    .set({ status: "paga", paidAt: new Date() })
    .where(
      and(
        eq(platformCharges.organizationId, organizationId),
        eq(platformCharges.status, "aberta"),
      ),
    )
    .returning({ id: platformCharges.id });

  return linhas.length;
}
