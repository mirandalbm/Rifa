/**
 * Prova do carrinho num Pix só, pela API de verdade:
 *
 * - um pedido por rifa, todos na mesma cobrança e no mesmo carrinho, com o
 *   preço recalculado aqui (o do corpo não conta);
 * - tudo ou nada: faltou cota numa rifa, nenhuma fica reservada;
 * - o carrinho conta como **um** pedido aberto no antifraude;
 * - o Pix pago confirma todos (uma vez só, mesmo repetido);
 * - vencido, devolve as cotas de todos e cancela a cobrança uma vez;
 * - estorno de um pedido não mexe no outro; o estorno da cobrança inteira
 *   desfaz os que sobraram, sem dobrar;
 * - a consulta do carrinho não traz dado do comprador.
 *
 *   npm run carrinho      (com `npm run dev` no ar e o seed aplicado)
 */
import "dotenv/config";
import { baseUrl } from "./base-url";
import { eq, inArray, like, sql } from "drizzle-orm";
import { db, pool } from "../server/db";
import { buyers, campaignStats, campaigns, carrinhoPedidos, orders, organizations, platformCharges, quotaAlloc, rateEvents } from "../shared/schema";
import { priceOrder } from "../shared/pricing";
import { refundByChargeId, refundOrder } from "../server/services/orders";
import { releaseExpired } from "../server/services/quotas";

const URL = baseUrl();
let falhas = 0;
const checa = (n: string, ok: boolean, d = "") => {
  console.log(`  ${ok ? "✓" : "✗"} ${n}${d ? ` (${d})` : ""}`);
  if (!ok) falhas++;
};

const PREFIXO = "carrinho-teste-";
const ORG_SLUG = "carrinho-teste-promotora";
const TELEFONES = ["11972220001", "11972220002", "11972220003", "11972220004"];

async function req(metodo: string, caminho: string, corpo?: unknown) {
  const r = await fetch(URL + caminho, {
    method: metodo,
    headers: { "Content-Type": "application/json", "x-device-id": `aparelho-carrinho-${Math.random()}` },
    body: corpo === undefined ? undefined : JSON.stringify(corpo),
  });
  const tipo = r.headers.get("content-type") ?? "";
  return { status: r.status, json: tipo.includes("json") ? await r.json() : null };
}

async function limpar() {
  const rifas = await db.select({ id: campaigns.id }).from(campaigns).where(like(campaigns.slug, `${PREFIXO}%`));
  const ids = rifas.map((r) => r.id);
  if (ids.length) {
    const pedidos = await db.select({ id: orders.id }).from(orders).where(inArray(orders.campaignId, ids));
    if (pedidos.length) await db.delete(platformCharges).where(inArray(platformCharges.orderId, pedidos.map((p) => p.id)));
    await db.delete(campaigns).where(inArray(campaigns.id, ids));
  }
  const gente = await db.select({ id: buyers.id }).from(buyers).where(inArray(buyers.phone, TELEFONES));
  if (gente.length) {
    await db.delete(carrinhoPedidos).where(inArray(carrinhoPedidos.buyerId, gente.map((g) => g.id)));
    await db.delete(buyers).where(inArray(buyers.id, gente.map((g) => g.id))).catch(() => {});
  }
  await db.delete(rateEvents).where(sql`${rateEvents.bucket} like 'order:%'`);
  await db.delete(organizations).where(eq(organizations.slug, ORG_SLUG));
}

const statsDe = async (id: string) => (await db.select().from(campaignStats).where(eq(campaignStats.campaignId, id)))[0];

async function main() {
  console.log("\n=== carrinho num Pix só ===\n");
  await limpar();
  // Duas promotoras: a do seed e uma desta prova (o banco do CI tem só uma).
  const [daSeed] = await db.select().from(organizations).where(eq(organizations.slug, "rifas-sao-jose"));
  if (!daSeed) throw new Error("Nenhuma organização no banco. Rode `npm run db:seed`.");
  const [segunda] = await db.insert(organizations).values({ name: "Promotora do carrinho", slug: ORG_SLUG }).returning();
  const orgs = [daSeed, segunda];

  const nova = async (i: number, org: string, total: number, preco: number) => {
    const [c] = await db
      .insert(campaigns)
      .values({
        organizationId: org,
        slug: `${PREFIXO}${i}`,
        title: `Rifa do carrinho ${i}`,
        prizeTitle: `Prêmio ${i}`,
        totalQuotas: total,
        priceCents: preco,
        status: "published",
        publishedAt: new Date(),
        drawAt: new Date(Date.now() + 10 * 86_400_000),
        authorizationCode: `SPA-CARRINHO-${i}`,
        reservationTtlMin: 10 + i,
      })
      .returning();
    await db.insert(campaignStats).values({ campaignId: c.id });
    return c;
  };
  const a = await nova(1, orgs[0].id, 1000, 250);
  const b = await nova(2, orgs[1].id, 1000, 199);
  const pequena = await nova(3, orgs[1].id, 5, 100);

  const comprador = (i: number) => ({ name: `Comprador Carrinho ${i}`, phone: TELEFONES[i] });

  try {
    console.log("  checkout:");
    let r = await req("POST", "/api/public/carrinho/checkout", {
      itens: [
        { slug: a.slug, quantidade: 4, totalCents: 1 },
        { slug: b.slug, quantidade: 3 },
      ],
      buyer: comprador(0),
      totalCents: 1,
    });
    const esperado =
      priceOrder({ quantity: 4, unitCents: 250 }).totalCents + priceOrder({ quantity: 3, unitCents: 199 }).totalCents;
    checa("dois pedidos num carrinho (201)", r.status === 201 && r.json?.pedidos?.length === 2, `HTTP ${r.status} ${r.json?.message ?? ""}`);
    checa("o total é o do servidor (o do corpo não conta)", r.json?.totalCents === esperado, `${r.json?.totalCents}, esperado ${esperado}`);
    const codigo = r.json?.codigo as number;
    const [carrinho] = await db.select().from(carrinhoPedidos).where(eq(carrinhoPedidos.codigo, codigo));
    const doCarrinho = await db.select().from(orders).where(eq(orders.carrinhoId, carrinho.id));
    checa(
      "todos na mesma cobrança, com o valor de cada pedido",
      doCarrinho.length === 2 &&
        doCarrinho.every((o) => o.pspChargeId && o.pspChargeId === carrinho.pspChargeId) &&
        doCarrinho.reduce((s, o) => s + o.amountCents, 0) === carrinho.totalCents,
    );
    checa(
      "vencem juntos, no menor prazo de reserva",
      doCarrinho.every((o) => o.expiresAt?.getTime() === carrinho.expiresAt.getTime()) &&
        Math.abs(carrinho.expiresAt.getTime() - Date.now() - 11 * 60_000) < 60_000,
    );
    checa("as cotas ficam reservadas nas duas rifas", (await statsDe(a.id)).reservedCount === 4 && (await statsDe(b.id)).reservedCount === 3);

    r = await req("GET", `/api/public/carrinho/pedidos/${codigo}`);
    const texto = JSON.stringify(r.json);
    checa("a consulta do carrinho responde esperando o Pix", r.status === 200 && r.json?.status === "pending" && r.json.pedidos.length === 2);
    checa("…sem nome nem telefone de quem comprou", !texto.includes(TELEFONES[0]) && !texto.includes("Comprador Carrinho"));
    r = await req("GET", `/api/public/orders/${doCarrinho[0].code}`);
    checa("o pedido diz de que carrinho é e o total do Pix", r.json?.carrinho?.codigo === codigo && r.json.carrinho.totalCents === esperado);

    console.log("\n  cartela escolhida:");
    r = await req("GET", `/api/public/campaigns/${b.slug}/cartelas?quantidade=5&cartelas=1`);
    const cartela = (r.json?.cartelas?.[0] ?? []) as number[];
    r = await req("POST", "/api/public/carrinho", { itens: [{ slug: b.slug, quantidade: 5, numeros: cartela }] });
    checa("a consulta do carrinho devolve a cartela guardada", JSON.stringify(r.json?.itens?.[0]?.numeros) === JSON.stringify(cartela));
    r = await req("POST", "/api/public/carrinho/checkout", { itens: [{ slug: b.slug, quantidade: 5, numeros: cartela }], buyer: comprador(2) });
    const pedidoCartela = await db.select().from(orders).where(eq(orders.code, r.json?.pedidos?.[0]?.code ?? 0));
    const reservados = pedidoCartela.length
      ? (await db.select({ n: quotaAlloc.number }).from(quotaAlloc).where(eq(quotaAlloc.orderId, pedidoCartela[0].id))).map((x) => x.n)
      : [];
    checa(
      "a compra reserva exatamente os números da cartela",
      r.status === 201 && reservados.length === 5 && cartela.every((n) => reservados.includes(n)),
      `HTTP ${r.status} ${r.json?.message ?? ""}`,
    );
    r = await req("POST", "/api/public/carrinho/checkout", {
      itens: [
        { slug: a.slug, quantidade: 1 },
        { slug: b.slug, quantidade: 5, numeros: cartela },
      ],
      buyer: comprador(1),
    });
    checa(
      "número da cartela já levado: 409 dizendo de qual rifa, e nada reservado",
      r.status === 409 && r.json?.slug === b.slug && (await statsDe(a.id)).reservedCount === 4,
      `HTTP ${r.status} ${r.json?.slug ?? ""}`,
    );
    await db.delete(quotaAlloc).where(eq(quotaAlloc.orderId, pedidoCartela[0]?.id ?? "00000000-0000-0000-0000-000000000000"));
    await db.update(orders).set({ status: "expired" }).where(eq(orders.id, pedidoCartela[0]?.id ?? "00000000-0000-0000-0000-000000000000"));
    await db.update(campaignStats).set({ reservedCount: 3 }).where(eq(campaignStats.campaignId, b.id));

    console.log("\n  tudo ou nada:");
    const antes = await statsDe(a.id);
    r = await req("POST", "/api/public/carrinho/checkout", {
      itens: [
        { slug: a.slug, quantidade: 2 },
        { slug: pequena.slug, quantidade: 5 },
      ],
      buyer: comprador(1),
    });
    await req("POST", "/api/public/carrinho/checkout", { itens: [{ slug: pequena.slug, quantidade: 3 }], buyer: comprador(2) });
    // O contador diz que há cota, mas os números estão tomados: a checagem
    // de antes passa e quem recusa é a reserva, dentro da transação — onde o
    // pedido da outra rifa já tinha sido gravado.
    await db.update(campaignStats).set({ reservedCount: 0 }).where(eq(campaignStats.campaignId, pequena.id));
    r = await req("POST", "/api/public/carrinho/checkout", {
      itens: [
        { slug: a.slug, quantidade: 2 },
        { slug: pequena.slug, quantidade: 5 },
      ],
      buyer: comprador(3),
    });
    checa(
      "faltou cota na reserva de uma rifa: 409",
      r.status === 409 && /não tem mais cotas/.test(r.json?.message ?? ""),
      `HTTP ${r.status} ${r.json?.message ?? ""}`,
    );
    const [c3] = await db.select({ n: sql<number>`count(*)::int` }).from(orders).where(sql`${orders.buyerId} = (select id from buyers where phone = ${TELEFONES[3]})`);
    checa(
      "…e nenhuma rifa ficou com reserva nem pedido",
      (await statsDe(a.id)).reservedCount === antes.reservedCount + 2 && (c3?.n ?? 0) === 0,
      `reservadas ${(await statsDe(a.id)).reservedCount}, pedidos ${c3?.n}`,
    );
    r = await req("POST", "/api/public/carrinho/checkout", { itens: [{ slug: "rifa-que-nao-existe", quantidade: 1 }], buyer: comprador(3) });
    checa("rifa que saiu do ar: 409", r.status === 409, `HTTP ${r.status}`);

    console.log("\n  antifraude:");
    const tres = [a, b, pequena].map((c) => ({ slug: c.slug, quantidade: 1 }));
    await db.update(campaignStats).set({ reservedCount: 0 }).where(eq(campaignStats.campaignId, pequena.id));
    await db.delete(quotaAlloc).where(eq(quotaAlloc.campaignId, pequena.id));
    await db.update(orders).set({ status: "expired" }).where(eq(orders.campaignId, pequena.id));
    r = await req("POST", "/api/public/carrinho/checkout", { itens: tres.slice(0, 2), buyer: comprador(3) });
    checa("um carrinho de duas rifas passa (limite de 2 pedidos abertos)", r.status === 201, `HTTP ${r.status} ${r.json?.message ?? ""}`);
    r = await req("POST", "/api/public/carrinho/checkout", { itens: tres, buyer: comprador(3) });
    checa("o segundo carrinho, de três rifas, também — cada carrinho é um pedido aberto", r.status === 201, `HTTP ${r.status} ${r.json?.message ?? ""}`);
    r = await req("POST", "/api/public/carrinho/checkout", { itens: tres.slice(0, 1), buyer: comprador(3) });
    checa("o terceiro passa do limite: 429", r.status === 429, `HTTP ${r.status}`);

    console.log("\n  Pix pago:");
    r = await req("POST", `/api/dev/pay/${doCarrinho[1].code}`);
    const pagos = await db.select().from(orders).where(eq(orders.carrinhoId, carrinho.id));
    checa("o Pix do carrinho paga todos os pedidos", r.status === 200 && pagos.every((o) => o.status === "paid"), `HTTP ${r.status}`);
    const vendidasA = (await statsDe(a.id)).soldCount;
    await req("POST", `/api/dev/pay/${doCarrinho[0].code}`);
    checa("repetir o aviso não conta a venda de novo", (await statsDe(a.id)).soldCount === vendidasA && vendidasA === 4, `${vendidasA}`);
    r = await req("GET", `/api/public/carrinho/pedidos/${codigo}`);
    checa("a consulta mostra pago", r.json?.status === "paid");

    console.log("\n  vencido:");
    const [outro] = await db
      .select()
      .from(carrinhoPedidos)
      .where(sql`${carrinhoPedidos.buyerId} = (select id from buyers where phone = ${TELEFONES[3]})`)
      .orderBy(carrinhoPedidos.createdAt)
      .limit(1);
    const passado = new Date(Date.now() - 60_000);
    const idsOutro = (await db.select({ id: orders.id }).from(orders).where(eq(orders.carrinhoId, outro.id))).map((x) => x.id);
    await db.update(quotaAlloc).set({ reservedUntil: passado }).where(inArray(quotaAlloc.orderId, idsOutro));
    const reservadasA = (await statsDe(a.id)).reservedCount;
    const { cobrancas } = await releaseExpired();
    const vencidos = await db.select().from(orders).where(inArray(orders.id, idsOutro));
    checa("os pedidos do carrinho vencem juntos", vencidos.every((o) => o.status === "expired"));
    checa("as cotas voltam ao estoque", (await statsDe(a.id)).reservedCount === reservadasA - 1, `${reservadasA} → ${(await statsDe(a.id)).reservedCount}`);
    checa(
      "a cobrança conjunta é cancelada uma vez só",
      cobrancas.filter((c) => c.chargeId === outro.pspChargeId).length === 1,
      `${cobrancas.length}`,
    );

    console.log("\n  estorno:");
    const [pa, pb] = pagos.sort((x, y) => (x.campaignId === a.id ? -1 : y.campaignId === a.id ? 1 : 0));
    await refundOrder(pa.id);
    const [depoisA] = await db.select().from(orders).where(eq(orders.id, pa.id));
    const [aindaB] = await db.select().from(orders).where(eq(orders.id, pb.id));
    checa("estornar um pedido não mexe no outro", depoisA.status === "refunded" && aindaB.status === "paid");
    checa("a cota do estornado volta", (await statsDe(a.id)).soldCount === 0, `${(await statsDe(a.id)).soldCount}`);
    const feitos = await refundByChargeId(carrinho.pspChargeId!);
    const [fimB] = await db.select().from(orders).where(eq(orders.id, pb.id));
    checa("o estorno da cobrança inteira desfaz o que sobrou, sem dobrar", feitos.length === 1 && fimB.status === "refunded", `${feitos.length}`);
    checa("as vendas voltam a zero nas duas rifas", (await statsDe(a.id)).soldCount === 0 && (await statsDe(b.id)).soldCount === 0);
  } finally {
    await limpar();
  }

  console.log(falhas ? `\n${falhas} falha(s).\n` : "\nTudo certo.\n");
  await pool.end();
  process.exit(falhas ? 1 : 0);
}

main().catch(async (e) => {
  console.error(e);
  await limpar().catch(() => {});
  await pool.end();
  process.exit(1);
});
