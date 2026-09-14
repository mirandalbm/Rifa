import express, { Router, type Request } from "express";
import { randomInt } from "node:crypto";
import QRCode from "qrcode";
import { eq, and, sql, desc } from "drizzle-orm";
import { db } from "../db";
import {
  campaigns,
  campaignStats,
  quotaPackages,
  quotaAlloc,
  prizedQuotas,
  orders,
  buyers,
  affiliates,
  users,
  commissions,
  coupons,
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
import { hashPassword, verifyPassword } from "../auth";
import { notify } from "../notifications";
import { publicUrl } from "../services/urls";
import { formatQuota } from "@shared/format";
import { generateSecret, verifyTotp, otpauthUrl } from "../services/totp";

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

/* ---------------- cotas premiadas ---------------- */

adminRouter.get("/campaigns/:id/prized", async (req, res, next) => {
  try {
    const rows = await db
      .select()
      .from(prizedQuotas)
      .where(eq(prizedQuotas.campaignId, req.params.id))
      .orderBy(prizedQuotas.number);
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

/**
 * Sorteia N cotas premiadas. Os números saem por CSPRNG e ficam escondidos
 * do público — quem soubesse qual é compraria só aquele.
 */
adminRouter.post("/campaigns/:id/prized", async (req, res, next) => {
  try {
    const [campaign] = await db
      .select()
      .from(campaigns)
      .where(eq(campaigns.id, req.params.id));
    if (!campaign) return res.status(404).json({ message: "Campanha não encontrada." });

    const prizeLabel = String(req.body?.prizeLabel ?? "").trim();
    const quantity = Number(req.body?.quantity ?? 1);

    if (prizeLabel.length < 2) {
      return res.status(400).json({ message: "Descreva o prêmio da cota." });
    }
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 500) {
      return res.status(400).json({ message: "Sorteie de 1 a 500 cotas premiadas." });
    }

    const existing = await db
      .select({ number: prizedQuotas.number })
      .from(prizedQuotas)
      .where(eq(prizedQuotas.campaignId, campaign.id));
    const taken = new Set(existing.map((e) => e.number));

    if (taken.size + quantity > campaign.totalQuotas) {
      return res.status(409).json({ message: "Mais cotas premiadas do que cotas na rifa." });
    }

    const picked: number[] = [];
    // Teto de voltas: campanha pequena e muito premiada colide bastante.
    for (let spin = 0; spin < quantity * 200 && picked.length < quantity; spin++) {
      const n = randomInt(1, campaign.totalQuotas + 1);
      if (taken.has(n)) continue;
      taken.add(n);
      picked.push(n);
    }

    const created = await db
      .insert(prizedQuotas)
      .values(picked.map((number) => ({ campaignId: campaign.id, number, prizeLabel })))
      .onConflictDoNothing()
      .returning();

    await audit(req, "prized.create", "campaign", campaign.id, {
      prizeLabel,
      quantity: created.length,
    });
    res.status(201).json({ created: created.length, prizeLabel });
  } catch (err) {
    next(err);
  }
});

adminRouter.delete("/prized/:prizedId", async (req, res, next) => {
  try {
    const [removed] = await db
      .delete(prizedQuotas)
      .where(eq(prizedQuotas.id, req.params.prizedId))
      .returning();
    if (!removed) return res.status(404).json({ message: "Cota premiada não encontrada." });
    if (removed.claimedByOrderId) {
      // Já foi ganha: recriar seria tirar prêmio de quem levou.
      await db.insert(prizedQuotas).values(removed);
      return res.status(409).json({ message: "Esta cota premiada já foi ganha." });
    }
    await audit(req, "prized.remove", "campaign", removed.campaignId, { id: removed.id });
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

/* ---------------- cupons ---------------- */

adminRouter.get("/coupons", async (_req, res, next) => {
  try {
    const rows = await db
      .select({
        coupon: coupons,
        affiliateCode: affiliates.code,
        campaignTitle: campaigns.title,
      })
      .from(coupons)
      .leftJoin(affiliates, eq(affiliates.id, coupons.affiliateId))
      .leftJoin(campaigns, eq(campaigns.id, coupons.campaignId))
      .orderBy(desc(coupons.id));
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

/**
 * Cupom do afiliado: dá desconto ao comprador e, no checkout, sobrepõe o
 * cookie de primeiro clique — é como o afiliado ganha a venda de quem chegou
 * por outro caminho e digitou o código dele.
 */
adminRouter.post("/coupons", async (req, res, next) => {
  try {
    const code = String(req.body?.code ?? "").toUpperCase().trim();
    const discountPct = Number(req.body?.discountPct);

    if (!/^[A-Z0-9]{3,20}$/.test(code)) {
      return res.status(400).json({ message: "Use de 3 a 20 letras ou números." });
    }
    if (!Number.isInteger(discountPct) || discountPct < 1 || discountPct > 50) {
      return res.status(400).json({ message: "O desconto precisa ficar entre 1% e 50%." });
    }

    const [existing] = await db.select().from(coupons).where(eq(coupons.code, code));
    if (existing) return res.status(409).json({ message: "Este código já existe." });

    const [created] = await db
      .insert(coupons)
      .values({
        code,
        discountPct,
        affiliateId: req.body?.affiliateId || null,
        campaignId: req.body?.campaignId || null,
        maxUses: req.body?.maxUses ? Number(req.body.maxUses) : null,
        expiresAt: req.body?.expiresAt ? new Date(req.body.expiresAt) : null,
      })
      .returning();

    await audit(req, "coupon.create", "coupon", created.id, { code, discountPct });
    res.status(201).json(created);
  } catch (err) {
    next(err);
  }
});

adminRouter.delete("/coupons/:id", async (req, res, next) => {
  try {
    const [removed] = await db.delete(coupons).where(eq(coupons.id, req.params.id)).returning();
    if (!removed) return res.status(404).json({ message: "Cupom não encontrado." });
    await audit(req, "coupon.remove", "coupon", removed.id, { code: removed.code });
    res.json({ removed: removed.id });
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

    // O ganhador é avisado na hora; os demais veem o resultado na página.
    if (winner?.status === "paid") {
      const [row] = await db
        .select({ phone: buyers.phone })
        .from(orders)
        .innerJoin(buyers, eq(buyers.id, orders.buyerId))
        .where(eq(orders.id, winner.orderId));
      if (row?.phone) {
        await notify({
          to: row.phone,
          template: "sorteio_realizado",
          params: {
            rifa: campaign.title,
            numero: formatQuota(resultNumber, campaign.totalQuotas),
            link: publicUrl(`/r/${campaign.slug}`),
          },
          dedupeKey: `draw:${draw.id}:ganhador`,
        });
      }
    }

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

/* ---------------- segundo fator ---------------- */

adminRouter.get("/2fa", async (req, res, next) => {
  try {
    const [user] = await db.select().from(users).where(eq(users.id, req.user!.id));
    res.json({ enabled: Boolean(user.totpSecret) });
  } catch (err) {
    next(err);
  }
});

/**
 * Gera um segredo e devolve a URL do QR. O segredo só é gravado depois que o
 * administrador prova que o aplicativo dele já está gerando o código certo —
 * gravar antes tranca a conta de quem desistiu no meio.
 */
adminRouter.post("/2fa/setup", async (req, res, next) => {
  try {
    const [user] = await db.select().from(users).where(eq(users.id, req.user!.id));
    if (user.totpSecret) {
      return res.status(409).json({ message: "O segundo fator já está ativo." });
    }
    const secret = generateSecret();
    req.session.pendingTotpSecret = secret;
    const otpauth = otpauthUrl({ secret, account: user.email });
    res.json({
      secret,
      otpauth,
      // Ler 32 caracteres à mão é onde as pessoas erram: o QR resolve.
      qr: await QRCode.toDataURL(otpauth, { margin: 1, width: 240 }),
    });
  } catch (err) {
    next(err);
  }
});

adminRouter.post("/2fa/enable", async (req, res, next) => {
  try {
    const secret = req.session.pendingTotpSecret;
    if (!secret) {
      return res.status(409).json({ message: "Comece de novo: gere o QR Code." });
    }
    if (!verifyTotp(secret, String(req.body?.code ?? ""))) {
      return res.status(401).json({ message: "Código incorreto. Confira o aplicativo." });
    }

    await db.update(users).set({ totpSecret: secret }).where(eq(users.id, req.user!.id));
    delete req.session.pendingTotpSecret;
    await audit(req, "admin.2fa.enable", "user", req.user!.id);
    res.json({ enabled: true });
  } catch (err) {
    next(err);
  }
});

/** Desligar exige senha E código: quem roubou a sessão não desarma sozinho. */
adminRouter.post("/2fa/disable", async (req, res, next) => {
  try {
    const [user] = await db.select().from(users).where(eq(users.id, req.user!.id));
    if (!user.totpSecret) return res.json({ enabled: false });

    const password = String(req.body?.password ?? "");
    if (!(await verifyPassword(password, user.passwordHash))) {
      return res.status(401).json({ message: "Senha incorreta." });
    }
    if (!verifyTotp(user.totpSecret, String(req.body?.code ?? ""))) {
      return res.status(401).json({ message: "Código incorreto." });
    }

    await db.update(users).set({ totpSecret: null }).where(eq(users.id, req.user!.id));
    await audit(req, "admin.2fa.disable", "user", req.user!.id);
    res.json({ enabled: false });
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
