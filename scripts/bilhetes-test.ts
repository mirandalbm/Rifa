/**
 * Prova dos bilhetes como publicações privadas, pela API de verdade.
 *
 * O que importa: só a própria pessoa vê, só pedido pago e só o que a regra da
 * conta (`pedidoVisivel`) deixa ver; nada de dado pessoal, nada de número
 * premiado em jogo; e a lista anda por chave, sem repetir nem pular.
 *
 *   npm run bilhetes      (com `npm run dev` no ar e seed aplicado)
 */
import "dotenv/config";
import { baseUrl } from "./base-url";
import { eq, sql } from "drizzle-orm";
import { db, pool } from "../server/db";
import { buyers, campaigns, campaignStats, orders, organizations, prizedQuotas, quotaAlloc } from "../shared/schema";

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
    return {
      status: r.status,
      json: tipo.includes("json") ? await r.json() : null,
      proximo: r.headers.get("x-proximo"),
      cache: r.headers.get("cache-control") ?? "",
    };
  }
}

const TEL_ANA = "11966670001";
const TEL_BRUNO = "11966670002";
const CPF_ANA = "52998224725";
const CPF_BRUNO = "11144477735";
const SENHA = "senha-de-teste-1";
const CEP = "01310-100";
const SLUG = "bilhetes-teste";
const NUMERO_EM_JOGO = 777;

const apelido = () => "tst" + Math.random().toString(36).replace(/[^a-z]/g, "").slice(0, 12) + "x";
let rifaId = "";

async function limpar() {
  await db.execute(sql`delete from rate_events where bucket like 'cadastro:%' or bucket like 'login:comprador:%'`);
  const rows = await db.execute(sql`select id from buyers where phone in (${TEL_ANA}, ${TEL_BRUNO})`);
  for (const r of rows.rows as { id: string }[]) {
    await db.execute(sql`delete from quota_alloc where order_id in (select id from orders where buyer_id = ${r.id})`);
    await db.execute(sql`delete from orders where buyer_id = ${r.id}`);
    await db.execute(sql`delete from buyers where id = ${r.id}`);
  }
  await db.execute(sql`delete from campaigns where slug = ${SLUG}`);
}

async function main() {
  console.log("\n=== bilhetes como publicações privadas ===\n");
  await limpar();

  const [org] = await db.select().from(organizations).where(eq(organizations.slug, "rifas-sao-jose"));
  if (!org) throw new Error("Nenhuma organização. Rode `npm run db:seed`.");
  const [rifa] = await db
    .insert(campaigns)
    .values({
      organizationId: org.id,
      slug: SLUG,
      title: "Rifa do teste de bilhetes",
      prizeTitle: "Prêmio dos bilhetes",
      totalQuotas: 1000,
      priceCents: 500,
      status: "published",
      drawAt: new Date(Date.now() + 7 * 86_400_000),
      authorizationCode: "SPA-TESTE-BILHETES",
    })
    .returning();
  rifaId = rifa.id;
  await db.insert(campaignStats).values({ campaignId: rifa.id });

  try {
    // ---- as duas contas ----
    const ana = new Cliente();
    let r = await ana.req("POST", "/api/public/conta", { apelido: apelido(), cep: CEP, nome: "Ana Bilhetes", telefone: TEL_ANA, cpf: CPF_ANA, senha: SENHA });
    checa("conta da Ana criada", r.status === 201, r.json?.message ?? "");
    const bruno = new Cliente();
    r = await bruno.req("POST", "/api/public/conta", { apelido: apelido(), cep: CEP, nome: "Bruno Bilhetes", telefone: TEL_BRUNO, cpf: CPF_BRUNO, senha: SENHA });
    checa("conta do Bruno criada", r.status === 201, r.json?.message ?? "");
    const [dbAna] = await db.select().from(buyers).where(eq(buyers.phone, TEL_ANA));
    const [dbBruno] = await db.select().from(buyers).where(eq(buyers.phone, TEL_BRUNO));

    let proximoCodigo = 95_100_000;
    let proximoNumero = 1;
    /** Um pedido com `quantidade` números, a hora dada e a situação pedida. */
    async function pedido(
      comprador: string,
      opcoes: { status?: "paid" | "pending" | "refunded" | "expired"; viaConta?: boolean; quantidade?: number; criadoEm?: Date; method?: "pix_online" | "dinheiro" } = {},
    ) {
      const { status = "paid", viaConta = true, quantidade = 2, criadoEm = new Date(), method = "pix_online" } = opcoes;
      const [o] = await db
        .insert(orders)
        .values({
          code: proximoCodigo++,
          campaignId: rifa.id,
          buyerId: comprador,
          quantity: quantidade,
          amountCents: quantidade * rifa.priceCents,
          status,
          method,
          viaConta,
          paidAt: status === "paid" || status === "refunded" ? criadoEm : null,
          createdAt: criadoEm,
          expiresAt: new Date(Date.now() + 86_400_000),
        })
        .returning();
      if (status === "paid") {
        const numeros = Array.from({ length: quantidade }, () => {
          let n = proximoNumero++;
          if (n === NUMERO_EM_JOGO) n = proximoNumero++;
          return n;
        });
        await db.insert(quotaAlloc).values(numeros.map((number) => ({ campaignId: rifa.id, number, status: "paid" as const, orderId: o.id })));
      }
      return o;
    }

    // ---- sem sessão: 401, e nada de cache ----
    r = await new Cliente().req("GET", "/api/public/conta/bilhetes");
    checa("sem sessão: 401", r.status === 401);
    checa("o 401 também não vai para cache", /no-store/.test(r.cache), r.cache);

    // ---- conta sem compra ----
    r = await ana.req("GET", "/api/public/conta/bilhetes");
    checa("conta sem compra: lista vazia", r.status === 200 && Array.isArray(r.json) && r.json.length === 0);

    // ---- o que entra e o que não entra ----
    const paga = await pedido(dbAna.id, { quantidade: 3, criadoEm: new Date(Date.now() - 60_000) });
    await pedido(dbAna.id, { status: "pending" });
    await pedido(dbAna.id, { status: "refunded" });
    await pedido(dbAna.id, { status: "expired" });
    const foraDaConta = await pedido(dbAna.id, { viaConta: false, method: "dinheiro" });
    const doBruno = await pedido(dbBruno.id, { quantidade: 4 });

    // Cota premiada: uma já reclamada pelo pedido da Ana (revelada), uma em jogo.
    const [primeiroNumero] = (await db.select({ n: quotaAlloc.number }).from(quotaAlloc).where(eq(quotaAlloc.orderId, paga.id)).orderBy(quotaAlloc.number)) as { n: number }[];
    await db.insert(prizedQuotas).values([
      { campaignId: rifa.id, number: primeiroNumero.n, prizeLabel: "Brinde revelado", claimedByOrderId: paga.id, claimedAt: new Date() },
      { campaignId: rifa.id, number: NUMERO_EM_JOGO, prizeLabel: "Brinde em jogo" },
    ]);

    r = await ana.req("GET", "/api/public/conta/bilhetes");
    const lista = r.json as { id: string; codigo: number; numeros: number[]; quantidade: number; premiadas: { number: number; label: string }[]; rifa: { premio: string }; pagoEm: string; totalCents: number }[];
    checa("responde 200 com a lista", r.status === 200 && Array.isArray(lista), `HTTP ${r.status}`);
    checa("a resposta não vai para cache (dado pessoal)", /no-store/.test(r.cache), r.cache);
    checa("só o pedido pago e da conta entra", lista.length === 1 && lista[0]?.codigo === paga.code, `${lista.length} item(ns)`);
    checa("pendente, estornado e vencido ficam de fora", lista.every((b) => b.codigo === paga.code));
    checa("compra de fora da conta, sem prova, não entra", !lista.some((b) => b.codigo === foraDaConta.code));
    checa("o pedido do Bruno não aparece na Ana", !lista.some((b) => b.codigo === doBruno.code));
    const b0 = lista[0];
    checa("traz o prêmio, a data e o total", b0?.rifa.premio === "Prêmio dos bilhetes" && !Number.isNaN(Date.parse(b0.pagoEm)) && b0.totalCents === 1500);
    checa("traz os 3 números da compra, em ordem", b0?.quantidade === 3 && b0.numeros.length === 3 && b0.numeros.every((n, i, a) => i === 0 || a[i - 1] < n));
    checa("a cota premiada já reclamada aparece", b0?.premiadas.length === 1 && b0.premiadas[0].label === "Brinde revelado");
    const corpo = JSON.stringify(r.json);
    checa("o número da cota premiada em jogo nunca sai", !corpo.includes("Brinde em jogo") && !b0.numeros.includes(NUMERO_EM_JOGO));
    checa("nada de telefone, CPF nem nome do comprador", !corpo.includes(TEL_ANA) && !corpo.includes(CPF_ANA) && !corpo.includes("Ana Bilhetes") && !/"(telefone|phone|cpf|cliente|codigoCliente)"/.test(corpo));

    // ---- a prova do telefone libera a compra de fora da conta ----
    await db.update(buyers).set({ telefoneConfirmadoEm: new Date() }).where(eq(buyers.id, dbAna.id));
    r = await ana.req("GET", "/api/public/conta/bilhetes");
    checa("com o telefone provado, a compra de fora entra", (r.json as { codigo: number }[]).some((b) => b.codigo === foraDaConta.code));
    checa("e estornado/pendente seguem de fora", (r.json as unknown[]).length === 2);
    await db.update(buyers).set({ telefoneConfirmadoEm: null }).where(eq(buyers.id, dbAna.id));

    // ---- o do Bruno é só dele ----
    r = await bruno.req("GET", "/api/public/conta/bilhetes");
    checa("o Bruno vê só o dele", (r.json as { codigo: number }[]).length === 1 && (r.json as { codigo: number }[])[0].codigo === doBruno.code);
    checa("e nada da Ana (nem a cota premiada dela)", !JSON.stringify(r.json).includes("Brinde revelado"));

    // ---- nada de público ----
    const perfilAna = await new Cliente().req("GET", `/api/public/u/${(await ana.req("GET", "/api/public/conta/perfil")).json?.apelido}`);
    checa("o perfil público da Ana não traz bilhete", perfilAna.status === 200 && !JSON.stringify(perfilAna.json).includes("Prêmio dos bilhetes") && !JSON.stringify(perfilAna.json).includes(String(paga.code)));
    for (const caminho of ["/api/public/u/qualquer/bilhetes", "/api/public/bilhetes", "/api/bilhetes"]) {
      const x = await new Cliente().req("GET", caminho);
      checa(`sem rota pública em ${caminho}`, x.status === 404 || x.status === 401 || x.status === 403, `HTTP ${x.status}`);
    }

    // ---- paginação por chave ----
    const base = Date.now() - 3_600_000;
    for (let i = 0; i < 24; i++) {
      // De dois em dois com a mesma hora: o desempate pelo id não pode repetir nem pular.
      await pedido(dbAna.id, { quantidade: 1, criadoEm: new Date(base + Math.floor(i / 2) * 1000) });
    }
    const vistos: string[] = [];
    const tamanhos: number[] = [];
    let cursor: string | null = null;
    let paginas = 0;
    do {
      const q: string = `?limite=7${cursor ? `&antes=${encodeURIComponent(cursor)}` : ""}`;
      const p = await ana.req("GET", `/api/public/conta/bilhetes${q}`);
      checa(`página ${paginas + 1}: 200`, p.status === 200);
      const itens = p.json as { id: string }[];
      tamanhos.push(itens.length);
      vistos.push(...itens.map((b) => b.id));
      cursor = p.proximo;
      paginas++;
    } while (cursor && paginas < 20);
    checa("25 bilhetes no total (1 + 24), sem repetir nem pular", vistos.length === 25 && new Set(vistos).size === 25, `${vistos.length} / ${new Set(vistos).size} únicos`);
    checa("páginas de 7, a última com o resto", tamanhos.slice(0, -1).every((t) => t === 7) && tamanhos[tamanhos.length - 1] === 4, tamanhos.join(","));
    checa("a última página não manda cursor", cursor === null);
    const ordem = await ana.req("GET", "/api/public/conta/bilhetes?limite=100");
    const datas = (ordem.json as { pagoEm: string }[]).map((b) => Date.parse(b.pagoEm));
    checa("do mais novo para o mais velho", datas.every((d, i) => i === 0 || datas[i - 1] >= d));
    r = await ana.req("GET", "/api/public/conta/bilhetes?antes=lixo%27%3B--&limite=abc");
    checa("cursor e limite fora do formato: primeira página, nunca erro", r.status === 200 && (r.json as unknown[]).length === 10 && r.proximo !== null);

    // ---- sair e excluir fecham a porta ----
    await ana.req("POST", "/api/public/conta/sair");
    r = await ana.req("GET", "/api/public/conta/bilhetes");
    checa("depois de sair: 401", r.status === 401);
    r = await bruno.req("POST", "/api/public/conta/excluir", { senha: SENHA });
    checa("excluir a conta do Bruno", r.status === 200, r.json?.message ?? "");
    r = await bruno.req("GET", "/api/public/conta/bilhetes");
    checa("conta excluída: 401", r.status === 401);
  } finally {
    await limpar();
  }

  console.log(falhas ? `\n  ${falhas} falha(s)\n` : "\n  tudo certo\n");
  await pool.end();
  process.exit(falhas ? 1 : 0);
}

main().catch(async (e) => {
  console.error(e);
  await limpar().catch(() => {});
  await pool.end().catch(() => {});
  process.exit(1);
});
