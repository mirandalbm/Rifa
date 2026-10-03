/**
 * Prova do banner de divulgação da rifa, contra a API de verdade:
 * - a organização grava, troca a descrição e retira, no recorte (o vizinho é 404);
 * - a imagem é reprocessada (WebP 1200×400) e a descrição segue a régua da
 *   legenda (sem link e sem telefone);
 * - o público só vê com a rifa no ar: rascunho e promotora arquivada são 404;
 * - muda depois de publicar (não é termo da rifa).
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
  console.log("\n=== banner de divulgação da rifa ===\n");
  await limpar();
  const orgs: { id: string }[] = [];
  const clientes: Cliente[] = [];
  for (const [i, slug] of SLUGS.entries()) {
    const [o] = await db
      .insert(organizations)
      .values({ slug, name: `Banner ${i ? "B" : "A"}`, cidade: "Natal", uf: "RN", telefoneConfirmadoEm: new Date(), telefoneAprovadoEm: new Date() })
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

  try {
    const a1 = await novoRascunho(orgs[0].id, "a1");
    const rota = `/api/admin/campaigns/${a1.id}/banner-divulgacao`;
    const publico = `/api/public/campaigns/${a1.slug}/banner-divulgacao`;

    // ------------------------------------------------ recusas
    let r = await orgA.req("PUT", rota, { titulo: "Instituto Esperança" });
    checa("sem imagem e sem banner gravado: 422", r.status === 422, `HTTP ${r.status}`);
    r = await orgA.req("PUT", rota, { titulo: "Ligue 11 98765-4321", imagem });
    checa("descrição com telefone: 422", r.status === 422, `HTTP ${r.status} ${r.json?.message ?? ""}`);
    r = await orgA.req("PUT", rota, { titulo: "ok", imagem });
    checa("descrição curta demais: 422", r.status === 422, `HTTP ${r.status}`);
    r = await orgA.req("PUT", rota, { titulo: "Instituto Esperança", imagem: "data:text/html;base64,PGgxPg==" });
    checa("o que não é imagem: 422", r.status === 422, `HTTP ${r.status}`);
    r = await orgB.req("PUT", rota, { titulo: "Invasão", imagem });
    checa("a organização B não grava na rifa da A (404)", r.status === 404, `HTTP ${r.status}`);
    r = await new Cliente().req("PUT", rota, { titulo: "Invasão", imagem });
    checa("sem sessão: recusado", r.status === 401 || r.status === 403, `HTTP ${r.status}`);

    // ------------------------------------------------ gravar no rascunho
    r = await orgA.req("PUT", rota, { titulo: "Instituto Esperança", imagem });
    checa("a organização grava o banner no rascunho", r.status === 200 && r.json?.titulo === "Instituto Esperança", `HTTP ${r.status} ${r.json?.message ?? ""}`);
    r = await orgA.req("GET", rota);
    checa("o painel vê a descrição e o endereço da imagem", r.status === 200 && r.json?.titulo === "Instituto Esperança" && /banner-divulgacao\/imagem/.test(r.json?.imagem ?? ""));
    const img = await fetch(URL + r.json.imagem, { headers: { Cookie: orgA.cookie } });
    const meta = await sharp(Buffer.from(await img.arrayBuffer())).metadata();
    checa("a imagem é reprocessada: WebP 1200×400", img.status === 200 && meta.format === "webp" && meta.width === 1200 && meta.height === 400, `${img.status} ${meta.format} ${meta.width}x${meta.height}`);
    r = await orgB.req("GET", rota);
    checa("a organização B não lê o banner da A (404)", r.status === 404, `HTTP ${r.status}`);
    const imgB = await fetch(`${URL}${rota}/imagem`, { headers: { Cookie: orgB.cookie } });
    checa("nem a imagem pelo painel (404)", imgB.status === 404, `HTTP ${imgB.status}`);
    let p = await fetch(URL + publico);
    checa("rascunho: a imagem pública é 404", p.status === 404, `HTTP ${p.status}`);

    // ------------------------------------------------ no ar
    await db.update(campaigns).set({ status: "published", publishedAt: new Date() }).where(eq(campaigns.id, a1.id));
    let pag = await new Cliente().req("GET", `/api/public/campaigns/${a1.slug}`);
    const url = pag.json?.campaign?.bannerDivulgacao?.url as string | undefined;
    checa("publicada: a página traz o banner e a descrição", pag.status === 200 && Boolean(url) && pag.json.campaign.bannerDivulgacao.titulo === "Instituto Esperança", JSON.stringify(pag.json?.campaign?.bannerDivulgacao));
    p = await fetch(URL + (url ?? publico));
    checa("e a imagem pública abre (WebP)", p.status === 200 && (p.headers.get("content-type") ?? "").includes("webp"), `HTTP ${p.status}`);
    r = await orgA.req("PUT", rota, { titulo: "ONG Amigos do Bairro" });
    checa("depois de publicar, a descrição muda (não é termo da rifa)", r.status === 200, `HTTP ${r.status}`);
    pag = await new Cliente().req("GET", `/api/public/campaigns/${a1.slug}`);
    checa("e a página mostra a nova", pag.json?.campaign?.bannerDivulgacao?.titulo === "ONG Amigos do Bairro");
    await db.update(organizations).set({ archivedAt: new Date() }).where(eq(organizations.id, orgs[0].id));
    p = await fetch(URL + publico);
    checa("promotora arquivada: a imagem pública some (404)", p.status === 404, `HTTP ${p.status}`);
    await db.update(organizations).set({ archivedAt: null }).where(eq(organizations.id, orgs[0].id));

    // ------------------------------------------------ retirar
    r = await orgB.req("DELETE", rota);
    checa("a organização B não retira o da A (404)", r.status === 404, `HTTP ${r.status}`);
    r = await orgA.req("DELETE", rota);
    pag = await new Cliente().req("GET", `/api/public/campaigns/${a1.slug}`);
    p = await fetch(URL + publico);
    checa("retirado: a página fica sem banner e a imagem some", r.status === 204 && pag.json?.campaign?.bannerDivulgacao === null && p.status === 404, `HTTP ${r.status} ${p.status}`);
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
