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
