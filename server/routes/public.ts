import { Router } from "express";
import { createHash } from "node:crypto";
import { eq, and, desc, sql } from "drizzle-orm";
import { db } from "../db";
import {
  campaigns,
  campaignMedia,
  campaignStats,
  quotaPackages,
  affiliates,
  clickEvents,
  buyers,
  createOrderSchema,
} from "@shared/schema";
import { normalizePhone } from "@shared/format";
import { listPublicCampaigns, campaignBySlug } from "../services/campaigns";
import { createOrder, orderByCode, ordersByPhone, OrderError } from "../services/orders";
import { blockBitmap, isTaken, BLOCK_SIZE, NumbersTakenError, NoQuotasAvailableError } from "../services/quotas";
import { issueOtp, checkOtp } from "../auth";

export const publicRouter = Router();

const AFFILIATE_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

function hash(value: string) {
  return createHash("sha256").update(value).digest("hex").slice(0, 32);
}

/* ---------------- vitrine multi-rifas ---------------- */

publicRouter.get("/campaigns", async (_req, res, next) => {
  try {
    const rows = await listPublicCampaigns();
    const banners = await db
      .select()
      .from(campaignMedia)
      .where(and(eq(campaignMedia.role, "banner"), eq(campaignMedia.status, "ready")));
    const bannerBy = new Map(banners.map((b) => [b.campaignId, b]));

    res.json(
      rows.map(({ campaign, stats }) => ({
        id: campaign.id,
        slug: campaign.slug,
        title: campaign.title,
        prizeTitle: campaign.prizeTitle,
        priceCents: campaign.priceCents,
        totalQuotas: campaign.totalQuotas,
        drawAt: campaign.drawAt,
        featured: campaign.featured,
        soldCount: stats?.soldCount ?? 0,
        banner: bannerBy.get(campaign.id)?.storageKey ?? null,
      })),
    );
  } catch (err) {
    next(err);
  }
});

/* ---------------- tela inicial da rifa ---------------- */

publicRouter.get("/campaigns/:slug", async (req, res, next) => {
  try {
    const found = await campaignBySlug(req.params.slug);
    if (!found || found.campaign.status === "draft") {
      return res.status(404).json({ message: "Rifa não encontrada." });
    }

    const packages = await db
      .select()
      .from(quotaPackages)
      .where(eq(quotaPackages.campaignId, found.campaign.id))
      .orderBy(quotaPackages.quantity);

    res.json({
      campaign: {
        id: found.campaign.id,
        slug: found.campaign.slug,
        title: found.campaign.title,
        description: found.campaign.description,
        prizeTitle: found.campaign.prizeTitle,
        totalQuotas: found.campaign.totalQuotas,
        priceCents: found.campaign.priceCents,
        minPerOrder: found.campaign.minPerOrder,
        maxPerOrder: found.campaign.maxPerOrder,
        reservationTtlMin: found.campaign.reservationTtlMin,
        drawAt: found.campaign.drawAt,
        drawSeedHash: found.campaign.drawSeedHash,
        authorizationCode: found.campaign.authorizationCode,
        status: found.campaign.status,
      },
      stats: {
        soldCount: found.stats?.soldCount ?? 0,
        reservedCount: found.stats?.reservedCount ?? 0,
      },
      media: found.media.map((m) => ({
        role: m.role,
        position: m.position,
        url: m.storageKey,
        poster: m.posterKey,
        durationS: m.durationS,
        altText: m.altText,
      })),
      packages,
      blockSize: BLOCK_SIZE,
    });
  } catch (err) {
    next(err);
  }
});

/** Ocupação de um bloco: 1.000 bits em base64, 125 bytes. */
publicRouter.get("/campaigns/:slug/blocks/:block", async (req, res, next) => {
  try {
    const found = await campaignBySlug(req.params.slug);
    if (!found) return res.status(404).json({ message: "Rifa não encontrada." });

    const block = Number(req.params.block);
    const maxBlock = Math.ceil(found.campaign.totalQuotas / BLOCK_SIZE) - 1;
    if (!Number.isInteger(block) || block < 0 || block > maxBlock) {
      return res.status(400).json({ message: "Bloco fora da faixa." });
    }

    res.json(await blockBitmap(found.campaign.id, block, found.campaign.totalQuotas));
  } catch (err) {
    next(err);
  }
});

/** Busca direta: quem já sabe o número pula o mapa inteiro. */
publicRouter.get("/campaigns/:slug/numbers/:number", async (req, res, next) => {
  try {
    const found = await campaignBySlug(req.params.slug);
    if (!found) return res.status(404).json({ message: "Rifa não encontrada." });

    const number = Number(req.params.number);
    if (!Number.isInteger(number) || number < 1 || number > found.campaign.totalQuotas) {
      return res.status(400).json({ message: "Número fora da faixa desta rifa." });
    }

    res.json({ number, taken: await isTaken(found.campaign.id, number) });
  } catch (err) {
    next(err);
  }
});

/* ---------------- atribuição do afiliado ---------------- */

/** Primeiro clique vence e dura 30 dias. Cupom no checkout sobrepõe. */
publicRouter.post("/track-click", async (req, res, next) => {
  try {
    const code = String(req.body?.ref ?? "").toUpperCase().trim();
    const slug = req.body?.slug ? String(req.body.slug) : undefined;
    if (!code) return res.status(400).json({ message: "Código ausente." });

    const [aff] = await db
      .select()
      .from(affiliates)
      .where(and(eq(affiliates.code, code), eq(affiliates.status, "active")));
    if (!aff) return res.json({ tracked: false });

    const fresh =
      !req.session.affiliateSince ||
      Date.now() - req.session.affiliateSince > AFFILIATE_WINDOW_MS;

    if (!req.session.affiliateCode || fresh) {
      req.session.affiliateCode = code;
      req.session.affiliateSince = Date.now();
    }

    let campaignId: string | undefined;
    if (slug) {
      const [c] = await db
        .select({ id: campaigns.id })
        .from(campaigns)
        .where(eq(campaigns.slug, slug));
      campaignId = c?.id;
    }

    await db.insert(clickEvents).values({
      affiliateId: aff.id,
      campaignId,
      ipHash: req.ip ? hash(req.ip) : null,
      uaHash: req.get("user-agent") ? hash(req.get("user-agent")!) : null,
    });

    res.json({ tracked: true, attributed: req.session.affiliateCode });
  } catch (err) {
    next(err);
  }
});

/* ---------------- pedido ---------------- */

publicRouter.post("/orders", async (req, res, next) => {
  try {
    const input = createOrderSchema.parse(req.body);
    const result = await createOrder(input, {
      sessionAffiliateCode: req.session.affiliateCode,
    });

    res.status(201).json({
      code: result.order.code,
      numbers: result.numbers,
      amountCents: result.order.amountCents,
      discountCents: result.order.discountCents,
      expiresAt: result.order.expiresAt,
      pix: { qr: result.order.pixQr, copyPaste: result.order.pixCopyPaste },
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

/** A tela de pagamento pergunta por aqui até o webhook chegar. */
publicRouter.get("/orders/:code", async (req, res, next) => {
  try {
    const found = await orderByCode(Number(req.params.code));
    if (!found) return res.status(404).json({ message: "Pedido não encontrado." });

    res.json({
      code: found.order.code,
      status: found.order.status,
      quantity: found.order.quantity,
      amountCents: found.order.amountCents,
      discountCents: found.order.discountCents,
      expiresAt: found.order.expiresAt,
      paidAt: found.order.paidAt,
      numbers: found.numbers,
      pix: { qr: found.order.pixQr, copyPaste: found.order.pixCopyPaste },
      campaign: {
        title: found.campaign.title,
        slug: found.campaign.slug,
        totalQuotas: found.campaign.totalQuotas,
      },
      buyer: { name: found.buyer.name },
    });
  } catch (err) {
    next(err);
  }
});

/* ---------------- minhas cotas: telefone + código ---------------- */

publicRouter.post("/my-quotas/request-code", async (req, res, next) => {
  try {
    const phone = normalizePhone(String(req.body?.phone ?? ""));
    if (phone.length < 10) return res.status(400).json({ message: "Telefone inválido." });

    const code = await issueOtp(req, phone);

    // Em produção sai por WhatsApp; em desenvolvimento volta na resposta
    // para o fluxo rodar sem integração.
    const devEcho = process.env.NODE_ENV !== "production" ? { devCode: code } : {};
    res.json({ sent: true, ...devEcho });
  } catch (err) {
    next(err);
  }
});

publicRouter.post("/my-quotas/verify", async (req, res, next) => {
  try {
    const code = String(req.body?.code ?? "").trim();
    const phone = req.session.otp?.phone;
    if (!phone) return res.status(400).json({ message: "Peça um código novo." });

    if (!(await checkOtp(req, code))) {
      return res.status(401).json({ message: "Código incorreto ou expirado." });
    }

    const [buyer] = await db.select().from(buyers).where(eq(buyers.phone, phone));
    req.session.buyer = buyer
      ? { id: buyer.id, phone: buyer.phone, name: buyer.name }
      : { id: "", phone, name: "" };

    res.json({ orders: await ordersByPhone(phone) });
  } catch (err) {
    next(err);
  }
});

publicRouter.get("/my-quotas", async (req, res, next) => {
  try {
    const phone = req.session.buyer?.phone;
    if (!phone) return res.status(401).json({ message: "Confirme seu telefone." });
    res.json({ orders: await ordersByPhone(phone) });
  } catch (err) {
    next(err);
  }
});

/* ---------------- ranking público ---------------- */

publicRouter.get("/campaigns/:slug/ranking", async (req, res, next) => {
  try {
    const found = await campaignBySlug(req.params.slug);
    if (!found) return res.status(404).json({ message: "Rifa não encontrada." });

    const rows = await db.execute(sql`
      SELECT b.name, b.phone, sum(o.quantity)::int AS quotas
      FROM orders o
      JOIN buyers b ON b.id = o.buyer_id
      WHERE o.campaign_id = ${found.campaign.id}::uuid AND o.status = 'paid'
      GROUP BY b.id, b.name, b.phone
      ORDER BY quotas DESC
      LIMIT 10
    `);

    res.json(rows.rows);
  } catch (err) {
    next(err);
  }
});
