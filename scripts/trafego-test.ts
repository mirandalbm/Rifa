/**
 * Prova do tráfego pago (modelo A), pela API de verdade: nasce desligado, só
 * a plataforma configura, decide e lança o gasto; o pedido reserva mídia +
 * taxa no saldo pelo livro (uma vez só, nunca negativo, barrado pela
 * retenção); uma campanha aberta por rifa mesmo ao mesmo tempo; o gasto do
 * dia nunca passa da verba e a taxa nunca passa da reserva; a campanha
 * gasta inteira encerra sozinha; o que sobra volta ao saldo uma vez; a rifa
 * que sai do ar leva a campanha (relógio); o recorte entre organizações (o
 * do vizinho é 404); a venda atribuída pela UTM; e a fase 2, o gasto
 * importado das redes por um Windsor.ai de mentira que a prova sobe (só a
 * plataforma importa; dia fechado, campanha pelo código no nome, a mesma régua
 * do manual, uma vez só mesmo com dois cliques, o excedente da rede nunca
 * cobrado da organização, a chave nunca na resposta). Devolve o estado de antes.
 *
 * A taxa de gestão é cobrada INTEIRA na aprovação e nunca volta (decisão de
 * 09/10/2026): o pedido exige o aceite do texto (422 sem ele, nada debitado) e
 * grava quando, a versão e a impressão do texto; aprovar fixa a taxa inteira
 * sem mexer no saldo; o gasto do dia não cobra taxa de novo; encerrar sem
 * gastar devolve só a mídia, como crédito; recusar e cancelar em análise
 * devolvem tudo; a margem põe a taxa no mês da aprovação; a campanha sem a
 * marca da cobrança (legado) segue com a taxa diária.
 *
 *   WINDSOR_API_KEY=… WINDSOR_API_URL=http://127.0.0.1:5097 npm run dev   (noutro terminal, com o seed)
 *   WINDSOR_API_KEY=<a mesma> WINDSOR_API_URL=<o mesmo> npm run trafego
 */
import "dotenv/config";
import http from "node:http";
import { baseUrl } from "./base-url";
import { eq, sql } from "drizzle-orm";
import { db, pool } from "../server/db";
import { buyers, campaignStats, campaigns, orders, organizations, retencoesCautelares, trafegoCampanhas, users } from "../shared/schema";
import { hashPassword } from "../server/auth";
import { encerrarTrafegoForaDoAr } from "../server/services/trafego";
import { importarGastosDoRelogio } from "../server/services/trafegoImportacao";
import { getPlataforma } from "../server/services/settings";
import { hashDoContrato } from "../server/services/contratoPromotora";
import { ACEITE_DA_TAXA_VERSAO, codigoDaCampanha, janelaDaImportacao, textoDoAceiteDaTaxa } from "../shared/trafego";

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

/* ---------------- o Windsor.ai de mentira (fase 2) ---------------- */

const CHAVE_WINDSOR = process.env.WINDSOR_API_KEY?.trim() ?? "";
const URL_WINDSOR = process.env.WINDSOR_API_URL?.trim() ?? "";
let linhasDoWindsor: unknown[] = [];
let windsorRecusa = false;
const pedidosAoWindsor: URLSearchParams[] = [];

function subirWindsor(): Promise<http.Server> {
  const servidor = http.createServer((req, res) => {
    const u = new globalThis.URL(req.url ?? "/", "http://x");
    pedidosAoWindsor.push(u.searchParams);
    res.setHeader("Content-Type", "application/json");
    if (windsorRecusa || u.searchParams.get("api_key") !== CHAVE_WINDSOR) {
      res.statusCode = 401;
      return res.end(JSON.stringify({ error: "invalid api key" }));
    }
    res.end(JSON.stringify({ data: linhasDoWindsor }));
  });
  return new Promise((ok) => servidor.listen(Number(new globalThis.URL(URL_WINDSOR).port), "127.0.0.1", () => ok(servidor)));
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
    cli.req("POST", "/api/admin/trafego/campanhas", { campaignId, redes: ["google", "meta"], investimentoCents: 20_000, verbaDiaCents: 2_000, aceiteTaxa: true, ...extra });

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

    // Pacotes de investimento: vitrine conferida a sério, guardada em ordem, e a organização a recebe.
    r = await marina.req("PUT", "/api/admin/trafego/config", { pacotesCents: [5_000] });
    checa("organizador não muda os pacotes (403)", r.status === 403, `HTTP ${r.status}`);
    for (const [nome, pacotes] of [
      ["pacote abaixo do mínimo", [5_000, 10_000]],
      ["pacote repetido", [10_000, 10_000]],
      ["pacote com centavo quebrado", [10_000.5]],
      ["pacote acima do teto", [99_999_999]],
      ["mais de oito pacotes", [10_000, 11_000, 12_000, 13_000, 14_000, 15_000, 16_000, 17_000, 18_000]],
      ["pacotes que não são lista", "10000"],
      ["pacote que não é número", ["abc"]],
    ] as [string, unknown][]) {
      r = await admin.req("PUT", "/api/admin/trafego/config", { pacotesCents: pacotes });
      checa(`${nome} é recusado (400)`, r.status === 400, `HTTP ${r.status}`);
    }
    r = await admin.req("PUT", "/api/admin/trafego/config", { pacotesCents: [50_000, 10_000, 25_000] });
    checa("os pacotes entram em ordem crescente", r.status === 200 && JSON.stringify(r.json?.pacotesCents) === JSON.stringify([10_000, 25_000, 50_000]), JSON.stringify(r.json));
    r = await marina.req("GET", "/api/admin/trafego");
    checa("a organização recebe os pacotes na tabela", JSON.stringify(r.json?.config?.pacotesCents) === JSON.stringify([10_000, 25_000, 50_000]), JSON.stringify(r.json?.config));
    r = await admin.req("PUT", "/api/admin/trafego/config", { investimentoMinCents: 20_000 });
    checa("subir o mínimo sem mandar pacotes tira os que ficaram abaixo (sem 400)", r.status === 200 && JSON.stringify(r.json?.pacotesCents) === JSON.stringify([25_000, 50_000]), JSON.stringify(r.json));
    r = await admin.req("PUT", "/api/admin/trafego/config", { investimentoMinCents: 10_000, pacotesCents: [10_000, 25_000, 50_000] });
    checa("…e a plataforma volta o mínimo e os pacotes", r.status === 200 && r.json?.investimentoMinCents === 10_000, JSON.stringify(r.json));
    r = await pedido(marina, rifaA.id, { investimentoCents: 17_300 });
    checa("o pedido aceita outro valor que não é pacote (a partir do mínimo)", r.status === 201 && r.json?.reservaCents === 20_760, `HTTP ${r.status} ${r.json?.message ?? ""}`);
    if (r.json?.id) await marina.req("POST", `/api/admin/trafego/campanhas/${r.json.id}/cancelar`);

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
    // O aceite da taxa: 422, depois do erro de preenchimento e antes de reservar ou gravar qualquer coisa.
    const contaDaA = async () => (await db.select({ n: sql<number>`count(*)::int` }).from(trafegoCampanhas).where(eq(trafegoCampanhas.campaignId, rifaA.id)))[0].n;
    const campanhasDaAAntes = await contaDaA();
    for (const [nome, valor] of [
      ["ausente", undefined],
      ["false", false],
      ["'true' em texto", "true"],
      ["1", 1],
    ] as [string, unknown][]) {
      r = await pedido(marina, rifaA.id, { aceiteTaxa: valor });
      checa(`aceite da taxa ${nome}: o pedido é recusado (422)`, r.status === 422, `HTTP ${r.status} ${r.json?.message ?? ""}`);
    }
    r = await pedido(marina, rifaA.id, { investimentoCents: 9_999, aceiteTaxa: undefined });
    checa("o erro de preenchimento vem antes do aceite (400)", r.status === 400, `HTTP ${r.status}`);
    r = await pedido(vizinhaCli, rifaA.id, { aceiteTaxa: undefined });
    checa("…e a rifa do vizinho segue 404 mesmo sem o aceite", r.status === 404, `HTTP ${r.status}`);
    checa("nada foi debitado nas recusas", (await saldoDe(orgId)) === BASE);
    checa("…e nenhuma campanha foi gravada sem o aceite", (await contaDaA()) === campanhasDaAAntes, `${campanhasDaAAntes} → ${await contaDaA()}`);

    r = await pedido(marina, rifaA.id, { uf: "SP", cidade: "São José dos Campos", observacao: "Público de 25 a 45 anos" });
    const idA = r.json?.id as string;
    checa("pedido aceito (201), com a taxa fotografada", r.status === 201 && r.json?.taxaPct === 20 && r.json?.reservaCents === 24_000, `HTTP ${r.status} ${r.json?.message ?? ""}`);
    checa("reservou mídia + taxa no saldo (R$ 240,00)", (await saldoDe(orgId)) === BASE - 24_000, `${await saldoDe(orgId)}`);
    const pedidoA = await campanha(idA);
    checa(
      "o aceite ficou gravado: quando, a versão e a impressão SHA-256 do texto exato (20%, R$ 40,00)",
      Boolean(pedidoA.taxaAceiteEm) &&
        pedidoA.taxaAceiteVersao === ACEITE_DA_TAXA_VERSAO &&
        pedidoA.taxaAceiteSha256 === hashDoContrato(textoDoAceiteDaTaxa(20, 4_000)),
      `${pedidoA.taxaAceiteVersao} ${pedidoA.taxaAceiteSha256}`,
    );
    checa("…e nada foi cobrado ainda: antes da aprovação a taxa é zero e sem data de cobrança", pedidoA.taxaCents === 0 && pedidoA.taxaCobradaEm === null);
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
    const recusadaB = await campanha(idB);
    checa("recusada antes da aprovação, nada foi cobrado: sem taxa e sem data de cobrança", recusadaB.taxaCents === 0 && recusadaB.taxaCobradaEm === null);
    r = await admin.req("POST", `/api/admin/trafego/campanhas/${idB}/decisao`, { aprovar: true });
    checa("decidir de novo é 409", r.status === 409, `HTTP ${r.status}`);

    r = await pedido(marina, rifaC.id, { investimentoCents: 10_000 });
    const idC = r.json?.id as string;
    r = await marina.req("POST", `/api/admin/trafego/campanhas/${idC}/cancelar`);
    checa("a organização cancela o pedido em análise e tudo volta (mídia + taxa, R$ 120,00)", r.status === 200 && r.json?.status === "cancelada" && r.json?.devolvidoCents === 12_000 && (await saldoDe(orgId)) === BASE - 24_000, `${r.json?.status} ${r.json?.devolvidoCents}`);

    const saldoAntesDeAprovar = await saldoDe(orgId);
    const [ap1, ap2] = await Promise.all([
      admin.req("POST", `/api/admin/trafego/campanhas/${idA}/decisao`, { aprovar: true }),
      admin.req("POST", `/api/admin/trafego/campanhas/${idA}/decisao`, { aprovar: true }),
    ]);
    checa("dois cliques em aprovar: um 200 e um 409", [ap1.status, ap2.status].sort().join(",") === "200,409", `${ap1.status},${ap2.status}`);
    checa("aprovada, a campanha fica no ar", (await campanha(idA)).status === "ativa");
    const aprovadaA = await campanha(idA);
    checa("aprovar cobra a taxa INTEIRA (20% de R$ 200,00 = R$ 40,00) e marca quando", aprovadaA.taxaCents === 4_000 && aprovadaA.taxaCobradaEm !== null, `${aprovadaA.taxaCents}`);
    checa("…e o saldo não se mexe: a taxa já estava dentro da reserva", (await saldoDe(orgId)) === saldoAntesDeAprovar, `${await saldoDe(orgId)} vs ${saldoAntesDeAprovar}`);
    const auditoriaDaAprovacao = await db.execute(sql`select diff from audit_log where action = 'trafego.aprovar' and entity_id = ${idA}::text`);
    checa("a auditoria da aprovação leva a taxa cobrada", (auditoriaDaAprovacao.rows as { diff: { taxaCobradaCents?: number } }[]).some((x) => x.diff?.taxaCobradaCents === 4_000), JSON.stringify(auditoriaDaAprovacao.rows));
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
    checa("gasto lançado (201), sem taxa por dia: ela já foi cobrada na aprovação", r.status === 201 && r.json?.gasto?.taxaCents === 0, `HTTP ${r.status} ${r.json?.message ?? ""}`);
    const depoisDoGasto = await campanha(idA);
    checa("…a campanha soma só a mídia e a taxa segue inteira (R$ 40,00), sem cobrar de novo", depoisDoGasto.gastoCents === 5_001 && depoisDoGasto.taxaCents === 4_000, `${depoisDoGasto.gastoCents}/${depoisDoGasto.taxaCents}`);
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
    checa("custo por venda = (mídia + a taxa inteira) ÷ vendas, para baixo", comVendas?.custoPorVendaCents === Math.floor((5_001 + 4_000) / 2), `${comVendas?.custoPorVendaCents}`);
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
    checa("mídia + taxa inteira = a reserva (R$ 240,00), e a taxa não mudou com os gastos", fimA.gastoCents === 20_000 && fimA.taxaCents === 4_000 && fimA.gastoCents + fimA.taxaCents === fimA.reservaCents, `${fimA.gastoCents}+${fimA.taxaCents}`);
    checa("gastou a verba toda: não há mídia a devolver, e a taxa não volta", fimA.devolvidoCents === 0 && (await saldoDe(orgId)) === saldoNoAr, `${fimA.devolvidoCents}`);
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
    // Reserva 12.000; taxa inteira 2.000 (cobrada na aprovação); gasto 4.333 → só a mídia que sobrou volta: 5.667.
    const fechadaD = await campanha(idD);
    checa("conta fechada: só a mídia não gasta (R$ 56,67) volta, como crédito, uma vez", fechadaD.status === "encerrada" && fechadaD.devolvidoCents === 5_667 && (await saldoDe(orgId)) === saldoAntesDeEncerrar + 5_667, `${fechadaD.devolvidoCents}`);
    checa("…a taxa de gestão ficou inteira (R$ 20,00) e os gastos lançados não somaram taxa", fechadaD.taxaCents === 2_000 && fechadaD.gastoCents === 4_333, `${fechadaD.taxaCents}/${fechadaD.gastoCents}`);
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
    checa("…e só as em análise devolvem na hora, com a taxa (duas reservas)", (await saldoDe(orgId)) === saldoAntesDoRelogio + 2 * 12_000, `${(await saldoDe(orgId)) - saldoAntesDoRelogio}`);
    await encerrarTrafegoForaDoAr();
    checa("o relógio de novo não devolve outra vez", (await saldoDe(orgId)) === saldoAntesDoRelogio + 2 * 12_000);
    r = await admin.req("POST", `/api/admin/trafego/campanhas/${idE}/fechar`);
    checa("a plataforma fecha a conta da parada pelo relógio: sem gasto nenhum, volta só a mídia (R$ 100,00); a taxa fica", r.status === 200 && (await saldoDe(orgId)) === saldoAntesDoRelogio + 2 * 12_000 + 10_000, `HTTP ${r.status}`);
    const fechadaE = await campanha(idE);
    checa("…taxa inteira cobrada (R$ 20,00), nada gasto, devolvido só a mídia", fechadaE.taxaCents === 2_000 && fechadaE.gastoCents === 0 && fechadaE.devolvidoCents === 10_000, `${fechadaE.taxaCents}/${fechadaE.devolvidoCents}`);
    const [sobraE] = (await db.execute(sql`select valor_cents::int as v, motivo from patrocinio_lancamentos where chave = ${"trafego-sobra:" + idE}`)).rows as { v: number; motivo: string }[];
    checa("…e a mídia volta pelo livro, como crédito no saldo (uma linha trafego-sobra)", sobraE?.v === 10_000 && sobraE?.motivo === "trafego-sobra", JSON.stringify(sobraE));

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
    checa("a margem do mês traz a taxa cobrada na aprovação (A, D e E: R$ 40,00 + 20,00 + 20,00)", Boolean(doMes) && doMes.taxaCents >= 4_000 + 2_000 + 2_000, `${doMes?.taxaCents}`);
    checa("…por organização", Boolean(daMarina) && daMarina.taxaCents >= 4_000 + 2_000 + 2_000, `${daMarina?.taxaCents}`);
    const livro = await db.execute(sql`select coalesce(sum(valor_cents),0)::int as s from patrocinio_lancamentos where organization_id = ${orgId}::uuid and created_at >= ${inicio.toISOString()}::timestamp and motivo like 'trafego%'`);
    const gastoNoLivro = -(livro.rows[0] as { s: number }).s;
    // A: mídia 20.000 + taxa 4.000. D: mídia 4.333 + taxa 2.000 (sobra voltou). E: taxa 2.000 (a mídia voltou).
    const debitado = fimA.gastoCents + fimA.taxaCents + 4_333 + 2_000 + 2_000;
    checa("o livro fecha: reservas − devoluções = mídia + taxa", gastoNoLivro === debitado, `${gastoNoLivro} vs ${debitado}`);
    checa("e o saldo bate com o livro", (await saldoDe(orgId)) === BASE - debitado, `${await saldoDe(orgId)}`);

    /* ---------------- a taxa na aprovação: casos extras ---------------- */
    console.log("  — taxa cobrada na aprovação: margem do mês, encerrar sem gastar e legado");
    const noFuso = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(d);

    // A margem põe a taxa no mês em que foi cobrada (a aprovação), não no do gasto nem no de hoje.
    const margemAntes = (await admin.req("GET", "/api/admin/trafego")).json?.margem as { mes: string; taxaCents: number }[];
    const mesAtual = hoje().slice(0, 7);
    const mesPassado = noFuso(new Date(Date.now() - 40 * 86_400_000)).slice(0, 7);
    const taxaNoMes = (lista: { mes: string; taxaCents: number }[], mes: string) => lista.find((m) => m.mes === mes)?.taxaCents ?? 0;
    await db.execute(sql`update trafego_campanhas set taxa_cobrada_em = (now() - interval '40 days') at time zone 'UTC' where id = ${idE}::uuid`);
    const margemDepois = (await admin.req("GET", "/api/admin/trafego")).json?.margem as { mes: string; taxaCents: number }[];
    checa(
      "a margem do mês segue a data da cobrança: a taxa de R$ 20,00 sai do mês atual e entra no da cobrança",
      taxaNoMes(margemAntes, mesAtual) - taxaNoMes(margemDepois, mesAtual) === 2_000 && taxaNoMes(margemDepois, mesPassado) - taxaNoMes(margemAntes, mesPassado) === 2_000,
      `${mesAtual}: ${taxaNoMes(margemAntes, mesAtual)}→${taxaNoMes(margemDepois, mesAtual)}; ${mesPassado}: ${taxaNoMes(margemAntes, mesPassado)}→${taxaNoMes(margemDepois, mesPassado)}`,
    );

    await admin.req("PUT", "/api/admin/trafego/config", { ligado: true });
    // Encerrar sem gastar nada: a taxa fica e só a mídia volta, como crédito.
    const rifaSemGasto = await novaRifa(orgId, "sem-gasto");
    r = await pedido(marina, rifaSemGasto.id, { investimentoCents: 10_000 });
    const idSG = r.json?.id as string;
    await admin.req("POST", `/api/admin/trafego/campanhas/${idSG}/decisao`, { aprovar: true });
    const saldoAntesDeEncerrarSG = await saldoDe(orgId);
    r = await marina.req("POST", `/api/admin/trafego/campanhas/${idSG}/encerrar`);
    checa("a organização encerra a campanha sem ter gasto nada", r.status === 200 && r.json?.status === "encerrando", `HTTP ${r.status}`);
    r = await admin.req("POST", `/api/admin/trafego/campanhas/${idSG}/fechar`);
    const fechadaSG = await campanha(idSG);
    checa(
      "encerrar sem gastar: a taxa (R$ 20,00) não volta e a mídia (R$ 100,00) volta como crédito",
      r.status === 200 && fechadaSG.taxaCents === 2_000 && fechadaSG.devolvidoCents === 10_000 && (await saldoDe(orgId)) === saldoAntesDeEncerrarSG + 10_000,
      `${fechadaSG.taxaCents}/${fechadaSG.devolvidoCents}`,
    );

    // Legado: pedido sem o aceite gravado (de antes da regra) é aprovado sem cobrar a taxa de uma vez e segue com a taxa diária.
    const rifaLegado = await novaRifa(orgId, "legado");
    r = await pedido(marina, rifaLegado.id, { investimentoCents: 10_000 });
    const idLG = r.json?.id as string;
    await db.update(trafegoCampanhas).set({ taxaAceiteEm: null, taxaAceiteVersao: null, taxaAceiteSha256: null }).where(eq(trafegoCampanhas.id, idLG));
    await admin.req("POST", `/api/admin/trafego/campanhas/${idLG}/decisao`, { aprovar: true });
    const aprovadaLG = await campanha(idLG);
    checa("sem aceite gravado, a aprovação não cobra a taxa às cegas: segue sem a marca de cobrança", aprovadaLG.status === "ativa" && aprovadaLG.taxaCobradaEm === null && aprovadaLG.taxaCents === 0);
    r = await admin.req("POST", `/api/admin/trafego/campanhas/${idLG}/gastos`, { dia: hoje(), rede: "google", gastoCents: 5_001 });
    checa("legado: o gasto do dia segue com a taxa diária, para baixo (R$ 10,00)", r.status === 201 && r.json?.gasto?.taxaCents === 1_000, `HTTP ${r.status} ${r.json?.gasto?.taxaCents}`);
    const saldoAntesDeFecharLG = await saldoDe(orgId);
    await marina.req("POST", `/api/admin/trafego/campanhas/${idLG}/encerrar`);
    r = await admin.req("POST", `/api/admin/trafego/campanhas/${idLG}/fechar`);
    const fechadaLG = await campanha(idLG);
    checa("legado: a sobra é a reserva menos mídia e taxas dos dias (R$ 59,99)", r.status === 200 && fechadaLG.devolvidoCents === 12_000 - 5_001 - 1_000 && (await saldoDe(orgId)) === saldoAntesDeFecharLG + 5_999, `${fechadaLG.devolvidoCents}`);

    /* ---------------- fase 2: o gasto importado das redes ---------------- */
    console.log("  — fase 2: gasto importado das redes");
    await db.execute(sql`delete from rate_events where bucket like 'trafego-importar:%'`);
    r = await marina.req("GET", "/api/admin/trafego/importacao");
    checa("a organização não vê a importação (403)", r.status === 403, `HTTP ${r.status}`);
    r = await marina.req("POST", "/api/admin/trafego/importacao");
    checa("…nem importa (403)", r.status === 403, `HTTP ${r.status}`);
    if (!CHAVE_WINDSOR || !URL_WINDSOR) {
      console.log("    (sem WINDSOR_API_KEY/WINDSOR_API_URL: o resto da fase 2 fica de fora)");
    } else {
      const windsor = await subirWindsor();
      try {
        await db.update(organizations).set({ patrocinioSaldoCents: sql`${organizations.patrocinioSaldoCents} + 100000` }).where(eq(organizations.id, orgId));
        await admin.req("PUT", "/api/admin/trafego/config", { ligado: true, taxaPct: 20, investimentoMinCents: 10_000, verbaDiaMinCents: 1_000, redes: ["google", "meta", "tiktok"] });
        // O limite (6 por hora) é conferido no fim; antes, cada importação começa do zero.
        const importar = async () => {
          await db.execute(sql`delete from rate_events where bucket like 'trafego-importar:%'`);
          return admin.req("POST", "/api/admin/trafego/importacao");
        };
        const rifaG = await novaRifa(orgId, "g");
        const rifaH = await novaRifa(orgId, "h");
        const idG = (await pedido(marina, rifaG.id)).json?.id as string;
        const idH = (await pedido(marina, rifaH.id, { redes: ["google"] })).json?.id as string;
        await admin.req("POST", `/api/admin/trafego/campanhas/${idG}/decisao`, { aprovar: true });
        await admin.req("POST", `/api/admin/trafego/campanhas/${idH}/decisao`, { aprovar: true });
        // A aprovação foi "há 5 dias": a janela dos dias fechados cabe na campanha.
        await db.update(trafegoCampanhas).set({ aprovadoEm: new Date(Date.now() - 5 * 86_400_000) }).where(sql`${trafegoCampanhas.id} in (${idG}::uuid, ${idH}::uuid)`);
        const { desde, ate } = janelaDaImportacao(hoje());
        const g = codigoDaCampanha(idG);
        const h = codigoDaCampanha(idH);
        linhasDoWindsor = [
          { campaign: `Rifa G · trafego-${g}`, datasource: "google_ads", date: ate, spend: "20.00", clicks: 70 },
          { campaign: `Rifa G · trafego-${g} (2)`, datasource: "google_ads", date: ate, spend: 10, clicks: "30" },
          { campaign: `Rifa G trafego-${g}`, datasource: "facebook", date: desde, spend: "15.50", clicks: 40 },
          { campaign: `Rifa G trafego-${g}`, datasource: "tiktok", date: ate, spend: "5.00", clicks: 3 },
          { campaign: "Campanha sem código", datasource: "google_ads", date: ate, spend: "9.00" },
          { campaign: `trafego-${g}`, datasource: "linkedin", date: ate, spend: "9.00" },
          { campaign: "trafego-ffffffff", datasource: "google_ads", date: ate, spend: "9.00" },
          { campaign: `Rifa H trafego-${h}`, datasource: "google_ads", date: ate, spend: "250.00", clicks: 900 },
        ];

        r = await admin.req("GET", "/api/admin/trafego/importacao");
        checa("com a chave no servidor, a importação está ligada", r.status === 200 && r.json?.ligada === true, JSON.stringify(r.json));
        r = await importar();
        const pedidoFeito = pedidosAoWindsor[pedidosAoWindsor.length - 1];
        checa("a fonte é chamada com a janela dos dias fechados e só os campos do gasto", pedidoFeito?.get("date_from") === desde && pedidoFeito?.get("date_to") === ate && pedidoFeito?.get("fields") === "campaign,clicks,datasource,date,spend", pedidoFeito?.toString().replace(CHAVE_WINDSOR, "***"));
        checa(
          "importa os dias da campanha, soma as linhas e conta o que ficou de fora",
          r.status === 200 && r.json?.importados === 3 && r.json?.semCampanha === 1 && r.json?.foraDaJanela === 1 && r.json?.ignoradas?.sem_codigo === 1 && r.json?.ignoradas?.rede === 1,
          JSON.stringify(r.json),
        );
        checa("a chave nunca volta na resposta", !JSON.stringify(r.json).includes(CHAVE_WINDSOR));
        const cG = await campanha(idG);
        checa("o gasto entra pela régua do manual: só mídia por dia, a taxa (20% de R$ 200,00) já foi cobrada inteira na aprovação", cG.gastoCents === 4_550 && cG.taxaCents === 4_000, `${cG.gastoCents}/${cG.taxaCents}`);
        const cH = await campanha(idH);
        checa(
          "a rede gastou além da verba: entra só a verba, a campanha encerra e o excedente vai ao resumo",
          cH.gastoCents === 20_000 && cH.status === "encerrada" && r.json?.excedenteCents === 5_000,
          `${cH.gastoCents} ${cH.status} ${r.json?.excedenteCents}`,
        );
        const gastosG = (await admin.req("GET", `/api/admin/trafego/campanhas/${idG}/gastos`)).json as any[];
        checa("…e nenhum dia importado soma taxa de novo", gastosG.every((x) => x.taxaCents === 0), JSON.stringify(gastosG.map((x) => x.taxaCents)));
        checa("cada dia importado guarda os cliques e a origem, sem pessoa", gastosG.length === 2 && gastosG.every((x) => x.origem === "importado" && x.lancadoPor === null) && gastosG.find((x) => x.rede === "google")?.cliques === 100, JSON.stringify(gastosG.map((x) => [x.rede, x.cliques, x.origem])));
        r = await marina.req("GET", "/api/admin/trafego");
        checa("a organização vê os cliques da campanha", (r.json?.campanhas ?? []).find((c: any) => c.id === idG)?.cliques === 140);

        await db.execute(sql`delete from rate_events where bucket like 'trafego-importar:%'`);
        const [a1, a2] = await Promise.all([admin.req("POST", "/api/admin/trafego/importacao"), admin.req("POST", "/api/admin/trafego/importacao")]);
        const cG2 = await campanha(idG);
        checa("dois cliques em importar: o dia já lançado fica como está", cG2.gastoCents === 4_550 && cG2.taxaCents === 4_000 && a1.json?.importados === 0 && a2.json?.importados === 0, `${cG2.gastoCents} ${a1.json?.importados}/${a2.json?.importados}`);

        // O dia lançado à mão vence a importação daquele dia.
        await db.execute(sql`delete from trafego_gastos where campanha_id = ${idG}::uuid and rede = 'meta'`);
        await db.update(trafegoCampanhas).set({ gastoCents: 3_000 }).where(eq(trafegoCampanhas.id, idG));
        r = await admin.req("POST", `/api/admin/trafego/campanhas/${idG}/gastos`, { dia: desde, rede: "meta", gastoCents: 1_000, cliques: 12 });
        checa("o lançamento à mão aceita os cliques", r.status === 201 && r.json?.gasto?.cliques === 12 && r.json?.gasto?.origem === "manual", `HTTP ${r.status}`);
        r = await importar();
        const cG3 = await campanha(idG);
        checa("…e a importação não cobra de novo o dia lançado à mão", cG3.gastoCents === 4_000 && r.json?.jaLancados >= 1, `${cG3.gastoCents}`);

        // A rede fecha o dia horas depois (e acerta cliques inválidos): o dia importado é corrigido, para cima e para baixo.
        (linhasDoWindsor[0] as { spend: string }).spend = "25.00";
        r = await importar();
        let cG4 = await campanha(idG);
        checa("a rede corrigiu o dia para cima: a diferença entra na mídia e a taxa inteira não muda", r.json?.atualizados === 1 && cG4.gastoCents === 4_500 && cG4.taxaCents === 4_000, `${r.json?.atualizados} ${cG4.gastoCents}/${cG4.taxaCents}`);
        (linhasDoWindsor[0] as { spend: string }).spend = "5.00";
        r = await importar();
        cG4 = await campanha(idG);
        checa("…e para baixo: a mídia cobrada desce e a taxa inteira não muda", r.json?.atualizados === 1 && cG4.gastoCents === 2_500 && cG4.taxaCents === 4_000, `${cG4.gastoCents}/${cG4.taxaCents}`);
        r = await importar();
        checa("sem mudança na rede, nada muda", r.json?.atualizados === 0 && r.json?.importados === 0 && (await campanha(idG)).gastoCents === 2_500);

        // A campanha H acabou a verba e encerrou; a rede seguiu gastando nela noutro dia.
        linhasDoWindsor.push({ campaign: `Rifa H trafego-${h}`, datasource: "google_ads", date: desde, spend: "10.00", clicks: 50 });
        r = await importar();
        const cH2 = await campanha(idH);
        checa("gasto da rede com a campanha já encerrada: nada é cobrado, vira excedente", r.json?.excedentes === 1 && r.json?.excedenteCents === 1_000 && cH2.gastoCents === 20_000, JSON.stringify(r.json));
        r = await admin.req("GET", "/api/admin/trafego");
        const hNaPlataforma = (r.json?.campanhas ?? []).find((c: any) => c.id === idH);
        checa("a plataforma vê o excedente da campanha (verba + dia depois)", hNaPlataforma?.excedenteCents === 6_000, `${hNaPlataforma?.excedenteCents}`);
        const doMesEx = (r.json?.margem ?? []).find((m: any) => m.mes === desde.slice(0, 7) || m.mes === ate.slice(0, 7));
        checa("…e a margem do mês traz o excedente", (r.json?.margem ?? []).reduce((s: number, m: any) => s + (m.excedenteCents ?? 0), 0) >= 6_000, JSON.stringify(doMesEx?.excedenteCents));
        r = await marina.req("GET", "/api/admin/trafego");
        const hNaOrg = (r.json?.campanhas ?? []).find((c: any) => c.id === idH);
        checa("a organização não vê o excedente", hNaOrg && !("excedenteCents" in hNaOrg), JSON.stringify(Object.keys(hNaOrg ?? {})));
        const gastosHOrg = (await marina.req("GET", `/api/admin/trafego/campanhas/${idH}/gastos`)).json as any[];
        checa("…nem o dia só de excedente na lista de gastos", gastosHOrg.length === 1 && gastosHOrg.every((x) => x.gastoCents > 0 && x.excedenteCents === null), JSON.stringify(gastosHOrg));

        // Desligar o produto não para as campanhas no ar: o relógio segue importando.
        await admin.req("PUT", "/api/admin/trafego/config", { ligado: false });
        (linhasDoWindsor[0] as { spend: string }).spend = "6.00";
        const doRelogio = await importarGastosDoRelogio();
        await admin.req("PUT", "/api/admin/trafego/config", { ligado: true });
        checa("com o produto desligado e campanha no ar, o relógio importa", doRelogio?.atualizados === 1 && (await campanha(idG)).gastoCents === 2_600, JSON.stringify(doRelogio));

        windsorRecusa = true;
        r = await importar();
        windsorRecusa = false;
        checa("a fonte recusou a chave: nada entra e o motivo vem em português, sem o endereço", r.status === 200 && r.json?.importados === 0 && /chave/i.test(r.json?.erro ?? "") && !JSON.stringify(r.json).includes("api_key"), JSON.stringify(r.json));
        r = await admin.req("GET", "/api/admin/trafego/importacao");
        checa("a última volta fica guardada para a tela", Boolean(r.json?.ultima?.erro), JSON.stringify(r.json?.ultima));

        await db.execute(sql`delete from rate_events where bucket like 'trafego-importar:%'`);
        const limite = [];
        for (let k = 0; k < 7; k++) limite.push((await admin.req("POST", "/api/admin/trafego/importacao")).status);
        checa("importar agora tem limite: 6 por hora, a sétima é 429", limite.slice(0, 6).every((x) => x === 200) && limite[6] === 429, limite.join(","));

        const audit = await db.execute(sql`select action, count(*)::int as n from audit_log where action like 'trafego.gasto.importado%' and actor_id is null and entity_id in (${idG}, ${idH}) group by action`);
        const porAcao = Object.fromEntries((audit.rows as { action: string; n: number }[]).map((x) => [x.action, x.n]));
        checa("cada gasto importado e cada correção entram na auditoria com o ator sistema", porAcao["trafego.gasto.importado"] === 4 && porAcao["trafego.gasto.importado.atualizado"] === 3, JSON.stringify(porAcao));
      } finally {
        windsor.close();
      }
    }
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
