/**
 * Pix que chegou tarde: o pagamento foi confirmado com a reserva já vencida,
 * ou depois do sorteio. É dinheiro sem bilhete, e precisa voltar — por isso
 * entra numa fila que a plataforma resolve (`pix_tardios`), uma linha por
 * pedido. Também confere a guarda do antifraude (recusas e bloqueios
 * vencidos saem no prazo que a Privacidade promete).
 *
 *   npm run pix-tardio
 */
import "dotenv/config";
import { eq, sql } from "drizzle-orm";
import { baseUrl } from "./base-url";
import { db, pool } from "../server/db";
import { hashPassword } from "../server/auth";
import { auditLog, campaignStats, campaigns, draws, fraudBlocks, fraudEvents, orders, organizations, pixTardios, quotaAlloc, users } from "../shared/schema";
import { purgarGuardaDoAntifraude } from "../server/services/antifraude";
import { GUARDA_DAS_RECUSAS_DIAS, GUARDA_DO_BLOQUEIO_VENCIDO_DIAS } from "../shared/antifraude";

const URL = baseUrl();
let falhas = 0;
const checa = (n: string, ok: boolean, d = "") => {
  console.log(`  ${ok ? "✓" : "✗"} ${n}${d ? ` (${d})` : ""}`);
  if (!ok) falhas++;
};

class Cliente {
  cookie = "";
  async req(metodo: string, caminho: string, corpo?: unknown) {
    const r = await fetch(URL + caminho, {
      method: metodo,
      headers: { "Content-Type": "application/json", ...(this.cookie ? { Cookie: this.cookie } : {}) },
      body: corpo === undefined ? undefined : JSON.stringify(corpo),
    });
    const sc = r.headers.get("set-cookie");
    if (sc) this.cookie = sc.split(";")[0];
    const tipo = r.headers.get("content-type") ?? "";
    return { status: r.status, json: tipo.includes("json") ? await r.json() : null };
  }
}

const SLUG = "pix-tardio-teste";
const EMAIL = "pix-tardio-org@teste.rifa";
const SENHA = "senha-pix-tardio-1";
const DIA = 86_400_000;

async function limpar() {
  const [o] = await db.select().from(organizations).where(eq(organizations.slug, SLUG));
  if (o) {
    const daOrg = sql`(select id from orders where campaign_id in (select id from campaigns where organization_id = ${o.id}))`;
    await db.execute(sql`delete from pix_tardios where order_id in ${daOrg}`);
    await db.execute(sql`delete from quota_alloc where campaign_id in (select id from campaigns where organization_id = ${o.id})`);
    await db.execute(sql`delete from platform_charges where order_id in ${daOrg}`);
    await db.execute(sql`delete from orders where campaign_id in (select id from campaigns where organization_id = ${o.id})`);
    await db.execute(sql`delete from campaigns where organization_id = ${o.id}`);
    await db.delete(users).where(eq(users.email, EMAIL));
    await db.delete(organizations).where(eq(organizations.id, o.id));
  }
  await db.execute(sql`delete from fraud_events where reason like 'prova-pix-tardio%'`);
  await db.execute(sql`delete from fraud_blocks where reason like 'prova-pix-tardio%'`);
  await db.execute(sql`delete from rate_events where bucket like 'order:%' or bucket like 'login:%'`);
}

async function main() {
  console.log("\n=== Pix que chegou tarde ===\n");
  await limpar();
  const [org] = await db.insert(organizations).values({ slug: SLUG, name: "Promotora Pix Tardio" }).returning();
  await db.insert(users).values({ role: "organizer", organizationId: org.id, name: "Org Pix", email: EMAIL, passwordHash: await hashPassword(SENHA) });
  const nova = async (slug: string) => {
    const [c] = await db
      .insert(campaigns)
      .values({
        organizationId: org.id,
        slug,
        title: `Rifa ${slug}`,
        prizeTitle: "Moto",
        totalQuotas: 1000,
        priceCents: 700,
        status: "published",
        publishedAt: new Date(),
        drawAt: new Date(Date.now() + 10 * DIA),
        authorizationCode: "SPA-TARDIO",
        authorizationFileKey: "certificado-teste",
      })
      .returning();
    await db.insert(campaignStats).values({ campaignId: c.id });
    return c;
  };
  const vencida = await nova("pix-tardio-vencida");
  const sorteada = await nova("pix-tardio-sorteada");

  const admin = new Cliente();
  await admin.req("POST", "/api/auth/login", { email: "admin@rifa.br", password: "admin123" });
  const orgC = new Cliente();
  await orgC.req("POST", "/api/auth/login", { email: EMAIL, password: SENHA });

  const comprar = async (campaignId: string, tel: string) => {
    const r = await fetch(`${URL}/api/public/orders`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-device-id": `pix-tardio-${Math.random()}` },
      body: JSON.stringify({ campaignId, quantity: 3, buyer: { name: "Teo Tardio", phone: tel } }),
    });
    const j = (await r.json()) as { code?: number; message?: string };
    if (!j.code) throw new Error(`compra recusada: ${j.message}`);
    const [o] = await db.select().from(orders).where(eq(orders.code, j.code));
    return o;
  };
  const pagar = (code: number) => fetch(`${URL}/api/dev/pay/${code}`, { method: "POST" });
  const casoDo = async (orderId: string) => db.select().from(pixTardios).where(eq(pixTardios.orderId, orderId));

  try {
    // 1. Reserva vencida: o relógio devolveu os números, o Pix chega depois.
    const p1 = await comprar(vencida.id, "11966661001");
    await db.update(orders).set({ status: "expired" }).where(eq(orders.id, p1.id));
    await db.delete(quotaAlloc).where(eq(quotaAlloc.orderId, p1.id));
    let r = await pagar(p1.code);
    checa("Pix de reserva vencida: o pedido não vira pago (409)", r.status === 409, `HTTP ${r.status}`);
    let caso = await casoDo(p1.id);
    checa("entra na fila com o motivo e o valor do pedido", caso.length === 1 && caso[0].motivo === "reserva_vencida" && caso[0].valorCents === p1.amountCents && caso[0].status === "pendente", JSON.stringify(caso[0] ?? null));
    checa("guarda a cobrança e o provedor para devolver", caso[0]?.chargeId === p1.pspChargeId && caso[0]?.provider === p1.pspProvider);
    await pagar(p1.code);
    checa("o webhook repetido não duplica", (await casoDo(p1.id)).length === 1);

    // 2. Depois do sorteio: o quadro está congelado, o Pix não vira cota.
    const p2 = await comprar(sorteada.id, "11966661002");
    await db.insert(draws).values({ campaignId: sorteada.id, seed: "semente-prova", seedHash: "hash-prova", resultNumber: 1, executedAt: new Date() });
    await pagar(p2.code);
    const [depois] = await db.select().from(orders).where(eq(orders.id, p2.id));
    checa("Pix depois do sorteio: o pedido não vira pago", depois.status !== "paid", depois.status);
    caso = await casoDo(p2.id);
    checa("entra na fila como depois do sorteio", caso.length === 1 && caso[0].motivo === "depois_do_sorteio", JSON.stringify(caso[0] ?? null));

    // 3. Quem vê e quem resolve.
    r = await orgC.req("GET", "/api/admin/pix-tardios");
    checa("organizador não vê a fila (403)", r.status === 403, `HTTP ${r.status}`);
    r = await orgC.req("POST", `/api/admin/pix-tardios/${caso[0].id}/resolver`, { observacao: "tentando resolver" });
    checa("organizador não resolve (403)", r.status === 403, `HTTP ${r.status}`);
    r = await admin.req("GET", "/api/admin/pix-tardios");
    const lista = JSON.stringify(r.json);
    checa("a plataforma vê os dois na fila", r.status === 200 && r.json?.abertos?.some((c: any) => c.pedido === p1.code) && r.json?.abertos?.some((c: any) => c.pedido === p2.code), `HTTP ${r.status}`);
    checa("a fila não traz nome nem telefone de quem pagou", !/Teo|1196666/.test(lista));
    r = await admin.req("GET", "/api/admin/caixa-de-entrada");
    checa("a Caixa de entrada mostra o Pix a devolver", JSON.stringify(r.json).includes("pix_tardio") && !/Teo|1196666/.test(JSON.stringify(r.json)), `HTTP ${r.status}`);

    // Provedor de desenvolvimento não devolve pelo sistema: volta a pendente, com o motivo.
    r = await admin.req("POST", `/api/admin/pix-tardios/${caso[0].id}/devolver`);
    caso = await casoDo(p2.id);
    checa("provedor sem devolução: 409 e o caso volta a pendente com o motivo", r.status === 409 && caso[0].status === "pendente" && /por fora/.test(caso[0].erro ?? ""), `HTTP ${r.status} ${caso[0].status}`);
    // Erro depois de chamar o provedor (prazo, rede): pode ter devolvido. O caso
    // fica em devolução — outro clique não devolve de novo —, e fecha por resolver.
    const [p1caso] = await casoDo(p1.id);
    await db.update(pixTardios).set({ status: "devolvendo" }).where(eq(pixTardios.id, p1caso.id));
    r = await admin.req("POST", `/api/admin/pix-tardios/${p1caso.id}/devolver`);
    checa("em devolução, outro clique não devolve (409)", r.status === 409, `HTTP ${r.status}`);
    r = await admin.req("POST", `/api/admin/pix-tardios/${p1caso.id}/resolver`, { observacao: "Conferido no provedor: devolvido" });
    checa("em devolução, fecha por resolver depois de conferir", r.status === 200 && (await casoDo(p1.id))[0].status === "resolvido", `HTTP ${r.status}`);
    r = await admin.req("POST", "/api/admin/pix-tardios/nao-existe/devolver");
    checa("id que não existe: 404", r.status === 404, `HTTP ${r.status}`);

    r = await admin.req("POST", `/api/admin/pix-tardios/${caso[0].id}/resolver`, { observacao: "ok" });
    checa("resolver exige dizer como (400)", r.status === 400, `HTTP ${r.status}`);
    const [a, b] = await Promise.all([
      admin.req("POST", `/api/admin/pix-tardios/${caso[0].id}/resolver`, { observacao: "Devolvido por Pix manual" }),
      admin.req("POST", `/api/admin/pix-tardios/${caso[0].id}/resolver`, { observacao: "Devolvido por Pix manual" }),
    ]);
    checa("dois cliques: uma decisão e um 409", [a.status, b.status].sort().join() === "200,409", `${a.status},${b.status}`);
    caso = await casoDo(p2.id);
    checa("fica resolvido, com a observação", caso[0].status === "resolvido" && caso[0].observacao === "Devolvido por Pix manual" && Boolean(caso[0].resolvidoEm));
    const aud = await db.select().from(auditLog).where(eq(auditLog.entityId, caso[0].id));
    checa("a decisão entra na auditoria", aud.some((x) => x.action === "pix_tardio.resolvido"));
    r = await admin.req("POST", `/api/admin/pix-tardios/${caso[0].id}/devolver`);
    checa("resolvido não se devolve de novo (409)", r.status === 409, `HTTP ${r.status}`);

    // 4. Guarda do antifraude.
    console.log("  — guarda do antifraude");
    const velho = new Date(Date.now() - (GUARDA_DAS_RECUSAS_DIAS + 1) * DIA);
    const recente = new Date(Date.now() - (GUARDA_DAS_RECUSAS_DIAS - 1) * DIA);
    await db.insert(fraudEvents).values([
      { rule: "prova", reason: "prova-pix-tardio-velha", createdAt: velho },
      { rule: "prova", reason: "prova-pix-tardio-recente", createdAt: recente },
    ]);
    await db.insert(fraudBlocks).values([
      { kind: "phone", value: `prova-1-${Date.now()}`, reason: "prova-pix-tardio-vencido", expiresAt: new Date(Date.now() - (GUARDA_DO_BLOQUEIO_VENCIDO_DIAS + 1) * DIA) },
      { kind: "phone", value: `prova-2-${Date.now()}`, reason: "prova-pix-tardio-vencido-ha-pouco", expiresAt: new Date(Date.now() - DIA) },
      { kind: "phone", value: `prova-3-${Date.now()}`, reason: "prova-pix-tardio-sem-prazo", expiresAt: null },
    ]);
    await purgarGuardaDoAntifraude();
    const ev = (await db.execute(sql`select reason from fraud_events where reason like 'prova-pix-tardio%'`)).rows.map((x: any) => x.reason);
    checa(`recusa com mais de ${GUARDA_DAS_RECUSAS_DIAS} dias sai; a mais nova fica`, ev.join() === "prova-pix-tardio-recente", ev.join());
    const bl = (await db.execute(sql`select reason from fraud_blocks where reason like 'prova-pix-tardio%' order by reason`)).rows.map((x: any) => x.reason);
    checa(
      `bloqueio vencido há mais de ${GUARDA_DO_BLOQUEIO_VENCIDO_DIAS} dias sai; o recém-vencido e o sem prazo ficam`,
      bl.join() === "prova-pix-tardio-sem-prazo,prova-pix-tardio-vencido-ha-pouco",
      bl.join(),
    );
  } finally {
    await limpar();
  }
  console.log(falhas ? `\n${falhas} falha(s)` : "\ntudo certo");
  await pool.end();
  process.exit(falhas ? 1 : 0);
}

main().catch(async (e) => {
  console.error(e);
  await pool.end();
  process.exit(1);
});
