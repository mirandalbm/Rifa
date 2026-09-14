import { Router } from "express";
import { eq, and, sql, desc } from "drizzle-orm";
import { db } from "../db";
import {
  affiliates,
  commissions,
  payouts,
  orders,
  campaigns,
  buyers,
  clickEvents,
  coupons,
} from "@shared/schema";
import QRCode from "qrcode";
import { affiliateId } from "../auth";
import { formatBRL } from "@shared/format";

export const affiliateRouter = Router();

/** Painel: cliques, conversão, receita gerada e comissão, em uma chamada. */
affiliateRouter.get("/overview", async (req, res, next) => {
  try {
    const id = affiliateId(req);

    const [aff] = await db.select().from(affiliates).where(eq(affiliates.id, id));

    const [clicks] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(clickEvents)
      .where(eq(clickEvents.affiliateId, id));

    const [sales] = await db
      .select({
        orders: sql<number>`count(*)::int`,
        revenueCents: sql<number>`coalesce(sum(${orders.amountCents}), 0)::int`,
      })
      .from(orders)
      .where(and(eq(orders.affiliateId, id), eq(orders.status, "paid")));

    const balance = await db
      .select({
        status: commissions.status,
        total: sql<number>`coalesce(sum(${commissions.amountCents}), 0)::int`,
      })
      .from(commissions)
      .where(eq(commissions.affiliateId, id))
      .groupBy(commissions.status);

    const byStatus = Object.fromEntries(balance.map((b) => [b.status, b.total]));

    const daily = await db.execute(sql`
      SELECT date_trunc('day', o.paid_at) AS day, count(*)::int AS sales
      FROM orders o
      WHERE o.affiliate_id = ${id}::uuid
        AND o.status = 'paid'
        AND o.paid_at > now() - interval '14 days'
      GROUP BY 1 ORDER BY 1
    `);

    const conversion = clicks.n > 0 ? sales.orders / clicks.n : 0;

    res.json({
      affiliate: {
        code: aff.code,
        pixKey: aff.pixKey,
        commissionPct: aff.commissionPct,
        status: aff.status,
      },
      clicks: clicks.n,
      sales: sales.orders,
      conversion,
      revenueCents: sales.revenueCents,
      commission: {
        pendingCents: byStatus.pending ?? 0,
        availableCents: byStatus.available ?? 0,
        paidCents: byStatus.paid ?? 0,
        reversedCents: byStatus.reversed ?? 0,
      },
      daily: daily.rows,
    });
  } catch (err) {
    next(err);
  }
});

/** Extrato por pedido: pendente, liberada, paga, estornada. */
affiliateRouter.get("/commissions", async (req, res, next) => {
  try {
    const id = affiliateId(req);
    const rows = await db
      .select({
        id: commissions.id,
        amountCents: commissions.amountCents,
        pct: commissions.pct,
        status: commissions.status,
        availableAt: commissions.availableAt,
        createdAt: commissions.createdAt,
        orderCode: orders.code,
        orderAmountCents: orders.amountCents,
        quantity: orders.quantity,
        buyerName: buyers.name,
        campaignTitle: campaigns.title,
      })
      .from(commissions)
      .innerJoin(orders, eq(orders.id, commissions.orderId))
      .innerJoin(buyers, eq(buyers.id, orders.buyerId))
      .innerJoin(campaigns, eq(campaigns.id, commissions.campaignId))
      .where(eq(commissions.affiliateId, id))
      .orderBy(desc(commissions.createdAt))
      .limit(200);

    res.json(rows);
  } catch (err) {
    next(err);
  }
});

/**
 * Kit de divulgação: link, QR pronto para o story e textos que o afiliado
 * só precisa copiar. Sem isso, cada um inventa a própria mensagem — e a pior
 * delas vira a cara da campanha.
 */
affiliateRouter.get("/links", async (req, res, next) => {
  try {
    const id = affiliateId(req);
    const [aff] = await db.select().from(affiliates).where(eq(affiliates.id, id));

    const live = await db
      .select({
        id: campaigns.id,
        slug: campaigns.slug,
        title: campaigns.title,
        prizeTitle: campaigns.prizeTitle,
        priceCents: campaigns.priceCents,
        drawAt: campaigns.drawAt,
        commissionPctDefault: campaigns.commissionPctDefault,
      })
      .from(campaigns)
      .where(eq(campaigns.status, "published"));

    const myCoupons = await db
      .select()
      .from(coupons)
      .where(eq(coupons.affiliateId, id));

    const base = publicBaseUrl(req);

    const result = await Promise.all(
      live.map(async (c) => {
        const url = `${base}/r/${c.slug}?ref=${aff.code}`;
        const coupon = myCoupons.find((k) => !k.campaignId || k.campaignId === c.id);
        const price = formatBRL(c.priceCents);
        const draw = c.drawAt
          ? new Date(c.drawAt).toLocaleDateString("pt-BR")
          : "em breve";

        return {
          slug: c.slug,
          title: c.title,
          pct: aff.commissionPct ?? c.commissionPctDefault,
          url,
          qr: await QRCode.toDataURL(url, { margin: 1, width: 320 }),
          coupon: coupon
            ? { code: coupon.code, discountPct: coupon.discountPct }
            : null,
          texts: [
            `🎟️ ${c.prizeTitle} está sendo rifado! Cota a partir de ${price}. Sorteio ${draw} pela Loteria Federal. Garanta o seu: ${url}`,
            `Tô participando da rifa do ${c.prizeTitle} 👀 cota ${price} e o pagamento é na hora pelo Pix. Entra comigo: ${url}`,
            coupon
              ? `Use o cupom ${coupon.code} e ganhe ${coupon.discountPct}% de desconto na rifa do ${c.prizeTitle}: ${url}`
              : `Últimas cotas da rifa do ${c.prizeTitle}! Sorteio ${draw}. ${url}`,
          ],
        };
      }),
    );

    res.json(result);
  } catch (err) {
    next(err);
  }
});

/** Cupons do afiliado — criados pelo administrador, exibidos aqui. */
affiliateRouter.get("/coupons", async (req, res, next) => {
  try {
    const id = affiliateId(req);
    res.json(await db.select().from(coupons).where(eq(coupons.affiliateId, id)));
  } catch (err) {
    next(err);
  }
});

/** O link precisa levar ao domínio pelo qual a pessoa está acessando. */
function publicBaseUrl(req: { protocol: string; get(name: string): string | undefined }): string {
  if (process.env.PUBLIC_BASE_URL) return process.env.PUBLIC_BASE_URL.replace(/\/+$/, "");
  const host = req.get("host") ?? "localhost";
  return `${req.protocol}://${host}`;
}

affiliateRouter.patch("/pix-key", async (req, res, next) => {
  try {
    const id = affiliateId(req);
    const pixKey = String(req.body?.pixKey ?? "").trim();
    if (pixKey.length < 5) return res.status(400).json({ message: "Chave Pix inválida." });

    await db.update(affiliates).set({ pixKey }).where(eq(affiliates.id, id));
    res.json({ pixKey });
  } catch (err) {
    next(err);
  }
});

/** Saque: só o que já passou da carência entra no lote. */
affiliateRouter.post("/payouts", async (req, res, next) => {
  try {
    const id = affiliateId(req);
    const [aff] = await db.select().from(affiliates).where(eq(affiliates.id, id));
    if (!aff.pixKey) {
      return res.status(400).json({ message: "Cadastre sua chave Pix antes de sacar." });
    }

    const payout = await db.transaction(async (tx) => {
      const available = await tx
        .select({ id: commissions.id, amountCents: commissions.amountCents })
        .from(commissions)
        .where(
          and(eq(commissions.affiliateId, id), eq(commissions.status, "available")),
        );

      const totalCents = available.reduce((sum, c) => sum + c.amountCents, 0);
      if (totalCents <= 0) {
        return null;
      }

      const [created] = await tx
        .insert(payouts)
        .values({ affiliateId: id, amountCents: totalCents, pixKey: aff.pixKey! })
        .returning();

      await tx
        .update(commissions)
        .set({ status: "paid", payoutId: created.id })
        .where(
          and(eq(commissions.affiliateId, id), eq(commissions.status, "available")),
        );

      return created;
    });

    if (!payout) {
      return res.status(400).json({ message: "Nenhuma comissão liberada para saque." });
    }
    res.status(201).json(payout);
  } catch (err) {
    next(err);
  }
});

affiliateRouter.get("/payouts", async (req, res, next) => {
  try {
    const id = affiliateId(req);
    res.json(
      await db
        .select()
        .from(payouts)
        .where(eq(payouts.affiliateId, id))
        .orderBy(desc(payouts.requestedAt)),
    );
  } catch (err) {
    next(err);
  }
});
