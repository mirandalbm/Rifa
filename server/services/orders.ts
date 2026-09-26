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
  draws,
  platformCharges,
  type CreateOrderInput,
} from "@shared/schema";
import {
  priceOrder,
  commissionAvailableAt,
  splitOrder,
} from "@shared/pricing";
import { platformPctFor, FREE_PLAN } from "@shared/billing";
import { lancarTaxaDaVenda, planOfOrganization } from "./billing";
import { normalizePhone } from "@shared/format";
import { users, organizations } from "@shared/schema";
import {
  EXIGE_CPF,
  comissaoInicial,
  percentualDoPromotor,
  type ProvedorPix,
} from "@shared/plataforma";
import {
  intArray,
  reserveRandom,
  reserveSpecific,
  bumpReserved,
  confirmPaid,
  shouldEnterEndgame,
  enterEndgame,
  releasePaidQuotas,
} from "./quotas";
import { activePaymentProvider } from "../payments";
import { getPaymentMethods } from "./settings";
import { guardOrder, type RequestIdentity } from "./antifraude";
import { enabledPhysical, labelFor } from "@shared/payments";
import { notify } from "../notifications";
import { publicUrl } from "./urls";
import { formatBRL, formatQuota, cpfValido } from "@shared/format";
import { isUniqueViolation } from "../pgError";

/** Dias entre o pagamento e a liberação da comissão do afiliado. */
export const REFUND_WINDOW_DAYS = Number(process.env.REFUND_WINDOW_DAYS ?? 7);

export class OrderError extends Error {
  constructor(message: string, readonly status = 400) {
    super(message);
    this.name = "OrderError";
  }
}

/**
 * Código do pedido: o número que o comprador lê no WhatsApp e digita para
 * acompanhar a compra.
 *
 * Duas decisões moram aqui.
 *
 * **É sorteado, não sequencial.** A consulta do pedido é pública e devolve o
 * nome de quem comprou; com código sequencial, qualquer um enumeraria a
 * carteira de clientes da rifa — e ainda leria o volume de vendas do dia pela
 * diferença entre dois códigos.
 *
 * **Quem decide a colisão é o índice único, não uma consulta anterior.** A
 * versão antiga fazia `SELECT` e depois `INSERT`, o mesmo erro que a
 * invariante 1 proíbe para cota. O teste de carga achou o buraco na primeira
 * rodada: dois pedidos simultâneos sortearam o mesmo número entre a consulta
 * e a gravação, e um comprador levou erro 500.
 *
 * A faixa é de oito dígitos porque a de seis (990 mil) era um teto de
 * verdade: a plataforma roda várias rifas de até 1.000.000 de cotas, e o
 * número de *pedidos* ao longo da vida dela passa folgado de um milhão. Com
 * a faixa antiga, a rifa simplesmente pararia de emitir pedido. Oito dígitos
 * dão 90 milhões de códigos: com 1 milhão de pedidos gravados, a chance de
 * um sorteio colidir é de 1%, e a de esgotar as repetições abaixo de
 * 1 em 10^20.
 */
const ORDER_CODE_MIN = 10_000_000;
const ORDER_CODE_MAX = 100_000_000;

function randomOrderCode(): number {
  return randomInt(ORDER_CODE_MIN, ORDER_CODE_MAX);
}

/** Colisão no código do pedido — não confundir com colisão de cota. */
function isOrderCodeConflict(err: unknown): boolean {
  return isUniqueViolation(err, "uq_orders_code");
}

/** Quantas vezes sorteamos de novo antes de desistir. */
const ORDER_CODE_RETRIES = 10;

async function upsertBuyer(input: CreateOrderInput["buyer"]) {
  const phone = normalizePhone(input.phone);
  if (phone.length < 10) throw new OrderError("Telefone inválido.");

  const [existing] = await db.select().from(buyers).where(eq(buyers.phone, phone));
  if (existing) {
    // O CPF entra quando faltava (o Asaas passou a pedir), mas não troca o
    // que já estava gravado: o CPF do comprador não muda de pedido para pedido.
    const cpf = existing.cpf ?? input.cpf ?? null;
    if (existing.name !== input.name || cpf !== existing.cpf) {
      await db.update(buyers).set({ name: input.name, cpf }).where(eq(buyers.id, existing.id));
    }
    return { ...existing, name: input.name, cpf };
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
  /** IP e aparelho já em hash, para o antifraude. */
  identity?: RequestIdentity;
}

export class FraudBlockedError extends OrderError {
  constructor(message: string, readonly rule?: string) {
    super(message, 429);
    this.name = "FraudBlockedError";
  }
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

  // O administrador decide os meios aceitos; a checagem é aqui, não na tela.
  const meios = await getPaymentMethods();
  if (ctx.sellerId) {
    if (enabledPhysical(meios).length === 0) {
      throw new OrderError(
        "A venda na mão está desligada pela administração.",
        409,
      );
    }
  } else if (!meios.pix_online) {
    throw new OrderError(
      "Esta rifa está vendendo apenas com os cambistas no momento.",
      409,
    );
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

  // O provedor em uso decide se o CPF é obrigatório (o Asaas só cobra
  // cliente com CPF). Conferido antes de reservar: descobrir na hora do Pix
  // deixaria cotas presas numa reserva que nunca vai ser paga.
  const provider = ctx.sellerId ? null : await activePaymentProvider();
  if (provider && EXIGE_CPF[provider.name as ProvedorPix]) {
    if (!cpfValido(input.buyer.cpf ?? "")) {
      throw new OrderError("Informe um CPF válido de quem está comprando: ele é exigido para gerar o Pix.", 400);
    }
  }

  // O antifraude entra antes de qualquer linha ser escrita: pedido recusado
  // não pode nem criar o comprador.
  const identity = ctx.identity ?? { ipHash: null, deviceHash: null };
  const veredito = await guardOrder({
    phone: input.buyer.phone,
    identity,
    campaignId: campaign.id,
    quantity,
    bySeller: Boolean(ctx.sellerId),
    affiliateCode: input.affiliateCode ?? ctx.sessionAffiliateCode,
  });
  if (!veredito.allowed) {
    throw new FraudBlockedError(veredito.reason ?? "Compra recusada.", veredito.rule);
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

  const expiresAt = new Date(Date.now() + campaign.reservationTtlMin * 60_000);

  // A transação inteira é a unidade de repetição: se o código colidir, o
  // banco desfaz também a reserva de cota, e a próxima volta sorteia outro.
  // Pedido sem cota seria fantasma; cota sem pedido, cota perdida.
  const criarPedido = (code: number) =>
    db.transaction(async (tx) => {
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
          deviceHash: identity.deviceHash,
          ipHash: identity.ipHash,
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

  let criado: Awaited<ReturnType<typeof criarPedido>> | undefined;
  for (let tentativa = 0; tentativa < ORDER_CODE_RETRIES; tentativa++) {
    try {
      criado = await criarPedido(randomOrderCode());
      break;
    } catch (err) {
      if (!isOrderCodeConflict(err)) throw err;
    }
  }
  if (!criado) {
    throw new OrderError("Não foi possível gerar o número do pedido.", 500);
  }
  const { order, numbers } = criado;

  // Venda física não passa por provedor: o dinheiro entra na mão do cambista.
  if (ctx.sellerId) {
    if (shouldEnterEndgame(stats, campaign.totalQuotas)) {
      await enterEndgame(campaign.id, campaign.totalQuotas);
    }
    return { order, numbers, price };
  }

  // Fora da transação: chamada externa não pode segurar linhas do banco.
  // Se o provedor recusar (CPF rejeitado, fora do ar), as cotas voltam na
  // hora em vez de ficarem presas até a reserva vencer.
  let charge: Awaited<ReturnType<NonNullable<typeof provider>["createPixCharge"]>>;
  try {
    charge = await provider!.createPixCharge({
    orderCode: order.code,
    amountCents: order.amountCents,
    description: `${campaign.title} — ${quantity} cota(s)`,
    payer: {
      name: buyer.name,
      phone: buyer.phone,
      cpf: buyer.cpf ?? input.buyer.cpf ?? undefined,
    },
    expiresAt,
    split: await splitDaOrganizacao(campaign.organizationId),
    });
  } catch (err) {
    await devolverReserva(order.id).catch((e) =>
      console.error(`[pedidos] não devolveu a reserva do pedido ${order.code}:`, e),
    );
    // O detalhe do provedor vai para o log; o comprador lê o que fazer.
    console.error(`[pedidos] Pix do pedido ${order.code} recusado:`, (err as Error).message);
    if ((err as { status?: number }).status === 400) {
      throw new OrderError((err as Error).message, 400);
    }
    throw new OrderError("Não foi possível gerar o Pix agora. Tente de novo em instantes.", 502);
  }

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
 * O split do Asaas: com carteira cadastrada, a parte do promotor (tudo menos
 * a taxa da plataforma, em percentual sobre o líquido) cai direto na conta da
 * organização. Sem carteira, nada é dividido na origem.
 */
async function splitDaOrganizacao(organizationId: string) {
  const [org] = await db
    .select({ walletId: organizations.asaasWalletId })
    .from(organizations)
    .where(eq(organizations.id, organizationId));
  if (!org?.walletId) return undefined;
  const plano = await planOfOrganization(organizationId);
  return [{ walletId: org.walletId, percentual: percentualDoPromotor(platformPctFor(plano)) }];
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

  // O contrato da organização é lido antes da transação: a consulta não
  // muda nada e mantém o BEGIN curto.
  const plano = campaign
    ? await planOfOrganization(campaign.organizationId)
    : FREE_PLAN;
  const [org] = campaign
    ? await db
        .select({ liberacao: organizations.liberacaoComissao })
        .from(organizations)
        .where(eq(organizations.id, campaign.organizationId))
    : [];
  const liberacao = org?.liberacao ?? "apos_sorteio";

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

    // O rateio da venda, na ordem que não se negocia: a plataforma sai
    // antes, e a comissão incide sobre o que sobrou. Ver `splitOrder()`.
    const [aff] = order.affiliateId
      ? await tx.select().from(affiliates).where(eq(affiliates.id, order.affiliateId))
      : [undefined];

    const rateio = splitOrder({
      paidCents: order.amountCents,
      platformPct: platformPctFor(plano),
      commissionPct: order.affiliateId
        ? (aff?.commissionPct ?? campaign?.commissionPctDefault ?? 0)
        : 0,
    });

    if (rateio.platformFeeCents > 0 && campaign) {
      await lancarTaxaDaVenda(tx, {
        organizationId: campaign.organizationId,
        orderId: order.id,
        amountCents: rateio.platformFeeCents,
        pct: rateio.platformPct,
      });
    }

    if (order.affiliateId && rateio.commissionCents > 0) {
      await tx
        .insert(commissions)
        .values({
          affiliateId: order.affiliateId,
          orderId: order.id,
          campaignId: order.campaignId,
          amountCents: rateio.commissionCents,
          pct: rateio.commissionPct,
          // Depois do sorteio (padrão, com carência) ou na hora — escolha da
          // organização. Ver `comissaoInicial()`.
          ...comissaoInicial(
            liberacao,
            paidAt,
            commissionAvailableAt(paidAt, REFUND_WINDOW_DAYS, campaign?.drawAt),
          ),
        })
        .onConflictDoNothing();
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
  identity?: RequestIdentity,
) {
  return createOrder(input, { sellerId, identity });
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

  const meios = await getPaymentMethods();
  if (!meios[params.method]) {
    throw new OrderError(
      `${labelFor(params.method)} está desligado pela administração.`,
      409,
    );
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

  await devolverReserva(order.id);
  return { canceled: order.code };
}

/**
 * Devolve na hora as cotas de um pedido que não vai ser pago: venda física
 * cancelada ou Pix que o provedor recusou gerar. Sem isto, os números ficariam
 * presos até a reserva vencer.
 *
 * O pedido é marcado primeiro, num `UPDATE` condicional: se o pagamento
 * chegou no meio, nada é devolvido. E em endgame o número volta para o
 * `free_pool` — é a invariante 3 ao contrário; sem isso ele some do estoque.
 */
export async function devolverReserva(orderId: string): Promise<number> {
  return db.transaction(async (tx) => {
    const [pedido] = await tx
      .update(orders)
      .set({ status: "expired" })
      .where(and(eq(orders.id, orderId), eq(orders.status, "pending")))
      .returning({ campaignId: orders.campaignId });
    if (!pedido) return 0;

    const devolvidas = await tx
      .delete(quotaAlloc)
      .where(and(eq(quotaAlloc.orderId, orderId), eq(quotaAlloc.status, "reserved")))
      .returning({ number: quotaAlloc.number });
    if (devolvidas.length === 0) return 0;

    const [stats] = await tx
      .update(campaignStats)
      .set({
        reservedCount: sql`greatest(0, ${campaignStats.reservedCount} - ${devolvidas.length})`,
        updatedAt: new Date(),
      })
      .where(eq(campaignStats.campaignId, pedido.campaignId))
      .returning({ endgame: campaignStats.endgame });

    if (stats?.endgame) {
      await tx.execute(sql`
        INSERT INTO free_pool (campaign_id, number)
        SELECT ${pedido.campaignId}::uuid, n
          FROM unnest(${intArray(devolvidas.map((d) => d.number))}::int[]) AS n
        ON CONFLICT DO NOTHING
      `);
    }
    return devolvidas.length;
  });
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
      campaign: {
        title: campaigns.title,
        slug: campaigns.slug,
        totalQuotas: campaigns.totalQuotas,
        status: campaigns.status,
      },
      numbers: sql<number[]>`coalesce(array_agg(${quotaAlloc.number} ORDER BY ${quotaAlloc.number})
        FILTER (WHERE ${quotaAlloc.number} IS NOT NULL), '{}')`,
    })
    .from(orders)
    .innerJoin(buyers, eq(buyers.id, orders.buyerId))
    .innerJoin(campaigns, eq(campaigns.id, orders.campaignId))
    .leftJoin(quotaAlloc, eq(quotaAlloc.orderId, orders.id))
    .where(eq(buyers.phone, digits))
    .groupBy(orders.id, campaigns.title, campaigns.slug, campaigns.totalQuotas, campaigns.status)
    .orderBy(desc(orders.createdAt));
}

/* ------------------------------------------------------------------ *
 * Estorno
 * ------------------------------------------------------------------ */

export interface RefundResult {
  order: typeof orders.$inferSelect;
  /** Números devolvidos ao estoque. Vazio quando a rifa já foi sorteada. */
  liberadas: number[];
  /** Comissões revertidas. */
  comissoes: number;
  /**
   * Comissão que **já tinha sido paga** ao afiliado quando o estorno chegou.
   * Revertida na conta, mas o dinheiro já saiu: vira cobrança a fazer, e por
   * isso volta daqui em vez de sumir calada.
   */
  comissaoJaPagaCents: number;
  /** Taxa da plataforma cancelada. */
  taxaCanceladaCents: number;
  /** Cotas premiadas que voltaram a valer. */
  premiadasLiberadas: number;
}

/**
 * Estorna um pedido pago.
 *
 * Desfaz tudo que o pagamento criou, na mesma transação e na ordem inversa:
 * devolve as cotas ao estoque, reverte a comissão, cancela a taxa da
 * plataforma e solta a cota premiada que aquele pedido tinha reclamado.
 *
 * **A cota só volta ao estoque se a rifa ainda não foi sorteada.** Depois do
 * sorteio o número está congelado: quem conferir o resultado precisa
 * encontrar exatamente o quadro que existia quando o número saiu, e devolver
 * uma cota mudaria esse quadro. Nesse caso o estorno vira só dinheiro — o
 * pedido fica `refunded`, as contas são desfeitas, e a cota permanece onde
 * estava.
 *
 * Idempotente: só age sobre pedido `paid`, e o `UPDATE` condicional garante
 * que duas chamadas simultâneas não dupliquem nada.
 */
export async function refundOrder(orderId: string): Promise<RefundResult | null> {
  const [order] = await db.select().from(orders).where(eq(orders.id, orderId));
  if (!order) throw new OrderError("Pedido não encontrado.", 404);
  if (order.status !== "paid") {
    // Já estornado, ou nunca pago: nada a desfazer.
    return null;
  }

  const [campaign] = await db
    .select()
    .from(campaigns)
    .where(eq(campaigns.id, order.campaignId));

  // O sorteio congela o quadro. Basta ter sido executado uma vez.
  const [draw] = await db
    .select({ executedAt: draws.executedAt })
    .from(draws)
    .where(eq(draws.campaignId, order.campaignId));
  const jaSorteada = Boolean(draw?.executedAt);

  return db.transaction(async (tx) => {
    const [atualizado] = await tx
      .update(orders)
      .set({ status: "refunded" })
      .where(and(eq(orders.id, order.id), eq(orders.status, "paid")))
      .returning();

    // Outra chamada ganhou a corrida.
    if (!atualizado) return null;

    const liberadas = jaSorteada
      ? []
      : await releasePaidQuotas(tx, {
          campaignId: order.campaignId,
          orderId: order.id,
          amountCents: order.amountCents,
        });

    // A cota premiada que este pedido reclamou volta a valer — o prêmio não
    // foi pago por quem estornou.
    const premiadas = jaSorteada
      ? []
      : await tx
          .update(prizedQuotas)
          .set({ claimedByOrderId: null, claimedAt: null })
          .where(eq(prizedQuotas.claimedByOrderId, order.id))
          .returning({ id: prizedQuotas.id });

    const revertidas = await tx
      .update(commissions)
      .set({ status: "reversed" })
      .where(
        and(eq(commissions.orderId, order.id), sql`${commissions.status} <> 'reversed'`),
      )
      .returning({ amountCents: commissions.amountCents, status: commissions.status });

    // O que já tinha virado saque pago não volta sozinho: a carência existe
    // para isso não acontecer, mas estorno tardio acontece.
    const jaPaga = revertidas
      .filter((c) => c.status === "paid")
      .reduce((soma, c) => soma + c.amountCents, 0);

    const taxas = await tx
      .update(platformCharges)
      .set({ status: "cancelada" })
      .where(
        and(
          eq(platformCharges.orderId, order.id),
          sql`${platformCharges.status} <> 'cancelada'`,
        ),
      )
      .returning({ amountCents: platformCharges.amountCents });

    return {
      order: atualizado,
      liberadas,
      comissoes: revertidas.length,
      comissaoJaPagaCents: jaPaga,
      taxaCanceladaCents: taxas.reduce((soma, t) => soma + t.amountCents, 0),
      premiadasLiberadas: premiadas.length,
    };
  }).then(async (r) => {
    if (r) await anunciarEstorno(r.order, campaign?.title ?? "", r.liberadas.length);
    return r;
  });
}

/**
 * Avisa o comprador do estorno.
 *
 * Fora da transação e com falha engolida, pela mesma regra do pagamento:
 * mensagem que não sai não pode desfazer o estorno que já aconteceu no banco.
 */
async function anunciarEstorno(
  order: typeof orders.$inferSelect,
  campanha: string,
  liberadas: number,
) {
  try {
    const [comprador] = await db.select().from(buyers).where(eq(buyers.id, order.buyerId));
    if (!comprador?.phone) return;

    const nome = comprador.name.split(" ")[0] ?? comprador.name;
    const valor = formatBRL(order.amountCents);

    // Nada liberado significa rifa já sorteada: dizer que as cotas voltaram
    // seria mentira, e o comprador iria procurar números que continuam lá.
    await notify({
      to: comprador.phone,
      ...(liberadas === 0
        ? {
            template: "estorno_pos_sorteio" as const,
            params: { nome, rifa: campanha, valor },
          }
        : {
            template: "estorno_confirmado" as const,
            params: { nome, rifa: campanha, valor, quantidade: String(liberadas) },
          }),
      dedupeKey: `estorno:${order.id}`,
    });
  } catch (err) {
    console.error("[estorno] aviso não enviado:", err);
  }
}

/** Estorno vindo do provedor, achado pela cobrança. */
export async function refundByChargeId(chargeId: string) {
  const [order] = await db.select().from(orders).where(eq(orders.pspChargeId, chargeId));
  if (!order) throw new OrderError("Pedido não encontrado para esta cobrança.", 404);
  return refundOrder(order.id);
}
