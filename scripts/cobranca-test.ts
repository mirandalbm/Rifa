/**
 * Prova da cobrança por rifa, contra a API e o banco de verdade
 * (`shared/cobranca.ts`):
 * - a tabela (percentual, valor por cota, faixas da taxa Pix) é da
 *   plataforma: a organização lê e não muda (403); faixa que sobe a taxa,
 *   ou valor acima do teto, é recusada;
 * - a organização escolhe percentual ou por cota no rascunho; modo
 *   desconhecido é recusado; por cota maior ou igual ao preço da cota não
 *   publica;
 * - publicar fotografa a tabela do dia na rifa e trava a escolha; mudar a
 *   tabela depois não mexe na rifa publicada;
 * - o pedido fotografa a taxa, com a faixa do Pix pelo volume do mês da
 *   organização, e o pagamento lança a venda e o Pix numa linha.
 */
import "dotenv/config";
import { baseUrl } from "./base-url";
import { and, eq, inArray, like, sql } from "drizzle-orm";
import { db, pool } from "../server/db";
import { hashPassword } from "../server/auth";
import { buyers, campaignMedia, campaigns, orders, organizations, pixVolumeMensal, platformCharges, users } from "../shared/schema";
import { mesEmSaoPaulo } from "../shared/cobranca";

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

const SLUG_ORG = "cobranca-teste-org";
const EMAIL = "cobranca-teste@teste.rifa";
const SENHA = "senha-cobranca-teste-1";
const PREFIXO = "cobranca-teste-";
const TELEFONE = (i: number) => `1193${String((Date.now() + i) % 10_000_000).padStart(7, "0")}`;

async function limpar() {
  const [org] = await db.select({ id: organizations.id }).from(organizations).where(eq(organizations.slug, SLUG_ORG));
  const cs = (await db.select({ id: campaigns.id }).from(campaigns).where(like(campaigns.slug, `${PREFIXO}%`))).map((c) => c.id);
  if (cs.length) {
    const l = sql.raw(`('${cs.join("','")}')`);
    const ps = (await db.select({ id: orders.id }).from(orders).where(inArray(orders.campaignId, cs))).map((o) => o.id);
    if (ps.length) await db.delete(platformCharges).where(inArray(platformCharges.orderId, ps));
    await db.execute(sql`delete from quota_alloc where campaign_id in ${l}`);
    await db.execute(sql`delete from orders where campaign_id in ${l}`);
    await db.execute(sql`delete from draws where campaign_id in ${l}`);
    await db.execute(sql`delete from campaign_stats where campaign_id in ${l}`);
    await db.delete(campaigns).where(inArray(campaigns.id, cs));
  }
  await db.delete(users).where(eq(users.email, EMAIL));
  if (org) await db.delete(organizations).where(eq(organizations.id, org.id));
  await db.delete(buyers).where(like(buyers.name, "Cobrança Teste%"));
  await db.execute(sql`delete from rate_events where bucket like 'login:%' or bucket like 'order:%'`);
}

async function rascunho(orgId: string, sufixo: string, precoCents: number) {
  const [c] = await db
    .insert(campaigns)
    .values({
      organizationId: orgId,
      slug: `${PREFIXO}${sufixo}`,
      title: `Rifa da cobrança ${sufixo}`,
      prizeTitle: `Prêmio ${sufixo}`,
      totalQuotas: 1000,
      priceCents: precoCents,
      status: "draft",
      drawAt: new Date(Date.now() + 20 * 86_400_000),
      authorizationCode: `SPA-COB-${sufixo}`,
      authorizationFileKey: "certificado-teste",
      metodoApuracao: "federal_direta",
    })
    .returning();
  await db.insert(campaignMedia).values([
    { campaignId: c.id, role: "banner", storageKey: `cob-b-${sufixo}`, mime: "image/webp", status: "ready" },
    { campaignId: c.id, role: "photo", storageKey: `cob-f-${sufixo}`, mime: "image/webp", status: "ready", position: 1 },
  ]);
  return c;
}

const ler = async (id: string) => (await db.select().from(campaigns).where(eq(campaigns.id, id)))[0];

async function main() {
  console.log("\n=== cobrança por rifa ===\n");
  await limpar();
  const admin = new Cliente();
  let r = await admin.req("POST", "/api/auth/login", { email: "admin@rifa.br", password: "admin123" });
  if (r.status !== 200) throw new Error(`login do administrador: HTTP ${r.status}`);
  const antes = (await admin.req("GET", "/api/admin/cobranca/tabela")).json;

  const [org] = await db
    .insert(organizations)
    .values({ slug: SLUG_ORG, name: "Cobrança Teste", cidade: "Natal", uf: "RN", telefoneConfirmadoEm: new Date(), telefoneAprovadoEm: new Date(), sociosDeclaradosEm: new Date() })
    .returning();
  await db.insert(users).values({ role: "organizer", organizationId: org.id, name: "Org da cobrança", email: EMAIL, passwordHash: await hashPassword(SENHA) });
  const organizador = new Cliente();
  r = await organizador.req("POST", "/api/auth/login", { email: EMAIL, password: SENHA });
  if (r.status !== 200) throw new Error(`login do organizador: HTTP ${r.status}`);

  try {
    console.log("  a tabela da plataforma:");
    r = await admin.req("PUT", "/api/admin/cobranca/tabela", { percentualPct: 5, porCotaCents: 30, faixasPix: [{ ate: 2, pct: 1 }, { ate: null, pct: 2 }] });
    checa("faixa que sobe a taxa é recusada (400)", r.status === 400, `HTTP ${r.status} ${r.json?.message ?? ""}`);
    r = await admin.req("PUT", "/api/admin/cobranca/tabela", { percentualPct: 5, porCotaCents: 20_000, faixasPix: [{ ate: null, pct: 1 }] });
    checa("valor por cota acima do teto é recusado (400)", r.status === 400, `HTTP ${r.status}`);
    const tabela = { percentualPct: 4.9, porCotaCents: 30, faixasPix: [{ ate: 2, pct: 2 }, { ate: null, pct: 1 }] };
    r = await admin.req("PUT", "/api/admin/cobranca/tabela", { ...tabela, extra: "<script>" });
    checa("a plataforma salva a tabela, só com as chaves conhecidas", r.status === 200 && JSON.stringify(r.json) === JSON.stringify(tabela), `HTTP ${r.status} ${JSON.stringify(r.json)}`);
    r = await organizador.req("GET", "/api/admin/cobranca/tabela");
    checa("a organização lê a tabela", r.status === 200 && r.json?.porCotaCents === 30, `HTTP ${r.status}`);
    r = await organizador.req("PUT", "/api/admin/cobranca/tabela", { percentualPct: 0 });
    checa("a organização não muda a tabela (403)", r.status === 403, `HTTP ${r.status}`);
    r = await new Cliente().req("GET", "/api/admin/cobranca/tabela");
    checa("sem sessão não lê", r.status === 401 || r.status === 403, `HTTP ${r.status}`);

    console.log("\n  a escolha no rascunho:");
    const a = await rascunho(org.id, "a", 1000);
    checa("o rascunho nasce no percentual", a.cobrancaModo === "percentual" && a.cobranca === null);
    r = await organizador.req("PATCH", `/api/admin/campaigns/${a.id}`, { cobrancaModo: "mensalidade" });
    checa("modo desconhecido é recusado", r.status === 400, `HTTP ${r.status}`);
    r = await organizador.req("PATCH", `/api/admin/campaigns/${a.id}`, { cobrancaModo: "por_cota", cobranca: { modo: "por_cota", porCotaCents: 0 } });
    checa("a organização escolhe por cota", r.status === 200 && r.json?.cobrancaModo === "por_cota", `HTTP ${r.status}`);
    checa("a tabela não vem do formulário", (await ler(a.id)).cobranca === null);

    const barata = await rascunho(org.id, "barata", 30);
    await organizador.req("PATCH", `/api/admin/campaigns/${barata.id}`, { cobrancaModo: "por_cota" });
    r = await organizador.req("POST", `/api/admin/campaigns/${barata.id}/publish`);
    checa("por cota igual ao preço da cota não publica (422)", r.status === 422 && /preço da cota/.test(r.json?.message ?? ""), `HTTP ${r.status} ${r.json?.message ?? ""}`);

    console.log("\n  a publicação fotografa e trava:");
    r = await organizador.req("POST", `/api/admin/campaigns/${a.id}/publish`);
    checa("publica", r.status === 200, `HTTP ${r.status} ${r.json?.message ?? ""}`);
    let rifa = await ler(a.id);
    // O jsonb guarda as chaves na ordem dele: compara campo a campo.
    checa(
      "a rifa guarda o modo e a tabela do dia",
      rifa.cobranca?.modo === "por_cota" &&
        rifa.cobranca.percentualPct === tabela.percentualPct &&
        rifa.cobranca.porCotaCents === tabela.porCotaCents &&
        JSON.stringify(rifa.cobranca.faixasPix) === JSON.stringify(tabela.faixasPix),
      JSON.stringify(rifa.cobranca),
    );
    r = await admin.req("PATCH", `/api/admin/campaigns/${a.id}`, { cobrancaModo: "percentual" });
    checa("nem a plataforma troca o modo depois de publicar (422)", r.status === 422, `HTTP ${r.status}`);
    r = await admin.req("PUT", "/api/admin/cobranca/tabela", { ...tabela, porCotaCents: 90 });
    rifa = await ler(a.id);
    checa("mudar a tabela não mexe na rifa publicada", r.status === 200 && rifa.cobranca?.porCotaCents === 30, `${rifa.cobranca?.porCotaCents}`);

    // A demonstração nasce no ar sem passar pela publicação: desmarcada, ela
    // passa a vender e ganha a tabela do dia — nunca vende sem taxa.
    const [demo] = await db
      .insert(campaigns)
      .values({
        organizationId: org.id,
        slug: `${PREFIXO}demo`,
        title: "Rifa de teste",
        prizeTitle: "Prêmio de teste",
        totalQuotas: 1000,
        priceCents: 1000,
        status: "published",
        publishedAt: new Date(),
        demonstracao: true,
        authorizationCode: "SPA-COB-DEMO",
        drawAt: new Date(Date.now() + 20 * 86_400_000),
      })
      .returning();
    r = await admin.req("POST", `/api/admin/campaigns/${demo.id}/demonstracao`, { ligado: false });
    const desmarcada = await ler(demo.id);
    checa(
      "desmarcar a demonstração fotografa a tabela do dia",
      r.status === 200 && !desmarcada.demonstracao && desmarcada.cobranca?.modo === "percentual" && desmarcada.cobranca?.porCotaCents === 90,
      `HTTP ${r.status} ${JSON.stringify(desmarcada.cobranca)}`,
    );

    console.log("\n  o pedido e o pagamento:");
    const mes = mesEmSaoPaulo(new Date());
    const volume = async () => (await db.select().from(pixVolumeMensal).where(and(eq(pixVolumeMensal.organizationId, org.id), eq(pixVolumeMensal.mes, mes))))[0]?.transacoes ?? 0;
    const comprar = async (i: number, quantidade: number) => {
      const p = await new Cliente().req("POST", "/api/public/orders", { campaignId: a.id, quantity: quantidade, buyer: { name: `Cobrança Teste ${i}`, phone: TELEFONE(i) } });
      if (p.status !== 201) throw new Error(`pedido ${i}: HTTP ${p.status} ${p.json?.message ?? ""}`);
      return p.json.code as number;
    };
    const pedido = async (code: number) => (await db.select().from(orders).where(eq(orders.code, code)))[0];

    const c1 = await comprar(1, 3);
    let o = await pedido(c1);
    checa("o pedido fotografa o modo, o valor por cota e a primeira faixa do Pix", o.taxaModo === "por_cota" && o.taxaPorCotaCents === 30 && o.taxaPixBp === 200 && o.taxaVendaBp === 0, JSON.stringify({ m: o.taxaModo, c: o.taxaPorCotaCents, p: o.taxaPixBp }));
    await new Cliente().req("POST", `/api/dev/pay/${c1}`);
    let [taxa] = await db.select().from(platformCharges).where(eq(platformCharges.orderId, o.id));
    checa("pago: R$ 0,90 de venda (3 × R$ 0,30) e 2% de R$ 30,00 de Pix numa linha", taxa?.vendaCents === 90 && taxa?.pixCents === 60 && taxa?.amountCents === 150 && taxa?.modo === "por_cota", JSON.stringify(taxa));
    checa("o volume do mês conta a transação", (await volume()) === 1, `${await volume()}`);
    await new Cliente().req("POST", `/api/dev/pay/${c1}`);
    checa("o aviso repetido não conta de novo nem lança outra taxa", (await volume()) === 1 && (await db.select().from(platformCharges).where(eq(platformCharges.orderId, o.id))).length === 1);

    const c2 = await comprar(2, 1);
    await new Cliente().req("POST", `/api/dev/pay/${c2}`);
    const c3 = await comprar(3, 2);
    o = await pedido(c3);
    checa("passou de 2 transações no mês: a faixa seguinte, menor", o.taxaPixBp === 100 && (await volume()) === 2, `${o.taxaPixBp} com ${await volume()}`);
    await new Cliente().req("POST", `/api/dev/pay/${c3}`);
    [taxa] = await db.select().from(platformCharges).where(eq(platformCharges.orderId, o.id));
    checa("e o lançamento usa a faixa fotografada", taxa?.vendaCents === 60 && taxa?.pixCents === 20, JSON.stringify(taxa));

    r = await organizador.req("GET", "/api/admin/cobranca/extrato");
    checa(
      "o extrato da organização mostra a venda e o Pix de cada lançamento",
      r.status === 200 && r.json?.linhas?.length === 3 && r.json.linhas.every((l: any) => l.charge.vendaCents > 0 && l.charge.pixCents > 0) && r.json?.tabela?.porCotaCents === 90,
      `HTTP ${r.status} ${r.json?.linhas?.length}`,
    );
  } finally {
    if (antes) await admin.req("PUT", "/api/admin/cobranca/tabela", antes).catch(() => {});
    await limpar();
  }

  console.log(falhas ? `\n${falhas} falha(s).\n` : "\nTudo certo.\n");
  await pool.end();
  process.exit(falhas ? 1 : 0);
}

main().catch(async (e) => {
  console.error(e);
  await pool.end();
  process.exit(1);
});
