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
  campaignStats,
  organizacaoFotos,
  organizations,
  plataformaBanners,
  stories,
  storyEnquetes,
  storyVotos,
  buyers,
} from "@shared/schema";
import { type Figurinha, type FigurinhaNaTela, validarFigurinhas } from "@shared/figurinhasStory";
import { rifaAVenda } from "@shared/carrinho";
import { getPaymentMethods } from "./settings";
import { ENQUETE_VOTOS_POR_JANELA, opcaoValida, percentuais, validarEnquete } from "@shared/enqueteStory";
import {
  BANNERS_MAX,
  BANNER_TAMANHO,
  STORIES_MAX,
  STORY_TAMANHO,
  STORY_VIDEO_MAX_BYTES,
  problemaNoVideoDoStory,
  bannerNoAr,
  estadosComRifa,
  expiraEm,
  publicacaoDoStory,
  validarBanner,
  validarLegenda,
} from "@shared/vitrine";
import { urlDaFoto } from "./perfil";
import { comArquivoTemporario, processadorDeVideo } from "./videoProcessor";
import { emSegundoPlano } from "./push";
import { bufferReader, probeVideoDimensions, probeVideoDuration, UnreadableMediaError } from "./probe";

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

export async function processar(dataUrl: unknown, largura: number, altura: number): Promise<Buffer> {
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

/**
 * No ar agora: já entrou (`publica_em`) e ainda não venceu. Toda leitura
 * pública passa por aqui — o agendado não aparece antes da hora.
 */
const storyNoAr = (agora = new Date()) => and(lte(stories.publicaEm, agora), gt(stories.expiraEm, agora));
const urlDoPosterDoStory = (id: string) => `/api/public/stories/${id}/poster`;

const campoDoStory = {
  id: stories.id,
  organizationId: stories.organizationId,
  legenda: stories.legenda,
  mime: stories.mime,
  temPoster: sql<boolean>`${stories.poster} is not null`,
  createdAt: stories.createdAt,
  publicaEm: stories.publicaEm,
  expiraEm: stories.expiraEm,
  rifaSlug: campaigns.slug,
  rifaPremio: campaigns.prizeTitle,
  rifaStatus: campaigns.status,
  // O que as figurinhas precisam: a data do sorteio (contagem) e se a rifa
  // vende agora (Comprar), pela mesma régua da página da rifa.
  figurinhas: stories.figurinhas,
  rifaDrawAt: campaigns.drawAt,
  rifaDemonstracao: campaigns.demonstracao,
  rifaTravada: sql<boolean>`${campaigns.travadaEm} is not null`,
  rifaTotal: campaigns.totalQuotas,
  rifaVendidas: campaignStats.soldCount,
};

type LinhaDoStory = {
  id: string;
  organizationId: string;
  legenda: string | null;
  mime: string;
  temPoster: boolean;
  createdAt: Date;
  publicaEm: Date;
  expiraEm: Date;
  rifaSlug: string | null;
  rifaPremio: string | null;
  rifaStatus: string | null;
  figurinhas: Figurinha[];
  rifaDrawAt: Date | null;
  rifaDemonstracao: boolean | null;
  rifaTravada: boolean | null;
  rifaTotal: number | null;
  rifaVendidas: number | null;
};

/**
 * As figurinhas como a tela as desenha. A contagem leva a data do sorteio de
 * agora (o adiamento muda sozinho); o Comprar só sai enquanto a rifa vende —
 * esgotada, travada ou sem Pix, a figurinha some. Sem rifa pública, as duas
 * somem (o texto e o emoji ficam).
 */
function figurinhasNaTela(s: LinhaDoStory, pixOnline: boolean) {
  const publica = Boolean(s.rifaSlug && s.rifaStatus && s.rifaStatus !== "draft");
  const vende =
    publica &&
    rifaAVenda({
      status: s.rifaStatus!,
      demonstracao: s.rifaDemonstracao,
      travada: s.rifaTravada,
      soldCount: s.rifaVendidas ?? 0,
      totalQuotas: s.rifaTotal ?? 0,
      pixOnline,
    });
  return (s.figurinhas ?? []).flatMap((f): FigurinhaNaTela[] => {
    if (f.tipo === "contagem") {
      // Demonstração não tem sorteio de verdade (data longe), e a travada não
      // vende: contar para nenhuma das duas seria anunciar o que não vai acontecer.
      const conta = publica && !s.rifaDemonstracao && !s.rifaTravada;
      return conta ? [{ tipo: "contagem", x: f.x, y: f.y, drawAt: s.rifaDrawAt, sorteada: s.rifaStatus === "drawn" }] : [];
    }
    if (f.tipo === "comprar") return vende ? [{ tipo: "comprar", x: f.x, y: f.y, slug: s.rifaSlug! }] : [];
    if (f.tipo === "texto") return [{ tipo: "texto", x: f.x, y: f.y, texto: f.texto }];
    return [{ tipo: "emoji", x: f.x, y: f.y, emoji: f.emoji }];
  });
}

type EnqueteNaTela = {
  pergunta: string;
  opcoes: string[];
  /** A opção que quem olha escolheu; nula se ainda não votou (ou sem conta). */
  meuVoto: number | null;
  /** Só para quem já votou (e no painel): o percentual de cada opção, somando 100. */
  percentuais: number[] | null;
};

/**
 * As enquetes dos stories e o voto de quem olha. O resultado só vai para
 * quem já votou — antes, a pessoa escolhe sem ver para onde a maioria foi.
 */
async function enquetesDos(ids: string[], buyerId: string | null) {
  const porStory = new Map<string, EnqueteNaTela & { votos: number[] }>();
  if (ids.length === 0) return porStory;
  const linhas = await db.select().from(storyEnquetes).where(inArray(storyEnquetes.storyId, ids));
  const meus = buyerId && linhas.length
    ? new Map(
        (
          await db
            .select({ storyId: storyVotos.storyId, opcao: storyVotos.opcao })
            .from(storyVotos)
            .where(and(eq(storyVotos.buyerId, buyerId), inArray(storyVotos.storyId, linhas.map((l) => l.storyId))))
        ).map((v) => [v.storyId, v.opcao]),
      )
    : new Map<string, number>();
  for (const l of linhas) {
    const meuVoto = meus.get(l.storyId) ?? null;
    porStory.set(l.storyId, {
      pergunta: l.pergunta,
      opcoes: l.opcoes,
      meuVoto,
      percentuais: meuVoto === null ? null : percentuais(l.votos),
      votos: l.votos,
    });
  }
  return porStory;
}

function publico(s: LinhaDoStory, pixOnline: boolean) {
  // A rifa só aparece enquanto é pública (publicada, encerrada ou sorteada).
  const rifa =
    s.rifaSlug && s.rifaStatus && s.rifaStatus !== "draft"
      ? { slug: s.rifaSlug, premio: s.rifaPremio ?? "" }
      : null;
  return { id: s.id, tipo: s.mime.startsWith("video/") ? ("video" as const) : ("imagem" as const), imagem: urlDoStory(s.id), poster: s.mime.startsWith("video/") && s.temPoster ? urlDoPosterDoStory(s.id) : null, legenda: s.legenda, criadoEm: s.publicaEm, expiraEm: s.expiraEm, rifa, figurinhas: figurinhasNaTela(s, pixOnline) };
}

/**
 * Stories no ar e agendados de uma organização (painel, com recorte já
 * conferido). O agendado vem com `agendadoPara`; o público não o vê.
 */
export async function storiesDaOrganizacao(orgId: string | null) {
  const linhas = await db
    .select({ ...campoDoStory, organizacao: organizations.name })
    .from(stories)
    .innerJoin(organizations, eq(organizations.id, stories.organizationId))
    .leftJoin(campaigns, eq(campaigns.id, stories.campaignId))
    .leftJoin(campaignStats, eq(campaignStats.campaignId, stories.campaignId))
    .where(and(gt(stories.expiraEm, new Date()), orgId ? eq(stories.organizationId, orgId) : undefined))
    .orderBy(desc(stories.publicaEm));
  const agora = new Date();
  const enquetes = await enquetesDos(linhas.map((l) => l.id), null);
  const pixOnline = (await getPaymentMethods()).pix_online;
  return linhas.map((s) => {
    const p = publico(s, pixOnline);
    const e = enquetes.get(s.id);
    // O painel lê a peça pela porta dele: a pública só abre depois da hora.
    return {
      ...p,
      imagem: `/api/admin/stories/${s.id}/imagem`,
      poster: p.poster ? `/api/admin/stories/${s.id}/poster` : null,
      organizacao: s.organizacao,
      agendadoPara: s.publicaEm > agora ? s.publicaEm : null,
      // A organização vê o que gravou, inclusive a figurinha que a tela
      // esconde agora (o Comprar da rifa esgotada, por exemplo).
      figurinhasGravadas: (s.figurinhas ?? []).map((f) => f.tipo),
      // A organização vê os totais de cada opção — nunca quem votou em quê.
      enquete: e ? { pergunta: e.pergunta, opcoes: e.opcoes, votos: e.votos, total: e.votos.reduce((a, b) => a + b, 0), percentuais: percentuais(e.votos) } : null,
    };
  });
}

/** Confere o vídeo do story pelo conteúdo: MP4/MOV, curto, em pé e leve. */
async function lerVideoDoStory(dataUrl: unknown): Promise<{ bytes: Buffer; mime: string }> {
  const m = /^data:(video\/(?:mp4|quicktime));base64,([A-Za-z0-9+/=]+)$/i.exec(String(dataUrl ?? ""));
  if (!m) throw new VitrineError("Envie o vídeo em MP4 ou MOV.");
  const bytes = Buffer.from(m[2], "base64");
  if (bytes.length > STORY_VIDEO_MAX_BYTES) {
    throw new VitrineError(problemaNoVideoDoStory(bytes.length, 1, null) ?? "O vídeo é grande demais.");
  }
  const leitor = bufferReader(bytes);
  try {
    const segundos = await probeVideoDuration(leitor, bytes.length);
    const medidas = await probeVideoDimensions(leitor, bytes.length);
    const problema = problemaNoVideoDoStory(bytes.length, segundos, medidas);
    if (problema) throw new VitrineError(problema);
  } catch (e) {
    if (e instanceof UnreadableMediaError) throw new VitrineError(e.message);
    throw e;
  }
  return { bytes, mime: m[1].toLowerCase() === "video/quicktime" ? "video/quicktime" : "video/mp4" };
}

export async function postarStory(
  orgId: string,
  entrada: {
    imagem?: unknown;
    video?: unknown;
    legenda?: unknown;
    campaignId?: unknown;
    publicaEm?: unknown;
    enquete?: unknown;
    figurinhas?: unknown;
  },
) {
  const legenda = regra(() => validarLegenda(entrada.legenda));
  const enquete = regra(() => validarEnquete(entrada.enquete));
  // Agendado: entra no ar na hora escolhida, e as 24 h contam dali.
  const publicaEm = regra(() => publicacaoDoStory(entrada.publicaEm));
  const campaignId =
    typeof entrada.campaignId === "string" && entrada.campaignId ? entrada.campaignId : null;
  // A contagem e o Comprar são da rifa do story; a rifa é conferida na transação.
  const figurinhas = regra(() => validarFigurinhas(entrada.figurinhas, { temRifa: Boolean(campaignId) }));
  // Vídeo ou imagem, nunca os dois. O vídeo vai como veio (sem transcode);
  // a duração e as medidas saem do arquivo, não do que o navegador disser.
  const video = entrada.video ? await lerVideoDoStory(entrada.video) : null;
  const bytes = video ? video.bytes : await processar(entrada.imagem, STORY_TAMANHO.largura, STORY_TAMANHO.altura);
  const mime = video ? video.mime : "image/webp";

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
      throw new VitrineError(`No máximo ${STORIES_MAX} stories no ar ou agendados. Apague um ou espere vencer.`, 409);
    }
    const [novo] = await tx
      .insert(stories)
      .values({ organizationId: orgId, legenda, campaignId, mime, bytes, figurinhas, createdAt: agora, publicaEm, expiraEm: expiraEm(publicaEm) })
      .returning({ id: stories.id, publicaEm: stories.publicaEm, figurinhas: stories.figurinhas });
    if (enquete) {
      await tx.insert(storyEnquetes).values({ storyId: novo.id, pergunta: enquete.pergunta, opcoes: enquete.opcoes, votos: enquete.opcoes.map(() => 0) });
    }
    return novo;
  }).then((novo) => {
    // O pôster vem depois, em segundo plano: a resposta não espera o ffmpeg e,
    // sem ele (ou se falhar), o story fica como estava — vídeo sem pôster.
    if (video) emSegundoPlano(gerarPosterDoStory(novo.id, video.bytes, video.mime), "pôster do story");
    return novo;
  });
}

/** Tira o pôster do vídeo do story e o grava junto dele. Sem quadro, não grava nada. */
export async function gerarPosterDoStory(id: string, bytes: Buffer, mime: string) {
  const poster = await comArquivoTemporario(bytes, mime === "video/quicktime" ? ".mov" : ".mp4", (arquivo) =>
    processadorDeVideo().gerarPoster(arquivo),
  );
  if (!poster) return false;
  // Story apagado ou vencido no meio do caminho: o UPDATE não acha linha e some sozinho.
  const r = await db.update(stories).set({ poster }).where(and(eq(stories.id, id), isNull(stories.poster))).returning({ id: stories.id });
  return r.length > 0;
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
export async function storiesDoPerfil(slug: string, buyerId: string | null = null) {
  const [org] = await db
    .select({ id: organizations.id, slug: organizations.slug, nome: organizations.name, foto: organizacaoFotos.updatedAt })
    .from(organizations)
    .leftJoin(organizacaoFotos, eq(organizacaoFotos.organizationId, organizations.id))
    // Banida também some: a fileira já a tira, e o anel não pode levar a um story morto.
    .where(and(eq(organizations.slug, slug), isNull(organizations.archivedAt), isNull(organizations.banidaEm)));
  if (!org) throw new VitrineError("Perfil não encontrado.", 404);
  const linhas = await db
    .select(campoDoStory)
    .from(stories)
    .leftJoin(campaigns, eq(campaigns.id, stories.campaignId))
    .leftJoin(campaignStats, eq(campaignStats.campaignId, stories.campaignId))
    .where(and(eq(stories.organizationId, org.id), storyNoAr()))
    .orderBy(asc(stories.publicaEm));
  const enquetes = await enquetesDos(linhas.map((l) => l.id), buyerId);
  const pixOnline = linhas.length ? (await getPaymentMethods()).pix_online : true;
  return {
    slug: org.slug,
    nome: org.nome,
    foto: urlDaFoto(org.slug, org.foto),
    stories: linhas.map((l) => {
      const e = enquetes.get(l.id);
      return { ...publico(l, pixOnline), enquete: e ? { pergunta: e.pergunta, opcoes: e.opcoes, meuVoto: e.meuVoto, percentuais: e.percentuais } : null };
    }),
  };
}

/** O instante do story mais novo no ar de cada organização (acende o anel). */
export async function ultimoStoryPorOrganizacao(orgIds: string[]) {
  if (orgIds.length === 0) return new Map<string, Date>();
  const linhas = await db
    .select({ org: stories.organizationId, ultimo: sql<Date>`max(${stories.publicaEm})` })
    .from(stories)
    .where(and(inArray(stories.organizationId, orgIds), storyNoAr()))
    .groupBy(stories.organizationId);
  return new Map(linhas.map((l) => [l.org, new Date(l.ultimo)]));
}

/** A imagem, só enquanto o story está no ar. */
export async function imagemDoStory(id: string) {
  const [s] = await db
    .select({ bytes: stories.bytes, mime: stories.mime, publicaEm: stories.publicaEm, expiraEm: stories.expiraEm, arquivada: organizations.archivedAt, banida: organizations.banidaEm })
    .from(stories)
    .innerJoin(organizations, eq(organizations.id, stories.organizationId))
    .where(eq(stories.id, id));
  // O agendado também não sai antes da hora: o id está na lista do painel.
  if (!s || s.arquivada || s.banida || s.publicaEm > new Date() || s.expiraEm <= new Date()) return null;
  return s;
}

/**
 * A peça do story para o painel da dona (o agendado inclusive, que o público
 * ainda não vê). Quem chama confere o recorte antes (`donoDoStory`).
 */
export async function arquivoDoStoryNoPainel(id: string, qual: "imagem" | "poster") {
  const [s] = await db
    .select({ bytes: stories.bytes, mime: stories.mime, poster: stories.poster })
    .from(stories)
    .where(and(eq(stories.id, id), gt(stories.expiraEm, new Date())));
  if (!s) return null;
  if (qual === "poster") return s.poster ? { bytes: s.poster, mime: "image/webp" } : null;
  return { bytes: s.bytes, mime: s.mime };
}

/** O pôster do vídeo, só enquanto o story está no ar (a mesma regra da imagem). */
export async function posterDoStory(id: string) {
  const [s] = await db
    .select({ poster: stories.poster, publicaEm: stories.publicaEm, expiraEm: stories.expiraEm, arquivada: organizations.archivedAt, banida: organizations.banidaEm })
    .from(stories)
    .innerJoin(organizations, eq(organizations.id, stories.organizationId))
    .where(eq(stories.id, id));
  if (!s || !s.poster || s.arquivada || s.banida || s.publicaEm > new Date() || s.expiraEm <= new Date()) return null;
  return s.poster;
}

/**
 * A enquete que aceita voto agora: story no ar (`storyNoAr()`, a mesma régua
 * da imagem) e promotora nem arquivada nem banida. Nula é "não existe" (404).
 */
async function enqueteNoAr(q: Pick<typeof db, "select">, storyId: string) {
  const [s] = await q
    .select({ opcoes: storyEnquetes.opcoes })
    .from(storyEnquetes)
    .innerJoin(stories, eq(stories.id, storyEnquetes.storyId))
    .innerJoin(organizations, eq(organizations.id, stories.organizationId))
    .where(and(eq(storyEnquetes.storyId, storyId), storyNoAr(), isNull(organizations.archivedAt), isNull(organizations.banidaEm)));
  return s ?? null;
}

/**
 * Confere o pedido de voto **antes** de contar no limite (erro de
 * preenchimento não gasta tentativa): a enquete existe e está no ar, e a
 * opção é dela. Devolve a opção já conferida.
 */
export async function conferirVoto(storyId: string, opcaoBruta: unknown) {
  const s = await enqueteNoAr(db, storyId);
  if (!s) throw new VitrineError("Enquete não encontrada.", 404);
  const opcao = opcaoValida(opcaoBruta, s.opcoes.length);
  if (opcao === null) throw new VitrineError("Escolha uma das opções da enquete.");
  return opcao;
}

/**
 * O voto na enquete do story. Só conta com senha (quem chama confere a
 * sessão), só com o story no ar, uma vez por pessoa: a chave (story,
 * pessoa) decide, e o total da opção anda na mesma transação só quando o
 * voto entrou. Votar de novo não troca nem soma — devolve o que já estava.
 * O story fica travado (`FOR SHARE`) do começo ao fim: apagado no meio, o
 * voto não estoura a chave estrangeira — vira "não encontrada".
 */
export async function votarNaEnquete(storyId: string, buyerId: string, opcao: number) {
  return db.transaction(async (tx) => {
    const [travado] = await tx.select({ id: stories.id }).from(stories).where(eq(stories.id, storyId)).for("share");
    const s = travado ? await enqueteNoAr(tx, storyId) : null;
    if (!s) throw new VitrineError("Enquete não encontrada.", 404);
    if (opcaoValida(opcao, s.opcoes.length) === null) throw new VitrineError("Escolha uma das opções da enquete.");
    const [entrou] = await tx
      .insert(storyVotos)
      .values({ storyId, buyerId, opcao })
      .onConflictDoNothing()
      .returning({ opcao: storyVotos.opcao });
    if (entrou) {
      // `votos` é 1-based no Postgres: a opção 0 é votos[1].
      await tx.execute(sql`update story_enquetes set votos[${opcao + 1}] = votos[${opcao + 1}] + 1 where story_id = ${storyId}`);
    }
    const [meu] = await tx
      .select({ opcao: storyVotos.opcao })
      .from(storyVotos)
      .where(and(eq(storyVotos.storyId, storyId), eq(storyVotos.buyerId, buyerId)));
    const [e] = await tx.select({ votos: storyEnquetes.votos }).from(storyEnquetes).where(eq(storyEnquetes.storyId, storyId));
    return { novo: Boolean(entrou), meuVoto: meu.opcao, percentuais: percentuais(e.votos) };
  });
}

/**
 * Só conta com senha **e CPF** vota: o CPF único entre contas é o que segura
 * a fazenda de votos (a conta só do Google, sem CPF ainda, completa a conta
 * antes — como no presente).
 */
export async function contaQueVota(buyerId: string | undefined) {
  if (!buyerId) return null;
  const [b] = await db
    .select({ conta: buyers.passwordHash, cpf: buyers.cpf, excluido: buyers.excluidoEm })
    .from(buyers)
    .where(eq(buyers.id, buyerId));
  return b?.conta && b.cpf && !b.excluido ? buyerId : null;
}

export { ENQUETE_VOTOS_POR_JANELA };

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
