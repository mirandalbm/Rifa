/**
 * Prova de editar, adiar e excluir rifa, pela API de verdade:
 *
 * - excluir: rascunho e rifa no ar sem venda saem de vez; com cota tomada
 *   ou venda paga, não (422);
 * - editar: rascunho muda na hora; publicada, a organização pede (202) e a
 *   rifa só muda com a aprovação; o prêmio nunca muda; o PATCH genérico não
 *   serve de atalho (409); um pedido em análise por vez (409);
 * - adiar: regras da meta e da data; aprovado, muda a data, guarda a de
 *   antes, conta o adiamento e empurra a comissão que esperava o sorteio;
 * - decidir é só da plataforma (403), recusar pede explicação, e dois
 *   cliques dão uma decisão (409).
 *
 *   npm run solicitacoes      (com `npm run dev` no ar e o seed aplicado)
 */
import "dotenv/config";
import { baseUrl } from "./base-url";
import { eq, like, sql } from "drizzle-orm";
import { db, pool } from "../server/db";
import {
  affiliates,
  buyers,
  campaignStats,
  campaigns,
  campanhaSolicitacoes,
  commissions,
  orders,
  users,
} from "../shared/schema";

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

const PREFIXO = "solic-teste-";
// Comprador e afiliado próprios: o banco do CI só tem o seed.
const TELEFONE = "11900005544";
const EMAIL_AFILIADO = "afiliado@solic-teste.br";
const DIA = 86_400_000;

async function limpar() {
  const minhas = sql`(select id from campaigns where slug like ${PREFIXO + "%"})`;
  await db.execute(sql`delete from commissions where campaign_id in ${minhas}`);
  await db.execute(sql`delete from quota_alloc where campaign_id in ${minhas}`);
  await db.execute(sql`delete from orders where campaign_id in ${minhas}`);
  await db.delete(campaigns).where(like(campaigns.slug, `${PREFIXO}%`));
  await db.execute(sql`delete from affiliates where user_id in (select id from users where email = ${EMAIL_AFILIADO})`);
  await db.delete(users).where(eq(users.email, EMAIL_AFILIADO));
  await db.delete(buyers).where(eq(buyers.phone, TELEFONE));
}

async function main() {
  console.log("\n=== editar, adiar e excluir rifa ===\n");
  await limpar();

  const admin = new Cliente();
  let r = await admin.req("POST", "/api/auth/login", { email: "admin@rifa.br", password: "admin123" });
  if (r.status !== 200) throw new Error(`login do administrador: HTTP ${r.status}`);
  const marina = new Cliente();
  r = await marina.req("POST", "/api/auth/login", { email: "marina@rifassaojose.br", password: "organizador123" });
  if (r.status !== 200) throw new Error(`login da organizadora: HTTP ${r.status}`);
  const [eu] = await db.select({ org: users.organizationId }).from(users).where(eq(users.email, "marina@rifassaojose.br"));
  const orgId = eu.org!;

  async function rifa(nome: string, status: "draft" | "published", extra: Partial<typeof campaigns.$inferInsert> = {}) {
    const [c] = await db
      .insert(campaigns)
      .values({
        organizationId: orgId,
        slug: PREFIXO + nome,
        title: `Rifa ${nome}`,
        prizeTitle: `Prêmio ${nome}`,
        totalQuotas: 100,
        priceCents: 500,
        status,
        publishedAt: status === "published" ? new Date() : null,
        drawAt: new Date(Date.now() + 7 * DIA),
        authorizationCode: "SPA-SOLIC-1",
        ...extra,
      })
      .returning();
    await db.insert(campaignStats).values({ campaignId: c.id, soldCount: 0 });
    return c;
  }

  try {
    /* ------------------------------ excluir ------------------------------ */
    console.log("  excluir:");
    const rascunho = await rifa("rascunho", "draft");
    r = await marina.req("DELETE", `/api/admin/campaigns/${rascunho.id}`);
    const [some1] = await db.select().from(campaigns).where(eq(campaigns.id, rascunho.id));
    checa("organizador apaga o próprio rascunho", r.status === 200 && !some1, `HTTP ${r.status} ${r.json?.message ?? ""}`);

    const noArSemVenda = await rifa("no-ar-sem-venda", "published");
    r = await marina.req("DELETE", `/api/admin/campaigns/${noArSemVenda.id}`);
    const [some2] = await db.select().from(campaigns).where(eq(campaigns.id, noArSemVenda.id));
    checa("rifa no ar sem nenhuma cota vendida sai de vez", r.status === 200 && !some2, `HTTP ${r.status} ${r.json?.message ?? ""}`);

    const comCota = await rifa("com-cota", "published");
    await db.execute(sql`insert into quota_alloc (campaign_id, number, status, order_id, reserved_until)
      values (${comCota.id}::uuid, 7, 'reserved', gen_random_uuid(), now() + interval '10 minutes')`);
    r = await marina.req("DELETE", `/api/admin/campaigns/${comCota.id}`);
    checa("rifa com cota reservada não se apaga (422)", r.status === 422, `HTTP ${r.status}`);

    const [comprador] = await db.insert(buyers).values({ name: "Comprador Teste", phone: TELEFONE }).returning();
    const comVenda = await rifa("com-venda", "published");
    const [pago] = await db
      .insert(orders)
      .values({
        code: 90_000_000 + Math.floor(Math.random() * 9_000_000),
        campaignId: comVenda.id,
        buyerId: comprador.id,
        quantity: 1,
        amountCents: 500,
        status: "paid",
        paidAt: new Date(),
      })
      .returning();
    r = await admin.req("DELETE", `/api/admin/campaigns/${comVenda.id}`);
    checa("rifa com venda paga não se apaga nem pela plataforma (422)", r.status === 422, `HTTP ${r.status}`);

    /* ------------------------------ editar ------------------------------- */
    console.log("\n  editar:");
    const edRascunho = await rifa("editar-rascunho", "draft");
    r = await marina.req("POST", `/api/admin/campaigns/${edRascunho.id}/editar`, { prizeTitle: "Prêmio novo", title: "Título novo" });
    const [depoisR] = await db.select().from(campaigns).where(eq(campaigns.id, edRascunho.id));
    checa("rascunho muda na hora, inclusive o prêmio", r.status === 200 && r.json?.aplicada === true && depoisR.prizeTitle === "Prêmio novo", `HTTP ${r.status}`);

    const noAr = await rifa("editar-no-ar", "published");
    r = await marina.req("POST", `/api/admin/campaigns/${noAr.id}/editar`, { prizeTitle: "Outro prêmio" });
    checa("prêmio da rifa publicada não muda (422)", r.status === 422 && /prêmio/i.test(r.json?.message ?? ""), `HTTP ${r.status} ${r.json?.message ?? ""}`);
    r = await admin.req("POST", `/api/admin/campaigns/${noAr.id}/editar`, { prizeTitle: "Outro prêmio" });
    checa("nem pela plataforma (422)", r.status === 422, `HTTP ${r.status}`);
    r = await marina.req("PATCH", `/api/admin/campaigns/${noAr.id}`, { title: "Pelo atalho" });
    checa("PATCH genérico em rifa publicada não serve de atalho (409)", r.status === 409, `HTTP ${r.status}`);
    r = await marina.req("POST", `/api/admin/campaigns/${noAr.id}/editar`, { minPerOrder: 10, maxPerOrder: 5 });
    checa("máximo menor que o mínimo: recusa (422)", r.status === 422, `HTTP ${r.status}`);
    r = await marina.req("POST", `/api/admin/campaigns/${noAr.id}/editar`, {
      title: "Rifa editada",
      maxPerOrder: 300,
      motivo: "Ajuste do limite por pedido",
    });
    const pedidoEdicao = r.json?.solicitacaoId as string;
    const [aindaIgual] = await db.select().from(campaigns).where(eq(campaigns.id, noAr.id));
    checa("organizador pede: 202 com protocolo, e a rifa ainda não muda",
      r.status === 202 && /^RS-\d{8}-\d{6}$/.test(r.json?.protocolo ?? "") && aindaIgual.title === noAr.title,
      `HTTP ${r.status} ${r.json?.message ?? ""}`);
    r = await marina.req("POST", `/api/admin/campaigns/${noAr.id}/editar`, { title: "Outra edição" });
    checa("um pedido de edição em análise por vez (409)", r.status === 409, `HTTP ${r.status}`);
    r = await marina.req("GET", "/api/admin/campaigns");
    const linha = (r.json ?? []).find((x: any) => x.campaign.id === noAr.id);
    checa("a lista de campanhas mostra a edição em análise", Boolean(linha?.emAnalise?.includes("edicao")));

    r = await marina.req("POST", `/api/admin/solicitacoes/${pedidoEdicao}/mensagens`, { texto: "Pode analisar, por favor?" });
    checa("organização escreve na conversa", r.status === 201, `HTTP ${r.status}`);
    r = await admin.req("POST", `/api/admin/solicitacoes/${pedidoEdicao}/mensagens`, { texto: "Olhando agora." });
    checa("plataforma responde na conversa", r.status === 201, `HTTP ${r.status}`);
    r = await marina.req("GET", `/api/admin/solicitacoes/${pedidoEdicao}`);
    checa("detalhe traz o antes e o depois, e a conversa com \"Plataforma\"",
      r.status === 200 && r.json?.solicitacao?.alteracoes?.title?.de === noAr.title &&
        r.json?.mensagens?.some((m: any) => m.nome === "Plataforma"),
      `HTTP ${r.status}`);
    r = await marina.req("POST", `/api/admin/solicitacoes/${pedidoEdicao}/decidir`, { aprovar: true });
    checa("organizador não decide (403)", r.status === 403, `HTTP ${r.status}`);
    r = await admin.req("POST", `/api/admin/solicitacoes/${pedidoEdicao}/decidir`, { aprovar: false });
    checa("recusar sem explicação: 400", r.status === 400, `HTTP ${r.status}`);
    r = await admin.req("GET", "/api/admin/chamados/pendentes");
    checa("o menu da plataforma conta o pedido", (r.json?.solicitacoes ?? 0) >= 1, JSON.stringify(r.json));
    const [p1, p2] = await Promise.all([
      admin.req("POST", `/api/admin/solicitacoes/${pedidoEdicao}/decidir`, { aprovar: true, resposta: "Ok" }),
      admin.req("POST", `/api/admin/solicitacoes/${pedidoEdicao}/decidir`, { aprovar: true, resposta: "Ok" }),
    ]);
    const [editada] = await db.select().from(campaigns).where(eq(campaigns.id, noAr.id));
    checa("dois cliques: uma aprovação e um 409", [p1.status, p2.status].sort().join(",") === "200,409", `${p1.status},${p2.status}`);
    checa("aprovado: a rifa muda exatamente o que foi pedido",
      editada.title === "Rifa editada" && editada.maxPerOrder === 300 && editada.prizeTitle === noAr.prizeTitle);
    r = await marina.req("POST", `/api/admin/solicitacoes/${pedidoEdicao}/mensagens`, { texto: "e agora?" });
    checa("pedido encerrado não recebe mensagem (409)", r.status === 409, `HTTP ${r.status}`);

    r = await admin.req("POST", `/api/admin/campaigns/${noAr.id}/editar`, { title: "Pela plataforma" });
    const [direto] = await db.select({ title: campaigns.title }).from(campaigns).where(eq(campaigns.id, noAr.id));
    checa("a plataforma edita direto", r.status === 200 && direto.title === "Pela plataforma", `HTTP ${r.status}`);

    r = await marina.req("POST", `/api/admin/campaigns/${noAr.id}/editar`, { title: "Vou desistir" });
    const cancelavel = r.json?.solicitacaoId as string;
    r = await marina.req("POST", `/api/admin/solicitacoes/${cancelavel}/cancelar`);
    const [cancelado] = await db.select().from(campanhaSolicitacoes).where(eq(campanhaSolicitacoes.id, cancelavel));
    checa("organização cancela o próprio pedido", r.status === 200 && cancelado.status === "cancelada", `HTTP ${r.status}`);

    /* ------------------------------ adiar -------------------------------- */
    console.log("\n  adiar:");
    const esgotada = await rifa("esgotada", "published");
    await db.update(campaignStats).set({ soldCount: 100 }).where(eq(campaignStats.campaignId, esgotada.id));
    r = await marina.req("POST", `/api/admin/campaigns/${esgotada.id}/adiar`, {
      novaData: new Date(Date.now() + 30 * DIA).toISOString(),
      motivo: "Queremos mais tempo de venda",
    });
    checa("rifa esgotada bateu a meta: não adia (422)", r.status === 422, `HTTP ${r.status} ${r.json?.message ?? ""}`);
    r = await marina.req("POST", `/api/admin/campaigns/${edRascunho.id}/adiar`, {
      novaData: new Date(Date.now() + 30 * DIA).toISOString(),
      motivo: "Queremos mais tempo de venda",
    });
    checa("rascunho não adia (422)", r.status === 422, `HTTP ${r.status}`);

    const antes = comVenda.drawAt!;
    await db.update(campaignStats).set({ soldCount: 1 }).where(eq(campaignStats.campaignId, comVenda.id));
    r = await marina.req("POST", `/api/admin/campaigns/${comVenda.id}/adiar`, {
      novaData: new Date(antes.getTime() - DIA).toISOString(),
      motivo: "Queremos mais tempo de venda",
    });
    checa("nova data antes da atual: recusa (422)", r.status === 422, `HTTP ${r.status}`);
    r = await marina.req("POST", `/api/admin/campaigns/${comVenda.id}/adiar`, {
      novaData: new Date(antes.getTime() + 400 * DIA).toISOString(),
      motivo: "Queremos mais tempo de venda",
    });
    checa("adiamento longo demais: recusa (422)", r.status === 422, `HTTP ${r.status}`);
    r = await marina.req("POST", `/api/admin/campaigns/${comVenda.id}/adiar`, {
      novaData: new Date(antes.getTime() + 30 * DIA).toISOString(),
      motivo: "curto",
    });
    checa("sem motivo de verdade: recusa (422)", r.status === 422, `HTTP ${r.status}`);

    // A comissão da venda paga esperava o sorteio de antes.
    const [uAfiliado] = await db
      .insert(users)
      .values({ role: "affiliate", name: "Afiliado Teste", email: EMAIL_AFILIADO, passwordHash: "x" })
      .returning();
    const [afiliado] = await db
      .insert(affiliates)
      .values({ userId: uAfiliado.id, code: `SOLIC${Date.now() % 100000}`, status: "active" })
      .returning();
    await db.insert(commissions).values({
      affiliateId: afiliado.id,
      orderId: pago.id,
      campaignId: comVenda.id,
      amountCents: 50,
      pct: 10,
      status: "pending",
      availableAt: antes,
    });
    const nova = new Date(antes.getTime() + 30 * DIA);
    r = await marina.req("POST", `/api/admin/campaigns/${comVenda.id}/adiar`, {
      novaData: nova.toISOString(),
      motivo: "Vendemos só 1% até agora",
    });
    const pedidoAdiamento = r.json?.solicitacaoId as string;
    const [dataIgual] = await db.select({ drawAt: campaigns.drawAt }).from(campaigns).where(eq(campaigns.id, comVenda.id));
    checa("pedido de adiamento: 202 e a data ainda não muda",
      r.status === 202 && dataIgual.drawAt?.getTime() === antes.getTime(), `HTTP ${r.status} ${r.json?.message ?? ""}`);
    r = await admin.req("POST", `/api/admin/solicitacoes/${pedidoAdiamento}/decidir`, { aprovar: true, resposta: "Aprovado." });
    const [adiada] = await db.select().from(campaigns).where(eq(campaigns.id, comVenda.id));
    const [com] = await db.select().from(commissions).where(eq(commissions.orderId, pago.id));
    checa("aprovado: data nova, a de antes guardada e o adiamento contado",
      r.status === 200 && adiada.drawAt?.getTime() === nova.getTime() &&
        adiada.drawAtOriginal?.getTime() === antes.getTime() && adiada.adiamentos === 1,
      `HTTP ${r.status} ${r.json?.message ?? ""}`);
    checa("a comissão que esperava o sorteio passa a esperar a data nova", com.availableAt.getTime() === nova.getTime());
    r = await fetch(`${URL}/api/public/campaigns/${comVenda.slug}`).then(async (x) => ({ status: x.status, json: await x.json() }));
    checa("a página da rifa mostra o adiamento e a data de antes",
      r.json?.campaign?.adiamentos === 1 && new Date(r.json?.campaign?.drawAtOriginal).getTime() === antes.getTime(),
      `HTTP ${r.status}`);
  } finally {
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
