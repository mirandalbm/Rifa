/**
 * Os bilhetes da conta como publicações privadas (`shared/bilhetes.ts`).
 *
 * Só quem tem conta, só o que é dela e só pedido pago: a regra de "é dela"
 * é `pedidoVisivel()` — aqui em SQL, a mesma de `ordersByPhone()`. A página
 * anda por chave (`shared/paginacao.ts`), sem `OFFSET` e sem `COUNT(*)`: o
 * total de números do bilhete é `orders.quantity`, gravado na compra.
 *
 * Nunca sai telefone, CPF, nome, código de cliente nem número premiado ainda
 * em jogo: a cota premiada só aparece quando este pedido a reclamou (a
 * revelação, `claimed_by_order_id`), e aí o número já é de quem comprou.
 */
import { and, desc, eq, inArray, lt, lte, or, sql } from "drizzle-orm";
import type { SQL } from "drizzle-orm";
import { db } from "../db";
import { buyers, campaigns, orders, organizacaoFotos, organizations, prizedQuotas } from "@shared/schema";
import type { Titularidade } from "@shared/contaComprador";
import { BILHETES_PAGINA, NUMEROS_NO_CARTAO } from "@shared/bilhetes";
import { cortarPagina, type CursorDaLista } from "@shared/paginacao";
import { midiasDas, pecaPublica, urlDaFoto } from "./perfil";

export class BilheteError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}

/** `pedidoVisivel()` em SQL: o que a conta provou sobre as compras de fora dela. */
function visivelNaConta(t: Titularidade): SQL | undefined {
  if (t.telefoneConfirmado) return undefined;
  return t.comprasVinculadasEm
    ? or(eq(orders.viaConta, true), lte(orders.createdAt, t.comprasVinculadasEm))
    : eq(orders.viaConta, true);
}

/** Só conta com senha (não o código do WhatsApp sozinho) e não excluída. */
async function contaDe(buyerId: string | undefined): Promise<string> {
  if (!buyerId) throw new BilheteError("Entre na sua conta.", 401);
  const [c] = await db
    .select({ senha: buyers.passwordHash, excluidoEm: buyers.excluidoEm })
    .from(buyers)
    .where(eq(buyers.id, buyerId));
  if (!c || c.excluidoEm || !c.senha) throw new BilheteError("Entre na sua conta.", 401);
  return buyerId;
}

export async function bilhetesDaConta(
  buyerId: string | undefined,
  t: Titularidade,
  { limite = BILHETES_PAGINA, antes = null }: { limite?: number; antes?: CursorDaLista | null } = {},
) {
  const id = await contaDe(buyerId);
  const filtros: (SQL | undefined)[] = [eq(orders.buyerId, id), eq(orders.status, "paid"), visivelNaConta(t)];
  if (antes) {
    filtros.push(
      or(
        lt(orders.createdAt, antes.criadoEm),
        and(eq(orders.createdAt, antes.criadoEm), lt(orders.id, antes.id)),
      ),
    );
  }
  const linhas = await db
    .select({
      id: orders.id,
      codigo: orders.code,
      quantidade: orders.quantity,
      totalCents: orders.amountCents,
      pagoEm: orders.paidAt,
      criadoEm: orders.createdAt,
      campanhaId: campaigns.id,
      slug: campaigns.slug,
      titulo: campaigns.title,
      premio: campaigns.prizeTitle,
      totalCotas: campaigns.totalQuotas,
      status: campaigns.status,
      drawAt: campaigns.drawAt,
      orgNome: organizations.name,
      orgSlug: organizations.slug,
      orgArquivada: organizations.archivedAt,
      orgBanida: organizations.banidaEm,
      orgFoto: organizacaoFotos.updatedAt,
    })
    .from(orders)
    .innerJoin(campaigns, eq(campaigns.id, orders.campaignId))
    .leftJoin(organizations, eq(organizations.id, campaigns.organizationId))
    .leftJoin(organizacaoFotos, eq(organizacaoFotos.organizationId, organizations.id))
    .where(and(...filtros))
    .orderBy(desc(orders.createdAt), desc(orders.id))
    // Uma a mais só para saber se há próxima página.
    .limit(limite + 1);
  const { itens, proximo } = cortarPagina(linhas, limite);
  if (itens.length === 0) return { itens: [], proximo: null };

  const ids = itens.map((i) => i.id);
  // Os primeiros números de cada pedido (o teto do cartão), numa consulta só.
  // LATERAL com LIMIT: cada pedido lê só os primeiros números, não a janela inteira.
  const numeros = await db.execute<{ order_id: string; number: number }>(sql`
    select p.id as order_id, q.number
      from (values ${sql.join(ids.map((x) => sql`(${x}::uuid)`), sql`, `)}) as p(id)
      cross join lateral (
        select number from quota_alloc
         where order_id = p.id
         order by number
         limit ${NUMEROS_NO_CARTAO}
      ) q
     order by p.id, q.number
  `);
  const dosPedidos = new Map<string, number[]>();
  for (const r of numeros.rows) {
    const l = dosPedidos.get(r.order_id) ?? [];
    l.push(Number(r.number));
    dosPedidos.set(r.order_id, l);
  }
  // Só a cota premiada que ESTE pedido já reclamou: o número em jogo nunca sai.
  const premiadas = await db
    .select({ pedido: prizedQuotas.claimedByOrderId, number: prizedQuotas.number, label: prizedQuotas.prizeLabel })
    .from(prizedQuotas)
    .where(inArray(prizedQuotas.claimedByOrderId, ids));
  const premiosDoPedido = new Map<string, { number: number; label: string }[]>();
  for (const p of premiadas) {
    if (!p.pedido) continue;
    const l = premiosDoPedido.get(p.pedido) ?? [];
    l.push({ number: p.number, label: p.label });
    premiosDoPedido.set(p.pedido, l);
  }
  const midias = await midiasDas([...new Set(itens.map((i) => i.campanhaId))]);

  return {
    proximo,
    itens: itens.map((i) => {
      const noAr = i.orgSlug && !i.orgArquivada && !i.orgBanida;
      return {
        id: i.id,
        codigo: i.codigo,
        pagoEm: (i.pagoEm ?? i.criadoEm).toISOString(),
        quantidade: i.quantidade,
        totalCents: i.totalCents,
        numeros: dosPedidos.get(i.id) ?? [],
        premiadas: premiosDoPedido.get(i.id) ?? [],
        rifa: {
          slug: i.slug,
          titulo: i.titulo,
          premio: i.premio,
          totalCotas: i.totalCotas,
          status: i.status,
          drawAt: i.drawAt ? i.drawAt.toISOString() : null,
        },
        midias: (midias.get(i.campanhaId) ?? []).map(pecaPublica),
        organizacao: noAr ? { nome: i.orgNome!, slug: i.orgSlug!, foto: urlDaFoto(i.orgSlug!, i.orgFoto) } : null,
      };
    }),
  };
}
