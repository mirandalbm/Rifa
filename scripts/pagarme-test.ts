/**
 * Prova do provedor Pagar.me (fase 1 do gateway, sem split), contra a API de
 * verdade e um Pagar.me de mentira que a própria prova sobe:
 *
 * - o Pix gerado: `POST /orders` com Basic da chave (nunca na URL), um item
 *   em centavos, o cliente com nome, e-mail, documento e telefone, o
 *   `expires_at` da reserva e **nenhum split** (mesmo com a carteira da
 *   organização cadastrada); o pedido guarda a cobrança `ch_…`;
 * - o e-mail faltando ou errado é 400 **sem reservar nada** (nem chamar o
 *   Pagar.me), no pedido e no carrinho;
 * - o webhook sem o segredo do endereço (ou com outro) é 401; com ele, o
 *   status vem da consulta: o corpo dizendo "pago" com a cobrança pendente na
 *   API não paga nada; paga, paga uma vez — repetido, não paga de novo;
 * - o estorno parcial e o total com a chave de idempotência; a devolução
 *   parcial avisada não estorna o pedido, a total estorna;
 * - `cancelCharge` não estorna cobrança paga e cancela a pendente;
 * - o carrinho num Pix só, com duas rifas, paga as duas.
 *
 * Devolve o provedor de antes e apaga o que criou.
 *
 *   PAGARME_SECRET_KEY=… PAGARME_WEBHOOK_TOKEN=… PAGARME_API_URL=http://127.0.0.1:5095/core/v5 npm run dev
 *   (as mesmas variáveis) npm run pagarme
 */
import "dotenv/config";
import http from "node:http";
import { and, eq, inArray, like, sql } from "drizzle-orm";
import { baseUrl } from "./base-url";
import { db, pool } from "../server/db";
import {
  buyers,
  campaignStats,
  campaigns,
  carrinhoPedidos,
  orders,
  organizations,
  platformCharges,
  webhookEvents,
} from "../shared/schema";
import { PagarmeProvider, autorizacaoBasic } from "../server/payments/pagarme";

const URL = baseUrl();
let falhas = 0;
const checa = (n: string, ok: boolean, d = "") => {
  console.log(`  ${ok ? "✓" : "✗"} ${n}${d ? ` (${d})` : ""}`);
  if (!ok) falhas++;
};

const CHAVE = process.env.PAGARME_SECRET_KEY?.trim() ?? "";
const SEGREDO = process.env.PAGARME_WEBHOOK_TOKEN?.trim() ?? "";
const URL_PAGARME = process.env.PAGARME_API_URL?.trim() ?? "";

const PREFIXO = "pagarme-teste-";
const ORG_SLUG = "pagarme-teste-promotora";
const TELEFONES = ["11973330001", "11973330002", "11973330003", "11973330004", "11973330005"];
const CPF = "52998224725";
const EMAIL = "comprador.pagarme@exemplo.com.br";

/* ---------------- o Pagar.me de mentira ---------------- */

interface Pedido {
  metodo: string;
  url: string;
  auth: string;
  idem: string;
  corpo: any;
}
const pedidos: Pedido[] = [];
interface Cobranca {
  id: string;
  status: string;
  amount: number;
  paid_amount: number | null;
  canceled_amount: number;
}
const cobrancas = new Map<string, Cobranca>();
let seq = 0;
const novoId = (p: string) => `${p}_${Date.now().toString(36)}${(++seq).toString(36)}TESTE`;

function servidorDeMentira(porta: number, prefixo: string) {
  const srv = http.createServer((req, res) => {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      let corpo: any = null;
      try {
        corpo = raw ? JSON.parse(raw) : null;
      } catch {
        corpo = raw;
      }
      const url = req.url ?? "";
      pedidos.push({
        metodo: req.method ?? "",
        url,
        auth: String(req.headers.authorization ?? ""),
        idem: String(req.headers["idempotency-key"] ?? ""),
        corpo,
      });
      const responde = (status: number, json: unknown) => {
        res.writeHead(status, { "Content-Type": "application/json" });
        res.end(JSON.stringify(json));
      };
      if (req.headers.authorization !== autorizacaoBasic(CHAVE)) return responde(401, { message: "Authorization has been denied for this request." });
      const caminho = url.replace(prefixo, "");
      if (req.method === "POST" && caminho === "/orders") {
        const valor = corpo?.items?.[0]?.amount;
        const id = novoId("ch");
        cobrancas.set(id, { id, status: "pending", amount: valor, paid_amount: null, canceled_amount: 0 });
        return responde(200, {
          id: novoId("or"),
          code: corpo?.code,
          status: "pending",
          charges: [
            {
              id,
              code: corpo?.code,
              amount: valor,
              status: "pending",
              payment_method: "pix",
              last_transaction: {
                id: novoId("tran"),
                status: "waiting_payment",
                qr_code: `00020101021226820014br.gov.bcb.pix2560pix.stone.com.br/pix/v2/${id}5204000053039865802BR6304ABCD`,
                qr_code_url: `https://api.pagar.me/core/v5/transactions/${id}/qrcode`,
                expires_at: corpo?.payments?.[0]?.pix?.expires_at ? `${corpo.payments[0].pix.expires_at}Z` : null,
              },
            },
          ],
        });
      }
      const m = /^\/charges\/(ch_[A-Za-z0-9]+)$/.exec(caminho);
      const c = m ? cobrancas.get(m[1]) : undefined;
      if (m && !c) return responde(404, { message: "Charge not found." });
      if (req.method === "GET" && c) return responde(200, { ...c, payment_method: "pix" });
      if (req.method === "DELETE" && c) {
        if (c.status === "pending") {
          c.status = "canceled";
          return responde(200, c);
        }
        const valor = typeof corpo?.amount === "number" ? corpo.amount : (c.paid_amount ?? c.amount) - c.canceled_amount;
        c.canceled_amount += valor;
        if (c.canceled_amount >= (c.paid_amount ?? c.amount)) c.status = "refunded";
        return responde(200, c);
      }
      responde(404, { message: "Rota desconhecida no Pagar.me de mentira." });
    });
  });
  return new Promise<http.Server>((ok) => srv.listen(porta, "127.0.0.1", () => ok(srv)));
}

/* ---------------- a API de verdade ---------------- */

class Cliente {
  cookie = "";
  async req(metodo: string, caminho: string, corpo?: unknown, cru = false) {
    const r = await fetch(URL + caminho, {
      method: metodo,
      headers: {
        "Content-Type": "application/json",
        "x-device-id": `aparelho-pagarme-${Math.random()}`,
        ...(this.cookie ? { Cookie: this.cookie } : {}),
      },
      body: corpo === undefined ? undefined : cru ? String(corpo) : JSON.stringify(corpo),
    });
    const sc = r.headers.get("set-cookie");
    if (sc) this.cookie = sc.split(";")[0];
    const tipo = r.headers.get("content-type") ?? "";
    return { status: r.status, json: tipo.includes("json") ? await r.json() : null };
  }
}

async function limpar() {
  const rifas = await db.select({ id: campaigns.id }).from(campaigns).where(like(campaigns.slug, `${PREFIXO}%`));
  const ids = rifas.map((r) => r.id);
  if (ids.length) {
    const ps = await db.select({ id: orders.id }).from(orders).where(inArray(orders.campaignId, ids));
    if (ps.length) {
      await db.execute(sql`delete from commissions where order_id in (${sql.join(ps.map((p) => sql`${p.id}`), sql`, `)})`);
      await db.delete(platformCharges).where(inArray(platformCharges.orderId, ps.map((p) => p.id)));
    }
    await db.delete(campaigns).where(inArray(campaigns.id, ids));
  }
  const gente = await db.select({ id: buyers.id }).from(buyers).where(inArray(buyers.phone, TELEFONES));
  if (gente.length) {
    await db.delete(carrinhoPedidos).where(inArray(carrinhoPedidos.buyerId, gente.map((g) => g.id)));
    await db.delete(buyers).where(inArray(buyers.id, gente.map((g) => g.id))).catch(() => {});
  }
  await db.delete(webhookEvents).where(and(eq(webhookEvents.provider, "pagarme"), like(webhookEvents.externalId, "hook_PAGTESTE%")));
  await db.execute(sql`delete from rate_events where bucket like 'order:%' or bucket like 'login:%'`);
  await db.execute(sql`delete from pix_volume_mensal where organization_id in (select id from organizations where slug = ${ORG_SLUG})`).catch(() => {});
  await db.delete(organizations).where(eq(organizations.slug, ORG_SLUG));
}

const statsDe = async (id: string) => (await db.select().from(campaignStats).where(eq(campaignStats.campaignId, id)))[0];
const pedidoPorCodigo = async (code: number) => (await db.select().from(orders).where(eq(orders.code, code)))[0];

let hookSeq = 0;
const hookId = () => `hook_PAGTESTE${Date.now().toString(36)}${++hookSeq}`;
async function webhook(corpo: unknown, t: string | null) {
  const r = await fetch(`${URL}/api/webhooks/pagarme${t === null ? "" : `?t=${encodeURIComponent(t)}`}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(corpo),
  });
  return r.status;
}

async function main() {
  console.log("\n=== provedor Pagar.me (sem split) ===\n");
  if (!CHAVE || !SEGREDO || !URL_PAGARME) {
    throw new Error("Rode com PAGARME_SECRET_KEY, PAGARME_WEBHOOK_TOKEN e PAGARME_API_URL (as mesmas do servidor).");
  }
  const alvo = new globalThis.URL(URL_PAGARME);
  const srv = await servidorDeMentira(Number(alvo.port), alvo.pathname.replace(/\/+$/, ""));
  await limpar();

  const admin = new Cliente();
  let r = await admin.req("POST", "/api/auth/login", { email: "admin@rifa.br", password: "admin123" });
  if (r.status !== 200) throw new Error(`login do admin: HTTP ${r.status}`);
  const antes = (await admin.req("GET", "/api/admin/plataforma")).json;

  // Uma promotora com carteira cadastrada: o provedor recebe o `split` e o ignora.
  const [org] = await db
    .insert(organizations)
    .values({ name: "Promotora do Pagar.me", slug: ORG_SLUG, asaasWalletId: "7bafd95a-e783-4a62-9be1-23999af742c6" })
    .returning();
  const nova = async (i: number, preco: number) => {
    const [c] = await db
      .insert(campaigns)
      .values({
        organizationId: org.id,
        slug: `${PREFIXO}${i}`,
        title: `Rifa do Pagar.me ${i}`,
        prizeTitle: `Prêmio ${i}`,
        totalQuotas: 1000,
        priceCents: preco,
        status: "published",
        publishedAt: new Date(),
        drawAt: new Date(Date.now() + 10 * 86_400_000),
        authorizationCode: `SPA-PAGARME-${i}`,
        reservationTtlMin: 15,
        cobrancaModo: "percentual",
        cobranca: { modo: "percentual", percentualPct: 10, porCotaCents: 10, faixasPix: [{ ate: null, pct: 1 }] },
      })
      .returning();
    await db.insert(campaignStats).values({ campaignId: c.id });
    return c;
  };
  const a = await nova(1, 250);
  const b = await nova(2, 199);
  const comprador = (i: number, extra: Record<string, unknown> = {}) => ({ name: `Comprador Pagarme ${i}`, phone: TELEFONES[i], ...extra });
  const prov = new PagarmeProvider();

  try {
    r = await admin.req("PUT", "/api/admin/plataforma", { ...antes, provedorPix: "pagarme" });
    checa("a plataforma escolhe o Pagar.me (as duas variáveis estão no servidor)", r.status === 200 && r.json?.provedorPix === "pagarme", `HTTP ${r.status} ${r.json?.message ?? ""}`);
    r = await admin.req("GET", "/api/admin/plataforma");
    const doPainel = r.json?.provedores?.find((p: any) => p.id === "pagarme");
    checa(
      "o painel mostra o endereço do webhook com o lugar do segredo, nunca o valor",
      typeof doPainel?.webhook === "string" && doPainel.webhook.includes("/api/webhooks/pagarme?t=<") && !doPainel.webhook.includes(SEGREDO),
      doPainel?.webhook,
    );
    r = await new Cliente().req("GET", "/api/public/checkout");
    checa("a tela de compra sabe que o CPF e o e-mail são exigidos", r.json?.exigeCpf === true && r.json?.exigeEmail === true && r.json?.contaTemEmail === false);

    console.log("\n  e-mail obrigatório, antes de reservar:");
    const chamadasAntes = pedidos.length;
    r = await new Cliente().req("POST", "/api/public/orders", { campaignId: a.id, quantity: 2, buyer: comprador(0, { cpf: CPF }) });
    checa("sem e-mail: 400", r.status === 400 && /e-mail/i.test(r.json?.message ?? ""), `HTTP ${r.status} ${r.json?.message ?? ""}`);
    r = await new Cliente().req("POST", "/api/public/orders", { campaignId: a.id, quantity: 2, buyer: comprador(0, { cpf: CPF, email: "sem-arroba.com" }) });
    checa("e-mail fora do formato: 400", r.status === 400, `HTTP ${r.status}`);
    r = await new Cliente().req("POST", "/api/public/carrinho/checkout", {
      itens: [
        { slug: a.slug, quantidade: 1 },
        { slug: b.slug, quantidade: 1 },
      ],
      buyer: comprador(0, { cpf: CPF }),
    });
    checa("carrinho sem e-mail: 400", r.status === 400 && /e-mail/i.test(r.json?.message ?? ""), `HTTP ${r.status} ${r.json?.message ?? ""}`);
    const sa = await statsDe(a.id);
    const sb = await statsDe(b.id);
    const semPedido = (await db.select({ id: orders.id }).from(orders).where(inArray(orders.campaignId, [a.id, b.id]))).length === 0;
    checa("nada reservado, nenhum pedido e o Pagar.me não foi chamado", sa.reservedCount === 0 && sb.reservedCount === 0 && semPedido && pedidos.length === chamadasAntes);

    console.log("\n  Pix gerado:");
    r = await new Cliente().req("POST", "/api/public/orders", { campaignId: a.id, quantity: 4, buyer: comprador(1, { cpf: CPF, email: EMAIL }) });
    checa("pedido com o Pix do Pagar.me (201)", r.status === 201 && typeof r.json?.pix?.copyPaste === "string", `HTTP ${r.status} ${r.json?.message ?? ""}`);
    const pedido1 = await pedidoPorCodigo(r.json?.code ?? 0);
    const criacao = pedidos.filter((p) => p.metodo === "POST" && p.url.endsWith("/orders")).at(-1);
    checa("a cobrança guardada é a `ch_…`, do Pagar.me", pedido1?.pspProvider === "pagarme" && /^ch_/.test(pedido1?.pspChargeId ?? ""));
    checa("sem split: a taxa não nasce retida", pedido1?.taxaRetidaNoSplit === false);
    checa("o QR desenhado aqui, do copia e cola", (pedido1?.pixQr ?? "").startsWith("data:image/png;base64,") && pedido1?.pixCopyPaste === r.json?.pix?.copyPaste);
    checa("Basic com a chave, e a chave fora da URL", criacao?.auth === autorizacaoBasic(CHAVE) && pedidos.every((p) => !p.url.includes(CHAVE)));
    checa("chave de idempotência do pedido", criacao?.idem === `pedido-${pedido1?.code}`);
    const corpo = criacao?.corpo;
    checa(
      "um item, em centavos inteiros, com o total do pedido",
      corpo?.items?.length === 1 && corpo.items[0].amount === pedido1?.amountCents && Number.isInteger(corpo.items[0].amount) && corpo.items[0].quantity === 1,
      JSON.stringify(corpo?.items),
    );
    checa(
      "o cliente com os quatro dados",
      corpo?.customer?.name === "Comprador Pagarme 1" &&
        corpo.customer.email === EMAIL &&
        corpo.customer.document === CPF &&
        corpo.customer.type === "individual" &&
        corpo.customer.phones?.mobile_phone?.area_code === "11" &&
        corpo.customer.phones.mobile_phone.number === "973330002",
      JSON.stringify(corpo?.customer),
    );
    checa(
      "o Pix vence com a reserva",
      corpo?.payments?.[0]?.payment_method === "pix" && corpo.payments[0].pix.expires_at === pedido1?.expiresAt?.toISOString().slice(0, 19),
      `${corpo?.payments?.[0]?.pix?.expires_at} x ${pedido1?.expiresAt?.toISOString()}`,
    );
    checa("nenhum split no corpo, mesmo com a carteira da organização", !JSON.stringify(corpo).includes("split") && !JSON.stringify(corpo).includes("7bafd95a"));
    checa("o código do pedido no `code` e no metadata", corpo?.code === String(pedido1?.code) && corpo?.metadata?.pedido === String(pedido1?.code));

    console.log("\n  webhook:");
    const ch1 = pedido1!.pspChargeId!;
    const evPago = (id: string, charge: string) => ({ id, type: "charge.paid", data: { id: charge, status: "paid" } });
    let st = await webhook(evPago(hookId(), ch1), null);
    checa("sem o segredo no endereço: 401", st === 401, `HTTP ${st}`);
    st = await webhook(evPago(hookId(), ch1), `${SEGREDO}x`);
    checa("com outro segredo: 401", st === 401, `HTTP ${st}`);
    const consultasAntes = pedidos.filter((p) => p.metodo === "GET").length;
    checa("…e nenhum dos dois consultou o Pagar.me", consultasAntes === 0);
    st = await webhook(evPago(hookId(), ch1), SEGREDO);
    let p1 = await pedidoPorCodigo(pedido1!.code);
    checa("o corpo diz pago, a API diz pendente: nada pago (e o Pagar.me tenta de novo)", st === 400 && p1.status === "pending", `HTTP ${st} ${p1.status}`);
    checa("o status veio da consulta à cobrança", pedidos.some((p) => p.metodo === "GET" && p.url.endsWith(`/charges/${ch1}`)));

    const c1 = cobrancas.get(ch1)!;
    c1.status = "paid";
    c1.paid_amount = c1.amount;
    const hookPago = hookId();
    st = await webhook(evPago(hookPago, ch1), SEGREDO);
    p1 = await pedidoPorCodigo(pedido1!.code);
    const vendidasDepois = (await statsDe(a.id)).soldCount;
    checa("com a cobrança paga na API: o pedido é pago", st === 200 && p1.status === "paid" && vendidasDepois === 4, `HTTP ${st} ${p1.status} vendidas ${vendidasDepois}`);
    st = await webhook(evPago(hookPago, ch1), SEGREDO);
    checa("o mesmo evento de novo: 200, nada a mais", st === 200 && (await statsDe(a.id)).soldCount === 4);
    st = await webhook(evPago(hookId(), ch1), SEGREDO);
    checa("outro evento de pago da mesma cobrança: não paga duas vezes", st === 200 && (await statsDe(a.id)).soldCount === 4);
    st = await webhook({ id: hookId(), type: "order.paid", data: { id: "or_qualquer" } }, SEGREDO);
    checa("evento que não é de cobrança: ignorado (200)", st === 200);

    console.log("\n  estorno:");
    const deletesAntes = pedidos.filter((p) => p.metodo === "DELETE").length;
    await prov.refund(ch1, 300, `pedido-${pedido1!.code}`);
    const parcial = pedidos.filter((p) => p.metodo === "DELETE").at(-1);
    checa(
      "parcial: DELETE da cobrança com o valor em centavos e a chave",
      pedidos.filter((p) => p.metodo === "DELETE").length === deletesAntes + 1 &&
        parcial?.url.endsWith(`/charges/${ch1}`) === true &&
        parcial?.corpo?.amount === 300 &&
        parcial?.idem === `estorno-${ch1}-pedido-${pedido1!.code}-300` &&
        parcial?.auth === autorizacaoBasic(CHAVE),
      JSON.stringify({ corpo: parcial?.corpo, idem: parcial?.idem }),
    );
    st = await webhook({ id: hookId(), type: "charge.partial_canceled", data: { id: ch1 } }, SEGREDO);
    p1 = await pedidoPorCodigo(pedido1!.code);
    checa("a devolução parcial avisada não estorna o pedido", st === 200 && p1.status === "paid");
    st = await webhook({ id: hookId(), type: "charge.refunded", data: { id: ch1 } }, SEGREDO);
    p1 = await pedidoPorCodigo(pedido1!.code);
    checa("\"estornada\" com a API dizendo parcial: não estorna", st === 200 && p1.status === "paid");
    await prov.refund(ch1, undefined, `pedido-${pedido1!.code}`);
    const total = pedidos.filter((p) => p.metodo === "DELETE").at(-1);
    checa("total: DELETE sem corpo, com a chave do total", total?.corpo === null && total?.idem === `estorno-${ch1}-pedido-${pedido1!.code}-total`, JSON.stringify({ corpo: total?.corpo, idem: total?.idem }));
    st = await webhook({ id: hookId(), type: "charge.refunded", data: { id: ch1 } }, SEGREDO);
    p1 = await pedidoPorCodigo(pedido1!.code);
    checa("estornada inteira na API: o pedido é estornado e as cotas voltam", st === 200 && p1.status === "refunded" && (await statsDe(a.id)).soldCount === 0, `HTTP ${st} ${p1.status}`);

    console.log("\n  cancelamento da reserva vencida:");
    r = await new Cliente().req("POST", "/api/public/orders", { campaignId: b.id, quantity: 1, buyer: comprador(2, { cpf: CPF, email: EMAIL }) });
    const p2 = await pedidoPorCodigo(r.json?.code ?? 0);
    const ch2 = p2!.pspChargeId!;
    const c2 = cobrancas.get(ch2)!;
    c2.status = "paid";
    c2.paid_amount = c2.amount;
    let antesDel = pedidos.filter((p) => p.metodo === "DELETE").length;
    await prov.cancelCharge(ch2);
    checa(
      "cobrança paga: só consulta, nada é cancelado (o Pix tardio segue para a fila)",
      pedidos.filter((p) => p.metodo === "DELETE").length === antesDel && c2.status === "paid" && c2.canceled_amount === 0,
    );
    r = await new Cliente().req("POST", "/api/public/orders", { campaignId: b.id, quantity: 1, buyer: comprador(3, { cpf: CPF, email: EMAIL }) });
    const p3 = await pedidoPorCodigo(r.json?.code ?? 0);
    const ch3 = p3!.pspChargeId!;
    antesDel = pedidos.filter((p) => p.metodo === "DELETE").length;
    await prov.cancelCharge(ch3);
    checa(
      "cobrança pendente: cancelada, com a chave própria",
      pedidos.filter((p) => p.metodo === "DELETE").length === antesDel + 1 && cobrancas.get(ch3)!.status === "canceled" && pedidos.at(-1)?.idem === `cancela-${ch3}`,
    );

    console.log("\n  carrinho num Pix só:");
    r = await new Cliente().req("POST", "/api/public/carrinho/checkout", {
      itens: [
        { slug: a.slug, quantidade: 3 },
        { slug: b.slug, quantidade: 2 },
      ],
      buyer: comprador(4, { cpf: CPF, email: EMAIL }),
    });
    checa("dois pedidos num Pix só (201)", r.status === 201 && r.json?.pedidos?.length === 2, `HTTP ${r.status} ${r.json?.message ?? ""}`);
    const [carrinho] = await db.select().from(carrinhoPedidos).where(eq(carrinhoPedidos.codigo, r.json?.codigo ?? 0));
    const doCarrinho = carrinho ? await db.select().from(orders).where(eq(orders.carrinhoId, carrinho.id)) : [];
    const criacaoCarrinho = pedidos.filter((p) => p.metodo === "POST" && p.url.endsWith("/orders")).at(-1);
    checa(
      "uma cobrança com o total das duas rifas, sem split",
      criacaoCarrinho?.corpo?.items?.[0]?.amount === carrinho?.totalCents &&
        !JSON.stringify(criacaoCarrinho?.corpo).includes("split") &&
        criacaoCarrinho?.corpo?.customer?.email === EMAIL &&
        doCarrinho.every((o) => o.pspChargeId === carrinho?.pspChargeId),
    );
    const chC = carrinho!.pspChargeId!;
    const cC = cobrancas.get(chC)!;
    cC.status = "paid";
    cC.paid_amount = cC.amount;
    st = await webhook(evPago(hookId(), chC), SEGREDO);
    const pagos = await db.select().from(orders).where(eq(orders.carrinhoId, carrinho!.id));
    checa("o Pix pago paga as duas rifas", st === 200 && pagos.length === 2 && pagos.every((o) => o.status === "paid"), `HTTP ${st} ${pagos.map((o) => o.status).join(",")}`);

    checa("a chave nunca foi para uma URL", pedidos.every((p) => !p.url.includes(CHAVE)));
  } finally {
    await admin.req("PUT", "/api/admin/plataforma", { ...antes });
    await limpar();
    srv.close();
  }

  console.log(falhas ? `\n${falhas} falha(s).` : "\nTudo certo.");
  await pool.end();
  process.exit(falhas ? 1 : 0);
}

main().catch(async (err) => {
  console.error(err);
  await pool.end().catch(() => {});
  process.exit(1);
});
