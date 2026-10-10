/**
 * Prova do presente pela API de verdade (`shared/presente.ts`):
 *
 * - desligado, nada de desconto; só a plataforma liga (403 para organizador);
 * - quem manda precisa de conta; a oferta pública mostra só o primeiro nome;
 * - o convidado, com conta, paga menos na primeira compra;
 * - sem conta, autoindicação ou compra que não é a primeira: preço cheio;
 * - dois pedidos com presente ao mesmo tempo: o índice deixa um (409);
 * - pago, a taxa e a comissão correm sobre o preço cheio e a parte da
 *   promotora no desconto vira crédito dela;
 * - o acerto repassa o crédito, e o estorno cancela o que ainda era devido.
 *
 *   npm run presente      (com `npm run dev` no ar e o seed aplicado)
 */
import "dotenv/config";
import { baseUrl } from "./base-url";
import { eq, inArray, sql } from "drizzle-orm";
import { db, pool } from "../server/db";
import { buyers, campaignStats, campaigns, orders, organizations, platformCharges, presenteCreditos, users } from "../shared/schema";
import { creditoDoPresente, descontoDoPresente } from "../shared/presente";
import { pctEquivalente } from "../shared/cobranca";
import { refundOrder } from "../server/services/orders";

const URL = baseUrl();
let falhas = 0;
const checa = (n: string, ok: boolean, d = "") => {
  console.log(`  ${ok ? "✓" : "✗"} ${n}${d ? ` (${d})` : ""}`);
  if (!ok) falhas++;
};

class Cliente {
  cookie = "";
  constructor(readonly aparelho = `aparelho-presente-${Math.random()}`) {}
  async req(metodo: string, caminho: string, corpo?: unknown) {
    const r = await fetch(URL + caminho, {
      method: metodo,
      headers: {
        "Content-Type": "application/json",
        "x-device-id": this.aparelho,
        ...(this.cookie ? { Cookie: this.cookie } : {}),
      },
      body: corpo === undefined ? undefined : JSON.stringify(corpo),
    });
    const sc = r.headers.get("set-cookie");
    if (sc) this.cookie = sc.split(";")[0];
    const tipo = r.headers.get("content-type") ?? "";
    return { status: r.status, json: tipo.includes("json") ? await r.json() : null };
  }
}

/** CPF válido a partir de 9 dígitos — só desta prova. */
function cpf(base: string) {
  const d = base.split("").map(Number);
  for (const n of [9, 10]) {
    const soma = d.slice(0, n).reduce((s, x, i) => s + x * (n + 1 - i), 0);
    const r = (soma * 10) % 11;
    d.push(r === 10 ? 0 : r);
  }
  return d.join("");
}

const PESSOAS = [
  { nome: "Ana Presente Souza", telefone: "11971110001", cpf: cpf("471104201"), apelido: "ana.presente" },
  { nome: "Bia Presente Lima", telefone: "11971110002", cpf: cpf("471104202"), apelido: "bia.presente" },
];
const AVULSO = "11971110003";
const SLUG = "presente-teste-rifa";
const PRECO = 1000;

async function limpar() {
  const [r] = await db.select({ id: campaigns.id }).from(campaigns).where(eq(campaigns.slug, SLUG));
  if (r) {
    const pedidos = await db.select({ id: orders.id }).from(orders).where(eq(orders.campaignId, r.id));
    if (pedidos.length) {
      const ids = pedidos.map((p) => p.id);
      await db.delete(platformCharges).where(inArray(platformCharges.orderId, ids));
      await db.delete(presenteCreditos).where(inArray(presenteCreditos.orderId, ids));
    }
    await db.delete(campaigns).where(eq(campaigns.id, r.id));
  }
  await db.delete(buyers).where(inArray(buyers.phone, [...PESSOAS.map((p) => p.telefone), AVULSO])).catch(() => {});
  await db.execute(sql`delete from rate_events where bucket like 'order:%' or bucket like 'cadastro:%' or bucket like 'login:%'`);
}

async function main() {
  console.log("\n=== presente ===\n");
  await limpar();
  const admin = new Cliente();
  let r = await admin.req("POST", "/api/auth/login", { email: "admin@rifa.br", password: "admin123" });
  if (r.status !== 200) throw new Error(`login do administrador: HTTP ${r.status}`);
  const marina = new Cliente();
  await marina.req("POST", "/api/auth/login", { email: "marina@rifassaojose.br", password: "organizador123" });
  const [eu] = await db.select({ org: users.organizationId }).from(users).where(eq(users.email, "marina@rifassaojose.br"));
  const orgId = eu.org!;
  const antes = (await admin.req("GET", "/api/admin/bonus")).json?.config;

  // Taxa de 5% na rifa (a tabela fotografada na publicação), para conferir
  // o rateio sobre o preço cheio.
  const [rifa] = await db
    .insert(campaigns)
    .values({
      organizationId: orgId,
      slug: SLUG,
      title: "Rifa do presente",
      prizeTitle: "Prêmio do presente",
      totalQuotas: 1000,
      priceCents: PRECO,
      status: "published",
      publishedAt: new Date(),
      drawAt: new Date(Date.now() + 10 * 86_400_000),
      authorizationCode: "SPA-PRESENTE",
      cobrancaModo: "percentual",
      cobranca: { modo: "percentual", percentualPct: 5, porCotaCents: 0, faixasPix: [{ ate: null, pct: 0 }] },
    })
    .returning();
  await db.insert(campaignStats).values({ campaignId: rifa.id });

  const [ana, bia, avulso] = [new Cliente(), new Cliente(), new Cliente()];
  const conta = (p: (typeof PESSOAS)[number]) => ({
    nome: p.nome,
    telefone: p.telefone,
    cpf: p.cpf,
    cep: "01310-100",
    senha: "senha-presente-1",
    apelido: p.apelido,
    lembrar: true,
  });
  const comprar = (c: Cliente, p: { nome: string; telefone: string }, quantidade: number, indicacao?: string) =>
    c.req("POST", "/api/public/orders", { campaignId: rifa.id, quantity: quantidade, buyer: { name: p.nome, phone: p.telefone }, indicacao });
  const config = (presente: object) => admin.req("PUT", "/api/admin/bonus/config", { presente });

  try {
    console.log("  configuração:");
    r = await marina.req("PUT", "/api/admin/bonus/config", { presente: { ligado: true, pct: 50, tetoCents: 10_000 } });
    checa("organizador não liga o presente (403)", r.status === 403, `HTTP ${r.status}`);
    r = await config({ ligado: true, pct: 60, tetoCents: 1000 });
    checa("desconto acima de 50%: 400", r.status === 400, `HTTP ${r.status}`);
    r = await config({ ligado: false, pct: 10, tetoCents: 700 });
    checa("a plataforma salva desligado", r.status === 200 && r.json?.presente?.ligado === false);

    await ana.req("POST", "/api/public/conta", conta(PESSOAS[0]));
    await bia.req("POST", "/api/public/conta", conta(PESSOAS[1]));
    r = await ana.req("GET", "/api/public/presente/meu");
    checa(
      "desligado, o presente vira convite: código, sem desconto",
      r.status === 200 && r.json?.ligado === false && Boolean(r.json.codigo) && r.json.pct === undefined,
    );

    await config({ ligado: true, pct: 10, tetoCents: 700 });
    r = await avulso.req("GET", "/api/public/presente/meu");
    checa("sem conta, não manda presente (401)", r.status === 401, `HTTP ${r.status}`);
    r = await ana.req("GET", "/api/public/presente/meu");
    const codigo = r.json?.codigo as string;
    checa("com conta, ganha o código (o do link de indicação)", r.status === 200 && Boolean(codigo));
    r = await avulso.req("GET", `/api/public/presente?codigo=${codigo}`);
    checa(
      "a oferta pública mostra só o primeiro nome de quem mandou",
      r.json?.valido === true && r.json.de === "Ana" && !JSON.stringify(r.json).includes(PESSOAS[0].telefone),
    );

    console.log("\n  quem ganha o desconto:");
    r = await comprar(avulso, { nome: "Avulso Presente", telefone: AVULSO }, 5, codigo);
    checa("sem conta: preço cheio", r.status === 201 && r.json?.presenteCents === 0 && r.json.amountCents === 5 * PRECO, JSON.stringify(r.json?.presenteCents));
    r = await comprar(ana, PESSOAS[0], 5, codigo);
    checa("autoindicação: preço cheio", r.status === 201 && r.json?.presenteCents === 0, `${r.json?.presenteCents}`);
    await db.update(orders).set({ status: "expired" }).where(eq(orders.buyerId, (await db.select().from(buyers).where(eq(buyers.phone, PESSOAS[0].telefone)))[0].id));

    // 5 cotas de R$ 10: 10% = R$ 5,00 (abaixo do teto de R$ 7,00).
    const desconto = descontoDoPresente(5 * PRECO, { pct: 10, tetoCents: 700 });
    r = await comprar(bia, PESSOAS[1], 5, codigo);
    const pedidoBia = r.json?.code as number;
    checa(
      "convidada com conta, primeira compra: paga menos",
      r.status === 201 && r.json?.presenteCents === desconto && r.json.amountCents === 5 * PRECO - desconto,
      `${r.json?.amountCents} + ${r.json?.presenteCents}`,
    );
    r = await comprar(bia, PESSOAS[1], 5, codigo);
    checa("outro pedido com presente enquanto o primeiro espera: 409 (o índice decide)", r.status === 409, `HTTP ${r.status} ${r.json?.message ?? ""}`);
    r = await avulso.req("GET", `/api/public/orders/${pedidoBia}`);
    checa("o pedido mostra o presente", r.json?.presenteCents === desconto);

    console.log("\n  pago:");
    await admin.req("POST", `/api/dev/pay/${pedidoBia}`);
    const [pago] = await db.select().from(orders).where(eq(orders.code, pedidoBia));
    const [taxa] = await db.select().from(platformCharges).where(eq(platformCharges.orderId, pago.id));
    const [credito] = await db.select().from(presenteCreditos).where(eq(presenteCreditos.orderId, pago.id));
    checa("a taxa corre sobre o preço cheio", taxa?.amountCents === Math.floor((5 * PRECO * 5) / 100), `${taxa?.amountCents}`);
    // A parte do presente paga a mesma proporção da taxa sobre o total.
    const esperado = creditoDoPresente({
      presenteCents: desconto,
      platformPct: pctEquivalente(taxa?.amountCents ?? 0, 5 * PRECO),
      commissionPct: 0,
      comissaoGuardada: false,
    });
    checa("a parte da promotora no desconto vira crédito dela", credito?.amountCents === esperado && credito.status === "devido", `${credito?.amountCents} ≟ ${esperado}`);
    r = await marina.req("GET", "/api/admin/cobranca/extrato");
    checa("a organização vê o que tem a receber", r.json?.creditos?.devidoCents >= esperado, JSON.stringify(r.json?.creditos));
    r = await comprar(bia, PESSOAS[1], 5, codigo);
    checa("depois da primeira compra paga, preço cheio", r.status === 201 && r.json?.presenteCents === 0, `${r.json?.presenteCents}`);

    console.log("\n  acerto e estorno:");
    r = await admin.req("POST", `/api/admin/cobranca/${orgId}/baixa`);
    const [repassado] = await db.select().from(presenteCreditos).where(eq(presenteCreditos.orderId, pago.id));
    checa("o acerto repassa o crédito", r.status === 200 && repassado.status === "pago", `HTTP ${r.status} ${repassado.status}`);
    // O estorno antes do acerto: o crédito volta a devido e o pedido é estornado.
    await db.update(presenteCreditos).set({ status: "devido", pagoEm: null }).where(eq(presenteCreditos.orderId, pago.id));
    await refundOrder(pago.id);
    const [cancelado] = await db.select().from(presenteCreditos).where(eq(presenteCreditos.orderId, pago.id));
    checa("o estorno cancela o crédito ainda devido, na mesma transação", cancelado.status === "cancelado", cancelado.status);

    await config({ ligado: false, pct: 10, tetoCents: 700 });
    r = await avulso.req("GET", `/api/public/presente?codigo=${codigo}`);
    checa("desligado de novo: a oferta some", r.json?.ligado === false);
  } finally {
    if (antes?.presente) await config(antes.presente).catch(() => {});
    await limpar();
  }

  console.log(falhas ? `\n${falhas} falha(s).\n` : "\nTudo certo.\n");
  await pool.end();
  process.exit(falhas ? 1 : 0);
}

main().catch(async (e) => {
  console.error(e);
  await limpar().catch(() => {});
  await pool.end();
  process.exit(1);
});
