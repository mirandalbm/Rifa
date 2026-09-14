import { and, eq, sql } from "drizzle-orm";
import { db } from "../db";
import { commissions } from "@shared/schema";
import { releaseExpired } from "../services/quotas";
import { log } from "../vite";

/**
 * Dois relógios. A expiração de reserva é o que devolve número ao estoque —
 * sem ela, cota reservada e não paga some da rifa.
 */
export function startJobs() {
  const expiryMs = 60_000;
  const releaseMs = 15 * 60_000;

  setInterval(async () => {
    try {
      const released = await releaseExpired();
      if (released > 0) log(`${released} cota(s) voltaram ao estoque`, "jobs");
    } catch (err) {
      console.error("[jobs] expiração de reservas:", err);
    }
  }, expiryMs).unref();

  setInterval(async () => {
    try {
      const rows = await db
        .update(commissions)
        .set({ status: "available" })
        .where(
          and(eq(commissions.status, "pending"), sql`${commissions.availableAt} <= now()`),
        )
        .returning({ id: commissions.id });
      if (rows.length > 0) log(`${rows.length} comissão(ões) liberadas`, "jobs");
    } catch (err) {
      console.error("[jobs] liberação de comissões:", err);
    }
  }, releaseMs).unref();
}
