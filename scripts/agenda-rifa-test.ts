/**
 * Prova da publicação agendada da rifa, contra a API e o banco de verdade:
 * - agendar é só no rascunho, no recorte (a rifa do vizinho é 404), até 30
 *   dias, nunca no passado e pelo menos 1 hora antes do sorteio;
 * - antes da hora, nada público vê a rifa (rascunho segue 404);
 * - na hora, o relógio publica pela mesma `publishCampaign()` (semente
 *   comprometida, agenda limpa) e a auditoria guarda quem agendou;
 * - rodar de novo, ou duas voltas ao mesmo tempo, não publica duas vezes;
 * - faltou algo na hora: não publica, a agenda sai e o motivo fica;
 * - o `PATCH` genérico não mexe na agenda, e publicar à mão a limpa.
 */
import "dotenv/config";
import { baseUrl } from "./base-url";
import { and, eq, inArray, sql } from "drizzle-orm";
import { db, pool } from "../server/db";
import { hashPassword } from "../server/auth";
import { publicarAgendadas } from "../server/services/publicacaoAgendada";
import { auditLog, campaignMedia, campaigns, organizations, users } from "../shared/schema";

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

const SLUGS = ["agenda-rifa-teste-a", "agenda-rifa-teste-b"];
const EMAILS = ["agenda-rifa-org-a@teste.rifa", "agenda-rifa-org-b@teste.rifa"];
const SENHA = "senha-agenda-rifa-1";
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
      slug: `agenda-rifa-teste-${sufixo}`,
      title: `Rifa ${sufixo}`,
      prizeTitle: `Prêmio ${sufixo}`,
      totalQuotas: 1000,
      priceCents: 1000,
      commissionPctDefault: 10,
      status: "draft",
      drawAt: new Date(Date.now() + (opcoes.drawEm ?? 20 * 24 * HORA)),
      authorizationCode: `SPA-AG-${sufixo}`,
      authorizationFileKey: "certificado-teste",
      metodoApuracao: "federal_direta",
    })
    .returning();
  await db.insert(campaignMedia).values([
    ...(opcoes.semBanner ? [] : [{ campaignId: c.id, role: "banner" as const, storageKey: `x-${sufixo}`, mime: "image/webp", status: "ready" as const }]),
    { campaignId: c.id, role: "photo", storageKey: `y-${sufixo}`, mime: "image/webp", status: "ready", position: 1 },
  ]);
  return c;
}

const ler = async (id: string) => (await db.select().from(campaigns).where(eq(campaigns.id, id)))[0];

async function main() {
  console.log("\n=== publicação agendada da rifa ===\n");
  await limpar();
  const orgs: { id: string }[] = [];
  const clientes: Cliente[] = [];
  const userIds: string[] = [];
  for (const [i, slug] of SLUGS.entries()) {
    const [o] = await db
      .insert(organizations)
      .values({ slug, name: `Agenda ${i ? "B" : "A"}`, cidade: "Natal", uf: "RN", telefoneConfirmadoEm: new Date(), telefoneAprovadoEm: new Date(), sociosDeclaradosEm: new Date() })
      .returning();
    const [u] = await db
      .insert(users)
      .values({ role: "organizer", organizationId: o.id, name: `Org ${i}`, email: EMAILS[i], passwordHash: await hashPassword(SENHA) })
      .returning({ id: users.id });
    orgs.push(o);
    userIds.push(u.id);
    const c = new Cliente();
    const l = await c.req("POST", "/api/auth/login", { email: EMAILS[i], password: SENHA });
    if (l.status !== 200) throw new Error(`login da organização ${i}: HTTP ${l.status}`);
    clientes.push(c);
  }
  const [orgA, orgB] = clientes;

  try {
    const a1 = await novoRascunho(orgs[0].id, "a1");
    const agendar = (cl: Cliente, id: string, publicarEm: unknown) => cl.req("PUT", `/api/admin/campaigns/${id}/agendar-publicacao`, { publicarEm });

    // ------------------------------------------------ as recusas
    let r = await agendar(orgA, a1.id, daqui(-HORA));
    checa("agendar no passado: 422", r.status === 422, `HTTP ${r.status} ${r.json?.message ?? ""}`);
    r = await agendar(orgA, a1.id, daqui(31 * 24 * HORA));
    checa("agendar além de 30 dias: 422", r.status === 422, `HTTP ${r.status}`);
    r = await agendar(orgA, a1.id, "amanhã cedo");
    checa("data que não é data: 422", r.status === 422, `HTTP ${r.status}`);
    const perto = await novoRascunho(orgs[0].id, "perto", { drawEm: 2 * HORA });
    r = await agendar(orgA, perto.id, daqui(1.5 * HORA));
    checa("a menos de 1 hora do sorteio: 422", r.status === 422 && /1 hora/.test(r.json?.message ?? ""), `HTTP ${r.status} ${r.json?.message ?? ""}`);
    r = await agendar(orgB, a1.id, daqui(HORA));
    checa("a organização B não agenda a rifa da A (404)", r.status === 404, `HTTP ${r.status}`);
    r = await new Cliente().req("PUT", `/api/admin/campaigns/${a1.id}/agendar-publicacao`, { publicarEm: daqui(HORA) });
    checa("sem sessão: recusado", r.status === 401 || r.status === 403, `HTTP ${r.status}`);

    // ------------------------------------------------ agendar
    r = await agendar(orgA, a1.id, daqui(HORA));
    checa("a organização agenda para daqui a 1 h, sem pendência", r.status === 200 && Boolean(r.json?.publicarEm) && r.json?.pendencias?.length === 0, `HTTP ${r.status} ${JSON.stringify(r.json)}`);
    let linha = await ler(a1.id);
    checa("a agenda guarda quem agendou", linha.publicarAgendadoPor === userIds[0]);
    r = await new Cliente().req("GET", `/api/public/campaigns/${a1.slug}`);
    checa("antes da hora, a rifa segue rascunho (404 no público)", r.status === 404, `HTTP ${r.status}`);
    r = await orgA.req("PATCH", `/api/admin/campaigns/${a1.id}`, { title: "Rifa a1 (nova)", publicarEm: null });
    linha = await ler(a1.id);
    checa("o PATCH genérico não mexe na agenda", r.status === 200 && Boolean(linha.publicarEm), `HTTP ${r.status}`);
    let volta = await publicarAgendadas();
    checa("antes da hora, o relógio não publica", (await ler(a1.id)).status === "draft" && volta.publicadas === 0);

    // ------------------------------------------------ chegou a hora
    await db.update(campaigns).set({ publicarEm: new Date(Date.now() - 1000) }).where(eq(campaigns.id, a1.id));
    volta = await publicarAgendadas();
    linha = await ler(a1.id);
    // O relógio do próprio servidor também roda: quem pegou a linha primeiro não importa, só que publicou.
    checa("na hora, o relógio publica", linha.status === "published", `${JSON.stringify(volta)} ${linha.status}`);
    checa("com a semente comprometida e a agenda limpa", Boolean(linha.drawSeedHash) && !linha.publicarEm && !linha.publicacaoAgendadaFalha);
    const [aud] = await db
      .select()
      .from(auditLog)
      .where(and(eq(auditLog.entityId, a1.id), eq(auditLog.action, "campaign.publish")));
    checa("a auditoria tem o sistema executando e quem agendou", aud?.actorRole === "sistema" && aud?.actorId === null && (aud?.diff as any)?.agendadoPor === userIds[0] && (aud?.diff as any)?.agendada === true);
    r = await new Cliente().req("GET", `/api/public/campaigns/${a1.slug}`);
    checa("publicada, a página da rifa abre", r.status === 200, `HTTP ${r.status}`);
    volta = await publicarAgendadas();
    checa("rodar de novo não publica outra vez", volta.publicadas === 0);
    r = await agendar(orgA, a1.id, daqui(HORA));
    checa("rifa publicada não ganha agenda (422)", r.status === 422, `HTTP ${r.status}`);

    // ------------------------------------------------ faltou algo na hora
    const a2 = await novoRascunho(orgs[0].id, "a2", { semBanner: true });
    r = await agendar(orgA, a2.id, daqui(HORA));
    checa("agendar com pendência avisa o que falta", r.status === 200 && r.json?.pendencias?.some((p: string) => /banner/i.test(p)), JSON.stringify(r.json?.pendencias));
    await db.update(campaigns).set({ publicarEm: new Date(Date.now() - 1000) }).where(eq(campaigns.id, a2.id));
    volta = await publicarAgendadas();
    linha = await ler(a2.id);
    checa("sem banner na hora, não publica", linha.status === "draft", `${linha.status} ${JSON.stringify(volta)}`);
    checa("a agenda sai e o motivo fica", !linha.publicarEm && /banner/i.test(linha.publicacaoAgendadaFalha ?? ""), String(linha.publicacaoAgendadaFalha));
    r = await orgA.req("GET", "/api/admin/campaigns");
    checa("o painel mostra o motivo", r.json?.find((x: any) => x.campaign.id === a2.id)?.campaign?.publicacaoAgendadaFalha?.length > 0);
    volta = await publicarAgendadas();
    checa("não fica tentando sem fim", volta.falharam === 0 && volta.publicadas === 0, JSON.stringify(volta));
    r = await agendar(orgA, a2.id, daqui(HORA));
    checa("agendar de novo limpa o motivo antigo", r.status === 200 && !(await ler(a2.id)).publicacaoAgendadaFalha);

    // ------------------------------------------------ duas voltas ao mesmo tempo
    const a3 = await novoRascunho(orgs[0].id, "a3");
    await agendar(orgA, a3.id, daqui(HORA));
    await db.update(campaigns).set({ publicarEm: new Date(Date.now() - 1000) }).where(eq(campaigns.id, a3.id));
    const [v1, v2] = await Promise.all([publicarAgendadas(), publicarAgendadas()]);
    const [{ n: sorteios }] = (await db.execute(sql`select count(*)::int as n from draws where campaign_id = ${a3.id}`)).rows as { n: number }[];
    checa("duas voltas juntas: uma publicação, uma semente", (await ler(a3.id)).status === "published" && sorteios === 1 && v1.falharam + v2.falharam === 0, `${JSON.stringify(v1)} ${JSON.stringify(v2)} draws=${sorteios}`);

    // ------------------------------------------------ o que muda depois de agendar
    const a6 = await novoRascunho(orgs[0].id, "a6");
    await agendar(orgA, a6.id, daqui(HORA));
    await db.update(campaigns).set({ publicarEm: new Date(Date.now() - 1000), drawAt: new Date(Date.now() + 30 * 60_000) }).where(eq(campaigns.id, a6.id));
    await publicarAgendadas();
    linha = await ler(a6.id);
    checa("sorteio puxado para perto depois de agendar: não publica", linha.status === "draft" && /1 hora/.test(linha.publicacaoAgendadaFalha ?? ""), String(linha.publicacaoAgendadaFalha));
    const b1 = await novoRascunho(orgs[1].id, "b1");
    await agendar(orgB, b1.id, daqui(HORA));
    await db.update(organizations).set({ active: false }).where(eq(organizations.id, orgs[1].id));
    await db.update(campaigns).set({ publicarEm: new Date(Date.now() - 1000) }).where(eq(campaigns.id, b1.id));
    await publicarAgendadas();
    linha = await ler(b1.id);
    checa("organização suspensa: o relógio não publica por ela", linha.status === "draft" && /suspensa/.test(linha.publicacaoAgendadaFalha ?? ""), String(linha.publicacaoAgendadaFalha));
    await db.update(organizations).set({ active: true }).where(eq(organizations.id, orgs[1].id));

    // ------------------------------------------------ publicar à mão limpa a agenda
    const a4 = await novoRascunho(orgs[0].id, "a4");
    await agendar(orgA, a4.id, daqui(2 * HORA));
    r = await orgA.req("POST", `/api/admin/campaigns/${a4.id}/publish`);
    linha = await ler(a4.id);
    checa("publicar à mão antes da hora limpa a agenda", r.status === 200 && linha.status === "published" && !linha.publicarEm, `HTTP ${r.status} ${r.json?.message ?? ""}`);

    // ------------------------------------------------ tirar a agenda
    const a5 = await novoRascunho(orgs[0].id, "a5");
    await agendar(orgA, a5.id, daqui(HORA));
    r = await agendar(orgA, a5.id, null);
    checa("tirar a agenda", r.status === 200 && r.json?.publicarEm === null && !(await ler(a5.id)).publicarEm, `HTTP ${r.status}`);
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
