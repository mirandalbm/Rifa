/**
 * Senha, segundo fator e rascunho, pela API de verdade:
 *
 * - o segredo do segundo fator nasce selado no cofre (nem a sessão o guarda
 *   em claro), o login com o código passa e sem ele não;
 * - o segredo antigo, em claro, continua entrando e a migração o sela;
 * - a senha com o custo antigo do scrypt entra e é refeita no login;
 * - as rotas públicas de números (mapa, número, prêmios, ranking, últimas
 *   compras) não respondem sobre rascunho.
 *
 *   npm run senha
 */
import "dotenv/config";
import { randomBytes, scryptSync } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { baseUrl } from "./base-url";
import { db, pool } from "../server/db";
import { hashPassword } from "../server/auth";
import { campaigns, campaignStats, organizations, users } from "../shared/schema";
import { totpCode } from "../server/services/totp";
import { cifrarSegredosDoSegundoFator } from "../server/services/segundoFator";

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

const EMAIL = "senha-prova@teste.rifa";
const EMAIL_ANTIGO = "senha-antiga@teste.rifa";
const SENHA = "senha-da-prova-1";
const SLUG = "senha-prova-rascunho";

async function limpar() {
  await db.execute(sql`delete from users where email in (${EMAIL}, ${EMAIL_ANTIGO})`);
  await db.execute(sql`delete from campaigns where slug = ${SLUG}`);
  await db.execute(sql`delete from organizations where slug = ${SLUG}`);
  await db.execute(sql`delete from rate_events where bucket like 'login:%'`);
}

async function main() {
  console.log("\n=== senha, segundo fator e rascunho ===\n");
  await limpar();
  try {
    // --- segundo fator novo: selado ---
    await db.insert(users).values({ role: "admin", name: "Prova Senha", email: EMAIL, passwordHash: await hashPassword(SENHA) });
    const c = new Cliente();
    let r = await c.req("POST", "/api/auth/login", { email: EMAIL, password: SENHA });
    checa("entra com a senha (sem segundo fator ainda)", r.status === 200, `HTTP ${r.status}`);
    r = await c.req("POST", "/api/admin/2fa/setup");
    const segredo = r.json?.secret as string;
    checa("o QR traz o segredo para o aplicativo", r.status === 200 && /^[A-Z2-7]{32}$/.test(segredo ?? ""), `HTTP ${r.status}`);
    const sessao = (await db.execute(sql`select sess::text as s from sessions where sess::text like '%pendingTotpSecret%' order by expire desc limit 5`)).rows as { s: string }[];
    checa("a sessão guarda o segredo pendente selado, nunca em claro", sessao.length > 0 && sessao.every((x) => !x.s.includes(segredo)) && sessao.some((x) => x.s.includes("cofre:v1:")));
    r = await c.req("POST", "/api/admin/2fa/enable", { code: totpCode(segredo) });
    checa("liga o segundo fator com o código", r.status === 200 && r.json?.enabled === true, `HTTP ${r.status} ${r.json?.message ?? ""}`);
    let [u] = await db.select().from(users).where(eq(users.email, EMAIL));
    checa("o banco guarda o segredo selado (cofre:v1:…), sem o segredo em claro", Boolean(u.totpSecret?.startsWith("cofre:v1:")) && !u.totpSecret?.includes(segredo));
    r = await new Cliente().req("POST", "/api/auth/login", { email: EMAIL, password: SENHA });
    checa("sem o código, não entra", r.status === 401 && r.json?.code === "totp_required", `HTTP ${r.status} ${r.json?.code}`);
    r = await new Cliente().req("POST", "/api/auth/login", { email: EMAIL, password: SENHA, token: "000000" === totpCode(segredo) ? "111111" : "000000" });
    checa("com o código errado, não entra", r.status === 401 && r.json?.code === "totp_invalid", `HTTP ${r.status} ${r.json?.code}`);
    r = await new Cliente().req("POST", "/api/auth/login", { email: EMAIL, password: SENHA, token: totpCode(segredo) });
    checa("com o código certo, entra (o segredo selado abre)", r.status === 200, `HTTP ${r.status} ${r.json?.message ?? ""}`);

    // Selado e adulterado: não entra, e não é 500.
    await db.update(users).set({ totpSecret: u.totpSecret!.slice(0, -4) + "AAAA" }).where(eq(users.id, u.id));
    r = await new Cliente().req("POST", "/api/auth/login", { email: EMAIL, password: SENHA, token: totpCode(segredo) });
    checa("segredo adulterado no banco: recusa (401), nunca 500", r.status === 401, `HTTP ${r.status}`);

    // --- segredo antigo, em claro: entra e a migração sela ---
    await db.update(users).set({ totpSecret: segredo }).where(eq(users.id, u.id));
    r = await new Cliente().req("POST", "/api/auth/login", { email: EMAIL, password: SENHA, token: totpCode(segredo) });
    checa("segredo antigo em claro continua entrando", r.status === 200, `HTTP ${r.status}`);
    const selados = await cifrarSegredosDoSegundoFator();
    [u] = await db.select().from(users).where(eq(users.email, EMAIL));
    checa("a migração sela o que estava em claro", selados >= 1 && Boolean(u.totpSecret?.startsWith("cofre:v1:")), String(selados));
    checa("rodar de novo não mexe (já selado)", (await cifrarSegredosDoSegundoFator()) === 0);
    r = await new Cliente().req("POST", "/api/auth/login", { email: EMAIL, password: SENHA, token: totpCode(segredo) });
    checa("depois da migração, entra igual", r.status === 200, `HTTP ${r.status}`);

    // --- senha com o custo antigo: entra e é refeita ---
    const sal = randomBytes(16).toString("hex");
    const antigo = `${sal}:${scryptSync(SENHA, sal, 64).toString("hex")}`;
    await db.insert(users).values({ role: "admin", name: "Prova Senha Antiga", email: EMAIL_ANTIGO, passwordHash: antigo });
    r = await new Cliente().req("POST", "/api/auth/login", { email: EMAIL_ANTIGO, password: "senha-errada-1" });
    let [v] = await db.select().from(users).where(eq(users.email, EMAIL_ANTIGO));
    checa("senha errada não refaz nada", r.status === 401 && v.passwordHash === antigo, `HTTP ${r.status}`);
    r = await new Cliente().req("POST", "/api/auth/login", { email: EMAIL_ANTIGO, password: SENHA });
    [v] = await db.select().from(users).where(eq(users.email, EMAIL_ANTIGO));
    checa("senha com o custo antigo entra", r.status === 200, `HTTP ${r.status}`);
    checa("e é refeita com o custo novo (s2$…)", v.passwordHash.startsWith("s2$65536$8$2$") && v.passwordHash !== antigo, v.passwordHash.slice(0, 16));
    r = await new Cliente().req("POST", "/api/auth/login", { email: EMAIL_ANTIGO, password: SENHA });
    checa("e entra com o hash novo", r.status === 200, `HTTP ${r.status}`);

    // --- rascunho não responde nas rotas públicas de números ---
    const [org] = await db.insert(organizations).values({ slug: SLUG, name: "Prova Rascunho" }).returning();
    const [rasc] = await db
      .insert(campaigns)
      .values({ organizationId: org.id, slug: SLUG, title: "Rascunho", prizeTitle: "Moto", totalQuotas: 1000, priceCents: 500 })
      .returning();
    await db.insert(campaignStats).values({ campaignId: rasc.id });
    const publico = new Cliente();
    for (const caminho of ["blocks/0", "numbers/7", "premios", "ranking", "ultimas-compras"]) {
      r = await publico.req("GET", `/api/public/campaigns/${SLUG}/${caminho}`);
      checa(`rascunho: /${caminho} é 404, como inexistente`, r.status === 404, `HTTP ${r.status}`);
    }
    await db.update(campaigns).set({ status: "published", publishedAt: new Date() }).where(eq(campaigns.id, rasc.id));
    r = await publico.req("GET", `/api/public/campaigns/${SLUG}/blocks/0`);
    checa("publicada, o mapa responde", r.status === 200, `HTTP ${r.status}`);
  } finally {
    await limpar();
  }
  console.log(falhas ? `\n${falhas} falha(s)` : "\ntudo certo");
  await pool.end();
  process.exit(falhas ? 1 : 0);
}

main().catch(async (e) => {
  console.error(e);
  await pool.end();
  process.exit(1);
});
