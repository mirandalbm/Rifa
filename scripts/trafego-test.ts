/**
 * Prova do tráfego pago (modelo A), pela API de verdade: nasce desligado, só
 * a plataforma configura, decide e lança o gasto; o pedido reserva mídia +
 * taxa no saldo pelo livro (uma vez só, nunca negativo, barrado pela
 * retenção); uma campanha aberta por rifa mesmo ao mesmo tempo; o gasto do
 * dia nunca passa da verba e a taxa nunca passa da reserva; a campanha
 * gasta inteira encerra sozinha; o que sobra volta ao saldo uma vez; a rifa
 * que sai do ar leva a campanha (relógio); o recorte entre organizações (o
 * do vizinho é 404); a venda atribuída pela UTM. Devolve o estado de antes.
 *
 *   npm run trafego      (com `npm run dev` no ar e o seed aplicado)
 */
import "dotenv/config";
import { baseUrl } from "./base-url";
import { eq, sql } from "drizzle-orm";
import { db, pool } from "../server/db";
import { buyers, campaignStats, campaigns, orders, organizations, retencoesCautelares, trafegoCampanhas, users } from "../shared/schema";
import { hashPassword } from "../server/auth";
import { encerrarTrafegoForaDoAr } from "../server/services/trafego";
import { getPlataforma } from "../server/services/settings";
import { codigoDaCampanha } from "../shared/trafego";

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

const PREFIXO = "trafego-teste-";
const VIZINHA = `${PREFIXO}vizinha`;
const EMAIL_VIZINHA = "trafego-vizinha@rifa.teste";
const SENHA_VIZINHA = "trafego-vizinha-123";
const TELEFONE = "11900007711";
const BASE = 200_000;

async function novaRifa(organizationId: string, slug: string, status: "published" | "draft" = "published") {
  const [c] = await db
    .insert(campaigns)
    .values({
      organizationId,
      slug: PREFIXO + slug,
      title: `Rifa ${slug}`,
      prizeTitle: `Prêmio ${slug}`,
      totalQuotas: 1000,
      priceCents: 500,
      status,
      publishedAt: status === "published" ? new Date() : null,
      drawAt: new Date(Date.now() + 10 * 86_400_000),
      authorizationCode: "SPA-TRAFEGO-1",
    })
    .returning();
  await db.insert(campaignStats).values({ campaignId: c.id });
  return c;
}

async function saldoDe(orgId: string) {
  const [o] = await db.select({ s: organizations.patrocinioSaldoCents }).from(organizations).where(eq(organizations.id, orgId));
  return o.s;
}

async function campanha(id: string) {
  const [c] = await db.select().from(trafegoCampanhas).where(eq(trafegoCampanhas.id, id));
  return c;
}

async function limpar() {
  const rifas = sql`(select id from campaigns where slug like ${PREFIXO + "%"})`;
  await db.execute(sql`delete from trafego_campanhas where campaign_id in ${rifas}`);
  await db.execute(sql`delete from orders where campaign_id in ${rifas}`);
  await db.execute(sql`delete from campaign_stats where campaign_id in ${rifas}`);
  await db.execute(sql`delete from campaigns where slug like ${PREFIXO + "%"}`);
  await db.execute(sql`delete from buyers where phone = ${TELEFONE}`);
  await db.execute(sql`delete from retencoes_cautelares where organization_id in (select id from organizations where slug = ${VIZINHA})`);
  await db.execute(sql`delete from patrocinio_lancamentos where organization_id in (select id from organizations where slug = ${VIZINHA})`);
  await db.execute(sql`delete from users where email = ${EMAIL_VIZINHA}`);
  await db.execute(sql`delete from organizations where slug = ${VIZINHA}`);
}

const hoje = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
const amanha = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date(Date.now() + 86_400_000));

async function main() {
  console.log("\n=== tráfego pago ===\n");
  const inicio = new Date();
  const configAntes = (await getPlataforma()).trafegoPago;
  await limpar();

  const admin = new Cliente();
  let r = await admin.req("POST", "/api/auth/login", {
    email: process.env.SEED_ADMIN_EMAIL ?? "admin@rifa.br",
    password: process.env.SEED_ADMIN_PASSWORD ?? "admin123",
  });
  if (r.status !== 200) throw new Error(`login do administrador: HTTP ${r.status}`);
  const marina = new Cliente();
  r = await marina.req("POST", "/api/auth/login", { email: "marina@rifassaojose.br", password: "organizador123" });
  if (r.status !== 200) throw new Error(`login da organizadora: HTTP ${r.status}`);
  const org = (await marina.req("GET", "/api/admin/organizer")).json;
  const orgId: string = org.organizacaoId;
  const saldoAntes = await saldoDe(orgId);
  await db.update(organizations).set({ patrocinioSaldoCents: BASE }).where(eq(organizations.id, orgId));

  const [vizinha] = await db.insert(organizations).values({ slug: VIZINHA, name: "Vizinha do Tráfego", cidade: "Salvador", uf: "BA" }).returning();
  await db.insert(users).values({ role: "organizer", organizationId: vizinha.id, name: "Org Vizinha", email: EMAIL_VIZINHA, passwordHash: await hashPassword(SENHA_VIZINHA) });
  const vizinhaCli = new Cliente();
  r = await vizinhaCli.req("POST", "/api/auth/login", { email: EMAIL_VIZINHA, password: SENHA_VIZINHA });
  if (r.status !== 200) throw new Error(`login da vizinha: HTTP ${r.status}`);

  const rifaA = await novaRifa(orgId, "a");
  const rifaB = await novaRifa(orgId, "b");
  const rifaC = await novaRifa(orgId, "c");
  const rifaD = await novaRifa(orgId, "d");
  const rifaE = await novaRifa(orgId, "e");
  const rifaF = await novaRifa(orgId, "f");
  const rascunho = await novaRifa(orgId, "rascunho", "draft");
  const rifaVizinha = await novaRifa(vizinha.id, "vizinha");

  const pedido = (cli: Cliente, campaignId: string, extra: Record<string, unknown> = {}) =>
    cli.req("POST", "/api/admin/trafego/campanhas", { campaignId, redes: ["google", "meta"], investimentoCents: 20_000, verbaDiaCents: 2_000, ...extra });

  try {
    /* ---------------- desligado ---------------- */
    console.log("  — nasce desligado");
    await admin.req("PUT", "/api/admin/trafego/config", { ...configAntes, ligado: false });
    r = await marina.req("GET", "/api/admin/trafego");
    checa("desligado e sem campanha, a organização não vê o produto (404)", r.status === 404, `HTTP ${r.status}`);
    r = await pedido(marina, rifaA.id);
    checa("desligado, o pedido é 404", r.status === 404, `HTTP ${r.status}`);
    r = await admin.req("GET", "/api/admin/trafego");
    checa("a plataforma vê a tela para poder ligar", r.status === 200 && r.json?.config?.ligado === false, `HTTP ${r.status}`);

    /* ---------------- configuração ---------------- */
    console.log("  — configuração (só a plataforma)");
    r = await marina.req("PUT", "/api/admin/trafego/config", { ligado: true, redes: ["google"] });
    checa("organizador não muda a taxa nem os mínimos (403)", r.status === 403, `HTTP ${r.status}`);
    r = await admin.req("PUT", "/api/admin/trafego/config", { ligado: true, redes: [] });
    checa("ligar sem rede é recusado (400)", r.status === 400, `HTTP ${r.status}`);
    r = await admin.req("PUT", "/api/admin/trafego/config", {
      ligado: true,
      taxaPct: 20,
      investimentoMinCents: 10_000,
      verbaDiaMinCents: 1_000,
      redes: ["google", "meta"],
      golpe: "x",
    });
    checa("a plataforma liga, com taxa e mínimos", r.status === 200 && r.json?.ligado === true && r.json?.taxaPct === 20, `HTTP ${r.status}`);
    checa("…e chave desconhecida não é guardada", r.json && !("golpe" in r.json));

    r = await marina.req("GET", "/api/admin/trafego");
    checa("ligado, a organização vê o próprio saldo", r.status === 200 && r.json?.saldoCents === BASE, `${r.json?.saldoCents}`);

    /* ---------------- pedido ---------------- */
    console.log("  — pedido e reserva");
    r = await pedido(admin, rifaA.id);
    checa("a plataforma não contrata pela organização (403)", r.status === 403, `HTTP ${r.status}`);
    r = await pedido(vizinhaCli, rifaA.id);
    checa("rifa do vizinho é 404", r.status === 404, `HTTP ${r.status}`);
    r = await pedido(marina, rascunho.id);
    checa("rascunho não tem campanha (409)", r.status === 409, `HTTP ${r.status}`);
    r = await pedido(marina, rifaA.id, { redes: ["tiktok"] });
    checa("rede que a plataforma não oferece é recusada (400)", r.status === 400, `HTTP ${r.status} ${r.json?.message ?? ""}`);
    r = await pedido(marina, rifaA.id, { investimentoCents: 9_999 });
    checa("abaixo do investimento mínimo é recusado (400)", r.status === 400, `HTTP ${r.status}`);
    r = await pedido(marina, rifaA.id, { observacao: "me chama no 11 98888-7777" });
    checa("observação com telefone é recusada (400)", r.status === 400, `HTTP ${r.status}`);
    checa("nada foi debitado nas recusas", (await saldoDe(orgId)) === BASE);

    r = await pedido(marina, rifaA.id, { uf: "SP", cidade: "São José dos Campos", observacao: "Público de 25 a 45 anos" });
    const idA = r.json?.id as string;
    checa("pedido aceito (201), com a taxa fotografada", r.status === 201 && r.json?.taxaPct === 20 && r.json?.reservaCents === 24_000, `HTTP ${r.status} ${r.json?.message ?? ""}`);
    checa("reservou mídia + taxa no saldo (R$ 240,00)", (await saldoDe(orgId)) === BASE - 24_000, `${await saldoDe(orgId)}`);
    r = await pedido(marina, rifaA.id);
    checa("segunda campanha aberta na mesma rifa é 409", r.status === 409, `HTTP ${r.status}`);
    checa("…e não debita nada", (await saldoDe(orgId)) === BASE - 24_000);

    const [p1, p2] = await Promise.all([pedido(marina, rifaB.id), pedido(marina, rifaB.id)]);
    const status = [p1.status, p2.status].sort();
    checa("dois pedidos ao mesmo tempo na mesma rifa: um 201 e um 409", status[0] === 201 && status[1] === 409, status.join(","));
    const idB = (p1.status === 201 ? p1 : p2).json?.id as string;
    checa("…e só um debitou", (await saldoDe(orgId)) === BASE - 48_000, `${await saldoDe(orgId)}`);

    await db.update(organizations).set({ patrocinioSaldoCents: 100 }).where(eq(organizations.id, vizinha.id));
    r = await pedido(vizinhaCli, rifaVizinha.id);
    checa("sem saldo, o pedido cai inteiro (409)", r.status === 409, `HTTP ${r.status} ${r.json?.message ?? ""}`);
    const [semSaldo] = await db.select({ n: sql<number>`count(*)::int` }).from(trafegoCampanhas).where(eq(trafegoCampanhas.organizationId, vizinha.id));
    checa("…e nenhuma campanha ficou", semSaldo.n === 0);
    await db.update(organizations).set({ patrocinioSaldoCents: 100_000 }).where(eq(organizations.id, vizinha.id));
    const [ret] = await db.insert(retencoesCautelares).values({ organizationId: vizinha.id, origem: "manual", motivo: "Prova do tráfego pago" }).returning();
    r = await pedido(vizinhaCli, rifaVizinha.id);
    checa("com saldo retido, o pedido é recusado (409)", r.status === 409, `HTTP ${r.status}`);
    checa("…e o saldo retido não sai", (await saldoDe(vizinha.id)) === 100_000);
    await db.delete(retencoesCautelares).where(eq(retencoesCautelares.id, ret.id));

    /* ---------------- recorte ---------------- */
    console.log("  — recorte");
    r = await vizinhaCli.req("GET", "/api/admin/trafego");
    checa("a vizinha sem campanha (e com o produto ligado) vê lista vazia", r.status === 200 && (r.json?.campanhas ?? []).length === 0, `HTTP ${r.status}`);
    r = await vizinhaCli.req("GET", `/api/admin/trafego/campanhas/${idA}/gastos`);
    checa("gastos da campanha do vizinho: 404", r.status === 404, `HTTP ${r.status}`);
    r = await vizinhaCli.req("POST", `/api/admin/trafego/campanhas/${idA}/cancelar`);
    checa("cancelar a campanha do vizinho: 404", r.status === 404, `HTTP ${r.status}`);
    r = await vizinhaCli.req("POST", `/api/admin/trafego/campanhas/${idA}/encerrar`);
    checa("encerrar a campanha do vizinho: 404", r.status === 404, `HTTP ${r.status}`);
    r = await marina.req("POST", "/api/admin/trafego/campanhas/nao-e-id/encerrar");
    checa("id fora do formato: 404", r.status === 404, `HTTP ${r.status}`);
    r = await marina.req("POST", `/api/admin/trafego/campanhas/${idA}/decisao`, { aprovar: true });
    checa("organizador não aprova (403)", r.status === 403, `HTTP ${r.status}`);
    r = await marina.req("POST", `/api/admin/trafego/campanhas/${idA}/gastos`, { dia: hoje(), rede: "google", gastoCents: 100 });
    checa("organizador não lança gasto (403)", r.status === 403, `HTTP ${r.status}`);
    r = await admin.req("POST", `/api/admin/trafego/campanhas/${idA}/cancelar`);
    checa("a plataforma não cancela pela organização: recusa (403)", r.status === 403, `HTTP ${r.status}`);
    r = await marina.req("GET", "/api/admin/trafego");
    const daOrg = (r.json?.campanhas ?? []).find((c: any) => c.id === idA);
    checa("a organização não recebe os links do anúncio nem o nome de quem lançou", daOrg && daOrg.links === undefined && daOrg.organizacao === undefined);
    checa("…nem a margem da plataforma", r.json?.margem === undefined);

    r = await admin.req("GET", "/api/admin/caixa-de-entrada");
    checa("o pedido aparece na Caixa de entrada", (r.json ?? []).some((p: any) => p.chave === `trafego:${idA}` && p.tipo === "trafego"));

    /* ---------------- decisão ---------------- */
    console.log("  — decisão");
    r = await admin.req("POST", `/api/admin/trafego/campanhas/${idB}/decisao`, { aprovar: false, motivo: "curto" });
    checa("recusa sem motivo é recusada (400)", r.status === 400, `HTTP ${r.status}`);
    r = await admin.req("POST", `/api/admin/trafego/campanhas/${idB}/decisao`, { aprovar: false, motivo: "A rifa ainda não tem arte para anúncio." });
    checa("recusada, a reserva inteira volta", r.status === 200 && r.json?.status === "recusada" && r.json?.devolvidoCents === 24_000, `${r.json?.status} ${r.json?.devolvidoCents}`);
    checa("…e o saldo sobe R$ 240,00", (await saldoDe(orgId)) === BASE - 24_000);
    r = await admin.req("POST", `/api/admin/trafego/campanhas/${idB}/decisao`, { aprovar: true });
    checa("decidir de novo é 409", r.status === 409, `HTTP ${r.status}`);

    r = await pedido(marina, rifaC.id, { investimentoCents: 10_000 });
    const idC = r.json?.id as string;
    r = await marina.req("POST", `/api/admin/trafego/campanhas/${idC}/cancelar`);
    checa("a organização cancela o pedido em análise e tudo volta", r.status === 200 && r.json?.status === "cancelada" && (await saldoDe(orgId)) === BASE - 24_000, `${r.json?.status}`);

    const [ap1, ap2] = await Promise.all([
      admin.req("POST", `/api/admin/trafego/campanhas/${idA}/decisao`, { aprovar: true }),
      admin.req("POST", `/api/admin/trafego/campanhas/${idA}/decisao`, { aprovar: true }),
    ]);
    checa("dois cliques em aprovar: um 200 e um 409", [ap1.status, ap2.status].sort().join(",") === "200,409", `${ap1.status},${ap2.status}`);
    checa("aprovada, a campanha fica no ar", (await campanha(idA)).status === "ativa");
    r = await marina.req("POST", `/api/admin/trafego/campanhas/${idA}/cancelar`);
    checa("no ar, não se cancela — se encerra (409)", r.status === 409, `HTTP ${r.status}`);

    // Aprovar com a rifa fora do ar é 409: quem decide recusa e devolve.
    r = await pedido(marina, rifaF.id, { investimentoCents: 10_000 });
    const idF = r.json?.id as string;
    await db.update(campaigns).set({ status: "closed" }).where(eq(campaigns.id, rifaF.id));
    r = await admin.req("POST", `/api/admin/trafego/campanhas/${idF}/decisao`, { aprovar: true });
    checa("aprovar com a rifa fora do ar é 409", r.status === 409, `HTTP ${r.status}`);

    /* ---------------- gasto ---------------- */
    console.log("  — gasto do dia");
    const saldoNoAr = await saldoDe(orgId);
    r = await admin.req("POST", `/api/admin/trafego/campanhas/${idA}/gastos`, { dia: amanha(), rede: "google", gastoCents: 100 });
    checa("dia que ainda não chegou é recusado (400)", r.status === 400, `HTTP ${r.status}`);
    r = await admin.req("POST", `/api/admin/trafego/campanhas/${idA}/gastos`, { dia: hoje(), rede: "tiktok", gastoCents: 100 });
    checa("rede fora da campanha é recusada (400)", r.status === 400, `HTTP ${r.status}`);
    r = await admin.req("POST", `/api/admin/trafego/campanhas/${idA}/gastos`, { dia: hoje(), rede: "google", gastoCents: 5_001 });
    checa("gasto lançado (201), com a taxa para baixo (R$ 10,00)", r.status === 201 && r.json?.gasto?.taxaCents === 1_000, `HTTP ${r.status} ${r.json?.message ?? ""}`);
    checa("o gasto consome a reserva, o saldo não muda", (await saldoDe(orgId)) === saldoNoAr);
    r = await admin.req("POST", `/api/admin/trafego/campanhas/${idA}/gastos`, { dia: hoje(), rede: "google", gastoCents: 10 });
    checa("o mesmo dia na mesma rede de novo é 409", r.status === 409, `HTTP ${r.status}`);
    r = await admin.req("POST", `/api/admin/trafego/campanhas/${idA}/gastos`, { dia: hoje(), rede: "meta", gastoCents: 15_000 });
    checa("passar da verba é 409", r.status === 409, `HTTP ${r.status} ${r.json?.message ?? ""}`);
    r = await admin.req("GET", `/api/admin/trafego/campanhas/${idA}/gastos`);
    checa("a lista de gastos traz o dia lançado", r.status === 200 && r.json?.length === 1 && r.json[0].gastoCents === 5_001);

    // Atribuição: só pedido pago com a UTM da campanha, na mesma rifa.
    const [comprador] = await db.insert(buyers).values({ name: "Comprador Trafego", phone: TELEFONE }).returning();
    const utm = { source: "google", medium: "cpc", campaign: `trafego-${codigoDaCampanha(idA)}` };
    let codigo = 97_400_000;
    const venda = (campaignId: string, status: "paid" | "pending", u: typeof utm | null, cents: number) =>
      db.insert(orders).values({
        code: codigo++,
        campaignId,
        buyerId: comprador.id,
        quantity: 2,
        amountCents: cents,
        status,
        paidAt: status === "paid" ? new Date() : null,
        expiresAt: new Date(Date.now() + 86_400_000),
        utm: u,
      });
    await venda(rifaA.id, "paid", utm, 1_000);
    await venda(rifaA.id, "paid", utm, 2_000);
    await venda(rifaA.id, "pending", utm, 5_000);
    await venda(rifaA.id, "paid", { ...utm, campaign: "outra" }, 7_000);
    await venda(rifaB.id, "paid", utm, 9_000);
    r = await marina.req("GET", "/api/admin/trafego");
    const comVendas = (r.json?.campanhas ?? []).find((c: any) => c.id === idA);
    checa("vendas atribuídas: só as pagas, com a UTM, na rifa da campanha", comVendas?.vendas === 2 && comVendas?.receitaCents === 3_000, `${comVendas?.vendas} ${comVendas?.receitaCents}`);
    checa("custo por venda = (mídia + taxa) ÷ vendas, para baixo", comVendas?.custoPorVendaCents === Math.floor(6_001 / 2), `${comVendas?.custoPorVendaCents}`);
    r = await admin.req("GET", "/api/admin/trafego");
    const daPlataforma = (r.json?.campanhas ?? []).find((c: any) => c.id === idA);
    const link = daPlataforma?.links?.google ? new globalThis.URL(daPlataforma.links.google) : null;
    checa(
      "a plataforma recebe o link do anúncio com a UTM da campanha",
      Boolean(link && link.pathname === `/o/${org.slug}/r/${rifaA.slug}` && link.searchParams.get("utm_campaign") === utm.campaign),
      daPlataforma?.links?.google,
    );

    r = await marina.req("DELETE", `/api/admin/campaigns/${rifaA.id}`);
    checa("rifa com campanha de tráfego não se apaga (422)", r.status === 422, `HTTP ${r.status}`);

    // Gastar o resto da verba encerra sozinho; mídia + taxa = a reserva inteira.
    r = await admin.req("POST", `/api/admin/trafego/campanhas/${idA}/gastos`, { dia: hoje(), rede: "meta", gastoCents: 14_999 });
    checa("o último gasto encerra a campanha", r.status === 201 && r.json?.campanha?.status === "encerrada", `HTTP ${r.status} ${r.json?.campanha?.status}`);
    const fimA = await campanha(idA);
    checa("taxa total nunca passa da reserva (gasto + taxa ≤ R$ 240,00)", fimA.gastoCents + fimA.taxaCents <= fimA.reservaCents, `${fimA.gastoCents}+${fimA.taxaCents}`);
    checa("a sobra do arredondamento volta ao saldo", fimA.devolvidoCents === fimA.reservaCents - fimA.gastoCents - fimA.taxaCents && (await saldoDe(orgId)) === saldoNoAr + fimA.devolvidoCents, `${fimA.devolvidoCents}`);
    r = await admin.req("POST", `/api/admin/trafego/campanhas/${idA}/gastos`, { dia: hoje(), rede: "google", gastoCents: 1 });
    checa("campanha encerrada não recebe gasto (409)", r.status === 409, `HTTP ${r.status}`);

    /* ---------------- encerrar ---------------- */
    console.log("  — encerrar, fechar a conta e relógio");
    r = await pedido(marina, rifaC.id, { investimentoCents: 10_000 });
    const idD = r.json?.id as string;
    await admin.req("POST", `/api/admin/trafego/campanhas/${idD}/decisao`, { aprovar: true });
    await admin.req("POST", `/api/admin/trafego/campanhas/${idD}/gastos`, { dia: hoje(), rede: "google", gastoCents: 3_333 });
    const saldoAntesDeEncerrar = await saldoDe(orgId);
    const [e1, e2] = await Promise.all([
      marina.req("POST", `/api/admin/trafego/campanhas/${idD}/encerrar`),
      marina.req("POST", `/api/admin/trafego/campanhas/${idD}/encerrar`),
    ]);
    checa("dois cliques em encerrar: um 200 e um 409", [e1.status, e2.status].sort().join(",") === "200,409", `${e1.status},${e2.status}`);
    checa("encerrar só para a campanha: fica fechando a conta, nada volta ainda", (await campanha(idD)).status === "encerrando" && (await saldoDe(orgId)) === saldoAntesDeEncerrar);
    r = await pedido(marina, rifaC.id, { investimentoCents: 10_000 });
    checa("fechando a conta, a rifa ainda não aceita outra campanha (409)", r.status === 409, `HTTP ${r.status}`);
    r = await admin.req("POST", `/api/admin/trafego/campanhas/${idD}/gastos`, { dia: hoje(), rede: "meta", gastoCents: 1_000 });
    checa("o último dia que a rede cobrou ainda entra depois de encerrar", r.status === 201, `HTTP ${r.status} ${r.json?.message ?? ""}`);
    r = await admin.req("POST", `/api/admin/trafego/campanhas/${idD}/gastos`, { dia: amanha(), rede: "google", gastoCents: 10 });
    checa("…mas não dia depois da parada (400)", r.status === 400, `HTTP ${r.status}`);
    r = await marina.req("POST", `/api/admin/trafego/campanhas/${idD}/fechar`);
    checa("a organização não fecha a conta (403)", r.status === 403, `HTTP ${r.status}`);
    r = await admin.req("GET", "/api/admin/caixa-de-entrada");
    checa("a conta a fechar aparece na Caixa de entrada", (r.json ?? []).some((p: any) => p.chave === `trafego:${idD}` && /fechamento da conta/.test(p.oQue)));
    const [f1, f2] = await Promise.all([
      admin.req("POST", `/api/admin/trafego/campanhas/${idD}/fechar`),
      admin.req("POST", `/api/admin/trafego/campanhas/${idD}/fechar`),
    ]);
    checa("dois cliques em fechar a conta: um 200 e um 409", [f1.status, f2.status].sort().join(",") === "200,409", `${f1.status},${f2.status}`);
    // Reserva 12.000; gasto 4.333; taxa 666 + 200 → sobra 6.801.
    checa("conta fechada: a sobra (R$ 68,01) volta uma vez", (await campanha(idD)).status === "encerrada" && (await campanha(idD)).devolvidoCents === 6_801 && (await saldoDe(orgId)) === saldoAntesDeEncerrar + 6_801);
    r = await admin.req("POST", `/api/admin/trafego/campanhas/${idD}/gastos`, { dia: hoje(), rede: "google", gastoCents: 1 });
    checa("conta fechada não recebe gasto (409)", r.status === 409, `HTTP ${r.status}`);

    r = await pedido(marina, rifaD.id, { investimentoCents: 10_000 });
    const idE = r.json?.id as string;
    await admin.req("POST", `/api/admin/trafego/campanhas/${idE}/decisao`, { aprovar: true });
    r = await pedido(marina, rifaE.id, { investimentoCents: 10_000 });
    const idG = r.json?.id as string;
    const saldoAntesDoRelogio = await saldoDe(orgId);
    await db.update(campaigns).set({ demonstracao: true }).where(eq(campaigns.id, rifaD.id));
    await db.update(campaigns).set({ travadaEm: new Date() }).where(eq(campaigns.id, rifaE.id));
    const n = await encerrarTrafegoForaDoAr();
    checa("o relógio pega as campanhas das rifas fora do ar (inclusive a que virou teste)", n >= 3, `${n}`);
    checa("no ar: para e fica fechando a conta; em análise: cancelada", (await campanha(idE)).status === "encerrando" && (await campanha(idG)).status === "cancelada" && (await campanha(idF)).status === "cancelada");
    checa("…e só as em análise devolvem na hora (duas reservas)", (await saldoDe(orgId)) === saldoAntesDoRelogio + 2 * 12_000, `${(await saldoDe(orgId)) - saldoAntesDoRelogio}`);
    await encerrarTrafegoForaDoAr();
    checa("o relógio de novo não devolve outra vez", (await saldoDe(orgId)) === saldoAntesDoRelogio + 2 * 12_000);
    r = await admin.req("POST", `/api/admin/trafego/campanhas/${idE}/fechar`);
    checa("a plataforma fecha a conta da parada pelo relógio e a reserva volta", r.status === 200 && (await saldoDe(orgId)) === saldoAntesDoRelogio + 3 * 12_000, `HTTP ${r.status}`);

    /* ---------------- retenção e recorte do conteúdo ---------------- */
    console.log("  — retenção na aprovação e conteúdo da lista");
    r = await pedido(vizinhaCli, rifaVizinha.id, { investimentoCents: 10_000 });
    const idV = r.json?.id as string;
    checa("a vizinha pede a dela", r.status === 201, `HTTP ${r.status} ${r.json?.message ?? ""}`);
    const [ret2] = await db.insert(retencoesCautelares).values({ organizationId: vizinha.id, origem: "manual", motivo: "Prova do tráfego pago" }).returning();
    r = await admin.req("POST", `/api/admin/trafego/campanhas/${idV}/decisao`, { aprovar: true });
    checa("com o saldo retido, aprovar é recusado (409)", r.status === 409, `HTTP ${r.status}`);
    await db.delete(retencoesCautelares).where(eq(retencoesCautelares.id, ret2.id));
    r = await marina.req("GET", "/api/admin/trafego");
    checa("a lista da organização não traz a campanha da vizinha", r.status === 200 && !(r.json?.campanhas ?? []).some((c: any) => c.id === idV));
    r = await vizinhaCli.req("GET", "/api/admin/trafego");
    checa("…e a da vizinha só traz a dela", r.status === 200 && (r.json?.campanhas ?? []).length === 1 && r.json.campanhas[0].id === idV);
    r = await marina.req("POST", `/api/admin/trafego/campanhas/${idV}/cancelar`);
    checa("cancelar a da vizinha: 404", r.status === 404, `HTTP ${r.status}`);
    await vizinhaCli.req("POST", `/api/admin/trafego/campanhas/${idV}/cancelar`);

    /* ---------------- configuração parcial ---------------- */
    r = await admin.req("PUT", "/api/admin/trafego/config", { taxaPct: 25 });
    checa("mandar só a taxa não desliga o produto nem apaga as redes", r.status === 200 && r.json?.ligado === true && r.json?.taxaPct === 25 && r.json?.redes?.length === 2, JSON.stringify(r.json));

    const auditados = await db.execute(sql`select action from audit_log where entity = 'trafego_campanha' and entity_id = ${idD}::text order by created_at`);
    const acoes = (auditados.rows as { action: string }[]).map((x) => x.action);
    checa("cada passo ficou na auditoria (pedido, aprovar, gastos, encerrar, fechar)", ["trafego.pedido", "trafego.aprovar", "trafego.gasto", "trafego.encerrar", "trafego.fechar"].every((a) => acoes.includes(a)), acoes.join(","));

    /* ---------------- desligado com campanha ---------------- */
    // A vizinha volta a não ter campanha nenhuma: desligado, ela não vê o produto.
    await db.delete(trafegoCampanhas).where(eq(trafegoCampanhas.organizationId, vizinha.id));
    await admin.req("PUT", "/api/admin/trafego/config", { ligado: false, taxaPct: 20, investimentoMinCents: 10_000, verbaDiaMinCents: 1_000, redes: ["google", "meta"] });
    r = await marina.req("GET", "/api/admin/trafego");
    checa("desligado, quem tem campanha continua vendo as suas", r.status === 200 && (r.json?.campanhas ?? []).length >= 1, `HTTP ${r.status}`);
    r = await vizinhaCli.req("GET", "/api/admin/trafego");
    checa("…e quem não tem segue sem ver (404)", r.status === 404, `HTTP ${r.status}`);

    /* ---------------- margem e livro ---------------- */
    console.log("  — margem e livro");
    r = await admin.req("GET", "/api/admin/trafego");
    const mes = hoje().slice(0, 7);
    const doMes = (r.json?.margem ?? []).find((m: any) => m.mes === mes);
    const [minhaOrg] = await db.select({ nome: organizations.name }).from(organizations).where(eq(organizations.id, orgId));
    const daMarina = doMes?.organizacoes?.find((o: any) => o.organizacao === minhaOrg.nome);
    checa("a margem do mês traz a taxa cobrada", Boolean(doMes) && doMes.taxaCents >= 1_000 + 2_999 + 866, `${doMes?.taxaCents}`);
    checa("…por organização", Boolean(daMarina) && daMarina.taxaCents >= 1_000 + 2_999 + 866, `${daMarina?.taxaCents}`);
    const livro = await db.execute(sql`select coalesce(sum(valor_cents),0)::int as s from patrocinio_lancamentos where organization_id = ${orgId}::uuid and created_at >= ${inicio.toISOString()}::timestamp and motivo like 'trafego%'`);
    const gastoNoLivro = -(livro.rows[0] as { s: number }).s;
    const debitado = fimA.gastoCents + fimA.taxaCents + 4_333 + 866;
    checa("o livro fecha: reservas − devoluções = mídia + taxa", gastoNoLivro === debitado, `${gastoNoLivro} vs ${debitado}`);
    checa("e o saldo bate com o livro", (await saldoDe(orgId)) === BASE - debitado, `${await saldoDe(orgId)}`);
  } finally {
    await db.execute(sql`delete from patrocinio_lancamentos where organization_id = ${orgId}::uuid and created_at >= ${inicio.toISOString()}::timestamp and motivo like 'trafego%'`);
    await db.update(organizations).set({ patrocinioSaldoCents: saldoAntes }).where(eq(organizations.id, orgId));
    await limpar();
    await admin.req("PUT", "/api/admin/trafego/config", configAntes);
  }

  console.log(falhas === 0 ? "\n  tudo certo\n" : `\n  ${falhas} falha(s)\n`);
  await pool.end();
  process.exit(falhas === 0 ? 0 : 1);
}

main().catch(async (e) => {
  console.error(e);
  await pool.end().catch(() => undefined);
  process.exit(1);
});
