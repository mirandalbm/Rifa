/**
 * Banner de divulgação da rifa (regras em `shared/bannerDivulgacao.ts`): a
 * imagem que a organização põe em cima da rifa — a empresa dela, uma ONG.
 * Não é termo da rifa (prêmio, preço, autorização): muda a qualquer hora,
 * antes ou depois de publicar. O recorte é da rota (`assertCampaignInScope`).
 *
 * - A imagem nunca é servida como veio: reprocessada em WebP 1200×400, sem
 *   metadados, aberta com teto de 40 megapixels, conferida **antes** de gravar.
 * - O título é o texto alternativo, na régua da legenda, e passa pela
 *   varredura do Pix por fora. A imagem, quem lê é a plataforma pela denúncia.
 * - Público só com a rifa no ar (rascunho é 404, como toda rota por `slug`) e
 *   a promotora nem arquivada nem banida.
 */
import sharp from "sharp";
import { and, eq, isNull, ne } from "drizzle-orm";
import { db } from "../db";
import { campaignBannersDivulgacao, campaigns, organizations } from "@shared/schema";
import {
  BANNER_DIVULGACAO_ALTURA,
  BANNER_DIVULGACAO_LARGURA,
  problemaNoTituloDoBanner,
  urlDoBannerDeDivulgacao,
} from "@shared/bannerDivulgacao";
import { emSegundoPlano } from "./push";
import { varrerTextoDoOrganizador } from "./seguranca";

/** O que o navegador manda: até 5 MB de imagem (a tela reduz antes). */
const IMAGEM_MAX_BYTES = 5 * 1024 * 1024;

export class BannerDivulgacaoError extends Error {
  constructor(
    message: string,
    public status = 422,
  ) {
    super(message);
  }
}

async function processarImagem(dataUrl: unknown): Promise<Buffer> {
  const m = typeof dataUrl === "string" ? /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/i.exec(dataUrl) : null;
  if (!m) throw new BannerDivulgacaoError("Envie uma imagem em JPG, PNG ou WebP.");
  const bruto = Buffer.from(m[2], "base64");
  if (bruto.length > IMAGEM_MAX_BYTES) throw new BannerDivulgacaoError("A imagem passa de 5 MB.", 413);
  try {
    return await sharp(bruto, { limitInputPixels: 40_000_000 })
      .rotate()
      .resize(BANNER_DIVULGACAO_LARGURA, BANNER_DIVULGACAO_ALTURA, { fit: "cover", position: "attention" })
      .webp({ quality: 82 })
      .toBuffer();
  } catch {
    throw new BannerDivulgacaoError("Não consegui ler essa imagem. Envie em JPG ou PNG.");
  }
}

/**
 * Grava (ou troca) o banner. Sem `imagem` no corpo, muda só o título do que
 * já existe; com imagem, troca os dois. Tudo é conferido antes de gravar.
 */
export async function salvarBannerDeDivulgacao(
  campaignId: string,
  organizationId: string | null,
  corpo: { imagem?: unknown; titulo?: unknown },
) {
  const problema = problemaNoTituloDoBanner(corpo.titulo);
  if (problema) throw new BannerDivulgacaoError(problema);
  const titulo = String(corpo.titulo).trim().replace(/\s+/g, " ");
  const bytes = corpo.imagem === undefined ? null : await processarImagem(corpo.imagem);

  let linha;
  if (bytes) {
    [linha] = await db
      .insert(campaignBannersDivulgacao)
      .values({ campaignId, titulo, mime: "image/webp", bytes })
      .onConflictDoUpdate({
        target: campaignBannersDivulgacao.campaignId,
        set: { titulo, mime: "image/webp", bytes, updatedAt: new Date() },
      })
      .returning({ titulo: campaignBannersDivulgacao.titulo, em: campaignBannersDivulgacao.updatedAt });
  } else {
    [linha] = await db
      .update(campaignBannersDivulgacao)
      .set({ titulo, updatedAt: new Date() })
      .where(eq(campaignBannersDivulgacao.campaignId, campaignId))
      .returning({ titulo: campaignBannersDivulgacao.titulo, em: campaignBannersDivulgacao.updatedAt });
    if (!linha) throw new BannerDivulgacaoError("Escolha a imagem do banner.");
  }
  if (organizationId) {
    emSegundoPlano(
      varrerTextoDoOrganizador({ organizationId, campaignId, onde: "banner de divulgação da rifa", texto: titulo }),
      "varredura",
    );
  }
  return linha;
}

export async function removerBannerDeDivulgacao(campaignId: string) {
  await db.delete(campaignBannersDivulgacao).where(eq(campaignBannersDivulgacao.campaignId, campaignId));
}

/** Para o painel (no recorte da rota): o título e a data, sem os bytes. */
export async function bannerDoPainel(campaignId: string) {
  const [b] = await db
    .select({ titulo: campaignBannersDivulgacao.titulo, em: campaignBannersDivulgacao.updatedAt })
    .from(campaignBannersDivulgacao)
    .where(eq(campaignBannersDivulgacao.campaignId, campaignId));
  return b ?? null;
}

export async function imagemDoPainel(campaignId: string) {
  const [b] = await db
    .select({ mime: campaignBannersDivulgacao.mime, bytes: campaignBannersDivulgacao.bytes })
    .from(campaignBannersDivulgacao)
    .where(eq(campaignBannersDivulgacao.campaignId, campaignId));
  return b ?? null;
}

/** A régua do público: rifa publicada ou já sorteada (nunca rascunho) e promotora nem arquivada nem banida. */
const noAr = (slug: string) =>
  and(
    eq(campaigns.slug, slug),
    ne(campaigns.status, "draft"),
    isNull(organizations.archivedAt),
    isNull(organizations.banidaEm),
  );

/** O que a página da rifa recebe: o endereço e o texto alternativo, ou nada. */
export async function bannerPublico(campaignId: string, slug: string) {
  const [b] = await db
    .select({ titulo: campaignBannersDivulgacao.titulo, em: campaignBannersDivulgacao.updatedAt })
    .from(campaignBannersDivulgacao)
    .where(eq(campaignBannersDivulgacao.campaignId, campaignId));
  return b ? { url: urlDoBannerDeDivulgacao(slug, b.em), titulo: b.titulo } : null;
}

export async function imagemPublica(slug: string) {
  const [b] = await db
    .select({ mime: campaignBannersDivulgacao.mime, bytes: campaignBannersDivulgacao.bytes })
    .from(campaignBannersDivulgacao)
    .innerJoin(campaigns, eq(campaigns.id, campaignBannersDivulgacao.campaignId))
    .innerJoin(organizations, eq(organizations.id, campaigns.organizationId))
    .where(noAr(slug));
  return b ?? null;
}
