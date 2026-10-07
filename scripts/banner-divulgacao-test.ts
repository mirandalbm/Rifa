/**
 * Prova da entidade beneficiada pela rifa (o banner e a tela dela), contra a
 * API de verdade:
 * - a organização grava, muda e retira, no recorte (o vizinho é 404);
 * - as imagens são reprocessadas (banner WebP 1200×400 e a grande inteira);
 * - nome e texto sem link e sem telefone; site só https; cada rede só no
 *   domínio dela, e WhatsApp fica de fora;
 * - o público só vê com a rifa no ar: rascunho e promotora arquivada são 404;
 * - muda depois de publicar (não é termo da rifa);
 * - só aparece com os documentos conferidos pela plataforma (resposta 2.5:
 *   CNPJ ativo, ata e certidão; CEBAS opcional), cifrados, com a auditoria
 *   antes de cada leitura; trocar nome, CNPJ ou documento volta à análise.
 */
import "dotenv/config";
import { baseUrl } from "./base-url";
import { and, eq, inArray, sql } from "drizzle-orm";
import { db, pool } from "../server/db";
import { hashPassword } from "../server/auth";
import sharp from "sharp";
import { campaignMedia, campaigns, organizations, users } from "../shared/schema";

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

const SLUGS = ["banner-div-teste-a", "banner-div-teste-b"];
const EMAILS = ["banner-div-org-a@teste.rifa", "banner-div-org-b@teste.rifa"];
const SENHA = "senha-banner-div-1";
const daqui = (ms: number) => new Date(Date.now() + ms).toISOString();
const HORA = 3_600_000;

async function limpar() {
  const orgs = await db.select({ id: organizations.id }).from(organizations).where(inArray(organizations.slug, SLUGS));
  const ids = orgs.map((o) => o.id);
  if (ids.length) {
    const cs = (await db.select({ id: campaigns.id }).from(campaigns).where(inArray(campaigns.organizationId, ids))).map((c) => c.id);
    if (cs.length) {
      const l = sql.raw(`('${cs.join("','")}')`);
      await db.execute(sql`delete from draws where campaign_id in ${l}`);
      await db.execute(sql`delete from campaign_stats where campaign_id in ${l}`);
    }
    await db.delete(campaigns).where(inArray(campaigns.organizationId, ids));
  }
  await db.delete(users).where(inArray(users.email, EMAILS));
  if (ids.length) await db.delete(organizations).where(inArray(organizations.id, ids));
  await db.execute(sql`delete from rate_events where bucket like 'login:%'`);
  await db.execute(sql`delete from entidade_documentos where campaign_id not in (select id from campaigns)`);
}

async function novoRascunho(orgId: string, sufixo: string, opcoes: { semBanner?: boolean; drawEm?: number } = {}) {
  const [c] = await db
    .insert(campaigns)
    .values({
      organizationId: orgId,
      slug: `banner-div-teste-${sufixo}`,
      title: `Rifa ${sufixo}`,
      prizeTitle: `Prêmio ${sufixo}`,
      totalQuotas: 1000,
      priceCents: 1000,
      commissionPctDefault: 10,
      status: "draft",
      drawAt: new Date(Date.now() + (opcoes.drawEm ?? 20 * 24 * HORA)),
      authorizationCode: `SPA-BD-${sufixo}`,
      authorizationFileKey: "certificado-teste",
    })
    .returning();
  await db.insert(campaignMedia).values([
    ...(opcoes.semBanner ? [] : [{ campaignId: c.id, role: "banner" as const, storageKey: `x-${sufixo}`, mime: "image/webp", status: "ready" as const }]),
    { campaignId: c.id, role: "photo", storageKey: `y-${sufixo}`, mime: "image/webp", status: "ready", position: 1 },
  ]);
  return c;
}


async function main() {
  console.log("\n=== entidade beneficiada da rifa ===\n");
  await limpar();
  const orgs: { id: string }[] = [];
  const clientes: Cliente[] = [];
  for (const [i, slug] of SLUGS.entries()) {
    const [o] = await db
      .insert(organizations)
      .values({ slug, name: `Banner ${i ? "B" : "A"}`, cidade: "Natal", uf: "RN", telefoneConfirmadoEm: new Date(), telefoneAprovadoEm: new Date(), sociosDeclaradosEm: new Date() })
      .returning();
    await db
      .insert(users)
      .values({ role: "organizer", organizationId: o.id, name: `Org ${i}`, email: EMAILS[i], passwordHash: await hashPassword(SENHA) });
    orgs.push(o);
    const c = new Cliente();
    const l = await c.req("POST", "/api/auth/login", { email: EMAILS[i], password: SENHA });
    if (l.status !== 200) throw new Error(`login da organização ${i}: HTTP ${l.status}`);
    clientes.push(c);
  }
  const [orgA, orgB] = clientes;
  const png = await sharp({ create: { width: 900, height: 900, channels: 3, background: "#1b6b3a" } }).png().toBuffer();
  const imagem = `data:image/png;base64,${png.toString("base64")}`;

  const admin = new Cliente();
  if ((await admin.req("POST", "/api/auth/login", { email: "admin@rifa.br", password: "admin123" })).status !== 200) throw new Error("login da plataforma");
  const pdf = `data:application/pdf;base64,${Buffer.from("%PDF-1.4\n%teste\n").toString("base64")}`;

  const base = {
    nome: "Instituto Esperança",
    cnpj: "11.222.333/0001-81",
    texto: "Atendemos 200 crianças no contraturno escolar desde 2012, com reforço, esporte e alimentação.",
    site: "https://institutoesperanca.org.br",
    redes: [
      { rede: "instagram", link: "https://instagram.com/institutoesperanca" },
      { rede: "youtube", link: "" },
    ],
  };
  try {
    const a1 = await novoRascunho(orgs[0].id, "a1");
    const rota = `/api/admin/campaigns/${a1.id}/banner-divulgacao`;
    const publico = `/api/public/campaigns/${a1.slug}/banner-divulgacao`;

    // ------------------------------------------------ recusas
    let r = await orgA.req("PUT", rota, base);
    checa("sem imagem e sem entidade gravada: 422", r.status === 422, `HTTP ${r.status}`);
    const recusas: [string, Record<string, unknown>][] = [
      ["nome com telefone", { ...base, nome: "Ligue 11 98765-4321" }],
      ["texto com link", { ...base, texto: "Doe pelo site www.golpe.com.br e ajude a nossa causa" }],
      ["texto curto demais", { ...base, texto: "Ajude" }],
      ["site em http", { ...base, site: "http://institutoesperanca.org.br" }],
      ["Instagram de outro domínio", { ...base, redes: [{ rede: "instagram", link: "https://golpe.com/x" }] }],
      ["WhatsApp (fora da lista)", { ...base, redes: [{ rede: "whatsapp", link: "https://wa.me/5511987654321" }] }],
      ["site que é WhatsApp", { ...base, site: "https://wa.me/5511987654321" }],
      ["site que é Telegram", { ...base, site: "https://t.me/fulano" }],
      ["site com telefone no endereço", { ...base, site: "https://exemplo.com.br/fale?tel=11987654321" }],
      ["site que é IP", { ...base, site: "https://192.168.0.1" }],
      ["CNPJ com dígito errado", { ...base, cnpj: "11.222.333/0001-80" }],
      ["sem CNPJ", { ...base, cnpj: "" }],
    ];
    for (const [nome, corpo] of recusas) {
      r = await orgA.req("PUT", rota, { ...corpo, imagem });
      checa(`${nome}: 422`, r.status === 422, `HTTP ${r.status} ${r.json?.message ?? ""}`);
    }
    r = await orgA.req("PUT", rota, { ...base, imagem: "data:text/html;base64,PGgxPg==" });
    checa("o que não é imagem: 422", r.status === 422, `HTTP ${r.status}`);
    r = await orgB.req("PUT", rota, { ...base, imagem });
    checa("a organização B não grava na rifa da A (404)", r.status === 404, `HTTP ${r.status}`);
    r = await new Cliente().req("PUT", rota, { ...base, imagem });
    checa("sem sessão: recusado", r.status === 401 || r.status === 403, `HTTP ${r.status}`);

    // ------------------------------------------------ gravar no rascunho
    r = await orgA.req("PUT", rota, { ...base, imagem, intrusa: "x" });
    checa(
      "a organização grava a entidade (rede vazia some, chave estranha ignorada)",
      r.status === 200 && r.json?.nome === base.nome && r.json?.redes?.length === 1 && r.json?.intrusa === undefined,
      `HTTP ${r.status} ${JSON.stringify(r.json)}`,
    );
    r = await orgA.req("GET", rota);
    checa(
      "o painel vê os dados e o endereço da imagem",
      r.status === 200 && r.json?.texto === base.texto && r.json?.site === `${base.site}/` && /banner-divulgacao\/imagem/.test(r.json?.imagem ?? ""),
    );
    const img = await fetch(URL + r.json.imagem, { headers: { Cookie: orgA.cookie } });
    const meta = await sharp(Buffer.from(await img.arrayBuffer())).metadata();
    checa("o banner é reprocessado: WebP 1200×400", img.status === 200 && meta.format === "webp" && meta.width === 1200 && meta.height === 400, `${img.status} ${meta.format} ${meta.width}x${meta.height}`);
    r = await orgB.req("GET", rota);
    checa("a organização B não lê a entidade da A (404)", r.status === 404, `HTTP ${r.status}`);
    const imgB = await fetch(`${URL}${rota}/imagem`, { headers: { Cookie: orgB.cookie } });
    checa("nem a imagem pelo painel (404)", imgB.status === 404, `HTTP ${imgB.status}`);
    let p = await fetch(URL + publico);
    checa("rascunho: a imagem pública é 404", p.status === 404, `HTTP ${p.status}`);

    // ------------------------------------------------ documentos (2.5)
    await db.update(campaigns).set({ status: "published", publishedAt: new Date() }).where(eq(campaigns.id, a1.id));
    let pag = await new Cliente().req("GET", `/api/public/campaigns/${a1.slug}`);
    checa("publicada sem documentos: a entidade não aparece", pag.status === 200 && pag.json?.campaign?.bannerDivulgacao === null, JSON.stringify(pag.json?.campaign?.bannerDivulgacao));
    p = await fetch(URL + publico);
    checa("nem a imagem pública (404)", p.status === 404, `HTTP ${p.status}`);
    r = await orgA.req("GET", rota);
    checa("o painel diz: falta documento", r.json?.documentos === "pendente" && r.json?.cnpj === "11222333000181", JSON.stringify(r.json?.documentos));
    const docs = `${rota}/documentos`;
    r = await orgA.req("PUT", `${docs}/rg`, { arquivo: pdf });
    checa("tipo de documento desconhecido: 400", r.status === 400, `HTTP ${r.status}`);
    r = await orgA.req("PUT", `${docs}/cnpj`, { arquivo: "data:text/html;base64,PGgxPg==" });
    checa("o que não é foto nem PDF: 400", r.status === 400, `HTTP ${r.status}`);
    r = await orgB.req("PUT", `${docs}/cnpj`, { arquivo: pdf });
    checa("a organização B não envia documento na rifa da A (404)", r.status === 404, `HTTP ${r.status}`);
    r = await orgA.req("PUT", `${docs}/cnpj`, { arquivo: pdf });
    checa("o comprovante do CNPJ entra (ainda falta documento)", r.status === 200 && r.json?.documentos === "pendente", JSON.stringify(r.json));
    r = await orgA.req("PUT", `${docs}/ata`, { arquivo: pdf });
    r = await orgA.req("PUT", `${docs}/certidao`, { arquivo: `data:image/png;base64,${png.toString("base64")}` });
    checa("com CNPJ, ata e certidão: vai para análise (o CEBAS é opcional)", r.status === 200 && r.json?.documentos === "em_analise", JSON.stringify(r.json));
    const [cifrado] = (await db.execute(sql`select dados from entidade_documentos where campaign_id = ${a1.id} and tipo = 'cnpj'`)).rows as { dados: Buffer }[];
    checa("o documento fica cifrado no banco", !Buffer.from(cifrado.dados).toString("latin1").includes("%PDF"));
    pag = await new Cliente().req("GET", `/api/public/campaigns/${a1.slug}`);
    checa("em análise: a entidade ainda não aparece", pag.json?.campaign?.bannerDivulgacao === null);

    r = await orgA.req("GET", "/api/admin/entidades");
    checa("a fila é só da plataforma (organização: 403)", r.status === 403, `HTTP ${r.status}`);
    r = await orgA.req("GET", `/api/admin/entidades/${a1.id}/documentos/cnpj`);
    checa("nem o documento pela rota da plataforma (403)", r.status === 403, `HTTP ${r.status}`);
    r = await orgA.req("POST", `/api/admin/entidades/${a1.id}/decidir`, { status: "aprovado", versao: new Date().toISOString() });
    checa("nem decide (403)", r.status === 403, `HTTP ${r.status}`);
    r = await admin.req("GET", "/api/admin/entidades");
    const naFila = (r.json as { campaignId: string; versao: string; cnpj: string; documentos: { tipo: string }[] }[]).find((l) => l.campaignId === a1.id);
    checa("a plataforma vê na fila, com os três documentos (sem o conteúdo)", Boolean(naFila) && naFila!.documentos.length === 3 && !JSON.stringify(naFila).includes("dados"), JSON.stringify(naFila));
    const caixa = await admin.req("GET", "/api/admin/caixa-de-entrada");
    checa("e na Caixa de entrada, sem o CNPJ", JSON.stringify(caixa.json).includes(`entidade:${a1.id}`) && !JSON.stringify(caixa.json).includes("11222333000181"));
    const antesAudit = Number(((await db.execute(sql`select count(*)::int as n from audit_log where action = 'entidade.documento.ler' and entity_id = ${a1.id}`)).rows[0] as { n: number }).n);
    const doc = await fetch(`${URL}/api/admin/entidades/${a1.id}/documentos/cnpj`, { headers: { Cookie: admin.cookie } });
    const corpoDoc = Buffer.from(await doc.arrayBuffer()).toString("latin1");
    const depoisAudit = Number(((await db.execute(sql`select count(*)::int as n from audit_log where action = 'entidade.documento.ler' and entity_id = ${a1.id}`)).rows[0] as { n: number }).n);
    checa("a plataforma abre o documento decifrado, sem cache, e a leitura vai à auditoria", doc.status === 200 && corpoDoc.startsWith("%PDF") && doc.headers.get("cache-control") === "no-store" && depoisAudit === antesAudit + 1);
    r = await admin.req("POST", `/api/admin/entidades/${a1.id}/decidir`, { status: "recusado", versao: naFila!.versao });
    checa("recusar sem motivo: 422", r.status === 422, `HTTP ${r.status}`);
    r = await admin.req("POST", `/api/admin/entidades/${a1.id}/decidir`, { status: "aprovado", versao: new Date(Date.now() - 86_400_000).toISOString() });
    checa("decidir outra versão (documento mudou no meio): 409", r.status === 409, `HTTP ${r.status}`);
    const [d1, d2] = await Promise.all([
      admin.req("POST", `/api/admin/entidades/${a1.id}/decidir`, { status: "aprovado", versao: naFila!.versao }),
      admin.req("POST", `/api/admin/entidades/${a1.id}/decidir`, { status: "aprovado", versao: naFila!.versao }),
    ]);
    checa("dois cliques: uma decisão e um 409", [d1.status, d2.status].sort().join() === "200,409", `${d1.status} ${d2.status}`);

    // ------------------------------------------------ no ar
    pag = await new Cliente().req("GET", `/api/public/campaigns/${a1.slug}`);
    const e = pag.json?.campaign?.bannerDivulgacao;
    checa(
      "publicada: a página traz a entidade (nome, texto, site, redes e as duas imagens)",
      pag.status === 200 && e?.nome === base.nome && e?.texto === base.texto && e?.site === `${base.site}/` && e?.redes?.[0]?.rede === "instagram" && Boolean(e?.url) && /tam=grande/.test(e?.urlGrande ?? ""),
      JSON.stringify(e),
    );
    p = await fetch(URL + e.url);
    checa("a imagem do banner abre (WebP, cache privado)", p.status === 200 && (p.headers.get("content-type") ?? "").includes("webp") && /private/.test(p.headers.get("cache-control") ?? ""), `HTTP ${p.status}`);
    p = await fetch(URL + e.urlGrande);
    const grande = await sharp(Buffer.from(await p.arrayBuffer())).metadata();
    checa("a imagem grande vem inteira (900×900, sem corte)", p.status === 200 && grande.width === 900 && grande.height === 900, `${grande.width}x${grande.height}`);
    r = await orgA.req("PUT", rota, { ...base, texto: `${base.texto} Novo.`, site: "", redes: [] });
    checa("depois de publicar, a entidade muda; texto, site e redes não reabrem a análise", r.status === 200 && r.json?.documentos === "aprovado", JSON.stringify(r.json?.documentos));
    r = await orgA.req("PUT", rota, { ...base, nome: "ONG Amigos do Bairro", site: "", redes: [] });
    checa("trocar o nome volta à análise", r.status === 200 && r.json?.documentos === "em_analise", JSON.stringify(r.json?.documentos));
    pag = await new Cliente().req("GET", `/api/public/campaigns/${a1.slug}`);
    checa("e a entidade sai da página até a plataforma conferir de novo", pag.json?.campaign?.bannerDivulgacao === null);
    r = await admin.req("GET", "/api/admin/entidades");
    const versao2 = (r.json as { campaignId: string; versao: string }[]).find((l) => l.campaignId === a1.id)?.versao;
    r = await admin.req("POST", `/api/admin/entidades/${a1.id}/decidir`, { status: "recusado", motivo: "A ata está vencida.", versao: versao2 });
    r = await orgA.req("GET", rota);
    checa("recusada: a organização lê o motivo", r.json?.documentos === "recusado" && r.json?.motivo === "A ata está vencida.", JSON.stringify(r.json?.motivo));
    r = await orgA.req("PUT", `${docs}/ata`, { arquivo: pdf });
    checa("mandar o documento de novo volta à análise", r.json?.documentos === "em_analise", JSON.stringify(r.json));
    r = await admin.req("GET", "/api/admin/entidades");
    const versao3 = (r.json as { campaignId: string; versao: string }[]).find((l) => l.campaignId === a1.id)?.versao;
    r = await admin.req("POST", `/api/admin/entidades/${a1.id}/decidir`, { status: "aprovado", versao: versao3 });
    checa("aprovada de novo", r.status === 200, `HTTP ${r.status}`);
    pag = await new Cliente().req("GET", `/api/public/campaigns/${a1.slug}`);
    checa(
      "e a página mostra a nova (sem site e sem redes)",
      pag.json?.campaign?.bannerDivulgacao?.nome === "ONG Amigos do Bairro" && pag.json.campaign.bannerDivulgacao.site === null && pag.json.campaign.bannerDivulgacao.redes.length === 0,
    );
    await db.update(organizations).set({ archivedAt: new Date() }).where(eq(organizations.id, orgs[0].id));
    p = await fetch(URL + publico);
    checa("promotora arquivada: a imagem pública some (404)", p.status === 404, `HTTP ${p.status}`);
    await db.update(organizations).set({ archivedAt: null, banidaEm: new Date() }).where(eq(organizations.id, orgs[0].id));
    pag = await new Cliente().req("GET", `/api/public/campaigns/${a1.slug}`);
    checa("promotora banida: a página não entrega a entidade", pag.status === 404 || pag.json?.campaign?.bannerDivulgacao === null, `HTTP ${pag.status}`);
    await db.update(organizations).set({ banidaEm: null }).where(eq(organizations.id, orgs[0].id));
    await db.update(organizations).set({ archivedAt: null }).where(eq(organizations.id, orgs[0].id));

    // ------------------------------------------------ retirar
    r = await orgB.req("DELETE", rota);
    checa("a organização B não retira a da A (404)", r.status === 404, `HTTP ${r.status}`);
    r = await orgA.req("DELETE", rota);
    pag = await new Cliente().req("GET", `/api/public/campaigns/${a1.slug}`);
    p = await fetch(URL + publico);
    checa("retirada: a página fica sem entidade e a imagem some", r.status === 204 && pag.json?.campaign?.bannerDivulgacao === null && p.status === 404, `HTTP ${r.status} ${p.status}`);
    const sobra = (await db.execute(sql`select count(*)::int as n from entidade_documentos where campaign_id = ${a1.id}`)).rows[0] as { n: number };
    checa("e os documentos saem junto", Number(sobra.n) === 0, `${sobra.n}`);
  } finally {
    await limpar();
  }
  console.log(falhas ? `\n  ${falhas} falha(s)\n` : "\n  tudo certo\n");
  await pool.end();
  process.exit(falhas ? 1 : 0);
}

main().catch(async (e) => {
  console.error(e);
  await limpar().catch(() => {});
  await pool.end();
  process.exit(1);
});
