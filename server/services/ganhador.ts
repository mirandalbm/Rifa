/**
 * Foto do ganhador: só depois do sorteio. Vira a capa da rifa nos destaques
 * do perfil e aparece no resultado da página da rifa.
 */
import { eq } from "drizzle-orm";
import sharp from "sharp";
import { db } from "../db";
import { campaignGanhadorFotos, campaigns } from "@shared/schema";

export class GanhadorError extends Error {
  constructor(message: string, readonly status = 400) {
    super(message);
    this.name = "GanhadorError";
  }
}

const MAX_BYTES = 5 * 1024 * 1024;

export const urlDaFotoDoGanhador = (slug: string, em: Date | null | undefined) =>
  em ? `/api/public/campaigns/${slug}/foto-ganhador?v=${em.getTime()}` : null;

/** `null` tira a foto. O recorte da campanha é conferido na rota, antes. */
export async function salvarFotoDoGanhador(campaignId: string, dataUrl: unknown) {
  const [c] = await db.select({ status: campaigns.status }).from(campaigns).where(eq(campaigns.id, campaignId));
  if (!c) throw new GanhadorError("Campanha não encontrada.", 404);
  if (c.status !== "drawn") throw new GanhadorError("A foto do ganhador entra depois do sorteio.", 409);

  if (dataUrl === null) {
    await db.delete(campaignGanhadorFotos).where(eq(campaignGanhadorFotos.campaignId, campaignId));
    return;
  }
  const m = /^data:(image\/(png|jpeg|webp));base64,([A-Za-z0-9+/=]+)$/i.exec(String(dataUrl ?? ""));
  if (!m) throw new GanhadorError("Envie a foto em JPG, PNG ou WebP.");
  const bruto = Buffer.from(m[3], "base64");
  if (bruto.length > MAX_BYTES) throw new GanhadorError("A foto passa de 5 MB.");
  let bytes: Buffer;
  try {
    bytes = await sharp(bruto, { limitInputPixels: 40_000_000 })
      .rotate()
      .resize(1080, 1350, { fit: "cover", position: "attention" })
      .webp({ quality: 82 })
      .toBuffer();
  } catch {
    throw new GanhadorError("Não consegui ler essa imagem. Envie a foto em JPG ou PNG.");
  }
  const agora = new Date();
  await db
    .insert(campaignGanhadorFotos)
    .values({ campaignId, mime: "image/webp", bytes, updatedAt: agora })
    .onConflictDoUpdate({ target: campaignGanhadorFotos.campaignId, set: { bytes, mime: "image/webp", updatedAt: agora } });
}

export async function fotoDoGanhador(campaignId: string) {
  const [f] = await db.select().from(campaignGanhadorFotos).where(eq(campaignGanhadorFotos.campaignId, campaignId));
  return f ?? null;
}
