/**
 * Prova das rotas públicas que nenhuma outra prova citava (fase 0 da
 * reformulação), pela API de verdade:
 *
 * - rascunho não existe para o público: premiados, últimas compras, ranking,
 *   número, certificado são 404 — e a rifa no ar responde;
 * - nada pessoal sai: nome reduzido, telefone escondido, e o número da cota
 *   premiada em jogo nunca aparece;
 * - o bilhete público esconde telefone e CPF; marcar como impresso exige
 *   sessão **e** ser da venda (o cambista dele, a organização dona ou a
 *   plataforma) — o de fora é 404, nunca grava;
 * - imagens (perfil, capa, banner, apostador): id ou apelido que não existe é
 *   404, organização arquivada some, id fora do formato nunca é 500;
 * - o clique de afiliado só conta código ativo e tem limite por aparelho;
 * - o CEP malformado é 400 antes de qualquer consulta de fora;
 * - promotora arquivada ou banida não aparece na vitrine nem nos estados, e o
 *   perfil, o termo, o pixel, o link e o endereço curto dela não levam a lugar
 *   nenhum (auditoria do acesso público);
 * - a porta aguenta o que ninguém digita: byte nulo, texto enorme e id fora do
 *   formato respondem 400/404 — nunca 500 e nunca o servidor fora do ar (o
 *   login anônimo derrubava o processo);
 * - pedido, carrinho e bilhete nunca ficam em cache, e a leitura pública não
 *   fica em cache compartilhado.
 *
 *   npm run publico      (com `npm run dev` no ar e o seed aplicado)
 */
import "dotenv/config";
import { baseUrl } from "./base-url";
import { randomBytes } from "node:crypto";
import { eq, inArray, sql } from "drizzle-orm";
import { db, pool } from "../server/db";
import { hashPassword } from "../server/auth";
import {
  affiliates,
  campaignCertificados,
  campaignStats,
  campaigns,
  clickEvents,
  linksCurtos,
  orders,
  organizacaoFotos,
  organizations,
  prizedQuotas,
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
    return { status: r.status, json: tipo.includes("json") ? await r.json() : null, texto: tipo.includes("text") ? await r.text() : "" };
  }
  async entrar(email: string, password: string) {
    const r = await this.req("POST", "/api/auth/login", { email, password });
    if (r.status !== 200) throw new Error(`login ${email}: HTTP ${r.status} ${r.json?.message ?? ""}`);
    return this;
  }
}

const SENHA = "senha-publico-1";
const SLUGS = ["publico-a", "publico-b", "publico-arquivada", "publico-banida"];
const EMAILS = ["publico-org-a@teste.rifa", "publico-org-b@teste.rifa", "publico-cambista@teste.rifa", "publico-cambista-b@teste.rifa"];
const CODIGOS = ["PUBAFIL", "PUBCAMBA", "PUBCAMBB"];
const NOME_COMPRADOR = "Marina Souza Ferreira";
const TELEFONE = "11977776655";
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64");

async function limpar() {
  const orgs = await db.select({ id: organizations.id }).from(organizations).where(inArray(organizations.slug, SLUGS));
  const ids = orgs.map((o) => o.id);
  if (ids.length) {
    const lista = sql.join(ids.map((i) => sql`${i}::uuid`), sql`, `);
    await db.execute(sql`delete from quota_alloc where campaign_id in (select id from campaigns where organization_id in (${lista}))`);
    await db.execute(sql`delete from commissions where order_id in (select id from orders where campaign_id in (select id from campaigns where organization_id in (${lista})))`);
    await db.execute(sql`delete from platform_charges where order_id in (select id from orders where campaign_id in (select id from campaigns where organization_id in (${lista})))`);
    await db.execute(sql`delete from orders where campaign_id in (select id from campaigns where organization_id in (${lista}))`);
    await db.execute(sql`delete from campaigns where organization_id in (${lista})`);
  }
  await db.execute(sql`delete from click_events where affiliate_id in (select id from affiliates where code = any(${`{${CODIGOS.join(",")}}`}::text[]))`);
  await db.execute(sql`delete from affiliates where code = any(${`{${CODIGOS.join(",")}}`}::text[])`);
  await db.delete(users).where(inArray(users.email, EMAILS));
  if (ids.length) await db.delete(organizations).where(inArray(organizations.id, ids));
  await db.execute(sql`delete from buyers where phone = ${TELEFONE}`);
  await db.execute(sql`delete from rate_events where bucket like 'login:%' or bucket like 'order:%' or bucket like 'track-click:%' or bucket like 'lookup%'`);
}

async function rifa(orgId: string, slug: string, status: "draft" | "published") {
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
      status,
      publishedAt: status === "published" ? new Date() : null,
      drawAt: new Date(Date.now() + 20 * 86_400_000),
      authorizationCode: "SPA-PUBLICO",
      authorizationFileKey: "certificado-teste",
    })
    .returning();
  await db.insert(campaignStats).values({ campaignId: camp.id });
  return camp;
}

async function main() {
  console.log("\n=== rotas públicas ===\n");
  await limpar();

  const [orgA] = await db.insert(organizations).values({ slug: SLUGS[0], name: "Promotora Pública A" }).returning();
  const [orgB] = await db.insert(organizations).values({ slug: SLUGS[1], name: "Promotora Pública B" }).returning();
  const [arq] = await db.insert(organizations).values({ slug: SLUGS[2], name: "Promotora Arquivada", archivedAt: new Date(), uf: "AC" }).returning();
  // Banida: o perfil some e a porta fecha. Os links, o pixel e o endereço curto dela não podem seguir de pé.
  const [ban] = await db
    .insert(organizations)
    .values({
      slug: SLUGS[3],
      name: "Promotora Banida",
      banidaEm: new Date(),
      active: false,
      uf: "AC",
      links: [{ rotulo: "Canal", url: "https://exemplo.com/canal-da-banida" }],
      pixels: { meta: "1234567890123456" },
    })
    .returning();
  await db.update(organizations).set({ links: [{ rotulo: "Site", url: "https://exemplo.com/site-da-a" }] }).where(eq(organizations.id, orgA.id));
  await db.insert(linksCurtos).values([
    { codigo: "PUBPRF", tipo: "perfil", organizationId: orgA.id },
    { codigo: "BANPRF", tipo: "perfil", organizationId: ban.id },
  ]);
  await db.insert(users).values([
    { role: "organizer", organizationId: orgA.id, name: "Org A", email: EMAILS[0], passwordHash: await hashPassword(SENHA) },
    { role: "organizer", organizationId: orgB.id, name: "Org B", email: EMAILS[1], passwordHash: await hashPassword(SENHA) },
  ]);
  await db.insert(organizacaoFotos).values([
    { organizationId: orgA.id, mime: "image/png", bytes: PNG },
    { organizationId: arq.id, mime: "image/png", bytes: PNG },
  ]);
  const viva = await rifa(orgA.id, "publico-viva", "published");
  const rascunho = await rifa(orgA.id, "publico-rascunho", "draft");
  // Estado que não devia existir (arquivar e banir travam as rifas), mas que a vitrine não pode servir se existir.
  const arqRifa = await rifa(arq.id, "publico-arq-rifa", "published");
  const banRifa = await rifa(ban.id, "publico-banida-rifa", "published");
  await db.insert(campaignCertificados).values({ campaignId: viva.id, mime: "application/pdf", nome: "certificado.pdf", bytes: Buffer.from("%PDF-1.4 teste"), tamanho: 14 });
  await db.insert(campaignCertificados).values({ campaignId: rascunho.id, mime: "application/pdf", nome: "certificado.pdf", bytes: Buffer.from("%PDF-1.4 teste"), tamanho: 14 });
  await db.insert(prizedQuotas).values([
    { campaignId: viva.id, number: 4321, prizeLabel: "Vale R$ 100" },
    { campaignId: viva.id, number: 777, prizeLabel: "Vale R$ 100" },
  ]);

  // Cambistas (A e B) e um afiliado para o clique.
  const mk = async (email: string, nome: string, codigo: string, org: string | null, kind: "cambista" | "online") => {
    const [u] = await db
      .insert(users)
      .values({ role: kind === "cambista" ? "cambista" : "affiliate", organizationId: org, name: nome, email, passwordHash: await hashPassword(SENHA) })
      .returning();
    const [a] = await db.insert(affiliates).values({ userId: u.id, code: codigo, kind, status: "active", approvedAt: new Date() }).returning();
    return a;
  };
  const cambA = await mk(EMAILS[2], "Cambista Público", CODIGOS[1], orgA.id, "cambista");
  await mk(EMAILS[3], "Cambista da B", CODIGOS[2], orgB.id, "cambista");
  const afil = await db.insert(users).values({ role: "affiliate", name: "Afiliado Público", email: "publico-afiliado@teste.rifa", passwordHash: await hashPassword(SENHA) }).returning();
  const [afiliado] = await db.insert(affiliates).values({ userId: afil[0].id, code: CODIGOS[0], status: "active", approvedAt: new Date() }).returning();
  EMAILS.push("publico-afiliado@teste.rifa");

  const publico = new Cliente();
  const dA = await new Cliente().entrar(EMAILS[0], SENHA);
  const dB = await new Cliente().entrar(EMAILS[1], SENHA);
  const c1 = await new Cliente().entrar(EMAILS[2], SENHA);
  const cB = await new Cliente().entrar(EMAILS[3], SENHA);

  try {
    // Uma venda paga do cambista A.
    let r = await c1.req("POST", "/api/seller/sales", { campaignId: viva.id, quantity: 2, buyer: { name: NOME_COMPRADOR, phone: TELEFONE } });
    const codigo = r.json.code as number;
    await c1.req("POST", `/api/seller/sales/${codigo}/confirm`, { method: "dinheiro" });
    const numerosVendidos: number[] = r.json.numbers;

    /* --------------------------- rascunho: 404 ---------------------------- */
    console.log("  rascunho não existe para o público:");
    for (const caminho of ["premios", "ultimas-compras", "ranking", "numbers/5", "certificado"]) {
      r = await publico.req("GET", `/api/public/campaigns/${rascunho.slug}/${caminho}`);
      checa(`${caminho}: 404`, r.status === 404, `HTTP ${r.status}`);
      r = await publico.req("GET", `/api/public/campaigns/nao-existe-publico/${caminho}`);
      checa(`${caminho}: a inexistente responde igual`, r.status === 404, `HTTP ${r.status}`);
    }

    /* ------------------------ rifa no ar: o que sai ----------------------- */
    console.log("\n  rifa no ar:");
    r = await publico.req("GET", `/api/public/campaigns/${viva.slug}/premios`);
    checa("premiados: total, restantes e o nome do prêmio", r.status === 200 && r.json?.total === 2 && r.json?.restantes === 2 && r.json?.premios?.[0]?.label === "Vale R$ 100", JSON.stringify(r.json));
    const bruto = JSON.stringify(r.json);
    checa("…e o número em jogo nunca sai", !bruto.includes("4321") && !bruto.includes("777"));

    r = await publico.req("GET", `/api/public/campaigns/${viva.slug}/ultimas-compras`);
    const txt = JSON.stringify(r.json);
    checa("últimas compras: nome reduzido", r.status === 200 && r.json?.[0]?.nome === "Marina F." && r.json[0].quantidade === 2, txt);
    checa("…telefone escondido, sem o número inteiro", !txt.includes(TELEFONE) && r.json?.[0]?.telefone?.includes("••"), txt);
    checa("…e o sobrenome inteiro não sai", !txt.includes("Ferreira") && !txt.includes("Souza"));

    r = await publico.req("GET", `/api/public/campaigns/${viva.slug}/ranking`);
    const rk = JSON.stringify(r.json);
    checa("ranking: nome reduzido, telefone escondido", r.status === 200 && r.json?.[0]?.nome === "Marina F." && r.json[0].quotas === 2 && !rk.includes(TELEFONE) && !rk.includes("Ferreira"), rk);

    const [vendido] = numerosVendidos;
    r = await publico.req("GET", `/api/public/campaigns/${viva.slug}/numbers/${vendido}`);
    checa("número vendido: taken", r.status === 200 && r.json?.taken === true, JSON.stringify(r.json));
    const livre = [1, 2, 3, 4, 5, 6].find((n) => !numerosVendidos.includes(n))!;
    r = await publico.req("GET", `/api/public/campaigns/${viva.slug}/numbers/${livre}`);
    checa("número livre: não", r.status === 200 && r.json?.taken === false, JSON.stringify(r.json));
    for (const ruim of ["0", "10001", "abc", "1.5", "-3"]) {
      r = await publico.req("GET", `/api/public/campaigns/${viva.slug}/numbers/${ruim}`);
      checa(`número ${ruim}: 400`, r.status === 400, `HTTP ${r.status}`);
    }

    r = await publico.req("GET", `/api/public/campaigns/${viva.slug}/certificado`);
    checa("certificado da rifa no ar", r.status === 200, `HTTP ${r.status}`);
    r = await publico.req("GET", `/api/public/campaigns/${viva.slug}/foto-ganhador`);
    checa("foto do ganhador: só rifa sorteada (404)", r.status === 404, `HTTP ${r.status}`);

    /* ------------------------------- bilhete ------------------------------ */
    console.log("\n  bilhete:");
    r = await publico.req("GET", `/api/public/tickets/${codigo}`);
    const bil = JSON.stringify(r.json);
    checa("bilhete público pelo código", r.status === 200 && r.json?.codigo === codigo, `HTTP ${r.status}`);
    checa("…telefone escondido", !bil.includes(TELEFONE) && r.json?.apostador?.telefone?.includes("••"), bil.slice(0, 160));
    r = await publico.req("GET", `/api/public/tickets/${codigo}/escpos`);
    checa("texto da impressora térmica", r.status === 200 && r.texto.length > 20 && !r.texto.includes(TELEFONE), `HTTP ${r.status}`);
    r = await publico.req("GET", "/api/public/tickets/12345678");
    checa("bilhete que não existe: 404", r.status === 404, `HTTP ${r.status}`);
    r = await publico.req("GET", "/api/public/tickets/9999999999");
    checa("código maior que o inteiro do banco: 404, nunca 500", r.status === 404, `HTTP ${r.status}`);
    r = await publico.req("GET", "/api/public/tickets/abc");
    checa("código que não é número: 404", r.status === 404, `HTTP ${r.status}`);

    r = await publico.req("POST", `/api/public/tickets/${codigo}/printed`);
    checa("marcar impresso sem sessão: 401", r.status === 401, `HTTP ${r.status}`);
    const impresso = async () => (await db.select({ t: orders.ticketPrintedAt }).from(orders).where(eq(orders.code, codigo)))[0].t;
    r = await dB.req("POST", `/api/public/tickets/${codigo}/printed`);
    checa("a organização vizinha não marca (404)", r.status === 404, `HTTP ${r.status}`);
    r = await cB.req("POST", `/api/public/tickets/${codigo}/printed`);
    checa("o cambista de outra organização não marca (404)", r.status === 404, `HTTP ${r.status}`);
    checa("…e nada foi gravado", (await impresso()) === null);
    r = await c1.req("POST", `/api/public/tickets/12345678/printed`);
    checa("venda que não existe: 404", r.status === 404, `HTTP ${r.status}`);
    r = await c1.req("POST", `/api/public/tickets/${codigo}/printed`);
    checa("o cambista da venda marca (200)", r.status === 200 && (await impresso()) !== null, `HTTP ${r.status}`);
    await db.update(orders).set({ ticketPrintedAt: null }).where(eq(orders.code, codigo));
    r = await dA.req("POST", `/api/public/tickets/${codigo}/printed`);
    checa("a organização dona marca (200)", r.status === 200 && (await impresso()) !== null, `HTTP ${r.status}`);

    /* ------------------------------- imagens ------------------------------ */
    console.log("\n  imagens:");
    r = await publico.req("GET", `/api/public/o/${orgA.slug}/foto`);
    checa("foto do perfil", r.status === 200, `HTTP ${r.status}`);
    r = await publico.req("GET", `/api/public/o/${arq.slug}/foto`);
    checa("organização arquivada: a foto some (404)", r.status === 404, `HTTP ${r.status}`);
    r = await publico.req("GET", `/api/public/o/${orgB.slug}/foto`);
    checa("sem foto: 404", r.status === 404, `HTTP ${r.status}`);
    r = await publico.req("GET", `/api/public/o/${orgA.slug}/capa`);
    checa("sem capa: 404", r.status === 404, `HTTP ${r.status}`);
    r = await publico.req("GET", `/api/public/o/nao-existe-publico/capa`);
    checa("organização que não existe: 404", r.status === 404, `HTTP ${r.status}`);
    r = await publico.req("GET", `/api/public/u/ninguem.aqui/foto`);
    checa("apostador sem foto: 404", r.status === 404, `HTTP ${r.status}`);
    r = await publico.req("GET", `/api/public/banners/00000000-0000-4000-8000-000000000000/imagem`);
    checa("banner que não existe: 404", r.status === 404, `HTTP ${r.status}`);
    r = await publico.req("GET", `/api/public/banners/isso-nao-e-uuid/imagem`);
    checa("banner com id fora do formato: 404, nunca 500", r.status === 404, `HTTP ${r.status}`);
    r = await publico.req("GET", `/api/public/o/${orgA.slug}/termo-afiliado`);
    checa("termo de adesão do afiliado responde", r.status === 200 || r.status === 404, `HTTP ${r.status}`);
    r = await publico.req("GET", `/api/public/o/${arq.slug}/termo-afiliado`);
    checa("…e o da organização arquivada, não (404)", r.status === 404, `HTTP ${r.status}`);

    /* ------------------------------ clique -------------------------------- */
    console.log("\n  clique do afiliado:");
    r = await publico.req("POST", "/api/public/track-click", {});
    checa("sem código: 400", r.status === 400, `HTTP ${r.status}`);
    r = await publico.req("POST", "/api/public/track-click", { ref: "NAOEXISTE9" });
    checa("código que não existe: não conta", r.status === 200 && r.json?.tracked === false, JSON.stringify(r.json));
    const cliques = async () => Number((await db.select({ n: sql<number>`count(*)::int` }).from(clickEvents).where(eq(clickEvents.affiliateId, afiliado.id)))[0].n);
    r = await publico.req("POST", "/api/public/track-click", { ref: CODIGOS[0].toLowerCase(), slug: viva.slug });
    checa("código ativo conta, em maiúscula ou não", r.status === 200 && r.json?.tracked === true && r.json?.attributed === CODIGOS[0], JSON.stringify(r.json));
    checa("…uma linha de clique", (await cliques()) === 1);
    let barrou = false;
    const antes = await cliques();
    for (let i = 0; i < 200 && !barrou; i++) {
      const t = await publico.req("POST", "/api/public/track-click", { ref: CODIGOS[0] });
      barrou = (await cliques()) - antes < i + 1 && t.status === 200;
    }
    checa("clique em rajada do mesmo IP deixa de gravar", barrou);
    r = await publico.req("POST", "/api/public/track-click", { ref: CODIGOS[0] });
    checa("…mas a atribuição segue (o afiliado não perde a venda)", r.status === 200 && r.json?.tracked === true && r.json?.attributed === CODIGOS[0], JSON.stringify(r.json));
    checa("…e a tabela não cresce sem limite", (await cliques()) - antes <= 130, `${(await cliques()) - antes}`);

    /* ------------------ promotora arquivada ou banida --------------------- */
    console.log("\n  promotora arquivada ou banida:");
    r = await publico.req("GET", "/api/public/campaigns");
    const naVitrine: string[] = (r.json ?? []).map((c: { slug: string }) => c.slug);
    checa("a rifa da promotora viva aparece na vitrine", naVitrine.includes(viva.slug), naVitrine.join(","));
    checa("…a da arquivada e a da banida, não", !naVitrine.includes(arqRifa.slug) && !naVitrine.includes(banRifa.slug), naVitrine.join(","));
    r = await publico.req("GET", "/api/public/estados");
    checa("os estados não contam a rifa delas", r.status === 200 && !(r.json ?? []).some((e: { uf: string }) => e.uf === "AC"), JSON.stringify(r.json));
    r = await publico.req("GET", `/api/public/o/${ban.slug}`);
    checa("perfil da banida: 404", r.status === 404, `HTTP ${r.status}`);
    r = await publico.req("GET", `/api/public/o/${ban.slug}/termo-afiliado`);
    checa("termo de afiliado da banida: 404 (a arquivada já era)", r.status === 404, `HTTP ${r.status}`);
    r = await publico.req("GET", `/api/public/marketing?organizacao=${ban.slug}`);
    checa("o pixel da banida não vai para a página", r.status === 200 && r.json?.organizacao === null, JSON.stringify(r.json));
    const semSeguir = async (caminho: string) => {
      const x = await fetch(URL + caminho, { redirect: "manual" });
      return { status: x.status, destino: x.headers.get("location") ?? "" };
    };
    let g = await semSeguir("/l/publico-a/0");
    checa("link do perfil da viva leva ao destino guardado", g.status === 302 && g.destino === "https://exemplo.com/site-da-a", `${g.status} ${g.destino}`);
    g = await semSeguir(`/l/${ban.slug}/0`);
    checa("link do perfil da banida: não redireciona (404)", g.status === 404 && g.destino === "", `${g.status} ${g.destino}`);
    g = await semSeguir("/c/PUBPRF");
    checa("endereço curto da viva leva ao perfil", g.status === 302 && g.destino === "/o/publico-a", `${g.status} ${g.destino}`);
    g = await semSeguir("/c/BANPRF");
    checa("endereço curto da banida volta para a vitrine", g.status === 302 && g.destino === "/", `${g.status} ${g.destino}`);

    /* ------------- a porta aguenta o que ninguém digita ------------------ */
    console.log("\n  byte nulo, texto enorme e id fora do formato:");
    const vivo = async () => (await publico.req("GET", "/api/public/template")).status === 200;
    const enorme = randomBytes(6000).toString("base64");
    r = await publico.req("POST", "/api/auth/login", { email: "a\u0000b@teste.rifa", password: "x" });
    checa("login com byte nulo no e-mail: 400", r.status === 400, `HTTP ${r.status}`);
    checa("…e o servidor segue no ar", await vivo());
    r = await publico.req("POST", "/api/auth/login", { email: enorme, password: "x" });
    checa("login com e-mail de 8 mil letras: 401, como qualquer senha errada", r.status === 401, `HTTP ${r.status}`);
    checa("…e o servidor segue no ar", await vivo());
    r = await publico.req("POST", "/api/auth/login", { email: enorme, password: "x" });
    checa("…repetido, ainda 401 (o mesmo balde, contado)", r.status === 401, `HTTP ${r.status}`);
    r = await publico.req("POST", "/api/public/conta/entrar", { login: enorme, senha: "x" });
    checa("entrar na conta com texto enorme: 401", r.status === 401, `HTTP ${r.status}`);
    r = await publico.req("POST", "/api/public/track-click", { ref: "ab\u0000c" });
    checa("clique de afiliado com byte nulo: 400", r.status === 400, `HTTP ${r.status}`);
    r = await publico.req("POST", "/api/public/afiliados/cadastro", { name: "Ana\u0000 Souza", email: "ana@teste.rifa", phone: "11999999999", password: "SenhaForte123!" });
    checa("cadastro de afiliado com byte nulo no nome: 400", r.status === 400, `HTTP ${r.status}`);
    for (const caminho of [
      "/api/public/campaigns/%00",
      "/api/public/o/%00",
      "/api/public/o/%00/foto",
      "/api/public/u/%00",
      "/api/public/recibos/%00",
      "/api/public/marketing?organizacao=%00",
      "/api/public/presente?codigo=a%00b",
    ]) {
      r = await publico.req("GET", caminho);
      checa(`${caminho}: 400, nunca 500`, r.status === 400, `HTTP ${r.status}`);
    }
    checa("…e o servidor segue no ar", await vivo());

    for (const caminho of [
      "/api/public/orders/abc",
      "/api/public/orders/99999999999",
      "/api/public/orders/1.5",
      "/api/public/carrinho/pedidos/abc",
      "/api/public/carrinho/pedidos/99999999999",
      "/api/public/stories/abc/poster",
      "/api/public/stories/abc/imagem",
      "/api/public/banners-pagos/abc/imagem",
    ]) {
      r = await publico.req("GET", caminho);
      checa(`${caminho}: 404, nunca 500`, r.status === 404, `HTTP ${r.status}`);
    }
    await db.execute(sql`delete from rate_events where bucket like 'lookup%'`);

    /* ------------------------------ cache --------------------------------- */
    console.log("\n  cache:");
    const cabecalho = async (caminho: string) => (await fetch(URL + caminho)).headers.get("cache-control") ?? "";
    for (const caminho of [`/api/public/orders/${codigo}`, `/api/public/tickets/${codigo}`, `/api/public/tickets/${codigo}/escpos`]) {
      const cc = await cabecalho(caminho);
      checa(`${caminho.replace(String(codigo), ":código")}: pedido e nome de quem comprou, nunca em cache`, /no-store/.test(cc) && /private/.test(cc), cc);
    }
    for (const caminho of [`/api/public/campaigns/${viva.slug}`, "/api/public/campaigns", `/api/public/o/${orgA.slug}`, `/api/public/campaigns/${viva.slug}/ranking`]) {
      const cc = await cabecalho(caminho);
      checa(`${caminho.replace(viva.slug, ":slug")}: a leitura varia com a sessão, então só o aparelho guarda`, /private/.test(cc) && !/public/.test(cc), cc);
    }
    checa("o que é igual para todos mantém o cache da rota (template público)", /public/.test(await cabecalho("/api/public/template")), await cabecalho("/api/public/template"));
    r = await publico.req("GET", `/api/public/campaigns/${viva.slug}/ranking`);
    const r2 = await publico.req("GET", `/api/public/campaigns/${viva.slug}/ranking`);
    checa("ranking guardado alguns segundos devolve o mesmo", r.status === 200 && JSON.stringify(r.json) === JSON.stringify(r2.json));

    /* -------------------------------- CEP --------------------------------- */
    console.log("\n  CEP:");
    r = await publico.req("GET", "/api/public/cep/123");
    checa("CEP curto: 400", r.status === 400, `HTTP ${r.status}`);
    r = await publico.req("GET", "/api/public/cep/abcdefgh");
    checa("CEP com letras: 400", r.status === 400, `HTTP ${r.status}`);
    // Cada CEP novo é uma chamada ao serviço de fora: quem varre CEPs é barrado por IP.
    let barrado = 0;
    for (let i = 0; i < 135; i++) {
      r = await publico.req("GET", "/api/public/cep/123");
      if (r.status === 429) barrado++;
    }
    checa("varredura de CEP: depois de 120 por minuto, 429 em português", barrado > 0 && /CEP/.test(r.json?.message ?? ""), `${barrado} barrados`);
    await db.execute(sql`delete from rate_events where bucket like 'cep:%'`);

    void cambA;
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
