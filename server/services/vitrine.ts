/**
 * Vitrine: banners da plataforma, stories dos organizadores e estados com
 * rifa no ar. As regras (tamanhos, limites, links) moram em
 * `shared/vitrine.ts`; aqui é só banco e imagem.
 *
 * Imagem nunca é servida como veio: tudo passa pelo sharp (gira pelo EXIF,
 * corta no tamanho, WebP, sem metadados de localização).
 */
import { and, asc, desc, eq, gt, inArray, isNull, lte, sql } from "drizzle-orm";
import sharp from "sharp";
import { db } from "../db";
import {
  campaigns,
  organizacaoFotos,
  organizations,
  plataformaBanners,
  stories,
} from "@shared/schema";
import {
  BANNERS_MAX,
  BANNER_TAMANHO,
  STORIES_MAX,
  STORY_TAMANHO,
  bannerNoAr,
  estadosComRifa,
  expiraEm,
  validarBanner,
  validarLegenda,
} from "@shared/vitrine";
import { urlDaFoto } from "./perfil";

export class VitrineError extends Error {
  constructor(message: string, readonly status = 400) {
    super(message);
    this.name = "VitrineError";
  }
}

const IMAGEM_MAX_BYTES = 5 * 1024 * 1024;
// Travas curtas de transação: a contagem e o INSERT não podem ser separados
// por outro INSERT (consultar e depois gravar é sempre corrida).
const TRAVA_BANNERS = 811_101;
const TRAVA_STORIES = 811_102;

function regra<T>(f: () => T): T {
  try {
    return f();
  } catch (e) {
    throw new VitrineError((e as Error).message);
  }
}

async function processar(dataUrl: unknown, largura: number, altura: number): Promise<Buffer> {
  const m = /^data:(image\/(png|jpeg|webp));base64,([A-Za-z0-9+/=]+)$/i.exec(String(dataUrl ?? ""));
  if (!m) throw new VitrineError("Envie uma imagem em JPG, PNG ou WebP.");
  const bruto = Buffer.from(m[3], "base64");
  if (bruto.length > IMAGEM_MAX_BYTES) throw new VitrineError("A imagem passa de 5 MB.");
  try {
    return await sharp(bruto, { limitInputPixels: 40_000_000 })
      .rotate()
      .resize(largura, altura, { fit: "cover", position: "attention" })
      .webp({ quality: 80 })
      .toBuffer();
  } catch {
    throw new VitrineError("Não consegui ler essa imagem. Envie em JPG ou PNG.");
  }
}

/* ------------------------------------------------------------------ *
 * Banners da plataforma
 * ------------------------------------------------------------------ */

const urlDoBanner = (b: { id: string; updatedAt: Date }) =>
  `/api/public/banners/${b.id}/imagem?v=${b.updatedAt.getTime()}`;

const semBytes = {
  id: plataformaBanners.id,
  titulo: plataformaBanners.titulo,
  link: plataformaBanners.link,
  segundos: plataformaBanners.segundos,
  posicao: plataformaBanners.posicao,
  ativo: plataformaBanners.ativo,
  inicio: plataformaBanners.inicio,
  fim: plataformaBanners.fim,
  updatedAt: plataformaBanners.updatedAt,
};

/** Todos os banners, para o painel (inclusive desligados e fora da janela). */
export async function listarBanners() {
  const linhas = await db
    .select(semBytes)
    .from(plataformaBanners)
    .orderBy(asc(plataformaBanners.posicao), asc(plataformaBanners.createdAt));
  const agora = new Date();
  return linhas.map((b) => ({ ...b, imagem: urlDoBanner(b), noAr: bannerNoAr(b, agora) }));
}

/** Só os que estão no ar agora, na ordem — o que a vitrine mostra. */
export async function bannersNoAr() {
  const agora = new Date();
  return (await listarBanners())
    .filter((b) => bannerNoAr(b, agora))
    .map((b) => ({ id: b.id, titulo: b.titulo, link: b.link, segundos: b.segundos, imagem: b.imagem }));
}

export async function criarBanner(entrada: Record<string, unknown>) {
  const dados = regra(() => validarBanner(entrada));
  const bytes = await processar(entrada.imagem, BANNER_TAMANHO.largura, BANNER_TAMANHO.altura);
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(${TRAVA_BANNERS})`);
    const [{ n }] = await tx.select({ n: sql<number>`count(*)::int` }).from(plataformaBanners);
    if (n >= BANNERS_MAX) {
      throw new VitrineError(`No máximo ${BANNERS_MAX} banners. Apague um antes de criar outro.`, 409);
    }
    const [novo] = await tx
      .insert(plataformaBanners)
      .values({ ...dados, posicao: n, mime: "image/webp", bytes })
      .returning(semBytes);
    return { ...novo, imagem: urlDoBanner(novo) };
  });
}

export async function alterarBanner(id: string, entrada: Record<string, unknown>) {
  const [atual] = await db.select(semBytes).from(plataformaBanners).where(eq(plataformaBanners.id, id));
  if (!atual) throw new VitrineError("Banner não encontrado.", 404);
  // Campos que não vieram ficam como estão.
  const dados = regra(() =>
    validarBanner({
      titulo: entrada.titulo ?? atual.titulo,
      link: entrada.link !== undefined ? entrada.link : atual.link,
      segundos: entrada.segundos ?? atual.segundos,
      ativo: entrada.ativo ?? atual.ativo,
      inicio: entrada.inicio !== undefined ? entrada.inicio : atual.inicio,
      fim: entrada.fim !== undefined ? entrada.fim : atual.fim,
    }),
  );
  const bytes =
    entrada.imagem !== undefined
      ? await processar(entrada.imagem, BANNER_TAMANHO.largura, BANNER_TAMANHO.altura)
      : undefined;
  const [feito] = await db
    .update(plataformaBanners)
    .set({ ...dados, ...(bytes ? { bytes, mime: "image/webp" } : {}), updatedAt: new Date() })
    .where(eq(plataformaBanners.id, id))
    .returning(semBytes);
  return { ...feito, imagem: urlDoBanner(feito) };
}

export async function apagarBanner(id: string) {
  const apagados = await db.delete(plataformaBanners).where(eq(plataformaBanners.id, id)).returning({ id: plataformaBanners.id });
  if (apagados.length === 0) throw new VitrineError("Banner não encontrado.", 404);
}

/** Nova ordem: a lista de ids, do primeiro ao último. Precisa ter todos. */
export async function ordenarBanners(ids: unknown) {
  if (!Array.isArray(ids) || ids.some((i) => typeof i !== "string")) {
    throw new VitrineError("Mande a lista de banners na nova ordem.");
  }
  await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(${TRAVA_BANNERS})`);
    const atuais = await tx.select({ id: plataformaBanners.id }).from(plataformaBanners);
    const conjunto = new Set(atuais.map((a) => a.id));
    if (ids.length !== conjunto.size || new Set(ids).size !== ids.length || ids.some((i) => !conjunto.has(i))) {
      throw new VitrineError("A lista precisa ter cada banner uma vez.");
    }
    for (const [posicao, id] of (ids as string[]).entries()) {
      await tx.update(plataformaBanners).set({ posicao }).where(eq(plataformaBanners.id, id));
    }
  });
  return listarBanners();
}

export async function imagemDoBanner(id: string) {
  const [b] = await db
    .select({ bytes: plataformaBanners.bytes, mime: plataformaBanners.mime })
    .from(plataformaBanners)
    .where(eq(plataformaBanners.id, id));
  return b ?? null;
}

/* ------------------------------------------------------------------ *
 * Stories
 * ------------------------------------------------------------------ */

const urlDoStory = (id: string) => `/api/public/stories/${id}/imagem`;

const campoDoStory = {
  id: stories.id,
  organizationId: stories.organizationId,
  legenda: stories.legenda,
  createdAt: stories.createdAt,
  expiraEm: stories.expiraEm,
  rifaSlug: campaigns.slug,
  rifaPremio: campaigns.prizeTitle,
  rifaStatus: campaigns.status,
};

type LinhaDoStory = {
  id: string;
  organizationId: string;
  legenda: string | null;
  createdAt: Date;
  expiraEm: Date;
  rifaSlug: string | null;
  rifaPremio: string | null;
  rifaStatus: string | null;
};

function publico(s: LinhaDoStory) {
  // A rifa só aparece enquanto é pública (publicada, encerrada ou sorteada).
  const rifa =
    s.rifaSlug && s.rifaStatus && s.rifaStatus !== "draft"
      ? { slug: s.rifaSlug, premio: s.rifaPremio ?? "" }
      : null;
  return { id: s.id, imagem: urlDoStory(s.id), legenda: s.legenda, criadoEm: s.createdAt, expiraEm: s.expiraEm, rifa };
}

/** Stories no ar de uma organização (painel, com recorte já conferido). */
export async function storiesDaOrganizacao(orgId: string | null) {
  const linhas = await db
    .select({ ...campoDoStory, organizacao: organizations.name })
    .from(stories)
    .innerJoin(organizations, eq(organizations.id, stories.organizationId))
    .leftJoin(campaigns, eq(campaigns.id, stories.campaignId))
    .where(and(gt(stories.expiraEm, new Date()), orgId ? eq(stories.organizationId, orgId) : undefined))
    .orderBy(desc(stories.createdAt));
  return linhas.map((s) => ({ ...publico(s), organizacao: s.organizacao }));
}

export async function postarStory(
  orgId: string,
  entrada: { imagem?: unknown; legenda?: unknown; campaignId?: unknown },
) {
  const legenda = regra(() => validarLegenda(entrada.legenda));
  const campaignId =
    typeof entrada.campaignId === "string" && entrada.campaignId ? entrada.campaignId : null;
  const bytes = await processar(entrada.imagem, STORY_TAMANHO.largura, STORY_TAMANHO.altura);

  return db.transaction(async (tx) => {
    const [org] = await tx
      .select({ id: organizations.id, arquivada: organizations.archivedAt })
      .from(organizations)
      .where(eq(organizations.id, orgId));
    if (!org || org.arquivada) throw new VitrineError("Organização não encontrada.", 404);
    if (campaignId) {
      // Story leva só para rifa da própria organização, e que já seja pública.
      const [c] = await tx
        .select({ id: campaigns.id })
        .from(campaigns)
        .where(
          and(
            eq(campaigns.id, campaignId),
            eq(campaigns.organizationId, orgId),
            inArray(campaigns.status, ["published", "closed", "drawn"]),
          ),
        );
      if (!c) throw new VitrineError("Escolha uma rifa publicada da sua organização.");
    }
    await tx.execute(sql`select pg_advisory_xact_lock(${TRAVA_STORIES}, hashtext(${orgId}))`);
    const agora = new Date();
    const [{ n }] = await tx
      .select({ n: sql<number>`count(*)::int` })
      .from(stories)
      .where(and(eq(stories.organizationId, orgId), gt(stories.expiraEm, agora)));
    if (n >= STORIES_MAX) {
      throw new VitrineError(`No máximo ${STORIES_MAX} stories no ar. Apague um ou espere vencer.`, 409);
    }
    const [novo] = await tx
      .insert(stories)
      .values({ organizationId: orgId, legenda, campaignId, mime: "image/webp", bytes, createdAt: agora, expiraEm: expiraEm(agora) })
      .returning({ id: stories.id });
    return novo;
  });
}

/** Dono do story (para conferir o recorte **antes** de apagar). */
export async function donoDoStory(id: string) {
  const [s] = await db.select({ organizationId: stories.organizationId }).from(stories).where(eq(stories.id, id));
  return s?.organizationId ?? null;
}

export async function apagarStory(id: string) {
  await db.delete(stories).where(eq(stories.id, id));
}

/** Stories no ar de um perfil público, do mais antigo ao mais novo. */
export async function storiesDoPerfil(slug: string) {
  const [org] = await db
    .select({ id: organizations.id, slug: organizations.slug, nome: organizations.name, foto: organizacaoFotos.updatedAt })
    .from(organizations)
    .leftJoin(organizacaoFotos, eq(organizacaoFotos.organizationId, organizations.id))
    .where(and(eq(organizations.slug, slug), isNull(organizations.archivedAt)));
  if (!org) throw new VitrineError("Perfil não encontrado.", 404);
  const linhas = await db
    .select(campoDoStory)
    .from(stories)
    .leftJoin(campaigns, eq(campaigns.id, stories.campaignId))
    .where(and(eq(stories.organizationId, org.id), gt(stories.expiraEm, new Date())))
    .orderBy(asc(stories.createdAt));
  return {
    slug: org.slug,
    nome: org.nome,
    foto: urlDaFoto(org.slug, org.foto),
    stories: linhas.map(publico),
  };
}

/** O instante do story mais novo no ar de cada organização (acende o anel). */
export async function ultimoStoryPorOrganizacao(orgIds: string[]) {
  if (orgIds.length === 0) return new Map<string, Date>();
  const linhas = await db
    .select({ org: stories.organizationId, ultimo: sql<Date>`max(${stories.createdAt})` })
    .from(stories)
    .where(and(inArray(stories.organizationId, orgIds), gt(stories.expiraEm, new Date())))
    .groupBy(stories.organizationId);
  return new Map(linhas.map((l) => [l.org, new Date(l.ultimo)]));
}

/** A imagem, só enquanto o story está no ar. */
export async function imagemDoStory(id: string) {
  const [s] = await db
    .select({ bytes: stories.bytes, mime: stories.mime, expiraEm: stories.expiraEm, arquivada: organizations.archivedAt })
    .from(stories)
    .innerJoin(organizations, eq(organizations.id, stories.organizationId))
    .where(eq(stories.id, id));
  if (!s || s.arquivada || s.expiraEm <= new Date()) return null;
  return s;
}

/** Relógio: apaga o que venceu. */
export async function apagarStoriesVencidos() {
  const r = await db.delete(stories).where(lte(stories.expiraEm, new Date())).returning({ id: stories.id });
  return r.length;
}

/* ------------------------------------------------------------------ *
 * Estados
 * ------------------------------------------------------------------ */

/** Estados com rifa no ar (a UF é a da promotora). */
export async function estadosNoAr(ufDeQuemOlha?: string | null) {
  const linhas = await db
    .select({ uf: organizations.uf, rifas: sql<number>`count(*)::int` })
    .from(campaigns)
    .innerJoin(organizations, eq(organizations.id, campaigns.organizationId))
    .where(and(eq(campaigns.status, "published"), isNull(organizations.archivedAt)))
    .groupBy(organizations.uf);
  return estadosComRifa(linhas, ufDeQuemOlha);
}
