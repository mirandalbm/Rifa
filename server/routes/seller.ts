import { Router } from "express";
import { eq, and, desc, sql } from "drizzle-orm";
import { db } from "../db";
import { orders, buyers, campaigns, affiliates, createOrderSchema } from "@shared/schema";
import { affiliateId } from "../auth";
import {
  createSellerSale,
  confirmSellerSale,
  cancelSellerSale,
  OrderError,
  type MetodoFisico,
} from "../services/orders";
import { NumbersTakenError, NoQuotasAvailableError } from "../services/quotas";
import { openBalance, listSettlements } from "../services/settlements";
import { buildTicket } from "../services/ticket";
import { getPaymentMethods } from "../services/settings";
import { enabledPhysical } from "@shared/payments";

export const sellerRouter = Router();

const METODOS: MetodoFisico[] = ["dinheiro", "cartao_maquininha", "pix_maquininha"];

/** Tela de abrir o dia: o que dá para vender e quanto eu devo. */
sellerRouter.get("/overview", async (req, res, next) => {
  try {
    const id = affiliateId(req);
    const [seller] = await db.select().from(affiliates).where(eq(affiliates.id, id));

    const live = await db
      .select({
        id: campaigns.id,
        slug: campaigns.slug,
        title: campaigns.title,
        prizeTitle: campaigns.prizeTitle,
        priceCents: campaigns.priceCents,
        minPerOrder: campaigns.minPerOrder,
        maxPerOrder: campaigns.maxPerOrder,
        totalQuotas: campaigns.totalQuotas,
        drawAt: campaigns.drawAt,
        commissionPctDefault: campaigns.commissionPctDefault,
      })
      .from(campaigns)
      .where(eq(campaigns.status, "published"));

    const [hoje] = await db
      .select({
        vendas: sql<number>`count(*)::int`,
        cotas: sql<number>`coalesce(sum(${orders.quantity}), 0)::int`,
        totalCents: sql<number>`coalesce(sum(${orders.amountCents}), 0)::int`,
      })
      .from(orders)
      .where(
        and(
          eq(orders.sellerId, id),
          eq(orders.status, "paid"),
          sql`${orders.paidAt} >= date_trunc('day', now())`,
        ),
      );

    res.json({
      seller: { code: seller.code, commissionPct: seller.commissionPct },
      meios: enabledPhysical(await getPaymentMethods()),
      campanhas: live.map((c) => ({
        ...c,
        pct: seller.commissionPct ?? c.commissionPctDefault,
      })),
      hoje,
      acerto: await openBalance(id),
    });
  } catch (err) {
    next(err);
  }
});

/** Passo 1: reserva as cotas e devolve o total a cobrar. */
sellerRouter.post("/sales", async (req, res, next) => {
  try {
    const id = affiliateId(req);
    const input = createOrderSchema.parse(req.body);
    const result = await createSellerSale(input, id);

    res.status(201).json({
      code: result.order.code,
      numbers: result.numbers,
      amountCents: result.order.amountCents,
      discountCents: result.order.discountCents,
      expiresAt: result.order.expiresAt,
    });
  } catch (err) {
    if (err instanceof NumbersTakenError) {
      return res.status(409).json({ message: err.message, taken: err.taken });
    }
    if (err instanceof NoQuotasAvailableError) {
      return res.status(409).json({ message: err.message });
    }
    if (err instanceof OrderError) {
      return res.status(err.status).json({ message: err.message });
    }
    next(err);
  }
});

/** Passo 2: recolheu o dinheiro (ou a maquininha aprovou). */
sellerRouter.post("/sales/:code/confirm", async (req, res, next) => {
  try {
    const id = affiliateId(req);
    const method = String(req.body?.method) as MetodoFisico;
    if (!METODOS.includes(method)) {
      return res.status(400).json({ message: "Forma de pagamento inválida." });
    }

    const result = await confirmSellerSale({
      code: Number(req.params.code),
      sellerId: id,
      method,
      posAuthCode: req.body?.posAuthCode ? String(req.body.posAuthCode) : undefined,
      posTerminal: req.body?.posTerminal ? String(req.body.posTerminal) : undefined,
    });

    res.json({
      code: result.order!.code,
      status: result.order!.status,
      prizes: result.prizes,
      ticket: await buildTicket(Number(req.params.code)),
    });
  } catch (err) {
    if (err instanceof OrderError) {
      return res.status(err.status).json({ message: err.message });
    }
    next(err);
  }
});

/** Cartão recusado ou desistência: devolve as cotas na hora. */
sellerRouter.post("/sales/:code/cancel", async (req, res, next) => {
  try {
    const id = affiliateId(req);
    res.json(await cancelSellerSale({ code: Number(req.params.code), sellerId: id }));
  } catch (err) {
    if (err instanceof OrderError) {
      return res.status(err.status).json({ message: err.message });
    }
    next(err);
  }
});

sellerRouter.get("/sales", async (req, res, next) => {
  try {
    const id = affiliateId(req);
    const rows = await db
      .select({
        code: orders.code,
        status: orders.status,
        method: orders.method,
        quantity: orders.quantity,
        amountCents: orders.amountCents,
        paidAt: orders.paidAt,
        createdAt: orders.createdAt,
        settlementId: orders.settlementId,
        buyerName: buyers.name,
        campaignTitle: campaigns.title,
      })
      .from(orders)
      .innerJoin(buyers, eq(buyers.id, orders.buyerId))
      .innerJoin(campaigns, eq(campaigns.id, orders.campaignId))
      .where(eq(orders.sellerId, id))
      .orderBy(desc(orders.createdAt))
      .limit(200);
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

sellerRouter.get("/settlement", async (req, res, next) => {
  try {
    const id = affiliateId(req);
    res.json({
      aberto: await openBalance(id),
      historico: await listSettlements(id),
    });
  } catch (err) {
    next(err);
  }
});
