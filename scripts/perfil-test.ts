/**
 * Prova do perfil do organizador, pela API de verdade: o perfil público, o
 * seguir (uma vez só, mesmo com toques simultâneos), o sino, o contador e a
 * privacidade do "seguido por".
 *
 *   npm run perfil      (com `npm run dev` no ar e o seed aplicado)
 */
import "dotenv/config";
import { baseUrl } from "./base-url";
import { eq, sql } from "drizzle-orm";
import { db, pool } from "../server/db";
import { campaignStats, campaigns, draws, organizations } from "../shared/schema";

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
    return { status: r.status, json: tipo.includes("json") ? await r.json() : null, tipo };
  }
}

const SLUG = "perfil-teste";
const PESSOAS = [
  { nome: "Ana Perfil", telefone: "11977770001", cpf: "39053344705" },
  { nome: "Bruno Perfil", telefone: "11977770002", cpf: "12345678909" },
];

async function limpar() {
  await db.execute(sql`delete from rate_events where bucket like 'cadastro:%' or bucket like 'login:comprador:%'`);
  const tels = PESSOAS.map((p) => p.telefone);
  await db.execute(sql`delete from buyers where phone in (${tels[0]}, ${tels[1]})`);
  await db.execute(
    sql`delete from campaigns where organization_id in (select id from organizations where slug = ${SLUG})`,
  );
  await db.execute(sql`delete from organizations where slug = ${SLUG}`);
}

async function main() {
  console.log("\n=== perfil do organizador ===\n");
  await limpar();

  const [org] = await db
    .insert(organizations)
    .values({ slug: SLUG, name: "Perfil Teste Rifas", cidade: "Campinas", uf: "SP", bio: "Rifas do bairro" })
    .returning();
  const noAr = await db
    .insert(campaigns)
    .values({
      organizationId: org.id,
      slug: "perfil-teste-no-ar",
      title: "Moto",
      prizeTitle: "Moto 0 km",
      totalQuotas: 1000,
      priceCents: 1500,
      status: "published",
      publishedAt: new Date(),
      drawAt: new Date(Date.now() + 5 * 86_400_000),
      authorizationCode: "SPA-PERFIL-1",
    })
    .returning();
  const [sorteada] = await db
    .insert(campaigns)
    .values({
      organizationId: org.id,
      slug: "perfil-teste-sorteada",
      title: "TV",
      prizeTitle: "TV 55",
      totalQuotas: 100,
      priceCents: 500,
      status: "drawn",
      publishedAt: new Date(Date.now() - 30 * 86_400_000),
      drawAt: new Date(Date.now() - 2 * 86_400_000),
      authorizationCode: "SPA-PERFIL-0",
    })
    .returning();
  await db.insert(campaignStats).values([{ campaignId: noAr[0].id }, { campaignId: sorteada.id }]);
  await db.insert(draws).values({
    campaignId: sorteada.id,
    seed: "s",
    seedHash: "h",
    resultNumber: 7,
    executedAt: new Date(Date.now() - 2 * 86_400_000),
  });

  try {
    const anonimo = new Cliente();
    let r = await anonimo.req("GET", `/api/public/o/${SLUG}`);
    checa("o perfil é público", r.status === 200, `HTTP ${r.status}`);
    checa("bio do organizador e bio automática da rifa no ar",
      r.json?.bio === "Rifas do bairro" && r.json?.bioAutomatica?.some((l: string) => l.includes("Moto 0 km")) &&
      r.json?.bioAutomatica?.some((l: string) => l.includes("SPA-PERFIL-1")),
      JSON.stringify(r.json?.bioAutomatica));
    checa("rifas realizadas conta só a sorteada", r.json?.rifasRealizadas === 1, String(r.json?.rifasRealizadas));
    checa("destaque = rifa sorteada; grade = rifa no ar",
      r.json?.destaques?.[0]?.slug === "perfil-teste-sorteada" &&
      r.json?.rifas?.length === 1 && r.json?.rifas[0].slug === "perfil-teste-no-ar");
    checa("cidade do perfil", r.json?.local === "Campinas/SP", r.json?.local);

    r = await anonimo.req("POST", `/api/public/o/${SLUG}/seguir`);
    checa("seguir sem entrar: 401", r.status === 401, `HTTP ${r.status}`);

    const qr = await anonimo.req("GET", `/api/public/o/${SLUG}/qr.svg`);
    checa("QR code do perfil", qr.status === 200 && qr.tipo.includes("svg"), qr.tipo);

    r = await anonimo.req("GET", "/api/public/campaigns/perfil-teste-no-ar");
    checa("a rifa diz de quem é (para abrir dentro do perfil)", r.json?.organizacao?.slug === SLUG);

    // Duas contas de comprador.
    const [ana, bruno] = [new Cliente(), new Cliente()];
    for (const [c, p] of [[ana, PESSOAS[0]], [bruno, PESSOAS[1]]] as const) {
      const cr = await c.req("POST", "/api/public/conta", { ...p, cep: "01310-100", senha: "senha-perfil-1", lembrar: true });
      if (cr.status !== 201 && cr.status !== 200) throw new Error(`conta: HTTP ${cr.status} ${cr.json?.message}`);
    }

    r = await ana.req("PUT", `/api/public/o/${SLUG}/sino`, { ligado: true });
    checa("sino sem seguir: 409", r.status === 409, `HTTP ${r.status}`);

    // Cinco toques ao mesmo tempo: um seguidor só.
    const toques = await Promise.all(Array.from({ length: 5 }, () => ana.req("POST", `/api/public/o/${SLUG}/seguir`)));
    checa("seguir responde 200", toques.every((t) => t.status === 200));
    const [depois] = await db.select().from(organizations).where(eq(organizations.id, org.id));
    checa("cinco toques simultâneos contam um seguidor", depois.seguidoresCount === 1, String(depois.seguidoresCount));
    checa("seguir liga o sino junto", toques[0].json?.sino === true);

    r = await ana.req("PUT", `/api/public/o/${SLUG}/sino`, { ligado: false });
    checa("desliga o sino", r.status === 200 && r.json?.sino === false && r.json?.seguindo === true);

    await bruno.req("POST", `/api/public/o/${SLUG}/seguir`);
    r = await anonimo.req("GET", `/api/public/o/${SLUG}`);
    checa("dois seguidores", r.json?.seguidores === 2, String(r.json?.seguidores));
    checa("ninguém com perfil público: sem 'seguido por'", r.json?.seguidoPor === null, String(r.json?.seguidoPor));

    r = await ana.req("PUT", "/api/public/conta/perfil-publico", { publico: true });
    checa("liga o perfil público", r.status === 200 && r.json?.perfilPublico === true);
    r = await anonimo.req("GET", `/api/public/o/${SLUG}`);
    checa("só quem é público aparece, pelo primeiro nome",
      r.json?.seguidoPor === "Seguido por Ana e outra pessoa", String(r.json?.seguidoPor));
    checa("o perfil nunca devolve telefone de seguidor",
      !JSON.stringify(r.json).includes(PESSOAS[0].telefone) && !JSON.stringify(r.json).includes(PESSOAS[1].telefone));

    r = await ana.req("GET", "/api/public/seguindo");
    checa("a vitrine sabe quem a Ana segue", r.json?.[0]?.slug === SLUG);

    const saidas = await Promise.all([1, 2, 3].map(() => ana.req("DELETE", `/api/public/o/${SLUG}/seguir`)));
    const [fim] = await db.select().from(organizations).where(eq(organizations.id, org.id));
    checa("deixar de seguir três vezes desconta um", fim.seguidoresCount === 1, String(fim.seguidoresCount));
    checa("e diz que não segue mais", saidas.every((s) => s.json?.seguindo === false));

    await db.update(organizations).set({ archivedAt: new Date() }).where(eq(organizations.id, org.id));
    r = await anonimo.req("GET", `/api/public/o/${SLUG}`);
    checa("organização arquivada: perfil some (404)", r.status === 404, `HTTP ${r.status}`);
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
