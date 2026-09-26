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
  campaignGanhadorFotos,
  campaignStats,
  campaigns,
  draws,
  organizacaoCapas,
  organizacaoFotos,
  organizations,
  seguidores,
  stories,
} from "@shared/schema";
import {
  bioAutomatica,
  seguidoPor,
  validarBio,
  validarDestaque,
  validarLinks,
  type CorDeDestaque,
  type LinkDoPerfil,
} from "@shared/perfil";
import { cidadeUf } from "@shared/endereco";
import { withUrls } from "./media";
import { urlDaFotoDoGanhador } from "./ganhador";

export class PerfilError extends Error {
  constructor(message: string, readonly status = 400) {
    super(message);
    this.name = "PerfilError";
  }
}

const FOTO_MAX_BYTES = 5 * 1024 * 1024;

/** A cor de destaque gravada, ou `null` (a da plataforma). */
export function destaqueDa(org: { destaqueClaro: string | null; destaqueEscuro: string | null }): CorDeDestaque | null {
  return org.destaqueClaro && org.destaqueEscuro
    ? { claro: org.destaqueClaro, escuro: org.destaqueEscuro }
    : null;
}

export const urlDaFoto = (slug: string, em: Date | null | undefined) =>
  em ? `/api/public/o/${slug}/foto?v=${em.getTime()}` : null;
export const urlDaCapa = (slug: string, em: Date | null | undefined) =>
  em ? `/api/public/o/${slug}/capa?v=${em.getTime()}` : null;
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

/**
 * O story mais novo no ar da organização (nulo sem story) — acende o anel
 * da foto. Subconsulta por linha: a lista de seguidos é curta.
 */
// A referência à organização vai com o nome da tabela escrito: dentro da
// subconsulta o drizzle a deixaria sem prefixo, e "id" viraria o do story.
const ultimoStorySql = sql<Date | null>`(
  select max(s.created_at) from ${stories} s
   where s.organization_id = "organizations"."id" and s.expira_em > now()
)`.mapWith((v) => (v instanceof Date ? v : v ? new Date(`${String(v).replace(" ", "T")}Z`) : null));
// (Coluna `timestamp` sem fuso guarda UTC; em SQL cru o driver devolve texto.)

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
  // Depois do sorteio, a capa do destaque é a foto do ganhador, se houver.
  const fotosDoGanhador = sorteadas.length
    ? await db
        .select({ campaignId: campaignGanhadorFotos.campaignId, em: campaignGanhadorFotos.updatedAt })
        .from(campaignGanhadorFotos)
        .where(inArray(campaignGanhadorFotos.campaignId, sorteadas.map((r) => r.campaign.id)))
    : [];
  const ganhadorEm = new Map(fotosDoGanhador.map((f) => [f.campaignId, f.em]));

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
  const [capa] = await db
    .select({ updatedAt: organizacaoCapas.updatedAt })
    .from(organizacaoCapas)
    .where(eq(organizacaoCapas.organizationId, org.id));
  const [ultimo] = await db
    .select({ em: ultimoStorySql })
    .from(organizations)
    .where(eq(organizations.id, org.id));

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
    foto: urlDaFoto(org.slug, foto?.updatedAt),
    capa: urlDaCapa(org.slug, capa?.updatedAt),
    ultimoStory: ultimo?.em ?? null,
    destaque: destaqueDa(org),
    links: org.links ?? [],
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
      capa:
        urlDaFotoDoGanhador(r.campaign.slug, ganhadorEm.get(r.campaign.id)) ??
        midias.get(r.campaign.id)?.find((m) => m.role !== "video")?.url ??
        null,
      comGanhador: ganhadorEm.has(r.campaign.id),
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
      ultimoStory: ultimoStorySql,
    })
    .from(seguidores)
    .innerJoin(organizations, eq(organizations.id, seguidores.organizationId))
    .leftJoin(organizacaoFotos, eq(organizacaoFotos.organizationId, organizations.id))
    .where(and(eq(seguidores.buyerId, buyerId), isNull(organizations.archivedAt)))
    .orderBy(desc(seguidores.createdAt));
  return linhas.map((l) => ({
    slug: l.slug,
    nome: l.nome,
    foto: urlDaFoto(l.slug, l.foto),
    ultimoStory: l.ultimoStory,
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

export async function capaDoPerfil(slug: string) {
  const org = await organizacaoPublica(slug);
  const [c] = await db
    .select()
    .from(organizacaoCapas)
    .where(eq(organizacaoCapas.organizationId, org.id));
  return c ?? null;
}

function lerDataUrl(dataUrl: string, oQue: string): Buffer {
  const m = /^data:(image\/[a-z0-9.+-]+);base64,([A-Za-z0-9+/=]+)$/i.exec(dataUrl);
  if (!m) throw new PerfilError("Envie uma imagem (JPG, PNG ou WebP).");
  const bruto = Buffer.from(m[2], "base64");
  if (bruto.length > FOTO_MAX_BYTES) throw new PerfilError(`A ${oQue} passa de 5 MB.`);
  return bruto;
}

/**
 * A capa é reprocessada em 1500×500 (3:1, a proporção do topo do perfil),
 * WebP, sem metadados de localização.
 */
async function processarCapa(dataUrl: string): Promise<Buffer> {
  const bruto = lerDataUrl(dataUrl, "capa");
  try {
    return await sharp(bruto, { limitInputPixels: 40_000_000 })
      .rotate()
      .resize(1500, 500, { fit: "cover", position: "attention" })
      .webp({ quality: 80 })
      .toBuffer();
  } catch {
    throw new PerfilError("Não consegui ler essa imagem. Envie a capa em JPG ou PNG.");
  }
}

/**
 * A foto é reprocessada (quadrada, 400 px, WebP, sem metadados): o arquivo
 * enviado nunca é servido como veio. `null` apaga a foto.
 */
async function processarFoto(dataUrl: string): Promise<Buffer> {
  const bruto = lerDataUrl(dataUrl, "foto");
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

export interface EntradaDoPerfil {
  bio?: unknown;
  foto?: string | null;
  capa?: string | null;
  destaque?: unknown;
  links?: unknown;
}

/**
 * Foto, capa, bio, cor de destaque e links. Só o que veio no corpo muda;
 * tudo é conferido antes de abrir a transação — imagem que não abre ou cor
 * sem contraste não deixa nada pela metade.
 */
export async function salvarPerfil(orgId: string, entrada: EntradaDoPerfil) {
  const campos = ["bio", "foto", "capa", "destaque", "links"] as const;
  if (campos.every((c) => entrada[c] === undefined)) throw new PerfilError("Nada para salvar.");

  const regra = <T>(f: () => T): T => {
    try {
      return f();
    } catch (e) {
      throw new PerfilError((e as Error).message);
    }
  };
  const bio = entrada.bio !== undefined ? regra(() => validarBio(entrada.bio)) : undefined;
  const destaque =
    entrada.destaque !== undefined ? regra(() => validarDestaque(entrada.destaque)) : undefined;
  const links: LinkDoPerfil[] | undefined =
    entrada.links !== undefined ? regra(() => validarLinks(entrada.links)) : undefined;
  const foto =
    typeof entrada.foto === "string" ? await processarFoto(entrada.foto) : entrada.foto;
  const capa =
    typeof entrada.capa === "string" ? await processarCapa(entrada.capa) : entrada.capa;

  await db.transaction(async (tx) => {
    const [org] = await tx
      .select({ id: organizations.id })
      .from(organizations)
      .where(eq(organizations.id, orgId));
    if (!org) throw new PerfilError("Organização não encontrada.", 404);

    const mudar: Partial<typeof organizations.$inferInsert> = {};
    if (bio !== undefined) mudar.bio = bio;
    if (destaque !== undefined) {
      mudar.destaqueClaro = destaque?.claro ?? null;
      mudar.destaqueEscuro = destaque?.escuro ?? null;
    }
    if (links !== undefined) mudar.links = links;
    if (Object.keys(mudar).length) {
      await tx.update(organizations).set(mudar).where(eq(organizations.id, orgId));
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
    if (capa === null) {
      await tx.delete(organizacaoCapas).where(eq(organizacaoCapas.organizationId, orgId));
    } else if (capa) {
      await tx
        .insert(organizacaoCapas)
        .values({ organizationId: orgId, mime: "image/webp", bytes: capa })
        .onConflictDoUpdate({
          target: organizacaoCapas.organizationId,
          set: { bytes: capa, mime: "image/webp", updatedAt: new Date() },
        });
    }
  });
  return { ok: true };
}
