/**
 * O lado do site do reels gerado (Fase F, regras em `shared/reelsGerado.ts`):
 *
 * - **pedir** (`pedirReelsGerado`): confere a rifa e a vaga no Reels, prepara
 *   as fotos (cortadas no 9:16 pelo `sharp`, no assunto) e a faixa de texto, e
 *   põe tudo na fila numa transação. Um em aberto por rifa (a chave da fila).
 * - **situação** (`situacaoDoReelsGerado`): o último pedido da rifa e se o
 *   trabalhador está no ar.
 * - **receber** (`receberReelsGerados`, no relógio): pega o MP4 pronto, grava
 *   no armazenamento e passa pelo **mesmo** `ingestUpload` do envio da
 *   organização — medido de novo (em pé, até 3 min), contado na vaga do Reels
 *   sob a trava da rifa, com o pôster e o HLS de sempre. Depois põe as
 *   figurinhas da contagem e do Comprar (dados, nunca gravados no vídeo).
 *
 * O processo web nunca recomprime vídeo: o `ffmpeg` roda no trabalhador.
 */
import { and, desc, eq, inArray } from "drizzle-orm";
import sharp from "sharp";
import { campaignMedia, trabalhos } from "@shared/schema";
import { REELS_POR_RIFA } from "@shared/reels";
import { limparLegenda, problemaNaLegenda } from "@shared/publicacao";
import { validarFigurinhas } from "@shared/figurinhasStory";
import {
  FIGURINHAS_DO_REELS_GERADO,
  QUADRO_DO_REELS_GERADO,
  REELS_GERADO_FOTOS_MAX,
  TIPO_REELS_GERADO,
  problemaParaGerarReels,
  textosDoReelsGerado,
} from "@shared/reelsGerado";
import type { SituacaoDoTrabalho } from "@shared/fila";
import { db } from "../db";
import { faixaDoReelsGerado } from "./arteDesenho";
import { rifaDaArte } from "./artes";
import { arquivosDoTrabalho, concluirTrabalho, enfileirar, haTrabalhadorNoAr, naoRecebido, tomarPronto, type ArquivoDoTrabalho } from "./fila";
import { MediaRuleError, ingestUpload } from "./media";
import { mediaKey, storage } from "./storage";

export class ReelsGeradoError extends Error {
  constructor(
    message: string,
    public status = 409,
  ) {
    super(message);
  }
}

/** A chave da fila: um pedido em aberto por rifa. */
export const chaveDoReelsGerado = (campaignId: string) => `${TIPO_REELS_GERADO}:${campaignId}`;

async function lerFoto(key: string): Promise<Buffer | null> {
  try {
    if (key.startsWith("data:")) {
      const m = /^data:[^;,]+;base64,(.*)$/s.exec(key);
      return m ? Buffer.from(m[1], "base64") : null;
    }
    return await storage().readAll(key);
  } catch {
    return null;
  }
}

/** A foto no 9:16 do vídeo, cortada no assunto, sem metadados. `null` se o `sharp` não abre. */
async function fotoNoQuadro(bytes: Buffer): Promise<Buffer | null> {
  try {
    return await sharp(bytes, { limitInputPixels: 40_000_000 })
      .rotate()
      .resize(QUADRO_DO_REELS_GERADO.largura, QUADRO_DO_REELS_GERADO.altura, { fit: "cover", position: "attention" })
      .removeAlpha()
      .jpeg({ quality: 85, mozjpeg: true })
      .toBuffer();
  } catch {
    return null;
  }
}

/** As fotos da rifa que entram: o banner, depois as do carrossel, até `REELS_GERADO_FOTOS_MAX`. */
async function fotosDaRifa(campaignId: string): Promise<ArquivoDoTrabalho[]> {
  const midias = await db
    .select({ role: campaignMedia.role, mime: campaignMedia.mime, key: campaignMedia.storageKey, position: campaignMedia.position })
    .from(campaignMedia)
    .where(and(eq(campaignMedia.campaignId, campaignId), eq(campaignMedia.status, "ready"), inArray(campaignMedia.role, ["banner", "photo"])));
  midias.sort((a, b) => Number(b.role === "banner") - Number(a.role === "banner") || a.position - b.position);
  const fotos: ArquivoDoTrabalho[] = [];
  for (const m of midias) {
    if (fotos.length >= REELS_GERADO_FOTOS_MAX) break;
    if (!m.mime.startsWith("image/")) continue;
    const bytes = await lerFoto(m.key);
    const jpeg = bytes ? await fotoNoQuadro(bytes) : null;
    if (jpeg) fotos.push({ nome: `foto-${fotos.length}.jpg`, bytes: jpeg });
  }
  return fotos;
}

/** Quantos vídeos a rifa já tem no Reels. */
async function reelsDaRifa(campaignId: string): Promise<number> {
  const linhas = await db
    .select({ id: campaignMedia.id })
    .from(campaignMedia)
    .where(and(eq(campaignMedia.campaignId, campaignId), eq(campaignMedia.role, "reels")));
  return linhas.length;
}

/**
 * Põe o pedido na fila. O recorte (`assertCampaignInScope`) e o limite por
 * pessoa são da rota, antes. Devolve o id do trabalho e a legenda limpa.
 */
export async function pedirReelsGerado(p: { campaignId: string; pedidoPor: string; legenda: unknown }): Promise<{ id: string; legenda: string | null }> {
  const problemaDaLegenda = problemaNaLegenda(p.legenda);
  if (problemaDaLegenda) throw new ReelsGeradoError(problemaDaLegenda, 422);
  const legenda = limparLegenda(typeof p.legenda === "string" ? p.legenda : "") || null;

  const rifa = await rifaDaArte(p.campaignId);
  if (!rifa) throw new ReelsGeradoError("Rifa não encontrada.", 404);
  const problema = problemaParaGerarReels({
    status: rifa.dados.status,
    demonstracao: rifa.dados.demonstracao,
    travada: rifa.dados.travada,
    sorteada: rifa.dados.resultado !== null,
  });
  if (problema) throw new ReelsGeradoError(problema);
  if ((await reelsDaRifa(p.campaignId)) >= REELS_POR_RIFA) {
    throw new ReelsGeradoError(`Esta rifa já tem ${REELS_POR_RIFA} vídeos no Reels. Apague um para gerar outro.`);
  }

  const fotos = await fotosDaRifa(p.campaignId);
  if (!fotos.length) throw new ReelsGeradoError("A rifa precisa de pelo menos uma foto (o banner ou uma do carrossel) para gerar o vídeo.");
  const faixa = await sharp(Buffer.from(faixaDoReelsGerado(textosDoReelsGerado(rifa.dados), rifa.destaque))).png().toBuffer();

  const id = await db.transaction((tx) =>
    enfileirar(tx, {
      tipo: TIPO_REELS_GERADO,
      chave: chaveDoReelsGerado(p.campaignId),
      dados: { legenda, fotos: fotos.length },
      campaignId: p.campaignId,
      pedidoPor: p.pedidoPor,
      entradas: [...fotos, { nome: "faixa.png", bytes: faixa }],
    }),
  );
  if (!id) throw new ReelsGeradoError("Já há um vídeo sendo gerado para esta rifa. Espere ele ficar pronto.");
  return { id, legenda };
}

export interface SituacaoDoReelsGerado {
  /** O último pedido da rifa, ou `null`. */
  ultimo: {
    id: string;
    situacao: SituacaoDoTrabalho;
    erro: string | null;
    fotos: number | null;
    criadoEm: Date;
    terminadoEm: Date | null;
    mediaId: string | null;
  } | null;
  /** Há um trabalhador no ar que sabe gerar o vídeo? Sem ele, o pedido espera na fila. */
  geradorNoAr: boolean;
}

export async function situacaoDoReelsGerado(campaignId: string): Promise<SituacaoDoReelsGerado> {
  const [t] = await db
    .select({
      id: trabalhos.id,
      situacao: trabalhos.situacao,
      erro: trabalhos.erro,
      dados: trabalhos.dados,
      resultado: trabalhos.resultado,
      criadoEm: trabalhos.criadoEm,
      terminadoEm: trabalhos.terminadoEm,
    })
    .from(trabalhos)
    .where(and(eq(trabalhos.campaignId, campaignId), eq(trabalhos.tipo, TIPO_REELS_GERADO)))
    .orderBy(desc(trabalhos.criadoEm))
    .limit(1);
  const dados = (t?.dados ?? {}) as { fotos?: unknown };
  const resultado = (t?.resultado ?? {}) as { mediaId?: unknown };
  return {
    ultimo: t
      ? {
          id: t.id,
          situacao: t.situacao as SituacaoDoTrabalho,
          // O erro passageiro de uma tentativa que vai se repetir não assusta ninguém.
          erro: t.situacao === "falhou" ? t.erro : null,
          fotos: typeof dados.fotos === "number" ? dados.fotos : null,
          criadoEm: t.criadoEm,
          terminadoEm: t.situacao === "concluido" || t.situacao === "falhou" ? t.terminadoEm : null,
          mediaId: typeof resultado.mediaId === "string" ? resultado.mediaId : null,
        }
      : null,
    geradorNoAr: await haTrabalhadorNoAr(TIPO_REELS_GERADO),
  };
}

/**
 * O relógio do site recebe os vídeos prontos (até `max` por volta). Cada um
 * passa pela ingestão de sempre; a recusa da régua (vídeo deitado, Reels
 * cheio) marca o pedido como falho, com o motivo para a tela.
 */
export async function receberReelsGerados(max = 3): Promise<number> {
  let recebidos = 0;
  for (let i = 0; i < max; i++) {
    const t = await tomarPronto(TIPO_REELS_GERADO);
    if (!t) break;
    let key: string | null = null;
    try {
      if (!t.campaignId) throw new MediaRuleError("O pedido perdeu a rifa.");
      const [mp4] = (await arquivosDoTrabalho(t.id, "saida")).filter((a) => a.nome === "reels.mp4");
      if (!mp4) throw new MediaRuleError("O vídeo não chegou do gerador.");
      key = mediaKey(t.campaignId, "reels", "video/mp4");
      await storage().write(key, mp4.bytes, "video/mp4");
      const legenda = typeof t.dados.legenda === "string" ? t.dados.legenda : "";
      const midia = await ingestUpload({ campaignId: t.campaignId, role: "reels", storageKey: key, legenda, mime: "video/mp4" });
      key = null;
      const figurinhas = validarFigurinhas(FIGURINHAS_DO_REELS_GERADO.map((f) => ({ ...f })), { temRifa: true });
      await db.update(campaignMedia).set({ figurinhas }).where(and(eq(campaignMedia.id, midia.id), eq(campaignMedia.role, "reels")));
      await concluirTrabalho(t.id, { mediaId: midia.id });
      recebidos++;
    } catch (e) {
      // A recusa da régua já apagou o arquivo; qualquer outro erro, apagamos aqui.
      if (key) await storage().remove(key).catch(() => {});
      if (!(e instanceof MediaRuleError)) console.error("[reels gerado] recebimento:", e);
      await naoRecebido(t.id, e instanceof MediaRuleError ? e.message : "Não foi possível guardar o vídeo. Peça de novo.");
    }
  }
  return recebidos;
}
