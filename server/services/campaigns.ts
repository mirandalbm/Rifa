/**
 * Regras de campanha. A mais importante: o total de cotas trava na
 * publicação — mudar depois alteraria a chance de quem já comprou.
 */
import { and, eq, sql } from "drizzle-orm";
import { db } from "../db";
import {
  campaigns,
  campaignMedia,
  campaignStats,
  MIN_QUOTAS,
  MAX_QUOTAS,
  MAX_PHOTOS,
  MAX_VIDEO_SECONDS,
  type Campaign,
} from "@shared/schema";
import { commitSeed } from "./draw";

export class CampaignRuleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CampaignRuleError";
  }
}

/** Campos congelados depois que a campanha vai ao ar. */
const LOCKED_AFTER_PUBLISH = [
  "totalQuotas",
  "priceCents",
  "drawSeedHash",
  "slug",
] as const;

export function assertEditable(
  campaign: Campaign,
  changes: Record<string, unknown>,
) {
  if (campaign.status === "draft") return;

  for (const field of LOCKED_AFTER_PUBLISH) {
    if (field in changes && changes[field] !== campaign[field]) {
      throw new CampaignRuleError(
        field === "totalQuotas"
          ? "O total de cotas trava ao publicar: mudá-lo agora alteraria a chance de quem já comprou."
          : `O campo "${field}" não pode mudar depois da publicação.`,
      );
    }
  }
}

export function assertQuotaRange(total: number) {
  if (!Number.isInteger(total) || total < MIN_QUOTAS || total > MAX_QUOTAS) {
    throw new CampaignRuleError(
      `O total de cotas precisa estar entre ${MIN_QUOTAS} e ${MAX_QUOTAS.toLocaleString("pt-BR")}.`,
    );
  }
}

/** O que impede uma campanha de ir ao ar. */
export async function publishBlockers(campaignId: string): Promise<string[]> {
  const [campaign] = await db.select().from(campaigns).where(eq(campaigns.id, campaignId));
  if (!campaign) return ["Campanha não encontrada."];

  const media = await db
    .select()
    .from(campaignMedia)
    .where(eq(campaignMedia.campaignId, campaignId));

  const blockers: string[] = [];
  const ready = media.filter((m) => m.status === "ready");

  if (!ready.some((m) => m.role === "banner")) {
    blockers.push("Falta o banner da rifa.");
  }
  const photos = ready.filter((m) => m.role === "photo");
  if (photos.length === 0) {
    blockers.push("Envie ao menos 1 foto do prêmio.");
  }
  if (photos.length > MAX_PHOTOS) {
    blockers.push(`São no máximo ${MAX_PHOTOS} fotos do prêmio.`);
  }
  const videos = ready.filter((m) => m.role === "video");
  if (videos.length > 1) {
    blockers.push("Só é permitido 1 vídeo por campanha.");
  }
  const longVideo = videos.find((v) => (v.durationS ?? 0) > MAX_VIDEO_SECONDS);
  if (longVideo) {
    blockers.push(
      `O vídeo tem ${longVideo.durationS}s — o limite é ${MAX_VIDEO_SECONDS}s.`,
    );
  }
  if (!campaign.authorizationCode) {
    blockers.push(
      "Informe o certificado de autorização da SPA/MF: a autorização é da campanha, não da plataforma.",
    );
  }
  if (!campaign.drawAt) {
    blockers.push("Defina a data do sorteio.");
  }

  return blockers;
}

/**
 * Publica a campanha. É aqui que a semente do sorteio é comprometida:
 * o hash vai ao ar ANTES da primeira venda, e a semente só depois do sorteio.
 */
export async function publishCampaign(campaignId: string): Promise<Campaign> {
  const blockers = await publishBlockers(campaignId);
  if (blockers.length > 0) {
    throw new CampaignRuleError(blockers.join(" "));
  }

  return db.transaction(async (tx) => {
    const [campaign] = await tx
      .select()
      .from(campaigns)
      .where(eq(campaigns.id, campaignId));

    if (!campaign) throw new CampaignRuleError("Campanha não encontrada.");
    if (campaign.status !== "draft") {
      throw new CampaignRuleError("Esta campanha já foi publicada.");
    }
    assertQuotaRange(campaign.totalQuotas);

    // Promotora arquivada não põe rifa no ar. O FOR SHARE segura a linha da
    // organização até o fim da transação: um arquivamento simultâneo espera
    // esta publicação terminar, e uma publicação simultânea espera ele.
    const org = await tx.execute(sql`
      SELECT archived_at FROM organizations
       WHERE id = ${campaign.organizationId}::uuid
       FOR SHARE
    `);
    if ((org.rows[0] as { archived_at: Date | null } | undefined)?.archived_at) {
      throw new CampaignRuleError("A organização desta rifa está arquivada.");
    }

    const { seed, seedHash } = commitSeed();

    // A semente fica guardada no draw; a campanha publica só o hash.
    await tx.execute(sql`
      INSERT INTO draws (campaign_id, seed, seed_hash)
      VALUES (${campaignId}::uuid, ${seed}, ${seedHash})
    `);

    await tx
      .insert(campaignStats)
      .values({ campaignId })
      .onConflictDoNothing();

    const [updated] = await tx
      .update(campaigns)
      .set({ status: "published", publishedAt: new Date(), drawSeedHash: seedHash })
      .where(eq(campaigns.id, campaignId))
      .returning();

    return updated;
  });
}

/** Vitrine: campanhas no ar, em destaque primeiro. */
export async function listPublicCampaigns() {
  return db
    .select({
      campaign: campaigns,
      stats: campaignStats,
    })
    .from(campaigns)
    .leftJoin(campaignStats, eq(campaignStats.campaignId, campaigns.id))
    .where(eq(campaigns.status, "published"))
    .orderBy(
      sql`${campaigns.featured} DESC, ${campaigns.sortWeight} DESC, ${campaigns.publishedAt} DESC`,
    );
}

export async function campaignBySlug(slug: string) {
  const [row] = await db
    .select({ campaign: campaigns, stats: campaignStats })
    .from(campaigns)
    .leftJoin(campaignStats, eq(campaignStats.campaignId, campaigns.id))
    .where(eq(campaigns.slug, slug));
  if (!row) return null;

  const media = await db
    .select()
    .from(campaignMedia)
    .where(
      and(eq(campaignMedia.campaignId, row.campaign.id), eq(campaignMedia.status, "ready")),
    )
    .orderBy(campaignMedia.role, campaignMedia.position);

  return { ...row, media };
}
