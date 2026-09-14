/**
 * Teste de estorno.
 *
 * Estornar é desfazer cinco coisas ao mesmo tempo — cota, contador, comissão,
 * taxa da plataforma e cota premiada — e o modo de errar é sempre o mesmo:
 * desfazer quatro e esquecer a quinta. O que sobra não dá erro; vira dinheiro
 * pago a quem não vendeu, ou número que some do estoque.
 *
 *   npm run refund
 *
 * Rode depois de mexer em `refundOrder`, no webhook ou no motor de cotas.
 */
import "dotenv/config";
import { eq, sql } from "drizzle-orm";
import { db, pool } from "../server/db";
import {
  organizations,
  campaigns,
  campaignStats,
  quotaAlloc,
  freePool,
  orders,
  commissions,
  platformCharges,
  prizedQuotas,
  draws,
  buyers,
} from "../shared/schema";
import { refundOrder } from "../server/services/orders";

const URL = process.argv.includes("--url")
  ? process.argv[process.argv.indexOf("--url") + 1]
  : "http://127.0.0.1:5055";

let falhas = 0;
function checa(nome: string, ok: boolean, detalhe = "") {
  console.log(`    ${ok ? "✓" : "✗"} ${nome}${detalhe ? ` (${detalhe})` : ""}`);
  if (!ok) falhas++;
}

const SLUG = "estorno-teste";

async function montar() {
  const [org] = await db.select().from(organizations).limit(1);
  if (!org) throw new Error("Nenhuma organização no banco. Rode `npm run db:seed`.");

  // Contrato de comissão, para a taxa existir e poder ser cancelada.
  await db
    .update(organizations)
    .set({ billingMode: "comissao", platformFeePct: 5 })
    .where(eq(organizations.id, org.id));

  const [campanha] = await db
    .insert(campaigns)
    .values({
      organizationId: org.id,
      slug: SLUG,
      title: "Rifa do estorno",
      prizeTitle: "Prêmio de teste",
      totalQuotas: 1000,
      priceCents: 1000,
      status: "published",
      commissionPctDefault: 10,
    })
    .onConflictDoUpdate({ target: campaigns.slug, set: { status: "published" } })
    .returning();

  await db
    .insert(campaignStats)
    .values({ campaignId: campanha.id })
    .onConflictDoUpdate({
      target: campaignStats.campaignId,
      set: { soldCount: 0, reservedCount: 0, revenueCents: 0, endgame: false },
    });

  return { org, campanha };
}

/** Compra e paga pela API, como um comprador de verdade. */
async function comprarEPagar(campaignId: string, corpo: Record<string, unknown>) {
  const criar = await fetch(`${URL}/api/public/orders`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-device-id": `refund-${Math.random()}` },
    body: JSON.stringify({ campaignId, ...corpo }),
  });
  const pedido = (await criar.json()) as { code?: number; numbers?: number[]; message?: string };
  if (!pedido.code) throw new Error(`Compra recusada: ${pedido.message}`);

  await fetch(`${URL}/api/dev/pay/${pedido.code}`, { method: "POST" });
  return pedido as { code: number; numbers: number[] };
}

async function estadoDoPedido(code: number) {
  const [o] = await db.select().from(orders).where(eq(orders.code, code));
  const [cotas] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(quotaAlloc)
    .where(eq(quotaAlloc.orderId, o.id));
  const [k] = await db.select().from(commissions).where(eq(commissions.orderId, o.id));
  const [pc] = await db
    .select()
    .from(platformCharges)
    .where(eq(platformCharges.orderId, o.id));
  const [st] = await db
    .select()
    .from(campaignStats)
    .where(eq(campaignStats.campaignId, o.campaignId));

  return { order: o, cotas: cotas.n, comissao: k, taxa: pc, stats: st };
}

/* ---------------- os casos ---------------- */

async function casoSimples(campaignId: string) {
  console.log("\n  venda comum, rifa aberta:");

  const antes = await db
    .select()
    .from(campaignStats)
    .where(eq(campaignStats.campaignId, campaignId));

  const pedido = await comprarEPagar(campaignId, {
    quantity: 10,
    affiliateCode: "JOAO7",
    buyer: { name: "Estorno Simples", phone: `1198${Date.now() % 10_000_000}` },
  });

  const pago = await estadoDoPedido(pedido.code);
  checa("a venda criou comissão", Boolean(pago.comissao), pago.comissao?.status);
  checa("a venda criou taxa da plataforma", Boolean(pago.taxa), pago.taxa?.status);

  const r = await refundOrder(pago.order.id);
  const depois = await estadoDoPedido(pedido.code);

  checa("o pedido ficou refunded", depois.order.status === "refunded", depois.order.status);
  checa("as cotas voltaram ao estoque", depois.cotas === 0, `${depois.cotas} restantes`);
  checa(
    "a comissão foi revertida",
    depois.comissao?.status === "reversed",
    depois.comissao?.status,
  );
  checa(
    "a taxa da plataforma foi cancelada",
    depois.taxa?.status === "cancelada",
    depois.taxa?.status,
  );
  checa(
    "o contador de vendidas voltou ao que era",
    depois.stats.soldCount === (antes[0]?.soldCount ?? 0),
    `${depois.stats.soldCount} vs ${antes[0]?.soldCount ?? 0}`,
  );
  checa(
    "a receita voltou ao que era",
    depois.stats.revenueCents === (antes[0]?.revenueCents ?? 0),
    `${depois.stats.revenueCents} vs ${antes[0]?.revenueCents ?? 0}`,
  );
  checa("estornar de novo não faz nada", (await refundOrder(pago.order.id)) === null);
  void r;
}

async function casoEndgame(campaignId: string) {
  console.log("\n  rifa em endgame — o número precisa voltar para o pool:");

  await db
    .update(campaignStats)
    .set({ endgame: true })
    .where(eq(campaignStats.campaignId, campaignId));
  await db.execute(sql`
    INSERT INTO free_pool (campaign_id, number)
    SELECT ${campaignId}::uuid, g FROM generate_series(1, 1000) g
     WHERE NOT EXISTS (
       SELECT 1 FROM quota_alloc a WHERE a.campaign_id = ${campaignId}::uuid AND a.number = g
     )
    ON CONFLICT DO NOTHING
  `);

  const pedido = await comprarEPagar(campaignId, {
    quantity: 5,
    buyer: { name: "Estorno Endgame", phone: `1197${Date.now() % 10_000_000}` },
  });

  const [noPoolDurante] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(freePool)
    .where(
      sql`${freePool.campaignId} = ${campaignId}::uuid AND ${freePool.number} = ANY(${`{${pedido.numbers.join(",")}}`}::int[])`,
    );
  checa("os números saíram do pool ao vender", noPoolDurante.n === 0, `${noPoolDurante.n} no pool`);

  const estado = await estadoDoPedido(pedido.code);
  await refundOrder(estado.order.id);

  const [noPoolDepois] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(freePool)
    .where(
      sql`${freePool.campaignId} = ${campaignId}::uuid AND ${freePool.number} = ANY(${`{${pedido.numbers.join(",")}}`}::int[])`,
    );
  // Sem isto o número ficaria livre em quota_alloc e invisível para quem
  // aloca pelo pool: sumiria do estoque sem ninguém perceber.
  checa(
    "os números voltaram para o pool",
    noPoolDepois.n === pedido.numbers.length,
    `${noPoolDepois.n} de ${pedido.numbers.length}`,
  );

  await db
    .update(campaignStats)
    .set({ endgame: false })
    .where(eq(campaignStats.campaignId, campaignId));
  await db.delete(freePool).where(eq(freePool.campaignId, campaignId));
}

async function casoPremiada(campaignId: string) {
  console.log("\n  cota premiada — o prêmio volta a valer:");

  await db
    .insert(prizedQuotas)
    .values({ campaignId, number: 777, prizeLabel: "Prêmio do teste" })
    .onConflictDoUpdate({
      target: [prizedQuotas.campaignId, prizedQuotas.number],
      set: { claimedByOrderId: null, claimedAt: null },
    });
  await db.execute(
    sql`DELETE FROM quota_alloc WHERE campaign_id = ${campaignId}::uuid AND number = 777`,
  );

  const pedido = await comprarEPagar(campaignId, {
    numbers: [777],
    buyer: { name: "Estorno Premiado", phone: `1196${Date.now() % 10_000_000}` },
  });

  const [reclamada] = await db
    .select()
    .from(prizedQuotas)
    .where(sql`${prizedQuotas.campaignId} = ${campaignId}::uuid AND ${prizedQuotas.number} = 777`);
  checa("a compra reclamou a cota premiada", Boolean(reclamada.claimedByOrderId));

  const estado = await estadoDoPedido(pedido.code);
  await refundOrder(estado.order.id);

  const [solta] = await db
    .select()
    .from(prizedQuotas)
    .where(sql`${prizedQuotas.campaignId} = ${campaignId}::uuid AND ${prizedQuotas.number} = 777`);
  checa("o estorno soltou a cota premiada", solta.claimedByOrderId === null);
}

async function casoSorteada(campaignId: string) {
  console.log("\n  rifa já sorteada — a cota fica congelada:");

  const pedido = await comprarEPagar(campaignId, {
    quantity: 3,
    buyer: { name: "Estorno Sorteada", phone: `1195${Date.now() % 10_000_000}` },
  });

  // Marca o sorteio como executado depois da venda.
  await db
    .insert(draws)
    .values({
      campaignId,
      seed: "semente-do-teste",
      seedHash: "hash-do-teste",
      executedAt: new Date(),
      resultNumber: 1,
    })
    .onConflictDoNothing();
  await db
    .update(draws)
    .set({ executedAt: new Date() })
    .where(eq(draws.campaignId, campaignId));

  const estado = await estadoDoPedido(pedido.code);
  const r = await refundOrder(estado.order.id);
  const depois = await estadoDoPedido(pedido.code);

  // Depois do sorteio o quadro é imutável: quem conferir o resultado precisa
  // encontrar exatamente o que existia quando o número saiu.
  checa("nenhuma cota foi liberada", r?.liberadas.length === 0);
  checa(
    "as cotas continuam no banco",
    depois.cotas === pedido.numbers.length,
    `${depois.cotas} de ${pedido.numbers.length}`,
  );
  checa("o pedido ainda ficou refunded", depois.order.status === "refunded");
  checa(
    "e a comissão foi revertida mesmo assim",
    depois.comissao === undefined || depois.comissao.status === "reversed",
    depois.comissao?.status ?? "(sem comissão)",
  );
}

async function limpar(campaignId: string) {
  const pedidos = await db
    .select({ id: orders.id, buyerId: orders.buyerId })
    .from(orders)
    .where(eq(orders.campaignId, campaignId));

  await db.delete(platformCharges).where(
    sql`${platformCharges.orderId} = ANY(${`{${pedidos.map((p) => p.id).join(",")}}`}::uuid[])`,
  );
  await db.delete(commissions).where(eq(commissions.campaignId, campaignId));
  await db.delete(quotaAlloc).where(eq(quotaAlloc.campaignId, campaignId));
  await db.delete(freePool).where(eq(freePool.campaignId, campaignId));
  await db.delete(prizedQuotas).where(eq(prizedQuotas.campaignId, campaignId));
  await db.delete(draws).where(eq(draws.campaignId, campaignId));
  await db.delete(orders).where(eq(orders.campaignId, campaignId));
  await db.delete(campaignStats).where(eq(campaignStats.campaignId, campaignId));
  await db.delete(campaigns).where(eq(campaigns.id, campaignId));

  for (const p of pedidos) {
    await db.delete(buyers).where(eq(buyers.id, p.buyerId)).catch(() => {});
  }
}

async function main() {
  console.log("\n=== teste de estorno ===");

  const { campanha } = await montar();
  console.log(`  rifa de teste: ${campanha.slug}`);

  try {
    await casoSimples(campanha.id);
    await casoEndgame(campanha.id);
    await casoPremiada(campanha.id);
    await casoSorteada(campanha.id);
  } finally {
    await limpar(campanha.id);
  }

  console.log(
    falhas === 0 ? "\n  todos os efeitos do estorno conferidos\n" : `\n  ${falhas} falha(s)\n`,
  );

  await pool.end();
  process.exit(falhas === 0 ? 0 : 1);
}

main().catch(async (err) => {
  console.error(err);
  await pool.end().catch(() => {});
  process.exit(1);
});
