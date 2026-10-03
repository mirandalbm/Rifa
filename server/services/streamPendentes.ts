/**
 * Nenhum vídeo fica esquecido no Cloudflare Stream (cobra por minuto
 * guardado). Todo vídeo enviado é anotado em `stream_pendentes` antes de
 * qualquer espera, e sai da lista quando o Stream confirma o DELETE ou quando
 * a mídia guarda o `uid` dele. O relógio (`limparStreamPendente`, trava
 * 811014) pega o que passou de `STREAM_PENDENTE_MIN` sem dono — processo que
 * caiu no meio, DELETE que falhou — e apaga no Stream.
 */
import { sql } from "drizzle-orm";
import { db } from "../db";
import { streamPendentes } from "@shared/schema";
import { uidValido } from "@shared/stream";
import { apagarDoStream, ligarGanchosDoStream, streamConfigurado } from "./videoProcessor";
import { chaveDoStream } from "./streamAssinatura";

/** Folga para o envio em andamento (a entrega espera até 10 min o Stream). */
export const STREAM_PENDENTE_MIN = 30;
const POR_RODADA = 50;

export async function anotarNoStream(uid: string) {
  if (!uidValido(uid)) return;
  await db.insert(streamPendentes).values({ uid }).onConflictDoNothing();
}

export async function esquecerDoStream(uid: string) {
  await db.delete(streamPendentes).where(sql`${streamPendentes.uid} = ${uid}`);
}

ligarGanchosDoStream({ enviado: anotarNoStream, apagado: esquecerDoStream });

/**
 * Apaga no Stream o vídeo de uma mídia que saiu. Anota antes: se o DELETE
 * falhar, o relógio tenta de novo. Nunca lança.
 */
export async function apagarNoStream(uid: string | null | undefined) {
  if (!uid) return;
  await anotarNoStream(uid).catch((e) => console.warn(`[video] Stream: não anotei ${uid}: ${(e as Error).message}`));
  await apagarDoStream(uid);
}

/** O relógio: o que tem dono sai da lista; o que não tem é apagado no Stream. */
export async function limparStreamPendente(): Promise<{ donos: number; apagados: number; falhas: number }> {
  const r = { donos: 0, apagados: 0, falhas: 0 };
  const linhas = (
    await db.execute(sql`
      SELECT p.uid, EXISTS (SELECT 1 FROM campaign_media m WHERE m.stream_uid = p.uid) AS "temDono"
        FROM stream_pendentes p
       WHERE p.criado_em < (now() AT TIME ZONE 'UTC') - make_interval(mins => ${STREAM_PENDENTE_MIN})
       ORDER BY p.criado_em
       LIMIT ${POR_RODADA}
    `)
  ).rows as { uid: string; temDono: boolean }[];
  if (!linhas.length) return r;
  const comCredencial = Boolean(streamConfigurado());
  for (const l of linhas) {
    if (l.temDono) {
      await esquecerDoStream(l.uid);
      r.donos++;
    } else if (comCredencial && (await apagarDoStream(l.uid))) {
      r.apagados++;
    } else {
      r.falhas++;
      await db.execute(sql`UPDATE stream_pendentes SET tentativas = tentativas + 1 WHERE uid = ${l.uid}`);
    }
  }
  return r;
}

const ASSINAR_POR_RODADA = 20;

/**
 * Onde a volta parou (`created_at` como texto e id). Anda por chave, não pela
 * primeira página: o vídeo que o Stream não marca (sumiu de lá, `uid` fora do
 * formato) não segura a fila — fica para a próxima volta, depois de todos.
 */
let cursorDaAssinatura: { em: string; id: string } | null = null;

/** Só para a prova: recomeça a volta do começo. */
export function recomecarAssinatura() {
  cursorDaAssinatura = null;
}

/**
 * Os vídeos guardados antes de a URL assinada ser ligada continuam abertos no
 * Stream. Com a chave no ambiente, o relógio marca cada um `requireSignedURLs`
 * e só então a mídia passa a dar o endereço com token (`stream_assinado` no
 * mesmo `UPDATE`, condicional ao `uid` lido: a mídia trocada no meio não leva
 * a marca). Sem chave ou sem credencial, não faz nada. Nunca lança por vídeo.
 */
export async function assinarVideosDoStream(): Promise<{ assinados: number; falhas: number }> {
  const r = { assinados: 0, falhas: 0 };
  const s = streamConfigurado();
  if (!s || !chaveDoStream()) return r;
  const c = cursorDaAssinatura;
  const linhas = (
    await db.execute(sql`
      SELECT id, stream_uid AS uid, created_at::text AS em FROM campaign_media
       WHERE stream_uid IS NOT NULL AND NOT stream_assinado
         ${c ? sql`AND (created_at, id) > (${c.em}::timestamp, ${c.id})` : sql``}
       ORDER BY created_at, id
       LIMIT ${ASSINAR_POR_RODADA}
    `)
  ).rows as { id: string; uid: string; em: string }[];
  // Chegou ao fim: a próxima volta recomeça (e tenta de novo o que falhou).
  cursorDaAssinatura = linhas.length < ASSINAR_POR_RODADA ? null : { em: linhas[linhas.length - 1].em, id: linhas[linhas.length - 1].id };
  for (const l of linhas) {
    if (await s.exigirAssinatura(l.uid)) {
      const u = await db.execute(sql`UPDATE campaign_media SET stream_assinado = true WHERE id = ${l.id} AND stream_uid = ${l.uid}`);
      if (u.rowCount) r.assinados++;
    } else r.falhas++;
  }
  return r;
}
