/**
 * Prova da transparência, pela API de verdade: regulamento público (e só da
 * rifa publicada), a semente escondida até o sorteio e conferível depois, o
 * texto da promotora travando ao publicar e o link da transmissão.
 *
 *   npm run transparencia      (com `npm run dev` no ar e o seed aplicado)
 */
import "dotenv/config";
import { baseUrl } from "./base-url";
import { eq, sql } from "drizzle-orm";
import { db, pool } from "../server/db";
import { buyers, campaignStats, campaigns, draws, orders, organizations, quotaAlloc } from "../shared/schema";
import { commitSeed, drawNumber } from "../server/services/draw";
import { conferirSorteio } from "../shared/sorteio";
import { refundOrder } from "../server/services/orders";

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
    return { status: r.status, json: tipo.includes("json") ? await r.json() : null, texto: tipo.includes("json") ? "" : await r.text() };
  }
}

const PREFIXO = "transp-teste";

const FONE_TESTE = "11960007788";

async function limpar() {
  await db.execute(sql`delete from campaigns where slug like ${`${PREFIXO}%`}`);
  await db.execute(sql`delete from buyers where phone = ${FONE_TESTE}`);
}

async function main() {
  console.log("\n=== transparência: regulamento, sorteio e transmissão ===\n");
  await limpar();

  const [org] = await db.select().from(organizations).where(eq(organizations.slug, "rifas-sao-jose"));
  if (!org) throw new Error("Rode `npm run db:seed` antes.");
  const novaRifa = async (sufixo: string, status: "draft" | "published" | "drawn") => {
    const { seed, seedHash } = commitSeed();
    const [c] = await db
      .insert(campaigns)
      .values({
        organizationId: org.id,
        slug: `${PREFIXO}-${sufixo}`,
        title: `Teste ${sufixo}`,
        prizeTitle: `Prêmio ${sufixo}`,
        totalQuotas: 1000,
        priceCents: 500,
        status,
        drawAt: new Date(Date.now() + 3 * 86_400_000),
        authorizationCode: "SPA-TRANSP-1",
        drawSeedHash: seedHash,
      })
      .returning();
    await db.insert(campaignStats).values({ campaignId: c.id });
    await db.insert(draws).values({ campaignId: c.id, seed, seedHash });
    return { c, seed, seedHash };
  };

  try {
    const anon = new Cliente();
    const rascunho = await novaRifa("rascunho", "draft");
    const noAr = await novaRifa("no-ar", "published");

    // ---- regulamento ----
    let r = await anon.req("GET", `/api/public/campaigns/${rascunho.c.slug}/regulamento`);
    checa("rascunho não tem regulamento público (404)", r.status === 404, `HTTP ${r.status}`);
    r = await anon.req("GET", `/api/public/campaigns/${noAr.c.slug}/regulamento`);
    const tudo = JSON.stringify(r.json?.secoes ?? []);
    checa("rifa publicada tem regulamento", r.status === 200 && (r.json?.secoes?.length ?? 0) >= 8, `${r.json?.secoes?.length} seções`);
    checa("com promotora, autorização, numeração e o resumo da semente",
      tudo.includes("Rifas São José") && tudo.includes("SPA-TRANSP-1") && tudo.includes("0001 a 1000") && tudo.includes(noAr.seedHash));

    // ---- a semente não sai antes do sorteio ----
    r = await anon.req("GET", `/api/public/campaigns/${noAr.c.slug}/sorteio`);
    checa("antes do sorteio: realizado = false", r.status === 200 && r.json?.realizado === false);
    checa("antes do sorteio a semente NÃO sai em lugar nenhum da resposta",
      !JSON.stringify(r.json).includes(noAr.seed) && r.json?.seed === undefined);
    const pagina = await anon.req("GET", `/api/public/campaigns/${noAr.c.slug}`);
    checa("nem na página da rifa", !JSON.stringify(pagina.json).includes(noAr.seed));
    const reg = await anon.req("GET", `/api/public/campaigns/${noAr.c.slug}/regulamento`);
    checa("nem no regulamento", !JSON.stringify(reg.json).includes(noAr.seed));

    // ---- depois do sorteio: tudo público e a conta fecha ----
    const federalPrizes = ["12345", "67890", "11111", "22222", "33333"];
    const numero = drawNumber({ seed: noAr.seed, federalPrizes, totalQuotas: 1000 });
    await db
      .update(draws)
      .set({ federalContest: 5999, federalPrizes, resultNumber: numero, executedAt: new Date() })
      .where(eq(draws.campaignId, noAr.c.id));
    await db.update(campaigns).set({ status: "drawn" }).where(eq(campaigns.id, noAr.c.id));
    r = await anon.req("GET", `/api/public/campaigns/${noAr.c.slug}/sorteio`);
    checa("depois do sorteio: número, Federal e semente públicos",
      r.json?.realizado === true && r.json?.resultNumber === numero && r.json?.seed === noAr.seed && r.json?.numero === String(numero).padStart(4, "0"),
      `${r.json?.numero}`);
    const conf = await conferirSorteio({
      seed: r.json.seed,
      seedHash: r.json.seedHash,
      federalPrizes: r.json.federalPrizes,
      totalQuotas: r.json.totalQuotas,
      resultNumber: r.json.resultNumber,
    });
    checa("a conferência pública fecha com o que a API publicou", conf.hashConfere && conf.numeroConfere);

    // ---- organizador: texto do regulamento e transmissão ----
    const marina = new Cliente();
    r = await marina.req("POST", "/api/auth/login", { email: "marina@rifassaojose.br", password: "organizador123" });
    if (r.status !== 200) throw new Error(`login do organizador: HTTP ${r.status}`);

    r = await marina.req("PUT", `/api/admin/campaigns/${rascunho.c.id}/legal`, { regulamentoExtra: "Retirada na sede.\n\nFoto do ganhador divulgada." });
    checa("organizador escreve as disposições no rascunho", r.status === 200 && r.json?.regulamentoExtra?.includes("Retirada"), `HTTP ${r.status}`);
    r = await marina.req("PUT", `/api/admin/campaigns/${rascunho.c.id}/legal`, { regulamentoExtra: "x".repeat(3001) });
    checa("texto grande demais: recusa", r.status === 422, `HTTP ${r.status}`);

    const publicada = await novaRifa("publicada", "published");
    r = await marina.req("PUT", `/api/admin/campaigns/${publicada.c.id}/legal`, { regulamentoExtra: "Mudou a regra depois de vender." });
    checa("depois de publicar, o regulamento não muda (422)", r.status === 422, `HTTP ${r.status}`);

    r = await marina.req("PATCH", `/api/admin/campaigns/${rascunho.c.id}`, { regulamentoExtra: "pelo atalho", transmissaoUrl: "https://x.com" });
    const [depois] = await db.select().from(campaigns).where(eq(campaigns.id, rascunho.c.id));
    checa("o PATCH genérico não mexe em regulamento nem transmissão",
      depois.regulamentoExtra?.startsWith("Retirada") === true && depois.transmissaoUrl === null);

    r = await marina.req("PUT", `/api/admin/campaigns/${publicada.c.id}/transmissao`, { url: "javascript:alert(1)" });
    checa("link de transmissão que não é https: recusa", r.status === 400, `HTTP ${r.status}`);
    r = await marina.req("PUT", `/api/admin/campaigns/${publicada.c.id}/transmissao`, { url: "https://youtube.com/live/teste" });
    checa("link da live salvo mesmo com a rifa publicada", r.status === 200, `HTTP ${r.status}`);
    r = await anon.req("GET", `/api/public/campaigns/${publicada.c.slug}/sorteio`);
    checa("e aparece para o apostador", r.json?.transmissaoUrl === "https://youtube.com/live/teste");

    // ---- número não vendido: regra da aproximação, pela rota de verdade ----
    console.log("\n  regra da aproximação (sorteio pela rota):");
    const admin = new Cliente();
    r = await admin.req("POST", "/api/auth/login", { email: "admin@rifa.br", password: "admin123" });
    if (r.status !== 200) throw new Error(`login da plataforma: HTTP ${r.status}`);
    const [comprador] = await db.insert(buyers).values({ name: "Teste Aproximação", phone: FONE_TESTE }).returning();
    let codigo = 90_100_000 + Math.floor(Math.random() * 100_000);
    const vender = async (campaignId: string, numeros: number[]) => {
      for (const n of numeros) {
        const [o] = await db
          .insert(orders)
          .values({ code: codigo++, campaignId, buyerId: comprador.id, quantity: 1, amountCents: 500, status: "paid", paidAt: new Date() })
          .returning();
        await db.insert(quotaAlloc).values({ campaignId, number: n, status: "paid", orderId: o.id });
      }
    };
    // Escolhe os 5 prêmios para o número cair longe das pontas (dá para vender acima e abaixo).
    const sortear = async (sufixo: string, vendidos: (n: number) => number[], reservados: (n: number) => number[] = () => []) => {
      const rifa = await novaRifa(sufixo, "published");
      let premios = ["10001", "20002", "30003", "40004", "50005"];
      let n = drawNumber({ seed: rifa.seed, federalPrizes: premios, totalQuotas: 1000 });
      for (let i = 0; n < 10 || n > 990; i++) {
        premios = [String(60000 + i), "20002", "30003", "40004", "50005"];
        n = drawNumber({ seed: rifa.seed, federalPrizes: premios, totalQuotas: 1000 });
      }
      await vender(rifa.c.id, vendidos(n));
      for (const x of reservados(n)) {
        const [o] = await db.insert(orders).values({ code: codigo++, campaignId: rifa.c.id, buyerId: comprador.id, quantity: 1, amountCents: 500 }).returning();
        await db.insert(quotaAlloc).values({ campaignId: rifa.c.id, number: x, status: "reserved", orderId: o.id, reservedUntil: new Date(Date.now() + 600_000) });
      }
      const resp = await admin.req("POST", `/api/admin/campaigns/${rifa.c.id}/draw`, { federalContest: 6001, federalPrizes: premios });
      return { rifa, n, resp, premios };
    };

    let s1 = await sortear("vendido", (n) => [n, n + 1]);
    checa("número sorteado vendido: ele mesmo leva", s1.resp.status === 200 && s1.resp.json?.winnerNumber === s1.n && s1.resp.json?.aproximacao === false, `${s1.n} → ${s1.resp.json?.winnerNumber}`);

    s1 = await sortear("acima", (n) => [n - 2, n + 3, n + 7]);
    checa("não vendido: leva o vendido imediatamente acima", s1.resp.json?.winnerNumber === s1.n + 3 && s1.resp.json?.aproximacao === true, `${s1.n} → ${s1.resp.json?.winnerNumber}`);
    checa("…com o pedido dele como ganhador", Boolean(s1.resp.json?.winnerOrderId));
    r = await anon.req("GET", `/api/public/campaigns/${s1.rifa.c.slug}/sorteio`);
    checa("a página pública mostra o sorteado e o contemplado",
      r.json?.numero === String(s1.n).padStart(4, "0") && r.json?.contemplado === String(s1.n + 3).padStart(4, "0") && r.json?.aproximacao === true,
      `${r.json?.numero} / ${r.json?.contemplado}`);
    const conf2 = await conferirSorteio({ seed: r.json.seed, seedHash: r.json.seedHash, federalPrizes: r.json.federalPrizes, totalQuotas: 1000, resultNumber: r.json.resultNumber });
    checa("e a conferência pública segue fechando com o sorteado", conf2.hashConfere && conf2.numeroConfere);
    r = await admin.req("POST", `/api/admin/campaigns/${s1.rifa.c.id}/draw`, { federalContest: 6001, federalPrizes: ["1", "2", "3", "4", "5"] });
    checa("sortear de novo: 409, e o resultado não muda", r.status === 409, `HTTP ${r.status}`);

    s1 = await sortear("abaixo", (n) => [n - 4, n - 1]);
    checa("nenhum acima: leva o vendido imediatamente abaixo", s1.resp.json?.winnerNumber === s1.n - 1, `${s1.n} → ${s1.resp.json?.winnerNumber}`);

    s1 = await sortear("nenhum", () => []);
    checa("nenhuma cota paga: sorteio sem contemplado", s1.resp.status === 200 && s1.resp.json?.winnerNumber === null && s1.resp.json?.winnerOrderId === null);

    // Reserva não paga não conta para a aproximação.
    // Reserva esperando Pix: o sorteio espera (409) — o Pix pago depois ficaria fora do quadro.
    s1 = await sortear("reserva", (n) => [n - 6], (n) => [n + 2]);
    checa("com cota reservada esperando pagamento, o sorteio espera (409)", s1.resp.status === 409, `HTTP ${s1.resp.status} ${s1.resp.json?.message ?? ""}`);
    const [aindaPublicada] = await db.select({ status: campaigns.status }).from(campaigns).where(eq(campaigns.id, s1.rifa.c.id));
    checa("…e a rifa segue publicada, sem nada gravado", aindaPublicada.status === "published");
    await db.execute(sql`delete from quota_alloc where campaign_id = ${s1.rifa.c.id} and status = 'reserved'`);
    const premios = (await db.select().from(draws).where(eq(draws.campaignId, s1.rifa.c.id)))[0];
    void premios;
    r = await admin.req("POST", `/api/admin/campaigns/${s1.rifa.c.id}/draw`, { federalContest: 6001, federalPrizes: s1.premios });
    checa("reserva vencida: sorteia, e só cota paga entra na aproximação", r.json?.winnerNumber === s1.n - 6, `${s1.n} → ${r.json?.winnerNumber}`);

    // Pix que chega depois do sorteio não vira cota.
    const [atrasado] = await db
      .insert(orders)
      .values({ code: codigo++, campaignId: s1.rifa.c.id, buyerId: comprador.id, quantity: 1, amountCents: 500, pspChargeId: `atrasado-${codigo}` })
      .returning();
    await anon.req("POST", `/api/dev/pay/${atrasado.code}`);
    const [depoisDoPix] = await db.select({ status: orders.status }).from(orders).where(eq(orders.id, atrasado.id));
    checa("Pix confirmado depois do sorteio não vira pedido pago", depoisDoPix.status === "pending", depoisDoPix.status);

    const rascunhoSorteio = await novaRifa("rascunho-sorteio", "draft");
    r = await admin.req("POST", `/api/admin/campaigns/${rascunhoSorteio.c.id}/draw`, { federalContest: 6001, federalPrizes: ["1", "2", "3", "4", "5"] });
    checa("rascunho não é sorteado (409)", r.status === 409, `HTTP ${r.status}`);

    // O relatório de prestação de contas diz o contemplado.
    const relatorio = await fetch(URL + `/api/admin/exportacoes/sorteio?campanha=${s1.rifa.c.id}`, { headers: { Cookie: admin.cookie } });
    const csv = await relatorio.text();
    checa(
      "o relatório do sorteio traz o número contemplado e a regra",
      relatorio.status === 200 && csv.includes("Número contemplado") && csv.includes(String(s1.n - 6)) && csv.includes("imediatamente acima"),
      `HTTP ${relatorio.status}`,
    );

    // Mínimo de cotas vendidas: entra pelos dados legais, trava ao publicar e o sorteio respeita.
    console.log("\n  mínimo de cotas vendidas para sortear:");
    const comMinimo = await novaRifa("minimo", "draft");
    r = await marina.req("PUT", `/api/admin/campaigns/${comMinimo.c.id}/legal`, { minimoVendidoPct: 150 });
    checa("mínimo acima de 100%: recusa (422)", r.status === 422, `HTTP ${r.status}`);
    r = await marina.req("PUT", `/api/admin/campaigns/${comMinimo.c.id}/legal`, { minimoVendidoPct: 30 });
    checa("organizador define 30% no rascunho", r.status === 200 && r.json?.minimoVendidoPct === 30, `HTTP ${r.status}`);
    await db.update(campaigns).set({ status: "published", publishedAt: new Date() }).where(eq(campaigns.id, comMinimo.c.id));
    r = await marina.req("PUT", `/api/admin/campaigns/${comMinimo.c.id}/legal`, { minimoVendidoPct: 1 });
    checa("publicada: o mínimo não muda mais (422)", r.status === 422, `HTTP ${r.status}`);
    const regMin = JSON.stringify((await anon.req("GET", `/api/public/campaigns/${comMinimo.c.slug}/regulamento`)).json?.secoes ?? []);
    checa("o regulamento traz o mínimo e o adiamento", regMin.includes("pelo menos 30%") && regMin.includes("(300 cotas)") && regMin.includes("adiado"));
    await vender(comMinimo.c.id, [10, 20]);
    await db.update(campaignStats).set({ soldCount: 2 }).where(eq(campaignStats.campaignId, comMinimo.c.id));
    r = await admin.req("POST", `/api/admin/campaigns/${comMinimo.c.id}/draw`, { federalContest: 6002, federalPrizes: ["1", "2", "3", "4", "5"] });
    const [semSorteio] = await db.select({ status: campaigns.status }).from(campaigns).where(eq(campaigns.id, comMinimo.c.id));
    checa("abaixo do mínimo o sorteio não roda (409) e a rifa segue publicada",
      r.status === 409 && String(r.json?.message).includes("2 de 300") && semSorteio.status === "published", `HTTP ${r.status} ${r.json?.message ?? ""}`);
    await db.update(campaignStats).set({ soldCount: 300 }).where(eq(campaignStats.campaignId, comMinimo.c.id));
    r = await admin.req("POST", `/api/admin/campaigns/${comMinimo.c.id}/draw`, { federalContest: 6002, federalPrizes: ["1", "2", "3", "4", "5"] });
    checa("atingido o mínimo, sorteia", r.status === 200 && r.json?.winnerNumber !== undefined, `HTTP ${r.status}`);

    // ---- modos do sorteio: rifa cheia ----
    console.log("\n  modos do sorteio (rifa cheia):");
    const cheia = await novaRifa("cheia-data", "draft");
    r = await marina.req("PUT", `/api/admin/campaigns/${cheia.c.id}/legal`, { modoSorteio: "cheia_com_data", minimoVendidoPct: 10 });
    checa("rifa cheia com data: o mínimo vira 100%", r.status === 200 && r.json?.modoSorteio === "cheia_com_data" && r.json?.minimoVendidoPct === 100, `HTTP ${r.status} ${r.json?.minimoVendidoPct}`);
    r = await marina.req("PUT", `/api/admin/campaigns/${cheia.c.id}/legal`, { modoSorteio: "inventado" });
    checa("modo desconhecido: recusa (422)", r.status === 422, `HTTP ${r.status}`);
    await db.update(campaigns).set({ status: "published", publishedAt: new Date() }).where(eq(campaigns.id, cheia.c.id));
    await vender(cheia.c.id, [1, 2, 3]);
    await db.update(campaignStats).set({ soldCount: 999 }).where(eq(campaignStats.campaignId, cheia.c.id));
    r = await admin.req("POST", `/api/admin/campaigns/${cheia.c.id}/draw`, { federalContest: 6003, federalPrizes: ["1", "2", "3", "4", "5"] });
    checa("rifa cheia com data e 999 de 1000: o sorteio não roda (409)", r.status === 409 && String(r.json?.message).includes("999 de 1000"), `HTTP ${r.status}`);

    // Quando completar (8.7): a data registrada é a máxima; a última cota paga
    // antecipa o sorteio para a próxima extração da Federal.
    const completar = await novaRifa("completar", "draft");
    await db.update(campaigns).set({ totalQuotas: 10 }).where(eq(campaigns.id, completar.c.id));
    const maxima = new Date(Date.now() + 60 * 86_400_000);
    maxima.setUTCSeconds(0, 0);
    r = await marina.req("PUT", `/api/admin/campaigns/${completar.c.id}/legal`, { modoSorteio: "quando_completar", drawAt: null });
    checa("quando completar: o mínimo é 100%", r.status === 200 && r.json?.minimoVendidoPct === 100, `HTTP ${r.status}`);
    let bloqueios = await marina.req("GET", `/api/admin/campaigns/${completar.c.id}/blockers`);
    checa("…e publicar pede a data máxima do sorteio (a SPA/MF exige data certa)", JSON.stringify(bloqueios.json?.blockers ?? []).includes("data máxima"), JSON.stringify(bloqueios.json?.blockers));
    r = await marina.req("PUT", `/api/admin/campaigns/${completar.c.id}/legal`, { drawAt: maxima.toISOString() });
    checa("a data máxima entra pelos dados legais", r.status === 200 && new Date(r.json?.drawAt).getTime() === maxima.getTime(), `HTTP ${r.status}`);
    bloqueios = await marina.req("GET", `/api/admin/campaigns/${completar.c.id}/blockers`);
    checa("…e deixa de barrar a publicação", !JSON.stringify(bloqueios.json?.blockers ?? []).includes("data"), JSON.stringify(bloqueios.json?.blockers));
    // Publicar grava a data máxima (como faz `publishCampaign`).
    await db.update(campaigns).set({ status: "published", publishedAt: new Date(), drawAtMaximo: maxima }).where(eq(campaigns.id, completar.c.id));
    const regC = JSON.stringify((await anon.req("GET", `/api/public/campaigns/${completar.c.slug}/regulamento`)).json?.secoes ?? []);
    checa(
      "o regulamento diz a data máxima e a antecipação com comunicado",
      regC.includes("data máxima registrada") && regC.includes("antecipado para a extração da Loteria Federal imediatamente subsequente") && regC.includes("comunicado na plataforma") && regC.includes("rifa cheia"),
    );
    await vender(completar.c.id, [1, 2, 3, 4, 5, 6, 7, 8, 9]);
    await db.update(campaignStats).set({ soldCount: 9 }).where(eq(campaignStats.campaignId, completar.c.id));
    const [ultimo] = await db
      .insert(orders)
      .values({ code: codigo++, campaignId: completar.c.id, buyerId: comprador.id, quantity: 1, amountCents: 500, pspChargeId: `ultimo-${codigo}` })
      .returning();
    await db.insert(quotaAlloc).values({ campaignId: completar.c.id, number: 10, status: "reserved", orderId: ultimo.id, reservedUntil: new Date(Date.now() + 600_000) });
    await db.update(campaignStats).set({ reservedCount: 1 }).where(eq(campaignStats.campaignId, completar.c.id));
    let [antes] = await db.select({ drawAt: campaigns.drawAt, drawAtMaximo: campaigns.drawAtMaximo }).from(campaigns).where(eq(campaigns.id, completar.c.id));
    checa("com 9 de 10, segue na data máxima", antes.drawAt?.getTime() === maxima.getTime());
    await anon.req("POST", `/api/dev/pay/${ultimo.code}`);
    [antes] = await db.select({ drawAt: campaigns.drawAt, drawAtMaximo: campaigns.drawAtMaximo }).from(campaigns).where(eq(campaigns.id, completar.c.id));
    const marcada = antes.drawAt ? new Date(antes.drawAt) : null;
    checa(
      "a última cota paga antecipa o sorteio: quarta ou sábado, 19h de Brasília, com 24 h de folga, antes da máxima",
      !!marcada && [3, 6].includes(marcada.getUTCDay()) && marcada.getUTCHours() === 22 && marcada.getTime() - Date.now() >= 23.9 * 3600_000 && marcada < maxima,
      marcada?.toISOString(),
    );
    checa("…e a data máxima fica de referência", antes.drawAtMaximo?.getTime() === maxima.getTime());
    const paginaC = (await anon.req("GET", `/api/public/campaigns/${completar.c.slug}`)).json;
    checa(
      "a página da rifa mostra a data antecipada e a máxima",
      paginaC?.campaign?.modoSorteio === "quando_completar" &&
        new Date(paginaC?.campaign?.drawAt).getTime() === marcada?.getTime() &&
        new Date(paginaC?.campaign?.drawAtMaximo).getTime() === maxima.getTime(),
    );
    const regAnt = JSON.stringify((await anon.req("GET", `/api/public/campaigns/${completar.c.slug}/regulamento`)).json?.secoes ?? []);
    checa("o regulamento diz que foi antecipado", regAnt.includes("o sorteio foi antecipado para"));

    // Estorno depois de cheia: a antecipação cai e volta à máxima; encheu de novo, antecipa de novo.
    await refundOrder(ultimo.id);
    [antes] = await db.select({ drawAt: campaigns.drawAt, drawAtMaximo: campaigns.drawAtMaximo }).from(campaigns).where(eq(campaigns.id, completar.c.id));
    checa("estorno deixa a rifa não cheia: o sorteio volta à data máxima", antes.drawAt?.getTime() === maxima.getTime());
    const [denovo] = await db
      .insert(orders)
      .values({ code: codigo++, campaignId: completar.c.id, buyerId: comprador.id, quantity: 1, amountCents: 500, pspChargeId: `denovo-${codigo}` })
      .returning();
    await db.insert(quotaAlloc).values({ campaignId: completar.c.id, number: 10, status: "reserved", orderId: denovo.id, reservedUntil: new Date(Date.now() + 600_000) });
    await db.update(campaignStats).set({ reservedCount: 1 }).where(eq(campaignStats.campaignId, completar.c.id));
    await anon.req("POST", `/api/dev/pay/${denovo.code}`);
    [antes] = await db.select({ drawAt: campaigns.drawAt }).from(campaigns).where(eq(campaigns.id, completar.c.id));
    checa("encheu de novo: o sorteio é antecipado de novo", !!antes.drawAt && antes.drawAt < maxima);

    // A data máxima antes da próxima extração: encher não antecipa (nunca adia).
    const perto = await novaRifa("completar-perto", "draft");
    const maximaPerto = new Date(Date.now() + 3 * 3600_000);
    await db
      .update(campaigns)
      .set({ totalQuotas: 1, modoSorteio: "quando_completar", minimoVendidoPct: 100, drawAt: maximaPerto, drawAtMaximo: maximaPerto, status: "published", publishedAt: new Date() })
      .where(eq(campaigns.id, perto.c.id));
    const [unico] = await db
      .insert(orders)
      .values({ code: codigo++, campaignId: perto.c.id, buyerId: comprador.id, quantity: 1, amountCents: 500, pspChargeId: `perto-${codigo}` })
      .returning();
    await db.insert(quotaAlloc).values({ campaignId: perto.c.id, number: 1, status: "reserved", orderId: unico.id, reservedUntil: new Date(Date.now() + 600_000) });
    await db.update(campaignStats).set({ reservedCount: 1 }).where(eq(campaignStats.campaignId, perto.c.id));
    await anon.req("POST", `/api/dev/pay/${unico.code}`);
    [antes] = await db.select({ drawAt: campaigns.drawAt }).from(campaigns).where(eq(campaigns.id, perto.c.id));
    checa("data máxima mais perto que a próxima extração: segue na máxima", antes.drawAt?.getTime() === maximaPerto.getTime(), antes.drawAt?.toISOString());

    // A promotora completa: número não vendido é dela, sem aproximação.
    const promotora = await novaRifa("promotora", "draft");
    r = await marina.req("PUT", `/api/admin/campaigns/${promotora.c.id}/legal`, { modoSorteio: "promotora_completa", minimoVendidoPct: 50 });
    checa("a promotora completa: sem mínimo", r.status === 200 && r.json?.minimoVendidoPct === 0, `${r.json?.minimoVendidoPct}`);
    await db.update(campaigns).set({ status: "published", publishedAt: new Date() }).where(eq(campaigns.id, promotora.c.id));
    let premiosP = ["10001", "20002", "30003", "40004", "50005"];
    let nP = drawNumber({ seed: promotora.seed, federalPrizes: premiosP, totalQuotas: 1000 });
    for (let i = 0; nP < 10 || nP > 990; i++) {
      premiosP = [String(70000 + i), "20002", "30003", "40004", "50005"];
      nP = drawNumber({ seed: promotora.seed, federalPrizes: premiosP, totalQuotas: 1000 });
    }
    await vender(promotora.c.id, [nP + 1, nP - 1]);
    r = await admin.req("POST", `/api/admin/campaigns/${promotora.c.id}/draw`, { federalContest: 6004, federalPrizes: premiosP });
    checa("sorteado não vendido: fica com a promotora, sem aproximação",
      r.status === 200 && r.json?.winnerNumber === nP && r.json?.winnerOrderId === null && r.json?.ficouComPromotora === true,
      `${nP} → ${r.json?.winnerNumber}`);
    r = await anon.req("GET", `/api/public/campaigns/${promotora.c.slug}/sorteio`);
    checa("a página diz que o prêmio ficou com a promotora", r.json?.ficouComPromotora === true && r.json?.semContemplado === false);

    const reg2 = await anon.req("GET", `/api/public/campaigns/${s1.rifa.c.slug}/regulamento`);
    const t2 = JSON.stringify(reg2.json?.secoes ?? []);
    checa("o regulamento traz a aproximação e o Tesouro", t2.includes("imediatamente acima") && t2.includes("Tesouro Nacional"));
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
