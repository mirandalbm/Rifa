/**
 * Mídia da campanha: 1 banner, até 5 fotos e 1 vídeo de no máximo 60 s
 * (docs/PLANO-RIFA.md §4.2).
 *
 * O limite do vídeo não é decorativo — é o que o comprador vê prometido na
 * tela. Por isso a duração é MEDIDA aqui, lendo o arquivo já armazenado, e
 * não aceita o que o navegador informou.
 */
import { and, eq } from "drizzle-orm";
import { db } from "../db";
import { campaignMedia, MAX_PHOTOS, MAX_VIDEO_SECONDS } from "@shared/schema";
import { storage, mediaKey, type UploadTicket } from "./storage";
import { probeImage, probeVideoDuration, UnreadableMediaError } from "./probe";
import { processImage, srcSet, removeVariants, type ImageVariant } from "./images";

export type MediaRole = "banner" | "photo" | "video";

export class MediaRuleError extends Error {
  constructor(message: string, readonly status = 422) {
    super(message);
    this.name = "MediaRuleError";
  }
}

interface RoleRule {
  max: number;
  mimes: string[];
  maxBytes: number;
  minWidth?: number;
  label: string;
}

export const RULES: Record<MediaRole, RoleRule> = {
  banner: {
    max: 1,
    mimes: ["image/jpeg", "image/png", "image/webp"],
    maxBytes: 8 * 1024 * 1024,
    minWidth: 1200,
    label: "banner",
  },
  photo: {
    max: MAX_PHOTOS,
    mimes: ["image/jpeg", "image/png", "image/webp"],
    maxBytes: 8 * 1024 * 1024,
    minWidth: 1080,
    label: "foto do prêmio",
  },
  video: {
    // WebM ficou de fora de propósito: sem saber medir, não dá para prometer
    // o limite de 60 s — e prometer sem medir é pior do que não aceitar.
    max: 1,
    mimes: ["video/mp4", "video/quicktime"],
    maxBytes: 300 * 1024 * 1024,
    label: "vídeo do prêmio",
  },
};

/** Quantas peças daquele papel a campanha já tem. */
async function countRole(campaignId: string, role: MediaRole): Promise<number> {
  const rows = await db
    .select({ id: campaignMedia.id })
    .from(campaignMedia)
    .where(and(eq(campaignMedia.campaignId, campaignId), eq(campaignMedia.role, role)));
  return rows.length;
}

/**
 * Passo 1: valida o que dá para validar antes do upload (papel livre, tipo e
 * tamanho declarado) e devolve a URL assinada.
 */
export async function requestUpload(params: {
  campaignId: string;
  role: MediaRole;
  filename: string;
  mime: string;
  bytes: number;
}): Promise<UploadTicket> {
  const rule = RULES[params.role];
  if (!rule) throw new MediaRuleError("Tipo de mídia inválido.", 400);

  const used = await countRole(params.campaignId, params.role);
  if (used >= rule.max) {
    throw new MediaRuleError(
      rule.max === 1
        ? `Esta rifa já tem ${rule.label}. Remova o atual para enviar outro.`
        : `São no máximo ${rule.max} ${rule.label}s.`,
      409,
    );
  }

  if (!rule.mimes.includes(params.mime)) {
    throw new MediaRuleError(
      `Formato não aceito para ${rule.label}: envie ${rule.mimes.join(", ")}.`,
      415,
    );
  }

  if (params.bytes > rule.maxBytes) {
    throw new MediaRuleError(
      `Arquivo de ${(params.bytes / 1024 / 1024).toFixed(1)} MB — o limite para ${rule.label} é ${rule.maxBytes / 1024 / 1024} MB.`,
    );
  }

  return storage().presignUpload({
    key: mediaKey(params.campaignId, params.role, params.filename),
    contentType: params.mime,
  });
}

/**
 * Passo 2: o arquivo já está no armazenamento. Aqui ele é medido de verdade
 * e só então vira mídia da campanha. Se reprovar, o objeto é apagado — não
 * deixamos lixo pago no bucket.
 */
export async function ingestUpload(params: {
  campaignId: string;
  role: MediaRole;
  storageKey: string;
  altText?: string;
  mime: string;
}) {
  try {
    return await ingest(params);
  } catch (err) {
    // Arquivo recusado não fica ocupando bucket, seja qual for o motivo.
    if (err instanceof MediaRuleError) {
      await storage().remove(params.storageKey).catch(() => {});
    }
    throw err;
  }
}

async function ingest(params: {
  campaignId: string;
  role: MediaRole;
  storageKey: string;
  altText?: string;
  mime: string;
}) {
  const rule = RULES[params.role];
  if (!rule) throw new MediaRuleError("Tipo de mídia inválido.", 400);

  if (params.role === "photo" && !params.altText?.trim()) {
    throw new MediaRuleError("Descreva a foto no texto alternativo.", 400);
  }

  const store = storage();

  let size: number;
  try {
    size = await store.size(params.storageKey);
  } catch {
    throw new MediaRuleError("O arquivo não chegou ao armazenamento.", 409);
  }

  if (size === 0) throw new MediaRuleError("O arquivo chegou vazio.");
  if (size > rule.maxBytes) {
    throw new MediaRuleError(
      `Arquivo maior que o limite de ${rule.maxBytes / 1024 / 1024} MB.`,
    );
  }

  const read = store.reader(params.storageKey);
  let width: number | null = null;
  let height: number | null = null;
  let durationS: number | null = null;
  let variants: ImageVariant[] | null = null;
  let lqip: string | null = null;

  try {
    if (params.role === "video") {
      const seconds = await probeVideoDuration(read, size);
      if (seconds > MAX_VIDEO_SECONDS) {
        throw new MediaRuleError(
          `O vídeo tem ${formatDuration(seconds)} — o limite é ${MAX_VIDEO_SECONDS}s.`,
        );
      }
      durationS = Math.round(seconds);
    } else {
      const head = await read(0, 64 * 1024);
      const image = probeImage(head);
      width = image.width;
      height = image.height;

      if (rule.minWidth && width < rule.minWidth) {
        throw new MediaRuleError(
          `A imagem tem ${width}px de largura — o mínimo para ${rule.label} é ${rule.minWidth}px.`,
        );
      }

      // Só depois de aprovada a imagem vira variantes: processar antes seria
      // gastar CPU e bucket com arquivo que vai ser recusado.
      const processed = await processImage(await store.readAll(params.storageKey), params.storageKey);
      variants = processed.variants;
      lqip = processed.lqip;
    }
  } catch (err) {
    if (err instanceof MediaRuleError) throw err;
    if (err instanceof UnreadableMediaError) {
      throw new MediaRuleError(err.message);
    }
    throw err;
  }

  const position = await countRole(params.campaignId, params.role);

  const [created] = await db
    .insert(campaignMedia)
    .values({
      campaignId: params.campaignId,
      role: params.role,
      position,
      storageKey: params.storageKey,
      mime: params.mime,
      width,
      height,
      durationS,
      variants,
      lqip,
      altText: params.altText?.trim() || null,
      bytes: size,
      status: "ready",
    })
    .returning();

  return withUrls(created);
}

export async function removeMedia(mediaId: string) {
  const [removed] = await db
    .delete(campaignMedia)
    .where(eq(campaignMedia.id, mediaId))
    .returning();
  if (!removed) return null;

  // Mídia fora da campanha não tem por que continuar custando armazenamento.
  await storage().remove(removed.storageKey).catch(() => {});
  await removeVariants(removed.variants);
  return removed;
}

export async function listMedia(campaignId: string) {
  const rows = await db
    .select()
    .from(campaignMedia)
    .where(eq(campaignMedia.campaignId, campaignId))
    .orderBy(campaignMedia.role, campaignMedia.position);
  return rows.map(withUrls);
}

type MediaRow = typeof campaignMedia.$inferSelect;

/** Endereços prontos para o `<img>`: original, srcset por formato e o blur. */
export function withUrls(m: MediaRow) {
  const store = storage();
  const url = (key: string) => store.publicUrl(key);
  return {
    ...m,
    url: url(m.storageKey),
    srcSetAvif: srcSet(m.variants, "avif", url),
    srcSetWebp: srcSet(m.variants, "webp", url),
  };
}

function formatDuration(seconds: number): string {
  const s = Math.round(seconds);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
