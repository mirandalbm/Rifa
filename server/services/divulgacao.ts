/**
 * Divulgação de terceiros: a peça do afiliado (influenciador) e do apostador
 * sobre a rifa de uma organização. Regras puras em `shared/divulgacao.ts`.
 *
 * O que não se afrouxa aqui:
 * - A divulgação **não toca a rifa**: só grava uma legenda e a escolha de
 *   mídias que a organização já publicou. Preço, cotas, prêmio e
 *   autorização SPA/MF ficam onde estavam.
 * - O afiliado só divulga com vínculo aprovado e, se a rifa foi publicada
 *   com termo, o aceite daquela versão (`comissaoNaRifa()`), e a peça só
 *   aparece enquanto isso continuar valendo.
 * - O texto passa pela régua da legenda (sem link, sem telefone) e pela
 *   varredura do Pix por fora: quem pede pagamento fora da plataforma é
 *   recusado e vira denúncia automática (fora do fluxo, `emSegundoPlano`).
 * - Decidir é `UPDATE` condicional com a linha travada (`FOR UPDATE`): dois
 *   cliques, uma decisão, um 409. O pedido do vizinho é 404.
 * - O apostador só publica atrás do interruptor `publicarApostador`, texto e
 *   fotos dele, só de rifa em que tem compra paga, e sempre com autorização.
 * - Foto própria (do apostador ou do afiliado) e o vídeo próprio do afiliado
 *   sempre passam pela organização: a varredura do Pix por fora só lê texto.
 */
import type { Request } from "express";
import sharp from "sharp";
import { and, asc, desc, eq, inArray, isNotNull, isNull, lte, ne, or, sql, type SQL } from "drizzle-orm";
import { db } from "../db";
import {
  afiliadoVinculos,
  affiliates,
  buyers,
  campaignMedia,
  campaigns,
  divulgacaoFotos,
  divulgacaoVideos,
  divulgacoes,
  orders,
  organizations,
  users,
} from "@shared/schema";
import {
  DE_PARA_DA_DECISAO,
  DIVULGACAO_FOTO_MAX_BYTES,
  DIVULGACAO_MIDIAS_MAX,
  DIVULGACOES_POR_DIA,
  EDICOES_POR_DIA,
  STATUS_DA_DIVULGACAO,
  podeEditar,
  versaoInformada,
  linkDaDivulgacao,
  statusInicial,
  validarDecisao,
  validarDivulgacao,
  validarFotos,
  validarVideo,
  problemaNoVideoDaDivulgacao,
  validarModo,
  VAZIA_DO_AFILIADO,
  agendaDaPeca,
  type AutorDaDivulgacao,
  type ModoDeDivulgacao,
  avisoDaDecisao,
  type StatusDaDivulgacao,
} from "@shared/divulgacao";
import { pedePagamentoPorFora } from "@shared/seguranca";
import { nomeCurto } from "@shared/aoVivo";
import { orgOf } from "./orgs";
import { hit } from "./antifraude";
import { comissaoNaRifa } from "./afiliados";
import { avisar, emSegundoPlano } from "./push";
import { varrerTextoDoOrganizador } from "./seguranca";
import { getPlataforma } from "./settings";
import { withUrls } from "./media";
import { isUniqueViolation } from "../pgError";
import { bufferReader, probeVideoDimensions, probeVideoDuration, UnreadableMediaError } from "./probe";
import { comArquivoTemporario, FfmpegLocal } from "./videoProcessor";
import type { ArquivoEmFaixas } from "./faixa";

/** Peça agendada só aparece depois da hora; sem agenda, já. A mesma regra de `pecaNoArAgora()`, em SQL: mudou uma, mude a outra. */
const noArAgora = () => or(isNull(divulgacoes.publicaEm), lte(divulgacoes.publicaEm, new Date()));

export class DivulgacaoError extends Error {
  constructor(message: string, readonly status = 400) {
    super(message);
    this.name = "DivulgacaoError";
  }
}

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** O que a régua de texto diz vira 422 — erro de preenchimento, não de acesso. */
function regra<T>(f: () => T): T {
  try {
    return f();
  } catch (e) {
    throw new DivulgacaoError((e as Error).message, 422);
  }
}

/**
 * A rifa que aceita divulgação: publicada, de verdade (não demonstração),
 * não travada, de organização no ar. Rascunho, encerrada, travada, banida e
 * arquivada não recebem peça nova.
 */
async function rifaParaDivulgar(slug: unknown, porId?: string) {
  if (!porId && (typeof slug !== "string" || !slug)) throw new DivulgacaoError("Rifa não encontrada.", 404);
  const [r] = await db
    .select({
      id: campaigns.id,
      slug: campaigns.slug,
      title: campaigns.title,
      organizationId: campaigns.organizationId,
      termoId: campaigns.termoId,
      commissionPctDefault: campaigns.commissionPctDefault,
      modo: organizations.divulgacaoAfiliado,
    })
    .from(campaigns)
    .innerJoin(organizations, eq(organizations.id, campaigns.organizationId))
    .where(
      and(
        porId ? eq(campaigns.id, porId) : eq(campaigns.slug, slug as string),
        eq(campaigns.status, "published"),
        eq(campaigns.demonstracao, false),
        isNull(campaigns.travadaEm),
        eq(organizations.active, true),
        isNull(organizations.archivedAt),
        isNull(organizations.banidaEm),
      ),
    );
  if (!r) throw new DivulgacaoError("Rifa não encontrada.", 404);
  return r;
}

/**
 * Texto de terceiro que pede pagamento por fora: recusado na hora e, fora do
 * fluxo, vira denúncia automática para a plataforma (com quem escreveu na
 * evidência). A denúncia tem a organização como alvo porque é a rifa dela
 * que o texto usaria — quem decide é a plataforma, que lê a evidência.
 */
function barrarPixPorFora(legenda: string, rifa: { id: string; organizationId: string }, quem: string) {
  if (!legenda || !pedePagamentoPorFora(legenda)) return;
  emSegundoPlano(
    varrerTextoDoOrganizador({
      organizationId: rifa.organizationId,
      campaignId: rifa.id,
      onde: `texto de terceiro (${quem}), recusado e não publicado`,
      texto: legenda,
    }),
    "varredura",
  );
  throw new DivulgacaoError("A legenda parece pedir pagamento por fora da plataforma. Só vale bilhete pago aqui.", 422);
}

/** As mídias são da própria rifa, já prontas: nada do cliente vira arquivo. */
async function conferirMidias(campaignId: string, midias: string[]) {
  if (!midias.length) return;
  const ok = await db
    .select({ id: campaignMedia.id })
    .from(campaignMedia)
    .where(and(eq(campaignMedia.campaignId, campaignId), eq(campaignMedia.status, "ready"), ne(campaignMedia.role, "reels"), inArray(campaignMedia.id, midias)));
  if (ok.length !== midias.length) throw new DivulgacaoError("Escolha só mídias desta rifa.", 422);
}

/**
 * A foto própria (apostador ou afiliado) vira JPEG de até 1600 px, sem metadados (nem
 * localização), com teto de 40 MP medido antes de abrir. Todas são
 * processadas antes da transação: recusa não deixa peça pela metade.
 */
async function processarFotos(fotos: string[]): Promise<Buffer[]> {
  const saida: Buffer[] = [];
  for (const f of fotos) {
    const bruto = Buffer.from(f.slice(f.indexOf(",") + 1), "base64");
    if (bruto.length > DIVULGACAO_FOTO_MAX_BYTES) throw new DivulgacaoError("Uma das fotos passa de 3 MB. Envie uma menor.", 413);
    try {
      saida.push(
        await sharp(bruto, { limitInputPixels: 40_000_000 })
          .rotate()
          .resize({ width: 1600, height: 1600, fit: "inside", withoutEnlargement: true })
          .jpeg({ quality: 80, mozjpeg: true })
          .toBuffer(),
      );
    } catch {
      throw new DivulgacaoError("Não consegui ler uma das fotos. Envie em JPG ou PNG.", 422);
    }
  }
  return saida;
}

type VideoLido = { bytes: Buffer; mime: string; segundos: number; largura: number; altura: number };

/**
 * O vídeo próprio do afiliado, conferido pelo conteúdo antes da transação:
 * MP4 ou MOV, curto e leve, com duração e medidas lidas do arquivo — nunca do
 * que o navegador disser. Vai como veio (sem transcode).
 */
async function lerVideo(dataUrl: string): Promise<VideoLido> {
  const m = /^data:(video\/(?:mp4|quicktime));base64,([A-Za-z0-9+/=]+)$/i.exec(dataUrl);
  if (!m) throw new DivulgacaoError("Envie o vídeo em MP4 ou MOV.", 422);
  const bytes = Buffer.from(m[2], "base64");
  const grande = problemaNoVideoDaDivulgacao(bytes.length, 1, { width: 1, height: 1 });
  if (grande) throw new DivulgacaoError(grande, 413);
  const leitor = bufferReader(bytes);
  try {
    const segundos = await probeVideoDuration(leitor, bytes.length);
    const medidas = await probeVideoDimensions(leitor, bytes.length);
    const problema = problemaNoVideoDaDivulgacao(bytes.length, segundos, medidas);
    if (problema || !medidas) throw new DivulgacaoError(problema ?? "Não consegui medir o vídeo.", 422);
    return { bytes, mime: tipoDoArquivo(bytes), segundos, largura: medidas.width, altura: medidas.height };
  } catch (e) {
    if (e instanceof UnreadableMediaError) throw new DivulgacaoError(e.message, 422);
    throw e;
  }
}

/**
 * O tipo sai do próprio arquivo (a marca do `ftyp`), não do que o navegador
 * declarou: MOV servido como MP4 não toca em alguns navegadores.
 */
function tipoDoArquivo(bytes: Buffer): "video/mp4" | "video/quicktime" {
  return bytes.length >= 12 && bytes.toString("ascii", 4, 8) === "ftyp" && bytes.toString("ascii", 8, 12) === "qt  " ? "video/quicktime" : "video/mp4";
}

/**
 * O pôster do vídeo de pessoa sai só do `ffmpeg` local, nunca do Cloudflare
 * Stream: mandar a imagem de quem publicou a um serviço de fora é decisão de
 * privacidade que a Privacidade não cobre (o vídeo da rifa é material da
 * organização). Com `VIDEO_PROCESSOR=nenhum`, não há pôster.
 */
let ffmpegDaPeca: FfmpegLocal | null = null;
const processadorDaPeca = () =>
  (process.env.VIDEO_PROCESSOR ?? "").toLowerCase() === "nenhum" ? null : (ffmpegDaPeca ??= new FfmpegLocal());

/** Foto ou vídeo, nunca os dois: o corpo da peça fica dentro do limite, e a tela mostra um ou outro. */
function umOuOutro(fotos: number, video: boolean) {
  if (fotos > 0 && video) throw new DivulgacaoError("Envie fotos ou um vídeo — não os dois na mesma divulgação.", 422);
}

/**
 * O pôster do vídeo, em segundo plano: sem `ffmpeg` (ou se falhar), o vídeo
 * fica sem pôster. Só grava no vídeo que veio tirar (o `id` muda a cada
 * troca) e se ainda não houver pôster: vídeo trocado ou peça apagada no meio,
 * o `UPDATE` não acha a linha.
 */
async function gerarPosterDaPeca(divulgacaoId: string, videoId: string, v: VideoLido) {
  const processador = processadorDaPeca();
  if (!processador) return false;
  const poster = await comArquivoTemporario(v.bytes, v.mime === "video/quicktime" ? ".mov" : ".mp4", (arquivo) => processador.gerarPoster(arquivo));
  if (!poster) return false;
  const r = await db
    .update(divulgacaoVideos)
    .set({ poster })
    .where(and(eq(divulgacaoVideos.divulgacaoId, divulgacaoId), eq(divulgacaoVideos.id, videoId), isNull(divulgacaoVideos.poster)))
    .returning({ id: divulgacaoVideos.id });
  return r.length > 0;
}

async function gravarVideo(tx: Tx, divulgacaoId: string, v: VideoLido) {
  const [linha] = await tx
    .insert(divulgacaoVideos)
    .values({ divulgacaoId, mime: v.mime, bytes: v.bytes, segundos: v.segundos, largura: v.largura, altura: v.altura })
    .returning({ id: divulgacaoVideos.id });
  return linha.id;
}

async function gravar(valores: typeof divulgacoes.$inferInsert, fotos: Buffer[] = [], video: VideoLido | null = null) {
  try {
    const r = await db.transaction(async (tx: Tx) => {
      const [d] = await tx.insert(divulgacoes).values(valores).returning();
      if (fotos.length) await tx.insert(divulgacaoFotos).values(fotos.map((bytes, posicao) => ({ divulgacaoId: d.id, posicao, bytes })));
      const videoId = video ? await gravarVideo(tx, d.id, video) : null;
      return { d, videoId };
    });
    if (video && r.videoId) emSegundoPlano(gerarPosterDaPeca(r.d.id, r.videoId, video), "pôster da divulgação");
    return r.d;
  } catch (err) {
    // Quem decide é o índice: um pedido em análise por autor e rifa.
    if (isUniqueViolation(err, "uq_divulgacao_afiliado_em_analise") || isUniqueViolation(err, "uq_divulgacao_apostador_em_analise")) {
      throw new DivulgacaoError("Você já tem uma divulgação desta rifa esperando a organização.", 409);
    }
    throw err;
  }
}

/** As fotos de cada peça, na ordem, só os ids (os bytes saem pelas rotas que conferem quem vê). */
async function fotosDasPecas(ids: string[]): Promise<Map<string, string[]>> {
  const por = new Map<string, string[]>();
  if (!ids.length) return por;
  const linhas = await db
    .select({ id: divulgacaoFotos.id, divulgacaoId: divulgacaoFotos.divulgacaoId })
    .from(divulgacaoFotos)
    .where(inArray(divulgacaoFotos.divulgacaoId, ids))
    .orderBy(asc(divulgacaoFotos.divulgacaoId), asc(divulgacaoFotos.posicao));
  for (const l of linhas) por.set(l.divulgacaoId, [...(por.get(l.divulgacaoId) ?? []), l.id]);
  return por;
}

/** O vídeo de cada peça (só o que a tela precisa: se tem pôster e as medidas). */
async function videosDasPecas(ids: string[]): Promise<Map<string, { poster: boolean; largura: number; altura: number; em: Date }>> {
  const por = new Map<string, { poster: boolean; largura: number; altura: number; em: Date }>();
  if (!ids.length) return por;
  const linhas = await db
    .select({
      divulgacaoId: divulgacaoVideos.divulgacaoId,
      poster: sql<boolean>`${divulgacaoVideos.poster} is not null`,
      largura: divulgacaoVideos.largura,
      altura: divulgacaoVideos.altura,
      em: divulgacaoVideos.createdAt,
    })
    .from(divulgacaoVideos)
    .where(inArray(divulgacaoVideos.divulgacaoId, ids));
  for (const l of linhas) por.set(l.divulgacaoId, { poster: l.poster, largura: l.largura, altura: l.altura, em: l.em });
  return por;
}

/** O vídeo da peça para a tela: o endereço (com `?v=` da troca), o pôster, se houver, e a proporção. */
function videoParaATela(base: string, v: { poster: boolean; largura: number; altura: number; em: Date } | undefined) {
  if (!v) return null;
  const versao = new Date(v.em).getTime();
  return { url: `${base}?v=${versao}`, poster: v.poster ? `${base}?poster=1&v=${versao}` : null, largura: v.largura, altura: v.altura };
}

/**
 * O vídeo (ou o pôster) de uma peça, lido aos pedaços: o vídeo sai do banco só
 * na faixa pedida (`substring` no Postgres), nunca inteiro a cada pedaço que o
 * navegador pede. O pôster é pequeno e vai inteiro. Sem, 404.
 */
export async function arquivoDoVideo(divulgacaoId: string, poster: boolean): Promise<ArquivoEmFaixas> {
  if (poster) {
    const [v] = await db.select({ bytes: divulgacaoVideos.poster }).from(divulgacaoVideos).where(eq(divulgacaoVideos.divulgacaoId, divulgacaoId));
    if (!v?.bytes) throw new DivulgacaoError("Vídeo não encontrado.", 404);
    const bytes = v.bytes;
    return { mime: "image/webp", total: bytes.length, ler: async (ini, tam) => bytes.subarray(ini, ini + tam) };
  }
  const [v] = await db
    .select({ mime: divulgacaoVideos.mime, total: sql<number>`octet_length(${divulgacaoVideos.bytes})::int`, id: divulgacaoVideos.id })
    .from(divulgacaoVideos)
    .where(eq(divulgacaoVideos.divulgacaoId, divulgacaoId));
  if (!v) throw new DivulgacaoError("Vídeo não encontrado.", 404);
  return {
    mime: v.mime,
    total: Number(v.total),
    ler: async (ini, tam) => {
      // O mesmo vídeo que foi medido (o `id` muda se trocarem no meio): trocado, a faixa vem vazia.
      const r = await db.execute(
        sql`select substring(bytes from ${ini + 1} for ${tam}) as b from divulgacao_videos where divulgacao_id = ${divulgacaoId} and id = ${v.id}`,
      );
      const b = (r.rows[0] as { b?: Buffer } | undefined)?.b;
      if (!b) throw new DivulgacaoError("Vídeo não encontrado.", 404);
      return b;
    },
  };
}

async function bytesDaFoto(divulgacaoId: string, fotoId: string) {
  if (!/^[0-9a-f-]{36}$/i.test(fotoId)) throw new DivulgacaoError("Foto não encontrada.", 404);
  const [f] = await db
    .select({ bytes: divulgacaoFotos.bytes })
    .from(divulgacaoFotos)
    .where(and(eq(divulgacaoFotos.id, fotoId), eq(divulgacaoFotos.divulgacaoId, divulgacaoId)));
  if (!f) throw new DivulgacaoError("Foto não encontrada.", 404);
  return f.bytes;
}

/* ------------------------------------------------------------------ *
 * Afiliado (influenciador)
 * ------------------------------------------------------------------ */

async function afiliadoOnline(affiliateId: string) {
  const [a] = await db
    .select({ id: affiliates.id, code: affiliates.code, kind: affiliates.kind, status: affiliates.status, nome: users.name })
    .from(affiliates)
    .innerJoin(users, eq(users.id, affiliates.userId))
    .where(eq(affiliates.id, affiliateId));
  if (!a || a.kind !== "online" || a.status !== "active") throw new DivulgacaoError("Sua conta de afiliado não está ativa.", 403);
  return a;
}

export async function publicarComoAfiliado(affiliateId: string, entrada: Record<string, unknown>) {
  const fotosBrutas = regra(() => validarFotos(entrada.fotos)) ?? [];
  const videoBruto = regra(() => validarVideo(entrada.video)) ?? null;
  umOuOutro(fotosBrutas.length, Boolean(videoBruto));
  const dados = regra(() => validarDivulgacao("afiliado", entrada, fotosBrutas.length + (videoBruto ? 1 : 0)));
  const publicaEm = regra(() => agendaDaPeca(entrada.publicaEm)) ?? null;
  const a = await afiliadoOnline(affiliateId);
  const rifa = await rifaParaDivulgar(entrada.slug);
  // Vínculo aprovado e aceite da versão do termo da rifa: a mesma régua da comissão.
  const { recebe } = await comissaoNaRifa(db, affiliateId, rifa);
  if (!recebe) {
    throw new DivulgacaoError("Para divulgar esta rifa você precisa de vínculo aprovado com a organização e do aceite do termo dela.", 403);
  }
  // O vídeo é medido antes de contar: longo, pesado ou que não abre é erro de
  // preenchimento, e não gasta o limite do dia (só lê o que veio, nada grava).
  const video = videoBruto ? await lerVideo(videoBruto) : null;
  // Conta a tentativa antes de recusar: quem insiste com o mesmo texto estoura o limite.
  const limite = await hit(`divulgacao:afiliado:${affiliateId}`, 24 * 60, DIVULGACOES_POR_DIA);
  if (limite.excedeu) throw new DivulgacaoError("Muitas divulgações hoje. Tente amanhã.", 429);
  barrarPixPorFora(dados.legenda, rifa, `afiliado ${a.code}`);

  await conferirMidias(rifa.id, dados.midias);
  const fotos = await processarFotos(fotosBrutas);
  const modo = validarModo(rifa.modo);
  // Com foto ou vídeo próprio, passa pela organização mesmo no modo direto.
  const status = statusInicial("afiliado", modo, fotos.length > 0 || Boolean(video));
  const d = await gravar({
    campaignId: rifa.id,
    organizationId: rifa.organizationId,
    autor: "afiliado",
    affiliateId,
    legenda: dados.legenda,
    midiaIds: dados.midias,
    status,
    decididoEm: status === "publicada" ? new Date() : null,
    publicaEm,
  }, fotos, video);
  return { id: d.id, status: d.status, modo };
}

/** As rifas que este afiliado pode divulgar agora, com as mídias que ele pode escolher. */
export async function rifasParaDivulgar(affiliateId: string) {
  // Só as organizações onde o afiliado pode ter vínculo (aprovado, ou a antiga
  // do usuário): o resto nem entra na conferência rifa a rifa de `comissaoNaRifa`.
  const orgs = new Set<string>();
  const vinculadas = await db
    .select({ org: afiliadoVinculos.organizationId })
    .from(afiliadoVinculos)
    .where(and(eq(afiliadoVinculos.affiliateId, affiliateId), eq(afiliadoVinculos.status, "aprovado")));
  for (const v of vinculadas) orgs.add(v.org);
  const [dono] = await db
    .select({ org: users.organizationId })
    .from(affiliates)
    .innerJoin(users, eq(users.id, affiliates.userId))
    .where(eq(affiliates.id, affiliateId));
  if (dono?.org) orgs.add(dono.org);
  if (orgs.size === 0) return [];
  const rifas = await db
    .select({
      id: campaigns.id,
      slug: campaigns.slug,
      title: campaigns.title,
      organizationId: campaigns.organizationId,
      termoId: campaigns.termoId,
      commissionPctDefault: campaigns.commissionPctDefault,
      organizacao: organizations.name,
      modo: organizations.divulgacaoAfiliado,
    })
    .from(campaigns)
    .innerJoin(organizations, eq(organizations.id, campaigns.organizationId))
    .where(
      and(
        eq(campaigns.status, "published"),
        eq(campaigns.demonstracao, false),
        isNull(campaigns.travadaEm),
        inArray(campaigns.organizationId, [...orgs]),
        eq(organizations.active, true),
        isNull(organizations.archivedAt),
        isNull(organizations.banidaEm),
      ),
    );
  const aptas: typeof rifas = [];
  for (const r of rifas) if ((await comissaoNaRifa(db, affiliateId, r)).recebe) aptas.push(r);
  if (aptas.length === 0) return [];
  const midias = await db
    .select()
    .from(campaignMedia)
    .where(and(inArray(campaignMedia.campaignId, aptas.map((r) => r.id)), eq(campaignMedia.status, "ready"), ne(campaignMedia.role, "reels")))
    .orderBy(asc(campaignMedia.position));
  return aptas.map((r) => ({
    slug: r.slug,
    title: r.title,
    organizacao: r.organizacao,
    modo: r.modo,
    midias: midias
      .filter((m) => m.campaignId === r.id)
      .slice(0, 10)
      .map((m) => {
        const u = withUrls(m);
        return { id: m.id, role: m.role, url: u.url, poster: u.posterUrl, alt: m.altText };
      }),
  }));
}

/* ------------------------------------------------------------------ *
 * Apostador
 * ------------------------------------------------------------------ */

async function interruptorDoApostador() {
  if (!(await getPlataforma()).publicarApostador) throw new DivulgacaoError("Não encontrado.", 404);
}

async function apostadorComConta(req: Request) {
  const buyerId = req.session.buyer?.id;
  if (!buyerId) throw new DivulgacaoError("Entre na sua conta.", 401);
  const [b] = await db
    .select({ id: buyers.id, apelido: buyers.apelido })
    .from(buyers)
    .where(and(eq(buyers.id, buyerId), isNull(buyers.excluidoEm)));
  if (!b?.apelido) throw new DivulgacaoError("Escolha seu apelido em Minha conta para publicar.", 409);
  return b;
}

/** As rifas em que a pessoa tem compra paga — as únicas sobre as quais ela publica. */
export async function rifasDoApostador(req: Request) {
  await interruptorDoApostador();
  const b = await apostadorComConta(req);
  return db
    .selectDistinct({ slug: campaigns.slug, title: campaigns.title })
    .from(orders)
    .innerJoin(campaigns, eq(campaigns.id, orders.campaignId))
    .innerJoin(organizations, eq(organizations.id, campaigns.organizationId))
    .where(
      and(
        eq(orders.buyerId, b.id),
        eq(orders.status, "paid"),
        eq(campaigns.status, "published"),
        eq(campaigns.demonstracao, false),
        isNull(campaigns.travadaEm),
        eq(organizations.active, true),
        isNull(organizations.archivedAt),
        isNull(organizations.banidaEm),
      ),
    );
}

export async function publicarComoApostador(req: Request, entrada: Record<string, unknown>) {
  await interruptorDoApostador();
  const b = await apostadorComConta(req);
  const dados = regra(() => validarDivulgacao("apostador", entrada));
  if (entrada.video !== undefined && entrada.video !== null) throw new DivulgacaoError("O apostador publica texto e fotos.", 422);
  const fotosBrutas = regra(() => validarFotos(entrada.fotos)) ?? [];
  const publicaEm = regra(() => agendaDaPeca(entrada.publicaEm)) ?? null;
  const rifa = await rifaParaDivulgar(entrada.slug);
  // Só fala da rifa quem joga nela: compra paga (a PK do pedido, não um palpite).
  const [joga] = await db
    .select({ id: orders.id })
    .from(orders)
    .where(and(eq(orders.buyerId, b.id), eq(orders.campaignId, rifa.id), eq(orders.status, "paid")))
    .limit(1);
  if (!joga) throw new DivulgacaoError("Só quem comprou esta rifa publica sobre ela.", 403);
  const limite = await hit(`divulgacao:apostador:${b.id}`, 24 * 60, DIVULGACOES_POR_DIA);
  if (limite.excedeu) throw new DivulgacaoError("Muitas divulgações hoje. Tente amanhã.", 429);
  barrarPixPorFora(dados.legenda, rifa, `apostador @${b.apelido}`);
  const fotos = await processarFotos(fotosBrutas);
  const d = await gravar({
    campaignId: rifa.id,
    organizationId: rifa.organizationId,
    autor: "apostador",
    buyerId: b.id,
    legenda: dados.legenda,
    midiaIds: [],
    // Sempre a organização antes de ir ao ar, qualquer que seja o modo dela.
    status: statusInicial("apostador", "direta"),
    publicaEm,
  }, fotos);
  return { id: d.id, status: d.status };
}

/* ------------------------------------------------------------------ *
 * Minhas peças e retirar a própria
 * ------------------------------------------------------------------ */

const colunasDaMinha = {
  id: divulgacoes.id,
  slug: campaigns.slug,
  title: campaigns.title,
  legenda: divulgacoes.legenda,
  midias: divulgacoes.midiaIds,
  status: divulgacoes.status,
  motivo: divulgacoes.motivo,
  criadaEm: divulgacoes.createdAt,
  editadaEm: divulgacoes.editadaEm,
  versao: divulgacoes.versao,
  publicaEm: divulgacoes.publicaEm,
};

export async function minhasDoAfiliado(affiliateId: string) {
  const linhas = await db
    .select(colunasDaMinha)
    .from(divulgacoes)
    .innerJoin(campaigns, eq(campaigns.id, divulgacoes.campaignId))
    .where(eq(divulgacoes.affiliateId, affiliateId))
    .orderBy(desc(divulgacoes.createdAt))
    .limit(50);
  const fotos = await fotosDasPecas(linhas.map((l) => l.id));
  const videos = await videosDasPecas(linhas.map((l) => l.id));
  return linhas.map((l) => ({
    ...l,
    fotos: (fotos.get(l.id) ?? []).map((f) => `/api/affiliate/divulgacoes/${l.id}/fotos/${f}`),
    video: videoParaATela(`/api/affiliate/divulgacoes/${l.id}/video`, videos.get(l.id)),
  }));
}

/** O vídeo (ou o pôster) da própria peça, para o afiliado que publicou. O de outro é 404. */
export async function videoDaPecaDoAfiliado(affiliateId: string, id: string, poster: boolean) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new DivulgacaoError("Vídeo não encontrado.", 404);
  await afiliadoOnline(affiliateId);
  const [d] = await db
    .select({ id: divulgacoes.id })
    .from(divulgacoes)
    .where(and(eq(divulgacoes.id, id), eq(divulgacoes.affiliateId, affiliateId)));
  if (!d) throw new DivulgacaoError("Vídeo não encontrado.", 404);
  return arquivoDoVideo(id, poster);
}

/** A foto da própria peça, para o afiliado que publicou. A de outro é 404. */
export async function fotoDaPecaDoAfiliado(affiliateId: string, id: string, fotoId: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new DivulgacaoError("Foto não encontrada.", 404);
  // A porta fecha com a conta: afiliado bloqueado ou desligado não abre nada por aqui.
  await afiliadoOnline(affiliateId);
  const [d] = await db
    .select({ id: divulgacoes.id })
    .from(divulgacoes)
    .where(and(eq(divulgacoes.id, id), eq(divulgacoes.affiliateId, affiliateId)));
  if (!d) throw new DivulgacaoError("Foto não encontrada.", 404);
  return bytesDaFoto(id, fotoId);
}

export async function minhasDoApostador(req: Request) {
  await interruptorDoApostador();
  const b = await apostadorComConta(req);
  const linhas = await db
    .select(colunasDaMinha)
    .from(divulgacoes)
    .innerJoin(campaigns, eq(campaigns.id, divulgacoes.campaignId))
    .where(eq(divulgacoes.buyerId, b.id))
    .orderBy(desc(divulgacoes.createdAt))
    .limit(50);
  const fotos = await fotosDasPecas(linhas.map((l) => l.id));
  return linhas.map((l) => ({ ...l, fotos: (fotos.get(l.id) ?? []).map((f) => `/api/public/divulgacoes/minhas/${l.id}/fotos/${f}`) }));
}

/** A foto da própria peça, para quem publicou (em análise, recusada ou no ar). A de outra pessoa é 404. */
export async function fotoDoAutor(req: Request, id: string, fotoId: string) {
  await interruptorDoApostador();
  const b = await apostadorComConta(req);
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new DivulgacaoError("Foto não encontrada.", 404);
  const [d] = await db.select({ id: divulgacoes.id }).from(divulgacoes).where(and(eq(divulgacoes.id, id), eq(divulgacoes.buyerId, b.id)));
  if (!d) throw new DivulgacaoError("Foto não encontrada.", 404);
  return bytesDaFoto(id, fotoId);
}

/** Quem escreveu retira a própria peça (em análise ou no ar). O de outra pessoa é 404. */
export async function retirarPropria(dono: { affiliateId: string } | { buyerId: string }, id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new DivulgacaoError("Divulgação não encontrada.", 404);
  const dono_ = "affiliateId" in dono ? eq(divulgacoes.affiliateId, dono.affiliateId) : eq(divulgacoes.buyerId, dono.buyerId);
  await db.transaction(async (tx: Tx) => {
    const [r] = await tx
      .update(divulgacoes)
      // Quem retirou foi o próprio autor: `decidido_por` nulo — senão a peça que a
      // organização tinha aprovado contaria como decisão dela no sino do afiliado.
      .set({ status: "removida", decididoEm: new Date(), decididoPor: null })
      .where(and(eq(divulgacoes.id, id), dono_, inArray(divulgacoes.status, ["em_analise", "publicada"])))
      .returning({ id: divulgacoes.id });
    if (!r) throw new DivulgacaoError("Divulgação não encontrada.", 404);
    // Retirada não volta: as fotos e o vídeo saem junto.
    await tx.delete(divulgacaoFotos).where(eq(divulgacaoFotos.divulgacaoId, id));
    await tx.delete(divulgacaoVideos).where(eq(divulgacaoVideos.divulgacaoId, id));
  });
  return { ok: true };
}

export async function retirarPropriaDoApostador(req: Request, id: string) {
  await interruptorDoApostador();
  const b = await apostadorComConta(req);
  return retirarPropria({ buyerId: b.id }, id);
}

/**
 * Quem publicou corrige a própria peça (a legenda; o afiliado, também as
 * mídias), em análise ou no ar. A mesma régua da peça nova: texto, Pix por
 * fora, mídias da rifa, vínculo e termo do afiliado, compra paga do
 * apostador. Depois de editada, a peça **volta para a fila** — salvo a do
 * afiliado no modo direto da organização, que segue no ar. A edição sobe a
 * `versao`: a organização que lia a versão antiga recebe 409 ao decidir.
 *
 * O `UPDATE` repete a situação e a versão lidas: duas edições ao mesmo tempo,
 * ou a organização decidindo no meio, dão uma gravação e um 409. Peça de
 * outra pessoa é 404.
 */
async function editarPropria(
  dono: { autor: "afiliado"; affiliateId: string; quem: string } | { autor: "apostador"; buyerId: string; quem: string },
  id: string,
  entrada: Record<string, unknown>,
) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new DivulgacaoError("Divulgação não encontrada.", 404);
  // Sem `fotos` no corpo, ficam as que a peça tinha; lista vazia tira todas.
  const fotosBrutas = regra(() => validarFotos(entrada.fotos));
  // Sem `video` no corpo, fica o que a peça tinha; `null` tira. Só o afiliado manda vídeo.
  const videoBruto = regra(() => validarVideo(entrada.video));
  if (dono.autor === "apostador" && videoBruto) throw new DivulgacaoError("O apostador publica texto e fotos.", 422);
  // Sem `publicaEm` no corpo, fica a agenda que estava; vazio tira a agenda.
  const publicaEm = regra(() => agendaDaPeca(entrada.publicaEm));
  // A conferência de "peça vazia" do afiliado é feita abaixo, com as fotos e mídias que ficam.
  const dados = regra(() => validarDivulgacao(dono.autor, entrada, Number.MAX_SAFE_INTEGER));
  const doDono = dono.autor === "afiliado" ? eq(divulgacoes.affiliateId, dono.affiliateId) : eq(divulgacoes.buyerId, dono.buyerId);
  const [atual] = await db
    .select({ campaignId: divulgacoes.campaignId, status: divulgacoes.status, versao: divulgacoes.versao, midiaIds: divulgacoes.midiaIds })
    .from(divulgacoes)
    .where(and(eq(divulgacoes.id, id), doDono));
  if (!atual) throw new DivulgacaoError("Divulgação não encontrada.", 404);
  if (!podeEditar(atual.status as StatusDaDivulgacao)) {
    throw new DivulgacaoError("Esta divulgação já terminou. Envie uma nova.", 409);
  }
  // A versão de onde a edição partiu (a tela manda): outra aba gravou no meio,
  // esta não sobrescreve sem ler.
  const partiuDe = regra(() => versaoInformada(entrada.versao)) ?? atual.versao;
  if (partiuDe !== atual.versao) throw new DivulgacaoError("A divulgação mudou enquanto você editava. Abra de novo.", 409);
  let rifa: Awaited<ReturnType<typeof rifaParaDivulgar>>;
  try {
    rifa = await rifaParaDivulgar(null, atual.campaignId);
  } catch (err) {
    // Só "a rifa não está mais apta" vira 409; erro de banco segue como erro.
    if (err instanceof DivulgacaoError && err.status === 404) throw new DivulgacaoError("A rifa não recebe mais divulgação.", 409);
    throw err;
  }
  if (dono.autor === "afiliado") {
    if (!(await comissaoNaRifa(db, dono.affiliateId, rifa)).recebe) {
      throw new DivulgacaoError("Para divulgar esta rifa você precisa de vínculo aprovado com a organização e do aceite do termo dela.", 403);
    }
  } else {
    const [joga] = await db
      .select({ id: orders.id })
      .from(orders)
      .where(and(eq(orders.buyerId, dono.buyerId), eq(orders.campaignId, rifa.id), eq(orders.status, "paid")))
      .limit(1);
    if (!joga) throw new DivulgacaoError("Só quem comprou esta rifa publica sobre ela.", 403);
  }
  // O vídeo novo é medido antes de contar (erro de preenchimento não gasta o limite).
  const video = videoBruto ? await lerVideo(videoBruto) : null;
  // Conta a tentativa antes de recusar (o Pix por fora também conta), num balde só de edições.
  const pessoa = dono.autor === "afiliado" ? dono.affiliateId : dono.buyerId;
  const limite = await hit(`divulgacao-edicao:${dono.autor}:${pessoa}`, 24 * 60, EDICOES_POR_DIA);
  if (limite.excedeu) throw new DivulgacaoError("Muitas edições hoje. Tente amanhã.", 429);
  barrarPixPorFora(dados.legenda, rifa, dono.quem);
  // Sem `midias` no corpo, ficam as que a peça já tinha (e passam pela conferência de novo).
  const midias = dono.autor === "afiliado" ? (Array.isArray(entrada.midias) ? dados.midias : atual.midiaIds) : [];
  // Quantas fotos a peça terá depois da edição: as novas, ou as que já tinha.
  const fotosDepois = fotosBrutas ? fotosBrutas.length : ((await fotosDasPecas([id])).get(id) ?? []).length;
  // E se terá vídeo: o novo, nenhum (`null`) ou o que já tinha.
  const videoDepois = videoBruto === undefined ? (await videosDasPecas([id])).has(id) : videoBruto !== null;
  umOuOutro(fotosDepois, videoDepois);
  if (dono.autor === "afiliado" && !dados.legenda && midias.length === 0 && fotosDepois === 0 && !videoDepois) throw new DivulgacaoError(VAZIA_DO_AFILIADO, 422);
  if (dono.autor === "afiliado") await conferirMidias(rifa.id, midias);
  const fotos = fotosBrutas ? await processarFotos(fotosBrutas) : null;

  // Afiliado no modo direto e sem foto própria segue no ar; o resto volta a
  // esperar a organização (a foto, quem lê é ela).
  const status = dono.autor === "afiliado" ? statusInicial("afiliado", validarModo(rifa.modo), fotosDepois > 0 || videoDepois) : "em_analise";
  try {
    return await db.transaction(async (tx: Tx) => {
    const [r] = await tx
      .update(divulgacoes)
      .set({
        legenda: dados.legenda,
        midiaIds: midias,
        status,
        // Segue no ar (modo direto): a decisão que a colocou lá fica como está —
        // a aprovação ainda não vista continua no sino do afiliado. Volta para a
        // fila: a decisão antiga não vale mais, e a edição não é decisão da
        // organização (nada disto acende o sino).
        ...(status === atual.status
          ? {}
          : { motivo: null, decididoEm: status === "publicada" ? sql`now()` : null, decididoPor: null }),
        versao: sql`${divulgacoes.versao} + 1`,
        editadaEm: sql`now()`,
        ...(publicaEm === undefined ? {} : { publicaEm }),
      })
      .where(and(eq(divulgacoes.id, id), doDono, eq(divulgacoes.status, atual.status), eq(divulgacoes.versao, partiuDe)))
      .returning({ id: divulgacoes.id, status: divulgacoes.status, versao: divulgacoes.versao });
    if (!r) throw new DivulgacaoError("A divulgação mudou enquanto você editava. Abra de novo.", 409);
    // As fotos trocam junto com a versão: na mesma transação, depois do `UPDATE` que confere a versão.
    if (fotos) {
      await tx.delete(divulgacaoFotos).where(eq(divulgacaoFotos.divulgacaoId, id));
      if (fotos.length) await tx.insert(divulgacaoFotos).values(fotos.map((bytes, posicao) => ({ divulgacaoId: id, posicao, bytes })));
    }
    // O vídeo também: trocado (o novo ganha outro `id`) ou tirado.
    let videoId: string | null = null;
    if (videoBruto !== undefined) {
      await tx.delete(divulgacaoVideos).where(eq(divulgacaoVideos.divulgacaoId, id));
      if (video) videoId = await gravarVideo(tx, id, video);
    }
    return { ...r, videoId };
    }).then(({ videoId, ...r }) => {
      if (video && videoId) emSegundoPlano(gerarPosterDaPeca(id, videoId, video), "pôster da divulgação");
      return r;
    });
  } catch (err) {
    // A peça no ar volta para a fila: se já há outra desta rifa esperando, o índice decide.
    if (isUniqueViolation(err, "uq_divulgacao_afiliado_em_analise") || isUniqueViolation(err, "uq_divulgacao_apostador_em_analise")) {
      throw new DivulgacaoError("Você já tem uma divulgação desta rifa esperando a organização. Edite aquela.", 409);
    }
    throw err;
  }
}

export async function editarComoAfiliado(affiliateId: string, id: string, entrada: Record<string, unknown>) {
  const a = await afiliadoOnline(affiliateId);
  return editarPropria({ autor: "afiliado", affiliateId, quem: `afiliado ${a.code}` }, id, entrada);
}

export async function editarComoApostador(req: Request, id: string, entrada: Record<string, unknown>) {
  await interruptorDoApostador();
  const b = await apostadorComConta(req);
  return editarPropria({ autor: "apostador", buyerId: b.id, quem: `apostador @${b.apelido}` }, id, entrada);
}

/* ------------------------------------------------------------------ *
 * Organização: o modo, a fila e a decisão
 * ------------------------------------------------------------------ */

export async function modoDaOrganizacao(orgId: string): Promise<ModoDeDivulgacao> {
  const [o] = await db.select({ m: organizations.divulgacaoAfiliado }).from(organizations).where(eq(organizations.id, orgId));
  if (!o) throw new DivulgacaoError("Organização não encontrada.", 404);
  return validarModo(o.m);
}

export async function salvarModo(orgId: string, entrada: unknown) {
  const modo = regra(() => validarModo((entrada as { modo?: unknown } | null)?.modo));
  const [o] = await db
    .update(organizations)
    .set({ divulgacaoAfiliado: modo })
    .where(and(eq(organizations.id, orgId), isNull(organizations.archivedAt)))
    .returning({ id: organizations.id });
  if (!o) throw new DivulgacaoError("Organização não encontrada.", 404);
  return { modo };
}

/**
 * A fila da organização (a plataforma, com `orgOf` nulo, vê todas). Nunca
 * traz telefone, CPF nem e-mail: afiliado pelo nome curto e código,
 * apostador pelo apelido.
 */
export async function listarDaOrganizacao(req: Request, status?: unknown) {
  const org = orgOf(req);
  const filtro = typeof status === "string" && status in STATUS_DA_DIVULGACAO ? status : null;
  const linhas = await db
    .select({
      id: divulgacoes.id,
      autor: divulgacoes.autor,
      legenda: divulgacoes.legenda,
      midiaIds: divulgacoes.midiaIds,
      status: divulgacoes.status,
      motivo: divulgacoes.motivo,
      criadaEm: divulgacoes.createdAt,
      versao: divulgacoes.versao,
      editadaEm: divulgacoes.editadaEm,
      publicaEm: divulgacoes.publicaEm,
      slug: campaigns.slug,
      rifa: campaigns.title,
      organizacao: organizations.name,
      codigo: affiliates.code,
      nomeAfiliado: users.name,
      apelido: buyers.apelido,
    })
    .from(divulgacoes)
    .innerJoin(campaigns, eq(campaigns.id, divulgacoes.campaignId))
    .innerJoin(organizations, eq(organizations.id, divulgacoes.organizationId))
    .leftJoin(affiliates, eq(affiliates.id, divulgacoes.affiliateId))
    .leftJoin(users, eq(users.id, affiliates.userId))
    .leftJoin(buyers, eq(buyers.id, divulgacoes.buyerId))
    .where(and(org ? eq(divulgacoes.organizationId, org) : undefined, filtro ? eq(divulgacoes.status, filtro) : undefined))
    // A que espera a organização vem primeiro.
    .orderBy(sql`(${divulgacoes.status} = 'em_analise') desc`, desc(divulgacoes.createdAt))
    .limit(100);
  const fotos = await fotosDasPecas(linhas.map((l) => l.id));
  const videos = await videosDasPecas(linhas.map((l) => l.id));
  return linhas.map(({ nomeAfiliado, apelido, codigo, midiaIds, ...l }) => ({
    ...l,
    midias: midiaIds.length,
    // A organização lê a foto e assiste ao vídeo antes de autorizar: a varredura do Pix por fora só lê texto.
    fotos: (fotos.get(l.id) ?? []).map((f) => `/api/admin/divulgacoes/${l.id}/fotos/${f}`),
    video: videoParaATela(`/api/admin/divulgacoes/${l.id}/video`, videos.get(l.id)),
    quem: l.autor === "afiliado" ? `${nomeCurto(nomeAfiliado)} (${codigo})` : `@${apelido ?? "apostador"}`,
  }));
}

/** A foto de uma peça, para quem decide: no recorte da organização (a do vizinho é 404). */
export async function fotoDoPainel(req: Request, id: string, fotoId: string) {
  await pecaNoRecorte(req, id, "Foto não encontrada.");
  return bytesDaFoto(id, fotoId);
}

/** O vídeo (ou o pôster) de uma peça, para quem decide: no recorte da organização (o do vizinho é 404). */
export async function videoDoPainel(req: Request, id: string, poster: boolean) {
  await pecaNoRecorte(req, id, "Vídeo não encontrado.");
  return arquivoDoVideo(id, poster);
}

async function pecaNoRecorte(req: Request, id: string, naoAchou: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new DivulgacaoError(naoAchou, 404);
  const org = orgOf(req);
  const [d] = await db
    .select({ id: divulgacoes.id })
    .from(divulgacoes)
    .where(and(eq(divulgacoes.id, id), org ? eq(divulgacoes.organizationId, org) : undefined));
  if (!d) throw new DivulgacaoError(naoAchou, 404);
}

/** Quantas peças esperam a organização — para o aviso da tela, sem trazer a lista. */
export async function pendentesDaOrganizacao(req: Request) {
  const org = orgOf(req);
  const [r] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(divulgacoes)
    .where(and(eq(divulgacoes.status, "em_analise"), org ? eq(divulgacoes.organizationId, org) : undefined));
  return r?.n ?? 0;
}

/**
 * Decide uma peça. A linha é travada (`FOR UPDATE`) e o `UPDATE` repete o
 * status que a régua conferiu: dois cliques dão uma decisão e um 409. O do
 * vizinho é 404 — conferido antes de tudo.
 */
export async function decidir(req: Request, id: string, entrada: unknown) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new DivulgacaoError("Divulgação não encontrada.", 404);
  const { acao, motivo, versao } = regra(() => validarDecisao(entrada));
  const { de, para } = DE_PARA_DA_DECISAO[acao];
  const org = orgOf(req);
  const decidida = await db.transaction(async (tx: Tx) => {
    const r = await tx.execute(sql`select id, organization_id, campaign_id, autor, affiliate_id, status, versao from divulgacoes where id = ${id} for update`);
    const linha = r.rows[0] as
      | { id: string; organization_id: string; campaign_id: string; autor: string; affiliate_id: string | null; status: string; versao: number }
      | undefined;
    if (!linha || (org && linha.organization_id !== org)) throw new DivulgacaoError("Divulgação não encontrada.", 404);
    if (linha.status !== de) throw new DivulgacaoError("Esta divulgação já foi decidida.", 409);
    // Quem publicou editou depois que a lista foi aberta: decidir agora seria
    // aprovar (ou recusar) um texto que ninguém leu.
    if (Number(linha.versao) !== versao) {
      throw new DivulgacaoError("Quem publicou editou a divulgação. Leia de novo antes de decidir.", 409);
    }
    if (acao === "aprovar") {
      // Aprovar põe no ar: a rifa e o vínculo precisam continuar valendo.
      const [c] = await tx
        .select({
          id: campaigns.id,
          organizationId: campaigns.organizationId,
          termoId: campaigns.termoId,
          commissionPctDefault: campaigns.commissionPctDefault,
          status: campaigns.status,
          travadaEm: campaigns.travadaEm,
        })
        .from(campaigns)
        .where(eq(campaigns.id, linha.campaign_id));
      if (!c || c.status !== "published" || c.travadaEm) throw new DivulgacaoError("A rifa não está mais no ar.", 409);
      if (linha.affiliate_id && !(await comissaoNaRifa(tx, linha.affiliate_id, c)).recebe) {
        throw new DivulgacaoError("O afiliado não tem mais vínculo aprovado ou o aceite do termo desta rifa.", 409);
      }
    }
    const [novo] = await tx
      .update(divulgacoes)
      // O relógio do banco, como o "visto" do afiliado: réplicas com relógios
      // diferentes não escondem a decisão do sino dele.
      .set({ status: para, motivo, decididoEm: sql`now()`, decididoPor: req.user?.id ?? null })
      .where(and(eq(divulgacoes.id, id), eq(divulgacoes.status, de), eq(divulgacoes.versao, Number(linha.versao))))
      .returning({ id: divulgacoes.id, status: divulgacoes.status, buyerId: divulgacoes.buyerId, versao: divulgacoes.versao, publicaEm: divulgacoes.publicaEm });
    if (!novo) throw new DivulgacaoError("Esta divulgação já foi decidida.", 409);
    // Recusada ou retirada não volta (não se edita): as fotos de quem publicou saem já,
    // na mesma transação — foto de pessoa não fica guardada sem uso.
    if (para === "recusada" || para === "removida") {
      await tx.delete(divulgacaoFotos).where(eq(divulgacaoFotos.divulgacaoId, id));
      await tx.delete(divulgacaoVideos).where(eq(divulgacaoVideos.divulgacaoId, id));
    }
    return { id: novo.id, status: novo.status, buyerId: novo.buyerId, versao: novo.versao, publicaEm: novo.publicaEm, motivo, acao, campaignId: linha.campaign_id };
  });
  // Quem publicou fica sabendo, fora da transação: aviso nunca derruba a decisão.
  // Leva o que ESTA transação decidiu — reler a linha depois pegaria a retirada
  // que o próprio autor fez logo em seguida e mandaria o aviso errado.
  if (decidida.buyerId) {
    emSegundoPlano(
      avisarAutorDaDecisao({
        id,
        buyerId: decidida.buyerId,
        status: decidida.status as StatusDaDivulgacao,
        versao: decidida.versao,
        publicaEm: decidida.publicaEm,
        motivo,
        campaignId: decidida.campaignId,
      }),
      "aviso da divulgação",
    );
  }
  return { id: decidida.id, status: decidida.status, acao: decidida.acao, campaignId: decidida.campaignId };
}

/**
 * O apostador recebe push e o aviso no trevo (a chave leva a versão e a
 * situação: a mesma decisão não avisa duas vezes; a da versão editada, sim). O afiliado não tem push — vê o número no sino
 * do painel (`decididasParaOAfiliado`). Sem telefone nem nome no aviso.
 */
async function avisarAutorDaDecisao(d: { id: string; buyerId: string; status: StatusDaDivulgacao; versao: number; publicaEm: Date | null; motivo: string | null; campaignId: string }) {
  const [c] = await db.select({ titulo: campaigns.title }).from(campaigns).where(eq(campaigns.id, d.campaignId));
  if (!c) return;
  const texto = avisoDaDecisao(d.status, c.titulo, d.motivo, d.publicaEm);
  if (!texto) return;
  // A versão na chave: editada e aprovada de novo é outra decisão, e avisa de novo.
  await avisar([d.buyerId], "divulgacao", `${d.id}:${d.versao}:${d.status}`, { ...texto, url: "/publicar", tag: `divulgacao-${d.id}` });
}

/**
 * Quantas peças do afiliado a organização decidiu desde a última vez que ele
 * abriu o sino (`users.avisos_vistos_em`, o mesmo "visto" do painel). Só a
 * decisão da organização (`decidido_por`), nunca o que ele mesmo retirou.
 */
export async function decididasParaOAfiliado(affiliateId: string, userId: string): Promise<number> {
  const [r] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(divulgacoes)
    .innerJoin(users, eq(users.id, userId))
    .where(
      and(
        eq(divulgacoes.affiliateId, affiliateId),
        isNotNull(divulgacoes.decididoPor),
        isNotNull(divulgacoes.decididoEm),
        sql`${divulgacoes.decididoEm} > coalesce(${users.avisosVistosEm}, '-infinity'::timestamp)`,
      ),
    );
  return r?.n ?? 0;
}

/** O afiliado abriu o sino: o que já foi decidido fica visto, para ele. */
export async function marcarVistoDoAfiliado(userId: string) {
  // O relógio do banco, o mesmo de `decidido_em`.
  await db.update(users).set({ avisosVistosEm: sql`now()` }).where(eq(users.id, userId));
}

/* ------------------------------------------------------------------ *
 * Público: as divulgações na página da rifa
 * ------------------------------------------------------------------ */

const NA_PAGINA_DA_RIFA = 12;

/**
 * As peças no ar de uma rifa. Só enquanto a rifa vende de verdade e a
 * condição de quem publicou continua valendo: o afiliado perdeu o vínculo
 * ou o aceite, a peça some; o interruptor do apostador desligou, as dele
 * somem. Sem telefone, e-mail ou CPF — nome curto e apelido.
 */
export async function divulgacoesDaRifa(slug: string) {
  return pecasNoAr(eq(campaigns.slug, slug), NA_PAGINA_DA_RIFA);
}

/**
 * As peças no ar das rifas que passam no filtro, as mais novas primeiro. A
 * régua da rifa (publicada, não demonstração, não travada, promotora no ar) e
 * o que dá para conferir de quem publicou (afiliado ativo; apostador com o
 * interruptor, apelido, conta e compra paga) vão na própria consulta, antes do
 * `LIMIT` — senão as peças de quem não vale ocupariam o lugar das que valem.
 * O vínculo e o termo do afiliado (`comissaoNaRifa`) são conferidos peça a
 * peça: perdeu, a peça some. Sem telefone, e-mail ou CPF — nome curto e apelido.
 */
async function pecasNoAr(filtroDaRifa: SQL | undefined, limite: number) {
  const apostadorLigado = (await getPlataforma()).publicarApostador;
  // O estorno desfaz a compra: a peça de quem não joga mais sai do ar (sem apagar nada).
  const compraPaga = sql<boolean>`exists (
    select 1 from orders o
     where o.buyer_id = ${divulgacoes.buyerId} and o.campaign_id = ${divulgacoes.campaignId} and o.status = 'paid'
  )`;
  const quemVale = or(
    and(eq(divulgacoes.autor, "afiliado"), eq(affiliates.status, "active"), isNotNull(affiliates.code)),
    apostadorLigado ? and(eq(divulgacoes.autor, "apostador"), isNotNull(buyers.apelido), isNull(buyers.excluidoEm), compraPaga) : undefined,
  );
  const linhas = await db
    .select({
      id: divulgacoes.id,
      campaignId: divulgacoes.campaignId,
      autor: divulgacoes.autor,
      legenda: divulgacoes.legenda,
      midiaIds: divulgacoes.midiaIds,
      criadaEm: divulgacoes.createdAt,
      editadaEm: divulgacoes.editadaEm,
      publicaEm: divulgacoes.publicaEm,
      affiliateId: divulgacoes.affiliateId,
      codigo: affiliates.code,
      nomeAfiliado: users.name,
      apelido: buyers.apelido,
      rifa: {
        id: campaigns.id,
        slug: campaigns.slug,
        title: campaigns.title,
        prizeTitle: campaigns.prizeTitle,
        organizationId: campaigns.organizationId,
        termoId: campaigns.termoId,
        commissionPctDefault: campaigns.commissionPctDefault,
      },
      organizacao: organizations.name,
      organizacaoSlug: organizations.slug,
    })
    .from(divulgacoes)
    .innerJoin(campaigns, eq(campaigns.id, divulgacoes.campaignId))
    .innerJoin(organizations, eq(organizations.id, campaigns.organizationId))
    .leftJoin(affiliates, eq(affiliates.id, divulgacoes.affiliateId))
    .leftJoin(users, eq(users.id, affiliates.userId))
    .leftJoin(buyers, eq(buyers.id, divulgacoes.buyerId))
    .where(
      and(
        filtroDaRifa,
        eq(campaigns.status, "published"),
        eq(campaigns.demonstracao, false),
        isNull(campaigns.travadaEm),
        eq(organizations.active, true),
        isNull(organizations.archivedAt),
        isNull(organizations.banidaEm),
        // Agendada só depois da hora (a aprovação já veio antes: está `publicada`).
        eq(divulgacoes.status, "publicada"),
        noArAgora(),
        quemVale,
      ),
    )
    .orderBy(desc(sql`coalesce(${divulgacoes.publicaEm}, ${divulgacoes.createdAt})`))
    .limit(limite * 2);

  const ids = Array.from(new Set(linhas.flatMap((l) => l.midiaIds)));
  const rifasDasPecas = Array.from(new Set(linhas.map((l) => l.campaignId)));
  const midias = ids.length
    ? await db
        .select()
        .from(campaignMedia)
        .where(and(inArray(campaignMedia.campaignId, rifasDasPecas), eq(campaignMedia.status, "ready"), inArray(campaignMedia.id, ids)))
    : [];
  const porId = new Map(midias.map((m) => [m.id, m]));
  const fotosPorPeca = await fotosDasPecas(linhas.map((l) => l.id));
  const videosPorPeca = await videosDasPecas(linhas.map((l) => l.id));

  const saida = [];
  for (const l of linhas) {
    if (saida.length >= limite) break;
    const c = l.rifa;
    if (l.autor === "afiliado" && !(await comissaoNaRifa(db, l.affiliateId!, c)).recebe) continue;
    saida.push({
      id: l.id,
      autor: l.autor,
      quem: l.autor === "afiliado" ? nomeCurto(l.nomeAfiliado) : `@${l.apelido}`,
      apelido: l.autor === "apostador" ? l.apelido : null,
      codigo: l.autor === "afiliado" ? l.codigo : null,
      legenda: l.legenda,
      // A hora que conta para quem lê é a de entrar no ar.
      criadaEm: l.publicaEm ?? l.criadaEm,
      editada: Boolean(l.editadaEm),
      // As fotos de quem publicou saem só pela rota que confere de novo que a peça está no ar.
      fotos: (fotosPorPeca.get(l.id) ?? []).map((f) => `/api/public/divulgacoes/${l.id}/fotos/${f}`),
      // O vídeo do afiliado, pela mesma porta conferida (`videoPublico`).
      video: videoParaATela(`/api/public/divulgacoes/${l.id}/video`, videosPorPeca.get(l.id)),
      // O link de quem divulga (só afiliado): a compra por ele paga a comissão dele.
      link: linkDaDivulgacao(c.slug, l.autor === "afiliado" ? l.codigo : null),
      // A rifa de que a peça fala (no feed, o cartão leva a ela). Nada de preço aqui: a página da rifa é que vende.
      rifa: { slug: c.slug, titulo: c.title, premio: c.prizeTitle, organizacao: l.organizacao, organizacaoSlug: l.organizacaoSlug },
      midias: l.midiaIds
        .map((id) => porId.get(id))
        .filter((m): m is NonNullable<typeof m> => Boolean(m) && m!.campaignId === c.id)
        .slice(0, DIVULGACAO_MIDIAS_MAX)
        .map((m) => {
          const u = withUrls(m);
          return { role: m.role, url: u.url, poster: u.posterUrl, srcSet: u.srcSetWebp, alt: m.altText };
        }),
    });
  }
  return saida;
}

/** Quantas peças o feed da vitrine traz (entra uma a cada `DIVULGACAO_A_CADA_RIFAS` rifas). */
export const DIVULGACOES_NO_FEED = 10;
/** O feed é igual para todos: guardado 5 s no servidor (como a coluna ao vivo). */
const GUARDA_DO_FEED_MS = 5_000;
let feedGuardado: { ate: number; valor: Promise<Awaited<ReturnType<typeof pecasNoAr>>> } | null = null;

/**
 * As divulgações do feed da vitrine: as peças no ar mais novas de todas as
 * rifas que a vitrine mostraria, com a mesma régua da página da rifa (e sem
 * demonstração, rifa travada nem promotora arquivada ou banida).
 */
export function divulgacoesDoFeed() {
  const agora = Date.now();
  if (feedGuardado && feedGuardado.ate > agora) return feedGuardado.valor;
  // A régua da rifa vai na própria consulta: nada de trazer todas as rifas para a memória.
  const valor = pecasNoAr(undefined, DIVULGACOES_NO_FEED);
  feedGuardado = { ate: agora + GUARDA_DO_FEED_MS, valor };
  // Falhou: não guarda o erro (a próxima visita tenta de novo).
  valor.catch(() => {
    if (feedGuardado?.valor === valor) feedGuardado = null;
  });
  return valor;
}

/** Para as provas: esquecer o feed guardado. */
export function esquecerFeedDeDivulgacoes() {
  feedGuardado = null;
}

/**
 * A foto pública: só da peça que a página da rifa mostraria agora — a régua
 * de `divulgacoesDaRifa`, conferida para esta peça só: no ar, rifa vendendo
 * de verdade, promotora no ar e a condição de quem publicou. Apostador: o
 * interruptor ligado, apelido, conta não excluída e compra paga naquela rifa.
 * Afiliado: conta ativa e vínculo e aceite valendo (`comissaoNaRifa`).
 * Retirada, recusada, estornada, sem vínculo ou com o interruptor desligado,
 * a foto some junto.
 */
export async function fotoPublica(id: string, fotoId: string) {
  await pecaPublica(id, "Foto não encontrada.");
  return bytesDaFoto(id, fotoId);
}

/** O vídeo público (ou o pôster): a mesma régua da foto pública — só da peça que a página mostraria agora. */
export async function videoPublico(id: string, poster: boolean) {
  await pecaPublica(id, "Vídeo não encontrado.");
  return arquivoDoVideo(id, poster);
}

async function pecaPublica(id: string, naoAchou: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new DivulgacaoError(naoAchou, 404);
  const [d] = await db
    .select({
      autor: divulgacoes.autor,
      affiliateId: divulgacoes.affiliateId,
      afiliadoAtivo: affiliates.status,
      campanha: {
        id: campaigns.id,
        organizationId: campaigns.organizationId,
        termoId: campaigns.termoId,
        commissionPctDefault: campaigns.commissionPctDefault,
      },
      apostadorOk: sql<boolean>`(
        ${buyers.apelido} is not null and ${buyers.excluidoEm} is null
        and exists (select 1 from orders o where o.buyer_id = ${divulgacoes.buyerId} and o.campaign_id = ${divulgacoes.campaignId} and o.status = 'paid')
      )`,
    })
    .from(divulgacoes)
    .innerJoin(campaigns, eq(campaigns.id, divulgacoes.campaignId))
    .innerJoin(organizations, eq(organizations.id, campaigns.organizationId))
    .leftJoin(buyers, eq(buyers.id, divulgacoes.buyerId))
    .leftJoin(affiliates, eq(affiliates.id, divulgacoes.affiliateId))
    .where(
      and(
        eq(divulgacoes.id, id),
        eq(divulgacoes.status, "publicada"),
        noArAgora(),
        eq(campaigns.status, "published"),
        eq(campaigns.demonstracao, false),
        isNull(campaigns.travadaEm),
        eq(organizations.active, true),
        isNull(organizations.archivedAt),
        isNull(organizations.banidaEm),
      ),
    );
  if (!d) throw new DivulgacaoError(naoAchou, 404);
  if (d.autor === "apostador") {
    if (!d.apostadorOk || !(await getPlataforma()).publicarApostador) throw new DivulgacaoError(naoAchou, 404);
  } else if (!d.affiliateId || d.afiliadoAtivo !== "active" || !(await comissaoNaRifa(db, d.affiliateId, d.campanha)).recebe) {
    throw new DivulgacaoError(naoAchou, 404);
  }
}
