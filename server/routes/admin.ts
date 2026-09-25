import express, { Router, type Request } from "express";
import { once } from "node:events";
import { randomInt } from "node:crypto";
import QRCode from "qrcode";
import { eq, and, sql, desc } from "drizzle-orm";
import { db } from "../db";
import {
  campaigns,
  campaignStats,
  campaignMedia,
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
  settlements,
  draws,
  auditLog,
  organizations,
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
import { formatQuota, normalizePhone } from "@shared/format";
import {
  getLimits,
  setLimits,
  listEvents,
  listBlocks,
  fraudSummary,
  block,
  unblock,
} from "../services/antifraude";
import {
  openBalancesBySeller,
  closeSettlement,
  markSettlementPaid,
  listSettlements,
} from "../services/settlements";
import {
  getOrganizer,
  setOrganizer,
  getPaymentMethods,
  setPaymentMethods,
} from "../services/settings";
import { generateSecret, verifyTotp, otpauthUrl } from "../services/totp";
import { buildExport, ExportError, toCsvLine } from "../services/exports";
import { refundOrder } from "../services/orders";
import {
  planOfOrganization,
  setBillingPlan,
  carteiraDaPlataforma,
  extratoDa,
  darBaixa,
  lancarMensalidades,
} from "../services/billing";
import { BILLING_LABEL } from "@shared/billing";
import {
  orgOf,
  isPlatform,
  requirePlatformAdmin,
  assertCampaignInScope,
  assertAffiliateInScope,
  organizationForNewCampaign,
  organizerInfoOf,
  listOrganizations,
  createOrganization,
  updateOrganization,
  archiveOrganization,
  restoreOrganization,
  OrgScopeError,
} from "../services/orgs";
import { isUniqueViolation } from "../pgError";
import { senhaInvalida } from "@shared/senha";
import { EXPORTS, exportInfo, exportFilename, CSV_BOM } from "@shared/exports";

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

/**
 * Recorte por organização para consulta que já junta `campaigns`.
 *
 * Existe para a linha do filtro ser curta o bastante para ninguém ter
 * preguiça de escrever: filtro esquecido aqui não dá erro, entrega dado.
 */
function escopoDaCampanha(req: Request) {
  const org = orgOf(req);
  return org ? eq(campaigns.organizationId, org) : sql`TRUE`;
}

/* ---------------- painel ---------------- */

adminRouter.get("/overview", async (req, res, next) => {
  try {
    // Todo número deste painel é dinheiro de alguém. O recorte entra em TODAS
    // as consultas: uma esquecida aqui soma o faturamento do vizinho no
    // painel de quem não vendeu aquilo.
    const org = orgOf(req);
    const daCampanha = org ? sql`AND c.organization_id = ${org}::uuid` : sql``;

    const [totals] = await db
      .select({
        revenueCents: sql<number>`coalesce(sum(${campaignStats.revenueCents}), 0)::int`,
        soldCount: sql<number>`coalesce(sum(${campaignStats.soldCount}), 0)::int`,
        reservedCount: sql<number>`coalesce(sum(${campaignStats.reservedCount}), 0)::int`,
      })
      .from(campaignStats)
      .innerJoin(campaigns, eq(campaigns.id, campaignStats.campaignId))
      .where(org ? eq(campaigns.organizationId, org) : sql`TRUE`);

    const [published] = await db
      .select({ n: sql<number>`count(*)::int`, quotas: sql<number>`coalesce(sum(${campaigns.totalQuotas}),0)::int` })
      .from(campaigns)
      .where(
        org
          ? and(eq(campaigns.status, "published"), eq(campaigns.organizationId, org))
          : eq(campaigns.status, "published"),
      );

    const [toPay] = await db
      .select({
        cents: sql<number>`coalesce(sum(${commissions.amountCents}), 0)::int`,
        affiliates: sql<number>`count(distinct ${commissions.affiliateId})::int`,
      })
      .from(commissions)
      .innerJoin(campaigns, eq(campaigns.id, commissions.campaignId))
      .where(
        org
          ? and(
              sql`${commissions.status} in ('pending','available')`,
              eq(campaigns.organizationId, org),
            )
          : sql`${commissions.status} in ('pending','available')`,
      );

    const daily = await db.execute(sql`
      SELECT date_trunc('day', o.paid_at) AS day,
             coalesce(sum(o.amount_cents), 0)::int AS cents
      FROM orders o
      JOIN campaigns c ON c.id = o.campaign_id
      WHERE o.status = 'paid' AND o.paid_at > now() - interval '14 days'
        ${daCampanha}
      GROUP BY 1 ORDER BY 1
    `);

    const topAffiliates = await db.execute(sql`
      SELECT a.code, u.name, coalesce(sum(o.amount_cents), 0)::int AS cents
      FROM affiliates a
      JOIN users u ON u.id = a.user_id
      LEFT JOIN orders o ON o.affiliate_id = a.id AND o.status = 'paid'
      LEFT JOIN campaigns c ON c.id = o.campaign_id
      WHERE ${org ? sql`u.organization_id = ${org}::uuid` : sql`TRUE`}
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

adminRouter.get("/campaigns", async (req, res, next) => {
  try {
    const org = orgOf(req);
    const rows = await db
      .select({ campaign: campaigns, stats: campaignStats })
      .from(campaigns)
      .leftJoin(campaignStats, eq(campaignStats.campaignId, campaigns.id))
      .where(org ? eq(campaigns.organizationId, org) : sql`TRUE`)
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

    // Organizador cria na própria; o administrador geral precisa dizer em
    // qual, senão a campanha nasceria sem administradora — e é a
    // administradora que a Lei 5.768/71 autoriza.
    const organizationId = organizationForNewCampaign(
      req,
      req.body?.organizationId ? String(req.body.organizationId) : undefined,
    );

    const [created] = await db
      .insert(campaigns)
      .values({ ...input, organizationId, status: "draft" })
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
    const campaign = await assertCampaignInScope(req, req.params.id);

    const changes = insertCampaignSchema.partial().parse(req.body);
    // A campanha não muda de dono por PATCH: seria transferir venda, cota e
    // comissão de uma administradora para outra com um campo de formulário.
    delete (changes as { organizationId?: unknown }).organizationId;
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
    await assertCampaignInScope(req, req.params.id);
    res.json({ blockers: await publishBlockers(req.params.id) });
  } catch (err) {
    next(err);
  }
});

adminRouter.post("/campaigns/:id/publish", async (req, res, next) => {
  try {
    await assertCampaignInScope(req, req.params.id);
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
    await assertCampaignInScope(req, req.params.id);
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
    await assertCampaignInScope(req, req.params.id);
    res.json(await listMedia(req.params.id));
  } catch (err) {
    next(err);
  }
});

/** Passo 1: URL assinada. O arquivo não passa pela nossa API. */
adminRouter.post("/campaigns/:id/media/upload-url", async (req, res, next) => {
  try {
    await assertCampaignInScope(req, req.params.id);
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
    await assertCampaignInScope(req, req.params.id);
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
    // O caminho não traz a campanha, então o dono é conferido pelo pai: sem
    // isto, o id da mídia do vizinho apagaria o banner dele.
    const [midia] = await db
      .select({ campaignId: campaignMedia.campaignId })
      .from(campaignMedia)
      .where(eq(campaignMedia.id, req.params.mediaId));
    if (!midia) return res.status(404).json({ message: "Mídia não encontrada." });
    await assertCampaignInScope(req, midia.campaignId);

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
    await assertCampaignInScope(req, req.params.id);
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
    const campaign = await assertCampaignInScope(req, req.params.id);

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
    // Confere o dono ANTES de apagar: aqui a rota apaga e só depois decide se
    // devolve, então um id de outra organização já teria sumido do banco.
    const [alvo] = await db
      .select({ campaignId: prizedQuotas.campaignId })
      .from(prizedQuotas)
      .where(eq(prizedQuotas.id, req.params.prizedId));
    if (!alvo) return res.status(404).json({ message: "Cota premiada não encontrada." });
    await assertCampaignInScope(req, alvo.campaignId);

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
      .where(
        and(
          status ? sql`${orders.status} = ${status}` : sql`true`,
          escopoDaCampanha(req),
        ),
      )
      .orderBy(desc(orders.createdAt))
      .limit(200);
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

/* ---------------- afiliados ---------------- */

adminRouter.get("/affiliates", async (req, res, next) => {
  try {
    const org = orgOf(req);
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
      // O afiliado pertence à organização pelo usuário dele.
      .where(org ? eq(users.organizationId, org) : sql`TRUE`)
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

    // Mesma regra da campanha: o afiliado nasce com dono.
    const organizationId = organizationForNewCampaign(
      req,
      req.body?.organizationId ? String(req.body.organizationId) : undefined,
    );

    const created = await db.transaction(async (tx) => {
      const [user] = await tx
        .insert(users)
        .values({
          role: "affiliate",
          organizationId,
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
    await assertAffiliateInScope(req, req.params.id);

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

adminRouter.get("/coupons", async (req, res, next) => {
  try {
    const org = orgOf(req);
    const rows = await db
      .select({
        coupon: coupons,
        affiliateCode: affiliates.code,
        campaignTitle: campaigns.title,
      })
      .from(coupons)
      .leftJoin(affiliates, eq(affiliates.id, coupons.affiliateId))
      .leftJoin(users, eq(users.id, affiliates.userId))
      .leftJoin(campaigns, eq(campaigns.id, coupons.campaignId))
      // Cupom solto (sem campanha e sem afiliado) vale na plataforma inteira
      // e por isso não aparece para o organizador: ele não pode mexer nele.
      .where(
        org
          ? sql`(${campaigns.organizationId} = ${org}::uuid OR ${users.organizationId} = ${org}::uuid)`
          : sql`TRUE`,
      )
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

    // Cupom de organizador tem que morder algo dele. Sem campanha e sem
    // afiliado o cupom vale em toda a plataforma — isso é da plataforma.
    if (req.body?.campaignId) {
      await assertCampaignInScope(req, String(req.body.campaignId));
    }
    if (req.body?.affiliateId) {
      await assertAffiliateInScope(req, String(req.body.affiliateId));
    }
    if (!req.body?.campaignId && !req.body?.affiliateId) {
      requirePlatformAdmin(req);
    }

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
    // Confere o dono antes de apagar, pelo mesmo motivo da cota premiada.
    const [alvo] = await db.select().from(coupons).where(eq(coupons.id, req.params.id));
    if (!alvo) return res.status(404).json({ message: "Cupom não encontrado." });
    if (alvo.campaignId) await assertCampaignInScope(req, alvo.campaignId);
    else if (alvo.affiliateId) await assertAffiliateInScope(req, alvo.affiliateId);
    else requirePlatformAdmin(req);

    const [removed] = await db.delete(coupons).where(eq(coupons.id, req.params.id)).returning();
    if (!removed) return res.status(404).json({ message: "Cupom não encontrado." });
    await audit(req, "coupon.remove", "coupon", removed.id, { code: removed.code });
    res.json({ removed: removed.id });
  } catch (err) {
    next(err);
  }
});

/* ---------------- cambistas e acertos ---------------- */

/**
 * Cadastra um cambista. É o mesmo cadastro do afiliado, com `kind` diferente:
 * a comissão funciona igual, o que muda é a direção do caixa — o cambista
 * está com o dinheiro na mão e presta contas no acerto.
 */
adminRouter.post("/sellers", async (req, res, next) => {
  try {
    const { name, email, password, code, commissionPct, phone } = req.body ?? {};
    if (!name || !email || !password || !code) {
      return res.status(400).json({ message: "Nome, e-mail, senha e código são obrigatórios." });
    }

    const organizationId = organizationForNewCampaign(
      req,
      req.body?.organizationId ? String(req.body.organizationId) : undefined,
    );

    const created = await db.transaction(async (tx) => {
      const [user] = await tx
        .insert(users)
        .values({
          role: "cambista",
          organizationId,
          name: String(name),
          email: String(email).toLowerCase().trim(),
          phone: phone ? String(phone) : null,
          passwordHash: await hashPassword(String(password)),
        })
        .returning();

      const [seller] = await tx
        .insert(affiliates)
        .values({
          userId: user.id,
          code: String(code).toUpperCase().trim(),
          kind: "cambista",
          commissionPct: commissionPct ? Number(commissionPct) : null,
          status: "active",
          approvedAt: new Date(),
        })
        .returning();

      return seller;
    });

    await audit(req, "seller.create", "affiliate", created.id, { code: created.code });
    res.status(201).json(created);
  } catch (err) {
    next(err);
  }
});

/** Quanto cada cambista deve hoje. */
adminRouter.get("/settlements", async (req, res, next) => {
  try {
    const org = orgOf(req);
    res.json({
      emAberto: await openBalancesBySeller(org),
      historico: await listSettlements(undefined, org),
    });
  } catch (err) {
    next(err);
  }
});

adminRouter.post("/settlements/:sellerId/close", async (req, res, next) => {
  try {
    await assertAffiliateInScope(req, req.params.sellerId);
    const created = await closeSettlement(
      req.params.sellerId,
      req.body?.notes ? String(req.body.notes) : undefined,
    );
    if (!created) {
      return res.status(400).json({ message: "Este cambista não tem venda em aberto." });
    }
    await audit(req, "settlement.close", "settlement", created.id, {
      netCents: created.netCents,
      orderCount: created.orderCount,
    });
    res.status(201).json(created);
  } catch (err) {
    next(err);
  }
});

adminRouter.post("/settlements/:id/paid", async (req, res, next) => {
  try {
    const [acerto] = await db
      .select({ sellerId: settlements.sellerId })
      .from(settlements)
      .where(eq(settlements.id, req.params.id));
    if (!acerto) return res.status(404).json({ message: "Acerto não encontrado." });
    await assertAffiliateInScope(req, acerto.sellerId);

    const updated = await markSettlementPaid(req.params.id);
    if (!updated) return res.status(404).json({ message: "Acerto não encontrado." });
    await audit(req, "settlement.paid", "settlement", updated.id);
    res.json(updated);
  } catch (err) {
    next(err);
  }
});

/* ---------------- administradora da rifa ---------------- */

adminRouter.get("/organizer", async (req, res, next) => {
  try {
    // O que o bilhete chama de "administradora" é a organização da sessão.
    // Para o administrador geral, que não tem uma, continua valendo a
    // configuração antiga da plataforma.
    const org = orgOf(req);
    res.json(org ? await organizerInfoOf(org) : await getOrganizer());
  } catch (err) {
    next(err);
  }
});

adminRouter.put("/organizer", async (req, res, next) => {
  try {
    const org = orgOf(req);

    // Para o organizador, "administradora" é a organização dele — mesma tela,
    // outro destino. Para o administrador geral, segue a configuração da
    // plataforma, que é o que vale para quem ainda não tem organização.
    if (org) {
      const alterada = await updateOrganization(org, {
        name: req.body?.nome,
        cnpj: req.body?.cnpj,
        contato: req.body?.contato,
        cidade: req.body?.cidade,
        observacao: req.body?.observacao,
      });
      await audit(req, "organizer.update", "organization", alterada.id, req.body);
      return res.json(await organizerInfoOf(org));
    }

    const saved = await setOrganizer(req.body ?? {});
    await audit(req, "organizer.update", "settings", "organizador", saved);
    res.json(saved);
  } catch (err) {
    if (err instanceof Error && err.message.includes("administradora")) {
      return res.status(400).json({ message: err.message });
    }
    next(err);
  }
});

/* ---------------- exportações ---------------- */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Data do formulário (aaaa-mm-dd) ou nada. Texto torto vira `null`.
 *
 * Montada como data **local**, não com `new Date("2026-09-14")` — esse
 * construtor lê a string como UTC, e num servidor em UTC-3 a meia-noite viraria
 * 21h do dia anterior. O relatório passaria a começar no dia errado.
 */
function lerData(valor: unknown, fimDoDia = false): Date | null {
  const texto = String(valor ?? "");
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(texto);
  if (!m) return null;

  const [, ano, mes, dia] = m;
  const d = new Date(Number(ano), Number(mes) - 1, Number(dia));
  if (Number.isNaN(d.getTime())) return null;

  // O filtro do serviço é `< ate`. Quem escolhe "até 14/09" quer o dia 14
  // inteiro, então o fim é a meia-noite do dia seguinte.
  if (fimDoDia) d.setDate(d.getDate() + 1);

  return d;
}

adminRouter.get("/exportacoes", (_req, res) => {
  res.json({ relatorios: EXPORTS });
});

/**
 * O download.
 *
 * Escreve direto no socket, página por página, respeitando a contrapressão:
 * `res.write()` devolvendo `false` significa que o buffer do sistema encheu e
 * continuar escrevendo acumularia tudo na memória do processo — exatamente o
 * que o gerador paginado existe para evitar.
 *
 * O cabeçalho sai antes da primeira consulta pesada, então erro depois disso
 * não vira JSON: a resposta já começou. Por isso a validação toda acontece
 * antes, e uma falha no meio derruba a conexão de propósito — arquivo cortado
 * que parece inteiro é pior que download que falhou.
 */
adminRouter.get("/exportacoes/:key", async (req, res, next) => {
  try {
    const info = exportInfo(req.params.key);
    if (!info) return res.status(404).json({ message: "Relatório desconhecido." });

    const campaignId = req.query.campanha ? String(req.query.campanha) : null;
    if (info.campanhaObrigatoria && !campaignId) {
      return res.status(400).json({
        message: `O relatório "${info.label}" precisa de uma campanha.`,
      });
    }

    let campanha: { slug: string } | undefined;
    if (campaignId) {
      if (!UUID.test(campaignId)) {
        return res.status(400).json({ message: "Campanha inválida." });
      }
      // Confere o dono aqui: o relatório de cotas não junta `campaigns`, e
      // sem esta linha o id de uma campanha alheia sairia com os números e
      // os telefones de quem comprou nela.
      campanha = await assertCampaignInScope(req, campaignId);
    }

    const de = lerData(req.query.de);
    const ate = lerData(req.query.ate, true);
    if (req.query.de && !de) return res.status(400).json({ message: "Data inicial inválida." });
    if (req.query.ate && !ate) return res.status(400).json({ message: "Data final inválida." });
    if (de && ate && de > ate) {
      return res.status(400).json({ message: "A data inicial é depois da final." });
    }

    const relatorio = buildExport(info.key, {
      campaignId,
      organizationId: orgOf(req),
      de,
      ate,
    });

    // O registro do acesso vem ANTES do arquivo: exportação que leva dado
    // pessoal precisa deixar rastro mesmo que o download seja interrompido.
    await audit(req, "exportacao", "export", info.key, {
      campanha: campanha?.slug ?? null,
      organizacao: orgOf(req),
      de: de?.toISOString() ?? null,
      ate: ate?.toISOString() ?? null,
      dadoPessoal: info.dadoPessoal,
    });

    const nome = exportFilename(info.key, campanha?.slug ?? null);

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${nome}"`);
    // Relatório é retrato do instante: guardar em cache entrega número velho.
    res.setHeader("Cache-Control", "no-store");

    res.write(CSV_BOM + toCsvLine(relatorio.header));

    for await (const linha of relatorio.linhas) {
      if (!res.write(toCsvLine(linha))) {
        // Buffer cheio: espera o socket drenar antes de pedir a próxima
        // página. Sem isto, 500 mil linhas entram na memória do processo.
        await once(res, "drain");
      }
    }

    res.end();
  } catch (err) {
    if (res.headersSent) {
      // A resposta já começou: não dá para virar JSON. Derruba a conexão,
      // que é como o navegador entende "este arquivo não está inteiro".
      res.destroy(err as Error);
      return;
    }
    if (err instanceof ExportError) {
      return res.status(err.status).json({ message: err.message });
    }
    next(err);
  }
});

/* ---------------- organizações (só da plataforma) ---------------- */

/**
 * A lista de organizações é a carteira de clientes da plataforma — por isso
 * é só do administrador geral. O organizador não precisa saber quem mais
 * vende aqui, e saber já seria informação comercial de terceiro.
 */
adminRouter.get("/organizacoes", async (req, res, next) => {
  try {
    requirePlatformAdmin(req);
    const situacao = String(req.query.situacao ?? "ativas");
    const orgs = await listOrganizations(
      situacao === "arquivadas" || situacao === "todas" ? situacao : "ativas",
    );

    // Quantas campanhas e quanta gente em cada uma: é o que dá para decidir
    // sem entrar no painel de ninguém.
    const contagem = await db.execute(sql`
      SELECT o.id,
             count(DISTINCT c.id)::int AS campanhas,
             count(DISTINCT u.id)::int AS pessoas
        FROM organizations o
        LEFT JOIN campaigns c ON c.organization_id = o.id
        LEFT JOIN users u ON u.organization_id = o.id
       GROUP BY o.id
    `);
    const porId = new Map(
      (contagem.rows as { id: string; campanhas: number; pessoas: number }[]).map(
        (r) => [r.id, r],
      ),
    );

    res.json(
      orgs.map((o) => ({
        ...o,
        campanhas: porId.get(o.id)?.campanhas ?? 0,
        pessoas: porId.get(o.id)?.pessoas ?? 0,
      })),
    );
  } catch (err) {
    next(err);
  }
});

adminRouter.post("/organizacoes", async (req, res, next) => {
  try {
    requirePlatformAdmin(req);
    const criada = await createOrganization({
      name: String(req.body?.name ?? ""),
      cnpj: req.body?.cnpj ? String(req.body.cnpj) : undefined,
      contato: req.body?.contato ? String(req.body.contato) : undefined,
      cidade: req.body?.cidade ? String(req.body.cidade) : undefined,
      observacao: req.body?.observacao ? String(req.body.observacao) : undefined,
    });
    await audit(req, "organizacao.create", "organization", criada.id, {
      name: criada.name,
    });
    res.status(201).json(criada);
  } catch (err) {
    next(err);
  }
});

/**
 * Editar a organização.
 *
 * O organizador edita a **dele** — é isto que o bilhete imprime como
 * administradora da rifa. Ligar e desligar é da plataforma: organização
 * desligada é cliente suspenso, não decisão de quem foi suspenso.
 */
adminRouter.patch("/organizacoes/:id", async (req, res, next) => {
  try {
    const org = orgOf(req);
    if (org && org !== req.params.id) {
      return res.status(404).json({ message: "Organização não encontrada." });
    }
    if (req.body?.active !== undefined) requirePlatformAdmin(req);

    const alterada = await updateOrganization(req.params.id, {
      name: req.body?.name,
      cnpj: req.body?.cnpj,
      contato: req.body?.contato,
      cidade: req.body?.cidade,
      observacao: req.body?.observacao,
      active: req.body?.active,
    });
    await audit(req, "organizacao.update", "organization", alterada.id, req.body);
    res.json(alterada);
  } catch (err) {
    next(err);
  }
});

/** Cria o acesso de organizador dentro de uma organização. */
adminRouter.post("/organizacoes/:id/acessos", async (req, res, next) => {
  try {
    requirePlatformAdmin(req);
    const { name, email, password } = req.body ?? {};
    if (!name || !email || !password) {
      return res.status(400).json({ message: "Nome, e-mail e senha são obrigatórios." });
    }
    const invalida = senhaInvalida(String(password), "organizer");
    if (invalida) return res.status(400).json({ message: invalida });

    const [org] = await db
      .select({ archivedAt: organizations.archivedAt })
      .from(organizations)
      .where(eq(organizations.id, req.params.id));
    if (!org) return res.status(404).json({ message: "Organização não encontrada." });
    if (org.archivedAt) {
      return res
        .status(409)
        .json({ message: "Organização arquivada: restaure antes de criar acesso." });
    }

    let criado: { id: string; email: string; name: string };
    try {
      [criado] = await db
        .insert(users)
        .values({
          role: "organizer",
          organizationId: req.params.id,
          name: String(name).trim(),
          email: String(email).toLowerCase().trim(),
          passwordHash: await hashPassword(String(password)),
        })
        .returning({ id: users.id, email: users.email, name: users.name });
    } catch (err) {
      // Quem decide se o e-mail está livre é o índice, não uma consulta antes.
      if (isUniqueViolation(err, "uq_users_email")) {
        return res.status(409).json({ message: "Já existe um acesso com este e-mail." });
      }
      throw err;
    }

    await audit(req, "organizacao.acesso", "organization", req.params.id, {
      email: criado.email,
    });
    res.status(201).json(criado);
  } catch (err) {
    next(err);
  }
});

/**
 * Arquivar exige senha E código do autenticador, como desligar o segundo
 * fator: a sessão aberta sozinha não tira um cliente da carteira. Quem não
 * ligou o segundo fator é mandado ligar — não há caminho sem ele.
 */
adminRouter.post("/organizacoes/:id/arquivar", async (req, res, next) => {
  try {
    requirePlatformAdmin(req);
    const [eu] = await db.select().from(users).where(eq(users.id, req.user!.id));
    if (!eu.totpSecret) {
      return res.status(409).json({
        message: "Ative o segundo fator (em Configurações) para poder arquivar organizações.",
        code: "totp_required",
      });
    }
    if (!(await verifyPassword(String(req.body?.password ?? ""), eu.passwordHash))) {
      return res.status(401).json({ message: "Senha incorreta." });
    }
    if (!verifyTotp(eu.totpSecret, String(req.body?.code ?? ""))) {
      return res.status(401).json({ message: "Código do autenticador incorreto." });
    }

    const arquivada = await archiveOrganization(req.params.id);
    await audit(req, "organizacao.arquivar", "organization", arquivada.id, {
      name: arquivada.name,
    });
    res.json(arquivada);
  } catch (err) {
    next(err);
  }
});

/** Volta para a carteira suspensa. Reativar é outra decisão, outro clique. */
adminRouter.post("/organizacoes/:id/restaurar", async (req, res, next) => {
  try {
    requirePlatformAdmin(req);
    const restaurada = await restoreOrganization(req.params.id);
    await audit(req, "organizacao.restaurar", "organization", restaurada.id, {
      name: restaurada.name,
    });
    res.json(restaurada);
  } catch (err) {
    next(err);
  }
});

/* ---------------- usuários ---------------- */

/**
 * Todo mundo que entra no painel: organizador, afiliado, cambista — e, para
 * a plataforma, os administradores gerais também.
 *
 * O recorte é o de sempre: o organizador vê as pessoas da organização dele;
 * a plataforma vê todas e pode filtrar por uma. Hash de senha e segredo do
 * autenticador **nunca** saem daqui: a tela mostra só se o segundo fator
 * está ligado.
 */
adminRouter.get("/usuarios", async (req, res, next) => {
  try {
    const org = orgOf(req);
    // O filtro vem da barra de endereço: o que não for "plataforma" nem um
    // id válido é ignorado, em vez de virar erro de conversão no Postgres.
    const bruta = !org && req.query.organizacao ? String(req.query.organizacao) : null;
    const pedida =
      bruta === "plataforma" || (bruta && /^[0-9a-f-]{36}$/i.test(bruta)) ? bruta : null;
    const papel = req.query.papel ? String(req.query.papel) : null;
    const busca = req.query.q ? `%${String(req.query.q).trim().toLowerCase()}%` : null;

    const rows = await db.execute(sql`
      SELECT u.id, u.name, u.email, u.phone, u.role, u.active,
             (u.totp_secret IS NOT NULL) AS "doisFatores",
             u.created_at AS "createdAt",
             u.organization_id AS "organizationId",
             o.name AS "organizacao",
             (o.archived_at IS NOT NULL) AS "organizacaoArquivada",
             a.code AS "codigo", a.kind AS "tipo", a.status AS "cadastro",
             a.pix_key AS "pix", a.commission_pct AS "comissaoPct"
        FROM users u
        LEFT JOIN organizations o ON o.id = u.organization_id
        LEFT JOIN affiliates a ON a.user_id = u.id
       WHERE TRUE
         ${org ? sql`AND u.organization_id = ${org}::uuid` : sql``}
         ${pedida === "plataforma" ? sql`AND u.organization_id IS NULL` : sql``}
         ${pedida && pedida !== "plataforma" ? sql`AND u.organization_id = ${pedida}::uuid` : sql``}
         ${papel ? sql`AND u.role::text = ${papel}` : sql``}
         ${busca ? sql`AND (lower(u.name) LIKE ${busca} OR lower(u.email) LIKE ${busca} OR coalesce(u.phone, '') LIKE ${busca})` : sql``}
       ORDER BY u.created_at DESC
       LIMIT 500
    `);
    res.json(rows.rows);
  } catch (err) {
    next(err);
  }
});

/**
 * Confere que o usuário está no recorte de quem pede. Mesma regra de
 * campanha: fora do recorte, não existe (404). E administrador geral só é
 * alcançado pela plataforma.
 */
async function assertUserInScope(req: Request, userId: string) {
  const [alvo] = await db.select().from(users).where(eq(users.id, userId));
  const org = orgOf(req);
  if (!alvo || (org && alvo.organizationId !== org)) {
    throw new OrgScopeError("Usuário não encontrado.");
  }
  return alvo;
}

/**
 * Definir uma senha nova para alguém — o conserto de quando a pessoa esqueceu
 * ou quando o navegador preencheu a senha errada no cadastro. Quem define
 * vê a senha, então a pessoa deve trocá-la ao entrar.
 */
adminRouter.post("/usuarios/:id/senha", async (req, res, next) => {
  try {
    const alvo = await assertUserInScope(req, req.params.id);
    if (alvo.id === req.user!.id) {
      return res
        .status(400)
        .json({ message: "Para a sua própria senha, use \"Trocar minha senha\"." });
    }
    const senha = String(req.body?.password ?? "");
    const invalida = senhaInvalida(senha, alvo.role);
    if (invalida) return res.status(400).json({ message: invalida });

    await db
      .update(users)
      .set({ passwordHash: await hashPassword(senha) })
      .where(eq(users.id, alvo.id));
    await audit(req, "usuario.senha.redefinida", "user", alvo.id, { email: alvo.email });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

/** Ligar e desligar o acesso. Desligar não apaga: venda e comissão ficam. */
adminRouter.patch("/usuarios/:id", async (req, res, next) => {
  try {
    const alvo = await assertUserInScope(req, req.params.id);
    if (typeof req.body?.active !== "boolean") {
      return res.status(400).json({ message: "Informe se o acesso fica ativo." });
    }
    if (alvo.id === req.user!.id) {
      return res.status(400).json({ message: "Você não pode desligar o próprio acesso." });
    }
    await db.update(users).set({ active: req.body.active }).where(eq(users.id, alvo.id));
    await audit(req, req.body.active ? "usuario.ativar" : "usuario.desativar", "user", alvo.id, {
      email: alvo.email,
    });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

/* ---------------- estorno ---------------- */

/**
 * Estorna um pedido pago, na mão.
 *
 * Existe porque nem todo estorno vem do provedor: venda em dinheiro do
 * cambista, cobrança contestada por fora, erro de operação. O efeito é o
 * mesmo do webhook — cota de volta, comissão revertida, taxa cancelada.
 *
 * **Não devolve dinheiro.** Quem devolve é o Pix ou o caixa; isto acerta o
 * que o sistema registrou. Misturar as duas coisas faria o botão parecer que
 * paga, e ninguém confere depois.
 */
adminRouter.post("/orders/:code/estornar", async (req, res, next) => {
  try {
    const [pedido] = await db
      .select({ id: orders.id, campaignId: orders.campaignId })
      .from(orders)
      .where(eq(orders.code, Number(req.params.code)));
    if (!pedido) return res.status(404).json({ message: "Pedido não encontrado." });

    await assertCampaignInScope(req, pedido.campaignId);

    const r = await refundOrder(pedido.id);
    if (!r) {
      return res
        .status(409)
        .json({ message: "Este pedido não está pago — não há o que estornar." });
    }

    await audit(req, "order.refund", "order", pedido.id, {
      liberadas: r.liberadas.length,
      comissoes: r.comissoes,
      comissaoJaPagaCents: r.comissaoJaPagaCents,
      taxaCanceladaCents: r.taxaCanceladaCents,
    });

    res.json({
      estornado: r.order.code,
      cotasLiberadas: r.liberadas.length,
      comissoesRevertidas: r.comissoes,
      comissaoJaPagaCents: r.comissaoJaPagaCents,
      taxaCanceladaCents: r.taxaCanceladaCents,
      premiadasLiberadas: r.premiadasLiberadas,
      // A cota não volta depois do sorteio: o quadro do sorteio é congelado.
      cotasCongeladas: r.liberadas.length === 0,
    });
  } catch (err) {
    next(err);
  }
});

/* ---------------- cobrança da plataforma ---------------- */

/**
 * A carteira: quanto cada organização deve, e em que contrato está.
 */
adminRouter.get("/cobranca", async (req, res, next) => {
  try {
    requirePlatformAdmin(req);
    res.json({
      rotulos: BILLING_LABEL,
      carteira: await carteiraDaPlataforma(),
    });
  } catch (err) {
    next(err);
  }
});

/** Troca o contrato de uma organização: mensalidade OU comissão. */
adminRouter.put("/cobranca/:id/plano", async (req, res, next) => {
  try {
    requirePlatformAdmin(req);
    const plano = await setBillingPlan(req.params.id, req.body ?? {});
    await audit(req, "cobranca.plano", "organization", req.params.id, plano);
    res.json(plano);
  } catch (err) {
    next(err);
  }
});

/** Dá baixa no que está em aberto. */
adminRouter.post("/cobranca/:id/baixa", async (req, res, next) => {
  try {
    requirePlatformAdmin(req);
    const quantas = await darBaixa(req.params.id);
    await audit(req, "cobranca.baixa", "organization", req.params.id, { quantas });
    res.json({ baixadas: quantas });
  } catch (err) {
    next(err);
  }
});

/** Força o lançamento da mensalidade sem esperar o relógio. */
adminRouter.post("/cobranca/mensalidades", async (req, res, next) => {
  try {
    requirePlatformAdmin(req);
    const lancadas = await lancarMensalidades();
    await audit(req, "cobranca.mensalidades", "settings", "cobranca", { lancadas });
    res.json({ lancadas });
  } catch (err) {
    next(err);
  }
});

/**
 * O extrato de uma organização.
 *
 * O organizador vê o **dele**: o que deve à plataforma faz parte do caixa
 * dele, e esconder isso seria cobrar sem mostrar a conta.
 */
adminRouter.get("/cobranca/extrato", async (req, res, next) => {
  try {
    const org = orgOf(req);
    const pedida = req.query.organizacao ? String(req.query.organizacao) : null;

    // O parâmetro é conferido ANTES de cair no padrão. A versão anterior
    // ignorava a organização pedida e devolvia a própria — não vazava nada,
    // mas responder 200 a um pedido pelo extrato do vizinho faz parecer que
    // a leitura funcionou. Foi o `npm run isolation` que pegou isto.
    if (org && pedida && pedida !== org) {
      return res.status(404).json({ message: "Organização não encontrada." });
    }

    const alvo = org ?? pedida;
    if (!alvo) {
      return res.status(400).json({ message: "Escolha a organização." });
    }

    res.json({
      plano: await planOfOrganization(alvo),
      rotulos: BILLING_LABEL,
      ...(await extratoDa(alvo)),
    });
  } catch (err) {
    next(err);
  }
});

/* ---------------- antifraude ---------------- */

adminRouter.get("/antifraude", async (req, res, next) => {
  try {
    requirePlatformAdmin(req);
    res.json({
      limits: await getLimits(),
      resumo: await fraudSummary(),
      eventos: await listEvents(80),
      bloqueios: await listBlocks(),
    });
  } catch (err) {
    next(err);
  }
});

adminRouter.put("/antifraude/limites", async (req, res, next) => {
  try {
    requirePlatformAdmin(req);
    const saved = await setLimits(req.body ?? {});
    await audit(req, "antifraude.limites", "settings", "antifraude", saved);
    res.json(saved);
  } catch (err) {
    if (err instanceof Error && /mínimo|máximo/.test(err.message)) {
      return res.status(400).json({ message: err.message });
    }
    next(err);
  }
});

/**
 * Bloqueio manual. Telefone entra em dígitos; IP e aparelho entram já em
 * hash — o administrador copia o hash da lista de eventos, e assim o dado
 * cru nunca precisa transitar.
 */
adminRouter.post("/antifraude/bloqueios", async (req, res, next) => {
  try {
    requirePlatformAdmin(req);
    const kind = String(req.body?.kind) as "phone" | "device" | "ip";
    if (!["phone", "device", "ip"].includes(kind)) {
      return res.status(400).json({ message: "Tipo de bloqueio inválido." });
    }
    const bruto = String(req.body?.value ?? "").trim();
    if (bruto.length < 4) {
      return res.status(400).json({ message: "Informe o valor a bloquear." });
    }

    const value = kind === "phone" ? normalizePhone(bruto) : bruto;
    const created = await block({
      kind,
      value,
      reason: req.body?.reason ? String(req.body.reason) : undefined,
      expiresAt: req.body?.expiresAt ? new Date(req.body.expiresAt) : null,
    });

    await audit(req, "antifraude.bloqueio", "fraud_block", created.id, { kind });
    res.status(201).json(created);
  } catch (err) {
    next(err);
  }
});

adminRouter.delete("/antifraude/bloqueios/:id", async (req, res, next) => {
  try {
    requirePlatformAdmin(req);
    const removed = await unblock(req.params.id);
    if (!removed) return res.status(404).json({ message: "Bloqueio não encontrado." });
    await audit(req, "antifraude.desbloqueio", "fraud_block", removed.id);
    res.json({ removed: removed.id });
  } catch (err) {
    next(err);
  }
});

/* ---------------- meios de pagamento ---------------- */

adminRouter.get("/payment-methods", async (_req, res, next) => {
  try {
    res.json(await getPaymentMethods());
  } catch (err) {
    next(err);
  }
});

/**
 * Liga e desliga os meios de pagamento do app inteiro. Desligar o Pix online
 * deixa a rifa vendendo só pela mão do cambista — é uma escolha válida, e é
 * por isso que a regra exige apenas que sobre um meio ligado.
 */
adminRouter.put("/payment-methods", async (req, res, next) => {
  try {
    requirePlatformAdmin(req);
    const saved = await setPaymentMethods(req.body ?? {});
    await audit(req, "payment_methods.update", "settings", "meios_pagamento", saved);
    res.json(saved);
  } catch (err) {
    if (err instanceof Error && err.message.includes("ao menos um")) {
      return res.status(400).json({ message: err.message });
    }
    next(err);
  }
});

/* ---------------- financeiro ---------------- */

adminRouter.get("/finance", async (req, res, next) => {
  try {
    const org = orgOf(req);
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
      .where(org ? eq(users.organizationId, org) : sql`TRUE`)
      .groupBy(commissions.affiliateId, affiliates.code, users.name, affiliates.pixKey);

    // O saque é do afiliado, e o afiliado tem organização: sem o recorte, o
    // organizador veria (e pagaria) pedido de saque que não é dele.
    const requested = await db
      .select({ payout: payouts })
      .from(payouts)
      .innerJoin(affiliates, eq(affiliates.id, payouts.affiliateId))
      .innerJoin(users, eq(users.id, affiliates.userId))
      .where(
        and(
          eq(payouts.status, "requested"),
          org ? eq(users.organizationId, org) : sql`TRUE`,
        ),
      )
      .orderBy(desc(payouts.requestedAt));

    res.json({
      perAffiliate: pending,
      payoutsRequested: requested.map((r) => r.payout),
    });
  } catch (err) {
    next(err);
  }
});

/** Libera as comissões cuja carência já venceu. Roda sob demanda e no job. */
adminRouter.post("/finance/release", async (req, res, next) => {
  try {
    const org = orgOf(req);
    const released = await db
      .update(commissions)
      .set({ status: "available" })
      .where(
        and(
          eq(commissions.status, "pending"),
          sql`${commissions.availableAt} <= now()`,
          // Liberar comissão é liberar dinheiro. O organizador libera a dele.
          org
            ? sql`${commissions.campaignId} IN (
                SELECT id FROM campaigns WHERE organization_id = ${org}::uuid
              )`
            : sql`TRUE`,
        ),
      )
      .returning({ id: commissions.id });

    await audit(req, "commission.release", "commission", undefined, { count: released.length });
    res.json({ released: released.length });
  } catch (err) {
    next(err);
  }
});

adminRouter.post("/payouts/:id/paid", async (req, res, next) => {
  try {
    const [saque] = await db
      .select({ affiliateId: payouts.affiliateId })
      .from(payouts)
      .where(eq(payouts.id, req.params.id));
    if (!saque) return res.status(404).json({ message: "Saque não encontrado." });
    await assertAffiliateInScope(req, saque.affiliateId);

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
    await assertCampaignInScope(req, req.params.id);
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
    await assertCampaignInScope(req, req.params.id);
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

adminRouter.get("/audit", async (req, res, next) => {
  try {
    // A trilha guarda ação de todo mundo, inclusive de outras organizações.
    // Recortar por organização daria falsa completude; melhor não entregar.
    requirePlatformAdmin(req);
    res.json(
      await db.select().from(auditLog).orderBy(desc(auditLog.createdAt)).limit(200),
    );
  } catch (err) {
    next(err);
  }
});
