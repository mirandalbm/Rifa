/**
 * Prova dos anexos do contrato por modalidade (cláusula 7), contra a API e o
 * banco:
 * - só a plataforma publica anexo e vê a prévia (403 para organizador); só a
 *   organização aceita (403 para a plataforma);
 * - a rifa exige o anexo da modalidade que ela usa, lida dos dados dela: a da
 *   Loteria Federal pede o anexo da Federal, a com cota premiada pede o do
 *   vale-brinde; a do globo não pede o da Federal;
 * - aceito, publica, e a rifa grava as versões que valiam; versão nova pede
 *   aceite de novo e não mexe na rifa já publicada;
 * - na rifa já no ar, a primeira cota premiada e a entidade beneficiada nova
 *   exigem o anexo delas (409) e, aceito, ligam a versão à rifa;
 * - o aceite de uma organização não libera a outra; cinco aceites ao mesmo
 *   tempo são um só, com a impressão do texto.
 *
 *   npm run anexos      (com `npm run dev` no ar e o seed aplicado)
 */
import "dotenv/config";
import { createHash } from "node:crypto";
import sharp from "sharp";
import { baseUrl } from "./base-url";
import { and, eq, inArray, notInArray, sql } from "drizzle-orm";
import { db, pool } from "../server/db";
import { hashPassword } from "../server/auth";
import {
  campaignMedia,
  campaigns,
  contratoAnexoAceites,
  contratoAnexos,
  contratoPromotoraAceites,
  contratosPromotora,
  organizations,
  prizedQuotas,
  users,
} from "../shared/schema";

const URL = baseUrl();
const sha256 = (t: string) => createHash("sha256").update(t, "utf8").digest("hex");
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

const SLUGS = ["anexos-teste-a", "anexos-teste-b"];
const EMAILS = ["anexos-org-a@teste.rifa", "anexos-org-b@teste.rifa"];
const SENHA = "senha-anexos-1";
const DIA = 86_400_000;
const TEXTO = (n: string) => `ANEXO DE TESTE ${n}. ${"Regra específica da modalidade, só para a prova. ".repeat(3).trim()}`;

async function limpar(anexosDaProva: string[]) {
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
    await db.delete(contratoAnexoAceites).where(inArray(contratoAnexoAceites.organizationId, ids));
    await db.delete(contratoPromotoraAceites).where(inArray(contratoPromotoraAceites.organizationId, ids));
  }
  if (anexosDaProva.length) {
    await db.delete(contratoAnexoAceites).where(inArray(contratoAnexoAceites.anexoId, anexosDaProva));
    await db.delete(contratoAnexos).where(inArray(contratoAnexos.id, anexosDaProva));
  }
  await db.delete(users).where(inArray(users.email, EMAILS));
  if (ids.length) await db.delete(organizations).where(inArray(organizations.id, ids));
  await db.execute(sql`delete from rate_events where bucket like 'login:%'`);
}

async function rascunho(orgId: string, sufixo: string, metodo: string) {
  const [c] = await db
    .insert(campaigns)
    .values({
      organizationId: orgId,
      slug: `anexos-teste-${sufixo}`,
      title: `Rifa ${sufixo}`,
      prizeTitle: `Moto ${sufixo}`,
      totalQuotas: 1000,
      priceCents: 1000,
      commissionPctDefault: 10,
      status: "draft",
      drawAt: new Date(Date.now() + 20 * DIA),
      authorizationCode: `SPA-AX-${sufixo}`,
      authorizationFileKey: "certificado-teste",
      metodoApuracao: metodo,
    })
    .returning();
  await db.insert(campaignMedia).values([
    { campaignId: c.id, role: "banner", storageKey: `ax-b-${sufixo}`, mime: "image/webp", status: "ready" },
    { campaignId: c.id, role: "photo", storageKey: `ax-f-${sufixo}`, mime: "image/webp", status: "ready", position: 1 },
  ]);
  return c;
}

const idsDaRifa = async (id: string) => (await db.select({ a: campaigns.contratoAnexoIds }).from(campaigns).where(eq(campaigns.id, id)))[0]?.a ?? [];
const idDoAnexo = async (modalidade: string, versao: number) =>
  (await db.select({ id: contratoAnexos.id }).from(contratoAnexos).where(and(eq(contratoAnexos.modalidade, modalidade), eq(contratoAnexos.versao, versao))))[0]?.id;

async function main() {
  console.log("\n=== anexos do contrato por modalidade ===\n");
  const antes = (await db.select({ id: contratoAnexos.id }).from(contratoAnexos)).map((a) => a.id);
  const daProva = async () =>
    (await db.select({ id: contratoAnexos.id }).from(contratoAnexos).where(antes.length ? notInArray(contratoAnexos.id, antes) : sql`true`)).map((a) => a.id);
  await limpar([]);

  const orgs: { id: string }[] = [];
  const clientes: Cliente[] = [];
  for (const [i, slug] of SLUGS.entries()) {
    const [o] = await db
      .insert(organizations)
      .values({ slug, name: `Anexos ${i ? "B" : "A"}`, cidade: "Natal", uf: "RN", telefoneConfirmadoEm: new Date(), telefoneAprovadoEm: new Date() })
      .returning();
    await db.insert(users).values({ role: "organizer", organizationId: o.id, name: `Org ${i ? "B" : "A"}`, email: EMAILS[i], passwordHash: await hashPassword(SENHA) });
    orgs.push(o);
    const c = new Cliente();
    const l = await c.req("POST", "/api/auth/login", { email: EMAILS[i], password: SENHA });
    if (l.status !== 200) throw new Error(`login da organização ${i}: HTTP ${l.status}`);
    clientes.push(c);
    // Se já houver contrato-base em vigor no banco, a organização da prova o aceita: aqui o assunto são os anexos.
    const [vigor] = await db.select().from(contratosPromotora).orderBy(sql`versao desc`).limit(1);
    if (vigor) await c.req("POST", "/api/admin/contrato-promotora/aceite", { versao: vigor.versao });
  }
  const [orgA, orgB] = clientes;
  const plataforma = new Cliente();
  const lp = await plataforma.req("POST", "/api/auth/login", {
    email: process.env.SEED_ADMIN_EMAIL ?? "admin@rifa.br",
    password: process.env.SEED_ADMIN_PASSWORD ?? "admin123",
  });
  if (lp.status !== 200) throw new Error(`login da plataforma: HTTP ${lp.status}`);

  try {
    // ------------------------------------------------ quem pode o quê
    const anexo = (modalidade: string, n = "1") => ({ modalidade, titulo: `Anexo ${modalidade} ${n}`, texto: TEXTO(`${modalidade} ${n}`) });
    let r = await orgA.req("POST", "/api/admin/contrato-promotora/anexos", anexo("federal"));
    checa("organizador não publica anexo (403)", r.status === 403, `HTTP ${r.status}`);
    r = await orgA.req("POST", "/api/admin/contrato-promotora/anexos/previa", anexo("federal"));
    checa("organizador não vê a prévia do anexo (403)", r.status === 403, `HTTP ${r.status}`);
    r = await plataforma.req("POST", "/api/admin/contrato-promotora/anexos", { ...anexo("federal"), modalidade: "filantropia" });
    checa("modalidade que o sistema não conhece: 400", r.status === 400, `HTTP ${r.status}`);

    const vers: Record<string, number> = {};
    for (const m of ["federal", "vale_brinde", "entidade"]) {
      r = await plataforma.req("POST", "/api/admin/contrato-promotora/anexos", anexo(m));
      vers[m] = r.json?.versao;
      checa(`a plataforma publica o anexo ${m}`, r.status === 201 && Number.isInteger(vers[m]), `HTTP ${r.status} ${r.json?.message ?? ""}`);
    }
    r = await plataforma.req("POST", "/api/admin/contrato-promotora/anexos", anexo("federal"));
    checa("o mesmo texto não vira versão nova (409)", r.status === 409, `HTTP ${r.status}`);
    r = await plataforma.req("POST", "/api/admin/contrato-promotora/anexos/aceite", { modalidade: "federal", versao: vers.federal });
    checa("a plataforma não aceita (403)", r.status === 403, `HTTP ${r.status}`);

    // ------------------------------------------------ a rifa exige o anexo da modalidade dela
    const federal = await rascunho(orgs[0].id, "a1", "federal_direta");
    r = await orgA.req("POST", `/api/admin/campaigns/${federal.id}/publish`);
    checa(
      "rifa da Federal sem o anexo da Federal não publica (422, diz qual)",
      r.status === 422 && /Anexo federal 1/.test(r.json?.message ?? ""),
      `HTTP ${r.status} ${r.json?.message ?? ""}`,
    );
    const globo = await rascunho(orgs[0].id, "a2", "globo");
    const pc = await orgA.req("GET", `/api/admin/campaigns/${globo.id}/blockers`);
    const motivos = JSON.stringify(pc.json ?? {});
    checa("a rifa do globo não pede o anexo da Federal", !/Anexo federal/.test(motivos), motivos.slice(0, 160));

    const g = await orgA.req("GET", "/api/admin/contrato-promotora");
    const doFederal = (g.json?.anexos ?? []).find((a: { modalidade: string }) => a.modalidade === "federal");
    checa("a organização vê o anexo, quando ele vale e a pendência", doFederal?.aceitoEm === null && /Loteria Federal/.test(doFederal?.quando ?? ""));

    const cinco = await Promise.all(
      Array.from({ length: 5 }, () => orgA.req("POST", "/api/admin/contrato-promotora/anexos/aceite", { modalidade: "federal", versao: vers.federal })),
    );
    checa("cinco aceites ao mesmo tempo respondem 200", cinco.every((x) => x.status === 200), cinco.map((x) => x.status).join(","));
    const aceites = await db.select().from(contratoAnexoAceites).where(eq(contratoAnexoAceites.organizationId, orgs[0].id));
    checa("…e viram um aceite só, com a cópia e a impressão do texto", aceites.length === 1 && aceites[0].textoSha256 === sha256(aceites[0].texto));
    r = await orgA.req("POST", "/api/admin/contrato-promotora/anexos/aceite", { modalidade: "federal", versao: vers.federal + 9 });
    checa("aceitar outra versão: 409", r.status === 409, `HTTP ${r.status}`);

    r = await orgA.req("POST", `/api/admin/campaigns/${federal.id}/publish`);
    checa("com o anexo aceito, publica", r.status === 200, `HTTP ${r.status} ${r.json?.message ?? ""}`);
    const fed1 = await idDoAnexo("federal", vers.federal);
    checa("a rifa grava a versão do anexo que valia", JSON.stringify(await idsDaRifa(federal.id)) === JSON.stringify([fed1]));

    // Rascunho com cota premiada: pede também o do vale-brinde.
    const mista = await rascunho(orgs[0].id, "a3", "federal_direta");
    await db.insert(prizedQuotas).values({ campaignId: mista.id, number: 7, prizeLabel: "Fone de ouvido" });
    r = await orgA.req("POST", `/api/admin/campaigns/${mista.id}/publish`);
    checa("rifa com cota premiada pede o anexo do vale-brinde (422)", r.status === 422 && /vale_brinde/.test(r.json?.message ?? ""), `HTTP ${r.status} ${r.json?.message ?? ""}`);

    // ------------------------------------------------ rifa no ar: cota premiada e entidade novas
    r = await orgA.req("POST", `/api/admin/campaigns/${federal.id}/prized`, { prizeLabel: "Camiseta", quantity: 1 });
    checa("primeira cota premiada na rifa no ar sem o anexo: 409", r.status === 409 && /vale_brinde/.test(r.json?.message ?? ""), `HTTP ${r.status} ${r.json?.message ?? ""}`);
    await orgA.req("POST", "/api/admin/contrato-promotora/anexos/aceite", { modalidade: "vale_brinde", versao: vers.vale_brinde });
    r = await orgA.req("POST", `/api/admin/campaigns/${federal.id}/prized`, { prizeLabel: "Camiseta", quantity: 1 });
    const vb1 = await idDoAnexo("vale_brinde", vers.vale_brinde);
    checa("aceito, a cota premiada entra e o anexo fica ligado à rifa", r.status === 201 && (await idsDaRifa(federal.id)).includes(vb1!), `HTTP ${r.status}`);
    r = await orgA.req("POST", `/api/admin/campaigns/${mista.id}/publish`);
    checa("e a rifa com cota premiada publica, com os dois anexos", r.status === 200 && (await idsDaRifa(mista.id)).length === 2, `HTTP ${r.status} ${r.json?.message ?? ""}`);

    const png = await sharp({ create: { width: 600, height: 200, channels: 3, background: "#2a6" } }).png().toBuffer();
    const entidade = {
      nome: "Instituto da Prova",
      texto: "Entidade de teste para a prova dos anexos.",
      imagem: `data:image/png;base64,${png.toString("base64")}`,
    };
    r = await orgA.req("PUT", `/api/admin/campaigns/${federal.id}/banner-divulgacao`, entidade);
    checa("entidade nova na rifa no ar sem o anexo: 409", r.status === 409 && /entidade/.test(r.json?.message ?? ""), `HTTP ${r.status} ${r.json?.message ?? ""}`);
    await orgA.req("POST", "/api/admin/contrato-promotora/anexos/aceite", { modalidade: "entidade", versao: vers.entidade });
    r = await orgA.req("PUT", `/api/admin/campaigns/${federal.id}/banner-divulgacao`, entidade);
    const ent1 = await idDoAnexo("entidade", vers.entidade);
    checa("aceito, a entidade entra e o anexo fica ligado", r.status === 200 && (await idsDaRifa(federal.id)).includes(ent1!), `HTTP ${r.status} ${r.json?.message ?? ""}`);

    // ------------------------------------------------ versão nova e outra organização
    r = await plataforma.req("POST", "/api/admin/contrato-promotora/anexos", anexo("federal", "2"));
    checa("a plataforma publica a versão seguinte do anexo", r.status === 201 && r.json?.versao === vers.federal + 1, `HTTP ${r.status}`);
    const a4 = await rascunho(orgs[0].id, "a4", "federal_direta");
    r = await orgA.req("POST", `/api/admin/campaigns/${a4.id}/publish`);
    checa("versão nova do anexo pede aceite de novo (422)", r.status === 422, `HTTP ${r.status}`);
    checa("a rifa já no ar segue na versão dela", (await idsDaRifa(federal.id)).includes(fed1!));
    const b1 = await rascunho(orgs[1].id, "b1", "federal_direta");
    r = await orgB.req("POST", `/api/admin/campaigns/${b1.id}/publish`);
    checa("o aceite da A não libera a B (422)", r.status === 422, `HTTP ${r.status}`);

    const p = await plataforma.req("GET", "/api/admin/contrato-promotora");
    const linha = (p.json?.anexos ?? []).find((a: { modalidade: string }) => a.modalidade === "vale_brinde");
    checa("a plataforma vê cada modalidade, a versão e quantas aceitaram", linha?.anexo?.versao === vers.vale_brinde && linha?.anexo?.aceites >= 1);
  } finally {
    await limpar(await daProva());
  }

  console.log(falhas === 0 ? "\n  tudo certo\n" : `\n  ${falhas} verificação(ões) falharam\n`);
  await pool.end();
  process.exit(falhas === 0 ? 0 : 1);
}

main().catch(async (err) => {
  console.error(err);
  await pool.end().catch(() => {});
  process.exit(1);
});
