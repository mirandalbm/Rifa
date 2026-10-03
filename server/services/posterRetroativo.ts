/**
 * Pôster dos vídeos enviados antes de o pôster existir (ou cujo pôster falhou
 * no envio). O relógio passa por eles devagar e chama o mesmo
 * `gerarPosterDaMidia()` do envio — mesma régua, mesmo `UPDATE` condicional
 * (só grava se a mídia ainda existe e segue sem pôster nem `uid`) —, mas
 * **só o pôster** (`soPoster`): o vídeo nunca fica guardado no Stream por
 * aqui. Rifa encerrada, rascunho abandonado ou promotora arquivada teriam o
 * vídeo cobrado por minuto sem ninguém assistir (o token do HLS só sai para
 * rifa no ar), e nada o apagaria de lá.
 *
 * - **Anda por chave** (`created_at`, `id`), nunca pela primeira página: o
 *   vídeo que não dá pôster (sem `ffmpeg`, arquivo que ele não abre) não
 *   segura a fila. A volta **não recomeça** no mesmo processo — cada vídeo é
 *   tentado no máximo uma vez por processo e por réplica (o cursor é da
 *   memória; a trava só impede duas ao mesmo tempo), e de novo a cada deploy.
 * - **Só vídeo com mais de `FOLGA_DO_ENVIO_MIN`**: o envio recente ainda pode
 *   estar gerando o pôster (e, com a entrega ligada, o vídeo no Stream) em
 *   segundo plano; o relógio gravaria o pôster primeiro e o envio perderia o
 *   HLS.
 * - **Poucos por volta, um de cada vez**: o `ffmpeg` já tem teto próprio, e o
 *   relógio não deve tomar a vez do envio de quem está publicando agora.
 * - Tamanho desconhecido no bucket não é baixado (o teto do envio vale).
 */
import { sql } from "drizzle-orm";
import { db } from "../db";
import { gerarPosterDaMidia } from "./media";
import { storage } from "./storage";

export const FOLGA_DO_ENVIO_MIN = 60;
const POR_VOLTA = 4;

let cursor: { em: string; id: string } | null = null;

/** Só para a prova: volta ao começo, ou começa logo depois de `desde`. */
export function recomecarPosterRetroativo(desde: { em: string; id: string } | null = null) {
  cursor = desde;
}

export async function posterDosVideosAntigos(): Promise<{ gerados: number; semPoster: number }> {
  const r = { gerados: 0, semPoster: 0 };
  const c = cursor;
  const linhas = (
    await db.execute(sql`
      SELECT id, campaign_id AS "campaignId", storage_key AS "storageKey", bytes, created_at::text AS em
        FROM campaign_media
       WHERE role = 'video' AND status = 'ready'
         AND poster_key IS NULL AND stream_uid IS NULL
         AND created_at < now() - make_interval(mins => ${FOLGA_DO_ENVIO_MIN})
         ${c ? sql`AND (created_at, id) > (${c.em}::timestamp, ${c.id})` : sql``}
       ORDER BY created_at, id
       LIMIT ${POR_VOLTA}
    `)
  ).rows as { id: string; campaignId: string; storageKey: string; bytes: string | number | null; em: string }[];
  if (linhas.length) cursor = { em: linhas[linhas.length - 1].em, id: linhas[linhas.length - 1].id };
  for (const l of linhas) {
    try {
      // Sem tamanho guardado, o bucket não baixa (o teto do envio decide pelo tamanho).
      const bytes = l.bytes === null ? Number.POSITIVE_INFINITY : Number(l.bytes);
      const chave = await gerarPosterDaMidia(l.id, l.campaignId, l.storageKey, bytes, { soPoster: true });
      if (chave) r.gerados++;
      else {
        r.semPoster++;
        await recolherSeAMidiaSaiu(l.id, l.storageKey);
      }
    } catch (e) {
      r.semPoster++;
      console.warn(`[midia] pôster retroativo de ${l.id}: ${(e as Error).message}`);
    }
  }
  return r;
}

/**
 * A mídia pode ser apagada enquanto o relógio a processava; ler o arquivo do
 * disco traz da cópia o que faltava (`comCopia`), e o original voltaria sem
 * dono. Se a linha já não existe, o arquivo sai de novo. Nunca lança.
 */
async function recolherSeAMidiaSaiu(id: string, storageKey: string) {
  try {
    const { rows } = await db.execute(sql`SELECT 1 FROM campaign_media WHERE id = ${id}`);
    if (rows.length === 0) await storage().remove(storageKey);
  } catch (e) {
    console.warn(`[midia] pôster retroativo: não recolhi o original de ${id}: ${(e as Error).message}`);
  }
}
