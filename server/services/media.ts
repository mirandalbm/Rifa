/**
 * Mídia da campanha: o carrossel da publicação, como no Instagram — o
 * banner (a capa) e, junto, fotos e vídeos até 10 peças no total
 * (`MAX_CARROSSEL`). Vídeo até 3 min entra como reels; até 15 min, como
 * vídeo do feed (`formatoDoVideo()` em `shared/publicacao.ts`).
 *
 * O limite do vídeo não é decorativo — é o que o comprador vê prometido na
 * tela. Por isso a duração é MEDIDA aqui, lendo o arquivo já armazenado, e
 * não aceita o que o navegador informou.
 */
import { and, eq, inArray, isNull } from "drizzle-orm";
import { db } from "../db";
import { campaignMedia, MAX_PHOTOS, MAX_VIDEO_SECONDS } from "@shared/schema";
import { randomUUID } from "node:crypto";
import { storage, mediaKey, chaveDaCampanha, LocalDiskStorage, type UploadTicket } from "./storage";
import { comArquivoTemporario, processadorDeVideo } from "./videoProcessor";
import { emSegundoPlano } from "./push";
import { POSTER_BAIXAR_ATE_BYTES, chaveDoPoster, posterPublico } from "@shared/poster";
import { probeImage, probeVideoDimensions, probeVideoDuration, UnreadableMediaError } from "./probe";
import { processImage, srcSet, removeVariants, type ImageVariant } from "./images";
import { MAX_CARROSSEL, duracao, formatoDoVideo } from "@shared/publicacao";

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
    // o limite de duração — e prometer sem medir é pior do que não aceitar.
    max: MAX_CARROSSEL - 1,
    mimes: ["video/mp4", "video/quicktime"],
    maxBytes: 2 * 1024 * 1024 * 1024,
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
 * Fotos e vídeos dividem o carrossel: juntos, até `MAX_CARROSSEL - 1` (a
 * vaga que sobra é do banner). A posição também é comum aos dois — é a
 * ordem em que aparecem.
 */
async function pecasDoCarrossel(campaignId: string): Promise<number> {
  const rows = await db
    .select({ id: campaignMedia.id })
    .from(campaignMedia)
    .where(and(eq(campaignMedia.campaignId, campaignId), inArray(campaignMedia.role, ["photo", "video"])));
  return rows.length;
}

async function cabe(campaignId: string, role: MediaRole) {
  if (role === "banner") return (await countRole(campaignId, role)) < 1;
  return (await pecasDoCarrossel(campaignId)) < MAX_CARROSSEL - 1;
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

  if (!(await cabe(params.campaignId, params.role))) {
    throw new MediaRuleError(
      params.role === "banner"
        ? `Esta rifa já tem ${rule.label}. Remova o atual para enviar outro.`
        : `O carrossel tem no máximo ${MAX_CARROSSEL} peças, contando o banner. Remova uma para enviar outra.`,
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
    key: mediaKey(params.campaignId, params.role, params.mime),
    contentType: params.mime,
    // O que o passo 1 prometeu (já conferido contra o teto da regra) é o teto do corpo do envio.
    maxBytes: params.bytes,
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
  // A chave vem do navegador: só vale a que o passo 1 gerou para esta rifa.
  // Conferida antes de tudo — inclusive da limpeza abaixo, que apaga o
  // objeto da chave recusada.
  if (!chaveDaCampanha(params.storageKey, params.campaignId, params.role)) {
    throw new MediaRuleError("Envio inválido para esta rifa. Envie o arquivo de novo.", 400);
  }
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
      if (seconds > MAX_VIDEO_SECONDS || !formatoDoVideo(seconds)) {
        throw new MediaRuleError(
          `O vídeo tem ${duracao(seconds)} — o limite é ${duracao(MAX_VIDEO_SECONDS)} (até ${duracao(180)} entra como reels).`,
        );
      }
      durationS = Math.round(seconds);
      // A proporção decide o formato da publicação (4:5, 1:1, 1,91:1, 9:16).
      const dim = await probeVideoDimensions(read, size);
      width = dim?.width ?? null;
      height = dim?.height ?? null;
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
      // Medido pelo cabeçalho, antes de abrir: acima do teto, o processamento
      // recusaria com erro genérico (e abrir custaria a memória do processo).
      if (width * height > 40_000_000) {
        throw new MediaRuleError(
          `A imagem tem ${width} × ${height} pixels — grande demais. Envie com até 40 megapixels.`,
        );
      }

      // Só depois de aprovada a imagem vira variantes: processar antes seria
      // gastar CPU e bucket com arquivo que vai ser recusado.
      const processed = await processImage(await store.readAll(params.storageKey), params.storageKey);
      variants = processed.variants;
      lqip = processed.lqip;
      // Guardada como a imagem é **exibida** (foto de celular em pé vem
      // deitada no cabeçalho, com a rotação no EXIF).
      width = processed.largura;
      height = processed.altura;
    }
  } catch (err) {
    if (err instanceof MediaRuleError) throw err;
    if (err instanceof UnreadableMediaError) {
      throw new MediaRuleError(err.message);
    }
    throw err;
  }

  // Conferido de novo aqui: dois envios ao mesmo tempo passaram pelo passo 1.
  if (!(await cabe(params.campaignId, params.role))) {
    throw new MediaRuleError(`O carrossel tem no máximo ${MAX_CARROSSEL} peças, contando o banner.`, 409);
  }
  const position = params.role === "banner" ? 0 : await pecasDoCarrossel(params.campaignId);

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

  // O pôster vem depois, em segundo plano: a resposta não espera o ffmpeg e a
  // falha dele (ou a falta dele) deixa o vídeo como está, sem pôster.
  if (params.role === "video") {
    emSegundoPlano(gerarPosterDaMidia(created.id, params.campaignId, params.storageKey, size), "pôster do vídeo");
  }

  return withUrls(created);
}

/**
 * Tira o pôster do vídeo já armazenado e o grava junto da mídia (`posterKey`).
 * Nunca lança para quem chamou a ingestão — mas aqui dentro erro é erro, e
 * quem chama (`emSegundoPlano`) o leva ao log. Sem processador ou sem
 * quadro, não grava nada.
 *
 * Disco local: o `ffmpeg` lê o arquivo onde ele está. Bucket: baixa para um
 * temporário, só até `POSTER_BAIXAR_ATE_BYTES` — acima disso fica sem pôster
 * (é o caso que o Cloudflare Stream resolve, no ponto de encaixe).
 */
export async function gerarPosterDaMidia(mediaId: string, campaignId: string, storageKey: string, bytes: number) {
  const store = storage();
  const gerar = async (arquivo: string) => processadorDeVideo().gerarPoster(arquivo);
  let poster: Buffer | null;
  if (store instanceof LocalDiskStorage) {
    await store.size(storageKey); // traz da cópia se o disco perdeu o arquivo
    poster = await gerar(store.caminho(storageKey));
  } else if (bytes <= POSTER_BAIXAR_ATE_BYTES) {
    const ext = storageKey.slice(storageKey.lastIndexOf("."));
    poster = await comArquivoTemporario(await store.readAll(storageKey), ext, gerar);
  } else {
    poster = null;
  }
  if (!poster) return null;

  const chave = chaveDoPoster(campaignId, randomUUID());
  await store.write(chave, poster, "image/webp");
  // Só entra se a mídia ainda existe e ainda não tem pôster: removida no
  // meio do caminho, o pôster recém-gravado é lixo e sai.
  const [gravado] = await db
    .update(campaignMedia)
    .set({ posterKey: chave })
    .where(and(eq(campaignMedia.id, mediaId), isNull(campaignMedia.posterKey)))
    .returning({ id: campaignMedia.id });
  if (!gravado) {
    await store.remove(chave).catch(() => {});
    return null;
  }
  return chave;
}

export async function removeMedia(mediaId: string) {
  const [removed] = await db
    .delete(campaignMedia)
    .where(eq(campaignMedia.id, mediaId))
    .returning();
  if (!removed) return null;

  // Mídia fora da campanha não tem por que continuar custando armazenamento.
  await storage().remove(removed.storageKey).catch(() => {});
  if (removed.posterKey) await storage().remove(removed.posterKey).catch(() => {});
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
    // Só vídeo tem pôster; sem ele (sem ffmpeg, falha), `null`.
    posterUrl: posterPublico(m.posterKey ? url(m.posterKey) : null),
    srcSetAvif: srcSet(m.variants, "avif", url),
    srcSetWebp: srcSet(m.variants, "webp", url),
  };
}

