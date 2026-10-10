/**
 * Prova do webhook do Pix (`/api/webhooks/:provider`), pela API de verdade
 * (invariante 6: idempotente, e o pagamento nunca se perde):
 *
 * - provedor desconhecido é 404, corpo inválido ou sem cobrança é 400;
 * - o Pix pago confirma o pedido uma vez só: o mesmo evento repetido, e outro
 *   evento da mesma cobrança, não contam a cota de novo;
 * - cinco entregas ao mesmo tempo do mesmo evento, um efeito só;
 * - **evento que não terminou não fica perdido atrás de "duplicado"**: o que
 *   falhou ou parou no meio é retomado pela entrega seguinte — depois do prazo
 *   se o processo caiu, na hora se o processamento falhou;
 * - o evento estornado devolve a cota e não desfaz duas vezes;
 * - evento ignorado fica gravado e não faz nada.
 *
 *   npm run webhook      (com `npm run dev` no ar e o seed aplicado)
 */
import "dotenv/config";
import { baseUrl } from "./base-url";
import { eq, inArray, sql } from "drizzle-orm";
import { db, pool } from "../server/db";
import { campaignStats, campaigns, orders, organizations, quotaAlloc, webhookEvents } from "../shared/schema";

const URL = baseUrl();
let falhas = 0;
const checa = (n: string, ok: boolean, d = "") => {
  console.log(`  ${ok ? "✓" : "✗"} ${n}${d ? ` (${d})` : ""}`);
  if (!ok) falhas++;
};

const SLUG = "webhook-teste";
let telefone = 11977775000;

async function limpar() {
  const orgs = await db.select({ id: organizations.id }).from(organizations).where(eq(organizations.slug, SLUG));
  const ids = orgs.map((o) => o.id);
  if (ids.length) {
    const lista = sql.join(ids.map((i) => sql`${i}::uuid`), sql`, `);
    await db.execute(sql`delete from quota_alloc where campaign_id in (select id from campaigns where organization_id in (${lista}))`);
    await db.execute(sql`delete from commissions where order_id in (select id from orders where campaign_id in (select id from campaigns where organization_id in (${lista})))`);
    await db.execute(sql`delete from platform_charges where order_id in (select id from orders where campaign_id in (select id from campaigns where organization_id in (${lista})))`);
    await db.execute(sql`delete from orders where campaign_id in (select id from campaigns where organization_id in (${lista}))`);
    await db.execute(sql`delete from campaigns where organization_id in (${lista})`);
    await db.delete(organizations).where(inArray(organizations.id, ids));
  }
  await db.execute(sql`delete from webhook_events where external_id like 'wh-prova-%'`);
  await db.execute(sql`delete from buyers where phone like '1197777%'`);
  await db.execute(sql`delete from rate_events where bucket like 'order:%'`);
}

async function postar(provedor: string, corpo: unknown, bruto = false) {
  const r = await fetch(`${URL}/api/webhooks/${provedor}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: bruto ? String(corpo) : JSON.stringify(corpo),
  });
  const tipo = r.headers.get("content-type") ?? "";
  return { status: r.status, json: tipo.includes("json") ? await r.json() : null };
}

async function main() {
  console.log("\n=== webhook do Pix ===\n");
  await limpar();

  const [org] = await db.insert(organizations).values({ slug: SLUG, name: "Promotora Webhook" }).returning();
  const [camp] = await db
    .insert(campaigns)
    .values({
      organizationId: org.id,
      slug: "webhook-rifa",
      title: "Rifa Webhook",
      prizeTitle: "Moto",
      totalQuotas: 10_000,
      priceCents: 1000,
      commissionPctDefault: 10,
      status: "published",
      publishedAt: new Date(),
      drawAt: new Date(Date.now() + 20 * 86_400_000),
      authorizationCode: "SPA-WEBHOOK",
      authorizationFileKey: "certificado-teste",
    })
    .returning();
  await db.insert(campaignStats).values({ campaignId: camp.id });

  const vendidas = async () => Number((await db.select({ n: campaignStats.soldCount }).from(campaignStats).where(eq(campaignStats.campaignId, camp.id)))[0].n);
  const pedido = async (code: number) => (await db.select().from(orders).where(eq(orders.code, code)))[0];
  const novoPedido = async (quantity = 2) => {
    const r = await fetch(`${URL}/api/public/orders`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ campaignId: camp.id, quantity, buyer: { name: "Pagador Webhook", phone: String(telefone++) } }),
    });
    const j = await r.json();
    if (r.status !== 201) throw new Error(`compra: HTTP ${r.status} ${j.message ?? ""}`);
    const o = await pedido(j.code);
    return { code: j.code as number, chargeId: o.pspChargeId as string };
  };
  const evento = async (externalId: string) => (await db.select().from(webhookEvents).where(eq(webhookEvents.externalId, externalId)))[0];

  try {
    /* ---------------------------- recusas -------------------------------- */
    let r = await postar("naoexiste", { chargeId: "x", event: "paid" });
    checa("provedor desconhecido: 404", r.status === 404, `HTTP ${r.status}`);
    r = await postar("dev", "isto não é json", true);
    checa("corpo que não é JSON: 400", r.status === 400, `HTTP ${r.status}`);
    r = await postar("dev", { id: "wh-prova-sem-cobranca", event: "paid" });
    checa("sem cobrança: 400", r.status === 400, `HTTP ${r.status}`);
    checa("…e nada foi gravado como visto", !(await evento("wh-prova-sem-cobranca")));

    /* ---------------------------- pagar ---------------------------------- */
    console.log("\n  pagar:");
    const p1 = await novoPedido(2);
    checa("pedido nasce pendente, com a cota reservada", (await pedido(p1.code)).status === "pending" && (await vendidas()) === 0);
    r = await postar("dev", { id: "wh-prova-1", chargeId: p1.chargeId, event: "paid" });
    checa("o Pix pago confirma (200)", r.status === 200 && r.json?.ok === true && !r.json?.duplicate, JSON.stringify(r.json));
    const pago = await pedido(p1.code);
    checa("…o pedido fica pago e a venda conta 2 cotas", pago.status === "paid" && (await vendidas()) === 2);
    checa("…o evento fica gravado e concluído", Boolean((await evento("wh-prova-1"))?.processedAt));
    r = await postar("dev", { id: "wh-prova-1", chargeId: p1.chargeId, event: "paid" });
    checa("o mesmo evento de novo: duplicado, 200", r.status === 200 && r.json?.duplicate === true, JSON.stringify(r.json));
    r = await postar("dev", { id: "wh-prova-1b", chargeId: p1.chargeId, event: "paid" });
    checa("outro evento da mesma cobrança: 200", r.status === 200, `HTTP ${r.status}`);
    const depois = await pedido(p1.code);
    checa("…e nada conta duas vezes (cotas e data do pagamento)", (await vendidas()) === 2 && depois.paidAt?.getTime() === pago.paidAt?.getTime());

    console.log("\n  cinco entregas ao mesmo tempo:");
    const p2 = await novoPedido(3);
    const rs = await Promise.all(Array.from({ length: 5 }, () => postar("dev", { id: "wh-prova-2", chargeId: p2.chargeId, event: "paid" })));
    checa("todas respondem 200", rs.every((x) => x.status === 200), rs.map((x) => x.status).join(","));
    checa("…uma processa e as outras são duplicadas", rs.filter((x) => x.json?.duplicate).length === 4, JSON.stringify(rs.map((x) => x.json)));
    checa("…a venda conta 3 cotas, não 15", (await vendidas()) === 5, `${await vendidas()}`);

    /* --------------------- o que não terminou não se perde --------------- */
    console.log("\n  retomada:");
    const p3 = await novoPedido(1);
    // O processo caiu depois de gravar o evento: linha sem conclusão, parada há 2 min.
    await db.insert(webhookEvents).values({
      provider: "dev",
      externalId: "wh-prova-caiu",
      payload: { id: "wh-prova-caiu", chargeId: p3.chargeId, event: "paid" },
      createdAt: new Date(Date.now() - 2 * 60_000),
    });
    r = await postar("dev", { id: "wh-prova-caiu", chargeId: p3.chargeId, event: "paid" });
    checa("a entrega seguinte retoma o evento parado (200, sem duplicado)", r.status === 200 && !r.json?.duplicate, JSON.stringify(r.json));
    checa("…o pedido que ficou pendente é pago", (await pedido(p3.code)).status === "paid" && (await vendidas()) === 6);
    checa("…e o evento é concluído", Boolean((await evento("wh-prova-caiu"))?.processedAt));

    const p4 = await novoPedido(1);
    await db.insert(webhookEvents).values({
      provider: "dev",
      externalId: "wh-prova-andando",
      payload: { id: "wh-prova-andando", chargeId: p4.chargeId, event: "paid" },
    });
    r = await postar("dev", { id: "wh-prova-andando", chargeId: p4.chargeId, event: "paid" });
    checa("evento ainda em andamento (recente): duplicado, não processa em dobro", r.status === 200 && r.json?.duplicate === true, JSON.stringify(r.json));
    checa("…o pedido segue pendente", (await pedido(p4.code)).status === "pending");
    await db.update(webhookEvents).set({ createdAt: new Date(Date.now() - 2 * 60_000) }).where(eq(webhookEvents.externalId, "wh-prova-andando"));
    const cinco = await Promise.all(Array.from({ length: 5 }, () => postar("dev", { id: "wh-prova-andando", chargeId: p4.chargeId, event: "paid" })));
    checa("passado o prazo, cinco retomadas ao mesmo tempo: uma só processa", cinco.filter((x) => !x.json?.duplicate).length === 1, JSON.stringify(cinco.map((x) => x.json?.duplicate)));
    checa("…o pedido é pago uma vez", (await pedido(p4.code)).status === "paid" && (await vendidas()) === 7, `${await vendidas()}`);

    /* ------------------------- estorno e ignorado ------------------------ */
    console.log("\n  estorno e ignorado:");
    const alocadas = async (code: number) => Number((await db.execute(sql`select count(*) as n from quota_alloc where order_id = (select id from orders where code = ${code})`)).rows[0].n);
    checa("antes do estorno o pedido tem as cotas", (await alocadas(p1.code)) === 2);
    r = await postar("dev", { id: "wh-prova-est", chargeId: p1.chargeId, event: "refunded" });
    checa("o estorno avisado (200)", r.status === 200, `HTTP ${r.status}`);
    checa("…o pedido fica estornado e as cotas voltam ao estoque", (await pedido(p1.code)).status === "refunded" && (await alocadas(p1.code)) === 0 && (await vendidas()) === 5, `${await vendidas()}`);
    r = await postar("dev", { id: "wh-prova-est2", chargeId: p1.chargeId, event: "refunded" });
    checa("o estorno de novo não desfaz duas vezes", r.status === 200 && (await vendidas()) === 5, `${await vendidas()}`);
    const livres = await db.select({ n: quotaAlloc.number }).from(quotaAlloc).where(eq(quotaAlloc.campaignId, camp.id));
    checa("…e nenhuma cota ficou sem dono do pedido", livres.length >= 0);

    r = await postar("dev", { id: "wh-prova-ign", chargeId: p1.chargeId, event: "ignored" });
    checa("evento ignorado: 200 e gravado", r.status === 200 && Boolean((await evento("wh-prova-ign"))?.processedAt));
    r = await postar("dev", { id: "wh-prova-desc", chargeId: "cobranca-que-nao-existe", event: "paid" });
    checa("Pix de cobrança que não conhecemos: 200, sem derrubar", r.status === 200, `HTTP ${r.status}`);
  } finally {
    await limpar();
  }
  console.log(falhas ? `\n${falhas} falha(s)` : "\ntudo certo");
  await pool.end();
  process.exit(falhas ? 1 : 0);
}

main().catch(async (e) => {
  console.error(e);
  await limpar().catch(() => {});
  await pool.end();
  process.exit(1);
});
