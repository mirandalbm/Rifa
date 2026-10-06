/**
 * Prova da guarda da comissão pela plataforma (etapa 12), pela API de verdade:
 *
 * - desligada (padrão), nada muda: a comissão segue a organização;
 * - ligada, a venda online com afiliado nasce marcada, a comissão é guardada
 *   e fica para depois do sorteio mesmo com liberação "na hora";
 * - a organização não vê, não libera e não paga comissão guardada; o saldo
 *   do afiliado mostra "Plataforma" à parte; o saque dela não tem
 *   organização, só a plataforma dá baixa, e o recibo sai em nome dela;
 * - desligar não muda o que já nasceu marcado.
 *
 *   npm run guarda      (com `npm run dev` no ar e o seed aplicado)
 */
import "dotenv/config";
import { baseUrl } from "./base-url";
import { eq, inArray, sql } from "drizzle-orm";
import { db, pool } from "../server/db";
import { hashPassword } from "../server/auth";
import { affiliates, afiliadoVinculos, campaignStats, campaigns, commissions, orders, organizations, recibos, users } from "../shared/schema";
import { NOTA_DE_TESTE, aprovarCadastroComCnpj } from "./saque-de-teste";

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

const SLUG = "guarda-teste";
const EMAILS = ["guarda-org@teste.rifa", "guarda-afiliado@teste.rifa"];
const SENHA = "senha-guarda-1";

async function limpar() {
  const [o] = await db.select().from(organizations).where(eq(organizations.slug, SLUG));
  const [u] = await db.select().from(users).where(eq(users.email, EMAILS[1]));
  const [a] = u ? await db.select().from(affiliates).where(eq(affiliates.userId, u.id)) : [];
  if (a) {
    await db.execute(sql`delete from recibos where affiliate_id = ${a.id}`);
    await db.execute(sql`delete from commissions where affiliate_id = ${a.id}`);
    await db.execute(sql`delete from payouts where affiliate_id = ${a.id}`);
  }
  if (o) {
    await db.execute(sql`delete from quota_alloc where campaign_id in (select id from campaigns where organization_id = ${o.id})`);
    await db.execute(sql`delete from platform_charges where order_id in (select id from orders where campaign_id in (select id from campaigns where organization_id = ${o.id}))`);
    await db.execute(sql`delete from orders where campaign_id in (select id from campaigns where organization_id = ${o.id})`);
    await db.execute(sql`delete from campaigns where organization_id = ${o.id}`);
  }
  if (a) await db.delete(affiliates).where(eq(affiliates.id, a.id));
  await db.delete(users).where(inArray(users.email, EMAILS));
  if (o) await db.delete(organizations).where(eq(organizations.id, o.id));
  await db.execute(sql`delete from buyers where phone like '1196666%'`);
  await db.execute(sql`delete from rate_events where bucket like 'login:%' or bucket like 'order:%'`);
}

let telefone = 11966661000;
async function compra(campaignId: string, codigo: string) {
  const r = await new Cliente().req("POST", "/api/public/orders", {
    campaignId,
    quantity: 1,
    buyer: { name: "Comprador Guarda", phone: String(telefone++) },
    affiliateCode: codigo,
  });
  if (r.status !== 201) throw new Error(`compra: HTTP ${r.status} ${r.json?.message ?? ""}`);
  await fetch(`${URL}/api/dev/pay/${r.json.code}`, { method: "POST" });
  const [o] = await db.select().from(orders).where(eq(orders.code, r.json.code));
  const [k] = await db.select().from(commissions).where(eq(commissions.orderId, o.id));
  return { pedido: o, comissao: k };
}

async function main() {
  console.log("\n=== guarda da comissão pela plataforma ===\n");
  await limpar();
  const admin = await new Cliente().entrar("admin@rifa.br", "admin123");
  const antes = (await admin.req("GET", "/api/admin/plataforma")).json;

  // Organização que escolheu comissão "na hora": é aí que a guarda precisa mandar.
  const [org] = await db.insert(organizations).values({ slug: SLUG, name: "Promotora Guarda", liberacaoComissao: "imediata" }).returning();
  await db.insert(users).values({ role: "organizer", organizationId: org.id, name: "Org Guarda", email: EMAILS[0], passwordHash: await hashPassword(SENHA) });
  const [camp] = await db
    .insert(campaigns)
    .values({
      organizationId: org.id,
      slug: "guarda-rifa",
      title: "Rifa da Guarda",
      prizeTitle: "Moto",
      totalQuotas: 10_000,
      priceCents: 1000,
      commissionPctDefault: 10,
      status: "published",
      publishedAt: new Date(),
      drawAt: new Date(Date.now() + 20 * 86_400_000),
      authorizationCode: "SPA-GUARDA",
      authorizationFileKey: "certificado-teste",
    })
    .returning();
  await db.insert(campaignStats).values({ campaignId: camp.id });
  const [u] = await db.insert(users).values({ role: "affiliate", name: "Afiliado Guarda", email: EMAILS[1], phone: "11966669999", passwordHash: await hashPassword(SENHA) }).returning();
  const [aff] = await db.insert(affiliates).values({ userId: u.id, code: "GUARDATESTE", status: "active", pixKey: "guarda@pix.teste" }).returning();
  await db.insert(afiliadoVinculos).values({ affiliateId: aff.id, organizationId: org.id, status: "aprovado" });

  const orgC = await new Cliente().entrar(EMAILS[0], SENHA);
  const eu = await new Cliente().entrar(EMAILS[1], SENHA);

  try {
    // Desligada: tudo como antes.
    await admin.req("PUT", "/api/admin/plataforma", { ...antes, guardaComissao: false });
    const v1 = await compra(camp.id, aff.code);
    checa("desligada: pedido não é marcado", v1.pedido.comissaoGuardada === false);
    checa("desligada: a liberação na hora da organização vale", v1.comissao?.status === "available" && v1.comissao.guardada === false, v1.comissao?.status);

    // Ligada.
    let r = await admin.req("PUT", "/api/admin/plataforma", { ...antes, guardaComissao: true });
    checa("a plataforma liga a guarda", r.status === 200 && r.json?.guardaComissao === true, `HTTP ${r.status}`);
    r = await admin.req("PUT", "/api/admin/plataforma", { provedorPix: antes.provedorPix, estornoManual: antes.estornoManual });
    checa("salvar sem o campo não desliga", r.json?.guardaComissao === true);
    r = await orgC.req("GET", "/api/admin/comissao");
    checa("a organização é avisada", r.json?.guardaDaPlataforma === true);
    const v2 = await compra(camp.id, aff.code);
    checa("ligada: pedido nasce marcado", v2.pedido.comissaoGuardada === true);
    checa("comissão guardada fica para depois do sorteio, mesmo com 'na hora'", v2.comissao?.guardada === true && v2.comissao.status === "pending", v2.comissao?.status);
    checa("o valor segue o rateio (10% de R$ 10,00)", v2.comissao?.amountCents === 100, String(v2.comissao?.amountCents));

    // Carência vencida: a organização não libera a guardada; a plataforma libera.
    await db.update(commissions).set({ availableAt: new Date(Date.now() - 1000) }).where(eq(commissions.id, v2.comissao.id));
    await orgC.req("POST", "/api/admin/finance/release");
    let [k] = await db.select().from(commissions).where(eq(commissions.id, v2.comissao.id));
    checa("a organização não libera comissão guardada", k.status === "pending", k.status);
    await admin.req("POST", "/api/admin/finance/release");
    [k] = await db.select().from(commissions).where(eq(commissions.id, v2.comissao.id));
    checa("a plataforma libera", k.status === "available", k.status);

    r = await orgC.req("GET", "/api/admin/finance");
    const daOrg = r.json?.perAffiliate?.find((x: any) => x.affiliateId === aff.id);
    checa("o Financeiro da organização não conta a guardada", daOrg?.availableCents === v1.comissao.amountCents, String(daOrg?.availableCents));

    r = await eu.req("GET", "/api/affiliate/saldo");
    const plat = r.json?.find((x: any) => x.organizacaoId === "plataforma");
    const daOrgSaldo = r.json?.find((x: any) => x.organizacaoId === org.id);
    checa("o afiliado vê 'Plataforma' à parte", plat?.organizacao === "Plataforma" && plat.disponivelCents === 100, JSON.stringify(r.json));
    checa("e o saldo da organização continua dela", daOrgSaldo?.disponivelCents === v1.comissao.amountCents);

    await aprovarCadastroComCnpj(aff.id);
    r = await eu.req("POST", "/api/affiliate/payouts", { notaFiscal: NOTA_DE_TESTE });
    checa("com dois saldos, precisa escolher (400)", r.status === 400, `HTTP ${r.status}`);
    r = await eu.req("POST", "/api/affiliate/payouts", { organizacaoId: "plataforma", notaFiscal: NOTA_DE_TESTE });
    checa("saca o da plataforma", r.status === 201 && r.json?.organizationId === null && r.json?.amountCents === 100, `HTTP ${r.status} ${JSON.stringify(r.json)}`);
    const saque = r.json?.id as string;

    r = await orgC.req("GET", "/api/admin/finance");
    checa("a organização não vê o saque da plataforma", !r.json?.payoutsRequested?.some((p: any) => p.id === saque));
    r = await orgC.req("POST", `/api/admin/payouts/${saque}/paid`);
    checa("nem dá baixa (404)", r.status === 404, `HTTP ${r.status}`);
    r = await admin.req("POST", `/api/admin/payouts/${saque}/paid`);
    checa("a plataforma dá baixa, com recibo", r.status === 200 && Boolean(r.json?.recibo), `HTTP ${r.status}`);
    const [rec] = await db.select().from(recibos).where(eq(recibos.payoutId, saque));
    checa("o recibo sai em nome da plataforma", (rec?.snapshot as any)?.pagador?.nome === "Plataforma");

    // Desligar não muda o que já nasceu marcado.
    await admin.req("PUT", "/api/admin/plataforma", { ...antes, guardaComissao: false });
    const v3 = await compra(camp.id, aff.code);
    const [p2] = await db.select().from(orders).where(eq(orders.id, v2.pedido.id));
    checa("desligada de novo: venda nova não é marcada, a antiga continua", v3.pedido.comissaoGuardada === false && p2.comissaoGuardada === true);
  } finally {
    await admin.req("PUT", "/api/admin/plataforma", antes);
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
