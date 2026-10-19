/**
 * Prova do afiliado de todas as organizações, pela API de verdade:
 *
 * - cadastro avulso (sem organização) e adesão pelo painel;
 * - **sem vínculo aprovado, o link não dá comissão** (antes dava na rifa de
 *   qualquer organização);
 * - termo por versão, fotografado na publicação: a rifa publicada com a v1
 *   paga a v1 só a quem aceitou a v1; aceite de versão velha é 409;
 * - cupom de uma organização não vale na rifa de outra;
 * - saque por organização (cada uma vê e paga só o dela);
 * - sair desfaz o vínculo sem apagar o que já ganhou;
 * - "Seja um colaborador" com um pedido em aberto por organização;
 * - recorte: a organização vizinha não vê nem mexe em nada disso;
 * - migração do afiliado antigo (organização no usuário) para vínculo.
 *
 *   npm run afiliados      (com `npm run dev` no ar e o seed aplicado)
 */
import "dotenv/config";
import { baseUrl } from "./base-url";
import { and, eq, inArray, sql } from "drizzle-orm";
import { db, pool } from "../server/db";
import { hashPassword } from "../server/auth";
import { publishCampaign } from "../server/services/campaigns";
import { migrarAfiliadosAntigos } from "../server/services/afiliados";
import {
  affiliates,
  afiliadoVinculos,
  buyers,
  campaignMedia,
  campaignStats,
  campaigns,
  commissions,
  orders,
  organizations,
  users,
} from "../shared/schema";
import { NOTA_DE_TESTE, aprovarCadastroComCnpj } from "./saque-de-teste";

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

const SLUGS = ["afiliados-teste-a", "afiliados-teste-b"];
const EMAILS = ["afiliados-org-a@teste.rifa", "afiliados-org-b@teste.rifa", "afiliado-avulso@teste.rifa", "afiliado-antigo@teste.rifa", "afiliado-aud-x@teste.rifa", "afiliado-aud-y@teste.rifa"];
const TEL_AFILIADO = "11944440000";
const TEL_COLAB = "11944449999";
const SENHA = "senha-afiliados-1";

async function limpar() {
  const orgs = await db.select({ id: organizations.id }).from(organizations).where(inArray(organizations.slug, SLUGS));
  const ids = orgs.map((o) => o.id);
  if (ids.length) {
    const cs = (await db.select({ id: campaigns.id }).from(campaigns).where(inArray(campaigns.organizationId, ids))).map((c) => c.id);
    if (cs.length) {
      const lista = sql.raw(`('${cs.join("','")}')`);
      await db.execute(sql`delete from quota_alloc where campaign_id in ${lista}`);
      await db.execute(sql`delete from free_pool where campaign_id in ${lista}`);
      await db.execute(sql`delete from commissions where campaign_id in ${lista}`);
      await db.execute(sql`delete from platform_charges where order_id in (select id from orders where campaign_id in ${lista})`);
      await db.execute(sql`delete from draws where campaign_id in ${lista}`);
      await db.delete(orders).where(inArray(orders.campaignId, cs));
    }
    await db.execute(sql`delete from recibos where organization_id in ${sql.raw(`('${ids.join("','")}')`)}`);
    await db.execute(sql`delete from payouts where organization_id in ${sql.raw(`('${ids.join("','")}')`)}`);
    await db.execute(sql`delete from coupons where organization_id in ${sql.raw(`('${ids.join("','")}')`)}`);
    await db.execute(sql`delete from termo_aceites where termo_id in (select id from organizacao_termos where organization_id in ${sql.raw(`('${ids.join("','")}')`)})`);
    await db.delete(campaigns).where(inArray(campaigns.organizationId, ids));
  }
  await db.execute(sql`delete from affiliates where user_id in (select id from users where email in ${sql.raw(`('${EMAILS.join("','")}')`)})`);
  await db.delete(users).where(inArray(users.email, EMAILS));
  if (ids.length) await db.delete(organizations).where(inArray(organizations.id, ids));
  await db.execute(sql`delete from buyers where phone like '1194444%'`);
  await db.execute(sql`delete from rate_events where bucket like 'login:%' or bucket like 'order:%' or bucket like 'cadastro:%' or bucket like 'afiliado-cadastro%'`);
}

async function novaRifa(orgId: string, sufixo: string, status: "draft" | "published") {
  const [c] = await db
    .insert(campaigns)
    .values({
      organizationId: orgId,
      slug: `afiliados-teste-${sufixo}`,
      title: `Rifa ${sufixo}`,
      prizeTitle: `Prêmio ${sufixo}`,
      totalQuotas: 10_000,
      priceCents: 1000,
      commissionPctDefault: 10,
      status,
      publishedAt: status === "published" ? new Date() : null,
      drawAt: new Date(Date.now() + 20 * 86_400_000),
      authorizationCode: `SPA-AF-${sufixo}`,
      authorizationFileKey: "certificado-teste",
      metodoApuracao: "federal_direta",
    })
    .returning();
  if (status === "published") await db.insert(campaignStats).values({ campaignId: c.id });
  else {
    await db.insert(campaignMedia).values([
      { campaignId: c.id, role: "banner", storageKey: "x", mime: "image/webp", status: "ready" },
      { campaignId: c.id, role: "photo", storageKey: "y", mime: "image/webp", status: "ready" },
    ]);
  }
  return c;
}

let telefone = 11944441000;
/** Compra pelo link do afiliado, paga pela rota de desenvolvimento. */
async function compraPeloLink(campaignId: string, codigoAfiliado: string, cupom?: string) {
  const r = await new Cliente().req("POST", "/api/public/orders", {
    campaignId,
    quantity: 1,
    buyer: { name: "Comprador Teste", phone: String(telefone++) },
    affiliateCode: codigoAfiliado,
    ...(cupom ? { couponCode: cupom } : {}),
  });
  if (r.status !== 201) return { status: r.status, message: r.json?.message as string };
  await fetch(`${URL}/api/dev/pay/${r.json.code}`, { method: "POST" });
  const [o] = await db.select().from(orders).where(eq(orders.code, r.json.code));
  const [k] = await db.select().from(commissions).where(eq(commissions.orderId, o.id));
  return { status: 201, pedido: o, comissao: k ?? null };
}

/**
 * Auditoria do acesso AFILIADO (18/10/2026): o que a sessão de afiliado
 * alcança e o que não pode alcançar — privilégio, recorte entre organizações e
 * entre afiliados, dinheiro (saque duplo, saque de outra organização), a chave
 * Pix, os tipos de documento, o teto das gravações do cadastro e a sessão
 * roubada que sobrevivia à troca de senha.
 */
async function auditoriaDoAcesso(A: { id: string; slug: string }, B: { id: string; slug: string }, orgA: Cliente, orgB: Cliente, a1: { id: string; slug: string }, b1: { id: string; slug: string }) {
  console.log("\n--- auditoria do acesso afiliado ---");
  const rascunho = await novaRifa(A.id, "rasc", "draft");
  const entrar = async (email: string, nome: string, tel: string) => {
    const c = new Cliente();
    let r = await c.req("POST", "/api/public/afiliados/cadastro", { name: nome, email, phone: tel, password: SENHA });
    if (r.status !== 201) throw new Error(`cadastro de ${nome}: HTTP ${r.status}`);
    const codigo = r.json.code as string;
    r = await c.req("POST", "/api/auth/login", { email, password: SENHA });
    if (r.status !== 200) throw new Error(`login de ${nome}: HTTP ${r.status}`);
    const [af] = await db.select().from(affiliates).where(eq(affiliates.code, codigo));
    return { c, codigo, id: af.id, email };
  };
  const X = await entrar(EMAILS[4], "Afiliado Aud X", "11944442000");
  const Y = await entrar(EMAILS[5], "Afiliado Aud Y", "11944443000");
  // A organização A tem termo (a v3 do fluxo de cima): o aceite leva a versão em vigor.
  const termoA = ((await X.c.req("GET", "/api/affiliate/organizacoes")).json as any[]).find((o) => o.slug === A.slug)?.termo?.versao;
  await X.c.req("POST", `/api/affiliate/organizacoes/${A.slug}/aderir`, { versao: termoA });
  await Y.c.req("POST", `/api/affiliate/organizacoes/${B.slug}/aderir`, {});
  await orgA.req("PATCH", `/api/admin/affiliates/${X.id}`, { status: "active" });
  await orgB.req("PATCH", `/api/admin/affiliates/${Y.id}`, { status: "active" });
  for (let i = 0; i < 3; i++) await compraPeloLink(a1.id, X.codigo);
  await compraPeloLink(b1.id, Y.codigo);
  await db.update(commissions).set({ status: "available" }).where(inArray(commissions.affiliateId, [X.id, Y.id]));

  // Privilégio: a sessão de afiliado não alcança painel nem cambista, e o contrário também.
  for (const [m, p] of [
    ["GET", "/api/admin/overview"],
    ["GET", "/api/admin/orders"],
    ["GET", "/api/admin/affiliates"],
    ["GET", "/api/admin/finance"],
    ["POST", "/api/admin/payouts/00000000-0000-0000-0000-000000000000/paid"],
    ["GET", "/api/seller/sales"],
    ["POST", "/api/seller/sales"],
  ] as const) {
    const r = await X.c.req(m, p, m === "POST" ? {} : undefined);
    checa(`afiliado em ${m} ${p}: 403`, r.status === 403, `HTTP ${r.status}`);
  }
  let r = await orgA.req("GET", "/api/affiliate/saldo");
  checa("organizador em /api/affiliate/saldo: 403", r.status === 403, `HTTP ${r.status}`);

  // Recorte entre organizações: o kit só vale onde ele recebe, e rascunho não existe.
  r = await X.c.req("GET", `/api/affiliate/artes/${rascunho.slug}`);
  checa("artes de um rascunho da organização dele: 404 (200 vazio confirmava o endereço)", r.status === 404, `HTTP ${r.status}`);
  for (const [m, p] of [
    ["GET", `/api/affiliate/artes/${b1.slug}`],
    ["GET", `/api/affiliate/artes/${b1.slug}/rifa`],
    ["GET", `/api/affiliate/artes/${b1.slug}/rifa/pacote`],
    ["GET", `/api/affiliate/editor/${b1.slug}`],
    ["GET", `/api/affiliate/editor/${rascunho.slug}`],
  ] as const) {
    r = await X.c.req(m, p);
    checa(`${m} ${p.replace("/api/affiliate", "")} de rifa onde não recebe: 404`, r.status === 404, `HTTP ${r.status}`);
  }
  r = await X.c.req("GET", `/api/affiliate/artes/${a1.slug}?ref=${Y.codigo}`);
  checa("o link do kit leva o código da sessão, nunca o do ?ref=", r.status === 200 && String(r.json?.link).includes(`ref=${X.codigo}`) && !JSON.stringify(r.json).includes(Y.codigo), String(r.json?.link));
  r = await X.c.req("GET", "/api/affiliate/links");
  checa("os links dele só trazem rifa da organização com vínculo", r.status === 200 && r.json.some((l: any) => l.slug === a1.slug) && !r.json.some((l: any) => l.slug === b1.slug || l.slug === rascunho.slug));
  r = await X.c.req("POST", "/api/affiliate/divulgacoes", { slug: b1.slug, legenda: "Rifa de outra organização" });
  checa("divulgar rifa de organização sem vínculo: 403", r.status === 403, `HTTP ${r.status}`);
  r = await X.c.req("POST", "/api/affiliate/divulgacoes", { slug: rascunho.slug, legenda: "Rascunho da organização" });
  checa("divulgar rascunho: 404", r.status === 404, `HTTP ${r.status}`);

  // Entre afiliados: a peça, o saque e a nota do outro são 404.
  r = await X.c.req("POST", "/api/affiliate/divulgacoes", { slug: a1.slug, legenda: "Participe da rifa da A" });
  const peca = r.json?.id as string;
  checa("publica a própria peça", r.status === 201 && Boolean(peca), `HTTP ${r.status} ${r.json?.message ?? ""}`);
  for (const [m, p] of [
    ["PATCH", `/api/affiliate/divulgacoes/${peca}`],
    ["DELETE", `/api/affiliate/divulgacoes/${peca}`],
    ["GET", `/api/affiliate/divulgacoes/${peca}/video`],
  ] as const) {
    r = await Y.c.req(m, p, m === "PATCH" ? { legenda: "invasão" } : undefined);
    checa(`${m} na peça de outro afiliado: 404`, r.status === 404, `HTTP ${r.status}`);
  }
  r = await Y.c.req("GET", "/api/affiliate/divulgacoes");
  checa("a lista de peças do outro não traz a dele", r.status === 200 && !JSON.stringify(r.json).includes(peca));

  // A chave Pix só troca com texto (objeto virava "[object Object]" e seguia para os saques).
  for (const pixKey of [{ a: 1 }, ["x", "y", "z"], 123456, null]) {
    r = await X.c.req("PATCH", "/api/affiliate/pix-key", { pixKey, senha: SENHA });
    checa(`chave Pix ${JSON.stringify(pixKey)} é recusada (400)`, r.status === 400, `HTTP ${r.status}`);
  }
  r = await X.c.req("PATCH", "/api/affiliate/pix-key", { pixKey: "aud-x@exemplo.com", senha: SENHA });
  checa("chave Pix de texto, com a senha: troca", r.status === 200, `HTTP ${r.status}`);

  // Documento fiscal: só os tipos da lista (`in` aceitava "constructor" e "toString").
  const foto = "data:image/jpeg;base64," + Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 16, 0x4a, 0x46, 0x49, 0x46, 0, 1, 1, 0, 0, 1, 0, 1, 0, 0, 0xff, 0xd9]).toString("base64");
  for (const tipo of ["constructor", "__proto__", "toString", "hasOwnProperty"]) {
    r = await X.c.req("PUT", `/api/affiliate/fiscal/documentos/${tipo}`, { arquivo: foto });
    checa(`documento fiscal do tipo "${tipo}": 400`, r.status === 400, `HTTP ${r.status}`);
  }
  const gravados = await db.execute(sql`select tipo from afiliado_documentos where affiliate_id = ${X.id}::uuid`);
  checa("nenhum documento de tipo inventado foi gravado", gravados.rows.length === 0, JSON.stringify(gravados.rows));
  r = await X.c.req("PUT", "/api/affiliate/fiscal/documentos/identidade_frente", { arquivo: foto });
  checa("o tipo da lista continua entrando", r.status === 200, `HTTP ${r.status} ${r.json?.message ?? ""}`);

  // Saque: dez pedidos ao mesmo tempo dão um saque só; o outro afiliado não saca a organização dele.
  await aprovarCadastroComCnpj(X.id);
  await aprovarCadastroComCnpj(Y.id);
  await db.update(affiliates).set({ pixKey: "aud-y@exemplo.com" }).where(eq(affiliates.id, Y.id));
  const rs = await Promise.all(Array.from({ length: 10 }, () => X.c.req("POST", "/api/affiliate/payouts", { organizacaoId: A.id, notaFiscal: NOTA_DE_TESTE })));
  checa("dez saques simultâneos: um 201 e nove recusas", rs.filter((x) => x.status === 201).length === 1 && rs.filter((x) => x.status === 400).length === 9, rs.map((x) => x.status).join(","));
  const [{ n: saques }] = (await db.execute(sql`select count(*)::int as n from payouts where affiliate_id = ${X.id}::uuid`)).rows as { n: number }[];
  checa("uma linha em payouts, e nenhuma comissão sobrou disponível", saques === 1 && (await db.select().from(commissions).where(and(eq(commissions.affiliateId, X.id), eq(commissions.status, "available")))).length === 0, String(saques));
  const saqueX = rs.find((x) => x.status === 201)?.json?.id as string;
  r = await Y.c.req("POST", "/api/affiliate/payouts", { organizacaoId: A.id, notaFiscal: NOTA_DE_TESTE });
  checa("sacar a organização em que não tem saldo: 400, sem saque", r.status === 400, `HTTP ${r.status} ${r.json?.message ?? ""}`);
  for (const organizacaoId of ["x", "plataforma", "00000000-0000-0000-0000-000000000000"]) {
    r = await Y.c.req("POST", "/api/affiliate/payouts", { organizacaoId, notaFiscal: NOTA_DE_TESTE });
    checa(`organizacaoId ${JSON.stringify(organizacaoId)} sem saldo ali: 400`, r.status === 400, `HTTP ${r.status}`);
  }
  r = await Y.c.req("GET", `/api/affiliate/payouts/${saqueX}/nota`);
  checa("a nota do saque de outro afiliado: 404", r.status === 404, `HTTP ${r.status}`);
  r = await Y.c.req("GET", "/api/affiliate/payouts");
  checa("a lista de saques do outro não traz o dele", !JSON.stringify(r.json).includes(saqueX));
  r = await X.c.req("GET", `/api/affiliate/payouts/${saqueX}/nota`);
  checa("a nota do próprio saque abre", r.status === 200, `HTTP ${r.status}`);

  // O teto das gravações do cadastro (arquivo cifrado ou reprocessado, e o 409 do CPF repetido).
  const tentativas: number[] = [];
  for (let i = 0; i < 45; i++) tentativas.push((await Y.c.req("PUT", "/api/affiliate/foto", { foto: "nao-e-imagem" })).status);
  checa("a 41ª gravação do cadastro em uma hora é 429 (as anteriores, erro de preenchimento)", tentativas.slice(0, 40).every((s) => s === 400) && tentativas.slice(40).every((s) => s === 429), tentativas.join(","));
  r = await Y.c.req("GET", "/api/affiliate/fiscal");
  checa("ler o cadastro não conta no teto", r.status === 200, `HTTP ${r.status}`);

  // Sessão: a roubada não sobrevive à troca de senha, nem se regravada depois do DELETE.
  const sid = (cookie: string) => decodeURIComponent(cookie.split("=")[1]).slice(2).split(".")[0];
  const ladrao = new Cliente();
  await ladrao.req("POST", "/api/auth/login", { email: X.email, password: SENHA });
  checa("a sessão do ladrão entra", (await ladrao.req("GET", "/api/affiliate/overview")).status === 200);
  const [linha] = (await db.execute(sql`select sess, expire from sessions where sid = ${sid(ladrao.cookie)}`)).rows as { sess: unknown; expire: Date }[];
  const NOVA = "senha-afiliados-2-nova";
  r = await X.c.req("POST", "/api/auth/senha", { atual: SENHA, nova: NOVA });
  checa("a troca de senha (a vítima)", r.status === 200, `HTTP ${r.status} ${r.json?.message ?? ""}`);
  checa("a sessão do ladrão caiu", (await ladrao.req("GET", "/api/affiliate/overview")).status === 401);
  await db.execute(sql`insert into sessions (sid, sess, expire) values (${sid(ladrao.cookie)}, ${JSON.stringify(linha.sess)}::json, ${linha.expire}) on conflict (sid) do update set sess = excluded.sess, expire = excluded.expire`);
  checa("…e continua caída quando uma requisição em andamento a regrava depois do DELETE", (await ladrao.req("GET", "/api/affiliate/overview")).status === 401);
  checa("a sessão de quem trocou a senha segue valendo", (await X.c.req("GET", "/api/affiliate/overview")).status === 200);
  const novo = new Cliente();
  r = await novo.req("POST", "/api/auth/login", { email: X.email, password: NOVA });
  checa("entrar de novo com a senha nova vale", r.status === 200 && (await novo.req("GET", "/api/affiliate/overview")).status === 200, `HTTP ${r.status}`);
  const disponivel = (await new Cliente().req("GET", "/api/public/conta/google/disponivel")).json?.ligado === true;
  if (disponivel) {
    // A corrida de verdade: 24 laços escrevem na sessão do ladrão enquanto a troca acontece.
    await db.execute(sql`delete from rate_events where bucket like 'login:%'`);
    const v2 = new Cliente();
    const l2 = new Cliente();
    await v2.req("POST", "/api/auth/login", { email: X.email, password: NOVA });
    await l2.req("POST", "/api/auth/login", { email: X.email, password: NOVA });
    let parar = false;
    const lacos = Array.from({ length: 24 }, async () => {
      while (!parar) await fetch(`${URL}/api/public/conta/google/entrar`, { redirect: "manual", headers: { Cookie: l2.cookie } });
    });
    await new Promise((res) => setTimeout(res, 100));
    r = await v2.req("POST", "/api/auth/senha", { atual: NOVA, nova: "senha-afiliados-3-nova" });
    await new Promise((res) => setTimeout(res, 400));
    parar = true;
    await Promise.all(lacos);
    checa("com 24 requisições em laço na sessão roubada, ela ainda cai", r.status === 200 && (await l2.req("GET", "/api/affiliate/overview")).status === 401, `troca HTTP ${r.status}`);
  } else {
    console.log("  (login com o Google indisponível neste servidor: a corrida em laço foi pulada; o DELETE regravado acima já prova a marca)");
  }
}

async function main() {
  console.log("\n=== afiliado de todas as organizações ===\n");
  await limpar();

  const orgs: { id: string; slug: string }[] = [];
  const organizadores: Cliente[] = [];
  for (const [i, slug] of SLUGS.entries()) {
    // Telefone já aprovado: sem isso a rifa não publica (`publishBlockers`).
    const [o] = await db
      .insert(organizations)
      .values({ slug, name: `Afiliados ${i ? "B" : "A"}`, cidade: "Natal", uf: "RN", telefoneConfirmadoEm: new Date(), telefoneAprovadoEm: new Date(), sociosDeclaradosEm: new Date() })
      .returning();
    await db.insert(users).values({ role: "organizer", organizationId: o.id, name: `Org ${i}`, email: EMAILS[i], passwordHash: await hashPassword(SENHA) });
    orgs.push(o);
    const c = new Cliente();
    const r = await c.req("POST", "/api/auth/login", { email: EMAILS[i], password: SENHA });
    if (r.status !== 200) throw new Error(`login da organização ${i}: HTTP ${r.status}`);
    organizadores.push(c);
  }
  const [A, B] = orgs;
  const [orgA, orgB] = organizadores;
  const a1 = await novaRifa(A.id, "a1", "published");
  const b1 = await novaRifa(B.id, "b1", "published");

  try {
    // Cadastro avulso.
    const anon = new Cliente();
    let r = await anon.req("POST", "/api/public/afiliados/cadastro", { name: "Ana Divulga", email: EMAILS[2], phone: TEL_AFILIADO, password: SENHA });
    checa("cadastro avulso, sem organização", r.status === 201, `HTTP ${r.status} ${r.json?.message ?? ""}`);
    const codigo = r.json?.code as string;
    const [conta] = await db.select().from(users).where(eq(users.email, EMAILS[2]));
    checa("a conta não tem organização", conta?.organizationId === null);
    const afiliada = new Cliente();
    r = await afiliada.req("POST", "/api/auth/login", { email: EMAILS[2], password: SENHA });
    checa("entra na hora (a aprovação é por organização)", r.status === 200, `HTTP ${r.status} ${r.json?.message ?? ""}`);
    const [aff] = await db.select().from(affiliates).where(eq(affiliates.code, codigo));

    r = await afiliada.req("GET", "/api/affiliate/links");
    checa("sem vínculo, nenhuma rifa para divulgar", Array.isArray(r.json) && !r.json.some((l: any) => l.slug === a1.slug || l.slug === b1.slug));
    let v = await compraPeloLink(a1.id, codigo);
    checa("sem vínculo, o link não dá comissão (nem afiliado no pedido)", v.status === 201 && v.pedido?.affiliateId === null && v.comissao === null);

    // Adesão à A e aprovação.
    r = await afiliada.req("POST", `/api/affiliate/organizacoes/${A.slug}/aderir`, {});
    checa("pede adesão à A", r.status === 200 && r.json?.status === "pendente", JSON.stringify(r.json));
    r = await orgB.req("GET", "/api/admin/affiliates");
    checa("a B não vê o pedido feito à A", !r.json?.some((x: any) => x.affiliate.id === aff.id));
    r = await orgB.req("PATCH", `/api/admin/affiliates/${aff.id}`, { status: "active" });
    checa("a B não aprova o vínculo com a A (404)", r.status === 404, `HTTP ${r.status}`);
    r = await orgA.req("GET", "/api/admin/affiliates");
    checa("a A vê o pedido pendente", r.json?.some((x: any) => x.affiliate.id === aff.id && x.vinculo?.status === "pendente"));
    v = await compraPeloLink(a1.id, codigo);
    checa("pendente ainda não recebe", v.comissao === null);
    r = await orgA.req("PATCH", `/api/admin/affiliates/${aff.id}`, { status: "active" });
    checa("a A aprova", r.status === 200 && r.json?.status === "aprovado", `HTTP ${r.status}`);

    v = await compraPeloLink(a1.id, codigo);
    checa("aprovada: a rifa sem termo paga o padrão dela (10%)", v.comissao?.pct === 10, String(v.comissao?.pct));
    v = await compraPeloLink(b1.id, codigo);
    checa("na rifa da B, sem vínculo, nada", v.comissao === null && v.pedido?.affiliateId === null);

    // Termo v1 e a rifa publicada com ele.
    r = await orgA.req("POST", "/api/admin/termo-afiliado", { comissaoPct: 12, textoExtra: "Sem spam em grupo." });
    checa("a A publica o termo v1 (12%)", r.status === 201 && r.json?.versao === 1, `HTTP ${r.status} ${r.json?.message ?? ""}`);
    r = await orgB.req("GET", "/api/admin/termo-afiliado");
    checa("o termo da A não aparece para a B", r.json?.termo === null);
    const a2 = await novaRifa(A.id, "a2", "draft");
    await publishCampaign(a2.id);
    const [a2pub] = await db.select().from(campaigns).where(eq(campaigns.id, a2.id));
    checa("a rifa publicada fotografa o termo em vigor", Boolean(a2pub.termoId));
    v = await compraPeloLink(a2.id, codigo);
    checa("sem aceitar o termo da rifa, não recebe", v.comissao === null);
    r = await afiliada.req("GET", "/api/affiliate/links");
    checa("o link aparece com o aviso de termo pendente", r.json?.some((l: any) => l.slug === a2.slug && l.termoPendente === true));
    r = await afiliada.req("POST", `/api/affiliate/organizacoes/${A.slug}/aderir`, { versao: 1 });
    checa("aceita a v1 (continua aprovada)", r.status === 200 && r.json?.status === "aprovado", JSON.stringify(r.json));
    v = await compraPeloLink(a2.id, codigo);
    checa("com o aceite, a rifa paga o termo (12%)", v.comissao?.pct === 12, String(v.comissao?.pct));
    v = await compraPeloLink(a1.id, codigo);
    checa("e a rifa de antes do termo segue com o padrão dela (10%)", v.comissao?.pct === 10, String(v.comissao?.pct));

    // Versão nova não mexe na rifa em andamento.
    r = await orgA.req("POST", "/api/admin/termo-afiliado", { comissaoPct: 15, textoExtra: "" });
    checa("a A publica a v2 (15%)", r.json?.versao === 2);
    r = await afiliada.req("POST", `/api/affiliate/organizacoes/${A.slug}/aderir`, { versao: 1 });
    checa("aceitar olhando a versão velha: 409", r.status === 409, `HTTP ${r.status}`);
    v = await compraPeloLink(a2.id, codigo);
    checa("a rifa publicada com a v1 continua pagando a v1 (12%)", v.comissao?.pct === 12, String(v.comissao?.pct));
    const [aceite] = await db.execute(sql`select texto, versao from termo_aceites where versao = 1 limit 1`).then((x) => x.rows as { texto: string; versao: number }[]);
    checa("o aceite guarda a cópia do texto", Boolean(aceite?.texto?.includes("12% sobre o valor pago")));

    // O texto-base mudou (simulado: a versão em vigor com texto antigo): o
    // painel avisa e a organização publica a seguinte, sem mexer na antiga.
    r = await orgA.req("GET", "/api/admin/termo-afiliado");
    checa("termo recém-publicado não está desatualizado", r.json?.desatualizado === false, JSON.stringify(r.json?.desatualizado));
    await db.execute(sql`update organizacao_termos set texto = 'TERMO ANTIGO' where versao = 2 and organization_id = ${A.id}::uuid`);
    r = await orgA.req("GET", "/api/admin/termo-afiliado");
    checa("texto antigo em vigor: o painel avisa", r.json?.desatualizado === true && r.json?.termo?.versao === 2, JSON.stringify(r.json?.desatualizado));
    r = await orgA.req("POST", "/api/admin/termo-afiliado", { comissaoPct: 15, textoExtra: "" });
    checa("publicar a v3 com o mesmo percentual é aceito", r.status === 201 && r.json?.versao === 3, `HTTP ${r.status} ${r.json?.message ?? ""}`);
    checa("a v3 traz as cláusulas novas", /identificada como publicidade/.test(r.json?.texto ?? "") && /LGPD/.test(r.json?.texto ?? ""));
    r = await orgA.req("GET", "/api/admin/termo-afiliado");
    checa("e o aviso some", r.json?.desatualizado === false);
    const [v2] = await db.execute(sql`select texto from organizacao_termos where versao = 2 and organization_id = ${A.id}::uuid`).then((x) => x.rows as { texto: string }[]);
    checa("a v2 não foi reescrita", v2?.texto === "TERMO ANTIGO");

    // Cupom da A na rifa da B.
    r = await orgA.req("POST", "/api/admin/coupons", { code: "AFTESTEA", discountPct: 5, affiliateId: aff.id });
    checa("a A cria cupom para a afiliada", r.status === 201, `HTTP ${r.status} ${r.json?.message ?? ""}`);
    v = await compraPeloLink(b1.id, codigo, "AFTESTEA");
    checa("cupom da A não vale na rifa da B", v.status === 400 && /não vale/.test(v.message ?? ""), v.message);
    r = await orgB.req("DELETE", `/api/admin/coupons/${(await db.execute(sql`select id from coupons where code = 'AFTESTEA'`)).rows[0]?.id}`);
    checa("a B não apaga o cupom da A (404)", r.status === 404, `HTTP ${r.status}`);

    // As leituras da afiliada: só o que é dela, sem dado de comprador.
    r = await new Cliente().req("GET", "/api/affiliate/coupons");
    checa("cupons sem sessão: 401", r.status === 401, `HTTP ${r.status}`);
    r = await afiliada.req("GET", "/api/affiliate/coupons");
    checa(
      "a afiliada vê o cupom dela, e só os dela",
      r.status === 200 && r.json?.some((c: any) => c.code === "AFTESTEA") && r.json.every((c: any) => c.affiliateId === aff.id),
      JSON.stringify(r.json)?.slice(0, 120),
    );
    r = await afiliada.req("GET", "/api/affiliate/organizacoes");
    checa("as organizações dela trazem a A", r.status === 200 && JSON.stringify(r.json).includes(A.slug), `HTTP ${r.status}`);
    r = await afiliada.req("GET", "/api/affiliate/commissions");
    const linhas: any[] = r.json ?? [];
    checa("o extrato de comissões traz as vendas dela", r.status === 200 && linhas.length > 0, `HTTP ${r.status} ${linhas.length}`);
    checa("…quem comprou pelo link aparece só pelo primeiro nome", linhas.every((l) => !String(l.buyerName).includes(" ") && !JSON.stringify(l).includes("Teste")), JSON.stringify(linhas[0]));
    checa("…e cada comissão diz qual organização paga", linhas.every((l) => typeof l.organizacao === "string" && l.organizacao.length > 0));
    checa("…sem telefone nem CPF", !/phone|telefone|cpf/i.test(JSON.stringify(linhas)));

    // Saque por organização.
    await db.update(commissions).set({ status: "available" }).where(eq(commissions.affiliateId, aff.id));
    // A chave Pix é para onde vai o saque: sem a senha, a sessão sozinha não troca.
    r = await afiliada.req("PATCH", "/api/affiliate/pix-key", { pixKey: "golpe@exemplo.com" });
    checa("trocar a chave Pix sem a senha é recusado (401)", r.status === 401, `HTTP ${r.status}`);
    r = await afiliada.req("PATCH", "/api/affiliate/pix-key", { pixKey: "ana@exemplo.com", senha: SENHA });
    checa("com a senha, a chave Pix troca", r.status === 200, `HTTP ${r.status} ${r.json?.message ?? ""}`);
    r = await afiliada.req("GET", "/api/affiliate/saldo");
    const saldoA = r.json?.find((s: any) => s.organizacaoId === A.id);
    checa("saldo separado por organização", saldoA?.disponivelCents > 0 && !r.json?.some((s: any) => s.organizacaoId === B.id));
    await aprovarCadastroComCnpj(aff.id);
    r = await afiliada.req("POST", "/api/affiliate/payouts", { organizacaoId: A.id, notaFiscal: NOTA_DE_TESTE });
    checa("saque pedido à A", r.status === 201 && r.json?.organizationId === A.id && r.json?.amountCents === saldoA?.disponivelCents, `HTTP ${r.status} ${r.json?.message ?? ""}`);
    const saque = r.json?.id as string;
    r = await orgB.req("GET", "/api/admin/finance");
    checa("a B não vê o saque nem a comissão da A", !r.json?.payoutsRequested?.some((p: any) => p.id === saque) && !r.json?.perAffiliate?.some((p: any) => p.affiliateId === aff.id));
    r = await orgB.req("POST", `/api/admin/payouts/${saque}/paid`, {});
    checa("a B não dá baixa no saque da A (404)", r.status === 404, `HTTP ${r.status}`);
    r = await orgA.req("GET", "/api/admin/finance");
    checa("a A vê o saque dela", r.json?.payoutsRequested?.some((p: any) => p.id === saque));
    r = await orgA.req("POST", `/api/admin/payouts/${saque}/paid`, {});
    checa("e dá baixa", r.status === 200, `HTTP ${r.status}`);

    // Sair.
    r = await afiliada.req("DELETE", `/api/affiliate/organizacoes/${A.slug}`);
    checa("sai da A", r.status === 200);
    v = await compraPeloLink(a1.id, codigo);
    checa("depois de sair, o link não dá comissão", v.comissao === null);
    const [{ n: ganhas }] = await db.select({ n: sql<number>`count(*)::int` }).from(commissions).where(eq(commissions.affiliateId, aff.id));
    checa("o que já ganhou continua lá", ganhas >= 3, String(ganhas));

    // Seja um colaborador.
    const pessoa = new Cliente();
    r = await pessoa.req("POST", "/api/public/conta", { apelido: "tst" + Math.random().toString(36).replace(/[^a-z]/g, "").slice(0, 12) + "x", nome: "Bia Colaboradora", telefone: TEL_COLAB, cpf: "11144477735", cep: "01310-100", senha: SENHA, lembrar: true });
    if (r.status !== 201) throw new Error(`conta: HTTP ${r.status} ${r.json?.message ?? ""}`);
    r = await anon.req("POST", `/api/public/o/${A.slug}/colaborador`, { cidade: "Natal" });
    checa("sem entrar, não pede (401)", r.status === 401, `HTTP ${r.status}`);
    r = await pessoa.req("POST", `/api/public/o/${A.slug}/colaborador`, { cidade: "Natal", mensagem: "Vendo na feira." });
    checa("pede para ser colaboradora da A", r.status === 201, `HTTP ${r.status} ${r.json?.message ?? ""}`);
    r = await pessoa.req("POST", `/api/public/o/${A.slug}/colaborador`, { cidade: "Natal" });
    checa("um pedido em aberto por organização (409)", r.status === 409, `HTTP ${r.status}`);
    r = await orgB.req("GET", "/api/admin/colaboradores/pedidos");
    const pedidoNaB = r.json?.find((p: any) => p.nome === "Bia Colaboradora");
    checa("a B não vê o pedido feito à A", !pedidoNaB);
    r = await orgA.req("GET", "/api/admin/colaboradores/pedidos");
    const pedido = r.json?.find((p: any) => p.nome === "Bia Colaboradora");
    checa("a A vê o pedido, com nome e WhatsApp", pedido?.telefone === TEL_COLAB && pedido?.cidade === "Natal");
    r = await orgB.req("POST", `/api/admin/colaboradores/pedidos/${pedido?.id}`, { status: "recusado" });
    checa("a B não decide o pedido da A (404)", r.status === 404, `HTTP ${r.status}`);
    r = await orgA.req("POST", `/api/admin/colaboradores/pedidos/${pedido?.id}`, { status: "atendido" });
    checa("a A atende", r.status === 200);

    // Afiliado antigo (organização no usuário) vira vínculo.
    const [antigo] = await db
      .insert(users)
      .values({ role: "affiliate", organizationId: B.id, name: "Antigo", email: EMAILS[3], passwordHash: await hashPassword(SENHA) })
      .returning();
    const [affAntigo] = await db.insert(affiliates).values({ userId: antigo.id, code: "AFANTIGO", status: "active" }).returning();
    await migrarAfiliadosAntigos();
    const [vAntigo] = await db
      .select()
      .from(afiliadoVinculos)
      .where(and(eq(afiliadoVinculos.affiliateId, affAntigo.id), eq(afiliadoVinculos.organizationId, B.id)));
    checa("o afiliado antigo ganha o vínculo aprovado com a organização dele", vAntigo?.status === "aprovado");
    v = await compraPeloLink(b1.id, "AFANTIGO");
    checa("e segue recebendo na rifa dela", v.comissao?.pct === 10, String(v.comissao?.pct));
    v = await compraPeloLink(a1.id, "AFANTIGO");
    checa("mas não na rifa de outra organização", v.comissao === null);

    await auditoriaDoAcesso(A, B, orgA, orgB, a1, b1);
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
