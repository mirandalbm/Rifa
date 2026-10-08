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
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { db } from "../db";
import { campaignMedia, MAX_PHOTOS, MAX_VIDEO_SECONDS } from "@shared/schema";
import { randomUUID } from "node:crypto";
import { storage, mediaKey, chaveDaCampanha, LocalDiskStorage, type UploadTicket } from "./storage";
import { apagarNoStream, esquecerDoStream } from "./streamPendentes";
import {
  comArquivoTemporarioEmPedacos,
  comVagaDeDownload,
  FfmpegLocal,
  processadorDeVideo,
  publicarVideo,
  type VideoPublicado,
} from "./videoProcessor";
import { entregaHlsLigada, hlsParaATela } from "@shared/stream";
import { tokenDoStream } from "./streamAssinatura";
import { emSegundoPlano } from "./push";
import { POSTER_BAIXAR_ATE_BYTES, chaveDoPoster, instanteDaCapa, posterPublico } from "@shared/poster";
import { bufferReader, probeImage, probeVideoDimensions, probeVideoDuration, UnreadableMediaError } from "./probe";
import { CORTE_ATE_BYTES, trechoDoCorte } from "@shared/corte";
import { processImage, srcSet, removeVariants, type ImageVariant } from "./images";
import { MAX_CARROSSEL, duracao, formatoDoVideo, limparLegenda, problemaNaLegenda } from "@shared/publicacao";
import { REELS_POR_RIFA, ehVideo, videoEmPe } from "@shared/reels";

export type MediaRole = "banner" | "photo" | "video" | "reels";

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
  // Só no Reels (fora do carrossel): em pé e até 3 min, medido no servidor.
  reels: {
    max: REELS_POR_RIFA,
    mimes: ["video/mp4", "video/quicktime"],
    maxBytes: 2 * 1024 * 1024 * 1024,
    label: "vídeo do Reels",
  },
};

/** Quantas peças daquele papel a campanha já tem. */
async function countRole(campaignId: string, role: MediaRole, q: Executor = db): Promise<number> {
  const rows = await q
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
async function pecasDoCarrossel(campaignId: string, q: Executor = db): Promise<number> {
  const rows = await q
    .select({ id: campaignMedia.id })
    .from(campaignMedia)
    .where(and(eq(campaignMedia.campaignId, campaignId), inArray(campaignMedia.role, ["photo", "video"])));
  return rows.length;
}

async function cabe(campaignId: string, role: MediaRole, q: Executor = db) {
  if (role === "banner") return (await countRole(campaignId, role, q)) < 1;
  if (role === "reels") return (await countRole(campaignId, role, q)) < REELS_POR_RIFA;
  return (await pecasDoCarrossel(campaignId, q)) < MAX_CARROSSEL - 1;
}

/** Contar e gravar sob a mesma trava por rifa: dois envios na última vaga, um entra. */
const TRAVA_MIDIA = 811_105;
type Executor = Pick<typeof db, "select">;

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
        : params.role === "reels"
          ? `Esta rifa já tem ${REELS_POR_RIFA} vídeos no Reels. Apague um para publicar outro.`
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
  legenda?: unknown;
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
  legenda?: unknown;
  mime: string;
}) {
  const rule = RULES[params.role];
  if (!rule) throw new MediaRuleError("Tipo de mídia inválido.", 400);

  // A legenda é só do reels (o carrossel usa a da publicação), na régua da
  // legenda — recusada aqui, o arquivo enviado sai junto (a limpeza acima).
  let legenda: string | null = null;
  if (params.role === "reels") {
    const problema = problemaNaLegenda(params.legenda);
    if (problema) throw new MediaRuleError(problema);
    legenda = limparLegenda(typeof params.legenda === "string" ? params.legenda : "") || null;
  }

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
    if (params.role === "reels") {
      // Só no Reels: em pé e até 3 min — medido aqui, nunca o que o navegador disse.
      const seconds = await probeVideoDuration(read, size);
      if (formatoDoVideo(seconds) !== "reels") {
        throw new MediaRuleError(`O vídeo tem ${duracao(seconds)} — no Reels o limite é ${duracao(180)}.`);
      }
      durationS = Math.round(seconds);
      const dim = await probeVideoDimensions(read, size);
      if (!dim || !videoEmPe({ largura: dim.width, altura: dim.height })) {
        throw new MediaRuleError("O vídeo do Reels precisa estar em pé (9 por 16).");
      }
      width = dim.width;
      height = dim.height;
    } else if (params.role === "video") {
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

  // Conferido de novo aqui, com a rifa travada: dois envios ao mesmo tempo
  // passaram pelo passo 1, e contar fora da trava deixaria os dois entrarem.
  const created = await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(${TRAVA_MIDIA}, hashtext(${params.campaignId}))`);
    if (!(await cabe(params.campaignId, params.role, tx))) {
      throw new MediaRuleError(
        params.role === "reels" ? `Esta rifa já tem ${REELS_POR_RIFA} vídeos no Reels.` : `O carrossel tem no máximo ${MAX_CARROSSEL} peças, contando o banner.`,
        409,
      );
    }
    const position =
      params.role === "banner" ? 0 : params.role === "reels" ? await countRole(params.campaignId, "reels", tx) : await pecasDoCarrossel(params.campaignId, tx);
    const [linha] = await tx
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
        legenda,
        bytes: size,
        status: "ready",
      })
      .returning();
    return linha;
  });

  // O pôster vem depois, em segundo plano: a resposta não espera o ffmpeg e a
  // falha dele (ou a falta dele) deixa o vídeo como está, sem pôster.
  if (ehVideo(params.role)) {
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
 * temporário, só até `POSTER_BAIXAR_ATE_BYTES` — acima disso fica sem pôster.
 *
 * Com a entrega em HLS ligada (`entregaHlsLigada()`), o mesmo passo deixa o
 * vídeo no Cloudflare Stream e grava o `uid` e o HLS junto do pôster. A mídia
 * removida no meio do caminho leva os dois: o pôster sai do armazenamento e o
 * vídeo, do Stream.
 */
export async function gerarPosterDaMidia(
  mediaId: string,
  campaignId: string,
  storageKey: string,
  bytes: number,
  // O pôster retroativo pede só o quadro: guardar no Stream o vídeo de uma
  // rifa que talvez nem esteja no ar seria custo sem ninguém assistir.
  opcoes: { soPoster?: boolean } = {},
) {
  const store = storage();
  const entregar = !opcoes.soPoster && entregaHlsLigada(process.env);
  const gerar = async (arquivo: string): Promise<VideoPublicado> =>
    entregar ? publicarVideo(processadorDeVideo(), arquivo) : { poster: await processadorDeVideo().gerarPoster(arquivo), stream: null };
  let saida: VideoPublicado;
  if (store instanceof LocalDiskStorage) {
    await store.size(storageKey); // traz da cópia se o disco perdeu o arquivo
    saida = await gerar(store.caminho(storageKey));
  } else if (bytes <= POSTER_BAIXAR_ATE_BYTES) {
    const ext = storageKey.slice(storageKey.lastIndexOf("."));
    // Em pedaços: o vídeo do bucket nunca vem inteiro para a memória do processo web.
    saida = await comVagaDeDownload(() => comArquivoTemporarioEmPedacos(bytes, store.reader(storageKey), ext, gerar));
  } else {
    saida = { poster: null, stream: null };
  }
  const { poster, stream } = saida;
  if (!poster && !stream) return null;

  let chave: string | null = null;
  try {
    if (poster) {
      chave = chaveDoPoster(campaignId, randomUUID());
      await store.write(chave, poster, "image/webp");
    }
    // Só entra se a mídia ainda existe e ainda não passou por aqui: removida no
    // meio do caminho, o que foi gerado é lixo e sai.
    const [gravado] = await db
      .update(campaignMedia)
      .set({ posterKey: chave, streamUid: stream?.uid ?? null, streamHls: stream?.hls ?? null, streamAssinado: stream?.assinado ?? false })
      // E só se o arquivo ainda é o que foi processado: cortado no meio do caminho
      // (`cortarVideo`), o quadro e o HLS são do vídeo de antes.
      .where(and(eq(campaignMedia.id, mediaId), eq(campaignMedia.storageKey, storageKey), isNull(campaignMedia.posterKey), isNull(campaignMedia.streamUid)))
      .returning({ id: campaignMedia.id });
    if (gravado) {
      // Agora o vídeo tem dono (a mídia): sai da lista do relógio.
      if (stream) await esquecerDoStream(stream.uid).catch(() => {});
      return chave;
    }
  } catch (e) {
    await descartar(chave, stream?.uid);
    throw e;
  }
  await descartar(chave, stream?.uid);
  return null;
}

/**
 * Escolher a capa (Fase D): o quadro do instante que a organização escolheu
 * vira o pôster do vídeo. O instante é só um número conferido contra a duração
 * medida aqui (`instanteDaCapa`); o quadro é tirado pelo `ffmpeg` local — o
 * Stream não entra (seria mandar o vídeo para fora por um quadro). Troca o
 * pôster com a mídia travada (`FOR UPDATE`): duas escolhas ao mesmo tempo
 * ficam uma depois da outra, e o pôster de antes sai do armazenamento depois
 * da transação. O recorte (a rifa do vizinho) é conferido na rota, antes.
 */
export async function escolherCapaDoVideo(mediaId: string, instanteBruto: unknown): Promise<{ poster: string; instante: number }> {
  const [m] = await db
    .select({
      campaignId: campaignMedia.campaignId,
      role: campaignMedia.role,
      status: campaignMedia.status,
      storageKey: campaignMedia.storageKey,
      posterKey: campaignMedia.posterKey,
      durationS: campaignMedia.durationS,
      bytes: campaignMedia.bytes,
      createdAt: campaignMedia.createdAt,
    })
    .from(campaignMedia)
    .where(eq(campaignMedia.id, mediaId));
  if (!m) throw new MediaRuleError("Mídia não encontrada.", 404);
  if (!ehVideo(m.role) || m.status !== "ready") throw new MediaRuleError("Só vídeo pronto tem capa para escolher.", 409);
  const t = instanteDaCapa(instanteBruto, m.durationS);
  if ("erro" in t) throw new MediaRuleError(t.erro, 422);
  // O primeiro pôster sai em segundo plano no envio (e, com a entrega em HLS, deixa
  // o vídeo no Stream na mesma gravação condicional): escolher antes disso faria o
  // envio descartar o que preparou.
  if (!m.posterKey && Date.now() - m.createdAt.getTime() < FOLGA_PARA_ESCOLHER_CAPA_MS) {
    throw new MediaRuleError("O vídeo ainda está sendo preparado. Tente de novo em alguns minutos.", 409);
  }

  const store = storage();
  const tirar = (arquivo: string) => new FfmpegLocal().quadroEm(arquivo, t.instante);
  let quadro: Buffer | null = null;
  if (store instanceof LocalDiskStorage) {
    await store.size(m.storageKey); // traz da cópia se o disco perdeu o arquivo
    quadro = await tirar(store.caminho(m.storageKey));
  } else if (m.bytes != null && m.bytes <= POSTER_BAIXAR_ATE_BYTES) {
    const ext = m.storageKey.slice(m.storageKey.lastIndexOf("."));
    quadro = await comVagaDeDownload(() => comArquivoTemporarioEmPedacos(m.bytes!, store.reader(m.storageKey), ext, tirar));
  }
  if (!quadro) throw new MediaRuleError("Não consegui tirar o quadro deste vídeo agora. Tente outro instante ou mais tarde.", 409);

  const chave = chaveDoPoster(m.campaignId, randomUUID());
  await store.write(chave, quadro, "image/webp");
  let antiga: string | null = null;
  try {
    const trocou = await db.transaction(async (tx) => {
      const [atual] = await tx
        .select({ posterKey: campaignMedia.posterKey, storageKey: campaignMedia.storageKey })
        .from(campaignMedia)
        .where(eq(campaignMedia.id, mediaId))
        .for("update");
      if (!atual) return false;
      // Cortado enquanto o quadro saía: o quadro é do vídeo de antes.
      if (atual.storageKey !== m.storageKey) throw new MediaRuleError("O vídeo mudou enquanto a capa saía. Escolha de novo.", 409);
      antiga = atual.posterKey;
      await tx.update(campaignMedia).set({ posterKey: chave }).where(eq(campaignMedia.id, mediaId));
      return true;
    });
    if (!trocou) {
      await store.remove(chave).catch(() => {});
      throw new MediaRuleError("Mídia não encontrada.", 404);
    }
  } catch (e) {
    await store.remove(chave).catch(() => {});
    throw e;
  }
  if (antiga) await store.remove(antiga).catch(() => {});
  return { poster: store.publicUrl(chave), instante: t.instante };
}

/**
 * Cortar o início e o fim do vídeo (Fase D), em modo cópia (`argsDoCorte`): o
 * trecho vem do navegador só como dois números, conferidos contra a duração
 * medida aqui (`trechoDoCorte`); o arquivo novo é medido de novo (duração e
 * medidas) e passa pela régua do papel — nada do navegador vira medida. O
 * arquivo novo ganha chave nova; a troca é feita com a mídia travada e só se o
 * arquivo ainda é o que foi cortado (dois cortes ao mesmo tempo: um 200 e um
 * 409). Pôster e HLS eram do vídeo de antes: saem junto (o original, o pôster e
 * o vídeo do Stream, depois da transação) e o pôster novo sai em segundo plano,
 * pelo mesmo caminho do envio. O recorte é conferido na rota, antes.
 */
export async function cortarVideo(mediaId: string, inicioBruto: unknown, fimBruto: unknown) {
  const [m] = await db.select().from(campaignMedia).where(eq(campaignMedia.id, mediaId));
  if (!m) throw new MediaRuleError("Mídia não encontrada.", 404);
  if (!ehVideo(m.role) || m.status !== "ready") throw new MediaRuleError("Só vídeo pronto pode ser cortado.", 409);
  const t = trechoDoCorte(inicioBruto, fimBruto, m.durationS);
  if ("erro" in t) throw new MediaRuleError(t.erro, 422);

  const store = storage();
  let tamanho = m.bytes;
  if (store instanceof LocalDiskStorage) tamanho = await store.size(m.storageKey).catch(() => null); // traz da cópia se o disco perdeu
  if (tamanho == null) throw new MediaRuleError("O arquivo deste vídeo não está no armazenamento.", 409);
  if (tamanho > CORTE_ATE_BYTES) {
    throw new MediaRuleError(`Este vídeo passa de ${CORTE_ATE_BYTES / 1024 / 1024} MB: corte no aparelho e envie de novo.`, 409);
  }

  const cortar = (arquivo: string) => new FfmpegLocal().cortar(arquivo, t.inicio, t.fim, m.mime);
  const cortado =
    store instanceof LocalDiskStorage
      ? await cortar(store.caminho(m.storageKey))
      : await comVagaDeDownload(() =>
          comArquivoTemporarioEmPedacos(tamanho!, store.reader(m.storageKey), m.storageKey.slice(m.storageKey.lastIndexOf(".")), cortar),
        );
  if (!cortado) throw new MediaRuleError("Não consegui cortar este vídeo agora. Tente mais tarde.", 409);

  // Medido de novo, como no envio: a régua do papel vale para o arquivo que fica.
  let durationS: number;
  let width: number | null;
  let height: number | null;
  try {
    const ler = bufferReader(cortado);
    const segundos = await probeVideoDuration(ler, cortado.length);
    const dim = await probeVideoDimensions(ler, cortado.length);
    if (m.role === "reels" && (formatoDoVideo(segundos) !== "reels" || !dim || !videoEmPe({ largura: dim.width, altura: dim.height }))) {
      throw new MediaRuleError("O vídeo cortado saiu fora da régua do Reels (em pé, até 3 min).");
    }
    if (m.role === "video" && (segundos > MAX_VIDEO_SECONDS || !formatoDoVideo(segundos))) {
      throw new MediaRuleError("O vídeo cortado saiu fora do limite de duração.");
    }
    durationS = Math.max(1, Math.round(segundos));
    width = dim?.width ?? null;
    height = dim?.height ?? null;
  } catch (e) {
    if (e instanceof MediaRuleError) throw e;
    throw new MediaRuleError("Não consegui medir o vídeo cortado. Tente outro trecho.", 409);
  }

  const chave = mediaKey(m.campaignId, m.role, m.mime);
  await store.write(chave, cortado, m.mime);
  let antes: { storageKey: string; posterKey: string | null; streamUid: string | null } | null = null;
  let linha: MediaRow | undefined;
  try {
    linha = await db.transaction(async (tx) => {
      const [atual] = await tx
        .select({ storageKey: campaignMedia.storageKey, posterKey: campaignMedia.posterKey, streamUid: campaignMedia.streamUid })
        .from(campaignMedia)
        .where(eq(campaignMedia.id, mediaId))
        .for("update");
      if (!atual) throw new MediaRuleError("Mídia não encontrada.", 404);
      if (atual.storageKey !== m.storageKey) throw new MediaRuleError("O vídeo mudou enquanto o corte saía. Abra de novo.", 409);
      antes = atual;
      const [nova] = await tx
        .update(campaignMedia)
        .set({ storageKey: chave, durationS, width, height, bytes: cortado.length, posterKey: null, streamUid: null, streamHls: null, streamAssinado: false })
        .where(eq(campaignMedia.id, mediaId))
        .returning();
      return nova;
    });
  } catch (e) {
    await store.remove(chave).catch(() => {});
    throw e;
  }
  const velho = antes as { storageKey: string; posterKey: string | null; streamUid: string | null } | null;
  if (velho) {
    await store.remove(velho.storageKey).catch(() => {});
    if (velho.posterKey) await store.remove(velho.posterKey).catch(() => {});
    await apagarNoStream(velho.streamUid);
  }
  emSegundoPlano(gerarPosterDaMidia(mediaId, m.campaignId, chave, cortado.length), "pôster do vídeo cortado");
  return { media: withUrls(linha!), inicio: t.inicio, fim: t.fim, duracaoAntes: m.durationS, duracaoDepois: durationS };
}

/** Com a mídia sem pôster, quanto esperar o primeiro (o do envio) antes de deixar escolher. */
export const FOLGA_PARA_ESCOLHER_CAPA_MS = 60 * 60 * 1000;

async function descartar(posterKey: string | null, streamUid: string | null | undefined) {
  if (posterKey) await storage().remove(posterKey).catch(() => {});
  await apagarNoStream(streamUid);
}

/** Apaga do armazenamento (e da cópia) o original, o pôster e as variantes de uma mídia. Nunca lança. */
export async function apagarArquivosDeMidias(
  linhas: { storageKey: string; posterKey: string | null; streamUid?: string | null; variants: MediaRow["variants"] }[],
) {
  try {
    const store = storage();
    await Promise.all(
      linhas.map(async (m) => {
        await store.remove(m.storageKey).catch(() => {});
        if (m.posterKey) await store.remove(m.posterKey).catch(() => {});
        await apagarNoStream(m.streamUid);
        await removeVariants(m.variants);
      }),
    );
  } catch (e) {
    // A linha já foi embora: falha de armazenamento vai ao log, não vira erro para quem apagou.
    console.error("[midia] não apaguei os arquivos:", (e as Error).message);
  }
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
  // O vídeo guardado no Stream cobra por minuto: sai junto.
  await apagarNoStream(removed.streamUid);
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
export function withUrls(linha: MediaRow) {
  const store = storage();
  const url = (key: string) => store.publicUrl(key);
  // O `uid` do Stream é só do servidor (apagar); a tela recebe o endereço do HLS.
  const { streamUid: uid, streamAssinado: assinado, ...m } = linha;
  return {
    ...m,
    url: url(m.storageKey),
    // Só vídeo tem pôster; sem ele (sem ffmpeg, falha), `null`.
    posterUrl: posterPublico(m.posterKey ? url(m.posterKey) : null),
    // O HLS do Stream (já conferido ao gravar); sem entrega, `null` e a tela toca o original.
    // Assinado: o token (que vence) no lugar do `uid`; sem a chave, `null`.
    hls:
      ehVideo(m.role)
        ? hlsParaATela({ hls: m.streamHls ?? null, uid: uid ?? null, assinado, token: assinado ? tokenDoStream(uid) : null })
        : null,
    srcSetAvif: srcSet(m.variants, "avif", url),
    srcSetWebp: srcSet(m.variants, "webp", url),
  };
}

