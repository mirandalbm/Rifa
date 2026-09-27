/**
 * A central de avisos do apostador — o coração no topo do site, como no
 * Instagram. Quem escreve aqui é `avisar()` (push.ts): todo aviso que sai
 * por push também fica guardado, mesmo para quem não ligou o push no
 * aparelho. Só o próprio comprador lê (a sessão decide de quem é).
 */
import { and, desc, eq, isNull, lt, sql } from "drizzle-orm";
import { db } from "../db";
import { notificacoes } from "@shared/schema";
import type { MensagemPush, TipoAviso } from "@shared/push";

/** Quantas a central mostra, e por quanto tempo guarda. */
export const NOTIFICACOES_NA_LISTA = 60;
export const NOTIFICACOES_DIAS = 90;

/** Guarda o aviso para cada pessoa; a chave única impede repetir. */
export async function registrarNotificacoes(
  buyerIds: string[],
  tipo: TipoAviso,
  chave: string,
  msg: MensagemPush,
) {
  for (let i = 0; i < buyerIds.length; i += 500) {
    const lote = buyerIds.slice(i, i + 500);
    await db
      .insert(notificacoes)
      .values(
        lote.map((buyerId) => ({
          buyerId,
          tipo,
          chave: `${tipo}:${chave}`,
          titulo: msg.title,
          corpo: msg.body,
          url: msg.url,
        })),
      )
      .onConflictDoNothing();
  }
}

export async function notificacoesDe(buyerId: string) {
  const lista = await db
    .select({
      id: notificacoes.id,
      tipo: notificacoes.tipo,
      titulo: notificacoes.titulo,
      corpo: notificacoes.corpo,
      url: notificacoes.url,
      lida: sql<boolean>`${notificacoes.lidaEm} is not null`,
      createdAt: notificacoes.createdAt,
    })
    .from(notificacoes)
    .where(eq(notificacoes.buyerId, buyerId))
    .orderBy(desc(notificacoes.createdAt))
    .limit(NOTIFICACOES_NA_LISTA);
  return { naoLidas: await naoLidas(buyerId), lista };
}

/** O número no coração. Contagem pequena, pelo índice da pessoa. */
export async function naoLidas(buyerId: string) {
  const r = await db.execute(sql`
    SELECT count(*)::int AS n FROM (
      SELECT 1 FROM notificacoes WHERE buyer_id = ${buyerId}::uuid AND lida_em IS NULL LIMIT 100
    ) x
  `);
  return (r.rows[0] as { n: number }).n;
}

/** Abrir a central marca tudo como lido. */
export async function marcarTodasLidas(buyerId: string) {
  await db
    .update(notificacoes)
    .set({ lidaEm: new Date() })
    .where(and(eq(notificacoes.buyerId, buyerId), isNull(notificacoes.lidaEm)));
}

/** Relógio: o que passou do prazo sai. */
export async function apagarNotificacoesAntigas(agora = new Date()) {
  const r = await db
    .delete(notificacoes)
    .where(lt(notificacoes.createdAt, new Date(agora.getTime() - NOTIFICACOES_DIAS * 86_400_000)))
    .returning({ id: notificacoes.id });
  return r.length;
}
