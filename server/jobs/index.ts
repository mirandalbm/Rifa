import { and, eq, sql } from "drizzle-orm";
import { db } from "../db";
import { commissions } from "@shared/schema";
import { releaseExpired } from "../services/quotas";
import { log } from "../vite";
import { pool } from "../db";

/**
 * Trava de aplicação no Postgres: com duas réplicas, os dois processos
 * acordam no mesmo minuto e o mesmo job roda duas vezes. A trava é do banco,
 * então não importa quantos processos existam — só um passa.
 */
async function withLock(key: number, fn: () => Promise<void>) {
  const client = await pool.connect();
  try {
    const { rows } = await client.query("SELECT pg_try_advisory_lock($1) AS locked", [key]);
    if (!rows[0]?.locked) return;
    try {
      await fn();
    } finally {
      await client.query("SELECT pg_advisory_unlock($1)", [key]);
    }
  } finally {
    client.release();
  }
}

const LOCK_EXPIRACAO = 811_001;
const LOCK_COMISSAO = 811_002;

/**
 * Dois relógios. A expiração de reserva é o que devolve número ao estoque —
 * sem ela, cota reservada e não paga some da rifa.
 */
export function startJobs() {
  const expiryMs = 60_000;
  const releaseMs = 15 * 60_000;

  setInterval(async () => {
    try {
      await withLock(LOCK_EXPIRACAO, async () => {
        const released = await releaseExpired();
        if (released > 0) log(`${released} cota(s) voltaram ao estoque`, "jobs");
      });
    } catch (err) {
      console.error("[jobs] expiração de reservas:", err);
    }
  }, expiryMs).unref();

  setInterval(async () => {
    try {
      await withLock(LOCK_COMISSAO, async () => {
        const rows = await db
          .update(commissions)
          .set({ status: "available" })
          .where(
            and(eq(commissions.status, "pending"), sql`${commissions.availableAt} <= now()`),
          )
          .returning({ id: commissions.id });
        if (rows.length > 0) log(`${rows.length} comissão(ões) liberadas`, "jobs");
      });
    } catch (err) {
      console.error("[jobs] liberação de comissões:", err);
    }
  }, releaseMs).unref();
}
