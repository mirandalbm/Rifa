/**
 * Prova da disputa de reembolso, pela API de verdade:
 *
 * - o comprador leva à plataforma o chamado recusado (até 7 dias) ou sem
 *   resposta (depois de 3 dias) — antes disso, 409; motivo curto, 400;
 *   uma disputa por chamado;
 * - com a disputa aberta, não abre outro chamado do mesmo pedido, a
 *   organização não decide mais (409) e a conversa continua dos dois lados;
 * - só a plataforma decide (organização: 403); procedente vira aprovado com
 *   o prazo da organização e a plataforma faz a devolução; improcedente
 *   mantém a recusa e encerra; decidir de novo é 409;
 * - pedido premiado não pode ter disputa procedente;
 * - a organização lê "Plataforma", nunca o nome de quem decidiu;
 * - a decisão fica na auditoria.
 *
 *   npm run disputa      (com `npm run dev` no ar e sem WhatsApp configurado)
 */
import { prazoDoEstornoDoTipo } from "../shared/chamados";
import "dotenv/config";
import { baseUrl } from "./base-url";
import sharp from "sharp";
import { and, eq, sql } from "drizzle-orm";
import { db, pool } from "../server/db";
import { appSettings, auditLog, buyers, campaignStats, campaigns, chamados, orders, organizations, prizedQuotas, users } from "../shared/schema";
import { hashPassword } from "../server/auth";

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

const EMAIL = "disputa-org@teste.rifa";
const SENHA = "senha-disputa-1";
const TEL = "11977771001";
const MOTIVO = "Paguei duas vezes e a organização não conferiu o comprovante do banco.";

async function limpar() {
  const [o] = await db.select().from(organizations).where(eq(organizations.slug, "disputa-org"));
  if (o) {
    await db.execute(sql`delete from chamados where organization_id = ${o.id}`);
    await db.execute(sql`delete from quota_alloc where campaign_id in (select id from campaigns where organization_id = ${o.id})`);
    await db.execute(sql`delete from orders where campaign_id in (select id from campaigns where organization_id = ${o.id})`);
    await db.execute(sql`delete from campaigns where organization_id = ${o.id}`);
    await db.delete(users).where(eq(users.email, EMAIL));
    await db.delete(organizations).where(eq(organizations.id, o.id));
  }
  await db.execute(sql`delete from buyers where phone = ${TEL}`);
  await db.execute(sql`delete from rate_events where bucket like 'chamado%' or bucket like 'login:%' or bucket like 'otp%'`);
}

async function main() {
  console.log("\n=== disputa de reembolso ===\n");
  await limpar();
  const [antes] = await db.select().from(appSettings).where(eq(appSettings.key, "plataforma"));
  const config = { ...((antes?.value as object) ?? {}), estornoManual: true };
  await db
    .insert(appSettings)
    .values({ key: "plataforma", value: config })
    .onConflictDoUpdate({ target: appSettings.key, set: { value: config } });

  const [org] = await db.insert(organizations).values({ slug: "disputa-org", name: "Promotora Disputa", prazoEstornoDias: 5 }).returning();
  await db.insert(users).values({ role: "organizer", organizationId: org.id, name: "Org Disputa", email: EMAIL, passwordHash: await hashPassword(SENHA) });
  const [camp] = await db
    .insert(campaigns)
    .values({
      organizationId: org.id,
      slug: "disputa-rifa",
      title: "Rifa da Disputa",
      prizeTitle: "Moto",
      totalQuotas: 1000,
      priceCents: 500,
      status: "published",
      drawAt: new Date(Date.now() + 10 * 86_400_000),
    })
    .returning();
  await db.insert(campaignStats).values({ campaignId: camp.id, soldCount: 9, revenueCents: 4500 });
  const [eu] = await db.insert(buyers).values({ name: "Clara Disputa", phone: TEL, cpf: "52998224725" }).returning();
  const mk = async (code: number) =>
    (
      await db
        .insert(orders)
        .values({ code, campaignId: camp.id, buyerId: eu.id, quantity: 3, amountCents: 1500, status: "paid", paidAt: new Date(), expiresAt: new Date() })
        .returning()
    )[0];
  const [pa, pb, pc] = [await mk(94000001), await mk(94000002), await mk(94000003)];

  const print =
    "data:image/png;base64," +
    (await sharp({ create: { width: 300, height: 500, channels: 3, background: "#ffffff" } }).png().toBuffer()).toString("base64");
  const pedir = (orderCode: number) => ({ orderCode, motivo: "Comprei duas vezes pelo mesmo Pix", cpf: "529.982.247-25", anexo: print });

  try {
    const c = new Cliente();
    const code = await c.req("POST", "/api/public/my-quotas/request-code", { phone: TEL });
    const v = await c.req("POST", "/api/public/my-quotas/verify", { code: code.json?.devCode });
    checa("comprador entra", v.status === 200, `HTTP ${v.status}`);
    const o = new Cliente();
    await o.req("POST", "/api/auth/login", { email: EMAIL, password: SENHA });
    const adm = new Cliente();
    const la = await adm.req("POST", "/api/auth/login", { email: "admin@rifa.br", password: "admin123" });
    checa("administrador geral entra", la.status === 200, `HTTP ${la.status}`);

    const abrir = async (orderCode: number) => (await c.req("POST", "/api/public/chamados", pedir(orderCode))).json?.id as string;
    const A = await abrir(pa.code);
    const B = await abrir(pb.code);
    const C = await abrir(pc.code);
    checa("três chamados abertos", Boolean(A && B && C));

    // --- A: recusado → disputa → procedente → a plataforma devolve
    let r = await c.req("POST", `/api/public/chamados/${A}/disputa`, { motivo: MOTIVO });
    checa("aberto há pouco: ainda é da organização (409)", r.status === 409 && /3 dias/.test(r.json?.message ?? ""), r.json?.message);
    r = await o.req("POST", `/api/admin/chamados/${A}/concluir`, { decisao: "recusado", resposta: "Não achamos pagamento em dobro." });
    checa("a organização recusa A", r.status === 200, `HTTP ${r.status}`);
    r = await c.req("GET", `/api/public/chamados/${A}`);
    checa("a tela do comprador oferece a disputa", r.json?.podeDisputar === true);
    r = await c.req("POST", `/api/public/chamados/${A}/disputa`, { motivo: "discordo" });
    checa("motivo curto é 400", r.status === 400, `HTTP ${r.status}`);
    r = await c.req("POST", `/api/public/chamados/${A}/disputa`, { motivo: MOTIVO });
    checa("leva A à plataforma", r.status === 201 && r.json?.disputa === "aberta", `HTTP ${r.status} ${r.json?.message ?? ""}`);
    r = await c.req("POST", `/api/public/chamados/${A}/disputa`, { motivo: MOTIVO });
    checa("uma disputa por chamado (409)", r.status === 409, `HTTP ${r.status}`);
    // O limite do dia (3 chamados) já foi usado acima: zera para provar o índice.
    await db.execute(sql`delete from rate_events where bucket like 'chamado%'`);
    r = await c.req("POST", "/api/public/chamados", pedir(pa.code));
    checa("com a disputa aberta, não abre outro chamado do pedido", r.status === 409, `HTTP ${r.status}`);
    r = await c.req("POST", `/api/public/chamados/${A}/mensagens`, { texto: "Segue o extrato de novo." });
    checa("em disputa, o comprador continua escrevendo", r.status === 201, `HTTP ${r.status}`);
    r = await o.req("POST", `/api/admin/chamados/${A}/mensagens`, { texto: "O extrato mostra um pagamento só." });
    checa("em disputa, a organização argumenta", r.status === 201, `HTTP ${r.status}`);

    r = await o.req("POST", `/api/admin/chamados/${A}/disputa/decidir`, { resultado: "procedente", decisao: "A organização não decide aqui." });
    checa("a organização não decide a disputa (403)", r.status === 403, `HTTP ${r.status}`);
    r = await o.req("GET", "/api/admin/chamados?status=disputa");
    checa("a organização vê a disputa na fila dela", r.json?.some?.((x: any) => x.id === A && x.disputa === "aberta"));
    r = await adm.req("GET", "/api/admin/chamados/pendentes");
    checa("o menu da plataforma conta a disputa", (r.json?.disputas ?? 0) >= 1, JSON.stringify(r.json));

    r = await adm.req("POST", `/api/admin/chamados/${A}/disputa/decidir`, { resultado: "procedente", decisao: "curta" });
    checa("decisão sem explicação é 400", r.status === 400, `HTTP ${r.status}`);
    const [x, y] = await Promise.all([
      adm.req("POST", `/api/admin/chamados/${A}/disputa/decidir`, { resultado: "procedente", decisao: "O extrato do banco mostra dois débitos." }),
      adm.req("POST", `/api/admin/chamados/${A}/disputa/decidir`, { resultado: "procedente", decisao: "O extrato do banco mostra dois débitos." }),
    ]);
    checa("dois cliques: uma decisão e um 409", [x.status, y.status].sort().join() === "200,409", `${x.status} ${y.status}`);
    const [ca] = await db.select().from(chamados).where(eq(chamados.id, A));
    {
      checa("procedente: A vira aprovado", ca.status === "aprovado" && ca.disputa === "procedente");
      // 3.6 do advogado: integral em 3 dias úteis; com taxa, o prazo da organização (5 dias).
      const esperado = prazoDoEstornoDoTipo(new Date(), ca.tipoReembolso, 5).getTime();
      const desvio = ca.prazoEstornoAte ? Math.abs(ca.prazoEstornoAte.getTime() - esperado) / 86_400_000 : 99;
      checa(`com o prazo do tipo (${ca.tipoReembolso})`, desvio < 0.01, desvio.toFixed(3));
      r = await c.req("GET", `/api/public/chamados/${A}`);
      const daPlataforma = r.json?.mensagens?.find((m: any) => m.autor === "plataforma");
      checa("o comprador lê 'Plataforma'", daPlataforma?.nome === "Plataforma" && r.json?.disputa === "procedente");
      r = await o.req("GET", `/api/admin/chamados/${A}`);
      const paraOrg = r.json?.mensagens?.find((m: any) => m.autor === "plataforma");
      checa("a organização lê 'Plataforma', não o nome de quem decidiu", paraOrg?.nome === "Plataforma", paraOrg?.nome);
      r = await adm.req("POST", `/api/admin/chamados/${A}/estornar`);
      checa("a plataforma faz a devolução", r.status === 200, `HTTP ${r.status} ${r.json?.message ?? ""}`);
      const [pdA] = await db.select().from(orders).where(eq(orders.id, pa.id));
      checa("pedido A estornado", pdA.status === "refunded", pdA.status);
    }
    const [aud] = await db
      .select()
      .from(auditLog)
      .where(and(eq(auditLog.entityId, A), eq(auditLog.action, "chamado.disputa.procedente")));
    checa("a decisão fica na auditoria", aud?.action?.startsWith("chamado.disputa.") === true, aud?.action);

    // --- B: sem resposta da organização → disputa → improcedente
    await db.update(chamados).set({ createdAt: new Date(Date.now() - 4 * 86_400_000) }).where(eq(chamados.id, B));
    r = await c.req("POST", `/api/public/chamados/${B}/disputa`, { motivo: MOTIVO });
    checa("sem resposta em 3 dias: vai à plataforma", r.status === 201, `HTTP ${r.status} ${r.json?.message ?? ""}`);
    r = await o.req("POST", `/api/admin/chamados/${B}/concluir`, { decisao: "aprovado", resposta: "Aprovado agora." });
    checa("em disputa, a organização não decide mais (409)", r.status === 409, `HTTP ${r.status}`);
    r = await adm.req("POST", `/api/admin/chamados/${B}/disputa/decidir`, { resultado: "improcedente", decisao: "O pagamento em dobro não aparece no extrato." });
    checa("improcedente", r.status === 200 && r.json?.status === "recusado", `HTTP ${r.status}`);
    r = await adm.req("POST", `/api/admin/chamados/${B}/disputa/decidir`, { resultado: "procedente", decisao: "Mudei de ideia depois de decidir." });
    checa("decidir de novo é 409", r.status === 409, `HTTP ${r.status}`);
    r = await c.req("POST", `/api/public/chamados/${B}/mensagens`, { texto: "e agora?" });
    checa("improcedente encerra a conversa", r.status === 409, `HTTP ${r.status}`);
    r = await c.req("POST", `/api/public/chamados/${B}/disputa`, { motivo: MOTIVO });
    checa("não se disputa duas vezes", r.status === 409, `HTTP ${r.status}`);

    // --- C: pedido premiado
    await o.req("POST", `/api/admin/chamados/${C}/concluir`, { decisao: "recusado", resposta: "Pedido premiado não tem reembolso." });
    r = await c.req("POST", `/api/public/chamados/${C}/disputa`, { motivo: MOTIVO });
    checa("leva C à plataforma", r.status === 201, `HTTP ${r.status}`);
    await db.insert(prizedQuotas).values({ campaignId: camp.id, number: 77, prizeLabel: "Fone bluetooth", claimedByOrderId: pc.id, claimedAt: new Date() });
    r = await adm.req("POST", `/api/admin/chamados/${C}/disputa/decidir`, { resultado: "procedente", decisao: "Tentativa de procedente em pedido premiado." });
    checa("pedido premiado não tem disputa procedente (409)", r.status === 409 && /premiado/.test(r.json?.message ?? ""), r.json?.message);

    // --- Prazo e sorteio
    await db.update(chamados).set({ concluidoEm: new Date(Date.now() - 8 * 86_400_000), disputa: null }).where(eq(chamados.id, C));
    r = await c.req("GET", `/api/public/chamados/${C}`);
    checa("recusado há 8 dias: não se contesta mais", r.json?.podeDisputar === false && /7 dias/.test(r.json?.disputaBloqueio ?? ""), r.json?.disputaBloqueio);
    await db.update(chamados).set({ concluidoEm: new Date() }).where(eq(chamados.id, C));
    await db.update(campaigns).set({ drawAt: new Date(Date.now() + 60 * 60 * 1000) }).where(eq(campaigns.id, camp.id));
    r = await c.req("POST", `/api/public/chamados/${C}/disputa`, { motivo: MOTIVO });
    checa("a 1 hora do sorteio: disputa fechada", r.status === 409 && /2 horas/.test(r.json?.message ?? ""), r.json?.message);
  } finally {
    await db.execute(sql`delete from prized_quotas where campaign_id = ${camp.id}`);
    await limpar();
    if (antes) await db.update(appSettings).set({ value: antes.value }).where(eq(appSettings.key, "plataforma"));
    else await db.delete(appSettings).where(eq(appSettings.key, "plataforma"));
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
