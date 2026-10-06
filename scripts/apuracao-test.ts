/**
 * Prova da apuração pela leitura direta da Loteria Federal, pela API de
 * verdade: os métodos liberados pela plataforma (e só por ela), a escolha da
 * promotora nos dados legais, o total só em potência de 10, a publicação
 * barrada sem método, o sorteio pela leitura direta com a numeração a partir
 * de zero (e a aproximação), a conferência sem semente e o regulamento com a
 * cláusula do advogado. O globo da plataforma: liberado pelo painel, a rifa
 * numa sessão do calendário, o resultado com a ata notarial e o arquivo do
 * cartório. A rifa de antes, sem método, segue pela semente.
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
  await db.execute(sql`delete from sorteios_oficiais where titulo like ${`${PREFIXO}%`}`);
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
    checa("o globo já liga pelo painel (a plataforma decide quando, sem publicar código)", r.status === 200 && r.json?.liberados?.[0] === "globo", `HTTP ${r.status}`);
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

    // 9.4: na rifa autorizada não há "a promotora completa", e a promotora não compra.
    r = await marina.req("PUT", `/api/admin/campaigns/${nova.id}/legal`, { modoSorteio: "promotora_completa" });
    checa("9.4: \"a promotora completa\" na rifa autorizada: 422", r.status === 422 && String(r.json?.message).includes("promotora não pode concorrer"), `HTTP ${r.status}`);
    const completa = await novaRifa("promotora-completa", { status: "draft", modoSorteio: "promotora_completa" });
    r = await marina.req("GET", `/api/admin/campaigns/${completa.c.id}/blockers`);
    checa("…e o rascunho que já estava assim não publica", (r.json?.blockers ?? []).some((b: string) => b.includes("promotora não pode concorrer")), JSON.stringify(r.json?.blockers));
    const impedida = await novaRifa("impedida");
    const foneDaPromotora = org.telefoneOrganizador;
    if (foneDaPromotora) {
      r = await anon.req("POST", "/api/public/orders", {
        campaignId: impedida.c.id,
        quantity: 1,
        buyer: { name: "Promotora", phone: `+55 ${foneDaPromotora.slice(0, 2)} ${foneDaPromotora.slice(2)}` },
      });
      checa("9.4: a compra com o telefone da promotora (com +55 e máscara) é recusada (403)", r.status === 403 && String(r.json?.message).includes("não podem participar"), `HTTP ${r.status} ${r.json?.message ?? ""}`);
      const [semReserva] = await db.select({ n: sql<number>`count(*)::int` }).from(quotaAlloc).where(eq(quotaAlloc.campaignId, impedida.c.id));
      checa("…sem gravar nada (nenhuma cota reservada)", Number(semReserva.n) === 0);
    } else {
      checa("a organização do seed tem telefone para provar o 9.4", false, "telefone_organizador vazio");
    }

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

    // Item 9 do advogado (9.1 a 9.3): +1, −1, +2, −2… na fita circular; bônus conta.
    const abaixo = await novaRifa("aprox-abaixo");
    await vender(abaixo.c.id, [139, 143]);
    r = await sortear(abaixo.c.id, EXEMPLO);
    checa("9.1: 139 sem dono, 138 a −1 e 142 a +3: leva o 138 (alterna, não só acima)", r.json?.winnerNumber === 139, `${r.json?.winnerNumber}`);
    const volta = await novaRifa("aprox-volta");
    await vender(volta.c.id, [2, 995]);
    r = await sortear(volta.c.id, ["00000", "00000", "00009", "00009", "00009"]);
    checa("9.3: 999 sem dono, a busca dá a volta: 001 (a +2) antes de 994 (a −5)", r.json?.resultNumber === 1000 && r.json?.winnerNumber === 2, `${r.json?.resultNumber}→${r.json?.winnerNumber}`);
    r = await anon.req("GET", `/api/public/campaigns/${volta.c.slug}/sorteio`);
    checa("…e a página mostra 999 → 001", r.json?.numero === "999" && r.json?.contemplado === "001", `${r.json?.numero}/${r.json?.contemplado}`);
    const bonus = await novaRifa("aprox-bonus");
    await vender(bonus.c.id, [500]);
    {
      const [o] = await db
        .insert(orders)
        .values({ code: codigo++, campaignId: bonus.c.id, buyerId: comprador.id, quantity: 1, amountCents: 0, status: "paid", method: "bonus", paidAt: new Date() })
        .returning();
      await db.insert(quotaAlloc).values({ campaignId: bonus.c.id, number: 141, status: "paid", orderId: o.id });
    }
    r = await sortear(bonus.c.id, EXEMPLO);
    checa("9.2: a cota de bônus é distribuída e leva (140 a +1)", r.json?.winnerNumber === 141, `${r.json?.winnerNumber}`);
    r = await anon.req("GET", `/api/public/campaigns/${bonus.c.slug}/regulamento`);
    const regFed = JSON.stringify(r.json?.secoes ?? []);
    checa("o regulamento traz o texto exato do 9.1, a fita circular e os impedidos (9.4)",
      regFed.includes("e assim alternadamente até que seja identificado um contemplado") && regFed.includes("circular") && regFed.includes("seus sócios e diretores"));

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

    // ---------------- o globo da plataforma (8.9 a 8.12) ----------------
    console.log("\n  globo da plataforma:");
    const globoSolto = await novaRifa("globo-solto", { metodoApuracao: "globo" });
    r = await sortear(globoSolto.c.id, EXEMPLO);
    checa("rifa do globo não sorteia pelo formulário (409)", r.status === 409 && String(r.json?.message).includes("globo"), `HTTP ${r.status}`);

    r = await admin.req("PUT", "/api/admin/apuracao/metodos", { liberados: ["federal_direta", "globo"] });
    checa("a plataforma libera o globo junto da Federal", r.status === 200 && r.json?.liberados?.includes("globo"), `HTTP ${r.status}`);
    const rascunhoGlobo = await novaRifa("globo-rascunho", { metodoApuracao: "globo", status: "draft" });
    r = await marina.req("GET", `/api/admin/campaigns/${rascunhoGlobo.c.id}/blockers`);
    checa("rifa do globo sem sessão no calendário não publica", (r.json?.blockers ?? []).some((b: string) => b.includes("sessão do globo")), JSON.stringify(r.json?.blockers));
    r = await marina.req("PUT", `/api/admin/campaigns/${rascunhoGlobo.c.id}/legal`, { modoSorteio: "quando_completar" });
    checa("globo + \"quando completar\": recusa (a antecipação é para a Federal)", r.status === 422, `HTTP ${r.status}`);

    const concurso = 90_000 + Math.floor(Math.random() * 9_000);
    const daqui48 = new Date(Date.now() + 48 * 3_600_000).toISOString();
    r = await marina.req("POST", "/api/admin/sorteios-oficiais", { loteria: "globo", concurso, sorteioEm: daqui48, titulo: `${PREFIXO} globo` });
    checa("a organização não cria sessão do globo (403)", r.status === 403, `HTTP ${r.status}`);
    r = await admin.req("POST", "/api/admin/sorteios-oficiais", { loteria: "globo", concurso, sorteioEm: daqui48, titulo: `${PREFIXO} globo` });
    checa("a plataforma cria a sessão do globo no calendário", r.status === 201 && r.json?.loteria === "globo", `HTTP ${r.status} ${r.json?.message ?? ""}`);
    const sessao = r.json?.id as string;

    const federalRascunho = await novaRifa("federal-rascunho", { status: "draft" });
    r = await marina.req("PUT", `/api/admin/campaigns/${federalRascunho.c.id}/sorteio-oficial`, { sorteioOficialId: sessao });
    checa("rifa da Federal não entra na sessão do globo (409)", r.status === 409 && String(r.json?.message).includes("Loteria Federal"), `HTTP ${r.status}`);
    r = await marina.req("PUT", `/api/admin/campaigns/${rascunhoGlobo.c.id}/sorteio-oficial`, { sorteioOficialId: sessao });
    checa("rifa do globo entra na sessão, com a data dela", r.status === 200 && new Date(r.json?.drawAt).getTime() === new Date(daqui48).getTime(), `HTTP ${r.status}`);
    r = await marina.req("GET", `/api/admin/campaigns/${rascunhoGlobo.c.id}/blockers`);
    checa("…e deixa de barrar pela sessão", !(r.json?.blockers ?? []).some((b: string) => b.includes("globo")), JSON.stringify(r.json?.blockers));
    await db.update(campaigns).set({ status: "published", publishedAt: new Date() }).where(eq(campaigns.id, rascunhoGlobo.c.id));
    await vender(rascunhoGlobo.c.id, [140, 500]);
    // 9.5: a segunda rifa da sessão não tem o 139 (interno 140): o globo gira de novo para ela.
    const ressorteio = await novaRifa("globo-ressorteio", { metodoApuracao: "globo", status: "draft" });
    r = await marina.req("PUT", `/api/admin/campaigns/${ressorteio.c.id}/sorteio-oficial`, { sorteioOficialId: sessao });
    checa("a segunda rifa do globo entra na mesma sessão", r.status === 200, `HTTP ${r.status}`);
    await db.update(campaigns).set({ status: "published", publishedAt: new Date() }).where(eq(campaigns.id, ressorteio.c.id));
    await vender(ressorteio.c.id, [139, 141, 500]);

    const regG = JSON.stringify((await anon.req("GET", `/api/public/campaigns/${rascunhoGlobo.c.slug}/regulamento`)).json?.secoes ?? []);
    checa("o regulamento traz a cláusula do globo, a ata e a sessão",
      regG.includes("6 (seis) globos independentes") && regG.includes("ata notarial") && regG.includes(`sessão nº ${concurso}`) && !/semente|hash/i.test(regG));

    const bolas = ["6", "7", "8", "1", "3", "9"];
    const ata = {
      local: "Av. Paulista, 1000, São Paulo/SP",
      tabelionato: "1º Tabelionato de Notas de São Paulo",
      registro: "Livro 12, folha 34",
      testemunhas: ["Ana Souza", "Bruno Lima"],
      bolas: bolas.map((_, i) => ({ hora: `20:0${i}:10` })),
    };
    r = await admin.req("POST", `/api/admin/sorteios-oficiais/${sessao}/resultado`, { numeros: bolas, ata });
    checa("antes da hora, o resultado não entra (409)", r.status === 409, `HTTP ${r.status}`);
    await db.execute(sql`update sorteios_oficiais set sorteio_em = now() - interval '1 minute' where id = ${sessao}::uuid`);
    r = await marina.req("POST", `/api/admin/sorteios-oficiais/${sessao}/resultado`, { numeros: bolas, ata });
    checa("a organização não lança o resultado do globo (403)", r.status === 403, `HTTP ${r.status}`);
    r = await admin.req("POST", `/api/admin/sorteios-oficiais/${sessao}/resultado`, { numeros: bolas });
    checa("sem a ata, o resultado do globo não entra (400)", r.status === 400 && String(r.json?.message).includes("local"), `HTTP ${r.status} ${r.json?.message ?? ""}`);
    r = await admin.req("POST", `/api/admin/sorteios-oficiais/${sessao}/resultado`, { numeros: bolas, ata: { ...ata, testemunhas: ["Ana Souza"] } });
    checa("ata sem auditor e com 1 testemunha: 400", r.status === 400 && String(r.json?.message).includes("auditor"), `HTTP ${r.status}`);
    r = await admin.req("POST", `/api/admin/sorteios-oficiais/${sessao}/resultado`, { numeros: bolas, ata });
    checa("resultado e ata lançados: a rifa do globo sorteia sozinha", r.status === 200 && r.json?.rifas?.sorteadas === 1, `HTTP ${r.status} ${JSON.stringify(r.json?.rifas)}`);
    checa("9.5: a rifa sem o 139 não sorteia por aproximação (o 138 e o 140 tinham dono)", r.json?.rifas?.esperando === 1, JSON.stringify(r.json?.rifas));
    r = await admin.req("POST", `/api/admin/sorteios-oficiais/${sessao}/resultado`, { numeros: bolas, ata });
    checa("segundo lançamento: 409", r.status === 409, `HTTP ${r.status}`);
    const [dG] = await db.select().from(draws).where(eq(draws.campaignId, rascunhoGlobo.c.id));
    checa("6-7-8-1-3-9 em 1.000 números: o 139 (interno 140) leva", dG?.resultNumber === 140 && dG?.winnerNumber === 140 && dG?.loteria === "globo", `${dG?.resultNumber}`);

    r = await anon.req("GET", `/api/public/campaigns/${rascunhoGlobo.c.slug}/sorteio`);
    checa("a conferência mostra 139, a leitura dos globos e a ata", r.json?.numero === "139" && r.json?.leitura?.[0] === "1º globo → bola 6" &&
      r.json?.ata?.tabelionato === ata.tabelionato && r.json?.ata?.bolas?.[5]?.hora === "20:05:10" && r.json?.seed === null && r.json?.seedHash === null);
    checa("…e o arquivo da ata ainda não chegou", r.json?.ataUrl === null);

    const pdf = `data:application/pdf;base64,${Buffer.from("%PDF-1.4\n% ata de teste\n%%EOF").toString("base64")}`;
    r = await marina.req("PUT", `/api/admin/sorteios-oficiais/${sessao}/ata`, { arquivo: pdf, nome: "ata.pdf" });
    checa("a organização não anexa a ata (403)", r.status === 403, `HTTP ${r.status}`);
    r = await admin.req("PUT", `/api/admin/sorteios-oficiais/${sessao}/ata`, { arquivo: `data:text/plain;base64,${Buffer.from("oi").toString("base64")}`, nome: "x.txt" });
    checa("arquivo que não é PDF nem imagem: 400", r.status === 400, `HTTP ${r.status}`);
    r = await admin.req("PUT", `/api/admin/sorteios-oficiais/${sessao}/ata`, { arquivo: pdf, nome: "ata.pdf" });
    checa("a plataforma anexa o PDF da ata", r.status === 200, `HTTP ${r.status} ${r.json?.message ?? ""}`);
    const baixada = await fetch(URL + `/api/public/sorteio-oficial/${sessao}/ata`);
    const corpo = Buffer.from(await baixada.arrayBuffer()).toString("latin1");
    checa("o público baixa a ata depois do resultado", baixada.status === 200 && (baixada.headers.get("content-type") ?? "").includes("pdf") && corpo.startsWith("%PDF"), `HTTP ${baixada.status}`);
    r = await anon.req("GET", `/api/public/campaigns/${rascunhoGlobo.c.slug}/sorteio`);
    checa("…e a conferência aponta para ela", r.json?.ataUrl === `/api/public/sorteio-oficial/${sessao}/ata`);

    // ---------------- 9.5: nova extração no mesmo ato ----------------
    console.log("\n  globo — nova extração (9.5):");
    const [espera] = await db.select().from(campaigns).where(eq(campaigns.id, ressorteio.c.id));
    checa("a rifa espera com \"Sorteio inválido – cota não vendida\" e o número", espera.status === "published" && String(espera.sorteioAutoMotivo).startsWith("Sorteio inválido – cota não vendida: o número 139"), String(espera.sorteioAutoMotivo));
    r = await admin.req("GET", "/api/admin/sorteios-oficiais");
    const naSessao = (r.json ?? []).find((x: { id: string }) => x.id === sessao)?.rifas?.find((x: { id: string }) => x.id === ressorteio.c.id);
    checa("o calendário da plataforma pede a nova extração", naSessao?.pedeNovaExtracao === true, JSON.stringify(naSessao));
    const extracao = (b: string[], h: string[]) => ({ bolas: b, horas: h });
    const horasDe = (min: number) => Array.from({ length: 6 }, (_, i) => `20:${String(min).padStart(2, "0")}:${String(i * 5).padStart(2, "0")}`);
    const urlExtracao = `/api/admin/sorteios-oficiais/${sessao}/rifas/${ressorteio.c.id}/extracoes`;
    r = await marina.req("POST", urlExtracao, extracao(["0", "0", "0", "2", "2", "2"], horasDe(10)));
    checa("a organização não registra extração (403)", r.status === 403, `HTTP ${r.status}`);
    r = await admin.req("POST", `/api/admin/sorteios-oficiais/${sessao}/rifas/${rascunhoGlobo.c.id}/extracoes`, extracao(["0", "0", "0", "2", "2", "2"], horasDe(10)));
    checa("rifa já sorteada não recebe extração (409)", r.status === 409, `HTTP ${r.status}`);
    r = await admin.req("POST", urlExtracao, extracao(["0", "0", "0", "2", "2", "2"], horasDe(4)));
    checa("hora antes da última bola da sessão (20:05:10): 400", r.status === 400 && String(r.json?.message).includes("20:05:10"), `HTTP ${r.status} ${r.json?.message ?? ""}`);
    r = await admin.req("POST", urlExtracao, extracao(["0", "0", "0", "2", "2", "X"], horasDe(10)));
    checa("bola que não é 0 a 9: 400", r.status === 400, `HTTP ${r.status}`);
    r = await admin.req("POST", urlExtracao, extracao(["0", "0", "0", "2", "2", "2"], horasDe(10)));
    checa("2ª extração: 222 também sem dono — registrada, ainda não sorteia", r.status === 201 && r.json?.ordem === 2 && r.json?.numero === "222" && r.json?.sorteada === false && String(r.json?.motivo).includes("222"), `HTTP ${r.status} ${JSON.stringify(r.json)}`);
    r = await admin.req("POST", urlExtracao, extracao(["0", "0", "0", "4", "9", "9"], horasDe(9)));
    checa("a 3ª vem depois da 2ª (mesmo ato, em sequência): 400", r.status === 400, `HTTP ${r.status}`);
    r = await admin.req("POST", urlExtracao, extracao(["0", "0", "0", "4", "9", "9"], horasDe(12)));
    checa("3ª extração: 499 (interno 500) tem dono — a rifa sorteia com ele", r.status === 201 && r.json?.ordem === 3 && r.json?.sorteada === true, `HTTP ${r.status} ${JSON.stringify(r.json)}`);
    r = await admin.req("POST", urlExtracao, extracao(["0", "0", "0", "1", "1", "1"], horasDe(14)));
    checa("depois de sorteada, nova extração: 409", r.status === 409, `HTTP ${r.status}`);
    const [dR] = await db.select().from(draws).where(eq(draws.campaignId, ressorteio.c.id));
    checa("sorteio gravado com o número da extração que valeu, sem aproximação", dR?.resultNumber === 500 && dR?.winnerNumber === 500 && dR?.federalPrizes?.join("") === "000499", `${dR?.resultNumber}/${dR?.winnerNumber}`);
    r = await anon.req("GET", `/api/public/campaigns/${ressorteio.c.slug}/sorteio`);
    const ex = r.json?.extracoes ?? [];
    checa("a conferência lista as 3 extrações: 139 e 222 inválidas, 499 valeu",
      ex.length === 3 && ex[0].numero === "139" && !ex[0].valeu && ex[1].numero === "222" && !ex[1].valeu && ex[2].numero === "499" && ex[2].valeu && ex[2].horas[0] === "20:12:00",
      JSON.stringify(ex.map((e: { numero: string; valeu: boolean }) => `${e.numero}:${e.valeu}`)));
    checa("…com a leitura da extração que valeu", r.json?.numero === "499" && r.json?.aproximacao === false && String(r.json?.leitura?.at(-1)).includes("499"));
    const regR = JSON.stringify((await anon.req("GET", `/api/public/campaigns/${ressorteio.c.slug}/regulamento`)).json?.secoes ?? []);
    checa("o regulamento do globo traz o texto exato do 9.5, sem aproximação", regR.includes("proceder-se-á, no mesmo ato e imediatamente") && !regR.includes("alternadamente"));
    const prest2 = await (await fetch(URL + `/api/admin/exportacoes/sorteio?campanha=${ressorteio.c.id}`, { headers: { Cookie: admin.cookie } })).text();
    checa("a prestação de contas relata as extrações inválidas e a que valeu",
      prest2.includes("1a extração") && prest2.includes("2a extração") && prest2.includes("Sorteio inválido – cota não vendida") && prest2.includes("→ 499 — contemplado"));
    const [auditada] = await db.execute(sql`select count(*)::int as n from audit_log where action = 'sorteio_oficial.reextracao' and entity_id = ${ressorteio.c.id}`).then((x) => x.rows as { n: number }[]);
    checa("cada extração registrada vai à auditoria", Number(auditada.n) === 2, String(auditada.n));

    const prestacao = await fetch(URL + `/api/admin/exportacoes/sorteio?campanha=${rascunhoGlobo.c.id}`, { headers: { Cookie: admin.cookie } });
    const csvG = await prestacao.text();
    checa("a prestação de contas traz a sessão, as bolas e a ata",
      prestacao.status === 200 && csvG.includes("Sessão do globo") && csvG.includes(ata.tabelionato) && csvG.includes("Ana Souza; Bruno Lima") && csvG.includes("6 (seis) globos"),
      `HTTP ${prestacao.status}`);

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
