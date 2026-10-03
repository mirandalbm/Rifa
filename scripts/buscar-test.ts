/**
 * Prova do Buscar, pela API de verdade: o interruptor e a tabela da
 * plataforma, a grade das mais novas por chave (sem repetir), a busca sem
 * acento e sem diferença de maiúscula, o que NÃO aparece (rascunho, travada,
 * demonstração, organização arquivada ou banida), o apostador só pelo
 * @apelido exato e com o tipo ligado, o texto como dado (curinga e SQL) e o
 * limite por aparelho. Devolve o estado de antes no fim.
 *
 *   npm run buscar      (com `npm run dev` no ar e o seed aplicado)
 */
import "dotenv/config";
import { baseUrl } from "./base-url";
import { eq, inArray, like, sql } from "drizzle-orm";
import { db, pool } from "../server/db";
import { buyers, campaignStats, campaigns, organizations, users } from "../shared/schema";
import { BUSCA_PAGINA } from "../shared/buscar";
import { sqlDaGrade } from "../server/services/buscar";

const URL = baseUrl();
let falhas = 0;
const checa = (n: string, ok: boolean, d = "") => {
  console.log(`  ${ok ? "✓" : "✗"} ${n}${d ? ` (${d})` : ""}`);
  if (!ok) falhas++;
};

class Cliente {
  cookie = "";
  constructor(private aparelho = "") {}
  async req(metodo: string, caminho: string, corpo?: unknown) {
    const r = await fetch(URL + caminho, {
      method: metodo,
      headers: { "Content-Type": "application/json", ...(this.cookie ? { Cookie: this.cookie } : {}), ...(this.aparelho ? { "x-device-id": this.aparelho } : {}) },
      body: corpo === undefined ? undefined : JSON.stringify(corpo),
    });
    const sc = r.headers.get("set-cookie");
    if (sc) this.cookie = sc.split(";")[0];
    const tipo = r.headers.get("content-type") ?? "";
    return { status: r.status, json: tipo.includes("json") ? await r.json() : null };
  }
}

function cpf(base: string) {
  const d = base.split("").map(Number);
  for (const n of [9, 10]) {
    const soma = d.slice(0, n).reduce((s, x, i) => s + x * (n + 1 - i), 0);
    const r = (soma * 10) % 11;
    d.push(r === 10 ? 0 : r);
  }
  return d.join("");
}

const P = "buscar-teste";
const TEL = "11976660001";

async function limpar() {
  await db.execute(sql`delete from rate_events where bucket like 'busca:%' or bucket like 'cadastro:%' or bucket like 'login:%'`);
  await db.execute(sql`delete from campaigns where slug like ${P + "-%"}`);
  await db.execute(sql`delete from organizations where slug like ${P + "-%"}`);
  await db.delete(buyers).where(eq(buyers.phone, TEL));
}

async function main() {
  console.log("\n=== buscar ===\n");
  await limpar();
  const anon = new Cliente("aparelho-buscar-1");
  const admin = new Cliente();
  const marina = new Cliente();
  await admin.req("POST", "/api/auth/login", { email: "admin@rifa.br", password: "admin123" });
  await marina.req("POST", "/api/auth/login", { email: "marina@rifassaojose.br", password: "organizador123" });
  const antes = (await anon.req("GET", "/api/public/app")).json;
  const ajustar = (ligado: boolean, tipos?: Record<string, boolean>) =>
    admin.req("PUT", "/api/admin/app", { avisoDoTrevo: { estilo: "ponto", cor: "verde" }, publicarApostador: false, reelsLigado: false, mensagensLigado: false, buscarLigado: ligado, ...(tipos ? { buscarTipos: tipos } : {}) });

  const [eu] = await db.select({ org: users.organizationId }).from(users).where(eq(users.email, "marina@rifassaojose.br"));
  const [vizinha, arquivada, banida] = await Promise.all(
    [
      { slug: `${P}-vizinha`, name: "Vizinha Buscável", cidade: "Salvador", uf: "BA" },
      { slug: `${P}-arquivada`, name: "Arquivada Buscável", cidade: "Recife", uf: "PE", archivedAt: new Date() },
      { slug: `${P}-banida`, name: "Banida Buscável", cidade: "Natal", uf: "RN", banidaEm: new Date() },
    ].map(async (o) => (await db.insert(organizations).values(o).returning())[0]),
  );
  const base = (org: string, slug: string, titulo: string, extra: object = {}, minutos = 0) => ({
    organizationId: org,
    slug: `${P}-${slug}`,
    title: titulo,
    prizeTitle: titulo,
    totalQuotas: 100,
    priceCents: 500,
    drawAt: new Date(Date.now() + 7 * 86_400_000),
    authorizationCode: "SPA-BUSCAR",
    status: "published" as const,
    publishedAt: new Date(Date.now() - minutos * 60_000),
    ...extra,
  });
  const inserir = async (v: ReturnType<typeof base>) => {
    const [c] = await db.insert(campaigns).values(v).returning();
    await db.insert(campaignStats).values({ campaignId: c.id });
    return c;
  };
  await inserir(base(eu.org!, "moto", "Buscatestemoto Zero Km", {}, 1));
  await inserir(base(eu.org!, "acento", "Promoção Ação Buscatestepremio", {}, 2));
  await inserir(base(eu.org!, "rascunho", "Buscatesterascunho", { status: "draft", publishedAt: null }, 3));
  await inserir(base(eu.org!, "travada", "Buscatestetravada", { travadaEm: new Date() }, 4));
  await inserir(base(eu.org!, "demo", "Buscatestedemo", { demonstracao: true }, 5));
  await inserir(base(vizinha.id, "da-vizinha", "Buscatestevizinha Bicicleta", {}, 6));
  await inserir(base(arquivada.id, "da-arquivada", "Buscatestearquivada", {}, 7));
  await inserir(base(banida.id, "da-banida", "Buscatestebanida", {}, 8));
  for (let i = 0; i < 20; i++) await inserir(base(eu.org!, `lote-${String(i).padStart(2, "0")}`, `Lote Buscapagina ${i}`, {}, 100 + i));

  const corpo = { nome: "Ana Buscar Lima", telefone: TEL, cpf: cpf("573104501"), cep: "01310-100", senha: "senha-buscar-1", lembrar: true, apelido: "ana.buscar" };

  try {
    console.log("  o interruptor:");
    await ajustar(false);
    let r = await anon.req("GET", "/api/public/buscar");
    checa("desligado, a resposta é só { ligado: false }", r.status === 200 && r.json?.ligado === false && !("rifas" in r.json));
    r = await marina.req("PUT", "/api/admin/app", { buscarLigado: true });
    checa("organizador não liga o Buscar (403)", r.status === 403, `HTTP ${r.status}`);
    r = await ajustar(true, { rifas: true, organizacoes: true, apostadores: false, hackeado: true });
    checa("só as chaves conhecidas entram na tabela", r.status === 200 && JSON.stringify(Object.keys(r.json.buscarTipos).sort()) === '["apostadores","organizacoes","rifas"]', JSON.stringify(r.json));

    console.log("\n  a grade (sem texto):");
    r = await anon.req("GET", "/api/public/buscar");
    const slugs = (r.json?.rifas ?? []).map((x: { slug: string }) => x.slug);
    checa("a grade traz as publicações, 18 por vez", r.status === 200 && r.json.ligado === true && r.json.rifas.length === BUSCA_PAGINA && Boolean(r.json.proximo), `${r.json?.rifas?.length}`);
    checa("a mais nova primeiro (a moto, publicada há 1 min, vem antes das de teste de lote)", slugs.indexOf(`${P}-moto`) !== -1 && slugs.indexOf(`${P}-moto`) < slugs.indexOf(`${P}-lote-19`) || slugs.indexOf(`${P}-lote-19`) === -1);
    const todas: string[] = [...slugs];
    let proximo: string | null = r.json?.proximo;
    let paginas = 1;
    while (proximo && paginas < 10) {
      const p = await anon.req("GET", `/api/public/buscar?depois=${encodeURIComponent(proximo)}`);
      todas.push(...p.json.rifas.map((x: { slug: string }) => x.slug));
      proximo = p.json.proximo;
      paginas++;
    }
    checa("andar por todas as páginas não repete nenhuma rifa", new Set(todas).size === todas.length, `${todas.length} itens em ${paginas} páginas`);
    checa("as 20 do lote entram todas", Array.from({ length: 20 }, (_, i) => `${P}-lote-${String(i).padStart(2, "0")}`).every((s) => todas.includes(s)));
    for (const [s, porque] of [["rascunho", "rascunho"], ["travada", "rifa travada"], ["demo", "demonstração"], ["da-arquivada", "organização arquivada"], ["da-banida", "organização banida"]] as const) {
      checa(`${porque} não aparece`, !todas.includes(`${P}-${s}`));
    }
    r = await anon.req("GET", "/api/public/buscar?depois=lixo' or 1=1 --");
    checa("cursor fora do formato vira primeira página, nunca erro", r.status === 200 && r.json.rifas.length === BUSCA_PAGINA);

    console.log("\n  ordem por curtidas e filtro por estado:");
    // Contadores reais da publicação: dois empatados no topo e um logo abaixo.
    await db.update(campaigns).set({ curtidasCount: 900_001 }).where(inArray(campaigns.slug, [`${P}-moto`, `${P}-lote-05`]));
    await db.update(campaigns).set({ curtidasCount: 900_000 }).where(eq(campaigns.slug, `${P}-acento`));
    r = await anon.req("GET", "/api/public/buscar?ordem=curtidas");
    const porCurtidas = (r.json?.rifas ?? []).map((x: { slug: string }) => x.slug);
    checa("\"Mais curtidas\" põe as mais curtidas na frente, o empate pelo id", [`${P}-moto`, `${P}-lote-05`].every((s) => porCurtidas.slice(0, 2).includes(s)) && porCurtidas[2] === `${P}-acento`, porCurtidas.slice(0, 4).join(", "));
    checa("a resposta nunca traz o número de curtidas", !/curtida/i.test(JSON.stringify(r.json?.rifas ?? [])));
    const todasCurtidas: string[] = [...porCurtidas];
    let proxCurtidas: string | null = r.json?.proximo;
    let pagCurtidas = 1;
    while (proxCurtidas && pagCurtidas < 10) {
      const p = await anon.req("GET", `/api/public/buscar?ordem=curtidas&depois=${encodeURIComponent(proxCurtidas)}`);
      todasCurtidas.push(...p.json.rifas.map((x: { slug: string }) => x.slug));
      proxCurtidas = p.json.proximo;
      pagCurtidas++;
    }
    checa("andar por todas as páginas por curtidas não repete nem pula rifa", new Set(todasCurtidas).size === todasCurtidas.length && todas.every((s) => todasCurtidas.includes(s)), `${todasCurtidas.length} itens em ${pagCurtidas} páginas`);
    r = await anon.req("GET", "/api/public/buscar?ordem=curtidas&depois=lixo' or 1=1 --");
    checa("cursor de curtidas fora do formato vira primeira página, nunca erro", r.status === 200 && r.json.rifas.length === BUSCA_PAGINA);
    r = await anon.req("GET", `/api/public/buscar?ordem=curtidas&depois=${encodeURIComponent("2026-10-01T00:00:00.000Z|00000000-0000-0000-0000-000000000000")}`);
    checa("cursor da outra ordem também vira primeira página", r.status === 200 && r.json.rifas.length === BUSCA_PAGINA);
    r = await anon.req("GET", "/api/public/buscar?ordem=popularidade-inventada");
    checa("ordem desconhecida é a de sempre (as mais novas)", r.status === 200 && r.json.ordem === "novas");
    r = await anon.req("GET", "/api/public/buscar?estado=BA");
    checa("o estado filtra pela organização da rifa", r.status === 200 && r.json.rifas.some((x: { slug: string }) => x.slug === `${P}-da-vizinha`) && !r.json.rifas.some((x: { slug: string }) => x.slug === `${P}-moto`), JSON.stringify(r.json?.rifas?.map((x: { slug: string }) => x.slug)));
    r = await anon.req("GET", "/api/public/buscar?estado=ba");
    checa("a sigla vale em minúscula", r.json?.rifas?.some((x: { slug: string }) => x.slug === `${P}-da-vizinha`));
    r = await anon.req("GET", "/api/public/buscar?estado=XX%27%20or%201=1");
    checa("estado fora da lista não filtra (e não é SQL)", r.status === 200 && r.json.estado === null && r.json.rifas.length === BUSCA_PAGINA);
    r = await anon.req("GET", "/api/public/buscar?estado=PE");
    checa("organização arquivada segue fora mesmo com o estado dela", !r.json?.rifas?.some((x: { slug: string }) => x.slug === `${P}-da-arquivada`));
    r = await anon.req("GET", "/api/public/buscar?estado=BA&ordem=curtidas&q=buscatestevizinha");
    checa("estado, ordem e texto juntos", r.json?.rifas?.length === 1 && r.json.rifas[0].slug === `${P}-da-vizinha`);

    console.log("\n  a busca por texto:");
    r = await anon.req("GET", "/api/public/buscar?q=buscatestemoto");
    checa("acha pelo título", r.json?.rifas?.some((x: { slug: string }) => x.slug === `${P}-moto`) && r.json.rifas.length === 1, JSON.stringify(r.json?.rifas?.map((x: { slug: string }) => x.slug)));
    r = await anon.req("GET", "/api/public/buscar?q=BUSCATESTEMOTO");
    checa("maiúscula não importa", r.json?.rifas?.length === 1);
    r = await anon.req("GET", `/api/public/buscar?q=${encodeURIComponent("promocao acao")}`);
    checa("sem acento acha título com acento", r.json?.rifas?.some((x: { slug: string }) => x.slug === `${P}-acento`));
    r = await anon.req("GET", `/api/public/buscar?q=${encodeURIComponent("PROMOÇÃO")}`);
    checa("com acento acha também", r.json?.rifas?.some((x: { slug: string }) => x.slug === `${P}-acento`));
    r = await anon.req("GET", "/api/public/buscar?q=vizinha%20buscavel");
    checa("a rifa se acha pelo nome da organização, a organização vem à parte", r.json?.rifas?.some((x: { slug: string }) => x.slug === `${P}-da-vizinha`) && r.json.organizacoes.some((o: { nome: string }) => o.nome === "Vizinha Buscável"));
    r = await anon.req("GET", "/api/public/buscar?q=buscavel");
    checa("organização arquivada e banida não aparecem na busca", !r.json?.organizacoes?.some((o: { nome: string }) => /Arquivada|Banida/.test(o.nome)) && !r.json?.rifas?.some((x: { slug: string }) => /arquivada|banida/.test(x.slug)));
    r = await anon.req("GET", "/api/public/buscar?q=a");
    checa("texto curto demais não busca", r.json?.curto === true && r.json.rifas.length === 0);
    r = await anon.req("GET", `/api/public/buscar?q=${encodeURIComponent("%%")}`);
    checa("% é letra, não curinga: não devolve tudo", r.status === 200 && r.json.rifas.length === 0, `${r.json?.rifas?.length}`);
    r = await anon.req("GET", `/api/public/buscar?q=${encodeURIComponent("x' or 1=1 --")}`);
    checa("aspas e SQL são só texto", r.status === 200 && r.json.rifas.length === 0);
    r = await anon.req("GET", "/api/public/buscar?q=buscatestemoto");
    checa("a resposta nunca traz telefone, CPF ou e-mail", !/\d{8,}|@.*\.(com|br)/.test(JSON.stringify(r.json)), "");
    checa("cada rifa vem com o caminho, sem preço de tabela nem id", r.json?.rifas?.[0]?.caminho?.includes(`/r/${P}-moto`) && !("id" in r.json.rifas[0]));

    console.log("\n  o índice de texto (pg_trgm):");
    {
      // 5 mil rifas sintéticas numa transação que volta: com a tabela cheia, o
      // Postgres escolhe o plano de verdade, e a prova vê se o índice serve à
      // consulta que a tela roda (a expressão sem acento tem de ser a mesma).
      const { sql: textoSql, params } = await sqlDaGrade("zqxwuniquetrgm");
      const cliente = await pool.connect();
      let plano = "";
      try {
        await cliente.query("BEGIN");
        await cliente.query(
          `INSERT INTO campaigns
             SELECT (jsonb_populate_record(null::campaigns, to_jsonb(c) || jsonb_build_object(
               'id', gen_random_uuid(), 'slug', 'trgm-prova-' || g, 'title', 'Rifa de número ' || g, 'prize_title', 'Prêmio ' || g))).*
               FROM campaigns c, generate_series(1, 5000) g
              WHERE c.slug = $1`,
          [`${P}-moto`],
        );
        // Linha nova num índice GIN fica numa lista pendente até o VACUUM (em
        // produção, o autovacuum); limpa aqui, senão o custo estimado engana.
        await cliente.query("SELECT gin_clean_pending_list('idx_campaigns_titulo_trgm'), gin_clean_pending_list('idx_campaigns_premio_trgm')");
        await cliente.query("ANALYZE campaigns");
        plano = (await cliente.query(`EXPLAIN ${textoSql}`, params as unknown[])).rows.map((l: Record<string, string>) => l["QUERY PLAN"]).join("\n");
      } finally {
        await cliente.query("ROLLBACK").catch(() => {});
        cliente.release();
      }
      checa("com a tabela cheia, a busca usa o índice do título e do prêmio", plano.includes("idx_campaigns_titulo_trgm") && plano.includes("idx_campaigns_premio_trgm"), plano.split("\n").slice(0, 8).join(" | "));
      checa("…e não lê a tabela de rifas inteira", !/Seq Scan on campaigns/.test(plano));
      const [{ n }] = (await db.execute(sql`select count(*)::int as n from campaigns where slug like 'trgm-prova-%'`)).rows as { n: number }[];
      checa("as rifas da prova não ficam no banco", n === 0);
    }

    console.log("\n  o apostador (só com o tipo ligado, pelo @apelido exato):");
    const ana = new Cliente();
    const c = await ana.req("POST", "/api/public/conta", corpo);
    if (c.status >= 300) throw new Error(`cadastro: HTTP ${c.status} ${c.json?.message}`);
    r = await anon.req("GET", "/api/public/buscar?q=@ana.buscar");
    checa("com o tipo desligado, o apostador não aparece", r.json?.apostadores?.length === 0);
    await ajustar(true, { rifas: true, organizacoes: true, apostadores: true });
    r = await anon.req("GET", "/api/public/buscar?q=@ana.buscar");
    checa("ligado, o @apelido exato acha o perfil", r.json?.apostadores?.length === 1 && r.json.apostadores[0].caminho === "/u/ana.buscar");
    checa("e só traz apelido e foto (nunca nome real nem telefone)", !JSON.stringify(r.json).includes("Ana Buscar") && !JSON.stringify(r.json).includes(TEL));
    r = await anon.req("GET", "/api/public/buscar?q=@ana.busc");
    checa("pedaço do apelido não acha (nunca lista aproximada)", r.json?.apostadores?.length === 0);
    r = await anon.req("GET", "/api/public/buscar?q=ana.buscar");
    checa("o apelido exato acha com ou sem @", r.json?.apostadores?.length === 1);
    await ajustar(true, { rifas: false, organizacoes: false, apostadores: false });
    r = await anon.req("GET", "/api/public/buscar");
    checa("sem nenhum tipo ligado, a resposta vem vazia", r.status === 200 && r.json.rifas.length === 0 && r.json.organizacoes.length === 0);
    await ajustar(true, { rifas: true, organizacoes: false, apostadores: false });
    r = await anon.req("GET", "/api/public/buscar?q=vizinha%20buscavel");
    checa("a tabela manda: organização desligada não aparece", r.json?.organizacoes?.length === 0 && r.json.rifas.length >= 1);

    console.log("\n  o limite por aparelho:");
    await db.execute(sql`delete from rate_events where bucket like 'busca:%'`);
    const rapido = new Cliente("aparelho-buscar-limite");
    let barrou = false;
    for (let i = 0; i < 70 && !barrou; i++) barrou = (await rapido.req("GET", "/api/public/buscar?q=buscatestemoto")).status === 429;
    checa("passou do limite, 429 em português", barrou);
  } finally {
    await ajustar(antes?.buscarLigado === true, antes?.buscarTipos);
    await limpar();
  }

  console.log(falhas ? `\n${falhas} falha(s).\n` : "\nTudo certo.\n");
  await pool.end();
  process.exit(falhas ? 1 : 0);
}

main().catch(async (e) => {
  console.error(e);
  await limpar().catch(() => {});
  await pool.end().catch(() => {});
  process.exit(1);
});
