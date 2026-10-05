/**
 * Prova do contrato da plataforma com a promotora, contra a API e o banco:
 * - sem contrato publicado, nada muda: a rifa publica como sempre;
 * - só a plataforma publica versão (403 para organizador); só a organização
 *   aceita (403 para a plataforma); visitante 401;
 * - com versão em vigor, a organização sem aceite não publica rifa (422) —
 *   nem pelo botão, nem pela `publishCampaign()` que o relógio usa;
 * - aceitar exige a versão em vigor (409 com outra); cinco aceites ao mesmo
 *   tempo são um aceite só, com a cópia do texto, quem aceitou e o IP em hash;
 * - o aceite de uma organização não libera a outra;
 * - versão nova pede aceite de novo, e não mexe nas rifas que já estão no ar;
 * - o mesmo texto não vira versão nova (409).
 */
import "dotenv/config";
import { baseUrl } from "./base-url";
import { and, eq, inArray, notInArray, sql } from "drizzle-orm";
import { db, pool } from "../server/db";
import { hashPassword } from "../server/auth";
import { publishCampaign } from "../server/services/campaigns";
import {
  auditLog,
  campaignMedia,
  campaigns,
  contratoPromotoraAceites,
  contratosPromotora,
  organizations,
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
    return { status: r.status, json: tipo.includes("json") ? await r.json() : null };
  }
}

const SLUGS = ["contrato-teste-a", "contrato-teste-b"];
const EMAILS = ["contrato-org-a@teste.rifa", "contrato-org-b@teste.rifa"];
const SENHA = "senha-contrato-1";
const DIA = 86_400_000;
const TEXTO_1 = `CONTRATO DE TESTE — versão da prova\n\n${"Cláusula de teste. ".repeat(20).trim()}`;
const TEXTO_2 = `${TEXTO_1}\n\nCláusula nova: ação de regresso.`;

async function limpar(contratosDaProva: string[]) {
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
    await db.delete(contratoPromotoraAceites).where(inArray(contratoPromotoraAceites.organizationId, ids));
  }
  if (contratosDaProva.length) {
    await db.delete(contratoPromotoraAceites).where(inArray(contratoPromotoraAceites.contratoId, contratosDaProva));
    await db.delete(contratosPromotora).where(inArray(contratosPromotora.id, contratosDaProva));
  }
  await db.delete(users).where(inArray(users.email, EMAILS));
  if (ids.length) await db.delete(organizations).where(inArray(organizations.id, ids));
  await db.execute(sql`delete from rate_events where bucket like 'login:%'`);
}

async function rascunho(orgId: string, sufixo: string) {
  const [c] = await db
    .insert(campaigns)
    .values({
      organizationId: orgId,
      slug: `contrato-teste-${sufixo}`,
      title: `Rifa ${sufixo}`,
      prizeTitle: `Prêmio ${sufixo}`,
      totalQuotas: 1000,
      priceCents: 1000,
      commissionPctDefault: 10,
      status: "draft",
      drawAt: new Date(Date.now() + 20 * DIA),
      authorizationCode: `SPA-CT-${sufixo}`,
      authorizationFileKey: "certificado-teste",
      metodoApuracao: "federal_direta",
    })
    .returning();
  await db.insert(campaignMedia).values([
    { campaignId: c.id, role: "banner", storageKey: `ct-b-${sufixo}`, mime: "image/webp", status: "ready" },
    { campaignId: c.id, role: "photo", storageKey: `ct-f-${sufixo}`, mime: "image/webp", status: "ready", position: 1 },
  ]);
  return c;
}

const status = async (id: string) => (await db.select({ s: campaigns.status }).from(campaigns).where(eq(campaigns.id, id)))[0]?.s;

async function main() {
  console.log("\n=== contrato da plataforma com a promotora ===\n");
  // A prova só apaga as versões que ela mesma criou; as que existiam ficam.
  const antes = (await db.select({ id: contratosPromotora.id }).from(contratosPromotora)).map((c) => c.id);
  const daProva = async () =>
    (await db.select({ id: contratosPromotora.id }).from(contratosPromotora).where(antes.length ? notInArray(contratosPromotora.id, antes) : sql`true`)).map((c) => c.id);
  await limpar([]);

  const orgs: { id: string }[] = [];
  const clientes: Cliente[] = [];
  const userIds: string[] = [];
  for (const [i, slug] of SLUGS.entries()) {
    const [o] = await db
      .insert(organizations)
      .values({ slug, name: `Contrato ${i ? "B" : "A"}`, cidade: "Natal", uf: "RN", telefoneConfirmadoEm: new Date(), telefoneAprovadoEm: new Date() })
      .returning();
    const [u] = await db
      .insert(users)
      .values({ role: "organizer", organizationId: o.id, name: `Org ${i ? "B" : "A"}`, email: EMAILS[i], passwordHash: await hashPassword(SENHA) })
      .returning({ id: users.id });
    orgs.push(o);
    userIds.push(u.id);
    const c = new Cliente();
    const l = await c.req("POST", "/api/auth/login", { email: EMAILS[i], password: SENHA });
    if (l.status !== 200) throw new Error(`login da organização ${i}: HTTP ${l.status}`);
    clientes.push(c);
  }
  const [orgA, orgB] = clientes;
  const plataforma = new Cliente();
  const lp = await plataforma.req("POST", "/api/auth/login", {
    email: process.env.SEED_ADMIN_EMAIL ?? "admin@rifa.br",
    password: process.env.SEED_ADMIN_PASSWORD ?? "admin123",
  });
  if (lp.status !== 200) throw new Error(`login da plataforma: HTTP ${lp.status}`);

  try {
    const semContrato = antes.length === 0;
    // ------------------------------------------------ sem contrato
    if (semContrato) {
      const a1 = await rascunho(orgs[0].id, "a1");
      const r = await orgA.req("POST", `/api/admin/campaigns/${a1.id}/publish`);
      checa("sem contrato publicado, a rifa publica como sempre", r.status === 200, `HTTP ${r.status} ${r.json?.message ?? ""}`);
      const g = await orgA.req("GET", "/api/admin/contrato-promotora");
      checa("a organização vê que não há contrato, sem pendência", g.status === 200 && g.json?.contrato === null && g.json?.pendente === false);
    } else {
      console.log("  (já há contrato no banco: a parte 'sem contrato' fica de fora)");
    }

    // ------------------------------------------------ quem pode o quê
    let r = await orgA.req("POST", "/api/admin/contrato-promotora", { texto: TEXTO_1 });
    checa("organizador não publica versão (403)", r.status === 403, `HTTP ${r.status}`);
    r = await new Cliente().req("POST", "/api/admin/contrato-promotora", { texto: TEXTO_1 });
    checa("visitante não publica versão (401)", r.status === 401, `HTTP ${r.status}`);
    r = await new Cliente().req("GET", "/api/admin/contrato-promotora");
    checa("visitante não lê (401)", r.status === 401, `HTTP ${r.status}`);
    r = await plataforma.req("POST", "/api/admin/contrato-promotora", { texto: "curto demais" });
    checa("texto curto: 400", r.status === 400, `HTTP ${r.status} ${r.json?.message ?? ""}`);

    // ------------------------------------------------ versão em vigor
    r = await plataforma.req("POST", "/api/admin/contrato-promotora", { texto: TEXTO_1 });
    const v1 = r.json?.versao as number;
    checa("a plataforma publica a versão", r.status === 201 && Number.isInteger(v1), `HTTP ${r.status} ${JSON.stringify(r.json)}`);
    r = await plataforma.req("POST", "/api/admin/contrato-promotora", { texto: `  ${TEXTO_1}  ` });
    checa("o mesmo texto não vira versão nova (409)", r.status === 409, `HTTP ${r.status}`);
    r = await plataforma.req("POST", "/api/admin/contrato-promotora/aceite", { versao: v1 });
    checa("a plataforma não aceita (403)", r.status === 403, `HTTP ${r.status}`);

    const a2 = await rascunho(orgs[0].id, "a2");
    r = await orgA.req("POST", `/api/admin/campaigns/${a2.id}/publish`);
    checa(
      "sem o aceite, a organização não publica (422, com o motivo)",
      r.status === 422 && /Aceite o contrato/.test(r.json?.message ?? ""),
      `HTTP ${r.status} ${r.json?.message ?? ""}`,
    );
    checa("a rifa continua rascunho", (await status(a2.id)) === "draft");
    let erroDoRelogio = "";
    try {
      await publishCampaign(a2.id);
    } catch (e) {
      erroDoRelogio = (e as Error).message;
    }
    checa("o caminho do relógio (publishCampaign) também barra", /Aceite o contrato/.test(erroDoRelogio), erroDoRelogio);

    const g = await orgA.req("GET", "/api/admin/contrato-promotora");
    checa("a organização lê o texto em vigor e vê a pendência", g.json?.contrato?.versao === v1 && g.json?.contrato?.texto === TEXTO_1 && g.json?.pendente === true);

    // ------------------------------------------------ aceitar
    r = await orgA.req("POST", "/api/admin/contrato-promotora/aceite", { versao: v1 + 7 });
    checa("aceitar outra versão: 409", r.status === 409, `HTTP ${r.status} ${r.json?.message ?? ""}`);
    r = await orgA.req("POST", "/api/admin/contrato-promotora/aceite", {});
    checa("aceitar sem dizer a versão: 400", r.status === 400, `HTTP ${r.status}`);
    const cinco = await Promise.all(Array.from({ length: 5 }, () => orgA.req("POST", "/api/admin/contrato-promotora/aceite", { versao: v1 })));
    checa("cinco aceites ao mesmo tempo respondem 200", cinco.every((x) => x.status === 200), cinco.map((x) => x.status).join(","));
    const aceites = await db
      .select()
      .from(contratoPromotoraAceites)
      .where(eq(contratoPromotoraAceites.organizationId, orgs[0].id));
    checa("…e viram um aceite só", aceites.length === 1, `${aceites.length}`);
    checa(
      "o aceite guarda a cópia do texto, a versão, quem aceitou e o IP em hash",
      aceites[0]?.texto === TEXTO_1 && aceites[0]?.versao === v1 && aceites[0]?.userId === userIds[0] && /^[0-9a-f]{32}$/.test(aceites[0]?.ipHash ?? ""),
    );
    const trilha = await db
      .select({ id: auditLog.id })
      .from(auditLog)
      .where(and(eq(auditLog.action, "contrato_promotora.aceite"), eq(auditLog.entityId, orgs[0].id)));
    checa("a auditoria registra o aceite uma vez", trilha.length === 1, `${trilha.length}`);

    r = await orgA.req("POST", `/api/admin/campaigns/${a2.id}/publish`);
    checa("com o aceite, a organização publica", r.status === 200, `HTTP ${r.status} ${r.json?.message ?? ""}`);

    const b1 = await rascunho(orgs[1].id, "b1");
    r = await orgB.req("POST", `/api/admin/campaigns/${b1.id}/publish`);
    checa("o aceite da A não libera a B (422)", r.status === 422, `HTTP ${r.status}`);
    const gB = await orgB.req("GET", "/api/admin/contrato-promotora");
    checa("a B vê só o aceite dela (nenhum)", gB.json?.ultimoAceite === null && gB.json?.pendente === true);

    // ------------------------------------------------ versão nova
    r = await plataforma.req("POST", "/api/admin/contrato-promotora", { texto: TEXTO_2 });
    const v2 = r.json?.versao as number;
    checa("a plataforma publica a versão seguinte", r.status === 201 && v2 === v1 + 1, `HTTP ${r.status} v${v2}`);
    const a3 = await rascunho(orgs[0].id, "a3");
    r = await orgA.req("POST", `/api/admin/campaigns/${a3.id}/publish`);
    checa("versão nova pede aceite de novo (422)", r.status === 422 && new RegExp(`versão ${v2}`).test(r.json?.message ?? ""), `HTTP ${r.status} ${r.json?.message ?? ""}`);
    checa("a rifa que já estava no ar segue no ar", (await status(a2.id)) === "published");
    r = await orgA.req("POST", "/api/admin/contrato-promotora/aceite", { versao: v1 });
    checa("aceitar a versão antiga: 409", r.status === 409, `HTTP ${r.status}`);
    r = await orgA.req("POST", "/api/admin/contrato-promotora/aceite", { versao: v2 });
    checa("aceitar a nova: 200", r.status === 200, `HTTP ${r.status}`);
    r = await orgA.req("POST", `/api/admin/campaigns/${a3.id}/publish`);
    checa("e publicar de novo", r.status === 200, `HTTP ${r.status} ${r.json?.message ?? ""}`);

    const p = await plataforma.req("GET", "/api/admin/contrato-promotora");
    const linha = (p.json?.versoes ?? []).find((x: { versao: number }) => x.versao === v2);
    checa("a plataforma vê as versões e quantas aceitaram", p.status === 200 && linha?.aceites === 1 && typeof p.json?.organizacoesAtivas === "number", JSON.stringify(linha));
    const publicacoes = await db
      .select({ id: auditLog.id })
      .from(auditLog)
      .where(eq(auditLog.action, "contrato_promotora.publicar"));
    checa("a auditoria registra as publicações de versão", publicacoes.length >= 2, `${publicacoes.length}`);
  } finally {
    await limpar(await daProva());
  }

  console.log(falhas ? `\n${falhas} falha(s).` : "\nTudo certo.");
  await pool.end();
  process.exit(falhas ? 1 : 0);
}

main().catch(async (e) => {
  console.error(e);
  await pool.end();
  process.exit(1);
});
