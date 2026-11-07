/**
 * Prova da rifa nacional (PR 3 do `docs/PLANO-RIFA-NACIONAL.md`), pela API de
 * verdade:
 *
 * - a configuração nasce desligada e a organização só lê; desligada, o
 *   pedido é 404; salvar um pedaço não apaga o resto;
 * - o mínimo é inclusivo (R$ 100.000,00 atinge, R$ 99.999,99 não) e a falta
 *   é dita em reais;
 * - dois pedidos da mesma rifa ao mesmo tempo: um 202 e um 409 (o `UPDATE`
 *   condicional decide); dois aprovando ao mesmo tempo: um 200 e um 409;
 * - total e preço travam enquanto houver pedido ou aprovação (o `PATCH` e o
 *   editar do rascunho dão 409; o mesmo valor passa) e destravam ao recusar;
 * - a aprovação relê a rifa e o mínimo de agora: preço que caiu ou mínimo
 *   que subiu no meio = 409 e nada aprovado; o mínimo subido depois não
 *   derruba quem já foi aprovada;
 * - cancelar, abrir mão e revogar tiram o estado e deixam o histórico; tirar
 *   do ar derruba a aprovação; rifa travada ou de demonstração não pede;
 * - a página pública e o feed não trazem nada da aprovação;
 * - cada passo foi para a auditoria.
 *
 *   npm run rifa-nacional      (com `npm run dev` no ar e o seed aplicado)
 */
import "dotenv/config";
import { baseUrl } from "./base-url";
import { eq, like, sql } from "drizzle-orm";
import { db, pool } from "../server/db";
import { campaignStats, campaigns, campanhaSolicitacoes, organizations, users } from "../shared/schema";

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
    const texto = await r.text();
    return { status: r.status, texto, json: tipo.includes("json") && texto ? JSON.parse(texto) : null };
  }
}

const PREFIXO = "nacional-teste-";
const MINIMO = 10_000_000; // R$ 100.000,00
const DIA = 86_400_000;
// Os nomes que a aprovação grava: nenhum deles pode chegar ao público.
const CAMPOS_DA_APROVACAO = /nacionalStatus|nacionalAprovada|nacionalMinimo|nacionalArrecadacao|nacional_status|nacional_/;

async function limpar() {
  const minhas = sql`(select id from campaigns where slug like ${PREFIXO + "%"})`;
  await db.execute(sql`delete from audit_log where entity = 'campaign' and entity_id in (select id::text from campaigns where slug like ${PREFIXO + "%"})`);
  await db.execute(sql`delete from campanha_solicitacoes where campaign_id in ${minhas}`);
  await db.delete(campaigns).where(like(campaigns.slug, `${PREFIXO}%`));
  await db.delete(organizations).where(eq(organizations.slug, PREFIXO + "vizinha"));
}

async function main() {
  console.log("\n=== rifa nacional ===\n");
  await limpar();

  const admin = new Cliente();
  let r = await admin.req("POST", "/api/auth/login", { email: "admin@rifa.br", password: "admin123" });
  if (r.status !== 200) throw new Error(`login do administrador: HTTP ${r.status}`);
  const marina = new Cliente();
  r = await marina.req("POST", "/api/auth/login", { email: "marina@rifassaojose.br", password: "organizador123" });
  if (r.status !== 200) throw new Error(`login da organizadora: HTTP ${r.status}`);
  const [eu] = await db.select({ org: users.organizationId }).from(users).where(eq(users.email, "marina@rifassaojose.br"));
  const orgId = eu.org!;

  async function rifa(nome: string, extra: Partial<typeof campaigns.$inferInsert> = {}) {
    const [c] = await db
      .insert(campaigns)
      .values({
        organizationId: orgId,
        slug: PREFIXO + nome,
        title: `Rifa ${nome}`,
        prizeTitle: `Prêmio ${nome}`,
        totalQuotas: 1000,
        priceCents: 10_000, // 1.000 × R$ 100,00 = R$ 100.000,00: exatamente o mínimo
        status: "draft",
        drawAt: new Date(Date.now() + 30 * DIA),
        authorizationCode: "SPA-NACIONAL-1",
        ...extra,
      })
      .returning();
    await db.insert(campaignStats).values({ campaignId: c.id, soldCount: 0 });
    return c;
  }
  const estado = async (id: string) => {
    const [c] = await db.select().from(campaigns).where(eq(campaigns.id, id));
    return c;
  };
  const pedidos = (id: string) => db.select().from(campanhaSolicitacoes).where(eq(campanhaSolicitacoes.campaignId, id));
  const auditoria = async (id: string) =>
    (await db.execute(sql`select action from audit_log where entity = 'campaign' and entity_id = ${id}`)).rows.map((x: any) => x.action as string);

  const original = (await admin.req("GET", "/api/admin/rifa-nacional/config")).json;

  try {
    /* ------------------------------ configuração ------------------------------ */
    console.log("  configuração:");
    r = await admin.req("PUT", "/api/admin/rifa-nacional/config", { ligado: false, minimoCents: MINIMO, teto: 3 });
    checa("a plataforma grava a configuração (desligada, R$ 100.000, teto 3)", r.status === 200 && r.json.ligado === false && r.json.minimoCents === MINIMO && r.json.teto === 3, `HTTP ${r.status}`);
    r = await marina.req("GET", "/api/admin/rifa-nacional/config");
    checa("a organização lê o mínimo", r.status === 200 && r.json.minimoCents === MINIMO, `HTTP ${r.status}`);
    r = await marina.req("PUT", "/api/admin/rifa-nacional/config", { ligado: true });
    checa("a organização não grava (403)", r.status === 403, `HTTP ${r.status}`);
    r = await admin.req("PUT", "/api/admin/rifa-nacional/config", { minimoCents: 0 });
    checa("mínimo zero é recusado (400)", r.status === 400, `HTTP ${r.status}`);
    r = await admin.req("PUT", "/api/admin/rifa-nacional/config", { teto: 11 });
    checa("teto fora de 1 a 10 é recusado (400)", r.status === 400, `HTTP ${r.status}`);

    const desligada = await rifa("desligada");
    r = await marina.req("POST", `/api/admin/campaigns/${desligada.id}/nacional`);
    checa("desligada, o pedido é 404 para a organização", r.status === 404, `HTTP ${r.status}`);
    checa("…e a rifa não mudou", (await estado(desligada.id)).nacionalStatus === null);

    r = await admin.req("PUT", "/api/admin/rifa-nacional/config", { ligado: true });
    checa("salvar só o interruptor não apaga o mínimo nem o teto", r.status === 200 && r.json.ligado === true && r.json.minimoCents === MINIMO && r.json.teto === 3, JSON.stringify(r.json));

    /* ------------------------------ o mínimo ------------------------------ */
    console.log("\n  o mínimo (inclusivo, em centavos):");
    const abaixo = await rifa("abaixo", { totalQuotas: 3, priceCents: 3_333_333 }); // R$ 99.999,99
    r = await marina.req("POST", `/api/admin/campaigns/${abaixo.id}/nacional`);
    checa("R$ 99.999,99 é recusado (422), com a falta em reais", r.status === 422 && /0,01/.test(r.json?.message ?? ""), `HTTP ${r.status} ${r.json?.message ?? ""}`);
    checa("…e nada foi gravado", (await estado(abaixo.id)).nacionalStatus === null && (await pedidos(abaixo.id)).length === 0);
    for (const [nome, total, preco] of [
      ["exato", 4, 2_500_000],
      ["um-milhao", 1_000_000, 10],
      ["cem-cotas", 100, 100_000],
    ] as const) {
      const c = await rifa(nome, { totalQuotas: total, priceCents: preco });
      r = await marina.req("POST", `/api/admin/campaigns/${c.id}/nacional`);
      checa(`${total.toLocaleString("pt-BR")} cotas × ${preco} centavos = R$ 100.000,00 é aceito (202)`, r.status === 202 && r.json.arrecadacaoCents === MINIMO, `HTTP ${r.status} ${r.json?.message ?? ""}`);
    }

    /* ------------------------------ pedir ------------------------------ */
    console.log("\n  pedir:");
    const a = await rifa("a");
    r = await marina.req("POST", `/api/admin/campaigns/${a.id}/nacional`);
    const sa = (await pedidos(a.id))[0];
    const ca = await estado(a.id);
    checa("o rascunho pede e recebe protocolo (202)", r.status === 202 && /^RS-/.test(r.json.protocolo), `HTTP ${r.status}`);
    checa("a rifa fica em análise com a arrecadação fotografada", ca.nacionalStatus === "em_analise" && ca.nacionalArrecadacaoCents === MINIMO && ca.nacionalAprovadaEm === null && ca.nacionalMinimoCents === null);
    checa("o pedido é do tipo nacional, em análise, com o retrato", sa?.tipo === "nacional" && sa.status === "em_analise" && (sa.alteracoes as any)?.arrecadacaoCents === MINIMO);
    r = await marina.req("POST", `/api/admin/campaigns/${a.id}/nacional`);
    checa("pedir de novo é 409", r.status === 409, `HTTP ${r.status} ${r.json?.message ?? ""}`);
    r = await admin.req("POST", `/api/admin/campaigns/${a.id}/nacional`);
    checa("a plataforma não pede pela organização (403)", r.status === 403, `HTTP ${r.status}`);

    const corrida = await rifa("corrida");
    const dois = await Promise.all([1, 2].map(() => marina.req("POST", `/api/admin/campaigns/${corrida.id}/nacional`)));
    const codigos = dois.map((x) => x.status).sort();
    checa("dois pedidos ao mesmo tempo: um 202 e um 409", codigos[0] === 202 && codigos[1] === 409, codigos.join(", "));
    checa("…e um pedido só na fila", (await pedidos(corrida.id)).length === 1);

    const travada = await rifa("travada", { travadaEm: new Date() });
    r = await marina.req("POST", `/api/admin/campaigns/${travada.id}/nacional`);
    checa("rifa travada pela plataforma não pede (409)", r.status === 409, `HTTP ${r.status}`);
    const demo = await rifa("demo", { demonstracao: true });
    r = await marina.req("POST", `/api/admin/campaigns/${demo.id}/nacional`);
    checa("rifa de demonstração não pede (409)", r.status === 409, `HTTP ${r.status}`);
    const noAr = await rifa("no-ar", { status: "published", publishedAt: new Date() });
    r = await marina.req("POST", `/api/admin/campaigns/${noAr.id}/nacional`);
    checa("a rifa no ar também pede (202)", r.status === 202, `HTTP ${r.status}`);

    /* --------------------- total e preço travados --------------------- */
    console.log("\n  total e preço travados com pedido:");
    r = await marina.req("PATCH", `/api/admin/campaigns/${a.id}`, { priceCents: 20_000 });
    checa("o PATCH que muda o preço é 409", r.status === 409 && /nacional/i.test(r.json?.message ?? ""), `HTTP ${r.status} ${r.json?.message ?? ""}`);
    r = await marina.req("PATCH", `/api/admin/campaigns/${a.id}`, { totalQuotas: 10_000 });
    checa("o PATCH que muda o total é 409", r.status === 409, `HTTP ${r.status}`);
    r = await marina.req("POST", `/api/admin/campaigns/${a.id}/editar`, { priceCents: 20_000 });
    checa("o editar do rascunho que muda o preço também é 409", r.status === 409, `HTTP ${r.status}`);
    r = await marina.req("PATCH", `/api/admin/campaigns/${a.id}`, { priceCents: 10_000, title: "Rifa a (renomeada)" });
    checa("o mesmo valor passa, e o título muda (200)", r.status === 200 && r.json.title === "Rifa a (renomeada)", `HTTP ${r.status} ${r.json?.message ?? ""}`);
    checa("…total e preço seguem iguais", (await estado(a.id)).priceCents === 10_000 && (await estado(a.id)).totalQuotas === 1000);

    /* ------------------------------ decidir ------------------------------ */
    console.log("\n  decidir:");
    r = await marina.req("POST", `/api/admin/solicitacoes/${sa.id}/decidir`, { aprovar: true });
    checa("a organização não decide (403)", r.status === 403, `HTTP ${r.status}`);
    r = await admin.req("POST", `/api/admin/solicitacoes/${sa.id}/decidir`, { aprovar: false });
    checa("recusar sem explicação é 400", r.status === 400, `HTTP ${r.status}`);
    checa("…e a rifa segue em análise", (await estado(a.id)).nacionalStatus === "em_analise");

    // Aprovar duas vezes ao mesmo tempo: um 200 e um 409.
    const duas = await Promise.all([1, 2].map(() => admin.req("POST", `/api/admin/solicitacoes/${sa.id}/decidir`, { aprovar: true, resposta: "Pode ser nacional." })));
    const c2 = duas.map((x) => x.status).sort();
    checa("aprovar duas vezes ao mesmo tempo: um 200 e um 409", c2[0] === 200 && c2[1] === 409, c2.join(", "));
    const aprovada = await estado(a.id);
    checa("aprovada: data, mínimo e arrecadação fotografados", aprovada.nacionalStatus === "aprovada" && aprovada.nacionalAprovadaEm !== null && aprovada.nacionalMinimoCents === MINIMO && aprovada.nacionalArrecadacaoCents === MINIMO);
    checa("…e o pedido ficou aprovado", (await pedidos(a.id))[0].status === "aprovada");
    r = await marina.req("PATCH", `/api/admin/campaigns/${a.id}`, { priceCents: 20_000 });
    checa("aprovada, o preço segue travado (409)", r.status === 409, `HTTP ${r.status}`);

    // O mínimo subido depois não derruba quem já foi aprovada.
    r = await admin.req("PUT", "/api/admin/rifa-nacional/config", { minimoCents: 20_000_000 });
    checa("a plataforma sobe o mínimo para R$ 200.000", r.status === 200 && r.json.minimoCents === 20_000_000, `HTTP ${r.status}`);
    checa("a já aprovada continua nacional, com o mínimo de quando foi aprovada", (await estado(a.id)).nacionalStatus === "aprovada" && (await estado(a.id)).nacionalMinimoCents === MINIMO);
    const nova = await rifa("depois-do-minimo");
    r = await marina.req("POST", `/api/admin/campaigns/${nova.id}/nacional`);
    checa("o pedido novo usa o mínimo de agora (422)", r.status === 422 && /200\.000/.test(r.json?.message ?? ""), `HTTP ${r.status} ${r.json?.message ?? ""}`);

    // Mínimo subiu entre o pedido e a aprovação: 409 e nada aprovado.
    const subiu = (await pedidos(corrida.id))[0];
    r = await admin.req("POST", `/api/admin/solicitacoes/${subiu.id}/decidir`, { aprovar: true });
    checa("aprovar com o mínimo que subiu desde o pedido é 409", r.status === 409, `HTTP ${r.status} ${r.json?.message ?? ""}`);
    checa("…e o pedido e a rifa seguem em análise", (await estado(corrida.id)).nacionalStatus === "em_analise" && (await pedidos(corrida.id))[0].status === "em_analise");
    await admin.req("PUT", "/api/admin/rifa-nacional/config", { minimoCents: MINIMO });

    // Preço que caiu no meio (por fora da API, que o trava): a aprovação relê a rifa.
    await db.update(campaigns).set({ priceCents: 9_999 }).where(eq(campaigns.id, corrida.id));
    r = await admin.req("POST", `/api/admin/solicitacoes/${subiu.id}/decidir`, { aprovar: true });
    checa("aprovar com o preço que caiu abaixo do mínimo é 409 (relê a rifa, não o retrato)", r.status === 409, `HTTP ${r.status} ${r.json?.message ?? ""}`);
    checa("…e nada foi aprovado", (await estado(corrida.id)).nacionalStatus === "em_analise");
    r = await admin.req("POST", `/api/admin/solicitacoes/${subiu.id}/decidir`, { aprovar: false, resposta: "Abaixo do mínimo agora." });
    checa("recusar com explicação (200) devolve a rifa ao estado comum", r.status === 200 && (await estado(corrida.id)).nacionalStatus === null);
    r = await marina.req("PATCH", `/api/admin/campaigns/${corrida.id}`, { priceCents: 10_000 });
    checa("recusada, total e preço destravam (200)", r.status === 200, `HTTP ${r.status} ${r.json?.message ?? ""}`);

    /* ------------------- cancelar, abrir mão, revogar ------------------- */
    console.log("\n  cancelar, abrir mão e revogar:");
    const b = await rifa("b");
    await marina.req("POST", `/api/admin/campaigns/${b.id}/nacional`);
    const sb = (await pedidos(b.id))[0];
    r = await marina.req("POST", `/api/admin/solicitacoes/${sb.id}/cancelar`);
    checa("cancelar o pedido (200) tira a rifa do estado de análise", r.status === 200 && (await estado(b.id)).nacionalStatus === null && (await pedidos(b.id))[0].status === "cancelada", `HTTP ${r.status}`);
    r = await marina.req("POST", `/api/admin/campaigns/${b.id}/nacional`);
    checa("depois de cancelar, dá para pedir de novo (202)", r.status === 202, `HTTP ${r.status}`);
    r = await marina.req("DELETE", `/api/admin/campaigns/${b.id}/nacional`);
    checa("abrir mão do pedido em análise (200) cancela o pedido", r.status === 200 && (await estado(b.id)).nacionalStatus === null && (await pedidos(b.id)).every((p) => p.status === "cancelada"), `HTTP ${r.status}`);
    r = await marina.req("DELETE", `/api/admin/campaigns/${b.id}/nacional`);
    checa("abrir mão sem pedido nem aprovação é 409", r.status === 409, `HTTP ${r.status}`);

    r = await marina.req("DELETE", `/api/admin/campaigns/${a.id}/nacional`);
    checa("abrir mão da aprovação (200) devolve a rifa ao estado comum", r.status === 200 && (await estado(a.id)).nacionalStatus === null, `HTTP ${r.status}`);
    checa("…e o histórico do pedido aprovado fica", (await pedidos(a.id))[0].status === "aprovada");

    const c = await rifa("c");
    await marina.req("POST", `/api/admin/campaigns/${c.id}/nacional`);
    await admin.req("POST", `/api/admin/solicitacoes/${(await pedidos(c.id))[0].id}/decidir`, { aprovar: true });
    r = await marina.req("POST", `/api/admin/campaigns/${c.id}/nacional/revogar`, { motivo: "Motivo de teste da plataforma." });
    checa("a organização não revoga (403)", r.status === 403, `HTTP ${r.status}`);
    r = await admin.req("POST", `/api/admin/campaigns/${c.id}/nacional/revogar`, { motivo: "curto" });
    checa("revogar sem motivo é 400", r.status === 400, `HTTP ${r.status}`);
    r = await admin.req("POST", `/api/admin/campaigns/${c.id}/nacional/revogar`, { motivo: "Motivo de teste da plataforma." });
    checa("a plataforma revoga com motivo (200)", r.status === 200 && (await estado(c.id)).nacionalStatus === null, `HTTP ${r.status}`);
    r = await admin.req("GET", `/api/admin/solicitacoes/${(await pedidos(c.id))[0].id}`);
    checa("…e a organização lê o motivo na conversa do pedido", (r.json?.mensagens ?? []).some((m: any) => /revogada/.test(m.texto) && m.nome === "Plataforma"), `HTTP ${r.status}`);
    r = await admin.req("POST", `/api/admin/campaigns/${c.id}/nacional/revogar`, { motivo: "Motivo de teste da plataforma." });
    checa("revogar de novo é 409", r.status === 409, `HTTP ${r.status}`);

    /* ------------------------------ o vizinho ------------------------------ */
    console.log("\n  o vizinho (404, nunca 403):");
    const [orgViz] = await db.insert(organizations).values({ slug: PREFIXO + "vizinha", name: "Vizinha do teste", cidade: "Teste/TE" }).returning();
    const viz = await rifa("do-vizinho", { organizationId: orgViz.id });
    const [pedidoViz] = await db
      .insert(campanhaSolicitacoes)
      .values({ protocolo: "RS-TESTE-VIZINHO", campaignId: viz.id, organizationId: orgViz.id, tipo: "nacional" })
      .returning();
    await db.update(campaigns).set({ nacionalStatus: "em_analise", nacionalArrecadacaoCents: MINIMO }).where(eq(campaigns.id, viz.id));
    r = await marina.req("POST", `/api/admin/campaigns/${viz.id}/nacional`);
    checa("pedir pela rifa do vizinho é 404", r.status === 404, `HTTP ${r.status}`);
    r = await marina.req("DELETE", `/api/admin/campaigns/${viz.id}/nacional`);
    checa("abrir mão da rifa do vizinho é 404", r.status === 404, `HTTP ${r.status}`);
    r = await marina.req("GET", `/api/admin/campaigns/${viz.id}/nacional`);
    checa("ler o estado da rifa do vizinho é 404", r.status === 404, `HTTP ${r.status}`);
    r = await marina.req("GET", `/api/admin/solicitacoes/${pedidoViz.id}`);
    checa("ler o pedido do vizinho é 404", r.status === 404, `HTTP ${r.status}`);
    r = await marina.req("POST", `/api/admin/solicitacoes/${pedidoViz.id}/cancelar`);
    checa("cancelar o pedido do vizinho é 404", r.status === 404, `HTTP ${r.status}`);
    checa("…e a rifa do vizinho não mudou", (await estado(viz.id)).nacionalStatus === "em_analise" && (await pedidos(viz.id))[0].status === "em_analise");

    /* ------------------------------ tirar do ar ------------------------------ */
    console.log("\n  tirar do ar:");
    // A rifa no ar que pediu antes (`noAr`): o pedido em análise cai junto.
    r = await admin.req("POST", `/api/admin/campaigns/${noAr.id}/tirar-do-ar`);
    checa("tirar do ar a rifa com pedido em análise (200)", r.status === 200, `HTTP ${r.status} ${r.json?.message ?? ""}`);
    checa("…o pedido é cancelado e a rifa volta ao estado comum", (await estado(noAr.id)).nacionalStatus === null && (await pedidos(noAr.id))[0].status === "cancelada");
    const noAr2 = await rifa("no-ar-2", { status: "published", publishedAt: new Date() });
    await marina.req("POST", `/api/admin/campaigns/${noAr2.id}/nacional`);
    await admin.req("POST", `/api/admin/solicitacoes/${(await pedidos(noAr2.id))[0].id}/decidir`, { aprovar: true });
    checa("a rifa no ar chegou aprovada", (await estado(noAr2.id)).nacionalStatus === "aprovada");
    r = await admin.req("POST", `/api/admin/campaigns/${noAr2.id}/tirar-do-ar`);
    checa("tirar do ar derruba a aprovação", r.status === 200 && (await estado(noAr2.id)).nacionalStatus === null && (await estado(noAr2.id)).nacionalAprovadaEm === null);

    /* ------------------------------ o estado ------------------------------ */
    console.log("\n  o estado de agora e o público:");
    r = await marina.req("GET", `/api/admin/campaigns/${corrida.id}/nacional`);
    checa("a organização lê o estado (a conta, o mínimo, o pedido)", r.status === 200 && r.json.minimoCents === MINIMO && r.json.arrecadacaoCents === MINIMO && r.json.atinge === true, `HTTP ${r.status}`);
    const pub = await new Cliente().req("GET", "/api/public/campaigns");
    checa("o feed público não traz nada da aprovação", !CAMPOS_DA_APROVACAO.test(pub.texto), "feed");
    // O feed só lista rifa no ar: põe uma aprovada no ar só para ver o payload.
    const publicada = await rifa("publica", { status: "published", publishedAt: new Date() });
    await marina.req("POST", `/api/admin/campaigns/${publicada.id}/nacional`);
    await admin.req("POST", `/api/admin/solicitacoes/${(await pedidos(publicada.id))[0].id}/decidir`, { aprovar: true });
    const feed = await new Cliente().req("GET", "/api/public/campaigns");
    const pagina = await new Cliente().req("GET", `/api/public/campaigns/${publicada.slug}`);
    checa("a rifa aprovada aparece no feed (a ordem é a PR 4)", feed.texto.includes(publicada.slug), `HTTP ${feed.status}`);
    checa("…e nem o feed nem a página trazem arrecadação, mínimo ou data da aprovação", !CAMPOS_DA_APROVACAO.test(feed.texto + pagina.texto), "feed + página");

    /* ------------------------------ a vitrine ------------------------------ */
    console.log("\n  a vitrine (nacionais no topo, nada some):");
    const comoAprovada = (dias: number) => ({
      status: "published" as const,
      publishedAt: new Date(),
      nacionalStatus: "aprovada",
      nacionalAprovadaEm: new Date(Date.now() - dias * DIA),
      nacionalMinimoCents: MINIMO,
      nacionalArrecadacaoCents: MINIMO,
    });
    // Criadas fora de ordem: a vitrine ordena pela data da aprovação (a mais antiga primeiro), não pela criação.
    const v3 = await rifa("vit-3", comoAprovada(1));
    const v1 = await rifa("vit-1", comoAprovada(3));
    const v2 = await rifa("vit-2", comoAprovada(2));
    const comum = await rifa("vit-comum", { status: "published", publishedAt: new Date() });
    const lista = async (qs = "") => (await new Cliente().req("GET", `/api/public/campaigns${qs}`)).json as Array<{ slug: string; nacional?: boolean }>;
    await admin.req("PUT", "/api/admin/rifa-nacional/config", { ligado: true, teto: 2 });
    let feedLigado = await lista("?uf=AC");
    const meus = [v1, v2, v3, comum].map((x) => x.slug);
    checa("com teto 2, as duas nacionais mais antigas abrem a vitrine, de qualquer estado", feedLigado[0]?.slug === v1.slug && feedLigado[1]?.slug === v2.slug, feedLigado.slice(0, 3).map((x) => x.slug).join(", "));
    checa("a que passou do teto não some: aparece uma vez, depois delas", feedLigado.filter((x) => x.slug === v3.slug).length === 1 && feedLigado.findIndex((x) => x.slug === v3.slug) > 1);
    checa("cada rifa aparece uma vez só", new Set(feedLigado.map((x) => x.slug)).size === feedLigado.length);
    checa("o selo vem do servidor: as três aprovadas são `nacional`, a comum não", [v1, v2, v3].every((x) => feedLigado.find((f) => f.slug === x.slug)?.nacional === true) && feedLigado.find((f) => f.slug === comum.slug)?.nacional === false);
    const paginaV1 = await new Cliente().req("GET", `/api/public/campaigns/${v1.slug}`);
    checa("a página da rifa também diz `nacional: true`", paginaV1.json?.campaign?.nacional === true, `HTTP ${paginaV1.status}`);

    await admin.req("PUT", "/api/admin/rifa-nacional/config", { ligado: false });
    const feedDesligado = await lista("?uf=AC");
    checa("desligado, nenhuma rifa leva o selo e a página não diz `nacional`", feedDesligado.every((x) => !x.nacional) && (await new Cliente().req("GET", `/api/public/campaigns/${v1.slug}`)).json?.campaign?.nacional === false);
    checa("desligado, nada some: as mesmas rifas, só a ordem volta à de antes", feedDesligado.length === feedLigado.length && meus.every((s) => feedDesligado.some((x) => x.slug === s)));
    checa("desligado, as nacionais não ficam fixas no topo (a ordem é a de sempre)", feedDesligado.slice(0, 2).map((x) => x.slug).join() !== [v1.slug, v2.slug].join() || feedDesligado.length < 3);
    const porEstado = await lista("?estado=AC");
    checa("`/estado/UF` segue filtrando como antes (a nacional de outro estado não entra)", !porEstado.some((x) => meus.includes(x.slug)));
    await admin.req("PUT", "/api/admin/rifa-nacional/config", { ligado: true, teto: 3 });

    /* ------------------------------ auditoria ------------------------------ */
    console.log("\n  auditoria:");
    const aA = await auditoria(a.id);
    checa("pedir, aprovar e abrir mão estão na auditoria", ["nacional.pedir", "nacional.aprovar", "nacional.abrir_mao"].every((x) => aA.includes(x)), aA.join(", "));
    const aC = await auditoria(c.id);
    checa("revogar está na auditoria", aC.includes("nacional.revogar"), aC.join(", "));
    const aCo = await auditoria(corrida.id);
    checa("recusar está na auditoria", aCo.includes("nacional.recusar"), aCo.join(", "));
    const aB = await auditoria(b.id);
    checa("cancelar está na auditoria", aB.includes("nacional.cancelar"), aB.join(", "));
  } finally {
    if (original) await admin.req("PUT", "/api/admin/rifa-nacional/config", original).catch(() => {});
    await limpar();
  }

  console.log(falhas === 0 ? "\n  tudo certo\n" : `\n  ${falhas} verificação(ões) falharam\n`);
  await pool.end();
  process.exit(falhas === 0 ? 0 : 1);
}

main().catch(async (err) => {
  console.error(err);
  await limpar().catch(() => {});
  await pool.end().catch(() => {});
  process.exit(1);
});
