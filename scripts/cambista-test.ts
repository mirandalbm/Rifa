/**
 * Prova do cambista e do acerto, pela API de verdade (fase 0 da reformulação:
 * as rotas `/api/seller/*`, `/api/admin/sellers` e `/api/admin/settlements*`
 * não tinham prova que as citasse):
 *
 * - o cambista só vende a rifa da organização dele (a de outra é 404) e só
 *   mexe nas vendas dele (a do colega é 404, nunca 403 — o código existir
 *   já seria informação);
 * - reservar antes de cobrar: a venda nasce pendente e a cota fica presa;
 *   cancelar devolve a cota; confirmar paga; pagar de novo não duplica;
 * - o acerto carimba as vendas: cinco fechamentos ao mesmo tempo dão um
 *   acerto só, e a mesma venda nunca entra em dois;
 * - dar baixa duas vezes é um 409, sem mudar a data da primeira;
 * - o acerto da organização vizinha é 404 (ler, fechar, dar baixa);
 * - cadastrar cambista: repetido é 409, senha fraca 400, e o organizador
 *   não escolhe a organização do cadastro;
 * - auditoria do acesso (docs/AUDITORIA-ACESSO-CAMBISTA.md): código de venda
 *   fora do formato é 404 (nunca 500), comprovante da maquininha com formato
 *   (o bilhete é público e impresso), meio desligado barrado no servidor,
 *   bloqueio manual vale para o cambista, cambista sem organização não entra,
 *   sessão copiada cai na troca de senha, número repetido não cobra a mais,
 *   reservas grandes ao mesmo tempo não dão 500 e o teto de vendas por cambista.
 *
 *   npm run cambista      (com `npm run dev` no ar e o seed aplicado)
 */
import "dotenv/config";
import { baseUrl } from "./base-url";
import { eq, inArray, sql } from "drizzle-orm";
import { db, pool } from "../server/db";
import { hashPassword } from "../server/auth";
import { affiliates, buyers, campaignStats, campaigns, orders, organizations, quotaAlloc, settlements, users } from "../shared/schema";

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
  async entrar(email: string, password: string) {
    const r = await this.req("POST", "/api/auth/login", { email, password });
    if (r.status !== 200) throw new Error(`login ${email}: HTTP ${r.status}`);
    return this;
  }
}

const SENHA = "senha-cambista-1";
const SLUGS = ["cambista-a", "cambista-b"];
const EMAILS = [
  "cambista-org-a@teste.rifa",
  "cambista-org-b@teste.rifa",
  "cambista-1@teste.rifa",
  "cambista-2@teste.rifa",
  "cambista-b1@teste.rifa",
  "cambista-nulo@teste.rifa",
  "cambista-lim@teste.rifa",
];

async function limpar() {
  const orgs = await db.select({ id: organizations.id }).from(organizations).where(inArray(organizations.slug, SLUGS));
  const ids = orgs.map((o) => o.id);
  if (ids.length) {
    const lista = sql.join(ids.map((i) => sql`${i}::uuid`), sql`, `);
    await db.execute(sql`delete from quota_alloc where campaign_id in (select id from campaigns where organization_id in (${lista}))`);
    await db.execute(sql`delete from commissions where order_id in (select id from orders where campaign_id in (select id from campaigns where organization_id in (${lista})))`);
    await db.execute(sql`delete from platform_charges where order_id in (select id from orders where campaign_id in (select id from campaigns where organization_id in (${lista})))`);
    await db.execute(sql`delete from orders where campaign_id in (select id from campaigns where organization_id in (${lista}))`);
    await db.execute(sql`delete from settlements where seller_id in (select a.id from affiliates a join users u on u.id = a.user_id where u.organization_id in (${lista}))`);
    await db.execute(sql`delete from campaigns where organization_id in (${lista})`);
  }
  await db.execute(sql`delete from affiliates where user_id in (select id from users where email = any(${`{${EMAILS.join(",")}}`}::text[]))`);
  await db.delete(users).where(inArray(users.email, EMAILS));
  if (ids.length) await db.delete(organizations).where(inArray(organizations.id, ids));
  await db.execute(sql`delete from buyers where phone like '1197777%'`);
  await db.execute(sql`delete from rate_events where bucket like 'login:%' or bucket like 'order:%' or bucket like 'cambista-venda:%'`);
}

async function rifa(orgId: string, slug: string) {
  const [camp] = await db
    .insert(campaigns)
    .values({
      organizationId: orgId,
      slug,
      title: `Rifa ${slug}`,
      prizeTitle: "Moto",
      totalQuotas: 10_000,
      priceCents: 1000,
      commissionPctDefault: 10,
      status: "published",
      publishedAt: new Date(),
      drawAt: new Date(Date.now() + 20 * 86_400_000),
      authorizationCode: "SPA-CAMBISTA",
      authorizationFileKey: "certificado-teste",
    })
    .returning();
  await db.insert(campaignStats).values({ campaignId: camp.id });
  return camp;
}

let telefone = 11977771000;
const comprador = () => ({ name: "Freguês do Cambista", phone: String(telefone++) });

async function main() {
  console.log("\n=== cambista e acerto ===\n");
  await limpar();

  const [orgA] = await db.insert(organizations).values({ slug: SLUGS[0], name: "Promotora A" }).returning();
  const [orgB] = await db.insert(organizations).values({ slug: SLUGS[1], name: "Promotora B" }).returning();
  await db.insert(users).values([
    { role: "organizer", organizationId: orgA.id, name: "Org A", email: EMAILS[0], passwordHash: await hashPassword(SENHA) },
    { role: "organizer", organizationId: orgB.id, name: "Org B", email: EMAILS[1], passwordHash: await hashPassword(SENHA) },
  ]);
  const campA = await rifa(orgA.id, "cambista-rifa-a");
  const campB = await rifa(orgB.id, "cambista-rifa-b");

  const admin = await new Cliente().entrar("admin@rifa.br", "admin123");
  const dA = await new Cliente().entrar(EMAILS[0], SENHA);
  const dB = await new Cliente().entrar(EMAILS[1], SENHA);

  try {
    // ---- cadastro do cambista -------------------------------------------
    let r = await dA.req("POST", "/api/admin/sellers", { name: "Cambista Um", email: EMAILS[2], password: SENHA, code: "CAMBUM", phone: "11977779001" });
    checa("a organização cadastra o cambista (201)", r.status === 201 && r.json?.code === "CAMBUM", `HTTP ${r.status}`);
    r = await dA.req("POST", "/api/admin/sellers", { name: "Cambista Dois", email: EMAILS[3], password: SENHA, code: "CAMBDOIS", organizationId: orgB.id });
    checa("o organizador não escolhe a organização do cadastro", r.status === 201, `HTTP ${r.status}`);
    const [dois] = await db.select().from(users).where(eq(users.email, EMAILS[3]));
    checa("…o cambista nasce na organização da sessão, não na do corpo", dois?.organizationId === orgA.id);
    r = await dA.req("POST", "/api/admin/sellers", { name: "Repetido", email: EMAILS[2], password: SENHA, code: "OUTRO1" });
    checa("e-mail repetido é 409", r.status === 409, `HTTP ${r.status}`);
    r = await dA.req("POST", "/api/admin/sellers", { name: "Repetido", email: "cambista-x@teste.rifa", password: SENHA, code: "CAMBUM" });
    checa("código repetido é 409", r.status === 409, `HTTP ${r.status}`);
    r = await dA.req("POST", "/api/admin/sellers", { name: "Fraco", email: "cambista-y@teste.rifa", password: "123", code: "FRACO1" });
    checa("senha fraca é 400", r.status === 400, `HTTP ${r.status}`);
    r = await dA.req("POST", "/api/admin/sellers", { name: "Sem código", email: "cambista-z@teste.rifa", password: SENHA });
    checa("faltando o código é 400", r.status === 400, `HTTP ${r.status}`);
    r = await dB.req("POST", "/api/admin/sellers", { name: "Cambista B", email: EMAILS[4], password: SENHA, code: "CAMBB1" });
    checa("a vizinha cadastra o dela", r.status === 201, `HTTP ${r.status}`);

    const c1 = await new Cliente().entrar(EMAILS[2], SENHA);
    const c2 = await new Cliente().entrar(EMAILS[3], SENHA);
    const cb = await new Cliente().entrar(EMAILS[4], SENHA);

    // ---- tela de abrir o dia --------------------------------------------
    r = await c1.req("GET", "/api/seller/overview");
    const slugs: string[] = (r.json?.campanhas ?? []).map((c: any) => c.slug);
    checa("o cambista vê só as rifas da organização dele", slugs.includes("cambista-rifa-a") && !slugs.includes("cambista-rifa-b"), slugs.join(","));
    checa("…e o acerto em aberto começa zerado", r.json?.acerto?.orderCount === 0 && r.json?.acerto?.netCents === 0);
    r = await new Cliente().req("GET", "/api/seller/overview");
    checa("sem sessão, 401", r.status === 401, `HTTP ${r.status}`);
    r = await dA.req("GET", "/api/seller/overview");
    checa("o organizador não entra na tela do cambista (403)", r.status === 403, `HTTP ${r.status}`);

    // ---- reservar, cancelar, confirmar ----------------------------------
    r = await c1.req("POST", "/api/seller/sales", { campaignId: campB.id, quantity: 1, buyer: comprador() });
    checa("rifa de outra organização é 404", r.status === 404, `HTTP ${r.status}`);

    const reservadas = async (campanha: string) =>
      Number((await db.execute(sql`select count(*) as n from quota_alloc where campaign_id = ${campanha}::uuid`)).rows[0].n);

    r = await c1.req("POST", "/api/seller/sales", { campaignId: campA.id, quantity: 3, buyer: comprador() });
    checa("reserva 3 cotas (201), com o total do servidor", r.status === 201 && r.json?.numbers?.length === 3 && r.json?.amountCents === 3000, `HTTP ${r.status} ${JSON.stringify(r.json)}`);
    const venda1 = r.json.code as number;
    checa("a cota fica presa antes de cobrar", (await reservadas(campA.id)) === 3);

    r = await c1.req("POST", `/api/seller/sales/${venda1}/cancel`);
    checa("cancelar devolve a venda (200)", r.status === 200 && r.json?.canceled === venda1, `HTTP ${r.status}`);
    checa("…e as cotas voltam na hora", (await reservadas(campA.id)) === 0);
    r = await c1.req("POST", `/api/seller/sales/${venda1}/cancel`);
    checa("cancelar de novo é 409", r.status === 409, `HTTP ${r.status}`);
    r = await c1.req("POST", `/api/seller/sales/${venda1}/confirm`, { method: "dinheiro" });
    checa("confirmar venda cancelada é 409", r.status === 409, `HTTP ${r.status}`);

    r = await c1.req("POST", "/api/seller/sales", { campaignId: campA.id, quantity: 2, buyer: comprador() });
    const venda2 = r.json.code as number;
    r = await c2.req("POST", `/api/seller/sales/${venda2}/confirm`, { method: "dinheiro" });
    checa("o colega não confirma a venda dos outros (404)", r.status === 404, `HTTP ${r.status}`);
    r = await c2.req("POST", `/api/seller/sales/${venda2}/cancel`);
    checa("nem cancela (404)", r.status === 404, `HTTP ${r.status}`);
    r = await cb.req("POST", `/api/seller/sales/${venda2}/confirm`, { method: "dinheiro" });
    checa("o cambista da vizinha também não (404)", r.status === 404, `HTTP ${r.status}`);
    r = await c1.req("POST", `/api/seller/sales/${venda2}/confirm`, { method: "cartao" });
    checa("meio de pagamento desconhecido é 400", r.status === 400, `HTTP ${r.status}`);
    r = await c1.req("POST", `/api/seller/sales/999999999/confirm`, { method: "dinheiro" });
    checa("venda que não existe é 404", r.status === 404, `HTTP ${r.status}`);
    r = await c1.req("POST", `/api/seller/sales/${venda2}/confirm`, { method: "dinheiro" });
    checa("o dono confirma (200, paga, com bilhete)", r.status === 200 && r.json?.status === "paid" && Boolean(r.json?.ticket), `HTTP ${r.status}`);
    r = await c1.req("POST", `/api/seller/sales/${venda2}/confirm`, { method: "dinheiro" });
    checa("confirmar de novo não duplica (200, já paga)", r.status === 200 && r.json?.status === "paid", `HTTP ${r.status}`);
    r = await c1.req("POST", `/api/seller/sales/${venda2}/cancel`);
    checa("cancelar venda paga é 409", r.status === 409, `HTTP ${r.status}`);

    // mais duas vendas pagas, para o acerto ter o que somar
    for (const q of [1, 4]) {
      const s = await c1.req("POST", "/api/seller/sales", { campaignId: campA.id, quantity: q, buyer: comprador() });
      await c1.req("POST", `/api/seller/sales/${s.json.code}/confirm`, { method: q === 1 ? "dinheiro" : "pix_maquininha" });
    }

    r = await c1.req("GET", "/api/seller/sales");
    const minhas: any[] = r.json ?? [];
    checa("a lista traz só as vendas dele (3 pagas e a cancelada)", minhas.length === 4 && minhas.filter((v) => v.status === "paid").length === 3, `${minhas.length}`);
    r = await c2.req("GET", "/api/seller/sales");
    checa("o colega não vê nenhuma", Array.isArray(r.json) && r.json.length === 0);

    r = await c1.req("GET", "/api/seller/settlement");
    const aberto = r.json?.aberto;
    checa("o acerto em aberto soma as 3 vendas pagas", aberto?.orderCount === 3 && aberto?.grossCents === 7000, JSON.stringify(aberto));
    checa("líquido = recolhido − comissão", aberto?.netCents === aberto?.grossCents - aberto?.commissionCents && aberto?.commissionCents > 0, JSON.stringify(aberto));

    // ---- a plataforma e o recorte ---------------------------------------
    r = await dA.req("GET", "/api/admin/settlements");
    const emAbertoA = (r.json?.emAberto ?? []).map((x: any) => x.code);
    checa("a organização vê o em aberto do cambista dela", emAbertoA.includes("CAMBUM"), emAbertoA.join(","));
    r = await dB.req("GET", "/api/admin/settlements");
    const emAbertoB = (r.json?.emAberto ?? []).map((x: any) => x.code);
    checa("a vizinha não vê o cambista da outra", !emAbertoB.includes("CAMBUM"), emAbertoB.join(","));
    const [cambUm] = await db.execute(sql`select a.id from affiliates a where a.code = 'CAMBUM'`).then((x) => x.rows as any[]);
    r = await dB.req("POST", `/api/admin/settlements/${cambUm.id}/close`);
    checa("a vizinha não fecha o acerto do cambista alheio (404)", r.status === 404, `HTTP ${r.status}`);
    r = await c1.req("POST", `/api/admin/settlements/${cambUm.id}/close`);
    checa("o cambista não fecha o próprio acerto (403)", r.status === 403, `HTTP ${r.status}`);

    // ---- fechar: cinco ao mesmo tempo, um acerto só ----------------------
    const rs = await Promise.all(Array.from({ length: 5 }, () => dA.req("POST", `/api/admin/settlements/${cambUm.id}/close`)));
    const criados = rs.filter((x) => x.status === 201);
    const feitos = await db.select().from(settlements).where(eq(settlements.sellerId, cambUm.id));
    checa("cinco fechamentos simultâneos: um 201 e quatro 400", criados.length === 1 && rs.filter((x) => x.status === 400).length === 4, rs.map((x) => x.status).join(","));
    checa("…um acerto só no banco", feitos.length === 1, `${feitos.length}`);
    const acerto = feitos[0];
    checa("o acerto fecha com o que estava em aberto", acerto?.orderCount === 3 && acerto.grossCents === 7000 && acerto.netCents === 7000 - acerto.commissionCents);
    const carimbadas = Number((await db.execute(sql`select count(*) as n from orders where settlement_id = ${acerto.id}::uuid`)).rows[0].n);
    checa("…e as 3 vendas ficam carimbadas", carimbadas === 3, `${carimbadas}`);
    r = await dA.req("POST", `/api/admin/settlements/${cambUm.id}/close`);
    checa("sem venda nova, não há o que fechar (400)", r.status === 400, `HTTP ${r.status}`);
    r = await c1.req("GET", "/api/seller/settlement");
    checa("o em aberto do cambista zera e o histórico ganha o acerto", r.json?.aberto?.orderCount === 0 && r.json?.historico?.length === 1, JSON.stringify(r.json?.aberto));

    // venda nova depois do fechamento entra no acerto seguinte, nunca no anterior
    const nova = await c1.req("POST", "/api/seller/sales", { campaignId: campA.id, quantity: 1, buyer: comprador() });
    await c1.req("POST", `/api/seller/sales/${nova.json.code}/confirm`, { method: "dinheiro" });
    r = await c1.req("GET", "/api/seller/settlement");
    checa("a venda de depois cai no acerto seguinte", r.json?.aberto?.orderCount === 1 && r.json?.aberto?.grossCents === 1000, JSON.stringify(r.json?.aberto));

    // ---- dar baixa -------------------------------------------------------
    r = await dB.req("POST", `/api/admin/settlements/${acerto.id}/paid`);
    checa("a vizinha não dá baixa no acerto alheio (404)", r.status === 404, `HTTP ${r.status}`);
    r = await dA.req("POST", `/api/admin/settlements/${randomUuid()}/paid`);
    checa("acerto que não existe é 404", r.status === 404, `HTTP ${r.status}`);
    r = await dA.req("POST", `/api/admin/settlements/${acerto.id}/paid`);
    checa("a organização dá baixa (200, pago)", r.status === 200 && r.json?.status === "pago", `HTTP ${r.status}`);
    const [pago1] = await db.select().from(settlements).where(eq(settlements.id, acerto.id));
    const rb = await Promise.all([1, 2, 3].map(() => dA.req("POST", `/api/admin/settlements/${acerto.id}/paid`)));
    checa("dar baixa de novo é 409, sem mexer na data", rb.every((x) => x.status === 409), rb.map((x) => x.status).join(","));
    const [pago2] = await db.select().from(settlements).where(eq(settlements.id, acerto.id));
    checa("…a data da primeira baixa fica", pago1.settledAt?.getTime() === pago2.settledAt?.getTime());

    // a plataforma enxerga os dois lados
    r = await admin.req("GET", "/api/admin/settlements");
    const todos = (r.json?.historico ?? []).map((h: any) => h.sellerCode ?? h.settlement?.sellerId);
    checa("a plataforma vê o acerto do cambista", JSON.stringify(r.json?.historico ?? []).includes(acerto.id));
    void todos;

    // ---- confirmar e cancelar ao mesmo tempo: nunca os dois "ok" ----------
    // A tela trava os dois botões enquanto um corre, mas a rede pode repetir
    // e o servidor decide sozinho: venda paga não é "cancelada" (o cambista
    // devolveria o dinheiro de uma venda que entra no acerto), e venda
    // devolvida não é "confirmada" (o bilhete sairia sem cota nenhuma).
    let corridas = 0;
    for (let i = 0; i < 6; i++) {
      const s = await c1.req("POST", "/api/seller/sales", { campaignId: campA.id, quantity: 1, buyer: comprador() });
      const code = s.json.code as number;
      const [conf, canc] = await Promise.all([
        c1.req("POST", `/api/seller/sales/${code}/confirm`, { method: "dinheiro" }),
        c1.req("POST", `/api/seller/sales/${code}/cancel`),
      ]);
      const [fim] = await db.select({ status: orders.status }).from(orders).where(eq(orders.code, code));
      const coerente =
        (conf.status === 200 && canc.status === 409 && fim.status === "paid") ||
        (canc.status === 200 && conf.status === 409 && fim.status === "expired");
      if (coerente) corridas++;
      else checa(`corrida ${i}: confirmar ${conf.status}, cancelar ${canc.status}, ficou ${fim.status}`, false);
      if (conf.status === 409) checa("…o 409 da confirmação fala português", !/expired|pending|refunded/.test(conf.json?.message ?? ""), conf.json?.message);
    }
    checa("confirmar e cancelar ao mesmo tempo: sempre um 200 e um 409, e o banco concorda", corridas === 6, `${corridas}/6`);

    const resto = await db.select({ id: quotaAlloc.number }).from(quotaAlloc).where(eq(quotaAlloc.campaignId, campB.id));
    checa("nada foi reservado na rifa da vizinha", resto.length === 0);
    const ped = await db.select({ id: orders.id }).from(orders).where(eq(orders.campaignId, campB.id));
    checa("…nem pedido gravado nela", ped.length === 0);

    // ====================================================================
    // Auditoria do acesso cambista (docs/AUDITORIA-ACESSO-CAMBISTA.md)
    // ====================================================================
    console.log("\n  auditoria do acesso cambista");

    const statusDo = async (code: number) =>
      (await db.select({ s: orders.status }).from(orders).where(eq(orders.code, code)))[0]?.s;

    // ---- o código da venda na URL: o que não é número não existe (nunca 500)
    {
      const ruins = ["abc", "12.5", "1e3", "2147483648", "99999999999999", "Infinity", "NaN", "1,2", "undefined", "0", "-1", "0x10"];
      const respostas: number[] = [];
      for (const c of ruins) {
        respostas.push((await c1.req("POST", `/api/seller/sales/${encodeURIComponent(c)}/confirm`, { method: "dinheiro" })).status);
        respostas.push((await c1.req("POST", `/api/seller/sales/${encodeURIComponent(c)}/cancel`)).status);
      }
      checa("código de venda fora do formato: 404 em confirmar e cancelar, nunca 500", respostas.every((s) => s === 404), respostas.join(","));
      r = await c1.req("POST", "/api/public/tickets/abc/printed");
      checa("…e marcar bilhete impresso com código ruim também é 404", r.status === 404, `HTTP ${r.status}`);
    }

    // ---- o meio e o comprovante da maquininha (o bilhete é público e impresso)
    {
      const s = await c1.req("POST", "/api/seller/sales", { campaignId: campA.id, quantity: 1, buyer: comprador() });
      const code = s.json.code as number;
      const ruins: [string, unknown][] = [
        ["meio em lista", { method: ["dinheiro"] }],
        ["meio em objeto", { method: { a: 1 } }],
        ["meio nulo", { method: null }],
        ["comprovante em objeto", { method: "pix_maquininha", posAuthCode: { a: 1 } }],
        ["comprovante com texto livre (Pix por fora no bilhete)", { method: "pix_maquininha", posAuthCode: "Pague no Pix 11999998888" }],
        ["comprovante de 200 mil letras", { method: "pix_maquininha", posAuthCode: "x".repeat(200_000) }],
        ["terminal com quebra de linha", { method: "pix_maquininha", posTerminal: "T\n1" }],
        ["terminal em lista", { method: "pix_maquininha", posTerminal: ["x"] }],
      ];
      const recusas: string[] = [];
      for (const [nome, corpo] of ruins) {
        const x = await c1.req("POST", `/api/seller/sales/${code}/confirm`, corpo);
        if (x.status !== 400) recusas.push(`${nome}: ${x.status}`);
      }
      checa("meio e comprovante fora do formato: 400", recusas.length === 0, recusas.join("; "));
      checa("…e a venda segue pendente (nada foi cobrado nem gravado)", (await statusDo(code)) === "pending");
      r = await c1.req("POST", `/api/seller/sales/${code}/confirm`, { method: "pix_maquininha", posAuthCode: "NSU-123/A", posTerminal: "Ton POS Android" });
      checa("o comprovante certo passa e a venda fica paga", r.status === 200 && r.json?.status === "paid", `HTTP ${r.status}`);
      const [gravada] = await db.select().from(orders).where(eq(orders.code, code));
      checa("…com o meio e o comprovante gravados", gravada.method === "pix_maquininha" && gravada.posAuthCode === "NSU-123/A" && gravada.posTerminal === "Ton POS Android");
    }

    // ---- número repetido no pedido é um número só (o preço conta o que se reserva)
    {
      r = await c1.req("POST", "/api/seller/sales", { campaignId: campA.id, numbers: [7777, 7777, 7777], buyer: comprador() });
      const [ped] = await db.select().from(orders).where(eq(orders.code, r.json?.code ?? 0));
      checa("[7777, 7777, 7777] reserva 1 cota e cobra 1 (antes cobrava 3)", r.status === 201 && r.json?.numbers?.length === 1 && r.json?.amountCents === 1000 && ped?.quantity === 1, JSON.stringify(r.json));
      await c1.req("POST", `/api/seller/sales/${r.json.code}/cancel`);
    }

    // ---- o que a tela oferece é só o que vende ----------------------------
    {
      const demo = await rifa(orgA.id, "cambista-demo");
      await db.update(campaigns).set({ demonstracao: true }).where(eq(campaigns.id, demo.id));
      const travada = await rifa(orgA.id, "cambista-travada");
      await db.update(campaigns).set({ travadaEm: new Date() }).where(eq(campaigns.id, travada.id));
      const rascunho = await rifa(orgA.id, "cambista-rascunho");
      await db.update(campaigns).set({ status: "draft", publishedAt: null }).where(eq(campaigns.id, rascunho.id));
      r = await c1.req("GET", "/api/seller/overview");
      const slugs: string[] = (r.json?.campanhas ?? []).map((c: any) => c.slug);
      checa("demonstração, rifa travada e rascunho não são oferecidas", slugs.includes("cambista-rifa-a") && !slugs.some((s) => ["cambista-demo", "cambista-travada", "cambista-rascunho"].includes(s)), slugs.join(","));
      r = await c1.req("POST", "/api/seller/sales", { campaignId: demo.id, quantity: 1, buyer: comprador() });
      checa("vender a demonstração é 409", r.status === 409, `HTTP ${r.status}`);
      r = await c1.req("POST", "/api/seller/sales", { campaignId: travada.id, quantity: 1, buyer: comprador() });
      checa("vender a rifa travada pela plataforma é 409", r.status === 409, `HTTP ${r.status}`);
      r = await c1.req("POST", "/api/seller/sales", { campaignId: rascunho.id, quantity: 1, buyer: comprador() });
      checa("vender o rascunho é 409", r.status === 409, `HTTP ${r.status}`);
    }

    // ---- preço e meio vêm do servidor, nunca do corpo ----------------------
    {
      r = await c1.req("POST", "/api/seller/sales", { campaignId: campA.id, quantity: 2, buyer: comprador(), amountCents: 1, totalCents: 1, priceCents: 1, method: "pix_online", couponCode: "QUALQUER", affiliateCode: "SERGIO" });
      const [ped] = await db.select().from(orders).where(eq(orders.code, r.json?.code ?? 0));
      checa("preço, meio, cupom e afiliado do corpo são ignorados", r.status === 201 && ped?.amountCents === 2000 && ped.method === "dinheiro" && ped.couponId === null && ped.affiliateId === ped.sellerId, JSON.stringify(r.json));
      await c1.req("POST", `/api/seller/sales/${r.json.code}/cancel`);
    }

    // ---- cambista sem organização não entra e não vende -------------------
    {
      r = await dA.req("POST", "/api/admin/sellers", { name: "Cambista Limite", email: EMAILS[6], password: SENHA, code: "CAMBLIM" });
      checa("(cadastra o cambista do teto)", r.status === 201, `HTTP ${r.status}`);
      const [uNulo] = await db.insert(users).values({ role: "cambista", organizationId: null, name: "Sem organização", email: EMAILS[5], passwordHash: await hashPassword(SENHA) }).returning();
      await db.insert(affiliates).values({ userId: uNulo.id, code: "CAMBNULO", kind: "cambista", status: "active", approvedAt: new Date() });
      r = await new Cliente().req("POST", "/api/auth/login", { email: EMAILS[5], password: SENHA });
      checa("cambista sem organização não entra (o recorte nulo é o da plataforma)", r.status === 401, `HTTP ${r.status}`);
      // a sessão que já estava aberta cai quando a organização some
      const lim = await new Cliente().entrar(EMAILS[6], SENHA);
      await db.execute(sql`update users set organization_id = null where email = ${EMAILS[6]}`);
      r = await lim.req("GET", "/api/seller/overview");
      checa("…e a sessão já aberta cai quando a organização some", r.status === 401, `HTTP ${r.status}`);
      await db.execute(sql`update users set organization_id = ${orgA.id}::uuid where email = ${EMAILS[6]}`);
    }

    // ---- privilégio: o cambista não alcança o painel nem o afiliado ---------
    {
      const alvos: [string, string][] = [
        ["GET", "/api/admin/overview"], ["GET", "/api/admin/orders"], ["GET", "/api/admin/settlements"], ["GET", "/api/admin/usuarios"],
        ["GET", "/api/admin/campaigns"], ["GET", "/api/admin/payment-methods"], ["PUT", "/api/admin/payment-methods"], ["POST", "/api/admin/sellers"],
        ["GET", "/api/admin/exportacoes/pedidos"], ["GET", "/api/admin/2fa"], ["POST", "/api/admin/2fa/setup"],
        ["GET", "/api/affiliate/overview"], ["GET", "/api/affiliate/saldo"], ["POST", "/api/affiliate/payouts"], ["GET", "/api/ia/sessao"],
      ];
      const fora: string[] = [];
      for (const [m, p] of alvos) {
        const x = await c1.req(m, p, m === "GET" ? undefined : {});
        if (x.status !== 403) fora.push(`${m} ${p}: ${x.status}`);
      }
      checa("o cambista é 403 no painel, no afiliado e no assistente", fora.length === 0, fora.join("; "));
    }

    // ---- o bilhete: marcar impresso é de quem vendeu -----------------------
    {
      const s = await c1.req("POST", "/api/seller/sales", { campaignId: campA.id, quantity: 1, buyer: comprador() });
      const code = s.json.code as number;
      await c1.req("POST", `/api/seller/sales/${code}/confirm`, { method: "dinheiro" });
      const impresso = async () => (await db.select({ t: orders.ticketPrintedAt }).from(orders).where(eq(orders.code, code)))[0]?.t;
      r = await c2.req("POST", `/api/public/tickets/${code}/printed`);
      const colega = r.status;
      r = await cb.req("POST", `/api/public/tickets/${code}/printed`);
      const vizinha = r.status;
      checa("o colega e o cambista da vizinha não mexem na trilha do bilhete (404)", colega === 404 && vizinha === 404 && (await impresso()) === null, `${colega}/${vizinha}`);
      r = await c1.req("POST", `/api/public/tickets/${code}/printed`);
      checa("quem vendeu marca o bilhete impresso", r.status === 200 && (await impresso()) !== null, `HTTP ${r.status}`);
    }

    // ---- confirmar com meios diferentes ao mesmo tempo: um meio só no pedido
    {
      const s = await c1.req("POST", "/api/seller/sales", { campaignId: campA.id, quantity: 1, buyer: comprador() });
      const code = s.json.code as number;
      const rs2 = await Promise.all(
        ["dinheiro", "pix_maquininha", "dinheiro", "pix_maquininha", "dinheiro", "pix_maquininha"].map((method) =>
          c1.req("POST", `/api/seller/sales/${code}/confirm`, { method }),
        ),
      );
      const [fim] = await db.select().from(orders).where(eq(orders.code, code));
      const metodos = new Set(rs2.map((x) => x.json?.ticket?.pagamento?.metodo));
      checa("seis confirmações com dois meios: todas 200, uma só paga, um meio só nos bilhetes", rs2.every((x) => x.status === 200) && fim.status === "paid" && metodos.size === 1, `${rs2.map((x) => x.status).join(",")} ${[...metodos].join("|")}`);
      checa("…e o meio gravado é um dos dois", fim.method === "dinheiro" || fim.method === "pix_maquininha");
    }

    // ---- meio desligado pela administração: barrado no servidor ------------
    const meiosAntes = (await admin.req("GET", "/api/admin/payment-methods")).json;
    try {
      const s = await c1.req("POST", "/api/seller/sales", { campaignId: campA.id, quantity: 1, buyer: comprador() });
      const code = s.json.code as number;
      await admin.req("PUT", "/api/admin/payment-methods", { ...meiosAntes, dinheiro: false });
      r = await c1.req("POST", `/api/seller/sales/${code}/confirm`, { method: "dinheiro" });
      checa("dinheiro desligado: confirmar é 409 e a venda segue pendente", r.status === 409 && (await statusDo(code)) === "pending", `HTTP ${r.status}`);
      r = await c1.req("GET", "/api/seller/overview");
      checa("…e a tela deixa de oferecê-lo", Array.isArray(r.json?.meios) && !r.json.meios.includes("dinheiro") && r.json.meios.includes("pix_maquininha"));
      await admin.req("PUT", "/api/admin/payment-methods", { ...meiosAntes, dinheiro: false, pix_maquininha: false });
      r = await c1.req("POST", "/api/seller/sales", { campaignId: campA.id, quantity: 1, buyer: comprador() });
      checa("nenhum meio da mão ligado: nem reservar (409)", r.status === 409, `HTTP ${r.status}`);
      await admin.req("PUT", "/api/admin/payment-methods", meiosAntes);
      r = await c1.req("POST", `/api/seller/sales/${code}/cancel`);
      checa("…cancelar segue funcionando", r.status === 200, `HTTP ${r.status}`);
    } finally {
      await admin.req("PUT", "/api/admin/payment-methods", meiosAntes);
    }

    // ---- bloqueio manual vale para o cambista (a isenção é só dos limites) --
    {
      const bloqueado = "11977779555";
      const b = await admin.req("POST", "/api/admin/antifraude/bloqueios", { kind: "phone", value: bloqueado, reason: "auditoria cambista" });
      try {
        r = await c1.req("POST", "/api/seller/sales", { campaignId: campA.id, quantity: 1, buyer: { name: "Bloqueado", phone: bloqueado } });
        const gravou = Number((await db.execute(sql`select count(*) as n from orders o join buyers b on b.id = o.buyer_id where b.phone = ${bloqueado}`)).rows[0].n);
        checa("telefone bloqueado pela administração não compra nem na mão (429), e nada é gravado", r.status === 429 && gravou === 0, `HTTP ${r.status}, ${gravou} pedido(s)`);
      } finally {
        if (b.json?.id) await admin.req("DELETE", `/api/admin/antifraude/bloqueios/${b.json.id}`);
      }
    }

    // ---- sessão: a troca de senha derruba a sessão copiada ------------------
    {
      const copia = await new Cliente().entrar(EMAILS[2], SENHA);
      r = await c1.req("POST", "/api/auth/senha", { atual: "errada-1234", nova: "senha-cambista-2" });
      checa("trocar a senha com a atual errada é 401", r.status === 401, `HTTP ${r.status}`);
      r = await c1.req("POST", "/api/auth/senha", { atual: SENHA, nova: "senha-cambista-2" });
      checa("trocar a senha (200)", r.status === 200, `HTTP ${r.status}`);
      r = await copia.req("GET", "/api/seller/overview");
      checa("a sessão copiada cai (401)", r.status === 401, `HTTP ${r.status}`);
      r = await c1.req("GET", "/api/seller/overview");
      checa("…e a de quem trocou segue", r.status === 200, `HTTP ${r.status}`);
      r = await new Cliente().req("POST", "/api/auth/login", { email: EMAILS[2], password: SENHA });
      checa("a senha antiga não entra mais", r.status === 401, `HTTP ${r.status}`);
      r = await c1.req("POST", "/api/auth/senha", { atual: "senha-cambista-2", nova: SENHA });
      checa("(volta a senha de antes)", r.status === 200, `HTTP ${r.status}`);
    }

    // ---- acerto: observação é texto curto; organização do cadastro existe ---
    {
      r = await dA.req("POST", `/api/admin/settlements/${cambUm.id}/close`, { notes: { a: 1 } });
      checa("observação do acerto em objeto: 400", r.status === 400, `HTTP ${r.status}`);
      r = await dA.req("POST", `/api/admin/settlements/${cambUm.id}/close`, { notes: "x".repeat(501) });
      checa("observação do acerto com mais de 500 letras: 400", r.status === 400, `HTTP ${r.status}`);
      const antes = Number((await db.execute(sql`select count(*) as n from settlements where seller_id = ${cambUm.id}::uuid`)).rows[0].n);
      checa("…e nenhum acerto foi fechado por isso", antes === 1, `${antes}`);
      for (const org of ["abc", "00000000-0000-4000-8000-000000000000", { a: 1 }]) {
        r = await admin.req("POST", "/api/admin/sellers", { name: "Sem dona", email: "cambista-sem-dona@teste.rifa", password: SENHA, code: "SEMDONA", organizationId: org });
        checa(`a plataforma cadastra cambista em organização ${JSON.stringify(org)}: 400 ou 404, nunca 500`, r.status === 400 || r.status === 404, `HTTP ${r.status}`);
      }
    }

    // ---- reservas grandes ao mesmo tempo: deadlock não vira 500 -------------
    {
      const faixas: number[] = [];
      let telP = 11977778000;
      for (let rodada = 0; rodada < 2; rodada++) {
        const rs3 = await Promise.all(
          Array.from({ length: 5 }, () =>
            c1.req("POST", "/api/seller/sales", { campaignId: campA.id, quantity: 600, buyer: { name: "Grande", phone: String(telP++) } }),
          ),
        );
        faixas.push(...rs3.map((x) => x.status));
      }
      checa("dez reservas de 600 cotas em duas rodadas de cinco: nenhuma 5xx, e as que entram trazem 600", faixas.every((s) => s === 201 || s === 409) && faixas.includes(201), faixas.join(","));
      const duplicadas = Number((await db.execute(sql`select count(*) - count(distinct number) as n from quota_alloc where campaign_id = ${campA.id}::uuid`)).rows[0].n);
      checa("…e nenhuma cota foi vendida duas vezes", duplicadas === 0, `${duplicadas}`);
      const incompletos = Number((await db.execute(sql`
        select count(*) as n from orders o
         where o.campaign_id = ${campA.id}::uuid and o.status = 'pending' and o.quantity = 600
           and (select count(*) from quota_alloc q where q.order_id = o.id) <> 600`)).rows[0].n);
      checa("…nem pedido com menos cota do que cobra", incompletos === 0, `${incompletos}`);
    }

    // ---- "vendas de hoje" é o dia de São Paulo, não o do banco (UTC) --------
    {
      const [aff2] = await db.select({ id: affiliates.id }).from(affiliates).innerJoin(users, eq(users.id, affiliates.userId)).where(eq(users.email, EMAILS[3]));
      const [fregues] = await db.insert(buyers).values({ name: "Freguês do dia", phone: "11977779801" }).returning();
      // São Paulo é UTC−3 o ano todo (sem horário de verão): a meia-noite de lá é 03:00 UTC.
      const agoraSp = new Date(Date.now() - 3 * 3_600_000);
      const inicio = new Date(Date.UTC(agoraSp.getUTCFullYear(), agoraSp.getUTCMonth(), agoraSp.getUTCDate(), 3));
      const vendas = [
        { code: 77_100_001, quantity: 3, paidAt: new Date(inicio.getTime() - 60_000) },
        { code: 77_100_002, quantity: 4, paidAt: inicio },
      ];
      for (const v of vendas) {
        await db.insert(orders).values({ code: v.code, campaignId: campA.id, buyerId: fregues.id, sellerId: aff2.id, method: "dinheiro", quantity: v.quantity, amountCents: v.quantity * 1000, status: "paid", paidAt: v.paidAt, expiresAt: new Date(Date.now() + 86_400_000) });
      }
      r = await c2.req("GET", "/api/seller/overview");
      checa("vendas de hoje: a de um minuto antes da meia-noite de São Paulo não conta, a da meia-noite conta", r.json?.hoje?.vendas === 1 && r.json?.hoje?.cotas === 4, JSON.stringify(r.json?.hoje));
    }

    // ---- teto de vendas novas por cambista ----------------------------------
    {
      const lim = await new Cliente().entrar(EMAILS[6], SENHA);
      const [aff] = await db.select({ id: affiliates.id }).from(affiliates).innerJoin(users, eq(users.id, affiliates.userId)).where(eq(users.email, EMAILS[6]));
      const status: number[] = [];
      for (let i = 0; i < 125; i++) {
        const x = await lim.req("POST", "/api/seller/sales", { campaignId: campA.id, quantity: 1, buyer: comprador() });
        status.push(x.status);
      }
      const ok = status.filter((s) => s === 201).length;
      const barradas = status.filter((s) => s === 429).length;
      checa("125 vendas seguidas: as 120 primeiras entram e o resto é 429", ok === 120 && barradas === 5 && status.slice(0, 120).every((s) => s === 201), `${ok} ok, ${barradas} barradas, outros ${status.filter((s) => s !== 201 && s !== 429).join(",")}`);
      const gravadas = Number((await db.execute(sql`select count(*) as n from orders where seller_id = ${aff.id}::uuid`)).rows[0].n);
      checa("…e a barrada não grava pedido nem prende cota", gravadas === 120, `${gravadas}`);
      const ultima = (await db.execute(sql`select code from orders where seller_id = ${aff.id}::uuid order by created_at desc limit 1`)).rows[0] as { code: number };
      r = await lim.req("POST", `/api/seller/sales/${ultima.code}/cancel`);
      checa("o teto não impede de cancelar nem de fechar o dia", r.status === 200, `HTTP ${r.status}`);
    }
  } finally {
    await limpar();
  }
  console.log(falhas ? `\n${falhas} falha(s)` : "\ntudo certo");
  await pool.end();
  process.exit(falhas ? 1 : 0);
}

function randomUuid() {
  return "00000000-0000-4000-8000-000000000000";
}

main().catch(async (e) => {
  console.error(e);
  await limpar().catch(() => {});
  await pool.end();
  process.exit(1);
});
