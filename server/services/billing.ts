/**
 * Cobrança da plataforma sobre as organizações.
 *
 * Uma porta de entrada, um razão só (`platform_charges`): `lancarTaxaDaVenda()`
 * roda dentro da transação que confirma o pagamento, junto com a comissão.
 * Tem que ser na mesma transação: taxa lançada fora dela sobreviveria a um
 * rollback e cobraria por uma venda que não existiu. Não há mensalidade.
 *
 * A ordem do rateio é a regra que não se negocia: **a plataforma sai antes**,
 * e a comissão do afiliado ou do cambista incide sobre o que sobrou. Quem faz
 * essa conta é `splitOrder()`, em `shared/pricing.ts`, com as taxas
 * fotografadas no pedido (`shared/cobranca.ts`).
 */
import { and, eq, sql, desc } from "drizzle-orm";
import { db } from "../db";
import { organizations, platformCharges, orders, campaigns, presenteCreditos } from "@shared/schema";
import { temRetencaoAtiva } from "./retencao";
import { PAGINA_PADRAO, cortarPagina, type CursorDaLista } from "@shared/paginacao";
import { lancamentoDaTaxa } from "@shared/billing";

export class BillingError extends Error {
  constructor(message: string, readonly status = 400) {
    super(message);
    this.name = "BillingError";
  }
}

/* ------------------------------------------------------------------ *
 * Taxa por venda
 * ------------------------------------------------------------------ */

/**
 * Lança a taxa da plataforma sobre uma venda paga: a parte da venda
 * (percentual ou por cota) e a do Pix, numa linha.
 *
 * Recebe a transação de propósito: isto acontece dentro do mesmo `BEGIN` que
 * marca o pedido como pago. `onConflictDoNothing` sobre o índice do pedido
 * fecha a porta do webhook chamado duas vezes.
 */
export async function lancarTaxaDaVenda(
  tx: Pick<typeof db, "insert">,
  params: {
    organizationId: string;
    orderId: string;
    vendaCents: number;
    pixCents: number;
    modo: string;
    vendaBp: number;
    /**
     * O Pix foi dividido na origem (split do Asaas): a plataforma já ficou
     * com a taxa. O lançamento existe para o extrato fechar, mas nasce
     * `retida` — listá-lo como `aberta` cobraria a mesma taxa duas vezes.
     */
    retidaNoSplit?: boolean;
    /** A hora do pagamento, para a taxa retida constar paga no mesmo instante. */
    paidAt?: Date;
  },
) {
  const valores = lancamentoDaTaxa(params, params.paidAt);
  if (!valores) return;

  await tx.insert(platformCharges).values(valores).onConflictDoNothing();
}

/* ------------------------------------------------------------------ *
 * Leitura
 * ------------------------------------------------------------------ */

/** O extrato de uma organização: o que ela deve e o que já pagou. */
export async function extratoDa(
  organizationId: string,
  { limite = PAGINA_PADRAO, antes = null }: { limite?: number; antes?: CursorDaLista | null } = {},
) {
  const doExtrato = await db
    .select({
      charge: platformCharges,
      orderCode: orders.code,
      pedidoStatus: orders.status,
      campanha: campaigns.title,
    })
    .from(platformCharges)
    .leftJoin(orders, eq(orders.id, platformCharges.orderId))
    .leftJoin(campaigns, eq(campaigns.id, orders.campaignId))
    .where(
      and(
        eq(platformCharges.organizationId, organizationId),
        // Por chave, como em Pedidos: sem OFFSET (`shared/paginacao.ts`).
        antes
          ? sql`(${platformCharges.createdAt}, ${platformCharges.id}) < (${antes.criadoEm.toISOString()}::timestamp, ${antes.id}::uuid)`
          : sql`true`,
      ),
    )
    .orderBy(desc(platformCharges.createdAt), desc(platformCharges.id))
    .limit(limite + 1);
  const { itens: linhas, proximo } = cortarPagina(
    doExtrato.map((l) => ({ ...l, criadoEm: l.charge.createdAt, id: l.charge.id })),
    limite,
  );

  const [totais] = await db
    .select({
      abertoCents: sql<number>`coalesce(sum(${platformCharges.amountCents}) FILTER (WHERE ${platformCharges.status} = 'aberta'), 0)::int`,
      pagoCents: sql<number>`coalesce(sum(${platformCharges.amountCents}) FILTER (WHERE ${platformCharges.status} = 'paga'), 0)::int`,
      retidaCents: sql<number>`coalesce(sum(${platformCharges.amountCents}) FILTER (WHERE ${platformCharges.status} = 'retida'), 0)::int`,
    })
    .from(platformCharges)
    .where(eq(platformCharges.organizationId, organizationId));

  // O que a plataforma deve à organização: a parte dela nos presentes.
  const [creditos] = await db
    .select({
      devidoCents: sql<number>`coalesce(sum(${presenteCreditos.amountCents}) FILTER (WHERE ${presenteCreditos.status} = 'devido'), 0)::int`,
      pagoCents: sql<number>`coalesce(sum(${presenteCreditos.amountCents}) FILTER (WHERE ${presenteCreditos.status} = 'pago'), 0)::int`,
    })
    .from(presenteCreditos)
    .where(eq(presenteCreditos.organizationId, organizationId));

  return {
    linhas: linhas.map(({ criadoEm: _c, id: _i, ...linha }) => linha),
    proximo,
    totais,
    creditos,
  };
}

/** A carteira da plataforma: quanto cada organização deve. */
export async function carteiraDaPlataforma() {
  return db
    .select({
      organizationId: organizations.id,
      name: organizations.name,
      active: organizations.active,
      abertoCents: sql<number>`coalesce(sum(${platformCharges.amountCents}) FILTER (WHERE ${platformCharges.status} = 'aberta'), 0)::int`,
      pagoCents: sql<number>`coalesce(sum(${platformCharges.amountCents}) FILTER (WHERE ${platformCharges.status} = 'paga'), 0)::int`,
      retidaCents: sql<number>`coalesce(sum(${platformCharges.amountCents}) FILTER (WHERE ${platformCharges.status} = 'retida'), 0)::int`,
      lancamentos: sql<number>`count(${platformCharges.id})::int`,
      // Subconsulta: somar no mesmo GROUP BY multiplicaria as linhas.
      creditoCents: sql<number>`(select coalesce(sum(pc.amount_cents), 0)::int from presente_creditos pc where pc.organization_id = "organizations"."id" and pc.status = 'devido')`,
    })
    .from(organizations)
    .leftJoin(platformCharges, eq(platformCharges.organizationId, organizations.id))
    .groupBy(organizations.id)
    .orderBy(organizations.name);
}

/**
 * Acerta a conta de uma organização nos dois sentidos, numa transação: o
 * que ela devia (taxas em aberto) e o que a plataforma devia
 * a ela (créditos de presente).
 */
export async function darBaixa(organizationId: string): Promise<number> {
  return db.transaction(async (tx) => {
    const agora = new Date();
    const linhas = await tx
      .update(platformCharges)
      .set({ status: "paga", paidAt: agora })
      .where(
        and(
          eq(platformCharges.organizationId, organizationId),
          eq(platformCharges.status, "aberta"),
        ),
      )
      .returning({ id: platformCharges.id });
    // Saldo retido cautelarmente: a organização paga o que deve, mas o
    // crédito do presente fica (`shared/retencao.ts`).
    if (await temRetencaoAtiva(tx, organizationId)) return linhas.length;
    const creditos = await tx
      .update(presenteCreditos)
      .set({ status: "pago", pagoEm: agora })
      .where(and(eq(presenteCreditos.organizationId, organizationId), eq(presenteCreditos.status, "devido")))
      .returning({ id: presenteCreditos.id });
    return linhas.length + creditos.length;
  });
}
