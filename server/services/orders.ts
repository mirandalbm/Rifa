/**
 * Pedido: reserva, cobrança e confirmação.
 *
 * O front nunca envia preço — envia campanha e quantidade (ou os números
 * escolhidos). O total é sempre recalculado aqui, em centavos inteiros.
 */
import { randomInt } from "node:crypto";
import { and, eq, sql, desc } from "drizzle-orm";
import { db } from "../db";
import {
  campaigns,
  campaignStats,
  quotaPackages,
  settlements,
  quotaAlloc,
  orders,
  buyers,
  affiliates,
  coupons,
  commissions,
  prizedQuotas,
  type CreateOrderInput,
} from "@shared/schema";
import { priceOrder, commissionCents, commissionAvailableAt } from "@shared/pricing";
import { normalizePhone } from "@shared/format";
import { users } from "@shared/schema";
import {
  intArray,
  reserveRandom,
  reserveSpecific,
  bumpReserved,
  confirmPaid,
  shouldEnterEndgame,
  enterEndgame,
} from "./quotas";
import { paymentProvider } from "../payments";
import { notify } from "../notifications";
import { publicUrl } from "./urls";
import { formatBRL, formatQuota } from "@shared/format";

/** Dias entre o pagamento e a liberação da comissão do afiliado. */
export const REFUND_WINDOW_DAYS = Number(process.env.REFUND_WINDOW_DAYS ?? 7);

export class OrderError extends Error {
  constructor(message: string, readonly status = 400) {
    super(message);
    this.name = "OrderError";
  }
}

async function nextOrderCode(): Promise<number> {
  // Código curto que o comprador lê no WhatsApp. Colisão é rara e o índice
  // único é quem decide; tentamos algumas vezes antes de desistir.
  for (let i = 0; i < 10; i++) {
    const candidate = randomInt(10_000, 1_000_000);
    const [existing] = await db
      .select({ code: orders.code })
      .from(orders)
      .where(eq(orders.code, candidate));
    if (!existing) return candidate;
  }
  throw new OrderError("Não foi possível gerar o número do pedido.", 500);
}

async function upsertBuyer(input: CreateOrderInput["buyer"]) {
  const phone = normalizePhone(input.phone);
  if (phone.length < 10) throw new OrderError("Telefone inválido.");

  const [existing] = await db.select().from(buyers).where(eq(buyers.phone, phone));
  if (existing) {
    if (existing.name !== input.name) {
      await db.update(buyers).set({ name: input.name }).where(eq(buyers.id, existing.id));
    }
    return { ...existing, name: input.name };
  }

  const [created] = await db
    .insert(buyers)
    .values({ name: input.name, phone, cpf: input.cpf, email: input.email })
    .returning();
  return created;
}

/**
 * Atribuição do afiliado, decidida na criação do pedido:
 * cupom digitado no checkout > primeiro clique guardado na sessão.
 * Autoindicação é bloqueada: o afiliado não ganha comissão da própria compra.
 */
async function resolveAttribution(params: {
  couponCode?: string;
  sessionAffiliateCode?: string;
  buyerPhone: string;
}) {
  const { couponCode, sessionAffiliateCode, buyerPhone } = params;

  let affiliateId: string | null = null;
  let couponId: string | null = null;
  let couponPct = 0;

  if (couponCode) {
    const [coupon] = await db
      .select()
      .from(coupons)
      .where(eq(coupons.code, couponCode.toUpperCase().trim()));
    if (!coupon) throw new OrderError("Cupom inválido.");
    if (coupon.expiresAt && coupon.expiresAt < new Date()) {
      throw new OrderError("Este cupom expirou.");
    }
    if (coupon.maxUses !== null && coupon.uses >= coupon.maxUses) {
      throw new OrderError("Este cupom atingiu o limite de usos.");
    }
    couponId = coupon.id;
    couponPct = coupon.discountPct;
    affiliateId = coupon.affiliateId ?? null;
  }

  if (!affiliateId && sessionAffiliateCode) {
    const [aff] = await db
      .select()
      .from(affiliates)
      .where(
        and(eq(affiliates.code, sessionAffiliateCode), eq(affiliates.status, "active")),
      );
    if (aff) affiliateId = aff.id;
  }

  if (affiliateId) {
    const [self] = await db
      .select({ phone: sql<string>`u.phone` })
      .from(sql`affiliates a JOIN users u ON u.id = a.user_id`)
      .where(sql`a.id = ${affiliateId}::uuid`);
    if (self?.phone && normalizePhone(self.phone) === buyerPhone) {
      affiliateId = null; // autoindicação
    }
  }

  return { affiliateId, couponId, couponPct };
}

export interface CreateOrderContext {
  sessionAffiliateCode?: string;
  /** Venda física: o cambista é o vendedor e também quem recebe comissão. */
  sellerId?: string;
}

export async function createOrder(
  input: CreateOrderInput,
  ctx: CreateOrderContext = {},
) {
  const [campaign] = await db
    .select()
    .from(campaigns)
    .where(eq(campaigns.id, input.campaignId));

  if (!campaign) throw new OrderError("Campanha não encontrada.", 404);
  if (campaign.status !== "published") {
    throw new OrderError("Esta rifa não está aberta para compra.", 409);
  }

  const wantsSpecific = Boolean(input.numbers?.length);
  const quantity = wantsSpecific ? input.numbers!.length : (input.quantity ?? 0);

  if (quantity < campaign.minPerOrder) {
    throw new OrderError(`O mínimo é ${campaign.minPerOrder} cota(s) por pedido.`);
  }
  if (quantity > campaign.maxPerOrder) {
    throw new OrderError(`O máximo é ${campaign.maxPerOrder} cotas por pedido.`);
  }

  const [stats] = await db
    .select()
    .from(campaignStats)
    .where(eq(campaignStats.campaignId, campaign.id));
  if (!stats) throw new OrderError("Campanha sem contadores. Republique-a.", 500);

  const remaining = campaign.totalQuotas - stats.soldCount - stats.reservedCount;
  if (remaining < quantity) {
    throw new OrderError(
      remaining <= 0
        ? "Esta rifa já vendeu todas as cotas."
        : `Restam apenas ${remaining} cotas.`,
      409,
    );
  }

  const buyer = await upsertBuyer(input.buyer);

  // Na venda física não há clique nem cookie: quem vendeu é quem leva.
  const attribution = ctx.sellerId
    ? { affiliateId: ctx.sellerId, couponId: null as string | null, couponPct: 0 }
    : await resolveAttribution({
        couponCode: input.couponCode,
        sessionAffiliateCode: input.affiliateCode ?? ctx.sessionAffiliateCode,
        buyerPhone: buyer.phone,
      });

  const packages = await db
    .select()
    .from(quotaPackages)
    .where(eq(quotaPackages.campaignId, campaign.id));

  const price = priceOrder({
    quantity,
    unitCents: campaign.priceCents,
    packages,
    couponPct: attribution.couponPct,
  });

  const code = await nextOrderCode();
  const expiresAt = new Date(Date.now() + campaign.reservationTtlMin * 60_000);

  const { order, numbers } = await db.transaction(async (tx) => {
    const [created] = await tx
      .insert(orders)
      .values({
        code,
        campaignId: campaign.id,
        buyerId: buyer.id,
        quantity,
        amountCents: price.totalCents,
        discountCents: price.packageDiscountCents + price.couponDiscountCents,
        status: "pending",
        affiliateId: attribution.affiliateId,
        sellerId: ctx.sellerId ?? null,
        method: ctx.sellerId ? "dinheiro" : "pix_online",
        couponId: attribution.couponId,
        expiresAt,
      })
      .returning();

    const reserved = wantsSpecific
      ? await reserveSpecific(tx, {
          campaignId: campaign.id,
          totalQuotas: campaign.totalQuotas,
          numbers: input.numbers!,
          orderId: created.id,
          reservedUntil: expiresAt,
        })
      : await reserveRandom(tx, {
          campaignId: campaign.id,
          totalQuotas: campaign.totalQuotas,
          count: quantity,
          orderId: created.id,
          reservedUntil: expiresAt,
          endgame: stats.endgame,
        });

    await bumpReserved(tx, campaign.id, reserved.numbers.length);

    if (attribution.couponId) {
      await tx
        .update(coupons)
        .set({ uses: sql`${coupons.uses} + 1` })
        .where(eq(coupons.id, attribution.couponId));
    }

    return { order: created, numbers: reserved.numbers };
  });

  // Venda física não passa por provedor: o dinheiro entra na mão do cambista.
  if (ctx.sellerId) {
    if (shouldEnterEndgame(stats, campaign.totalQuotas)) {
      await enterEndgame(campaign.id, campaign.totalQuotas);
    }
    return { order, numbers, price };
  }

  // Fora da transação: chamada externa não pode segurar linhas do banco.
  const provider = paymentProvider();
  const charge = await provider.createPixCharge({
    orderCode: order.code,
    amountCents: order.amountCents,
    description: `${campaign.title} — ${quantity} cota(s)`,
    payer: { name: buyer.name, phone: buyer.phone, cpf: buyer.cpf ?? undefined },
    expiresAt,
  });

  const [withCharge] = await db
    .update(orders)
    .set({
      pspProvider: charge.provider,
      pspChargeId: charge.chargeId,
      pixQr: charge.qr,
      pixCopyPaste: charge.copyPaste,
    })
    .where(eq(orders.id, order.id))
    .returning();

  if (shouldEnterEndgame(stats, campaign.totalQuotas)) {
    await enterEndgame(campaign.id, campaign.totalQuotas);
  }

  return { order: withCharge, numbers, price };
}

/**
 * Confirma o pagamento. Idempotente: chamar duas vezes não duplica comissão
 * nem conta a venda de novo.
 */
/**
 * Núcleo do "virou pago": move cotas, conta receita, revela cota premiada e
 * cria a comissão. Usado pelo webhook do Pix e pela confirmação do cambista —
 * duas portas, uma regra só.
 */
async function settleOrderAsPaid(order: typeof orders.$inferSelect) {
  const [campaign] = await db
    .select()
    .from(campaigns)
    .where(eq(campaigns.id, order.campaignId));

  const paidAt = new Date();

  const result = await db.transaction(async (tx) => {
    const [updated] = await tx
      .update(orders)
      .set({ status: "paid", paidAt })
      .where(and(eq(orders.id, order.id), eq(orders.status, "pending")))
      .returning();

    // Outra chamada ganhou a corrida: nada a fazer.
    if (!updated) return null;

    const numbers = await confirmPaid(tx, {
      campaignId: order.campaignId,
      orderId: order.id,
      amountCents: order.amountCents,
    });

    const prizes = numbers.length
      ? await tx
          .update(prizedQuotas)
          .set({ claimedByOrderId: order.id, claimedAt: paidAt })
          .where(
            and(
              eq(prizedQuotas.campaignId, order.campaignId),
              sql`${prizedQuotas.number} = ANY(${intArray(numbers)}::int[])`,
              sql`${prizedQuotas.claimedByOrderId} IS NULL`,
            ),
          )
          .returning({ label: prizedQuotas.prizeLabel, number: prizedQuotas.number })
      : [];

    if (order.affiliateId) {
      const [aff] = await tx
        .select()
        .from(affiliates)
        .where(eq(affiliates.id, order.affiliateId));
      const pct = aff?.commissionPct ?? campaign?.commissionPctDefault ?? 0;

      if (pct > 0) {
        await tx
          .insert(commissions)
          .values({
            affiliateId: order.affiliateId,
            orderId: order.id,
            campaignId: order.campaignId,
            amountCents: commissionCents(order.amountCents, pct),
            pct,
            status: "pending",
            availableAt: commissionAvailableAt(
              paidAt,
              REFUND_WINDOW_DAYS,
              campaign?.drawAt,
            ),
          })
          .onConflictDoNothing();
      }
    }

    return { order: updated, numbers, prizes };
  });

  if (!result) return null;

  await announcePayment({
    orderId: order.id,
    campaignTitle: campaign?.title ?? "",
    campaignTotal: campaign?.totalQuotas ?? 0,
    numbers: result.numbers,
    prizes: result.prizes,
  });

  return result;
}

export async function markOrderPaid(chargeId: string) {
  const [order] = await db
    .select()
    .from(orders)
    .where(eq(orders.pspChargeId, chargeId));

  if (!order) throw new OrderError("Pedido não encontrado para esta cobrança.", 404);
  if (order.status === "paid") return { order, alreadyPaid: true, prizes: [] as string[] };
  if (order.status !== "pending") {
    throw new OrderError(`Pedido ${order.code} está ${order.status}.`, 409);
  }

  const result = await settleOrderAsPaid(order);

  if (!result) {
    const [fresh] = await db.select().from(orders).where(eq(orders.id, order.id));
    return { order: fresh, alreadyPaid: true, prizes: [] as string[] };
  }

  return {
    order: result.order,
    alreadyPaid: false,
    prizes: result.prizes.map((p) => `${p.number} — ${p.label}`),
  };
}

/* ------------------------------------------------------------------ *
 * Venda física do cambista
 * ------------------------------------------------------------------ */

export type MetodoFisico = "dinheiro" | "cartao_maquininha" | "pix_maquininha";

/**
 * Reserva as cotas ANTES de cobrar. Cobrar o cartão e só depois tentar
 * reservar é como se perde a cota com o dinheiro já debitado.
 */
export async function createSellerSale(
  input: CreateOrderInput,
  sellerId: string,
) {
  const result = await createOrder(input, { sellerId });
  return result;
}

/** O cambista recolheu: o pedido vira pago sem passar por provedor. */
export async function confirmSellerSale(params: {
  code: number;
  sellerId: string;
  method: MetodoFisico;
  posAuthCode?: string;
  posTerminal?: string;
}) {
  const [order] = await db.select().from(orders).where(eq(orders.code, params.code));
  if (!order) throw new OrderError("Venda não encontrada.", 404);
  if (order.sellerId !== params.sellerId) {
    throw new OrderError("Esta venda é de outro cambista.", 403);
  }
  if (order.status === "paid") {
    return { order, alreadyPaid: true, prizes: [] as string[] };
  }
  if (order.status !== "pending") {
    throw new OrderError(`Esta venda está ${order.status}.`, 409);
  }

  await db
    .update(orders)
    .set({
      method: params.method,
      posAuthCode: params.posAuthCode ?? null,
      posTerminal: params.posTerminal ?? null,
    })
    .where(eq(orders.id, order.id));

  const atualizado = { ...order, method: params.method };
  const result = await settleOrderAsPaid(atualizado);

  if (!result) {
    const [fresh] = await db.select().from(orders).where(eq(orders.id, order.id));
    return { order: fresh, alreadyPaid: true, prizes: [] as string[] };
  }

  return {
    order: result.order,
    alreadyPaid: false,
    prizes: result.prizes.map((p) => `${p.number} — ${p.label}`),
  };
}

/** Cartão recusado ou cliente desistiu: devolve as cotas na hora. */
export async function cancelSellerSale(params: { code: number; sellerId: string }) {
  const [order] = await db.select().from(orders).where(eq(orders.code, params.code));
  if (!order) throw new OrderError("Venda não encontrada.", 404);
  if (order.sellerId !== params.sellerId) {
    throw new OrderError("Esta venda é de outro cambista.", 403);
  }
  if (order.status !== "pending") {
    throw new OrderError("Só dá para cancelar venda ainda não paga.", 409);
  }

  await db.transaction(async (tx) => {
    const devolvidas = await tx
      .delete(quotaAlloc)
      .where(eq(quotaAlloc.orderId, order.id))
      .returning({ number: quotaAlloc.number });

    await tx
      .update(campaignStats)
      .set({
        reservedCount: sql`greatest(0, ${campaignStats.reservedCount} - ${devolvidas.length})`,
        updatedAt: new Date(),
      })
      .where(eq(campaignStats.campaignId, order.campaignId));

    await tx.update(orders).set({ status: "expired" }).where(eq(orders.id, order.id));
  });

  return { canceled: order.code };
}

/** Confirmação para o comprador, prêmio revelado e aviso ao afiliado. */
async function announcePayment(params: {
  orderId: string;
  campaignTitle: string;
  campaignTotal: number;
  numbers: number[];
  prizes: { number: number; label: string }[];
}) {
  const [row] = await db
    .select({ order: orders, buyer: buyers })
    .from(orders)
    .innerJoin(buyers, eq(buyers.id, orders.buyerId))
    .where(eq(orders.id, params.orderId));
  if (!row) return;

  const shown = params.numbers
    .slice(0, 10)
    .map((n) => formatQuota(n, params.campaignTotal))
    .join(", ");
  const numeros =
    params.numbers.length > 10 ? `${shown} e mais ${params.numbers.length - 10}` : shown;

  await notify({
    to: row.buyer.phone,
    template: "pagamento_confirmado",
    params: {
      nome: row.buyer.name.split(" ")[0],
      rifa: params.campaignTitle,
      quantidade: String(params.numbers.length),
      numeros,
      link: publicUrl(`/pedido/${row.order.code}`),
    },
    dedupeKey: `order:${row.order.id}:pagamento_confirmado`,
  });

  for (const prize of params.prizes) {
    await notify({
      to: row.buyer.phone,
      template: "cota_premiada",
      params: {
        nome: row.buyer.name.split(" ")[0],
        premio: prize.label,
        numero: formatQuota(prize.number, params.campaignTotal),
      },
      dedupeKey: `order:${row.order.id}:premio:${prize.number}`,
    });
  }

  if (row.order.affiliateId) {
    const [aff] = await db
      .select({ phone: users.phone, name: users.name })
      .from(affiliates)
      .innerJoin(users, eq(users.id, affiliates.userId))
      .where(eq(affiliates.id, row.order.affiliateId));

    const [commission] = await db
      .select()
      .from(commissions)
      .where(eq(commissions.orderId, row.order.id));

    if (aff?.phone && commission) {
      await notify({
        to: aff.phone,
        template: "venda_afiliado",
        params: {
          nome: aff.name.split(" ")[0],
          valor: formatBRL(row.order.amountCents),
          comissao: formatBRL(commission.amountCents),
          rifa: params.campaignTitle,
        },
        dedupeKey: `order:${row.order.id}:venda_afiliado`,
      });
    }
  }
}

export async function orderByCode(code: number) {
  const [row] = await db
    .select({ order: orders, campaign: campaigns, buyer: buyers })
    .from(orders)
    .innerJoin(campaigns, eq(campaigns.id, orders.campaignId))
    .innerJoin(buyers, eq(buyers.id, orders.buyerId))
    .where(eq(orders.code, code));
  if (!row) return null;

  const numbers = await db
    .select({ number: quotaAlloc.number })
    .from(quotaAlloc)
    .where(eq(quotaAlloc.orderId, row.order.id))
    .orderBy(quotaAlloc.number);

  const prizes = await db
    .select({ number: prizedQuotas.number, label: prizedQuotas.prizeLabel })
    .from(prizedQuotas)
    .where(eq(prizedQuotas.claimedByOrderId, row.order.id));

  return { ...row, numbers: numbers.map((n) => n.number), prizes };
}

/** "Minhas cotas": tudo que um telefone comprou, sem senha. */
export async function ordersByPhone(phone: string) {
  const digits = normalizePhone(phone);
  return db
    .select({
      order: orders,
      campaign: { title: campaigns.title, slug: campaigns.slug, totalQuotas: campaigns.totalQuotas },
      numbers: sql<number[]>`coalesce(array_agg(${quotaAlloc.number} ORDER BY ${quotaAlloc.number})
        FILTER (WHERE ${quotaAlloc.number} IS NOT NULL), '{}')`,
    })
    .from(orders)
    .innerJoin(buyers, eq(buyers.id, orders.buyerId))
    .innerJoin(campaigns, eq(campaigns.id, orders.campaignId))
    .leftJoin(quotaAlloc, eq(quotaAlloc.orderId, orders.id))
    .where(eq(buyers.phone, digits))
    .groupBy(orders.id, campaigns.title, campaigns.slug, campaigns.totalQuotas)
    .orderBy(desc(orders.createdAt));
}
