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
  chamados,
  quotaAlloc,
  users,
  webhookEvents,
} from "../shared/schema";
import { PagarmeProvider, autorizacaoBasic } from "../server/payments/pagarme";
import { expirarReservas } from "../server/services/reservasVencidas";
import { hashPassword } from "../server/auth";

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
const TELEFONES = [
  "11973330001", "11973330002", "11973330003", "11973330004", "11973330005", "11973330006",
  "11973330007", "11973330008", "11973330009", "11973330010", "11973330011", "11973330012",
];
const RESTRICAO_DE_FALHA = "pagarme_teste_falha_do_banco";
const EMAIL_ORG = "pagarme-org@teste.rifa";
/** Celular de 11 algarismos sem o 9: o Pagar.me não aceita (o nosso formulário sim). */
const TELEFONE_FORA = "11873330008";
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
  /** A consulta responde sem `canceled_amount` (o campo que pode faltar). */
  semCancelado?: boolean;
}
/** O Pagar.me de mentira que ignora o `amount` do estorno e devolve tudo. */
let ignoraAmount = false;
/** O Pagar.me de mentira que recusa o pedido (500). */
let recusaPedidos = false;
/** O DELETE responde sem `canceled_amount` (o estorno que não confirma o valor). */
let deleteSemCancelado = false;
/** O DELETE demora (para dois estornos da mesma cobrança se cruzarem). */
let atrasoDoDelete = 0;
/** A consulta da cobrança fecha a conexão sem responder (a API de lá fora do ar). */
let derrubaConsulta = false;
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
        if (recusaPedidos) return responde(500, { message: "Internal error." });
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
      const comoA = (x: Cobranca) => {
        const { semCancelado, ...resto } = x;
        return semCancelado ? { ...resto, canceled_amount: undefined } : resto;
      };
      if (req.method === "GET" && c && derrubaConsulta) {
        req.socket.destroy();
        return;
      }
      if (req.method === "GET" && c) return responde(200, { ...comoA(c), payment_method: "pix" });
      if (req.method === "DELETE" && c) {
        if (atrasoDoDelete) {
          const espera = atrasoDoDelete;
          setTimeout(() => apagar(c), espera);
          return;
        }
        return apagar(c);
      }
      responde(404, { message: "Rota desconhecida no Pagar.me de mentira." });
      function apagar(c: Cobranca) {
        if (c.status === "pending") {
          c.status = "canceled";
          return responde(200, c);
        }
        const resto = (c.paid_amount ?? c.amount) - c.canceled_amount;
        const valor = typeof corpo?.amount === "number" && !ignoraAmount ? corpo.amount : resto;
        c.canceled_amount += valor;
        if (c.canceled_amount >= (c.paid_amount ?? c.amount)) c.status = "refunded";
        return responde(200, deleteSemCancelado ? { ...c, canceled_amount: undefined } : c);
      }
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
      await db.execute(sql`delete from chamados where order_id in (${sql.join(ps.map((p) => sql`${p.id}`), sql`, `)})`);
      await db.execute(sql`delete from pix_tardios where order_id in (${sql.join(ps.map((p) => sql`${p.id}`), sql`, `)})`);
      await db.execute(sql`delete from commissions where order_id in (${sql.join(ps.map((p) => sql`${p.id}`), sql`, `)})`);
      await db.delete(platformCharges).where(inArray(platformCharges.orderId, ps.map((p) => p.id)));
    }
    await db.delete(campaigns).where(inArray(campaigns.id, ids));
  }
  const gente = await db.select({ id: buyers.id }).from(buyers).where(inArray(buyers.phone, [...TELEFONES, TELEFONE_FORA]));
  if (gente.length) {
    await db.delete(carrinhoPedidos).where(inArray(carrinhoPedidos.buyerId, gente.map((g) => g.id)));
    await db.delete(buyers).where(inArray(buyers.id, gente.map((g) => g.id))).catch(() => {});
  }
  await db.delete(webhookEvents).where(and(eq(webhookEvents.provider, "pagarme"), like(webhookEvents.externalId, "hook_PAGTESTE%")));
  await db.execute(sql`delete from patrocinio_recargas where organization_id in (select id from organizations where slug = ${ORG_SLUG})`).catch(() => {});
  await db.execute(sql`delete from patrocinio_lancamentos where organization_id in (select id from organizations where slug = ${ORG_SLUG})`).catch(() => {});
  await db.delete(users).where(eq(users.email, EMAIL_ORG));
  await db.execute(sql`delete from rate_events where bucket like 'order:%' or bucket like 'login:%'`);
  await db.execute(sql`delete from pix_volume_mensal where organization_id in (select id from organizations where slug = ${ORG_SLUG})`).catch(() => {});
  await db.delete(organizations).where(eq(organizations.slug, ORG_SLUG));
}

const statsDe = async (id: string) => (await db.select().from(campaignStats).where(eq(campaignStats.campaignId, id)))[0];
const pedidoPorCodigo = async (code: number) => (await db.select().from(orders).where(eq(orders.code, code)))[0];

let hookSeq = 0;
const hookId = () => `hook_PAGTESTE${Date.now().toString(36)}${++hookSeq}`;
let ultimoRetryAfter: string | null = null;
async function webhook(corpo: unknown, t: string | null) {
  const r = await fetch(`${URL}/api/webhooks/pagarme${t === null ? "" : `?t=${encodeURIComponent(t)}`}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(corpo),
  });
  ultimoRetryAfter = r.headers.get("retry-after");
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
    checa(
      "o corpo diz pago, a API diz pendente: nada pago, 503 com Retry-After (o Pagar.me tenta de novo)",
      st === 503 && ultimoRetryAfter !== null && Number(ultimoRetryAfter) > 0 && p1.status === "pending",
      `HTTP ${st} Retry-After ${ultimoRetryAfter} ${p1.status}`,
    );
    checa("o status veio da consulta à cobrança", pedidos.some((p) => p.metodo === "GET" && p.url.endsWith(`/charges/${ch1}`)));

    const c1 = cobrancas.get(ch1)!;
    c1.status = "paid";
    c1.paid_amount = c1.amount;
    const hookPago = hookId();
    // O corpo de verdade traz a cobrança inteira, com o cliente: nada disso pode ficar guardado.
    st = await webhook(
      {
        ...evPago(hookPago, ch1),
        data: { id: ch1, status: "paid", customer: { name: "Comprador Pagarme 1", email: EMAIL, document: CPF, phones: { mobile_phone: { area_code: "11", number: "973330002" } } } },
      },
      SEGREDO,
    );
    p1 = await pedidoPorCodigo(pedido1!.code);
    const vendidasDepois = (await statsDe(a.id)).soldCount;
    checa("com a cobrança paga na API: o pedido é pago", st === 200 && p1.status === "paid" && vendidasDepois === 4, `HTTP ${st} ${p1.status} vendidas ${vendidasDepois}`);
    const [guardado] = await db.select().from(webhookEvents).where(and(eq(webhookEvents.provider, "pagarme"), eq(webhookEvents.externalId, hookPago)));
    const textoGuardado = JSON.stringify(guardado?.payload ?? null);
    checa(
      "o evento guardado tem só o id, o tipo e a cobrança — sem o cliente",
      // O jsonb do Postgres reordena as chaves: confere campo a campo.
      Object.keys((guardado?.payload ?? {}) as object).sort().join(",") === "data,id,type" &&
        (guardado?.payload as any)?.id === hookPago &&
        (guardado?.payload as any)?.type === "charge.paid" &&
        JSON.stringify((guardado?.payload as any)?.data) === JSON.stringify({ id: ch1 }) &&
        !textoGuardado.includes(EMAIL) &&
        !textoGuardado.includes(CPF) &&
        !textoGuardado.includes("Comprador"),
      textoGuardado,
    );
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
    const resultado = await prov.cancelCharge(ch2);
    checa(
      "cobrança paga: só consulta, nada é cancelado, e quem chamou fica sabendo (\"paga\")",
      resultado === "paga" && pedidos.filter((p) => p.metodo === "DELETE").length === antesDel && c2.status === "paid" && c2.canceled_amount === 0,
    );
    // O relógio da reserva vencida, sem nenhum webhook: a reserva vence, e a
    // cobrança paga no Pagar.me vai para a fila do Pix tardio.
    await db.update(quotaAlloc).set({ reservedUntil: new Date(Date.now() - 60_000) }).where(eq(quotaAlloc.orderId, p2!.id));
    await expirarReservas();
    let tardio: { motivo: string }[] = [];
    for (let i = 0; i < 20 && !tardio.length; i++) {
      tardio = (await db.execute(sql`select motivo from pix_tardios where order_id = ${p2!.id}`)).rows as { motivo: string }[];
      if (!tardio.length) await new Promise((ok) => setTimeout(ok, 250));
    }
    const p2Depois = await pedidoPorCodigo(p2!.code);
    checa(
      "reserva vencida com a cobrança paga e sem webhook: o relógio a põe na fila do Pix tardio",
      p2Depois.status === "expired" && tardio[0]?.motivo === "reserva_vencida",
      `${p2Depois.status} ${tardio[0]?.motivo ?? "sem linha"}`,
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

    console.log("\n  estorno e contestação avisados pelo Pagar.me:");
    const statusDoCarrinho = async () => (await db.select().from(orders).where(eq(orders.carrinhoId, carrinho!.id))).map((o) => o.status).join(",");
    cC.status = "refunded";
    cC.semCancelado = true;
    st = await webhook({ id: hookId(), type: "charge.refunded", data: { id: chC } }, SEGREDO);
    let situacao = await statusDoCarrinho();
    checa("\"estornada\" sem o valor cancelado na API: não desfaz o carrinho (na dúvida, nada)", st === 200 && situacao === "paid,paid", `HTTP ${st} ${situacao}`);
    cC.status = "paid";
    cC.semCancelado = false;
    st = await webhook({ id: hookId(), type: "charge.chargedback", data: { id: chC } }, SEGREDO);
    situacao = await statusDoCarrinho();
    checa("contestação avisada com a cobrança ainda paga na API: nada", st === 200 && situacao === "paid,paid", `HTTP ${st} ${situacao}`);
    cC.status = "chargedback";
    cC.canceled_amount = (cC.paid_amount ?? cC.amount) - 1;
    st = await webhook({ id: hookId(), type: "charge.chargedback", data: { id: chC } }, SEGREDO);
    situacao = await statusDoCarrinho();
    checa("contestação parcial na API (o contestado não cobre o pago): ignorada", st === 200 && situacao === "paid,paid", `HTTP ${st} ${situacao}`);
    cC.canceled_amount = cC.paid_amount ?? cC.amount;
    st = await webhook({ id: hookId(), type: "charge.chargedback", data: { id: chC } }, SEGREDO);
    situacao = await statusDoCarrinho();
    checa("contestação inteira confirmada pela API: os dois pedidos do carrinho são estornados", st === 200 && situacao === "refunded,refunded", `HTTP ${st} ${situacao}`);

    console.log("\n  a API do Pagar.me fora do ar na hora do webhook:");
    r = await new Cliente().req("POST", "/api/public/orders", { campaignId: a.id, quantity: 2, buyer: comprador(9, { cpf: CPF, email: EMAIL }) });
    const pFora = await pedidoPorCodigo(r.json?.code ?? 0);
    cobrancas.get(pFora!.pspChargeId!)!.status = "paid";
    derrubaConsulta = true;
    st = await webhook(evPago(hookId(), pFora!.pspChargeId!), SEGREDO);
    derrubaConsulta = false;
    checa(
      "a consulta da cobrança cai: 503 com Retry-After (o reenvio não para), nada pago",
      st === 503 && Number(ultimoRetryAfter) > 0 && (await pedidoPorCodigo(pFora!.code)).status === "pending",
      `HTTP ${st} Retry-After ${ultimoRetryAfter}`,
    );

    console.log("\n  pago a mais e pago a menos:");
    r = await new Cliente().req("POST", "/api/public/orders", { campaignId: a.id, quantity: 2, buyer: comprador(5, { cpf: CPF, email: EMAIL }) });
    const pMais = await pedidoPorCodigo(r.json?.code ?? 0);
    const cMais = cobrancas.get(pMais!.pspChargeId!)!;
    cMais.status = "overpaid";
    cMais.paid_amount = cMais.amount + 1;
    st = await webhook({ id: hookId(), type: "charge.overpaid", data: { id: cMais.id } }, SEGREDO);
    checa("overpaid (entrou pelo menos o valor): paga", st === 200 && (await pedidoPorCodigo(pMais!.code)).status === "paid", `HTTP ${st}`);
    r = await new Cliente().req("POST", "/api/public/orders", { campaignId: a.id, quantity: 2, buyer: comprador(6, { cpf: CPF, email: EMAIL }) });
    const pMenos = await pedidoPorCodigo(r.json?.code ?? 0);
    const cMenos = cobrancas.get(pMenos!.pspChargeId!)!;
    cMenos.status = "underpaid";
    cMenos.paid_amount = cMenos.amount - 1;
    st = await webhook({ id: hookId(), type: "charge.underpaid", data: { id: cMenos.id } }, SEGREDO);
    let menos = await pedidoPorCodigo(pMenos!.code);
    checa("underpaid avisado: ignorado (200), o pedido segue esperando", st === 200 && menos.status === "pending", `HTTP ${st} ${menos.status}`);
    st = await webhook(evPago(hookId(), cMenos.id), SEGREDO);
    menos = await pedidoPorCodigo(pMenos!.code);
    checa("\"pago\" com a API dizendo underpaid: não paga", st === 200 && menos.status === "pending", `HTTP ${st} ${menos.status}`);

    console.log("\n  estorno parcial que viraria total:");
    ignoraAmount = true;
    let erroParcial = "";
    try {
      await prov.refund(cMais.id, 100, `pedido-${pMais!.code}`);
    } catch (err) {
      erroParcial = (err as Error).message;
    }
    ignoraAmount = false;
    checa("o Pagar.me ignorou o amount e devolveu tudo: o estorno parcial falha", /no lugar de 100/.test(erroParcial), erroParcial || "não falhou");

    console.log("\n  quem paga, antes de reservar:");
    const chamadas2 = pedidos.length;
    r = await new Cliente().req("POST", "/api/public/orders", { campaignId: b.id, quantity: 1, buyer: { name: "Comprador Pagarme 7", phone: TELEFONE_FORA, cpf: CPF, email: EMAIL } });
    checa("telefone fora do formato do Pagar.me (celular sem o 9): 400", r.status === 400 && /WhatsApp/.test(r.json?.message ?? ""), `HTTP ${r.status} ${r.json?.message ?? ""}`);
    const longo = `${"a".repeat(60)}@exemplo.com`;
    r = await new Cliente().req("POST", "/api/public/orders", { campaignId: b.id, quantity: 1, buyer: comprador(7, { cpf: CPF, email: longo }) });
    checa("e-mail acima de 64 letras: 400, nunca cortado", r.status === 400 && /até 64/.test(r.json?.message ?? ""), `HTTP ${r.status} ${r.json?.message ?? ""}`);
    r = await new Cliente().req("POST", "/api/public/carrinho/checkout", { itens: [{ slug: b.slug, quantidade: 1 }], buyer: comprador(7, { cpf: CPF, email: longo }) });
    checa("…também no carrinho", r.status === 400 && /até 64/.test(r.json?.message ?? ""), `HTTP ${r.status}`);
    const semPedido7 = (await db.select({ id: buyers.id }).from(buyers).where(inArray(buyers.phone, [TELEFONE_FORA, TELEFONES[7]]))).length === 0;
    checa("nada reservado, nenhum comprador gravado e o Pagar.me não foi chamado", semPedido7 && pedidos.length === chamadas2);

    console.log("\n  recarga do patrocínio:");
    await db.update(organizations).set({ cnpj: "11222333000181" }).where(eq(organizations.id, org.id));
    await db.insert(users).values({ role: "organizer", organizationId: org.id, name: "Org Pagarme", email: EMAIL_ORG, passwordHash: await hashPassword("senha-pagarme-1") });
    const dono = new Cliente();
    r = await dono.req("POST", "/api/auth/login", { email: EMAIL_ORG, password: "senha-pagarme-1" });
    checa("o organizador entra", r.status === 200, `HTTP ${r.status}`);
    const recargas = async () => Number(((await db.execute(sql`select count(*)::int as n from patrocinio_recargas where organization_id = ${org.id}`)).rows[0] as { n: number }).n);
    const chamadas3 = pedidos.length;
    r = await dono.req("POST", "/api/admin/patrocinio/recargas", { valorCents: 5000 });
    checa(
      "sem WhatsApp no acesso nem telefone aprovado: 400 antes de gravar a recarga",
      r.status === 400 && /WhatsApp/.test(r.json?.message ?? "") && (await recargas()) === 0 && pedidos.length === chamadas3,
      `HTTP ${r.status} ${r.json?.message ?? ""}`,
    );
    await db.update(organizations).set({ telefoneOrganizador: "11973339999", telefoneConfirmadoEm: new Date(), telefoneAprovadoEm: new Date() }).where(eq(organizations.id, org.id));
    recusaPedidos = true;
    r = await dono.req("POST", "/api/admin/patrocinio/recargas", { valorCents: 5000 });
    recusaPedidos = false;
    const depoisDaRecusa = await recargas();
    checa("o Pagar.me recusou o Pix: a recarga não fica órfã", r.status >= 400 && depoisDaRecusa === 0, `HTTP ${r.status} recargas ${depoisDaRecusa}`);
    r = await dono.req("POST", "/api/admin/patrocinio/recargas", { valorCents: 5000 });
    const criacaoRecarga = pedidos.filter((p) => p.metodo === "POST" && p.url.endsWith("/orders")).at(-1);
    checa(
      "com o telefone aprovado da organização: Pix da recarga com ele, o e-mail do acesso e o CNPJ",
      r.status === 201 &&
        criacaoRecarga?.corpo?.customer?.phones?.mobile_phone?.number === "973339999" &&
        criacaoRecarga.corpo.customer.email === EMAIL_ORG &&
        criacaoRecarga.corpo.customer.document === "11222333000181" &&
        criacaoRecarga.corpo.customer.type === "company" &&
        (await recargas()) === 1,
      `HTTP ${r.status} ${r.json?.message ?? ""}`,
    );


    console.log("\n  estorno do chamado que o provedor não confirma:");
    r = await admin.req("PUT", "/api/admin/plataforma", { ...antes, provedorPix: "pagarme", estornoManual: true });
    r = await new Cliente().req("POST", "/api/public/orders", { campaignId: a.id, quantity: 2, buyer: comprador(10, { cpf: CPF, email: EMAIL }) });
    const pCh = await pedidoPorCodigo(r.json?.code ?? 0);
    const cCh = cobrancas.get(pCh!.pspChargeId!)!;
    cCh.status = "paid";
    cCh.paid_amount = cCh.amount;
    st = await webhook(evPago(hookId(), cCh.id), SEGREDO);
    const [compradorCh] = await db.select().from(buyers).where(eq(buyers.phone, TELEFONES[10]));
    const [chamado] = await db
      .insert(chamados)
      .values({
        protocolo: `PAGTESTE-${pCh!.code}`,
        organizationId: org.id,
        orderId: pCh!.id,
        buyerId: compradorCh.id,
        status: "aprovado",
        motivo: "Prova do Pagar.me: estorno que o provedor não confirma",
        devolverCents: pCh!.amountCents - 100,
        taxaCents: 100,
        taxaPct: 10,
        tipoReembolso: "com_taxa",
      })
      .returning();
    deleteSemCancelado = true;
    const deletesDoChamado = () => pedidos.filter((p) => p.metodo === "DELETE" && p.url.endsWith(`/charges/${cCh.id}`)).length;
    r = await admin.req("POST", `/api/admin/chamados/${chamado.id}/estornar`, {});
    deleteSemCancelado = false;
    let [chDepois] = await db.select().from(chamados).where(eq(chamados.id, chamado.id));
    checa(
      "a resposta sem o valor devolvido: 409 pedindo conferência, o chamado fica estornado (não volta a aprovado) e nada é desfeito",
      r.status === 409 &&
        /Confira a cobrança/.test(r.json?.message ?? "") &&
        chDepois.status === "estornado" &&
        chDepois.formaDevolucao === "conferir_no_provedor" &&
        (await pedidoPorCodigo(pCh!.code)).status === "paid",
      `HTTP ${r.status} ${chDepois.status} ${chDepois.formaDevolucao} ${r.json?.message ?? ""}`,
    );
    r = await admin.req("POST", `/api/admin/chamados/${chamado.id}/estornar`, {});
    [chDepois] = await db.select().from(chamados).where(eq(chamados.id, chamado.id));
    checa("o segundo clique não devolve de novo (409, um DELETE só)", r.status === 409 && deletesDoChamado() === 1, `HTTP ${r.status} DELETEs ${deletesDoChamado()}`);

    console.log("\n  dois estornos parciais da mesma cobrança ao mesmo tempo:");
    r = await new Cliente().req("POST", "/api/public/orders", { campaignId: a.id, quantity: 2, buyer: comprador(11, { cpf: CPF, email: EMAIL }) });
    const pDois = await pedidoPorCodigo(r.json?.code ?? 0);
    const cDois = cobrancas.get(pDois!.pspChargeId!)!;
    cDois.status = "paid";
    cDois.paid_amount = cDois.amount;
    atrasoDoDelete = 400;
    const resultados = await Promise.allSettled([
      prov.refund(cDois.id, 100, "parcial-a"),
      prov.refund(cDois.id, 200, "parcial-b"),
    ]);
    atrasoDoDelete = 0;
    checa(
      "os dois passam (a trava da cobrança: o segundo lê o cancelado depois do primeiro)",
      resultados.every((x) => x.status === "fulfilled") && cDois.canceled_amount === 300,
      resultados.map((x) => (x.status === "fulfilled" ? "ok" : (x.reason as Error).message)).join(" | ") + ` cancelado ${cDois.canceled_amount}`,
    );

    console.log("\n  relógio que acha o Pix pago e o banco falha:");
    r = await new Cliente().req("POST", "/api/public/orders", { campaignId: b.id, quantity: 1, buyer: comprador(8, { cpf: CPF, email: EMAIL }) });
    const pFalha = await pedidoPorCodigo(r.json?.code ?? 0);
    const cFalha = cobrancas.get(pFalha!.pspChargeId!)!;
    cFalha.status = "paid";
    cFalha.paid_amount = cFalha.amount;
    await db.update(quotaAlloc).set({ reservedUntil: new Date(Date.now() - 60_000) }).where(eq(quotaAlloc.orderId, pFalha!.id));
    // O banco recusa a linha da fila: a gravação do Pix tardio falha.
    await db.execute(sql.raw(`ALTER TABLE pix_tardios ADD CONSTRAINT ${RESTRICAO_DE_FALHA} CHECK (valor_cents < 0) NOT VALID`));
    await expirarReservas();
    const naFila = async () => ((await db.execute(sql`select 1 from pix_tardios where order_id = ${pFalha!.id}`)).rows.length);
    const anotada = async () =>
      JSON.stringify(((await db.execute(sql`select value from app_settings where key = 'cobrancas_pagas_a_conferir'`)).rows[0] as { value?: unknown } | undefined)?.value ?? []).includes(cFalha.id);
    const primeira = { fila: await naFila(), anotada: await anotada(), status: (await pedidoPorCodigo(pFalha!.code)).status };
    checa(
      "o banco falhou: nada na fila, mas a cobrança paga fica anotada para a próxima volta",
      primeira.fila === 0 && primeira.anotada && primeira.status === "expired",
      JSON.stringify(primeira),
    );
    await db.execute(sql.raw(`ALTER TABLE pix_tardios DROP CONSTRAINT IF EXISTS ${RESTRICAO_DE_FALHA}`));
    await expirarReservas();
    let filaDepois = 0;
    for (let i = 0; i < 20 && !filaDepois; i++) {
      filaDepois = await naFila();
      if (!filaDepois) await new Promise((ok) => setTimeout(ok, 250));
    }
    checa("a volta seguinte põe o Pix na fila do Pix tardio e tira a anotação", filaDepois === 1 && !(await anotada()), `fila ${filaDepois}`);

    checa("a chave nunca foi para uma URL", pedidos.every((p) => !p.url.includes(CHAVE)));
  } finally {
    await db.execute(sql.raw(`ALTER TABLE pix_tardios DROP CONSTRAINT IF EXISTS ${RESTRICAO_DE_FALHA}`)).catch(() => {});
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
