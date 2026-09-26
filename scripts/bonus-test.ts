/**
 * Prova do programa de bônus (etapa 13), pela API de verdade:
 *
 * - desligado (padrão), não existe para o apostador; só a plataforma liga
 *   (organizador: 403), e ligar não mexe no resto da configuração;
 * - visita nova pelo link conta uma vez por aparelho; meta alcançada credita
 *   uma vez;
 * - a primeira compra paga do indicado credita quem indicou (webhook
 *   repetido não dobra); autoindicação não conta;
 * - resgate só em rifa cujo regulamento prevê cota de bônus, com saldo, e
 *   pelo caminho de reserva de sempre: pedido de R$ 0,00, cotas pagas, sem
 *   comissão; cota de bônus não tem reembolso;
 * - estornar a compra que confirmou a indicação tira o bônus;
 * - a marcação da rifa trava ao publicar e entra no regulamento.
 *
 *   npm run bonus      (com `npm run dev` no ar e sem WhatsApp configurado)
 */
import "dotenv/config";
import { baseUrl } from "./base-url";
import sharp from "sharp";
import { and, eq, inArray, sql } from "drizzle-orm";
import { db, pool } from "../server/db";
import { hashPassword } from "../server/auth";
import { refundOrder } from "../server/services/orders";
import { appSettings, buyers, campaignStats, campaigns, commissions, indicacoes, orders, organizations, quotaAlloc, users } from "../shared/schema";

const URL = baseUrl();
let falhas = 0;
const checa = (n: string, ok: boolean, d = "") => {
  console.log(`  ${ok ? "✓" : "✗"} ${n}${d ? ` (${d})` : ""}`);
  if (!ok) falhas++;
};

class Cliente {
  cookie = "";
  constructor(readonly aparelho?: string) {}
  async req(metodo: string, caminho: string, corpo?: unknown) {
    const r = await fetch(URL + caminho, {
      method: metodo,
      headers: {
        "Content-Type": "application/json",
        ...(this.cookie ? { Cookie: this.cookie } : {}),
        ...(this.aparelho ? { "x-device-id": this.aparelho } : {}),
      },
      body: corpo === undefined ? undefined : JSON.stringify(corpo),
    });
    const sc = r.headers.get("set-cookie");
    if (sc) this.cookie = sc.split(";")[0];
    const tipo = r.headers.get("content-type") ?? "";
    return { status: r.status, json: tipo.includes("json") ? await r.json() : null };
  }
  async entrarComprador(phone: string) {
    const code = await this.req("POST", "/api/public/my-quotas/request-code", { phone });
    const v = await this.req("POST", "/api/public/my-quotas/verify", { code: code.json?.devCode });
    if (v.status !== 200) throw new Error(`login do comprador ${phone}: HTTP ${v.status}`);
    return this;
  }
}

const SLUG = "bonus-teste";
const EMAIL = "bonus-org@teste.rifa";
const SENHA = "senha-bonus-1";
const TEL = { indicador: "11955551001", indicado: "11955551002" };

async function limpar() {
  const [o] = await db.select().from(organizations).where(eq(organizations.slug, SLUG));
  const bs = await db.select({ id: buyers.id }).from(buyers).where(sql`${buyers.phone} like '1195555%'`);
  const ids = bs.map((b) => b.id);
  if (ids.length) {
    const lista = sql.raw(`('${ids.join("','")}')`);
    await db.execute(sql`delete from bonus_lancamentos where buyer_id in ${lista}`);
    await db.execute(sql`delete from indicacoes where indicador_id in ${lista} or indicado_id in ${lista}`);
    await db.execute(sql`delete from bonus_visitas where indicador_id in ${lista}`);
    await db.execute(sql`delete from chamados where buyer_id in ${lista}`);
  }
  await db.execute(sql`delete from bonus_metas where titulo like 'Teste bônus%'`);
  if (o) {
    await db.execute(sql`delete from quota_alloc where campaign_id in (select id from campaigns where organization_id = ${o.id})`);
    await db.execute(sql`delete from platform_charges where order_id in (select id from orders where campaign_id in (select id from campaigns where organization_id = ${o.id}))`);
    await db.execute(sql`delete from orders where campaign_id in (select id from campaigns where organization_id = ${o.id})`);
    await db.execute(sql`delete from campaigns where organization_id = ${o.id}`);
    await db.delete(users).where(eq(users.email, EMAIL));
    await db.delete(organizations).where(eq(organizations.id, o.id));
  }
  if (ids.length) await db.delete(buyers).where(inArray(buyers.id, ids));
  await db.execute(sql`delete from rate_events where bucket like 'otp%' or bucket like 'order:%' or bucket like 'bonus-%' or bucket like 'chamado%' or bucket like 'login:%'`);
}

async function saldo(phone: string) {
  const [b] = await db.select({ s: buyers.bonusSaldo }).from(buyers).where(eq(buyers.phone, phone));
  return b?.s ?? 0;
}

async function main() {
  console.log("\n=== programa de bônus ===\n");
  await limpar();
  const [antes] = await db.select().from(appSettings).where(eq(appSettings.key, "plataforma"));

  const [org] = await db.insert(organizations).values({ slug: SLUG, name: "Promotora Bônus" }).returning();
  await db.insert(users).values({ role: "organizer", organizationId: org.id, name: "Org Bônus", email: EMAIL, passwordHash: await hashPassword(SENHA) });
  const nova = async (slug: string, aceita: boolean) => {
    const [c] = await db
      .insert(campaigns)
      .values({
        organizationId: org.id,
        slug,
        title: `Rifa ${slug}`,
        prizeTitle: "Moto",
        totalQuotas: 1000,
        priceCents: 500,
        status: "published",
        publishedAt: new Date(),
        drawAt: new Date(Date.now() + 10 * 86_400_000),
        authorizationCode: "SPA-BONUS",
        authorizationFileKey: "certificado-teste",
        aceitaCotaBonus: aceita,
      })
      .returning();
    await db.insert(campaignStats).values({ campaignId: c.id });
    return c;
  };
  const aceita = await nova("bonus-aceita", true);
  const naoAceita = await nova("bonus-nao-aceita", false);

  const admin = new Cliente();
  await admin.req("POST", "/api/auth/login", { email: "admin@rifa.br", password: "admin123" });
  const orgC = new Cliente();
  await orgC.req("POST", "/api/auth/login", { email: EMAIL, password: SENHA });

  try {
    // O indicador precisa existir como comprador (primeira compra dele).
    await db.insert(buyers).values({ name: "Ana Indica", phone: TEL.indicador, cpf: "52998224725" });
    const ana = await new Cliente("aparelho-ana").entrarComprador(TEL.indicador);

    await admin.req("PUT", "/api/admin/bonus/config", { bonusLigado: false });
    let r = await ana.req("GET", "/api/public/bonus");
    checa("desligado: o apostador não vê o programa", r.json?.ligado === false);

    r = await orgC.req("PUT", "/api/admin/bonus/config", { bonusLigado: true });
    checa("organizador não liga (403)", r.status === 403, `HTTP ${r.status}`);
    const cfgAntes = (await admin.req("GET", "/api/admin/plataforma")).json;
    r = await admin.req("PUT", "/api/admin/bonus/config", { bonusLigado: true, bonusPorIndicacao: 2 });
    checa("a plataforma liga", r.status === 200 && r.json?.bonusLigado === true && r.json?.bonusPorIndicacao === 2, `HTTP ${r.status}`);
    const cfgDepois = (await admin.req("GET", "/api/admin/plataforma")).json;
    checa("ligar o bônus não mexe no resto", cfgDepois.estornoManual === cfgAntes.estornoManual && cfgDepois.taxaReembolsoPct === cfgAntes.taxaReembolsoPct && cfgDepois.guardaComissao === cfgAntes.guardaComissao);
    r = await admin.req("PUT", "/api/admin/plataforma", { provedorPix: cfgAntes.provedorPix, estornoManual: true });
    checa("salvar Pagamentos não desliga o bônus", r.json?.bonusLigado === true);

    r = await admin.req("POST", "/api/admin/bonus/metas", { titulo: "Teste bônus visitas", tipo: "visitas", alvo: 2, recompensa: 1 });
    checa("a plataforma cria meta", r.status === 201, `HTTP ${r.status} ${r.json?.message ?? ""}`);
    r = await admin.req("POST", "/api/admin/bonus/metas", { titulo: "x", tipo: "visitas", alvo: 2, recompensa: 1 });
    checa("meta inválida é 400", r.status === 400);

    r = await ana.req("GET", "/api/public/bonus");
    const codigo = r.json?.codigo as string;
    checa("ligado: link de indicação e saldo zero", r.json?.ligado === true && /^[2-9A-HJKMNP-Z]{8}$/.test(codigo ?? "") && r.json?.saldo === 0, codigo);
    checa("só as rifas que aceitam aparecem para resgate", r.json?.rifas?.some((x: any) => x.id === aceita.id) && !r.json?.rifas?.some((x: any) => x.id === naoAceita.id));

    // Visitas: uma por aparelho; a meta (2 visitas) credita uma vez.
    await new Cliente("visitante-1").req("POST", "/api/public/bonus/visita", { codigo });
    await new Cliente("visitante-1").req("POST", "/api/public/bonus/visita", { codigo });
    checa("o mesmo aparelho conta uma vez", (await saldo(TEL.indicador)) === 0);
    r = await new Cliente("visitante-2").req("POST", "/api/public/bonus/visita", { codigo: "ZZZZZZZZ" });
    checa("código desconhecido responde igual (204)", r.status === 204);
    await new Cliente("visitante-2").req("POST", "/api/public/bonus/visita", { codigo });
    checa("duas visitas novas: a meta credita 1 cota", (await saldo(TEL.indicador)) === 1, String(await saldo(TEL.indicador)));
    await new Cliente("visitante-3").req("POST", "/api/public/bonus/visita", { codigo });
    checa("a meta não credita de novo", (await saldo(TEL.indicador)) === 1);

    // Indicação: a primeira compra paga do indicado.
    r = await new Cliente("aparelho-bia").req("POST", "/api/public/orders", {
      campaignId: naoAceita.id,
      quantity: 2,
      buyer: { name: "Bia Indicada", phone: TEL.indicado },
      indicacao: codigo,
    });
    checa("o indicado compra pelo link", r.status === 201, `HTTP ${r.status} ${r.json?.message ?? ""}`);
    const codigoPedido = r.json?.code;
    const [bia] = await db.select().from(buyers).where(eq(buyers.phone, TEL.indicado));
    let [ind] = await db.select().from(indicacoes).where(eq(indicacoes.indicadoId, bia.id));
    checa("a indicação fica pendente até o pagamento", ind?.status === "pendente" && (await saldo(TEL.indicador)) === 1);
    await fetch(`${URL}/api/dev/pay/${codigoPedido}`, { method: "POST" });
    await fetch(`${URL}/api/dev/pay/${codigoPedido}`, { method: "POST" });
    [ind] = await db.select().from(indicacoes).where(eq(indicacoes.indicadoId, bia.id));
    checa("pago: indicação confirmada, +2 cotas (webhook repetido não dobra)", ind?.status === "confirmada" && (await saldo(TEL.indicador)) === 3, String(await saldo(TEL.indicador)));

    // Autoindicação: a Ana comprando pelo próprio link.
    r = await new Cliente("aparelho-ana").req("POST", "/api/public/orders", {
      campaignId: naoAceita.id,
      quantity: 1,
      buyer: { name: "Ana Indica", phone: TEL.indicador },
      indicacao: codigo,
    });
    const [propria] = await db.select().from(indicacoes).where(eq(indicacoes.indicadoId, (await db.select().from(buyers).where(eq(buyers.phone, TEL.indicador)))[0].id));
    checa("autoindicação não conta", r.status === 201 && !propria);

    // Resgate.
    r = await ana.req("POST", "/api/public/bonus/resgatar", { campaignId: naoAceita.id, quantidade: 1 });
    checa("rifa que o regulamento não prevê: 409", r.status === 409 && /regulamento/.test(r.json?.message ?? ""), r.json?.message);
    r = await ana.req("POST", "/api/public/bonus/resgatar", { campaignId: aceita.id, quantidade: 5 });
    checa("saldo insuficiente: 409", r.status === 409 && /insuficiente/.test(r.json?.message ?? ""), r.json?.message);
    const [statsAntes] = await db.select().from(campaignStats).where(eq(campaignStats.campaignId, aceita.id));
    r = await ana.req("POST", "/api/public/bonus/resgatar", { campaignId: aceita.id, quantidade: 2 });
    checa("resgata 2 cotas", r.status === 201 && r.json?.numbers?.length === 2, `HTTP ${r.status} ${r.json?.message ?? ""}`);
    const [pb] = await db.select().from(orders).where(eq(orders.code, r.json?.code));
    checa("pedido de bônus: R$ 0,00, pago", pb?.method === "bonus" && pb.amountCents === 0 && pb.status === "paid");
    const cotas = await db.select().from(quotaAlloc).where(and(eq(quotaAlloc.orderId, pb.id), eq(quotaAlloc.status, "paid")));
    const [statsDepois] = await db.select().from(campaignStats).where(eq(campaignStats.campaignId, aceita.id));
    checa("as cotas entram pelo caminho de sempre, e o contador anda", cotas.length === 2 && statsDepois.soldCount === statsAntes.soldCount + 2);
    const semComissao = await db.select().from(commissions).where(eq(commissions.orderId, pb.id));
    checa("sem comissão", semComissao.length === 0);
    checa("o saldo desce", (await saldo(TEL.indicador)) === 1);

    // Cota de bônus não tem reembolso.
    const print = "data:image/png;base64," + (await sharp({ create: { width: 200, height: 300, channels: 3, background: "#fff" } }).png().toBuffer()).toString("base64");
    r = await ana.req("POST", "/api/public/chamados", { orderCode: pb.code, motivo: "Quero o dinheiro da cota grátis", cpf: "529.982.247-25", anexo: print });
    checa("cota de bônus não tem reembolso (409)", r.status === 409 && /bônus/.test(r.json?.message ?? ""), r.json?.message);

    // Estorno da compra que confirmou a indicação tira o bônus.
    const [pedidoBia] = await db.select().from(orders).where(eq(orders.code, codigoPedido));
    await refundOrder(pedidoBia.id);
    [ind] = await db.select().from(indicacoes).where(eq(indicacoes.indicadoId, bia.id));
    checa("estorno: indicação estornada e as 2 cotas saem (saldo pode ficar negativo)", ind?.status === "estornada" && (await saldo(TEL.indicador)) === -1, String(await saldo(TEL.indicador)));
    r = await ana.req("POST", "/api/public/bonus/resgatar", { campaignId: aceita.id, quantidade: 1 });
    checa("com saldo negativo, não resgata", r.status === 409);

    // A marcação trava ao publicar e entra no regulamento.
    r = await orgC.req("PUT", `/api/admin/campaigns/${aceita.id}/legal`, { aceitaCotaBonus: false });
    checa("rifa publicada não muda a marcação", r.status >= 400, `HTTP ${r.status}`);
    r = await new Cliente().req("GET", `/api/public/campaigns/${aceita.slug}/regulamento`);
    const reg = JSON.stringify(r.json ?? "");
    checa("o regulamento da rifa traz a cláusula", /cotas de bônus/.test(reg), `HTTP ${r.status}`);

    // Desligado: nada se resgata e nada acumula.
    await admin.req("PUT", "/api/admin/bonus/config", { bonusLigado: false });
    await db.update(buyers).set({ bonusSaldo: 5 }).where(eq(buyers.phone, TEL.indicador));
    r = await ana.req("POST", "/api/public/bonus/resgatar", { campaignId: aceita.id, quantidade: 1 });
    checa("desligado: resgate 409", r.status === 409 && /não está ativo/.test(r.json?.message ?? ""), r.json?.message);
    await new Cliente("visitante-9").req("POST", "/api/public/bonus/visita", { codigo });
    const [{ n }] = (await db.execute(sql`select count(*)::int as n from bonus_visitas where aparelho_hash is not null and indicador_id = (select id from buyers where phone = ${TEL.indicador})`)).rows as { n: number }[];
    checa("desligado: visita não conta", Number(n) === 3, String(n));
  } finally {
    if (antes) await db.update(appSettings).set({ value: antes.value }).where(eq(appSettings.key, "plataforma"));
    else await db.delete(appSettings).where(eq(appSettings.key, "plataforma"));
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
