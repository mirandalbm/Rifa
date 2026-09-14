import { and, eq, sql, gt, lt } from "drizzle-orm";
import { db } from "../db";
import { commissions, orders, buyers, campaigns } from "@shared/schema";
import { notify } from "../notifications";
import { publicUrl } from "../services/urls";
import { purgeRateEvents } from "../services/antifraude";
import { lancarMensalidades } from "../services/billing";
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
const LOCK_LEMBRETE = 811_003;
const LOCK_LIMPEZA = 811_004;
const LOCK_MENSALIDADE = 811_005;

/** Quantos minutos antes de a reserva cair o lembrete é enviado. */
const LEMBRETE_MINUTOS = Number(process.env.REMINDER_MINUTES_BEFORE ?? 5);

/**
 * Carrinho abandonado: quem reservou e não pagou recebe um empurrão antes
 * de perder os números. A chave de deduplicação garante um lembrete por
 * pedido, não um por minuto.
 */
async function lembrarReservasVencendo() {
  const now = new Date();
  const limite = new Date(now.getTime() + LEMBRETE_MINUTOS * 60_000);

  const pendentes = await db
    .select({
      order: orders,
      buyer: buyers,
      campaignTitle: campaigns.title,
    })
    .from(orders)
    .innerJoin(buyers, eq(buyers.id, orders.buyerId))
    .innerJoin(campaigns, eq(campaigns.id, orders.campaignId))
    .where(
      and(
        eq(orders.status, "pending"),
        gt(orders.expiresAt, now),
        lt(orders.expiresAt, limite),
      ),
    )
    .limit(200);

  let enviados = 0;
  for (const row of pendentes) {
    const restam = Math.max(
      1,
      Math.round((row.order.expiresAt!.getTime() - now.getTime()) / 60_000),
    );
    const ok = await notify({
      to: row.buyer.phone,
      template: "reserva_expirando",
      params: {
        nome: row.buyer.name.split(" ")[0],
        rifa: row.campaignTitle,
        minutos: String(restam),
        link: publicUrl(`/pedido/${row.order.code}`),
      },
      dedupeKey: `order:${row.order.id}:reserva_expirando`,
    });
    if (ok) enviados++;
  }
  return enviados;
}

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
      await withLock(LOCK_LEMBRETE, async () => {
        const enviados = await lembrarReservasVencendo();
        if (enviados > 0) log(`${enviados} lembrete(s) de reserva enviados`, "jobs");
      });
    } catch (err) {
      console.error("[jobs] lembrete de reserva:", err);
    }
  }, expiryMs).unref();

  setInterval(async () => {
    try {
      await withLock(LOCK_LIMPEZA, async () => {
        const apagados = await purgeRateEvents();
        if (apagados > 0) log(`${apagados} registro(s) de ritmo limpos`, "jobs");
      });
    } catch (err) {
      console.error("[jobs] limpeza do antifraude:", err);
    }
  }, releaseMs).unref();

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

  // Mensalidade: lança a competência do mês anterior para quem está nesse
  // contrato. É idempotente pelo índice (organização, competência), então
  // rodar junto com os outros relógios não cobra duas vezes — e não precisa
  // de um agendador de mês, que seria mais uma peça para dar errado.
  setInterval(async () => {
    try {
      await withLock(LOCK_MENSALIDADE, async () => {
        const lancadas = await lancarMensalidades();
        if (lancadas > 0) log(`${lancadas} mensalidade(s) lançadas`, "jobs");
      });
    } catch (err) {
      console.error("[jobs] mensalidades:", err);
    }
  }, releaseMs).unref();
}
