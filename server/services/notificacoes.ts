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

const PROVADO: ProvaDoTelefone = { telefoneConfirmado: true, comprasVinculadasEm: null };

/** Quantas a central mostra, e por quanto tempo guarda. */
export const NOTIFICACOES_NA_LISTA = 60;
export const NOTIFICACOES_DIAS = 90;

/**
 * Os avisos que nascem de uma COMPRA do telefone ("sorteio chegando", "saiu o
 * resultado"…): dizem em que rifa o telefone joga.
 */
export const AVISOS_DE_COMPRA: TipoAviso[] = ["sorteio_chegando", "sorteio_adiado", "sorteio_marcado", "resultado"];

/** O que a sessão provou sobre as compras feitas fora da conta (a mesma `Titularidade` das compras). */
export interface ProvaDoTelefone {
  telefoneConfirmado: boolean;
  comprasVinculadasEm: Date | null;
}

/**
 * Conta de telefone ainda não provado pode ser de quem se cadastrou com o
 * número de outra pessoa: a compra do dono, feita sem entrar, cai na linha dele
 * (`pedidoVisivel` a esconde). O aviso de compra daquela rifa esconde junto —
 * "Sorteio chegando: <prêmio>" diz que o telefone joga ali. A rifa é achada
 * pelo endereço do aviso (`…/r/<slug>`, montado por `shared/push.ts`); quem
 * comprou DENTRO da conta (ou com o CPF das compras provado) vê tudo, e quem só
 * segue a organização também.
 */
function avisosEscondidos(buyerId: string, p: ProvaDoTelefone) {
  if (p.telefoneConfirmado) return undefined;
  const vinculadas = p.comprasVinculadasEm ?? new Date(0);
  return sql`NOT (
    ${notificacoes.tipo} IN (${sql.join(AVISOS_DE_COMPRA.map((t) => sql`${t}`), sql`, `)})
    AND EXISTS (
      SELECT 1 FROM orders o JOIN campaigns c ON c.id = o.campaign_id
       WHERE o.buyer_id = ${buyerId}::uuid
         AND o.status = 'paid'
         AND c.slug = split_part(${notificacoes.url}, '/r/', 2)
         AND NOT (o.via_conta OR o.created_at <= ${vinculadas.toISOString()}::timestamp)
    )
  )`;
}

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

export async function notificacoesDe(buyerId: string, prova: ProvaDoTelefone = PROVADO) {
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
    .where(and(eq(notificacoes.buyerId, buyerId), avisosEscondidos(buyerId, prova)))
    .orderBy(desc(notificacoes.createdAt))
    .limit(NOTIFICACOES_NA_LISTA);
  return { naoLidas: await naoLidas(buyerId, prova), lista };
}

/** O número no coração. Contagem pequena, pelo índice da pessoa. */
export async function naoLidas(buyerId: string, prova: ProvaDoTelefone = PROVADO) {
  const escondidos = avisosEscondidos(buyerId, prova);
  const r = await db.execute(sql`
    SELECT count(*)::int AS n FROM (
      SELECT 1 FROM notificacoes WHERE buyer_id = ${buyerId}::uuid AND lida_em IS NULL
        ${escondidos ? sql`AND ${escondidos}` : sql``}
      LIMIT 100
    ) x
  `);
  return (r.rows[0] as { n: number }).n;
}

/** Abrir a central marca tudo como lido. */
export async function marcarTodasLidas(buyerId: string, prova: ProvaDoTelefone = PROVADO) {
  await db
    .update(notificacoes)
    .set({ lidaEm: new Date() })
    .where(and(eq(notificacoes.buyerId, buyerId), isNull(notificacoes.lidaEm), avisosEscondidos(buyerId, prova)));
}

/** Relógio: o que passou do prazo sai. */
export async function apagarNotificacoesAntigas(agora = new Date()) {
  const r = await db
    .delete(notificacoes)
    .where(lt(notificacoes.createdAt, new Date(agora.getTime() - NOTIFICACOES_DIAS * 86_400_000)))
    .returning({ id: notificacoes.id });
  return r.length;
}
