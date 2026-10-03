/**
 * A entidade beneficiada pela rifa e o banner dela (regras em
 * `shared/bannerDivulgacao.ts`): só existe quando o organizador destina a
 * rifa a uma ONG, fundação ou outra organização. Não é termo da rifa
 * (prêmio, preço, autorização): muda a qualquer hora, antes ou depois de
 * publicar. O recorte é da rota (`assertCampaignInScope`).
 *
 * - As imagens nunca são servidas como vieram: um envio só, reprocessado em
 *   WebP (o banner 1200×400 e a grande até 1200 px), sem metadados, aberto
 *   com teto de 40 megapixels, conferido **antes** de gravar.
 * - Nome e texto na régua da legenda (sem link e sem telefone), com a
 *   varredura do Pix por fora; site e redes em campo próprio, conferidos.
 * - Público só com a rifa publicada ou sorteada (rascunho é 404, como toda
 *   rota por `slug`) e a promotora nem arquivada nem banida.
 */
import sharp from "sharp";
import { and, eq, isNull, ne } from "drizzle-orm";
import { db } from "../db";
import { campaignBannersDivulgacao, campaigns, organizations } from "@shared/schema";
import {
  BANNER_DIVULGACAO_ALTURA,
  BANNER_DIVULGACAO_LARGURA,
  EntidadeInvalida,
  IMAGEM_GRANDE_LADO,
  urlDoBannerDeDivulgacao,
  validarEntidade,
  type DadosDaEntidade,
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

async function processarImagens(dataUrl: unknown): Promise<{ banner: Buffer; grande: Buffer }> {
  const m = typeof dataUrl === "string" ? /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/i.exec(dataUrl) : null;
  if (!m) throw new BannerDivulgacaoError("Envie uma imagem em JPG, PNG ou WebP.");
  const bruto = Buffer.from(m[2], "base64");
  if (bruto.length > IMAGEM_MAX_BYTES) throw new BannerDivulgacaoError("A imagem passa de 5 MB.", 413);
  try {
    const abrir = () => sharp(bruto, { limitInputPixels: 40_000_000 }).rotate();
    const [banner, grande] = await Promise.all([
      abrir()
        .resize(BANNER_DIVULGACAO_LARGURA, BANNER_DIVULGACAO_ALTURA, { fit: "cover", position: "attention" })
        .webp({ quality: 82 })
        .toBuffer(),
      abrir()
        .resize(IMAGEM_GRANDE_LADO, IMAGEM_GRANDE_LADO, { fit: "inside", withoutEnlargement: true })
        .webp({ quality: 82 })
        .toBuffer(),
    ]);
    return { banner, grande };
  } catch {
    throw new BannerDivulgacaoError("Não consegui ler essa imagem. Envie em JPG ou PNG.");
  }
}

function conferir(corpo: unknown): DadosDaEntidade {
  try {
    return validarEntidade(corpo);
  } catch (e) {
    if (e instanceof EntidadeInvalida) throw new BannerDivulgacaoError(e.message);
    throw e;
  }
}

/**
 * Grava (ou troca) a entidade. Sem `imagem` no corpo, muda só os dados do
 * que já existe; com imagem, troca tudo. Tudo é conferido antes de gravar.
 */
export async function salvarBannerDeDivulgacao(
  campaignId: string,
  organizationId: string | null,
  corpo: Record<string, unknown>,
) {
  const dados = conferir(corpo);
  const imagens = corpo.imagem === undefined ? null : await processarImagens(corpo.imagem);

  let linha;
  if (imagens) {
    const valores = { ...dados, mime: "image/webp", bytes: imagens.banner, bytesGrande: imagens.grande };
    [linha] = await db
      .insert(campaignBannersDivulgacao)
      .values({ campaignId, ...valores })
      .onConflictDoUpdate({ target: campaignBannersDivulgacao.campaignId, set: { ...valores, updatedAt: new Date() } })
      .returning({ nome: campaignBannersDivulgacao.nome });
  } else {
    [linha] = await db
      .update(campaignBannersDivulgacao)
      .set({ ...dados, updatedAt: new Date() })
      .where(eq(campaignBannersDivulgacao.campaignId, campaignId))
      .returning({ nome: campaignBannersDivulgacao.nome });
    if (!linha) throw new BannerDivulgacaoError("Escolha a imagem da entidade.");
  }
  if (organizationId) {
    emSegundoPlano(
      varrerTextoDoOrganizador({
        organizationId,
        campaignId,
        onde: "entidade beneficiada da rifa",
        texto: `${dados.nome}\n${dados.texto}`,
      }),
      "varredura",
    );
  }
  return { ...dados, nome: linha.nome };
}

export async function removerBannerDeDivulgacao(campaignId: string) {
  await db.delete(campaignBannersDivulgacao).where(eq(campaignBannersDivulgacao.campaignId, campaignId));
}

const dadosSemBytes = {
  nome: campaignBannersDivulgacao.nome,
  texto: campaignBannersDivulgacao.texto,
  site: campaignBannersDivulgacao.site,
  redes: campaignBannersDivulgacao.redes,
  em: campaignBannersDivulgacao.updatedAt,
};

/** Para o painel (no recorte da rota): os dados e a data, sem os bytes. */
export async function bannerDoPainel(campaignId: string) {
  const [b] = await db.select(dadosSemBytes).from(campaignBannersDivulgacao).where(eq(campaignBannersDivulgacao.campaignId, campaignId));
  return b ?? null;
}

export async function imagemDoPainel(campaignId: string) {
  const [b] = await db
    .select({ mime: campaignBannersDivulgacao.mime, bytes: campaignBannersDivulgacao.bytes })
    .from(campaignBannersDivulgacao)
    .where(eq(campaignBannersDivulgacao.campaignId, campaignId));
  return b ?? null;
}

/** A régua do público: rifa publicada ou já sorteada (nunca rascunho) e promotora no ar. */
const noAr = (slug: string) =>
  and(eq(campaigns.slug, slug), ne(campaigns.status, "draft"), isNull(organizations.archivedAt), isNull(organizations.banidaEm));

/** O que a página da rifa recebe (a rota já conferiu que ela não é rascunho). */
export async function bannerPublico(campaignId: string, slug: string) {
  // A mesma régua da imagem: promotora arquivada ou banida, a entidade não sai.
  const [b] = await db
    .select(dadosSemBytes)
    .from(campaignBannersDivulgacao)
    .innerJoin(campaigns, eq(campaigns.id, campaignBannersDivulgacao.campaignId))
    .innerJoin(organizations, eq(organizations.id, campaigns.organizationId))
    .where(and(eq(campaignBannersDivulgacao.campaignId, campaignId), noAr(slug)));
  if (!b) return null;
  return {
    nome: b.nome,
    texto: b.texto,
    site: b.site,
    redes: b.redes,
    url: urlDoBannerDeDivulgacao(slug, b.em),
    urlGrande: urlDoBannerDeDivulgacao(slug, b.em, true),
  };
}

export async function imagemPublica(slug: string, grande: boolean) {
  const [b] = await db
    .select({
      mime: campaignBannersDivulgacao.mime,
      bytes: grande ? campaignBannersDivulgacao.bytesGrande : campaignBannersDivulgacao.bytes,
    })
    .from(campaignBannersDivulgacao)
    .innerJoin(campaigns, eq(campaigns.id, campaignBannersDivulgacao.campaignId))
    .innerJoin(organizations, eq(organizations.id, campaigns.organizationId))
    .where(noAr(slug));
  return b ?? null;
}
