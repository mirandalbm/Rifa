/**
 * Perfil público do organizador (`/o/:slug`): topo, contadores, bio,
 * destaques (rifas sorteadas) e grade (rifas no ar), e o seguir com sino.
 *
 * Seguir é `INSERT … ON CONFLICT DO NOTHING` na chave (organização,
 * comprador) — o contador só anda quando a linha entrou de verdade, na mesma
 * transação. Dois toques em "Seguir" não viram dois seguidores.
 */
import { and, asc, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import sharp from "sharp";
import { db } from "../db";
import {
  buyers,
  campaignMedia,
  campaignStats,
  campaigns,
  draws,
  organizacaoFotos,
  organizations,
  seguidores,
} from "@shared/schema";
import { bioAutomatica, seguidoPor, validarBio } from "@shared/perfil";
import { cidadeUf } from "@shared/endereco";
import { withUrls } from "./media";

export class PerfilError extends Error {
  constructor(message: string, readonly status = 400) {
    super(message);
    this.name = "PerfilError";
  }
}

const FOTO_MAX_BYTES = 5 * 1024 * 1024;
const FOTOS_NO_CARROSSEL = 5;

/** A organização visível pelo endereço. Arquivada "não existe". */
async function organizacaoPublica(slug: string) {
  const [org] = await db
    .select()
    .from(organizations)
    .where(and(eq(organizations.slug, slug), isNull(organizations.archivedAt)));
  if (!org) throw new PerfilError("Perfil não encontrado.", 404);
  return org;
}

/** Banner, até 5 fotos e 1 vídeo de cada rifa, na ordem do carrossel. */
async function midiasDas(ids: string[]) {
  const porRifa = new Map<string, ReturnType<typeof withUrls>[]>();
  if (ids.length === 0) return porRifa;
  const linhas = await db
    .select()
    .from(campaignMedia)
    .where(and(inArray(campaignMedia.campaignId, ids), eq(campaignMedia.status, "ready")))
    .orderBy(asc(campaignMedia.position));
  const ordem = { banner: 0, photo: 1, video: 2 } as const;
  linhas.sort((a, b) => ordem[a.role] - ordem[b.role] || a.position - b.position);
  for (const m of linhas) {
    const lista = porRifa.get(m.campaignId) ?? [];
    const fotos = lista.filter((x) => x.role === "photo").length;
    const videos = lista.filter((x) => x.role === "video").length;
    const banners = lista.filter((x) => x.role === "banner").length;
    if (m.role === "photo" && fotos >= FOTOS_NO_CARROSSEL) continue;
    if (m.role === "video" && videos >= 1) continue;
    if (m.role === "banner" && banners >= 1) continue;
    lista.push(withUrls(m));
    porRifa.set(m.campaignId, lista);
  }
  return porRifa;
}

export async function perfilPublico(slug: string, buyerId?: string | null) {
  const org = await organizacaoPublica(slug);

  const rifas = await db
    .select({ campaign: campaigns, stats: campaignStats })
    .from(campaigns)
    .leftJoin(campaignStats, eq(campaignStats.campaignId, campaigns.id))
    .where(
      and(
        eq(campaigns.organizationId, org.id),
        inArray(campaigns.status, ["published", "closed", "drawn"]),
      ),
    )
    .orderBy(desc(campaigns.publishedAt));

  const noAr = rifas.filter((r) => r.campaign.status !== "drawn");
  const sorteadas = rifas.filter((r) => r.campaign.status === "drawn");

  // A bio segue a rifa no ar com o sorteio mais próximo.
  const atual =
    [...noAr]
      .filter((r) => r.campaign.status === "published")
      .sort(
        (a, b) =>
          (a.campaign.drawAt?.getTime() ?? Infinity) - (b.campaign.drawAt?.getTime() ?? Infinity),
      )[0]?.campaign ?? null;

  const sorteios = sorteadas.length
    ? await db
        .select({ campaignId: draws.campaignId, executedAt: draws.executedAt })
        .from(draws)
        .where(inArray(draws.campaignId, sorteadas.map((r) => r.campaign.id)))
    : [];
  const sorteadaEm = new Map(sorteios.map((d) => [d.campaignId, d.executedAt]));

  const midias = await midiasDas(rifas.map((r) => r.campaign.id));

  // Só quem ligou o perfil público entra em "seguido por" (LGPD).
  const publicos = await db
    .select({ nome: buyers.name })
    .from(seguidores)
    .innerJoin(buyers, eq(buyers.id, seguidores.buyerId))
    .where(
      and(
        eq(seguidores.organizationId, org.id),
        eq(buyers.perfilPublico, true),
        isNull(buyers.excluidoEm),
      ),
    )
    .orderBy(desc(seguidores.createdAt))
    .limit(2);

  const [eu] = buyerId
    ? await db
        .select({ sino: seguidores.sino })
        .from(seguidores)
        .where(and(eq(seguidores.organizationId, org.id), eq(seguidores.buyerId, buyerId)))
    : [];

  const [foto] = await db
    .select({ updatedAt: organizacaoFotos.updatedAt })
    .from(organizacaoFotos)
    .where(eq(organizacaoFotos.organizationId, org.id));

  const cartao = (r: (typeof rifas)[number]) => ({
    id: r.campaign.id,
    slug: r.campaign.slug,
    title: r.campaign.title,
    prizeTitle: r.campaign.prizeTitle,
    priceCents: r.campaign.priceCents,
    totalQuotas: r.campaign.totalQuotas,
    soldCount: r.stats?.soldCount ?? 0,
    drawAt: r.campaign.drawAt,
    status: r.campaign.status,
    midias: (midias.get(r.campaign.id) ?? []).map((m) => ({
      role: m.role,
      url: m.url,
      srcSet: m.srcSetWebp,
      lqip: m.lqip,
      mime: m.mime,
    })),
  });

  return {
    slug: org.slug,
    nome: org.name,
    foto: foto ? `/api/public/o/${org.slug}/foto?v=${foto.updatedAt.getTime()}` : null,
    local: cidadeUf(org.cidade, org.uf),
    desde: org.createdAt,
    cnpj: org.cnpj,
    contato: org.contato,
    rifasRealizadas: sorteadas.length,
    seguidores: org.seguidoresCount,
    seguidoPor: seguidoPor(publicos.map((p) => p.nome ?? ""), org.seguidoresCount),
    bio: org.bio,
    bioAutomatica: bioAutomatica(atual),
    autorizacoes: rifas
      .map((r) => r.campaign.authorizationCode)
      .filter((c): c is string => Boolean(c)),
    seguindo: Boolean(eu),
    sino: eu?.sino ?? false,
    destaques: sorteadas.map((r) => ({
      slug: r.campaign.slug,
      prizeTitle: r.campaign.prizeTitle,
      sorteadaEm: sorteadaEm.get(r.campaign.id) ?? r.campaign.drawAt,
      capa: midias.get(r.campaign.id)?.find((m) => m.role !== "video")?.url ?? null,
    })),
    rifas: noAr.map(cartao),
  };
}

/* ------------------------------------------------------------------ *
 * Seguir e sino
 * ------------------------------------------------------------------ */

export async function seguir(slug: string, buyerId: string) {
  const org = await organizacaoPublica(slug);
  await db.transaction(async (tx) => {
    const entrou = await tx
      .insert(seguidores)
      .values({ organizationId: org.id, buyerId, sino: true })
      .onConflictDoNothing()
      .returning({ buyerId: seguidores.buyerId });
    if (entrou.length > 0) {
      await tx
        .update(organizations)
        .set({ seguidoresCount: sql`${organizations.seguidoresCount} + 1` })
        .where(eq(organizations.id, org.id));
    }
  });
  return estadoDoSeguir(org.id, buyerId);
}

export async function deixarDeSeguir(slug: string, buyerId: string) {
  const org = await organizacaoPublica(slug);
  await db.transaction(async (tx) => {
    const saiu = await tx
      .delete(seguidores)
      .where(and(eq(seguidores.organizationId, org.id), eq(seguidores.buyerId, buyerId)))
      .returning({ buyerId: seguidores.buyerId });
    if (saiu.length > 0) {
      await tx
        .update(organizations)
        .set({ seguidoresCount: sql`greatest(${organizations.seguidoresCount} - 1, 0)` })
        .where(eq(organizations.id, org.id));
    }
  });
  return estadoDoSeguir(org.id, buyerId);
}

/** O sino só existe para quem segue: sem seguir, não há o que ligar. */
export async function ligarSino(slug: string, buyerId: string, ligado: boolean) {
  const org = await organizacaoPublica(slug);
  const mudou = await db
    .update(seguidores)
    .set({ sino: ligado })
    .where(and(eq(seguidores.organizationId, org.id), eq(seguidores.buyerId, buyerId)))
    .returning({ sino: seguidores.sino });
  if (mudou.length === 0) throw new PerfilError("Siga o perfil para ligar o sino.", 409);
  return estadoDoSeguir(org.id, buyerId);
}

async function estadoDoSeguir(orgId: string, buyerId: string) {
  const [org] = await db
    .select({ seguidores: organizations.seguidoresCount })
    .from(organizations)
    .where(eq(organizations.id, orgId));
  const [eu] = await db
    .select({ sino: seguidores.sino })
    .from(seguidores)
    .where(and(eq(seguidores.organizationId, orgId), eq(seguidores.buyerId, buyerId)));
  return { seguindo: Boolean(eu), sino: eu?.sino ?? false, seguidores: org?.seguidores ?? 0 };
}

/** Os perfis que o comprador segue — a fileira de bolinhas da vitrine. */
export async function perfisSeguidos(buyerId: string) {
  const linhas = await db
    .select({
      slug: organizations.slug,
      nome: organizations.name,
      foto: organizacaoFotos.updatedAt,
    })
    .from(seguidores)
    .innerJoin(organizations, eq(organizations.id, seguidores.organizationId))
    .leftJoin(organizacaoFotos, eq(organizacaoFotos.organizationId, organizations.id))
    .where(and(eq(seguidores.buyerId, buyerId), isNull(organizations.archivedAt)))
    .orderBy(desc(seguidores.createdAt));
  return linhas.map((l) => ({
    slug: l.slug,
    nome: l.nome,
    foto: l.foto ? `/api/public/o/${l.slug}/foto?v=${l.foto.getTime()}` : null,
  }));
}

/* ------------------------------------------------------------------ *
 * Foto e bio (painel)
 * ------------------------------------------------------------------ */

export async function fotoDoPerfil(slug: string) {
  const org = await organizacaoPublica(slug);
  const [f] = await db
    .select()
    .from(organizacaoFotos)
    .where(eq(organizacaoFotos.organizationId, org.id));
  return f ?? null;
}

/**
 * A foto é reprocessada (quadrada, 400 px, WebP, sem metadados): o arquivo
 * enviado nunca é servido como veio. `null` apaga a foto.
 */
async function processarFoto(dataUrl: string): Promise<Buffer> {
  const m = /^data:(image\/[a-z0-9.+-]+);base64,([A-Za-z0-9+/=]+)$/i.exec(dataUrl);
  if (!m) throw new PerfilError("Envie uma imagem (JPG, PNG ou WebP).");
  const bruto = Buffer.from(m[2], "base64");
  if (bruto.length > FOTO_MAX_BYTES) throw new PerfilError("A foto passa de 5 MB.");
  try {
    return await sharp(bruto, { limitInputPixels: 40_000_000 })
      .rotate()
      .resize(400, 400, { fit: "cover", position: "attention" })
      .webp({ quality: 82 })
      .toBuffer();
  } catch {
    throw new PerfilError("Não consegui ler essa imagem. Envie uma foto em JPG ou PNG.");
  }
}

export async function salvarPerfil(
  orgId: string,
  entrada: { bio?: unknown; foto?: string | null },
) {
  if (entrada.bio === undefined && entrada.foto === undefined) {
    throw new PerfilError("Nada para salvar.");
  }
  let bio: string | null | undefined;
  if (entrada.bio !== undefined) {
    try {
      bio = validarBio(entrada.bio);
    } catch (e) {
      throw new PerfilError((e as Error).message);
    }
  }
  const foto =
    typeof entrada.foto === "string" ? await processarFoto(entrada.foto) : entrada.foto;

  await db.transaction(async (tx) => {
    const [org] = await tx
      .select({ id: organizations.id })
      .from(organizations)
      .where(eq(organizations.id, orgId));
    if (!org) throw new PerfilError("Organização não encontrada.", 404);

    if (bio !== undefined) {
      await tx.update(organizations).set({ bio }).where(eq(organizations.id, orgId));
    }
    if (foto === null) {
      await tx.delete(organizacaoFotos).where(eq(organizacaoFotos.organizationId, orgId));
    } else if (foto) {
      await tx
        .insert(organizacaoFotos)
        .values({ organizationId: orgId, mime: "image/webp", bytes: foto })
        .onConflictDoUpdate({
          target: organizacaoFotos.organizationId,
          set: { bytes: foto, mime: "image/webp", updatedAt: new Date() },
        });
    }
  });
  return { ok: true };
}
