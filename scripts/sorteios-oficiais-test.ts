/**
 * Prova dos sorteios oficiais, pela API de verdade: só a plataforma cadastra,
 * muda, cancela e lança o resultado (403 para organizador); o mesmo concurso
 * não entra duas vezes; a organização integra a rifa em rascunho pelo
 * calendário (a data vira a do concurso) e a do vizinho é 404; a data não
 * muda pelos dados legais; com rifa publicada, data e cancelamento travam;
 * a tela pública traz só rifa publicada na fileira; o resultado só depois da
 * hora, no formato da loteria, uma vez só. Apaga o que criou no fim.
 *
 *   npm run sorteios      (com `npm run dev` no ar e o seed aplicado)
 */
import "dotenv/config";
import { eq, sql } from "drizzle-orm";
import { baseUrl } from "./base-url";
import { db, pool } from "../server/db";
import { hashPassword } from "../server/auth";
import { campaignStats, campaigns, organizations, sorteiosOficiais, users } from "../shared/schema";

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

async function rifa(organizationId: string, slug: string) {
  const [c] = await db
    .insert(campaigns)
    .values({ organizationId, slug, title: `Rifa ${slug}`, prizeTitle: `Prêmio ${slug}`, totalQuotas: 500, priceCents: 300, authorizationCode: "SPA-PROVA-1" })
    .returning();
  await db.insert(campaignStats).values({ campaignId: c.id });
  return c;
}

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
    r = await admin.req("POST", `/api/admin/sorteios-oficiais/${s1.id}/resultado`, { numeros: ["01234", "56789", "00001", "99999", "12345"] });
    checa("antes da hora, o resultado não entra (409)", r.status === 409, `HTTP ${r.status}`);
    await db.update(sorteiosOficiais).set({ sorteioEm: new Date(Date.now() - 60_000) }).where(eq(sorteiosOficiais.id, s1.id));
    r = await admin.req("PATCH", `/api/admin/sorteios-oficiais/${s1.id}`, { transmissaoUrl: "https://www.youtube.com/watch?v=prova" });
    checa("depois da hora, a transmissão ainda muda (antes do resultado)", r.status === 200, `HTTP ${r.status} ${r.json?.message ?? ""}`);
    r = await admin.req("POST", `/api/admin/sorteios-oficiais/${s1.id}/resultado`, { numeros: ["1234", "56789", "00001", "99999", "12345"] });
    checa("fora do formato da Federal é recusado (400)", r.status === 400, `HTTP ${r.status}`);
    const certos = ["01234", "56789", "00001", "99999", "12345"];
    const [a1, a2] = await Promise.all([
      admin.req("POST", `/api/admin/sorteios-oficiais/${s1.id}/resultado`, { numeros: certos }),
      admin.req("POST", `/api/admin/sorteios-oficiais/${s1.id}/resultado`, { numeros: certos }),
    ]);
    checa("dois cliques: um resultado e um 409", [a1.status, a2.status].sort().join(",") === "200,409", `${a1.status}/${a2.status}`);
    const [s1b] = await db.select().from(sorteiosOficiais).where(eq(sorteiosOficiais.id, s1.id));
    checa("o resultado oficial fica guardado", JSON.stringify(s1b.resultado) === JSON.stringify(certos));

    // --- cancelar um sorteio só com rascunho: a rifa sai e fica sem data ---
    r = await admin.req("POST", "/api/admin/sorteios-oficiais", { loteria: "mega_sena", concurso, sorteioEm: daqui(60), titulo: `${TITULO} mega` });
    const mega = r.json;
    r = await marina.req("PUT", `/api/admin/campaigns/${outra.id}/sorteio-oficial`, { sorteioOficialId: mega.id });
    checa("a Mega-Sena fica no calendário, mas ainda não recebe rifa (409)", r.status === 409, `HTTP ${r.status} ${r.json?.message ?? ""}`);
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
    r = await admin.req("POST", "/api/admin/sorteios-oficiais", { loteria: "quina", concurso, sorteioEm: daqui(12), titulo: `${TITULO} 3` });
    const s3 = r.json;
    r = await marina.req("PUT", `/api/admin/campaigns/${outra.id}/sorteio-oficial`, { sorteioOficialId: s3.id });
    checa("a menos de 24 h, a rifa não entra (409)", r.status === 409, `HTTP ${r.status}`);
  } finally {
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
