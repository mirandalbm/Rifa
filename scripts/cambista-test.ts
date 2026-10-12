/**
 * Prova do cambista e do acerto, pela API de verdade (fase 0 da reformulação:
 * as rotas `/api/seller/*`, `/api/admin/sellers` e `/api/admin/settlements*`
 * não tinham prova que as citasse):
 *
 * - o cambista só vende a rifa da organização dele (a de outra é 404) e só
 *   mexe nas vendas dele (a do colega é 404, nunca 403 — o código existir
 *   já seria informação);
 * - reservar antes de cobrar: a venda nasce pendente e a cota fica presa;
 *   cancelar devolve a cota; confirmar paga; pagar de novo não duplica;
 * - o acerto carimba as vendas: cinco fechamentos ao mesmo tempo dão um
 *   acerto só, e a mesma venda nunca entra em dois;
 * - dar baixa duas vezes é um 409, sem mudar a data da primeira;
 * - o acerto da organização vizinha é 404 (ler, fechar, dar baixa);
 * - cadastrar cambista: repetido é 409, senha fraca 400, e o organizador
 *   não escolhe a organização do cadastro.
 *
 *   npm run cambista      (com `npm run dev` no ar e o seed aplicado)
 */
import "dotenv/config";
import { baseUrl } from "./base-url";
import { eq, inArray, sql } from "drizzle-orm";
import { db, pool } from "../server/db";
import { hashPassword } from "../server/auth";
import { campaignStats, campaigns, orders, organizations, quotaAlloc, settlements, users } from "../shared/schema";

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
  async entrar(email: string, password: string) {
    const r = await this.req("POST", "/api/auth/login", { email, password });
    if (r.status !== 200) throw new Error(`login ${email}: HTTP ${r.status}`);
    return this;
  }
}

const SENHA = "senha-cambista-1";
const SLUGS = ["cambista-a", "cambista-b"];
const EMAILS = [
  "cambista-org-a@teste.rifa",
  "cambista-org-b@teste.rifa",
  "cambista-1@teste.rifa",
  "cambista-2@teste.rifa",
  "cambista-b1@teste.rifa",
];

async function limpar() {
  const orgs = await db.select({ id: organizations.id }).from(organizations).where(inArray(organizations.slug, SLUGS));
  const ids = orgs.map((o) => o.id);
  if (ids.length) {
    const lista = sql.join(ids.map((i) => sql`${i}::uuid`), sql`, `);
    await db.execute(sql`delete from quota_alloc where campaign_id in (select id from campaigns where organization_id in (${lista}))`);
    await db.execute(sql`delete from commissions where order_id in (select id from orders where campaign_id in (select id from campaigns where organization_id in (${lista})))`);
    await db.execute(sql`delete from platform_charges where order_id in (select id from orders where campaign_id in (select id from campaigns where organization_id in (${lista})))`);
    await db.execute(sql`delete from orders where campaign_id in (select id from campaigns where organization_id in (${lista}))`);
    await db.execute(sql`delete from settlements where seller_id in (select a.id from affiliates a join users u on u.id = a.user_id where u.organization_id in (${lista}))`);
    await db.execute(sql`delete from campaigns where organization_id in (${lista})`);
  }
  await db.execute(sql`delete from affiliates where user_id in (select id from users where email = any(${`{${EMAILS.join(",")}}`}::text[]))`);
  await db.delete(users).where(inArray(users.email, EMAILS));
  if (ids.length) await db.delete(organizations).where(inArray(organizations.id, ids));
  await db.execute(sql`delete from buyers where phone like '1197777%'`);
  await db.execute(sql`delete from rate_events where bucket like 'login:%' or bucket like 'order:%'`);
}

async function rifa(orgId: string, slug: string) {
  const [camp] = await db
    .insert(campaigns)
    .values({
      organizationId: orgId,
      slug,
      title: `Rifa ${slug}`,
      prizeTitle: "Moto",
      totalQuotas: 10_000,
      priceCents: 1000,
      commissionPctDefault: 10,
      status: "published",
      publishedAt: new Date(),
      drawAt: new Date(Date.now() + 20 * 86_400_000),
      authorizationCode: "SPA-CAMBISTA",
      authorizationFileKey: "certificado-teste",
    })
    .returning();
  await db.insert(campaignStats).values({ campaignId: camp.id });
  return camp;
}

let telefone = 11977771000;
const comprador = () => ({ name: "Freguês do Cambista", phone: String(telefone++) });

async function main() {
  console.log("\n=== cambista e acerto ===\n");
  await limpar();

  const [orgA] = await db.insert(organizations).values({ slug: SLUGS[0], name: "Promotora A" }).returning();
  const [orgB] = await db.insert(organizations).values({ slug: SLUGS[1], name: "Promotora B" }).returning();
  await db.insert(users).values([
    { role: "organizer", organizationId: orgA.id, name: "Org A", email: EMAILS[0], passwordHash: await hashPassword(SENHA) },
    { role: "organizer", organizationId: orgB.id, name: "Org B", email: EMAILS[1], passwordHash: await hashPassword(SENHA) },
  ]);
  const campA = await rifa(orgA.id, "cambista-rifa-a");
  const campB = await rifa(orgB.id, "cambista-rifa-b");

  const admin = await new Cliente().entrar("admin@rifa.br", "admin123");
  const dA = await new Cliente().entrar(EMAILS[0], SENHA);
  const dB = await new Cliente().entrar(EMAILS[1], SENHA);

  try {
    // ---- cadastro do cambista -------------------------------------------
    let r = await dA.req("POST", "/api/admin/sellers", { name: "Cambista Um", email: EMAILS[2], password: SENHA, code: "CAMBUM", phone: "11977779001" });
    checa("a organização cadastra o cambista (201)", r.status === 201 && r.json?.code === "CAMBUM", `HTTP ${r.status}`);
    r = await dA.req("POST", "/api/admin/sellers", { name: "Cambista Dois", email: EMAILS[3], password: SENHA, code: "CAMBDOIS", organizationId: orgB.id });
    checa("o organizador não escolhe a organização do cadastro", r.status === 201, `HTTP ${r.status}`);
    const [dois] = await db.select().from(users).where(eq(users.email, EMAILS[3]));
    checa("…o cambista nasce na organização da sessão, não na do corpo", dois?.organizationId === orgA.id);
    r = await dA.req("POST", "/api/admin/sellers", { name: "Repetido", email: EMAILS[2], password: SENHA, code: "OUTRO1" });
    checa("e-mail repetido é 409", r.status === 409, `HTTP ${r.status}`);
    r = await dA.req("POST", "/api/admin/sellers", { name: "Repetido", email: "cambista-x@teste.rifa", password: SENHA, code: "CAMBUM" });
    checa("código repetido é 409", r.status === 409, `HTTP ${r.status}`);
    r = await dA.req("POST", "/api/admin/sellers", { name: "Fraco", email: "cambista-y@teste.rifa", password: "123", code: "FRACO1" });
    checa("senha fraca é 400", r.status === 400, `HTTP ${r.status}`);
    r = await dA.req("POST", "/api/admin/sellers", { name: "Sem código", email: "cambista-z@teste.rifa", password: SENHA });
    checa("faltando o código é 400", r.status === 400, `HTTP ${r.status}`);
    r = await dB.req("POST", "/api/admin/sellers", { name: "Cambista B", email: EMAILS[4], password: SENHA, code: "CAMBB1" });
    checa("a vizinha cadastra o dela", r.status === 201, `HTTP ${r.status}`);

    const c1 = await new Cliente().entrar(EMAILS[2], SENHA);
    const c2 = await new Cliente().entrar(EMAILS[3], SENHA);
    const cb = await new Cliente().entrar(EMAILS[4], SENHA);

    // ---- tela de abrir o dia --------------------------------------------
    r = await c1.req("GET", "/api/seller/overview");
    const slugs: string[] = (r.json?.campanhas ?? []).map((c: any) => c.slug);
    checa("o cambista vê só as rifas da organização dele", slugs.includes("cambista-rifa-a") && !slugs.includes("cambista-rifa-b"), slugs.join(","));
    checa("…e o acerto em aberto começa zerado", r.json?.acerto?.orderCount === 0 && r.json?.acerto?.netCents === 0);
    r = await new Cliente().req("GET", "/api/seller/overview");
    checa("sem sessão, 401", r.status === 401, `HTTP ${r.status}`);
    r = await dA.req("GET", "/api/seller/overview");
    checa("o organizador não entra na tela do cambista (403)", r.status === 403, `HTTP ${r.status}`);

    // ---- reservar, cancelar, confirmar ----------------------------------
    r = await c1.req("POST", "/api/seller/sales", { campaignId: campB.id, quantity: 1, buyer: comprador() });
    checa("rifa de outra organização é 404", r.status === 404, `HTTP ${r.status}`);

    const reservadas = async (campanha: string) =>
      Number((await db.execute(sql`select count(*) as n from quota_alloc where campaign_id = ${campanha}::uuid`)).rows[0].n);

    r = await c1.req("POST", "/api/seller/sales", { campaignId: campA.id, quantity: 3, buyer: comprador() });
    checa("reserva 3 cotas (201), com o total do servidor", r.status === 201 && r.json?.numbers?.length === 3 && r.json?.amountCents === 3000, `HTTP ${r.status} ${JSON.stringify(r.json)}`);
    const venda1 = r.json.code as number;
    checa("a cota fica presa antes de cobrar", (await reservadas(campA.id)) === 3);

    r = await c1.req("POST", `/api/seller/sales/${venda1}/cancel`);
    checa("cancelar devolve a venda (200)", r.status === 200 && r.json?.canceled === venda1, `HTTP ${r.status}`);
    checa("…e as cotas voltam na hora", (await reservadas(campA.id)) === 0);
    r = await c1.req("POST", `/api/seller/sales/${venda1}/cancel`);
    checa("cancelar de novo é 409", r.status === 409, `HTTP ${r.status}`);
    r = await c1.req("POST", `/api/seller/sales/${venda1}/confirm`, { method: "dinheiro" });
    checa("confirmar venda cancelada é 409", r.status === 409, `HTTP ${r.status}`);

    r = await c1.req("POST", "/api/seller/sales", { campaignId: campA.id, quantity: 2, buyer: comprador() });
    const venda2 = r.json.code as number;
    r = await c2.req("POST", `/api/seller/sales/${venda2}/confirm`, { method: "dinheiro" });
    checa("o colega não confirma a venda dos outros (404)", r.status === 404, `HTTP ${r.status}`);
    r = await c2.req("POST", `/api/seller/sales/${venda2}/cancel`);
    checa("nem cancela (404)", r.status === 404, `HTTP ${r.status}`);
    r = await cb.req("POST", `/api/seller/sales/${venda2}/confirm`, { method: "dinheiro" });
    checa("o cambista da vizinha também não (404)", r.status === 404, `HTTP ${r.status}`);
    r = await c1.req("POST", `/api/seller/sales/${venda2}/confirm`, { method: "cartao" });
    checa("meio de pagamento desconhecido é 400", r.status === 400, `HTTP ${r.status}`);
    r = await c1.req("POST", `/api/seller/sales/999999999/confirm`, { method: "dinheiro" });
    checa("venda que não existe é 404", r.status === 404, `HTTP ${r.status}`);
    r = await c1.req("POST", `/api/seller/sales/${venda2}/confirm`, { method: "dinheiro" });
    checa("o dono confirma (200, paga, com bilhete)", r.status === 200 && r.json?.status === "paid" && Boolean(r.json?.ticket), `HTTP ${r.status}`);
    r = await c1.req("POST", `/api/seller/sales/${venda2}/confirm`, { method: "dinheiro" });
    checa("confirmar de novo não duplica (200, já paga)", r.status === 200 && r.json?.status === "paid", `HTTP ${r.status}`);
    r = await c1.req("POST", `/api/seller/sales/${venda2}/cancel`);
    checa("cancelar venda paga é 409", r.status === 409, `HTTP ${r.status}`);

    // mais duas vendas pagas, para o acerto ter o que somar
    for (const q of [1, 4]) {
      const s = await c1.req("POST", "/api/seller/sales", { campaignId: campA.id, quantity: q, buyer: comprador() });
      await c1.req("POST", `/api/seller/sales/${s.json.code}/confirm`, { method: q === 1 ? "dinheiro" : "pix_maquininha" });
    }

    r = await c1.req("GET", "/api/seller/sales");
    const minhas: any[] = r.json ?? [];
    checa("a lista traz só as vendas dele (3 pagas e a cancelada)", minhas.length === 4 && minhas.filter((v) => v.status === "paid").length === 3, `${minhas.length}`);
    r = await c2.req("GET", "/api/seller/sales");
    checa("o colega não vê nenhuma", Array.isArray(r.json) && r.json.length === 0);

    r = await c1.req("GET", "/api/seller/settlement");
    const aberto = r.json?.aberto;
    checa("o acerto em aberto soma as 3 vendas pagas", aberto?.orderCount === 3 && aberto?.grossCents === 7000, JSON.stringify(aberto));
    checa("líquido = recolhido − comissão", aberto?.netCents === aberto?.grossCents - aberto?.commissionCents && aberto?.commissionCents > 0, JSON.stringify(aberto));

    // ---- a plataforma e o recorte ---------------------------------------
    r = await dA.req("GET", "/api/admin/settlements");
    const emAbertoA = (r.json?.emAberto ?? []).map((x: any) => x.code);
    checa("a organização vê o em aberto do cambista dela", emAbertoA.includes("CAMBUM"), emAbertoA.join(","));
    r = await dB.req("GET", "/api/admin/settlements");
    const emAbertoB = (r.json?.emAberto ?? []).map((x: any) => x.code);
    checa("a vizinha não vê o cambista da outra", !emAbertoB.includes("CAMBUM"), emAbertoB.join(","));
    const [cambUm] = await db.execute(sql`select a.id from affiliates a where a.code = 'CAMBUM'`).then((x) => x.rows as any[]);
    r = await dB.req("POST", `/api/admin/settlements/${cambUm.id}/close`);
    checa("a vizinha não fecha o acerto do cambista alheio (404)", r.status === 404, `HTTP ${r.status}`);
    r = await c1.req("POST", `/api/admin/settlements/${cambUm.id}/close`);
    checa("o cambista não fecha o próprio acerto (403)", r.status === 403, `HTTP ${r.status}`);

    // ---- fechar: cinco ao mesmo tempo, um acerto só ----------------------
    const rs = await Promise.all(Array.from({ length: 5 }, () => dA.req("POST", `/api/admin/settlements/${cambUm.id}/close`)));
    const criados = rs.filter((x) => x.status === 201);
    const feitos = await db.select().from(settlements).where(eq(settlements.sellerId, cambUm.id));
    checa("cinco fechamentos simultâneos: um 201 e quatro 400", criados.length === 1 && rs.filter((x) => x.status === 400).length === 4, rs.map((x) => x.status).join(","));
    checa("…um acerto só no banco", feitos.length === 1, `${feitos.length}`);
    const acerto = feitos[0];
    checa("o acerto fecha com o que estava em aberto", acerto?.orderCount === 3 && acerto.grossCents === 7000 && acerto.netCents === 7000 - acerto.commissionCents);
    const carimbadas = Number((await db.execute(sql`select count(*) as n from orders where settlement_id = ${acerto.id}::uuid`)).rows[0].n);
    checa("…e as 3 vendas ficam carimbadas", carimbadas === 3, `${carimbadas}`);
    r = await dA.req("POST", `/api/admin/settlements/${cambUm.id}/close`);
    checa("sem venda nova, não há o que fechar (400)", r.status === 400, `HTTP ${r.status}`);
    r = await c1.req("GET", "/api/seller/settlement");
    checa("o em aberto do cambista zera e o histórico ganha o acerto", r.json?.aberto?.orderCount === 0 && r.json?.historico?.length === 1, JSON.stringify(r.json?.aberto));

    // venda nova depois do fechamento entra no acerto seguinte, nunca no anterior
    const nova = await c1.req("POST", "/api/seller/sales", { campaignId: campA.id, quantity: 1, buyer: comprador() });
    await c1.req("POST", `/api/seller/sales/${nova.json.code}/confirm`, { method: "dinheiro" });
    r = await c1.req("GET", "/api/seller/settlement");
    checa("a venda de depois cai no acerto seguinte", r.json?.aberto?.orderCount === 1 && r.json?.aberto?.grossCents === 1000, JSON.stringify(r.json?.aberto));

    // ---- dar baixa -------------------------------------------------------
    r = await dB.req("POST", `/api/admin/settlements/${acerto.id}/paid`);
    checa("a vizinha não dá baixa no acerto alheio (404)", r.status === 404, `HTTP ${r.status}`);
    r = await dA.req("POST", `/api/admin/settlements/${randomUuid()}/paid`);
    checa("acerto que não existe é 404", r.status === 404, `HTTP ${r.status}`);
    r = await dA.req("POST", `/api/admin/settlements/${acerto.id}/paid`);
    checa("a organização dá baixa (200, pago)", r.status === 200 && r.json?.status === "pago", `HTTP ${r.status}`);
    const [pago1] = await db.select().from(settlements).where(eq(settlements.id, acerto.id));
    const rb = await Promise.all([1, 2, 3].map(() => dA.req("POST", `/api/admin/settlements/${acerto.id}/paid`)));
    checa("dar baixa de novo é 409, sem mexer na data", rb.every((x) => x.status === 409), rb.map((x) => x.status).join(","));
    const [pago2] = await db.select().from(settlements).where(eq(settlements.id, acerto.id));
    checa("…a data da primeira baixa fica", pago1.settledAt?.getTime() === pago2.settledAt?.getTime());

    // a plataforma enxerga os dois lados
    r = await admin.req("GET", "/api/admin/settlements");
    const todos = (r.json?.historico ?? []).map((h: any) => h.sellerCode ?? h.settlement?.sellerId);
    checa("a plataforma vê o acerto do cambista", JSON.stringify(r.json?.historico ?? []).includes(acerto.id));
    void todos;

    const resto = await db.select({ id: quotaAlloc.number }).from(quotaAlloc).where(eq(quotaAlloc.campaignId, campB.id));
    checa("nada foi reservado na rifa da vizinha", resto.length === 0);
    const ped = await db.select({ id: orders.id }).from(orders).where(eq(orders.campaignId, campB.id));
    checa("…nem pedido gravado nela", ped.length === 0);
  } finally {
    await limpar();
  }
  console.log(falhas ? `\n${falhas} falha(s)` : "\ntudo certo");
  await pool.end();
  process.exit(falhas ? 1 : 0);
}

function randomUuid() {
  return "00000000-0000-4000-8000-000000000000";
}

main().catch(async (e) => {
  console.error(e);
  await limpar().catch(() => {});
  await pool.end();
  process.exit(1);
});
