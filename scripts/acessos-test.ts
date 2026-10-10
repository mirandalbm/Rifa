/**
 * Prova dos acessos e da segurança da conta, pela API de verdade (fase 0 da
 * reformulação: estas rotas não tinham prova que as citasse):
 *
 * - trocar a própria senha (`/auth/senha`) pede a atual, recusa fraca e igual,
 *   derruba as outras sessões e mantém esta; sair (`/auth/logout`) encerra;
 * - o segundo fator (`/admin/2fa`): ligar com o código, desligar só com senha
 *   E código — e desligar conta tentativa (30 em 10 min), como o resto;
 * - o antifraude: limites e bloqueios são da plataforma (403 para o
 *   organizador); id ou data fora do formato é recusado, nunca 500; o
 *   telefone bloqueado não compra;
 * - criar o acesso de organizador é da plataforma, repetido é 409, organização
 *   arquivada é recusada;
 * - os pedidos de mudança pendentes e o "visto" do sino seguem o recorte;
 * - a lista de exportações só para quem entra no painel.
 *
 *   npm run acessos      (com `npm run dev` no ar e o seed aplicado)
 */
import "dotenv/config";
import { baseUrl } from "./base-url";
import { eq, inArray, sql } from "drizzle-orm";
import { db, pool } from "../server/db";
import { hashPassword } from "../server/auth";
import { campaignStats, campaigns, fraudBlocks, organizations, users } from "../shared/schema";
import { generateSecret, totpCode } from "../server/services/totp";

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
  async entrar(email: string, password: string) {
    const r = await this.req("POST", "/api/auth/login", { email, password });
    if (r.status !== 200) throw new Error(`login ${email}: HTTP ${r.status} ${r.json?.message ?? ""}`);
    return this;
  }
}

const SENHA = "senha-acessos-1";
const NOVA = "outra-senha-acessos-2";
const SLUGS = ["acessos-a", "acessos-b", "acessos-arquivada"];
const EMAILS = ["acessos-org-a@teste.rifa", "acessos-org-b@teste.rifa", "acessos-novo@teste.rifa", "acessos-novo2@teste.rifa"];
const TELEFONE_BLOQUEADO = "11977778888";

async function limpar() {
  const orgs = await db.select({ id: organizations.id }).from(organizations).where(inArray(organizations.slug, SLUGS));
  const ids = orgs.map((o) => o.id);
  if (ids.length) {
    const lista = sql.join(ids.map((i) => sql`${i}::uuid`), sql`, `);
    await db.execute(sql`delete from campanha_solicitacoes where organization_id in (${lista})`);
    await db.execute(sql`delete from quota_alloc where campaign_id in (select id from campaigns where organization_id in (${lista}))`);
    await db.execute(sql`delete from orders where campaign_id in (select id from campaigns where organization_id in (${lista}))`);
    await db.execute(sql`delete from campaigns where organization_id in (${lista})`);
  }
  await db.delete(users).where(inArray(users.email, EMAILS));
  if (ids.length) await db.delete(organizations).where(inArray(organizations.id, ids));
  await db.delete(fraudBlocks).where(eq(fraudBlocks.value, TELEFONE_BLOQUEADO));
  await db.execute(sql`delete from sessions where sess::text like '%acessos-%'`);
  await db.execute(sql`delete from buyers where phone = ${TELEFONE_BLOQUEADO}`);
  await db.execute(sql`delete from rate_events where bucket like 'login:%' or bucket like 'order:%' or bucket like 'segundo-fator:%'`);
}

async function main() {
  console.log("\n=== acessos e segurança da conta ===\n");
  await limpar();

  const [orgA] = await db.insert(organizations).values({ slug: SLUGS[0], name: "Promotora Acessos A" }).returning();
  const [orgB] = await db.insert(organizations).values({ slug: SLUGS[1], name: "Promotora Acessos B" }).returning();
  const [arquivada] = await db.insert(organizations).values({ slug: SLUGS[2], name: "Promotora Arquivada", archivedAt: new Date() }).returning();
  const [uA] = await db
    .insert(users)
    .values([
      { role: "organizer", organizationId: orgA.id, name: "Org Acessos A", email: EMAILS[0], passwordHash: await hashPassword(SENHA) },
      { role: "organizer", organizationId: orgB.id, name: "Org Acessos B", email: EMAILS[1], passwordHash: await hashPassword(SENHA) },
    ])
    .returning();
  const [camp] = await db
    .insert(campaigns)
    .values({
      organizationId: orgA.id,
      slug: "acessos-rifa",
      title: "Rifa Acessos",
      prizeTitle: "Moto",
      totalQuotas: 10_000,
      priceCents: 1000,
      commissionPctDefault: 10,
      status: "published",
      publishedAt: new Date(),
      drawAt: new Date(Date.now() + 20 * 86_400_000),
      authorizationCode: "SPA-ACESSOS",
      authorizationFileKey: "certificado-teste",
    })
    .returning();
  await db.insert(campaignStats).values({ campaignId: camp.id });

  const admin = await new Cliente().entrar("admin@rifa.br", "admin123");
  const a = await new Cliente().entrar(EMAILS[0], SENHA);
  const b = await new Cliente().entrar(EMAILS[1], SENHA);

  try {
    /* ------------------- criar o acesso de organizador ------------------- */
    console.log("  acessos:");
    let r = await a.req("POST", `/api/admin/organizacoes/${orgA.id}/acessos`, { name: "Novo", email: EMAILS[2], password: SENHA });
    checa("o organizador não cria acesso (403)", r.status === 403, `HTTP ${r.status}`);
    r = await admin.req("POST", `/api/admin/organizacoes/${orgA.id}/acessos`, { name: "Novo", email: EMAILS[2] });
    checa("faltando a senha: 400", r.status === 400, `HTTP ${r.status}`);
    r = await admin.req("POST", `/api/admin/organizacoes/${orgA.id}/acessos`, { name: "Novo", email: EMAILS[2], password: "123" });
    checa("senha fraca: 400", r.status === 400, `HTTP ${r.status}`);
    r = await admin.req("POST", `/api/admin/organizacoes/${orgA.id}/acessos`, { name: "Novo", email: EMAILS[2], password: SENHA });
    checa("a plataforma cria o acesso (201)", r.status === 201 && r.json?.email === EMAILS[2], `HTTP ${r.status}`);
    const [novo] = await db.select().from(users).where(eq(users.email, EMAILS[2]));
    checa("…de organizador, na organização certa", novo?.role === "organizer" && novo.organizationId === orgA.id);
    r = await admin.req("POST", `/api/admin/organizacoes/${orgA.id}/acessos`, { name: "Outro", email: EMAILS[2].toUpperCase(), password: SENHA });
    checa("e-mail repetido (até em maiúscula): 409", r.status === 409, `HTTP ${r.status}`);
    r = await admin.req("POST", `/api/admin/organizacoes/${arquivada.id}/acessos`, { name: "Novo", email: EMAILS[3], password: SENHA });
    checa("organização arquivada: 409", r.status === 409, `HTTP ${r.status}`);
    r = await admin.req("POST", `/api/admin/organizacoes/00000000-0000-4000-8000-000000000000/acessos`, { name: "Novo", email: EMAILS[3], password: SENHA });
    checa("organização que não existe: 404", r.status === 404, `HTTP ${r.status}`);
    r = await new Cliente().entrar(EMAILS[2], SENHA).then((c) => c.req("GET", "/api/admin/campaigns"));
    checa("o acesso novo entra e só enxerga a própria organização", r.status === 200 && (r.json ?? []).every((x: any) => x.campaign.organizationId === orgA.id));

    /* ------------------------ pendentes e visto -------------------------- */
    console.log("\n  pendentes e sino:");
    r = await a.req("POST", `/api/admin/campaigns/${camp.id}/editar`, { title: "Rifa Acessos editada", motivo: "Ajuste do título" });
    checa("a organização pede uma edição (202)", r.status === 202, `HTTP ${r.status}`);
    r = await a.req("GET", "/api/admin/solicitacoes/pendentes");
    checa("a dona vê 1 pedido pendente", r.status === 200 && r.json?.total === 1, JSON.stringify(r.json));
    r = await b.req("GET", "/api/admin/solicitacoes/pendentes");
    checa("a vizinha não vê o pedido da outra", r.status === 200 && r.json?.total === 0, JSON.stringify(r.json));
    r = await admin.req("GET", "/api/admin/solicitacoes/pendentes");
    checa("a plataforma vê todos (pelo menos 1)", r.status === 200 && r.json?.total >= 1, JSON.stringify(r.json));
    r = await new Cliente().req("GET", "/api/admin/solicitacoes/pendentes");
    checa("sem sessão: 401", r.status === 401, `HTTP ${r.status}`);
    r = await a.req("POST", "/api/admin/avisos/vistos");
    checa("marcar os avisos como vistos (204)", r.status === 204, `HTTP ${r.status}`);
    const [vistoA] = await db.select({ v: users.avisosVistosEm }).from(users).where(eq(users.id, uA.id));
    checa("…grava em quem marcou", vistoA.v instanceof Date);
    const [vistoB] = await db.select({ v: users.avisosVistosEm }).from(users).where(eq(users.email, EMAILS[1]));
    checa("…e não na vizinha", vistoB.v === null);

    /* --------------------------- exportações ----------------------------- */
    console.log("\n  exportações:");
    r = await a.req("GET", "/api/admin/exportacoes");
    checa("a lista de relatórios chega ao organizador", r.status === 200 && Array.isArray(r.json?.relatorios) && r.json.relatorios.length > 0, `HTTP ${r.status}`);
    r = await new Cliente().req("GET", "/api/admin/exportacoes");
    checa("sem sessão: 401", r.status === 401, `HTTP ${r.status}`);

    /* ----------------------------- antifraude ---------------------------- */
    console.log("\n  antifraude:");
    r = await a.req("PUT", "/api/admin/antifraude/limites", {});
    checa("limites: o organizador não muda (403)", r.status === 403, `HTTP ${r.status}`);
    r = await a.req("POST", "/api/admin/antifraude/bloqueios", { kind: "phone", value: TELEFONE_BLOQUEADO });
    checa("bloqueio: o organizador não cria (403)", r.status === 403, `HTTP ${r.status}`);
    r = await a.req("DELETE", "/api/admin/antifraude/bloqueios/00000000-0000-4000-8000-000000000000");
    checa("…nem tira (403)", r.status === 403, `HTTP ${r.status}`);

    const antes = (await admin.req("GET", "/api/admin/antifraude")).json?.limites ?? {};
    r = await admin.req("PUT", "/api/admin/antifraude/limites", { openOrdersPerPhone: -1 });
    checa("limite fora da faixa: 400", r.status === 400, `HTTP ${r.status} ${r.json?.message ?? ""}`);
    r = await admin.req("PUT", "/api/admin/antifraude/limites", antes);
    checa("a plataforma regrava os limites que já tinha (200)", r.status === 200, `HTTP ${r.status}`);

    r = await admin.req("POST", "/api/admin/antifraude/bloqueios", { kind: "email", value: "x@y.z" });
    checa("tipo de bloqueio inválido: 400", r.status === 400, `HTTP ${r.status}`);
    r = await admin.req("POST", "/api/admin/antifraude/bloqueios", { kind: "phone", value: "12" });
    checa("valor curto demais: 400", r.status === 400, `HTTP ${r.status}`);
    r = await admin.req("POST", "/api/admin/antifraude/bloqueios", { kind: "phone", value: TELEFONE_BLOQUEADO, expiresAt: "isto não é data" });
    checa("data de validade inválida: 400, nunca 500", r.status === 400, `HTTP ${r.status}`);
    r = await admin.req("POST", "/api/admin/antifraude/bloqueios", { kind: "phone", value: TELEFONE_BLOQUEADO, reason: "prova" });
    checa("bloqueia um telefone (201)", r.status === 201, `HTTP ${r.status}`);
    const idBloqueio = r.json?.id as string;
    r = await new Cliente().req("POST", "/api/public/orders", { campaignId: camp.id, quantity: 1, buyer: { name: "Barrado", phone: TELEFONE_BLOQUEADO } });
    checa("o telefone bloqueado não compra (429)", r.status === 429, `HTTP ${r.status} ${r.json?.message ?? ""}`);
    r = await admin.req("DELETE", "/api/admin/antifraude/bloqueios/isso-nao-e-uuid");
    checa("id fora do formato: 404, nunca 500", r.status === 404, `HTTP ${r.status}`);
    r = await admin.req("DELETE", `/api/admin/antifraude/bloqueios/${idBloqueio}`);
    checa("tira o bloqueio (200)", r.status === 200, `HTTP ${r.status}`);
    r = await admin.req("DELETE", `/api/admin/antifraude/bloqueios/${idBloqueio}`);
    checa("tirar de novo: 404", r.status === 404, `HTTP ${r.status}`);
    r = await new Cliente().req("POST", "/api/public/orders", { campaignId: camp.id, quantity: 1, buyer: { name: "Liberado", phone: TELEFONE_BLOQUEADO } });
    checa("desbloqueado, o mesmo telefone compra (201)", r.status === 201, `HTTP ${r.status} ${r.json?.message ?? ""}`);

    /* ----------------------------- segundo fator ------------------------- */
    console.log("\n  segundo fator:");
    r = await a.req("GET", "/api/admin/2fa");
    checa("começa desligado", r.status === 200 && r.json?.enabled === false);
    r = await a.req("POST", "/api/admin/2fa/enable", { code: "123456" });
    checa("ligar sem gerar o QR: 409", r.status === 409, `HTTP ${r.status}`);
    r = await a.req("POST", "/api/admin/2fa/setup");
    const segredo = r.json?.secret as string;
    checa("gera o segredo e o QR", r.status === 200 && typeof segredo === "string" && String(r.json?.qr).startsWith("data:image"), `HTTP ${r.status}`);
    r = await a.req("POST", "/api/admin/2fa/enable", { code: totpCode(segredo) === "000000" ? "111111" : "000000" });
    checa("código errado não liga (401)", r.status === 401, `HTTP ${r.status}`);
    r = await a.req("POST", "/api/admin/2fa/enable", { code: totpCode(segredo) });
    checa("código certo liga", r.status === 200 && r.json?.enabled === true, `HTTP ${r.status}`);
    r = await a.req("GET", "/api/admin/2fa");
    checa("…e fica ligado", r.json?.enabled === true);
    r = await a.req("POST", "/api/admin/2fa/setup");
    checa("gerar outro segredo com ele ligado: 409", r.status === 409, `HTTP ${r.status}`);

    r = await a.req("POST", "/api/admin/2fa/disable", { password: "senha-errada-123", code: totpCode(segredo) });
    checa("desligar com senha errada: 401", r.status === 401, `HTTP ${r.status}`);
    r = await a.req("POST", "/api/admin/2fa/disable", { password: SENHA, code: totpCode(segredo) === "000000" ? "111111" : "000000" });
    checa("desligar com código errado: 401", r.status === 401, `HTTP ${r.status}`);
    r = await a.req("POST", "/api/admin/2fa/disable", { password: SENHA });
    checa("desligar sem código: 401", r.status === 401, `HTTP ${r.status}`);
    r = await a.req("GET", "/api/admin/2fa");
    checa("…e nada disso desligou", r.json?.enabled === true);

    // A força bruta no código: depois de 30 tentativas na janela, 429.
    const errado = totpCode(segredo) === "000000" ? "111111" : "000000";
    let barrou = false;
    for (let i = 0; i < 40 && !barrou; i++) {
      const t = await a.req("POST", "/api/admin/2fa/disable", { password: SENHA, code: errado });
      barrou = t.status === 429;
    }
    checa("tentativas demais para desligar: 429", barrou);
    r = await a.req("POST", "/api/admin/2fa/disable", { password: SENHA, code: totpCode(segredo) });
    checa("barrado, nem o código certo desliga (429)", r.status === 429, `HTTP ${r.status}`);
    await db.execute(sql`delete from rate_events where bucket like 'segundo-fator:%'`);
    r = await a.req("POST", "/api/admin/2fa/disable", { password: SENHA, code: totpCode(segredo) });
    checa("passada a janela, senha e código certos desligam (200)", r.status === 200 && r.json?.enabled === false, `HTTP ${r.status}`);

    /* ------------------------- senha e sair ------------------------------ */
    console.log("\n  senha e sair:");
    const outraAba = await new Cliente().entrar(EMAILS[0], SENHA);
    r = await new Cliente().req("POST", "/api/auth/senha", { atual: SENHA, nova: NOVA });
    checa("sem sessão: 401", r.status === 401, `HTTP ${r.status}`);
    r = await a.req("POST", "/api/auth/senha", { atual: "senha-errada-123", nova: NOVA });
    checa("a atual errada: 401", r.status === 401, `HTTP ${r.status}`);
    r = await a.req("POST", "/api/auth/senha", { atual: SENHA, nova: "123" });
    checa("a nova fraca: 400", r.status === 400, `HTTP ${r.status}`);
    r = await a.req("POST", "/api/auth/senha", { atual: SENHA, nova: SENHA });
    checa("a nova igual à atual: 400", r.status === 400, `HTTP ${r.status}`);
    r = await a.req("POST", "/api/auth/senha", { atual: SENHA, nova: NOVA });
    checa("troca a senha (200)", r.status === 200, `HTTP ${r.status}`);
    r = await a.req("GET", "/api/auth/me");
    checa("esta sessão continua", r.json?.role === "organizer", r.json?.role);
    r = await outraAba.req("GET", "/api/auth/me");
    checa("a outra sessão caiu", r.json?.role === "guest", r.json?.role);
    r = await new Cliente().req("POST", "/api/auth/login", { email: EMAILS[0], password: SENHA });
    checa("a senha antiga não entra mais (401)", r.status === 401, `HTTP ${r.status}`);
    await db.execute(sql`delete from rate_events where bucket like 'login:%'`);
    const nova = await new Cliente().entrar(EMAILS[0], NOVA);
    checa("a nova entra", Boolean(nova.cookie));
    const trilha = await db.execute(sql`select count(*)::int as n from audit_log where action = 'usuario.senha.trocada' and entity_id = ${uA.id}`);
    checa("a troca fica na auditoria", (trilha.rows[0] as any).n === 1);

    r = await nova.req("POST", "/api/auth/logout");
    checa("sair (200)", r.status === 200, `HTTP ${r.status}`);
    r = await nova.req("GET", "/api/auth/me");
    checa("…e a sessão acaba", r.json?.role === "guest", r.json?.role);
    r = await nova.req("GET", "/api/admin/campaigns");
    checa("…e o painel fecha (401)", r.status === 401, `HTTP ${r.status}`);
  } finally {
    await limpar();
  }
  console.log(falhas ? `\n${falhas} falha(s)` : "\ntudo certo");
  await pool.end();
  process.exit(falhas ? 1 : 0);
}

void generateSecret;

main().catch(async (e) => {
  console.error(e);
  await limpar().catch(() => {});
  await pool.end();
  process.exit(1);
});
