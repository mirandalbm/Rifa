/**
 * Acerto do cambista.
 *
 * O dinheiro da venda física fica com quem vendeu. O acerto é a conta do que
 * ele deve à casa: tudo que recolheu, menos a comissão dele. É o oposto do
 * afiliado online, que recebe da casa.
 */
import { and, eq, isNull, sql, desc } from "drizzle-orm";
import { db } from "../db";
import { orders, commissions, settlements, affiliates, users } from "@shared/schema";

export interface OpenBalance {
  orderCount: number;
  grossCents: number;
  commissionCents: number;
  netCents: number;
}

/** O que está em aberto: vendas pagas do cambista ainda não acertadas. */
export async function openBalance(sellerId: string): Promise<OpenBalance> {
  const [row] = await db
    .select({
      orderCount: sql<number>`count(*)::int`,
      grossCents: sql<number>`coalesce(sum(${orders.amountCents}), 0)::int`,
      commissionCents: sql<number>`coalesce(sum(${commissions.amountCents}), 0)::int`,
    })
    .from(orders)
    .leftJoin(commissions, eq(commissions.orderId, orders.id))
    .where(
      and(
        eq(orders.sellerId, sellerId),
        eq(orders.status, "paid"),
        isNull(orders.settlementId),
      ),
    );

  const grossCents = row?.grossCents ?? 0;
  const commissionCents = row?.commissionCents ?? 0;

  return {
    orderCount: row?.orderCount ?? 0,
    grossCents,
    commissionCents,
    netCents: grossCents - commissionCents,
  };
}

/**
 * Fecha o acerto: carimba os pedidos incluídos para que a próxima conta
 * comece do zero. Sem o carimbo, a mesma venda entraria em dois acertos.
 */
export async function closeSettlement(sellerId: string, notes?: string) {
  return db.transaction(async (tx) => {
    const pendentes = await tx
      .select({
        id: orders.id,
        amountCents: orders.amountCents,
        commissionCents: commissions.amountCents,
      })
      .from(orders)
      .leftJoin(commissions, eq(commissions.orderId, orders.id))
      .where(
        and(
          eq(orders.sellerId, sellerId),
          eq(orders.status, "paid"),
          isNull(orders.settlementId),
        ),
      );

    if (pendentes.length === 0) return null;

    const grossCents = pendentes.reduce((sum, o) => sum + o.amountCents, 0);
    const commissionCents = pendentes.reduce(
      (sum, o) => sum + (o.commissionCents ?? 0),
      0,
    );

    const [created] = await tx
      .insert(settlements)
      .values({
        sellerId,
        grossCents,
        commissionCents,
        netCents: grossCents - commissionCents,
        orderCount: pendentes.length,
        notes: notes ?? null,
      })
      .returning();

    await tx.execute(sql`
      UPDATE orders SET settlement_id = ${created.id}::uuid
      WHERE id = ANY(${`{${pendentes.map((o) => o.id).join(",")}}`}::uuid[])
    `);

    return created;
  });
}

export async function markSettlementPaid(settlementId: string) {
  const [updated] = await db
    .update(settlements)
    .set({ status: "pago", settledAt: new Date() })
    .where(eq(settlements.id, settlementId))
    .returning();
  return updated ?? null;
}

/**
 * `organizationId` nulo é a plataforma — vê o acerto de todo cambista. É a
 * mesma convenção de `services/orgs.ts`; repetida aqui porque este serviço é
 * chamado de fora da rota e não enxerga a requisição.
 */
export async function listSettlements(
  sellerId?: string,
  organizationId?: string | null,
) {
  const filtros = [
    sellerId ? eq(settlements.sellerId, sellerId) : undefined,
    organizationId ? eq(users.organizationId, organizationId) : undefined,
  ].filter(Boolean);

  const base = db
    .select({
      settlement: settlements,
      sellerCode: affiliates.code,
      sellerName: users.name,
    })
    .from(settlements)
    .innerJoin(affiliates, eq(affiliates.id, settlements.sellerId))
    .innerJoin(users, eq(users.id, affiliates.userId))
    .orderBy(desc(settlements.createdAt));

  return filtros.length ? base.where(and(...filtros)) : base;
}

/** Quanto cada cambista deve hoje — a tela de cobrança do administrador. */
export async function openBalancesBySeller(organizationId?: string | null) {
  const rows = await db
    .select({
      sellerId: orders.sellerId,
      code: affiliates.code,
      name: users.name,
      orderCount: sql<number>`count(*)::int`,
      grossCents: sql<number>`coalesce(sum(${orders.amountCents}), 0)::int`,
      commissionCents: sql<number>`coalesce(sum(${commissions.amountCents}), 0)::int`,
    })
    .from(orders)
    .innerJoin(affiliates, eq(affiliates.id, orders.sellerId))
    .innerJoin(users, eq(users.id, affiliates.userId))
    .leftJoin(commissions, eq(commissions.orderId, orders.id))
    .where(
      and(
        eq(orders.status, "paid"),
        isNull(orders.settlementId),
        organizationId ? eq(users.organizationId, organizationId) : undefined,
      ),
    )
    .groupBy(orders.sellerId, affiliates.code, users.name);

  return rows.map((r) => ({
    ...r,
    netCents: r.grossCents - r.commissionCents,
  }));
}
