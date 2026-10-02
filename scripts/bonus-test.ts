/**
 * Prova do programa de bônus (etapa 13), pela API de verdade:
 *
 * - desligado (padrão), não existe para o apostador; só a plataforma liga
 *   (organizador: 403), e ligar não mexe no resto da configuração;
 * - visita nova pelo link conta uma vez por aparelho; meta alcançada credita
 *   uma vez;
 * - a primeira compra paga do indicado credita quem indicou (webhook
 *   repetido não dobra); autoindicação não conta;
 * - resgate só em rifa cujo regulamento prevê cota de bônus, com saldo, e
 *   pelo caminho de reserva de sempre: pedido de R$ 0,00, cotas pagas, sem
 *   comissão; cota de bônus não tem reembolso;
 * - estornar a compra que confirmou a indicação tira o bônus;
 * - a marcação da rifa trava ao publicar e entra no regulamento.
 *
 *   npm run bonus      (com `npm run dev` no ar e sem WhatsApp configurado)
 */
import "dotenv/config";
import { baseUrl } from "./base-url";
import sharp from "sharp";
import { and, eq, inArray, sql } from "drizzle-orm";
import { db, pool } from "../server/db";
import { hashPassword } from "../server/auth";
import { refundOrder } from "../server/services/orders";
import { appSettings, buyers, campaignStats, campaigns, commissions, indicacoes, orders, organizations, quotaAlloc, users } from "../shared/schema";

const URL = baseUrl();
let falhas = 0;
const checa = (n: string, ok: boolean, d = "") => {
  console.log(`  ${ok ? "✓" : "✗"} ${n}${d ? ` (${d})` : ""}`);
  if (!ok) falhas++;
};

class Cliente {
  cookie = "";
  constructor(readonly aparelho?: string) {}
  async req(metodo: string, caminho: string, corpo?: unknown) {
    const r = await fetch(URL + caminho, {
      method: metodo,
      headers: {
        "Content-Type": "application/json",
        ...(this.cookie ? { Cookie: this.cookie } : {}),
        ...(this.aparelho ? { "x-device-id": this.aparelho } : {}),
      },
      body: corpo === undefined ? undefined : JSON.stringify(corpo),
    });
    const sc = r.headers.get("set-cookie");
    if (sc) this.cookie = sc.split(";")[0];
    const tipo = r.headers.get("content-type") ?? "";
    return { status: r.status, json: tipo.includes("json") ? await r.json() : null };
  }
  async entrarComprador(phone: string) {
    const code = await this.req("POST", "/api/public/my-quotas/request-code", { phone });
    const v = await this.req("POST", "/api/public/my-quotas/verify", { code: code.json?.devCode });
    if (v.status !== 200) throw new Error(`login do comprador ${phone}: HTTP ${v.status}`);
    return this;
  }
}

const SLUG = "bonus-teste";
const EMAIL = "bonus-org@teste.rifa";
const SENHA = "senha-bonus-1";
const TEL = { indicador: "11955551001", indicado: "11955551002" };

async function limpar() {
  const [o] = await db.select().from(organizations).where(eq(organizations.slug, SLUG));
  const bs = await db.select({ id: buyers.id }).from(buyers).where(sql`${buyers.phone} like '1195555%'`);
  const ids = bs.map((b) => b.id);
  if (ids.length) {
    const lista = sql.raw(`('${ids.join("','")}')`);
    await db.execute(sql`delete from bonus_lancamentos where buyer_id in ${lista}`);
    await db.execute(sql`delete from indicacoes where indicador_id in ${lista} or indicado_id in ${lista}`);
    await db.execute(sql`delete from bonus_visitas where indicador_id in ${lista}`);
    await db.execute(sql`delete from chamados where buyer_id in ${lista}`);
  }
  await db.execute(sql`delete from bonus_metas where titulo like 'Teste bônus%'`);
  if (o) {
    await db.execute(sql`delete from quota_alloc where campaign_id in (select id from campaigns where organization_id = ${o.id})`);
    await db.execute(sql`delete from platform_charges where order_id in (select id from orders where campaign_id in (select id from campaigns where organization_id = ${o.id}))`);
    await db.execute(sql`delete from orders where campaign_id in (select id from campaigns where organization_id = ${o.id})`);
    await db.execute(sql`delete from campaigns where organization_id = ${o.id}`);
    await db.delete(users).where(eq(users.email, EMAIL));
    await db.delete(organizations).where(eq(organizations.id, o.id));
  }
  if (ids.length) await db.delete(buyers).where(inArray(buyers.id, ids));
  await db.execute(sql`delete from rate_events where bucket like 'otp%' or bucket like 'order:%' or bucket like 'bonus-%' or bucket like 'chamado%' or bucket like 'login:%'`);
}

async function saldo(phone: string) {
  const [b] = await db.select({ s: buyers.bonusSaldo }).from(buyers).where(eq(buyers.phone, phone));
  return b?.s ?? 0;
}

async function main() {
  console.log("\n=== programa de bônus ===\n");
  await limpar();
  const [antes] = await db.select().from(appSettings).where(eq(appSettings.key, "plataforma"));

  const [org] = await db.insert(organizations).values({ slug: SLUG, name: "Promotora Bônus" }).returning();
  await db.insert(users).values({ role: "organizer", organizationId: org.id, name: "Org Bônus", email: EMAIL, passwordHash: await hashPassword(SENHA) });
  const nova = async (slug: string, aceita: boolean) => {
    const [c] = await db
      .insert(campaigns)
      .values({
        organizationId: org.id,
        slug,
        title: `Rifa ${slug}`,
        prizeTitle: "Moto",
        totalQuotas: 1000,
        priceCents: 500,
        status: "published",
        publishedAt: new Date(),
        drawAt: new Date(Date.now() + 10 * 86_400_000),
        authorizationCode: "SPA-BONUS",
        authorizationFileKey: "certificado-teste",
        aceitaCotaBonus: aceita,
        bonusMaxCotas: aceita ? 50 : 0,
      })
      .returning();
    await db.insert(campaignStats).values({ campaignId: c.id });
    return c;
  };
  const aceita = await nova("bonus-aceita", true);
  const naoAceita = await nova("bonus-nao-aceita", false);

  const admin = new Cliente();
  await admin.req("POST", "/api/auth/login", { email: "admin@rifa.br", password: "admin123" });
  const orgC = new Cliente();
  await orgC.req("POST", "/api/auth/login", { email: EMAIL, password: SENHA });

  try {
    // O indicador precisa existir como comprador (primeira compra dele).
    await db.insert(buyers).values({ name: "Ana Indica", phone: TEL.indicador, cpf: "52998224725" });
    const ana = await new Cliente("aparelho-ana").entrarComprador(TEL.indicador);

    await admin.req("PUT", "/api/admin/bonus/config", { bonusLigado: false });
    let r = await ana.req("GET", "/api/public/bonus");
    checa("desligado: o apostador não vê o programa", r.json?.ligado === false);

    r = await orgC.req("PUT", "/api/admin/bonus/config", { bonusLigado: true });
    checa("organizador não liga (403)", r.status === 403, `HTTP ${r.status}`);
    const cfgAntes = (await admin.req("GET", "/api/admin/plataforma")).json;
    r = await admin.req("PUT", "/api/admin/bonus/config", { bonusLigado: true, bonusPorIndicacao: 2 });
    checa("a plataforma liga", r.status === 200 && r.json?.bonusLigado === true && r.json?.bonusPorIndicacao === 2, `HTTP ${r.status}`);
    const cfgDepois = (await admin.req("GET", "/api/admin/plataforma")).json;
    checa("ligar o bônus não mexe no resto", cfgDepois.estornoManual === cfgAntes.estornoManual && cfgDepois.taxaReembolsoPct === cfgAntes.taxaReembolsoPct && cfgDepois.guardaComissao === cfgAntes.guardaComissao);
    r = await admin.req("PUT", "/api/admin/plataforma", { provedorPix: cfgAntes.provedorPix, estornoManual: true });
    checa("salvar Pagamentos não desliga o bônus", r.json?.bonusLigado === true);

    r = await admin.req("POST", "/api/admin/bonus/metas", { titulo: "Teste bônus visitas", tipo: "visitas", alvo: 2, recompensa: 1 });
    checa("a plataforma cria meta", r.status === 201, `HTTP ${r.status} ${r.json?.message ?? ""}`);
    r = await admin.req("POST", "/api/admin/bonus/metas", { titulo: "x", tipo: "visitas", alvo: 2, recompensa: 1 });
    checa("meta inválida é 400", r.status === 400);

    r = await ana.req("GET", "/api/public/bonus");
    const codigo = r.json?.codigo as string;
    checa("ligado: link de indicação e saldo zero", r.json?.ligado === true && /^[2-9A-HJKMNP-Z]{8}$/.test(codigo ?? "") && r.json?.saldo === 0, codigo);
    checa("só as rifas que aceitam aparecem para resgate", r.json?.rifas?.some((x: any) => x.id === aceita.id) && !r.json?.rifas?.some((x: any) => x.id === naoAceita.id));

    // Visitas: uma por aparelho; a meta (2 visitas) credita uma vez.
    await new Cliente("visitante-1").req("POST", "/api/public/bonus/visita", { codigo });
    await new Cliente("visitante-1").req("POST", "/api/public/bonus/visita", { codigo });
    checa("o mesmo aparelho conta uma vez", (await saldo(TEL.indicador)) === 0);
    r = await new Cliente("visitante-2").req("POST", "/api/public/bonus/visita", { codigo: "ZZZZZZZZ" });
    checa("código desconhecido responde igual (204)", r.status === 204);
    await new Cliente("visitante-2").req("POST", "/api/public/bonus/visita", { codigo });
    checa("duas visitas novas: a meta credita 1 cota", (await saldo(TEL.indicador)) === 1, String(await saldo(TEL.indicador)));
    await new Cliente("visitante-3").req("POST", "/api/public/bonus/visita", { codigo });
    checa("a meta não credita de novo", (await saldo(TEL.indicador)) === 1);

    // Indicação: a primeira compra paga do indicado.
    r = await new Cliente("aparelho-bia").req("POST", "/api/public/orders", {
      campaignId: naoAceita.id,
      quantity: 2,
      buyer: { name: "Bia Indicada", phone: TEL.indicado },
      indicacao: codigo,
    });
    checa("o indicado compra pelo link", r.status === 201, `HTTP ${r.status} ${r.json?.message ?? ""}`);
    const codigoPedido = r.json?.code;
    const [bia] = await db.select().from(buyers).where(eq(buyers.phone, TEL.indicado));
    let [ind] = await db.select().from(indicacoes).where(eq(indicacoes.indicadoId, bia.id));
    checa("a indicação fica pendente até o pagamento", ind?.status === "pendente" && (await saldo(TEL.indicador)) === 1);
    await fetch(`${URL}/api/dev/pay/${codigoPedido}`, { method: "POST" });
    await fetch(`${URL}/api/dev/pay/${codigoPedido}`, { method: "POST" });
    [ind] = await db.select().from(indicacoes).where(eq(indicacoes.indicadoId, bia.id));
    checa("pago: indicação confirmada, +2 cotas (webhook repetido não dobra)", ind?.status === "confirmada" && (await saldo(TEL.indicador)) === 3, String(await saldo(TEL.indicador)));

    // Autoindicação: a Ana comprando pelo próprio link.
    r = await new Cliente("aparelho-ana").req("POST", "/api/public/orders", {
      campaignId: naoAceita.id,
      quantity: 1,
      buyer: { name: "Ana Indica", phone: TEL.indicador },
      indicacao: codigo,
    });
    const [propria] = await db.select().from(indicacoes).where(eq(indicacoes.indicadoId, (await db.select().from(buyers).where(eq(buyers.phone, TEL.indicador)))[0].id));
    checa("autoindicação não conta", r.status === 201 && !propria);

    // "Quem também joga": comprou (pago) e abriu o perfil público; só apelido e foto.
    console.log("  — quem também joga");
    await fetch(`${URL}/api/dev/pay/${r.json?.code}`, { method: "POST" });
    await db.update(buyers).set({ apelido: "bia.joga", perfilPublico: true }).where(eq(buyers.phone, TEL.indicado));
    const publico = new Cliente();
    r = await publico.req("GET", `/api/public/campaigns/${naoAceita.slug}/quem-joga`);
    checa("aparece quem comprou e abriu o perfil, só com apelido e foto", r.status === 200 && r.json?.pessoas?.length === 1 && r.json.pessoas[0].apelido === "bia.joga" && r.json.mais === false, JSON.stringify(r.json));
    checa("a resposta não traz nome, telefone, CPF nem id", Object.keys(r.json.pessoas[0]).sort().join() === "apelido,foto" && !/Bia|Ana|1195555|529\.?982/.test(JSON.stringify(r.json)), JSON.stringify(r.json));
    checa("quem comprou mas não abriu o perfil (Ana) não aparece", !JSON.stringify(r.json).includes("ana"));
    r = await publico.req("GET", `/api/public/campaigns/${aceita.slug}/quem-joga`);
    checa("rifa em que ninguém público comprou vem vazia", r.status === 200 && r.json?.pessoas?.length === 0 && r.json?.mais === false, JSON.stringify(r.json));
    r = await publico.req("GET", "/api/public/campaigns/nao-existe/quem-joga");
    checa("rifa inexistente vem vazia, sem erro", r.status === 200 && r.json?.pessoas?.length === 0);
    await db.update(buyers).set({ apelido: null, perfilPublico: false }).where(eq(buyers.phone, TEL.indicado));

    // Resgate.
    r = await ana.req("POST", "/api/public/bonus/resgatar", { campaignId: naoAceita.id, quantidade: 1 });
    checa("rifa que o regulamento não prevê: 409", r.status === 409 && /regulamento/.test(r.json?.message ?? ""), r.json?.message);
    r = await ana.req("POST", "/api/public/bonus/resgatar", { campaignId: aceita.id, quantidade: 5 });
    checa("saldo insuficiente: 409", r.status === 409 && /insuficiente/.test(r.json?.message ?? ""), r.json?.message);
    const [statsAntes] = await db.select().from(campaignStats).where(eq(campaignStats.campaignId, aceita.id));
    r = await ana.req("POST", "/api/public/bonus/resgatar", { campaignId: aceita.id, quantidade: 2 });
    checa("resgata 2 cotas", r.status === 201 && r.json?.numbers?.length === 2, `HTTP ${r.status} ${r.json?.message ?? ""}`);
    const [pb] = await db.select().from(orders).where(eq(orders.code, r.json?.code));
    checa("pedido de bônus: R$ 0,00, pago", pb?.method === "bonus" && pb.amountCents === 0 && pb.status === "paid");
    const cotas = await db.select().from(quotaAlloc).where(and(eq(quotaAlloc.orderId, pb.id), eq(quotaAlloc.status, "paid")));
    const [statsDepois] = await db.select().from(campaignStats).where(eq(campaignStats.campaignId, aceita.id));
    checa("as cotas entram pelo caminho de sempre, e o contador anda", cotas.length === 2 && statsDepois.soldCount === statsAntes.soldCount + 2);
    const semComissao = await db.select().from(commissions).where(eq(commissions.orderId, pb.id));
    checa("sem comissão", semComissao.length === 0);
    checa("o saldo desce", (await saldo(TEL.indicador)) === 1);
    checa("o contador de bônus da rifa anda junto", statsDepois.bonusCount === statsAntes.bonusCount + 2, String(statsDepois.bonusCount));

    // Teto da autorização: com 1 cota grátis sobrando, três resgates ao mesmo
    // tempo dão um 201 e dois 409, e o saldo de quem perdeu não sai.
    const saldoAntesDoTeto = await saldo(TEL.indicador);
    await db.update(buyers).set({ bonusSaldo: saldoAntesDoTeto + 3 }).where(eq(buyers.phone, TEL.indicador));
    await db.update(campaigns).set({ bonusMaxCotas: statsDepois.bonusCount + 1 }).where(eq(campaigns.id, aceita.id));
    const tres = await Promise.all(
      [1, 2, 3].map(() => ana.req("POST", "/api/public/bonus/resgatar", { campaignId: aceita.id, quantidade: 1 })),
    );
    const [statsTeto] = await db.select().from(campaignStats).where(eq(campaignStats.campaignId, aceita.id));
    checa(
      "na última cota grátis, três resgates juntos: um 201 e dois 409",
      tres.filter((x) => x.status === 201).length === 1 && tres.filter((x) => x.status === 409).length === 2,
      tres.map((x) => x.status).join(","),
    );
    checa("o teto não passa e só um saldo sai", statsTeto.bonusCount === statsDepois.bonusCount + 1 && (await saldo(TEL.indicador)) === saldoAntesDoTeto + 2, `${statsTeto.bonusCount} ${await saldo(TEL.indicador)}`);
    r = await ana.req("POST", "/api/public/bonus/resgatar", { campaignId: aceita.id, quantidade: 1 });
    checa("esgotado: 409 com o motivo", r.status === 409 && /acabaram/.test(r.json?.message ?? ""), r.json?.message);
    await db.update(buyers).set({ bonusSaldo: saldoAntesDoTeto }).where(eq(buyers.phone, TEL.indicador));
    await db.update(campaigns).set({ bonusMaxCotas: 50 }).where(eq(campaigns.id, aceita.id));

    // Cota de bônus não tem reembolso.
    const print = "data:image/png;base64," + (await sharp({ create: { width: 200, height: 300, channels: 3, background: "#fff" } }).png().toBuffer()).toString("base64");
    r = await ana.req("POST", "/api/public/chamados", { orderCode: pb.code, motivo: "Quero o dinheiro da cota grátis", cpf: "529.982.247-25", anexo: print });
    checa("cota de bônus não tem reembolso (409)", r.status === 409 && /bônus/.test(r.json?.message ?? ""), r.json?.message);

    // Estorno da compra que confirmou a indicação tira o bônus.
    const [pedidoBia] = await db.select().from(orders).where(eq(orders.code, codigoPedido));
    await refundOrder(pedidoBia.id);
    [ind] = await db.select().from(indicacoes).where(eq(indicacoes.indicadoId, bia.id));
    checa("estorno: indicação estornada e as 2 cotas saem (saldo pode ficar negativo)", ind?.status === "estornada" && (await saldo(TEL.indicador)) === -1, String(await saldo(TEL.indicador)));
    r = await ana.req("POST", "/api/public/bonus/resgatar", { campaignId: aceita.id, quantidade: 1 });
    checa("com saldo negativo, não resgata", r.status === 409);

    // A marcação trava ao publicar e entra no regulamento.
    r = await orgC.req("PUT", `/api/admin/campaigns/${aceita.id}/legal`, { aceitaCotaBonus: false });
    checa("rifa publicada não muda a marcação", r.status >= 400, `HTTP ${r.status}`);
    r = await new Cliente().req("GET", `/api/public/campaigns/${aceita.slug}/regulamento`);
    const reg = JSON.stringify(r.json ?? "");
    checa("o regulamento da rifa traz a cláusula", /cotas de bônus/.test(reg), `HTTP ${r.status}`);
    checa("a cláusula diz a quantidade e que não conta para o mínimo", /até 50 cotas de bônus/.test(reg) && /mínimo de cotas vendidas/.test(reg), reg.slice(0, 200));

    // Rascunho: aceitar cota de bônus exige dizer quantas a autorização prevê.
    const [rascunho] = await db
      .insert(campaigns)
      .values({ organizationId: org.id, slug: "bonus-rascunho", title: "Rascunho", prizeTitle: "Moto", totalQuotas: 1000, priceCents: 500 })
      .returning();
    await db.insert(campaignStats).values({ campaignId: rascunho.id });
    r = await orgC.req("PUT", `/api/admin/campaigns/${rascunho.id}/legal`, { aceitaCotaBonus: true });
    checa("aceitar sem a quantidade: 422", r.status === 422 && /quantas/.test(r.json?.message ?? ""), r.json?.message);
    r = await orgC.req("PUT", `/api/admin/campaigns/${rascunho.id}/legal`, { aceitaCotaBonus: true, bonusMaxCotas: 1001 });
    checa("mais que o total da rifa: 422", r.status === 422, r.json?.message);
    r = await orgC.req("PUT", `/api/admin/campaigns/${rascunho.id}/legal`, { aceitaCotaBonus: true, bonusMaxCotas: 30 });
    checa("com a quantidade: salva", r.status === 200 && r.json?.bonusMaxCotas === 30 && r.json?.aceitaCotaBonus === true, `HTTP ${r.status} ${r.json?.message ?? ""}`);
    r = await orgC.req("PATCH", `/api/admin/campaigns/${rascunho.id}`, { bonusMaxCotas: 999 });
    const [aindaTrinta] = await db.select({ m: campaigns.bonusMaxCotas }).from(campaigns).where(eq(campaigns.id, rascunho.id));
    checa("o PATCH genérico não mexe na quantidade", aindaTrinta.m === 30, String(aindaTrinta.m));
    r = await orgC.req("PUT", `/api/admin/campaigns/${rascunho.id}/legal`, { aceitaCotaBonus: false });
    const [zerada] = await db.select({ m: campaigns.bonusMaxCotas }).from(campaigns).where(eq(campaigns.id, rascunho.id));
    checa("desmarcar zera a quantidade", r.status === 200 && zerada.m === 0, `HTTP ${r.status} ${zerada.m}`);

    // Meta "Seguir organizações": só conta para conta com senha (o CPF único
    // entre contas segura a fazenda de contas), credita uma vez e o bônus fica.
    console.log("  — meta de seguir");
    r = await admin.req("POST", "/api/admin/bonus/metas", { titulo: "Teste bônus seguir", tipo: "organizacoes_seguidas", alvo: 1, recompensa: 1 });
    checa("a plataforma cria a meta de seguir", r.status === 201, `HTTP ${r.status} ${r.json?.message ?? ""}`);
    const esperar = () => new Promise((ok) => setTimeout(ok, 700));
    const antesDeSeguir = await saldo(TEL.indicador);
    r = await ana.req("POST", `/api/public/o/${SLUG}/seguir`);
    await esperar();
    checa("sem conta com senha, seguir não credita a meta", r.status === 200 && (await saldo(TEL.indicador)) === antesDeSeguir, String(await saldo(TEL.indicador)));
    await ana.req("DELETE", `/api/public/o/${SLUG}/seguir`);
    await db.update(buyers).set({ passwordHash: "hash-de-teste" }).where(eq(buyers.phone, TEL.indicador));
    r = await ana.req("POST", `/api/public/o/${SLUG}/seguir`);
    await esperar();
    checa("conta com senha que segue: a meta credita 1 cota", r.status === 200 && (await saldo(TEL.indicador)) === antesDeSeguir + 1, String(await saldo(TEL.indicador)));
    await ana.req("POST", `/api/public/o/${SLUG}/seguir`);
    await ana.req("DELETE", `/api/public/o/${SLUG}/seguir`);
    await ana.req("POST", `/api/public/o/${SLUG}/seguir`);
    await esperar();
    checa("seguir, largar e seguir de novo não credita outra vez", (await saldo(TEL.indicador)) === antesDeSeguir + 1, String(await saldo(TEL.indicador)));
    r = await ana.req("GET", "/api/public/bonus");
    const metaSeguir = (r.json?.metas ?? []).find((m: any) => m.tipo === "organizacoes_seguidas");
    checa("a tela mostra o progresso da meta de seguir", metaSeguir?.alcancada === true && metaSeguir?.feito === 1 && /Siga 1 organização/.test(metaSeguir?.descricao ?? ""), JSON.stringify(metaSeguir));
    await db.execute(sql`delete from seguidores where buyer_id = (select id from buyers where phone = ${TEL.indicador})`);
    await db.execute(sql`update organizations set seguidores_count = 0 where id = ${org.id}::uuid`);
    await db.update(buyers).set({ passwordHash: null }).where(eq(buyers.phone, TEL.indicador));

    // Estorno desfaz as metas que dependiam da compra: a de compras de quem
    // comprou e a de indicações de quem indicou. Alcançar de novo paga de novo
    // (outra volta da meta); estorno que não derruba a meta não tira nada.
    console.log("  — metas desfeitas pelo estorno");
    r = await admin.req("POST", "/api/admin/bonus/metas", { titulo: "Teste bônus compras", tipo: "rifas_compradas", alvo: 1, recompensa: 1 });
    checa("a plataforma cria a meta de compras", r.status === 201, `HTTP ${r.status} ${r.json?.message ?? ""}`);
    r = await admin.req("POST", "/api/admin/bonus/metas", { titulo: "Teste bônus indicações", tipo: "indicacoes", alvo: 1, recompensa: 3 });
    checa("a plataforma cria a meta de indicações", r.status === 201, `HTTP ${r.status} ${r.json?.message ?? ""}`);
    const TEL_CAIO = "11955551003";
    const anaAntes = await saldo(TEL.indicador);
    const comprarCaio = async (campaignId: string, indicacao?: string) => {
      const c = await new Cliente(`aparelho-caio-${Math.random()}`).req("POST", "/api/public/orders", {
        campaignId,
        quantity: 1,
        buyer: { name: "Caio Indicado", phone: TEL_CAIO },
        ...(indicacao ? { indicacao } : {}),
      });
      if (c.status !== 201) throw new Error(`compra do Caio: HTTP ${c.status} ${c.json?.message ?? ""}`);
      await fetch(`${URL}/api/dev/pay/${c.json.code}`, { method: "POST" });
      const [o] = await db.select().from(orders).where(eq(orders.code, c.json.code));
      return o;
    };
    const primeira = await comprarCaio(naoAceita.id, codigo);
    checa("pago: a meta de compras credita quem comprou", (await saldo(TEL_CAIO)) === 1, String(await saldo(TEL_CAIO)));
    // Ana: +2 da indicação, +3 da meta de indicações, +1 da meta de compras (ela já tinha compra paga).
    checa("pago: quem indicou ganha a indicação e a meta de indicações", (await saldo(TEL.indicador)) === anaAntes + 6, `${await saldo(TEL.indicador)} vs ${anaAntes + 6}`);
    await refundOrder(primeira.id);
    checa("estorno: a meta de compras sai de quem comprou", (await saldo(TEL_CAIO)) === 0, String(await saldo(TEL_CAIO)));
    checa("estorno: a indicação e a meta de indicações saem de quem indicou (a de compras dela fica)", (await saldo(TEL.indicador)) === anaAntes + 1, `${await saldo(TEL.indicador)} vs ${anaAntes + 1}`);
    await refundOrder(primeira.id);
    checa("estornar de novo não tira outra vez", (await saldo(TEL_CAIO)) === 0 && (await saldo(TEL.indicador)) === anaAntes + 1);
    const segunda = await comprarCaio(naoAceita.id);
    checa("alcançou de novo: a meta paga de novo", (await saldo(TEL_CAIO)) === 1, String(await saldo(TEL_CAIO)));
    await fetch(`${URL}/api/dev/pay/${segunda.code}`, { method: "POST" });
    checa("o webhook repetido não paga a mesma volta duas vezes", (await saldo(TEL_CAIO)) === 1, String(await saldo(TEL_CAIO)));
    await comprarCaio(aceita.id);
    await refundOrder(segunda.id);
    checa("estorno que não derruba a meta (ainda tem compra paga) não tira nada", (await saldo(TEL_CAIO)) === 1, String(await saldo(TEL_CAIO)));
    const livroCaio = (await db.execute(sql`select motivo, quantidade, chave from bonus_lancamentos where buyer_id = (select id from buyers where phone = ${TEL_CAIO}) order by created_at`)).rows as { motivo: string; quantidade: number; chave: string }[];
    checa(
      "o livro tem meta, estorno da meta e a segunda volta, cada uma com a sua chave",
      livroCaio.map((l) => `${l.motivo}:${l.quantidade}`).join(",") === "meta:1,estorno_meta:-1,meta:1" && new Set(livroCaio.map((l) => l.chave)).size === 3,
      livroCaio.map((l) => `${l.motivo}:${l.quantidade}:${l.chave.split(":")[0]}`).join(","),
    );

    // Desligado: nada se resgata e nada acumula.
    await admin.req("PUT", "/api/admin/bonus/config", { bonusLigado: false });
    await db.update(buyers).set({ bonusSaldo: 5 }).where(eq(buyers.phone, TEL.indicador));
    r = await ana.req("POST", "/api/public/bonus/resgatar", { campaignId: aceita.id, quantidade: 1 });
    checa("desligado: resgate 409", r.status === 409 && /não está ativo/.test(r.json?.message ?? ""), r.json?.message);
    await new Cliente("visitante-9").req("POST", "/api/public/bonus/visita", { codigo });
    const [{ n }] = (await db.execute(sql`select count(*)::int as n from bonus_visitas where aparelho_hash is not null and indicador_id = (select id from buyers where phone = ${TEL.indicador})`)).rows as { n: number }[];
    checa("desligado: visita não conta", Number(n) === 3, String(n));
  } finally {
    if (antes) await db.update(appSettings).set({ value: antes.value }).where(eq(appSettings.key, "plataforma"));
    else await db.delete(appSettings).where(eq(appSettings.key, "plataforma"));
    await limpar();
  }
  console.log(falhas ? `\n${falhas} falha(s)` : "\ntudo certo");
  await pool.end();
  process.exit(falhas ? 1 : 0);
}

main().catch(async (e) => {
  console.error(e);
  await pool.end();
  process.exit(1);
});
