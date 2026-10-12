/**
 * Prova dos sorteios oficiais, pela API de verdade: só a plataforma cadastra,
 * muda, cancela e lança o resultado (403 para organizador); o mesmo concurso
 * não entra duas vezes; a organização integra a rifa em rascunho pelo
 * calendário (a data vira a do concurso) e a do vizinho é 404; a data não
 * muda pelos dados legais; com rifa publicada, data e cancelamento travam;
 * a tela pública traz só rifa publicada na fileira; o resultado só depois da
 * hora, no formato da loteria, uma vez só. Fase 2: o resultado lançado
 * sorteia as rifas publicadas integradas (Federal e Mega-Sena), o botão do
 * painel usa o resultado oficial e não o formulário, a rifa que não pode
 * sortear (mínimo, sem semente) guarda o motivo, e o adiamento leva a rifa
 * para outro sorteio oficial só com a plataforma. Apaga o que criou no fim.
 *
 *   npm run sorteios      (com `npm run dev` no ar e o seed aplicado)
 */
import "dotenv/config";
import { eq, sql } from "drizzle-orm";
import { baseUrl } from "./base-url";
import { db, pool } from "../server/db";
import { hashPassword } from "../server/auth";
import { campaignStats, campaigns, draws, organizations, sorteiosOficiais, users } from "../shared/schema";
import { commitSeed, drawNumber } from "../server/services/draw";
import { guardarSegredo } from "../server/services/segundoFator";
import { generateSecret, totpCode } from "../server/services/totp";

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

let totpAnterior: string | null | undefined;
let adminId: string | undefined;

const PREFIXO = "sorteio-oficial-prova";
const TITULO = "Prova do sorteio oficial";
const VIZINHA = `${PREFIXO}-vizinha`;
const EMAIL_VIZINHA = "sorteio-oficial-vizinha@rifa.teste";
const SENHA_VIZINHA = "vizinha-sorteio-123";

async function limpar() {
  await db.execute(sql`delete from campaign_stats where campaign_id in (select id from campaigns where slug like ${PREFIXO + "%"})`);
  await db.execute(sql`delete from campaigns where slug like ${PREFIXO + "%"}`);
  await db.execute(sql`delete from sorteios_oficiais where titulo like ${TITULO + "%"}`);
  await db.execute(sql`delete from users where email = ${EMAIL_VIZINHA}`);
  await db.execute(sql`delete from organizations where slug = ${VIZINHA}`);
}

async function rifa(organizationId: string, slug: string, extra: Partial<typeof campaigns.$inferInsert> = {}) {
  const [c] = await db
    .insert(campaigns)
    .values({ organizationId, slug, title: `Rifa ${slug}`, prizeTitle: `Prêmio ${slug}`, totalQuotas: 500, priceCents: 300, authorizationCode: "SPA-PROVA-1", ...extra })
    .returning();
  await db.insert(campaignStats).values({ campaignId: c.id });
  return c;
}

/** A semente comprometida, como a publicação grava. */
async function semente(campaignId: string) {
  const { seed, seedHash } = commitSeed();
  await db.insert(draws).values({ campaignId, seed, seedHash });
  return seed;
}

const publicar = (id: string) => db.update(campaigns).set({ status: "published", publishedAt: new Date() }).where(eq(campaigns.id, id));
const passouAHora = (id: string) => db.update(sorteiosOficiais).set({ sorteioEm: new Date(Date.now() - 60_000) }).where(eq(sorteiosOficiais.id, id));

const daqui = (h: number) => new Date(Date.now() + h * 3_600_000).toISOString();
// Um concurso que não colide com o de outra prova.
const concurso = 90_000 + Math.floor(Math.random() * 9_000);

async function main() {
  console.log("\n=== sorteios oficiais ===\n");
  await limpar();
  try {
    const admin = new Cliente();
    let r = await admin.req("POST", "/api/auth/login", {
      email: process.env.SEED_ADMIN_EMAIL ?? "admin@rifa.br",
      password: process.env.SEED_ADMIN_PASSWORD ?? "admin123",
    });
    if (r.status !== 200) throw new Error(`login do administrador: HTTP ${r.status}`);
    // Lançar o resultado pede senha e código na hora: liga o segundo fator do administrador
    // só durante a prova e devolve o que havia no fim.
    const emailAdmin = process.env.SEED_ADMIN_EMAIL ?? "admin@rifa.br";
    const senhaAdmin = process.env.SEED_ADMIN_PASSWORD ?? "admin123";
    const [adminDb] = await db.select().from(users).where(eq(users.email, emailAdmin));
    totpAnterior = adminDb.totpSecret;
    adminId = adminDb.id;
    const segredo = generateSecret();
    await db.execute(sql`delete from rate_events where bucket like 'segundo-fator:%'`);
    await db.update(users).set({ totpSecret: guardarSegredo(segredo) }).where(eq(users.id, adminDb.id));
    const fator = () => ({ password: senhaAdmin, code: totpCode(segredo) });
    const marina = new Cliente();
    r = await marina.req("POST", "/api/auth/login", { email: "marina@rifassaojose.br", password: "organizador123" });
    if (r.status !== 200) throw new Error(`login da organizadora: HTTP ${r.status}`);
    const org = (await marina.req("GET", "/api/admin/organizer")).json;

    const [vizinha] = await db.insert(organizations).values({ slug: VIZINHA, name: "Vizinha do Sorteio" }).returning();
    await db.insert(users).values({ role: "organizer", organizationId: vizinha.id, name: "Org Vizinha", email: EMAIL_VIZINHA, passwordHash: await hashPassword(SENHA_VIZINHA) });
    const viz = new Cliente();
    r = await viz.req("POST", "/api/auth/login", { email: EMAIL_VIZINHA, password: SENHA_VIZINHA });
    if (r.status !== 200) throw new Error(`login da vizinha: HTTP ${r.status}`);

    const rascunho = await rifa(org.organizacaoId, `${PREFIXO}-a`);
    const outra = await rifa(org.organizacaoId, `${PREFIXO}-b`);

    // --- só a plataforma cadastra ---
    const corpo = { loteria: "federal", concurso, sorteioEm: daqui(30), titulo: TITULO };
    r = await marina.req("POST", "/api/admin/sorteios-oficiais", corpo);
    checa("organizador não cadastra sorteio oficial (403)", r.status === 403, `HTTP ${r.status}`);
    r = await admin.req("POST", "/api/admin/sorteios-oficiais", { ...corpo, sorteioEm: daqui(-2) });
    checa("data que já passou é recusada (400)", r.status === 400, `HTTP ${r.status}`);
    r = await admin.req("POST", "/api/admin/sorteios-oficiais", { ...corpo, loteria: "bicho" });
    checa("loteria desconhecida é recusada (400)", r.status === 400, `HTTP ${r.status}`);
    r = await admin.req("POST", "/api/admin/sorteios-oficiais", corpo);
    checa("a plataforma cadastra (201)", r.status === 201, `HTTP ${r.status} ${r.json?.message ?? ""}`);
    const s1 = r.json;
    r = await admin.req("POST", "/api/admin/sorteios-oficiais", { ...corpo, titulo: `${TITULO} repetido` });
    checa("o mesmo concurso não entra duas vezes (409)", r.status === 409, `HTTP ${r.status}`);
    for (const [nome, metodo, caminho, b] of [
      ["editar", "PATCH", `/api/admin/sorteios-oficiais/${s1.id}`, { titulo: "x" }],
      ["cancelar", "POST", `/api/admin/sorteios-oficiais/${s1.id}/cancelar`, undefined],
      ["lançar resultado", "POST", `/api/admin/sorteios-oficiais/${s1.id}/resultado`, { numeros: [] }],
    ] as const) {
      r = await marina.req(metodo, caminho, b);
      checa(`organizador não pode ${nome} (403)`, r.status === 403, `HTTP ${r.status}`);
    }

    // --- calendário da organização ---
    r = await marina.req("GET", "/api/admin/sorteios-oficiais");
    const noCal = (r.json as { id: string; problemaParaIntegrar: string | null; publicadas?: number }[]).find((s) => s.id === s1.id);
    checa("a organização vê o sorteio no calendário, aceitando rifa", Boolean(noCal) && noCal!.problemaParaIntegrar === null);
    checa("a organização não vê quantas rifas de outros há", noCal ? noCal.publicadas === undefined : false);

    // --- integrar ---
    r = await viz.req("PUT", `/api/admin/campaigns/${rascunho.id}/sorteio-oficial`, { sorteioOficialId: s1.id });
    checa("a vizinha não integra a rifa de outra (404)", r.status === 404, `HTTP ${r.status}`);
    r = await marina.req("PUT", `/api/admin/campaigns/${rascunho.id}/sorteio-oficial`, { sorteioOficialId: "nada" });
    checa("id inválido é recusado (400)", r.status === 400, `HTTP ${r.status}`);
    r = await marina.req("PUT", `/api/admin/campaigns/${rascunho.id}/sorteio-oficial`, { sorteioOficialId: s1.id });
    checa("a organização integra a rifa em rascunho", r.status === 200, `HTTP ${r.status} ${r.json?.message ?? ""}`);
    let [c] = await db.select().from(campaigns).where(eq(campaigns.id, rascunho.id));
    checa("a data da rifa virou a do concurso", c.sorteioOficialId === s1.id && c.drawAt?.toISOString() === new Date(s1.sorteioEm).toISOString());
    r = await marina.req("PUT", `/api/admin/campaigns/${rascunho.id}/legal`, { drawAt: daqui(100) });
    checa("a data não muda pelos dados legais (422)", r.status === 422, `HTTP ${r.status} ${r.json?.message ?? ""}`);
    r = await marina.req("PATCH", `/api/admin/campaigns/${rascunho.id}`, { sorteioOficialId: null, title: "Rifa nova" });
    [c] = await db.select().from(campaigns).where(eq(campaigns.id, rascunho.id));
    checa("o PATCH genérico não tira do sorteio", c.sorteioOficialId === s1.id);

    // A plataforma muda a data: a rifa em rascunho acompanha.
    const novaData = daqui(40);
    r = await admin.req("PATCH", `/api/admin/sorteios-oficiais/${s1.id}`, { sorteioEm: novaData });
    [c] = await db.select().from(campaigns).where(eq(campaigns.id, rascunho.id));
    checa("mudar a data do sorteio leva a rifa em rascunho junto", r.status === 200 && c.drawAt?.toISOString() === new Date(novaData).toISOString(), `HTTP ${r.status}`);

    // --- a tela pública: rascunho não aparece; publicada, sim ---
    let tela = (await new Cliente().req("GET", "/api/public/sorteio-oficial")).json;
    const ehONosso = tela?.sorteio?.id === s1.id;
    if (ehONosso) checa("rascunho não aparece na fileira", !tela.sorteio.rifas.some((x: { slug: string }) => x.slug === rascunho.slug));
    await db.update(campaigns).set({ status: "published", publishedAt: new Date() }).where(eq(campaigns.id, rascunho.id));
    tela = (await new Cliente().req("GET", "/api/public/sorteio-oficial")).json;
    if (tela?.sorteio?.id === s1.id) {
      checa("publicada aparece na fileira, sem dado de pessoa", tela.sorteio.rifas.some((x: { slug: string }) => x.slug === rascunho.slug) && !JSON.stringify(tela).includes("transmissaoUrl"));
    } else {
      console.log("  · outro sorteio oficial vem antes na tela; a fileira foi conferida pela rifa");
    }
    r = await new Cliente().req("GET", `/api/public/campaigns/${rascunho.slug}`);
    checa("a página da rifa traz o selo do sorteio oficial", typeof r.json?.campaign?.sorteioOficial?.selo === "string" && r.json.campaign.sorteioOficial.selo.includes(String(concurso)), r.json?.campaign?.sorteioOficial?.selo);

    // --- com rifa publicada, data e cancelamento travam ---
    r = await admin.req("PATCH", `/api/admin/sorteios-oficiais/${s1.id}`, { sorteioEm: daqui(50) });
    checa("com rifa publicada, a data não muda (409)", r.status === 409, `HTTP ${r.status}`);
    r = await admin.req("PATCH", `/api/admin/sorteios-oficiais/${s1.id}`, { titulo: `${TITULO} renomeado` });
    checa("o título muda", r.status === 200, `HTTP ${r.status}`);
    r = await admin.req("POST", `/api/admin/sorteios-oficiais/${s1.id}/cancelar`);
    checa("com rifa publicada, não cancela (409)", r.status === 409, `HTTP ${r.status}`);
    r = await marina.req("PUT", `/api/admin/campaigns/${rascunho.id}/sorteio-oficial`, { sorteioOficialId: null });
    checa("rifa publicada não sai do sorteio sozinha (409)", r.status === 409, `HTTP ${r.status}`);

    // --- resultado ---
    r = await admin.req("POST", `/api/admin/sorteios-oficiais/${s1.id}/resultado`, { ...fator(), numeros: ["01234", "56789", "00001", "99999", "12345"] });
    checa("antes da hora, o resultado não entra (409)", r.status === 409, `HTTP ${r.status}`);
    await db.update(sorteiosOficiais).set({ sorteioEm: new Date(Date.now() - 60_000) }).where(eq(sorteiosOficiais.id, s1.id));
    r = await admin.req("PATCH", `/api/admin/sorteios-oficiais/${s1.id}`, { transmissaoUrl: "https://www.youtube.com/watch?v=prova" });
    checa("depois da hora, a transmissão ainda muda (antes do resultado)", r.status === 200, `HTTP ${r.status} ${r.json?.message ?? ""}`);
    // O segundo fator na hora: sem senha e código, com código errado e sem o segundo fator ligado.
    const bolasOk = { numeros: ["01234", "56789", "00001", "99999", "12345"] };
    r = await admin.req("POST", `/api/admin/sorteios-oficiais/${s1.id}/resultado`, bolasOk);
    checa("sem senha e código, o resultado não entra (401)", r.status === 401 && r.json?.code === "segundo_fator_pedido", `HTTP ${r.status} ${r.json?.code}`);
    r = await admin.req("POST", `/api/admin/sorteios-oficiais/${s1.id}/resultado`, { ...bolasOk, password: senhaAdmin, code: totpCode(segredo) === "000000" ? "111111" : "000000" });
    checa("com o código errado, o resultado não entra (401)", r.status === 401, `HTTP ${r.status}`);
    r = await admin.req("POST", `/api/admin/sorteios-oficiais/${s1.id}/resultado`, { ...bolasOk, password: "senha-errada-123", code: totpCode(segredo) });
    checa("com a senha errada, o resultado não entra (401)", r.status === 401, `HTTP ${r.status}`);
    const [antes] = await db.select().from(sorteiosOficiais).where(eq(sorteiosOficiais.id, s1.id));
    checa("recusado, nada foi gravado", antes.resultado === null);
    await db.update(users).set({ totpSecret: null }).where(eq(users.id, adminDb.id));
    r = await admin.req("POST", `/api/admin/sorteios-oficiais/${s1.id}/resultado`, { ...bolasOk, ...fator() });
    checa("sem o segundo fator ligado, manda ligar (409)", r.status === 409 && r.json?.code === "totp_required", `HTTP ${r.status} ${r.json?.code}`);
    await db.update(users).set({ totpSecret: guardarSegredo(segredo) }).where(eq(users.id, adminDb.id));
    r = await admin.req("POST", `/api/admin/sorteios-oficiais/${s1.id}/resultado`, { ...fator(), numeros: ["1234", "56789", "00001", "99999", "12345"] });
    checa("fora do formato da Federal é recusado (400)", r.status === 400, `HTTP ${r.status}`);
    const certos = ["01234", "56789", "00001", "99999", "12345"];
    const [a1, a2] = await Promise.all([
      admin.req("POST", `/api/admin/sorteios-oficiais/${s1.id}/resultado`, { ...fator(), numeros: certos }),
      admin.req("POST", `/api/admin/sorteios-oficiais/${s1.id}/resultado`, { ...fator(), numeros: certos }),
    ]);
    checa("dois cliques: um resultado e um 409", [a1.status, a2.status].sort().join(",") === "200,409", `${a1.status}/${a2.status}`);
    const [s1b] = await db.select().from(sorteiosOficiais).where(eq(sorteiosOficiais.id, s1.id));
    checa("o resultado oficial fica guardado", JSON.stringify(s1b.resultado) === JSON.stringify(certos));

    // --- fase 2: o resultado sorteia as rifas publicadas integradas ---
    // A rifa publicada sem semente não pode sortear: guarda o motivo.
    [c] = await db.select().from(campaigns).where(eq(campaigns.id, rascunho.id));
    checa("a rifa que não pôde sortear segue publicada, com o motivo", c.status === "published" && Boolean(c.sorteioAutoMotivo), c.sorteioAutoMotivo ?? "");
    r = await marina.req("GET", "/api/admin/sorteios-oficiais");
    const naTela = (r.json as { id: string; rifas: { id: string; esperando?: string | null }[] }[])
      .find((s) => s.id === s1.id)
      ?.rifas.find((x) => x.id === rascunho.id);
    checa("o calendário mostra por que a rifa ainda não sorteou", Boolean(naTela?.esperando));
    // Com a semente, o botão do painel sorteia pelo resultado oficial — o formulário não vale.
    const seedA = await semente(rascunho.id);
    r = await marina.req("POST", `/api/admin/campaigns/${rascunho.id}/draw`, { federalContest: 1, federalPrizes: ["11111", "22222", "33333", "44444", "55555"] });
    let [dA] = await db.select().from(draws).where(eq(draws.campaignId, rascunho.id));
    checa(
      "o botão do painel usa o resultado oficial, não o formulário",
      r.status === 200 && JSON.stringify(dA.federalPrizes) === JSON.stringify(certos) && dA.federalContest === concurso,
      `HTTP ${r.status} ${r.json?.message ?? ""}`,
    );
    checa("a Federal segue a conta de sempre (sem loteria gravada)", dA.loteria === null && dA.resultNumber === drawNumber({ seed: seedA, federalPrizes: certos, totalQuotas: 500 }));
    [c] = await db.select().from(campaigns).where(eq(campaigns.id, rascunho.id));
    checa("sorteada, o motivo some", c.status === "drawn" && c.sorteioAutoMotivo === null);

    // Mega-Sena: fica no calendário, mas não recebe rifa — só a Federal apura
    // (autorização SPA/MF; decisão do advogado em 05/10/2026).
    r = await admin.req("POST", "/api/admin/sorteios-oficiais", { loteria: "mega_sena", concurso, sorteioEm: daqui(60), titulo: `${TITULO} mega` });
    const mega = r.json;
    checa("a Mega-Sena entra no calendário", r.status === 201 || r.status === 200, `HTTP ${r.status} ${r.json?.message ?? ""}`);
    const rMega = await rifa(org.organizacaoId, `${PREFIXO}-mega`);
    r = await marina.req("PUT", `/api/admin/campaigns/${rMega.id}/sorteio-oficial`, { sorteioOficialId: mega.id });
    checa("a Mega-Sena não recebe rifa (409, só a Federal)", r.status === 409 && /Federal/.test(r.json?.message ?? ""), `HTTP ${r.status} ${r.json?.message ?? ""}`);
    r = await marina.req("GET", "/api/admin/sorteios-oficiais");
    const megaNaTela = (r.json?.sorteios ?? r.json ?? []).find?.((x: { id: string }) => x.id === mega.id);
    checa("o calendário diz por que a Mega-Sena não recebe rifa", /Federal/.test(megaNaTela?.problemaParaIntegrar ?? ""), JSON.stringify(megaNaTela?.problemaParaIntegrar));

    // Mínimo não atingido: o resultado não sorteia, o motivo fica, e o
    // adiamento leva a rifa para outro sorteio oficial (com a plataforma).
    r = await admin.req("POST", "/api/admin/sorteios-oficiais", { loteria: "federal", concurso: concurso + 2, sorteioEm: daqui(30), titulo: `${TITULO} 4` });
    const s4 = r.json;
    const rMin = await rifa(org.organizacaoId, `${PREFIXO}-minimo`, { minimoVendidoPct: 50 });
    r = await marina.req("PUT", `/api/admin/campaigns/${rMin.id}/sorteio-oficial`, { sorteioOficialId: s4.id });
    await semente(rMin.id);
    await publicar(rMin.id);
    await passouAHora(s4.id);
    r = await admin.req("POST", `/api/admin/sorteios-oficiais/${s4.id}/resultado`, { ...fator(), numeros: certos });
    [c] = await db.select().from(campaigns).where(eq(campaigns.id, rMin.id));
    checa(
      "abaixo do mínimo, o resultado não sorteia e o motivo fica",
      r.json?.rifas?.esperando === 1 && c.status === "published" && /mínimo/.test(c.sorteioAutoMotivo ?? ""),
      c.sorteioAutoMotivo ?? "",
    );
    // Passada a hora do concurso, a rifa integrada não vende mais: a reserva
    // nova adiaria o sorteio automático sem fim.
    await db.update(campaigns).set({ drawAt: new Date(Date.now() - 60_000) }).where(eq(campaigns.id, rMin.id));
    r = await new Cliente().req("POST", "/api/public/orders", { campaignId: rMin.id, quantity: 1, buyer: { name: "Comprador Tardio", phone: "11955550101" } });
    checa("depois do sorteio oficial, a rifa integrada não vende (409)", r.status === 409 && /fecharam/.test(r.json?.message ?? ""), `HTTP ${r.status} ${r.json?.message ?? ""}`);
    r = await admin.req("POST", "/api/admin/sorteios-oficiais", { loteria: "federal", concurso: concurso + 3, sorteioEm: daqui(72), titulo: `${TITULO} 5` });
    const s5 = r.json;
    r = await marina.req("POST", `/api/admin/campaigns/${rMin.id}/adiar`, { sorteioOficialId: s4.id, motivo: "A meta não foi atingida ainda." });
    checa("o adiamento não volta para o mesmo sorteio (422)", r.status === 422, `HTTP ${r.status} ${r.json?.message ?? ""}`);
    r = await marina.req("POST", `/api/admin/campaigns/${rMin.id}/adiar`, { sorteioOficialId: s5.id, novaData: daqui(2000), motivo: "A meta não foi atingida ainda." });
    checa("a organização pede para ir a outro sorteio oficial (202)", r.status === 202, `HTTP ${r.status} ${r.json?.message ?? ""}`);
    let pedido = r.json?.solicitacaoId as string;
    [c] = await db.select().from(campaigns).where(eq(campaigns.id, rMin.id));
    checa("nada muda até a plataforma aprovar", c.sorteioOficialId === s4.id);
    r = await marina.req("POST", `/api/admin/solicitacoes/${pedido}/decidir`, { aprovar: true });
    checa("a organização não aprova o próprio pedido (403)", r.status === 403, `HTTP ${r.status}`);
    r = await admin.req("PATCH", `/api/admin/sorteios-oficiais/${s5.id}`, { loteria: "lotofacil" });
    checa("com pedido em análise para ele, a loteria do sorteio não muda (409)", r.status === 409, `HTTP ${r.status}`);
    // A plataforma muda a data do sorteio pedido: a aprovação recusa (409).
    r = await admin.req("PATCH", `/api/admin/sorteios-oficiais/${s5.id}`, { sorteioEm: daqui(80) });
    r = await admin.req("POST", `/api/admin/solicitacoes/${pedido}/decidir`, { aprovar: true });
    checa("o sorteio pedido mudou de data: a aprovação recusa (409)", r.status === 409, `HTTP ${r.status} ${r.json?.message ?? ""}`);
    r = await admin.req("POST", `/api/admin/solicitacoes/${pedido}/decidir`, { aprovar: false, resposta: "A data do sorteio mudou; peça de novo." });
    r = await marina.req("POST", `/api/admin/campaigns/${rMin.id}/adiar`, { sorteioOficialId: s5.id, motivo: "A meta não foi atingida ainda." });
    pedido = r.json?.solicitacaoId as string;
    const [detalhe] = [(await admin.req("GET", `/api/admin/solicitacoes/${pedido}`)).json];
    checa("a plataforma vê o sorteio oficial pedido", String(detalhe?.solicitacao?.sorteioOficialNovo?.selo ?? "").includes("Federal"));
    r = await admin.req("POST", `/api/admin/solicitacoes/${pedido}/decidir`, { aprovar: true });
    [c] = await db.select().from(campaigns).where(eq(campaigns.id, rMin.id));
    const [s5b] = await db.select().from(sorteiosOficiais).where(eq(sorteiosOficiais.id, s5.id));
    checa(
      "aprovado, a rifa passa para o sorteio pedido, com a data dele",
      r.status === 200 && c.sorteioOficialId === s5.id && c.drawAt?.getTime() === s5b.sorteioEm.getTime() && c.adiamentos === 1 && c.sorteioAutoMotivo === null,
      `HTTP ${r.status} ${r.json?.message ?? ""}`,
    );
    r = await admin.req("PATCH", `/api/admin/sorteios-oficiais/${s5.id}`, { sorteioEm: daqui(90) });
    checa("com a rifa publicada nele, a data do novo sorteio trava (409)", r.status === 409, `HTTP ${r.status}`);

    // --- cancelar um sorteio só com rascunho: a rifa sai e fica sem data ---
    r = await admin.req("POST", "/api/admin/sorteios-oficiais", { loteria: "federal", concurso: concurso + 1, sorteioEm: daqui(60), titulo: `${TITULO} 2` });
    const s2 = r.json;
    r = await marina.req("PUT", `/api/admin/campaigns/${outra.id}/sorteio-oficial`, { sorteioOficialId: s2.id });
    checa("integra noutro concurso da Federal", r.status === 200, `HTTP ${r.status}`);
    r = await admin.req("PATCH", `/api/admin/sorteios-oficiais/${s2.id}`, { loteria: "quina" });
    checa("com rifa no sorteio, a loteria não muda (409)", r.status === 409, `HTTP ${r.status}`);
    // Mudar o modo para "quando completar" não passa com a rifa no sorteio.
    r = await marina.req("PUT", `/api/admin/campaigns/${outra.id}/legal`, { modoSorteio: "quando_completar" });
    checa("integrada, a rifa não vira \"quando completar\" (422)", r.status === 422, `HTTP ${r.status}`);
    r = await admin.req("POST", `/api/admin/sorteios-oficiais/${s2.id}/cancelar`);
    [c] = await db.select().from(campaigns).where(eq(campaigns.id, outra.id));
    checa("cancelar tira a rifa em rascunho e a deixa sem data", r.status === 200 && c.sorteioOficialId === null && c.drawAt === null, `HTTP ${r.status}`);
    r = await marina.req("PUT", `/api/admin/campaigns/${outra.id}/sorteio-oficial`, { sorteioOficialId: s2.id });
    checa("sorteio cancelado não aceita rifa (409)", r.status === 409, `HTTP ${r.status}`);
    r = await admin.req("POST", "/api/admin/sorteios-oficiais", { loteria: "federal", concurso: concurso + 4, sorteioEm: daqui(12), titulo: `${TITULO} 3` });
    const s3 = r.json;
    r = await marina.req("PUT", `/api/admin/campaigns/${outra.id}/sorteio-oficial`, { sorteioOficialId: s3.id });
    checa("a menos de 24 h, a rifa não entra (409)", r.status === 409 && /24 horas/.test(r.json?.message ?? ""), `HTTP ${r.status} ${r.json?.message ?? ""}`);
  } finally {
    if (adminId) await db.update(users).set({ totpSecret: totpAnterior ?? null }).where(eq(users.id, adminId));
    await limpar();
  }
  console.log(falhas ? `\n${falhas} falha(s)` : "\ntudo certo");
  await pool.end();
  process.exit(falhas ? 1 : 0);
}

main().catch(async (e) => {
  console.error(e);
  await limpar().catch(() => {});
  await pool.end();
  process.exit(1);
});
