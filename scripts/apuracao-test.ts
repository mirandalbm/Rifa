/**
 * Prova da apuração pela leitura direta da Loteria Federal, pela API de
 * verdade: os métodos liberados pela plataforma (e só por ela), a escolha da
 * promotora nos dados legais, o total só em potência de 10, a publicação
 * barrada sem método, o sorteio pela leitura direta com a numeração a partir
 * de zero (e a aproximação), a conferência sem semente e o regulamento com a
 * cláusula do advogado. A rifa de antes, sem método, segue pela semente.
 *
 *   npm run apuracao      (com `npm run dev` no ar e o seed aplicado)
 */
import "dotenv/config";
import { baseUrl } from "./base-url";
import { eq, sql } from "drizzle-orm";
import { db, pool } from "../server/db";
import { buyers, campaignStats, campaigns, draws, orders, organizations, quotaAlloc } from "../shared/schema";
import { commitSeed, drawNumber } from "../server/services/draw";
import { PREMIOS_DE_EXEMPLO } from "../shared/apuracao";

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

const PREFIXO = "apuracao-teste";
const FONE = "11960007799";
const EXEMPLO = [...PREMIOS_DE_EXEMPLO];

async function limpar() {
  await db.execute(sql`delete from campaigns where slug like ${`${PREFIXO}%`}`);
  await db.execute(sql`delete from buyers where phone = ${FONE}`);
}

async function main() {
  console.log("\n=== apuração pela leitura direta da Loteria Federal ===\n");
  await limpar();
  const [org] = await db.select().from(organizations).where(eq(organizations.slug, "rifas-sao-jose"));
  if (!org) throw new Error("Rode `npm run db:seed` antes.");

  const admin = new Cliente();
  const marina = new Cliente();
  const anon = new Cliente();
  if ((await admin.req("POST", "/api/auth/login", { email: "admin@rifa.br", password: "admin123" })).status !== 200) throw new Error("login da plataforma");
  if ((await marina.req("POST", "/api/auth/login", { email: "marina@rifassaojose.br", password: "organizador123" })).status !== 200) throw new Error("login da organizadora");

  const antes = (await admin.req("GET", "/api/admin/apuracao/metodos")).json?.liberados ?? ["federal_direta"];

  const novaRifa = async (sufixo: string, extra: Partial<typeof campaigns.$inferInsert> = {}) => {
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
        status: "published",
        drawAt: new Date(Date.now() + 3 * 86_400_000),
        authorizationCode: "SPA-APUR-1",
        drawSeedHash: seedHash,
        metodoApuracao: "federal_direta",
        ...extra,
      })
      .returning();
    await db.insert(campaignStats).values({ campaignId: c.id });
    await db.insert(draws).values({ campaignId: c.id, seed, seedHash });
    return { c, seed };
  };
  const [comprador] = await db.insert(buyers).values({ name: "Teste Apuração", phone: FONE }).returning();
  let codigo = 90_300_000 + Math.floor(Math.random() * 100_000);
  const vender = async (campaignId: string, internos: number[]) => {
    for (const n of internos) {
      const [o] = await db
        .insert(orders)
        .values({ code: codigo++, campaignId, buyerId: comprador.id, quantity: 1, amountCents: 500, status: "paid", paidAt: new Date() })
        .returning();
      await db.insert(quotaAlloc).values({ campaignId, number: n, status: "paid", orderId: o.id });
    }
  };
  const sortear = (id: string, premios: string[]) =>
    admin.req("POST", `/api/admin/campaigns/${id}/draw`, { federalContest: 6100, federalPrizes: premios });

  try {
    // ---------------- métodos: só a plataforma libera ----------------
    console.log("  métodos liberados:");
    let r = await marina.req("GET", "/api/admin/apuracao/metodos");
    checa("a organização lê os métodos liberados", r.status === 200 && Array.isArray(r.json?.liberados), `HTTP ${r.status}`);
    r = await marina.req("PUT", "/api/admin/apuracao/metodos", { liberados: ["federal_direta"] });
    checa("a organização não libera método (403)", r.status === 403, `HTTP ${r.status}`);
    r = await admin.req("PUT", "/api/admin/apuracao/metodos", { liberados: ["globo"] });
    checa("o globo não liga antes da homologação (400)", r.status === 400, `HTTP ${r.status}`);
    r = await admin.req("PUT", "/api/admin/apuracao/metodos", { liberados: ["hash"] });
    checa("método desconhecido: 400", r.status === 400, `HTTP ${r.status}`);
    r = await admin.req("PUT", "/api/admin/apuracao/metodos", { liberados: ["federal_direta"] });
    checa("a plataforma libera a Federal direta", r.status === 200 && r.json?.liberados?.[0] === "federal_direta");

    // ---------------- criação: total só em potência de 10 ----------------
    console.log("\n  criação e dados legais:");
    r = await marina.req("POST", "/api/admin/campaigns", { title: "Quinhentas", slug: `${PREFIXO}-500`, prizeTitle: "Moto", totalQuotas: 500, priceCents: 500, commissionPctDefault: 10 });
    checa("total 500 recusado (só potência de 10)", r.status === 422, `HTTP ${r.status}`);
    r = await marina.req("POST", "/api/admin/campaigns", { title: "Apuração", slug: `${PREFIXO}-nova`, prizeTitle: "Moto", totalQuotas: 1000, priceCents: 500, commissionPctDefault: 10 });
    checa("rifa nova nasce com a Federal direta", r.status === 201 && r.json?.metodoApuracao === "federal_direta", `HTTP ${r.status} ${r.json?.metodoApuracao}`);
    const nova = r.json;
    r = await marina.req("PATCH", `/api/admin/campaigns/${nova.id}`, { totalQuotas: 2500 });
    checa("mudar o total para 2.500 no rascunho: 422", r.status === 422, `HTTP ${r.status}`);
    r = await marina.req("PATCH", `/api/admin/campaigns/${nova.id}`, { metodoApuracao: null, title: "Apuração" });
    const [depoisDoPatch] = await db.select().from(campaigns).where(eq(campaigns.id, nova.id));
    checa("o método não muda pelo PATCH genérico", depoisDoPatch.metodoApuracao === "federal_direta");
    r = await marina.req("PUT", `/api/admin/campaigns/${nova.id}/legal`, { metodoApuracao: "globo" });
    checa("a promotora não escolhe o globo (ainda não liberado): 422", r.status === 422, `HTTP ${r.status}`);
    r = await marina.req("PUT", `/api/admin/campaigns/${nova.id}/legal`, { metodoApuracao: "hash" });
    checa("nem a semente (método de antes): 422", r.status === 422, `HTTP ${r.status}`);
    r = await marina.req("PUT", `/api/admin/campaigns/${nova.id}/legal`, { metodoApuracao: "federal_direta" });
    checa("escolhe a Federal direta nos dados legais", r.status === 200 && r.json?.metodoApuracao === "federal_direta", `HTTP ${r.status}`);

    // Sem método liberado, nada publica (e a escolha recusa).
    await admin.req("PUT", "/api/admin/apuracao/metodos", { liberados: [] });
    r = await marina.req("GET", `/api/admin/campaigns/${nova.id}/blockers`);
    checa("plataforma desligou o método: a publicação acusa", (r.json?.blockers ?? []).some((b: string) => b.includes("não está liberado")), JSON.stringify(r.json?.blockers));
    r = await marina.req("POST", `/api/admin/campaigns/${nova.id}/publish`);
    checa("…e recusa publicar", r.status === 422, `HTTP ${r.status}`);
    await admin.req("PUT", "/api/admin/apuracao/metodos", { liberados: ["federal_direta"] });

    const semMetodo = await novaRifa("sem-metodo", { status: "draft", metodoApuracao: null });
    r = await marina.req("GET", `/api/admin/campaigns/${semMetodo.c.id}/blockers`);
    checa("rascunho sem método: pede a escolha", (r.json?.blockers ?? []).some((b: string) => b.includes("Escolha o método")));
    r = await admin.req("POST", `/api/admin/campaigns/${semMetodo.c.id}/prized`, { prizeLabel: "R$ 20", numeros: "100" });
    r = await marina.req("PUT", `/api/admin/campaigns/${semMetodo.c.id}/legal`, { metodoApuracao: "federal_direta" });
    checa("com cota premiada escolhida, trocar para a numeração a partir de zero recusa (422)", r.status === 422, `HTTP ${r.status}`);
    const total500 = await novaRifa("total-500", { status: "draft", totalQuotas: 500 });
    r = await marina.req("GET", `/api/admin/campaigns/${total500.c.id}/blockers`);
    checa("rascunho com 500 cotas (de antes): não publica", (r.json?.blockers ?? []).some((b: string) => b.includes("potência") || b.includes("100, 1.000")));

    // Cota premiada escolhida pela plataforma: lê o número da tela (000 a 999).
    r = await admin.req("POST", `/api/admin/campaigns/${nova.id}/prized`, { prizeLabel: "R$ 50", numeros: "000, 999" });
    checa("cota premiada escolhida pelo número da tela", r.status === 201, `HTTP ${r.status}`);
    r = await admin.req("GET", `/api/admin/campaigns/${nova.id}/prized`);
    const internos = (r.json ?? []).map((p: { number: number }) => p.number).sort((a: number, b: number) => a - b);
    checa("…e guarda o interno (000 → 1, 999 → 1000)", JSON.stringify(internos) === "[1,1000]", JSON.stringify(internos));
    r = await admin.req("POST", `/api/admin/campaigns/${nova.id}/prized`, { prizeLabel: "R$ 50", numeros: "1000" });
    checa("1000 não existe numa rifa de 000 a 999: 400", r.status === 400, `HTTP ${r.status}`);

    // ---------------- sorteio pela leitura direta ----------------
    console.log("\n  sorteio pela leitura direta:");
    const vendida = await novaRifa("vendida");
    await vender(vendida.c.id, [140, 500]);
    r = await sortear(vendida.c.id, EXEMPLO);
    checa("exemplo do advogado em 1.000: o 139 (interno 140) leva", r.status === 200 && r.json?.resultNumber === 140 && r.json?.winnerNumber === 140, `HTTP ${r.status} ${r.json?.resultNumber}`);
    r = await anon.req("GET", `/api/public/campaigns/${vendida.c.slug}/sorteio`);
    checa("a página mostra 139, sem semente nem hash",
      r.json?.numero === "139" && r.json?.contemplado === "139" && r.json?.seed === null && r.json?.seedHash === null,
      `${r.json?.numero} seed=${r.json?.seed}`);
    checa("e a leitura passo a passo", Array.isArray(r.json?.leitura) && r.json.leitura.at(-1).includes("139") && r.json.leitura[0].includes("34.567"));
    const semente = (await db.select().from(draws).where(eq(draws.campaignId, vendida.c.id)))[0].seed;
    checa("a semente não sai em resposta nenhuma", !JSON.stringify(r.json).includes(semente));
    r = await anon.req("GET", `/api/public/campaigns/${vendida.c.slug}`);
    checa("a página da rifa diz que numera a partir de zero e não mostra o hash",
      r.json?.campaign?.numeracaoZero === true && r.json?.campaign?.drawSeedHash === null && r.json?.campaign?.metodoApuracao === "federal_direta");
    r = await anon.req("GET", `/api/public/campaigns/${vendida.c.slug}/regulamento`);
    const reg = JSON.stringify(r.json?.secoes ?? []);
    checa("o regulamento traz a cláusula do advogado", reg.includes("unidades simples do 1º ao 5º prêmio") && reg.includes("de 000 a 999") && reg.includes("detentor do número 139"));
    checa("…numera de 000 a 999 e não fala em semente", reg.includes("numeradas de 000 a 999") && !/semente|hash/i.test(reg));

    const aprox = await novaRifa("aproximacao");
    await vender(aprox.c.id, [138, 142]);
    r = await sortear(aprox.c.id, EXEMPLO);
    checa("139 não vendido: leva o imediatamente acima (141 na tela)", r.json?.winnerNumber === 142 && r.json?.aproximacao === true, `${r.json?.winnerNumber}`);
    r = await anon.req("GET", `/api/public/campaigns/${aprox.c.slug}/sorteio`);
    checa("a página mostra o sorteado e o contemplado na numeração da tela", r.json?.numero === "139" && r.json?.contemplado === "141", `${r.json?.numero}/${r.json?.contemplado}`);

    const milhao = await novaRifa("milhao", { totalQuotas: 1_000_000 });
    await vender(milhao.c.id, [678_140]);
    r = await sortear(milhao.c.id, EXEMPLO);
    checa("1.000.000: Série 6 + 78.139 = 678.139 (interno 678.140)", r.json?.resultNumber === 678_140 && r.json?.winnerNumber === 678_140, `${r.json?.resultNumber}`);
    r = await anon.req("GET", `/api/public/campaigns/${milhao.c.slug}/sorteio`);
    checa("…e a tela mostra 678139", r.json?.numero === "678139", r.json?.numero);

    const zeros = await novaRifa("zeros");
    await vender(zeros.c.id, [1]);
    r = await sortear(zeros.c.id, ["12340", "55550", "00000", "98760", "11110"]);
    checa("unidades 0-0-0-0-0: o bilhete 000 (interno 1) leva", r.json?.resultNumber === 1 && r.json?.winnerNumber === 1, `${r.json?.resultNumber}`);

    const errado = await novaRifa("errado");
    r = await sortear(errado.c.id, ["1", "2", "3", "4", "5"]);
    checa("prêmio sem 5 algarismos: 400, nada sorteado", r.status === 400, `HTTP ${r.status}`);

    const globo = await novaRifa("globo", { metodoApuracao: "globo" });
    r = await sortear(globo.c.id, EXEMPLO);
    checa("método que o sistema ainda não sorteia (globo): 409", r.status === 409, `HTTP ${r.status}`);

    // ---------------- a rifa de antes segue pela semente ----------------
    console.log("\n  rifa de antes (sem método):");
    const antiga = await novaRifa("antiga", { metodoApuracao: null });
    const esperado = drawNumber({ seed: antiga.seed, federalPrizes: EXEMPLO, totalQuotas: 1000 });
    r = await sortear(antiga.c.id, EXEMPLO);
    checa("sorteia pela semente, como sempre", r.json?.resultNumber === esperado, `${r.json?.resultNumber} vs ${esperado}`);
    r = await anon.req("GET", `/api/public/campaigns/${antiga.c.slug}/sorteio`);
    checa("…com a semente publicada e a numeração de 1", r.json?.seed === antiga.seed && r.json?.numero === String(esperado).padStart(4, "0"));
  } finally {
    await admin.req("PUT", "/api/admin/apuracao/metodos", { liberados: antes });
    await limpar();
  }

  console.log(falhas ? `\n✗ ${falhas} falha(s)\n` : "\n✓ tudo certo\n");
  await pool.end();
  process.exit(falhas ? 1 : 0);
}

main().catch(async (e) => {
  console.error(e);
  await pool.end();
  process.exit(1);
});
