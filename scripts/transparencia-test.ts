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
import { campaignStats, campaigns, draws, organizations } from "../shared/schema";
import { commitSeed, drawNumber } from "../server/services/draw";
import { conferirSorteio } from "../shared/sorteio";

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

async function limpar() {
  await db.execute(sql`delete from campaigns where slug like ${`${PREFIXO}%`}`);
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
