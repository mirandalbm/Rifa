import express, { Router, type Request } from "express";
import { eq, and, sql, desc } from "drizzle-orm";
import { db } from "../db";
import {
  campaigns,
  campaignStats,
  quotaPackages,
  quotaAlloc,
  orders,
  buyers,
  affiliates,
  users,
  commissions,
  payouts,
  draws,
  auditLog,
  insertCampaignSchema,
} from "@shared/schema";
import {
  publishCampaign,
  publishBlockers,
  assertEditable,
  assertQuotaRange,
  CampaignRuleError,
} from "../services/campaigns";
import { drawNumber } from "../services/draw";
import {
  requestUpload,
  ingestUpload,
  removeMedia,
  listMedia,
  MediaRuleError,
} from "../services/media";
import { storage, LocalDiskStorage } from "../services/storage";
import { hashPassword } from "../auth";

export const adminRouter = Router();

async function audit(
  req: Request,
  action: string,
  entity: string,
  entityId?: string,
  diff?: unknown,
) {
  await db.insert(auditLog).values({
    actorId: req.user?.id,
    actorRole: req.user?.role,
    action,
    entity,
    entityId,
    diff: diff as never,
    ip: req.ip,
  });
}

/* ---------------- painel ---------------- */

adminRouter.get("/overview", async (_req, res, next) => {
  try {
    const [totals] = await db
      .select({
        revenueCents: sql<number>`coalesce(sum(${campaignStats.revenueCents}), 0)::int`,
        soldCount: sql<number>`coalesce(sum(${campaignStats.soldCount}), 0)::int`,
        reservedCount: sql<number>`coalesce(sum(${campaignStats.reservedCount}), 0)::int`,
      })
      .from(campaignStats);

    const [published] = await db
      .select({ n: sql<number>`count(*)::int`, quotas: sql<number>`coalesce(sum(${campaigns.totalQuotas}),0)::int` })
      .from(campaigns)
      .where(eq(campaigns.status, "published"));

    const [toPay] = await db
      .select({
        cents: sql<number>`coalesce(sum(${commissions.amountCents}), 0)::int`,
        affiliates: sql<number>`count(distinct ${commissions.affiliateId})::int`,
      })
      .from(commissions)
      .where(sql`${commissions.status} in ('pending','available')`);

    const daily = await db.execute(sql`
      SELECT date_trunc('day', paid_at) AS day,
             coalesce(sum(amount_cents), 0)::int AS cents
      FROM orders
      WHERE status = 'paid' AND paid_at > now() - interval '14 days'
      GROUP BY 1 ORDER BY 1
    `);

    const topAffiliates = await db.execute(sql`
      SELECT a.code, u.name, coalesce(sum(o.amount_cents), 0)::int AS cents
      FROM affiliates a
      JOIN users u ON u.id = a.user_id
      LEFT JOIN orders o ON o.affiliate_id = a.id AND o.status = 'paid'
      GROUP BY a.code, u.name
      ORDER BY cents DESC
      LIMIT 5
    `);

    res.json({
      revenueCents: totals.revenueCents,
      soldCount: totals.soldCount,
      reservedCount: totals.reservedCount,
      publishedCampaigns: published.n,
      publishedQuotas: published.quotas,
      commissionToPayCents: toPay.cents,
      commissionAffiliates: toPay.affiliates,
      daily: daily.rows,
      topAffiliates: topAffiliates.rows,
    });
  } catch (err) {
    next(err);
  }
});

/* ---------------- campanhas ---------------- */

adminRouter.get("/campaigns", async (_req, res, next) => {
  try {
    const rows = await db
      .select({ campaign: campaigns, stats: campaignStats })
      .from(campaigns)
      .leftJoin(campaignStats, eq(campaignStats.campaignId, campaigns.id))
      .orderBy(desc(campaigns.createdAt));
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

adminRouter.post("/campaigns", async (req, res, next) => {
  try {
    const input = insertCampaignSchema.parse(req.body);
    assertQuotaRange(input.totalQuotas);

    const [created] = await db
      .insert(campaigns)
      .values({ ...input, status: "draft" })
      .returning();

    await audit(req, "campaign.create", "campaign", created.id, input);
    res.status(201).json(created);
  } catch (err) {
    if (err instanceof CampaignRuleError) {
      return res.status(422).json({ message: err.message });
    }
    next(err);
  }
});

adminRouter.patch("/campaigns/:id", async (req, res, next) => {
  try {
    const [campaign] = await db
      .select()
      .from(campaigns)
      .where(eq(campaigns.id, req.params.id));
    if (!campaign) return res.status(404).json({ message: "Campanha não encontrada." });

    const changes = insertCampaignSchema.partial().parse(req.body);
    assertEditable(campaign, changes);
    if (changes.totalQuotas) assertQuotaRange(changes.totalQuotas);

    const [updated] = await db
      .update(campaigns)
      .set(changes)
      .where(eq(campaigns.id, campaign.id))
      .returning();

    await audit(req, "campaign.update", "campaign", campaign.id, changes);
    res.json(updated);
  } catch (err) {
    if (err instanceof CampaignRuleError) {
      return res.status(422).json({ message: err.message });
    }
    next(err);
  }
});

adminRouter.get("/campaigns/:id/blockers", async (req, res, next) => {
  try {
    res.json({ blockers: await publishBlockers(req.params.id) });
  } catch (err) {
    next(err);
  }
});

adminRouter.post("/campaigns/:id/publish", async (req, res, next) => {
  try {
    const published = await publishCampaign(req.params.id);
    await audit(req, "campaign.publish", "campaign", published.id, {
      totalQuotas: published.totalQuotas,
      seedHash: published.drawSeedHash,
    });
    res.json(published);
  } catch (err) {
    if (err instanceof CampaignRuleError) {
      return res.status(422).json({ message: err.message });
    }
    next(err);
  }
});

adminRouter.put("/campaigns/:id/packages", async (req, res, next) => {
  try {
    const list = (req.body?.packages ?? []) as {
      quantity: number;
      discountPct: number;
      highlight?: boolean;
    }[];

    await db.transaction(async (tx) => {
      await tx.delete(quotaPackages).where(eq(quotaPackages.campaignId, req.params.id));
      if (list.length > 0) {
        await tx.insert(quotaPackages).values(
          list.map((p) => ({
            campaignId: req.params.id,
            quantity: p.quantity,
            discountPct: p.discountPct,
            highlight: p.highlight ?? false,
          })),
        );
      }
    });

    await audit(req, "campaign.packages", "campaign", req.params.id, list);
    res.json({ packages: list });
  } catch (err) {
    next(err);
  }
});

/* ---------------- mídia: banner, 5 fotos, vídeo de 60 s ---------------- */

adminRouter.get("/campaigns/:id/media", async (req, res, next) => {
  try {
    res.json(await listMedia(req.params.id));
  } catch (err) {
    next(err);
  }
});

/** Passo 1: URL assinada. O arquivo não passa pela nossa API. */
adminRouter.post("/campaigns/:id/media/upload-url", async (req, res, next) => {
  try {
    const ticket = await requestUpload({
      campaignId: req.params.id,
      role: req.body?.role,
      filename: String(req.body?.filename ?? "arquivo"),
      mime: String(req.body?.mime ?? ""),
      bytes: Number(req.body?.bytes ?? 0),
    });
    res.json(ticket);
  } catch (err) {
    if (err instanceof MediaRuleError) {
      return res.status(err.status).json({ message: err.message });
    }
    next(err);
  }
});

/**
 * Recepção do upload em desenvolvimento, quando o armazenamento é o disco
 * local. Em produção o R2 recebe direto e esta rota não é usada.
 */
adminRouter.put(
  "/media/raw",
  express.raw({ type: "*/*", limit: "300mb" }),
  async (req, res, next) => {
    try {
      const store = storage();
      if (!(store instanceof LocalDiskStorage)) {
        return res.status(404).json({ message: "Envie direto para o armazenamento." });
      }
      const key = String(req.query.key ?? "");
      const exp = Number(req.query.exp ?? 0);
      const sig = String(req.query.sig ?? "");
      if (!store.verify(key, exp, sig)) {
        return res.status(403).json({ message: "Link de envio inválido ou expirado." });
      }
      await store.write(key, req.body as Buffer);
      res.json({ stored: key, bytes: (req.body as Buffer).length });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * Passo 2: confirma o envio. É AQUI que o arquivo é medido — dimensões da
 * imagem e duração do vídeo saem do próprio arquivo, nunca do que o
 * navegador informou.
 */
adminRouter.post("/campaigns/:id/media", async (req, res, next) => {
  try {
    const created = await ingestUpload({
      campaignId: req.params.id,
      role: req.body?.role,
      storageKey: String(req.body?.storageKey ?? ""),
      altText: req.body?.altText ? String(req.body.altText) : undefined,
      mime: String(req.body?.mime ?? ""),
    });
    await audit(req, "media.add", "campaign", req.params.id, {
      role: created.role,
      durationS: created.durationS,
      width: created.width,
    });
    res.status(201).json(created);
  } catch (err) {
    if (err instanceof MediaRuleError) {
      return res.status(err.status).json({ message: err.message });
    }
    next(err);
  }
});

adminRouter.delete("/media/:mediaId", async (req, res, next) => {
  try {
    const removed = await removeMedia(req.params.mediaId);
    if (!removed) return res.status(404).json({ message: "Mídia não encontrada." });
    await audit(req, "media.remove", "campaign", removed.campaignId, { id: removed.id });
    res.json({ removed: removed.id });
  } catch (err) {
    next(err);
  }
});

/* ---------------- pedidos ---------------- */

adminRouter.get("/orders", async (req, res, next) => {
  try {
    const status = req.query.status ? String(req.query.status) : null;
    const rows = await db
      .select({
        order: orders,
        buyer: { name: buyers.name, phone: buyers.phone },
        campaign: { title: campaigns.title, totalQuotas: campaigns.totalQuotas },
      })
      .from(orders)
      .innerJoin(buyers, eq(buyers.id, orders.buyerId))
      .innerJoin(campaigns, eq(campaigns.id, orders.campaignId))
      .where(status ? sql`${orders.status} = ${status}` : sql`true`)
      .orderBy(desc(orders.createdAt))
      .limit(200);
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

/* ---------------- afiliados ---------------- */

adminRouter.get("/affiliates", async (_req, res, next) => {
  try {
    const rows = await db
      .select({
        affiliate: affiliates,
        user: { name: users.name, email: users.email },
        salesCents: sql<number>`coalesce((
          SELECT sum(o.amount_cents) FROM orders o
          WHERE o.affiliate_id = ${affiliates.id} AND o.status = 'paid'
        ), 0)::int`,
      })
      .from(affiliates)
      .innerJoin(users, eq(users.id, affiliates.userId))
      .orderBy(desc(affiliates.createdAt));
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

adminRouter.post("/affiliates", async (req, res, next) => {
  try {
    const { name, email, password, code, commissionPct } = req.body ?? {};
    if (!name || !email || !password || !code) {
      return res.status(400).json({ message: "Nome, e-mail, senha e código são obrigatórios." });
    }

    const created = await db.transaction(async (tx) => {
      const [user] = await tx
        .insert(users)
        .values({
          role: "affiliate",
          name: String(name),
          email: String(email).toLowerCase().trim(),
          passwordHash: await hashPassword(String(password)),
        })
        .returning();

      const [aff] = await tx
        .insert(affiliates)
        .values({
          userId: user.id,
          code: String(code).toUpperCase().trim(),
          commissionPct: commissionPct ? Number(commissionPct) : null,
          status: "active",
          approvedAt: new Date(),
        })
        .returning();

      return aff;
    });

    await audit(req, "affiliate.create", "affiliate", created.id, { code: created.code });
    res.status(201).json(created);
  } catch (err) {
    next(err);
  }
});

adminRouter.patch("/affiliates/:id", async (req, res, next) => {
  try {
    const changes: Record<string, unknown> = {};
    if (req.body?.status) changes.status = req.body.status;
    if (req.body?.commissionPct !== undefined) {
      changes.commissionPct = req.body.commissionPct === null ? null : Number(req.body.commissionPct);
    }
    if (changes.status === "active") changes.approvedAt = new Date();

    const [updated] = await db
      .update(affiliates)
      .set(changes)
      .where(eq(affiliates.id, req.params.id))
      .returning();

    await audit(req, "affiliate.update", "affiliate", req.params.id, changes);
    res.json(updated);
  } catch (err) {
    next(err);
  }
});

/* ---------------- financeiro ---------------- */

adminRouter.get("/finance", async (_req, res, next) => {
  try {
    const pending = await db
      .select({
        affiliateId: commissions.affiliateId,
        code: affiliates.code,
        name: users.name,
        pixKey: affiliates.pixKey,
        pendingCents: sql<number>`coalesce(sum(${commissions.amountCents}) FILTER (WHERE ${commissions.status} = 'pending'), 0)::int`,
        availableCents: sql<number>`coalesce(sum(${commissions.amountCents}) FILTER (WHERE ${commissions.status} = 'available'), 0)::int`,
      })
      .from(commissions)
      .innerJoin(affiliates, eq(affiliates.id, commissions.affiliateId))
      .innerJoin(users, eq(users.id, affiliates.userId))
      .groupBy(commissions.affiliateId, affiliates.code, users.name, affiliates.pixKey);

    const requested = await db
      .select()
      .from(payouts)
      .where(eq(payouts.status, "requested"))
      .orderBy(desc(payouts.requestedAt));

    res.json({ perAffiliate: pending, payoutsRequested: requested });
  } catch (err) {
    next(err);
  }
});

/** Libera as comissões cuja carência já venceu. Roda sob demanda e no job. */
adminRouter.post("/finance/release", async (req, res, next) => {
  try {
    const released = await db
      .update(commissions)
      .set({ status: "available" })
      .where(and(eq(commissions.status, "pending"), sql`${commissions.availableAt} <= now()`))
      .returning({ id: commissions.id });

    await audit(req, "commission.release", "commission", undefined, { count: released.length });
    res.json({ released: released.length });
  } catch (err) {
    next(err);
  }
});

adminRouter.post("/payouts/:id/paid", async (req, res, next) => {
  try {
    const [updated] = await db
      .update(payouts)
      .set({
        status: "paid",
        processedAt: new Date(),
        receiptUrl: req.body?.receiptUrl ? String(req.body.receiptUrl) : null,
      })
      .where(eq(payouts.id, req.params.id))
      .returning();

    await audit(req, "payout.paid", "payout", req.params.id);
    res.json(updated);
  } catch (err) {
    next(err);
  }
});

/* ---------------- sorteio ---------------- */

adminRouter.get("/campaigns/:id/draw", async (req, res, next) => {
  try {
    const [draw] = await db.select().from(draws).where(eq(draws.campaignId, req.params.id));
    if (!draw) return res.status(404).json({ message: "Campanha ainda não publicada." });
    // A semente só sai depois de executado o sorteio.
    const { seed, ...rest } = draw;
    res.json(draw.executedAt ? draw : rest);
  } catch (err) {
    next(err);
  }
});

/**
 * Executa o sorteio com os 5 prêmios do concurso federal como entropia
 * pública. O hash da semente já estava publicado desde antes da 1ª venda.
 */
adminRouter.post("/campaigns/:id/draw", async (req, res, next) => {
  try {
    const federalPrizes = (req.body?.federalPrizes ?? []) as string[];
    const federalContest = Number(req.body?.federalContest);
    if (federalPrizes.length !== 5 || !Number.isInteger(federalContest)) {
      return res
        .status(400)
        .json({ message: "Informe o concurso e os 5 prêmios da Loteria Federal." });
    }

    const [campaign] = await db
      .select()
      .from(campaigns)
      .where(eq(campaigns.id, req.params.id));
    if (!campaign) return res.status(404).json({ message: "Campanha não encontrada." });
    if (campaign.status === "drawn") {
      return res.status(409).json({ message: "Esta campanha já foi sorteada." });
    }

    const [draw] = await db.select().from(draws).where(eq(draws.campaignId, campaign.id));
    if (!draw) return res.status(409).json({ message: "Campanha sem semente comprometida." });

    const resultNumber = drawNumber({
      seed: draw.seed,
      federalPrizes,
      totalQuotas: campaign.totalQuotas,
    });

    const [winner] = await db
      .select({ orderId: quotaAlloc.orderId, status: quotaAlloc.status })
      .from(quotaAlloc)
      .where(
        and(eq(quotaAlloc.campaignId, campaign.id), eq(quotaAlloc.number, resultNumber)),
      );

    const [updated] = await db
      .update(draws)
      .set({
        federalContest,
        federalPrizes,
        resultNumber,
        winnerOrderId: winner?.status === "paid" ? winner.orderId : null,
        evidenceUrl: req.body?.evidenceUrl ? String(req.body.evidenceUrl) : null,
        executedAt: new Date(),
      })
      .where(eq(draws.id, draw.id))
      .returning();

    await db.update(campaigns).set({ status: "drawn" }).where(eq(campaigns.id, campaign.id));
    await audit(req, "campaign.draw", "campaign", campaign.id, {
      resultNumber,
      federalContest,
    });

    res.json({
      ...updated,
      // A semente é publicada agora: qualquer pessoa refaz a conta.
      seed: draw.seed,
      soldToWinner: Boolean(winner?.status === "paid"),
    });
  } catch (err) {
    next(err);
  }
});

adminRouter.get("/audit", async (_req, res, next) => {
  try {
    res.json(
      await db.select().from(auditLog).orderBy(desc(auditLog.createdAt)).limit(200),
    );
  } catch (err) {
    next(err);
  }
});
