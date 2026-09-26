/**
 * ID do cliente (C-XXXXXXXX): sorteado, nunca sequencial, sem caractere
 * ambíguo. É por ele que o painel do organizador identifica quem é cliente
 * da plataforma — sem nome nem telefone — e é ele que sai no bilhete.
 */
import { randomInt } from "node:crypto";
import { and, eq, isNull, sql } from "drizzle-orm";
import { db } from "../db";
import { buyers } from "@shared/schema";
import { gerarCodigoCliente } from "@shared/chamados";
import { isUniqueViolation } from "../pgError";

const sortear = (max: number) => randomInt(0, max);

/**
 * Dá ao comprador o ID de cliente, se ainda não tem. O `UPDATE … WHERE codigo
 * IS NULL` não sobrescreve quem já tem; colisão de sorteio é resolvida pelo
 * índice único, tentando outro código.
 */
export async function garantirCodigoCliente(buyerId: string): Promise<string | null> {
  for (let tentativa = 0; tentativa < 5; tentativa++) {
    try {
      const [novo] = await db
        .update(buyers)
        .set({ codigo: gerarCodigoCliente(sortear) })
        .where(and(eq(buyers.id, buyerId), isNull(buyers.codigo)))
        .returning({ codigo: buyers.codigo });
      if (novo?.codigo) return novo.codigo;
      const [atual] = await db
        .select({ codigo: buyers.codigo })
        .from(buyers)
        .where(eq(buyers.id, buyerId));
      return atual?.codigo ?? null;
    } catch (err) {
      if (!isUniqueViolation(err, "uq_buyers_codigo")) throw err;
    }
  }
  throw new Error("Não foi possível gerar o ID do cliente.");
}

/**
 * Preenche o ID de quem comprou antes de o ID existir. Roda no relógio, em
 * lotes: o painel do organizador mostra cliente da plataforma só pelo ID, e
 * "Cliente sem ID" não identifica ninguém.
 */
export async function preencherCodigosDeCliente(lote = 500): Promise<number> {
  const semCodigo = await db
    .select({ id: buyers.id })
    .from(buyers)
    .where(isNull(buyers.codigo))
    .orderBy(sql`${buyers.createdAt}`)
    .limit(lote);
  for (const b of semCodigo) await garantirCodigoCliente(b.id);
  return semCodigo.length;
}
