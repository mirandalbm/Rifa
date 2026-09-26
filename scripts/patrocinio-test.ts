/**
 * Prova das rifas patrocinadas por clique (etapa 15), pela API de verdade:
 *
 * - desligado (padrão), o bloco vem vazio e nada é cobrado; só a plataforma
 *   liga (organizador: 403) e ligar não mexe no resto da configuração;
 * - recarga por Pix: mínimo conferido, crédito uma vez só (webhook repetido);
 * - patrocinar só rifa própria no ar (a do vizinho é 404), uma vez por rifa;
 * - clique: uma vez por aparelho em 24 h, robô e aparelho sem identificação
 *   não contam, saldo não fica negativo e, sem saldo, a rifa sai do bloco;
 * - ajuste só da plataforma, sem deixar o saldo negativo;
 * - retorno: cliques, gasto e as vendas que vieram do bloco.
 *
 *   npm run patrocinio      (com `npm run dev` no ar e o seed aplicado)
 */
import "dotenv/config";
import { baseUrl } from "./base-url";
import { eq, inArray, sql } from "drizzle-orm";
import { db, pool } from "../server/db";
import { hashPassword } from "../server/auth";
import { appSettings, campaignStats, campaigns, orders, organizations, patrocinioRecargas, users } from "../shared/schema";

const URL = baseUrl();
let falhas = 0;
const checa = (n: string, ok: boolean, d = "") => {
  console.log(`  ${ok ? "✓" : "✗"} ${n}${d ? ` (${d})` : ""}`);
  if (!ok) falhas++;
};

const NAVEGADOR = "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Mobile Safari/537.36";

class Cliente {
  cookie = "";
  constructor(readonly aparelho?: string, readonly agente = NAVEGADOR) {}
  async req(metodo: string, caminho: string, corpo?: unknown) {
    const r = await fetch(URL + caminho, {
      method: metodo,
      headers: {
        "Content-Type": "application/json",
        "User-Agent": this.agente,
        ...(this.cookie ? { Cookie: this.cookie } : {}),
        ...(this.aparelho ? { "x-device-id": this.aparelho } : {}),
      },
      body: corpo === undefined ? undefined : JSON.stringify(corpo),
    });
    const sc = r.headers.get("set-cookie");
    if (sc) this.cookie = sc.split(";")[0];
    const tipo = r.headers.get("content-type") ?? "";
    return { status: r.status, json: tipo.includes("json") ? await r.json() : null };
  }
  async entrar(email: string, password: string) {
    const r = await this.req("POST", "/api/auth/login", { email, password });
    if (r.status !== 200) throw new Error(`login ${email}: HTTP ${r.status}`);
    return this;
  }
}

const SLUGS = ["patrocinio-a", "patrocinio-b"];
const EMAILS = ["patrocinio-a@teste.rifa", "patrocinio-b@teste.rifa"];
const SENHA = "senha-patrocinio-1";

async function limpar() {
  const os = await db.select({ id: organizations.id }).from(organizations).where(inArray(organizations.slug, SLUGS));
  const ids = os.map((o) => o.id);
  if (ids.length) {
    const l = sql.raw(`('${ids.join("','")}')`);
    await db.execute(sql`delete from patrocinio_cliques where organization_id in ${l}`);
    await db.execute(sql`delete from patrocinios where organization_id in ${l}`);
    await db.execute(sql`delete from patrocinio_lancamentos where organization_id in ${l}`);
    await db.execute(sql`delete from patrocinio_recargas where organization_id in ${l}`);
    await db.execute(sql`delete from quota_alloc where campaign_id in (select id from campaigns where organization_id in ${l})`);
    await db.execute(sql`delete from platform_charges where order_id in (select id from orders where campaign_id in (select id from campaigns where organization_id in ${l}))`);
    await db.execute(sql`delete from orders where campaign_id in (select id from campaigns where organization_id in ${l})`);
    await db.execute(sql`delete from campaigns where organization_id in ${l}`);
  }
  await db.delete(users).where(inArray(users.email, EMAILS));
  if (ids.length) await db.delete(organizations).where(inArray(organizations.id, ids));
  await db.execute(sql`delete from buyers where phone like '1194443%'`);
  await db.execute(sql`delete from rate_events where bucket like 'patrocinio-%' or bucket like 'login:%' or bucket like 'order:%'`);
}

async function saldo(id: string) {
  const [o] = await db.select({ s: organizations.patrocinioSaldoCents }).from(organizations).where(eq(organizations.id, id));
  return o.s;
}

async function main() {
  console.log("\n=== rifas patrocinadas ===\n");
  await limpar();
  const [antes] = await db.select().from(appSettings).where(eq(appSettings.key, "plataforma"));

  const orgs: { id: string }[] = [];
  const rifas: { id: string; slug: string }[] = [];
  const clientes: Cliente[] = [];
  for (const [i, slug] of SLUGS.entries()) {
    const [o] = await db.insert(organizations).values({ slug, name: `Patrocínio ${i ? "B" : "A"}`, cnpj: "11222333000181" }).returning();
    await db.insert(users).values({ role: "organizer", organizationId: o.id, name: `Org ${i}`, email: EMAILS[i], passwordHash: await hashPassword(SENHA) });
    const [c] = await db
      .insert(campaigns)
      .values({
        organizationId: o.id,
        slug: `${slug}-rifa`,
        title: `Rifa ${slug}`,
        prizeTitle: "Moto",
        totalQuotas: 1000,
        priceCents: 500,
        status: "published",
        publishedAt: new Date(),
        drawAt: new Date(Date.now() + 10 * 86_400_000),
        authorizationCode: "SPA-PATROCINIO",
        authorizationFileKey: "certificado-teste",
      })
      .returning();
    await db.insert(campaignStats).values({ campaignId: c.id });
    orgs.push(o);
    rifas.push(c);
    clientes.push(await new Cliente().entrar(EMAILS[i], SENHA));
  }
  const [A, B] = orgs;
  const [rA, rB] = rifas;
  const [orgA, orgB] = clientes;
  const admin = await new Cliente().entrar("admin@rifa.br", "admin123");
  const clique = (pid: string, c: Cliente) => c.req("POST", `/api/public/patrocinadas/${pid}/clique`);

  try {
    await admin.req("PUT", "/api/admin/patrocinio/config", { ligado: false });
    let r = await new Cliente().req("GET", "/api/public/patrocinadas");
    checa("desligado: bloco vazio", Array.isArray(r.json) && r.json.length === 0);
    r = await orgA.req("POST", "/api/admin/patrocinio/patrocinios", { campaignId: rA.id });
    checa("desligado: não patrocina (409)", r.status === 409, `HTTP ${r.status}`);

    r = await orgA.req("PUT", "/api/admin/patrocinio/config", { ligado: true });
    checa("organizador não liga (403)", r.status === 403, `HTTP ${r.status}`);
    const cfgAntes = (await admin.req("GET", "/api/admin/plataforma")).json;
    r = await admin.req("PUT", "/api/admin/patrocinio/config", { ligado: true, precoCliqueCents: 50, recargaMinimaCents: 1000 });
    checa("a plataforma liga, com preço e mínimo", r.status === 200 && r.json?.ligado === true && r.json?.precoCliqueCents === 50, `HTTP ${r.status}`);
    const cfgDepois = (await admin.req("GET", "/api/admin/plataforma")).json;
    checa("ligar não mexe no resto", cfgDepois.estornoManual === cfgAntes.estornoManual && cfgDepois.bonusLigado === cfgAntes.bonusLigado);

    // Recarga.
    r = await orgA.req("POST", "/api/admin/patrocinio/recargas", { valorCents: 500 });
    checa("abaixo do mínimo: 400", r.status === 400, `HTTP ${r.status}`);
    r = await orgA.req("POST", "/api/admin/patrocinio/recargas", { valorCents: 2000 });
    checa("recarga gera Pix", r.status === 201 && r.json?.codigo >= 900_000_000 && Boolean(r.json?.pix?.copyPaste), `HTTP ${r.status} ${r.json?.message ?? ""}`);
    const codigo = r.json?.codigo;
    checa("antes do Pix, saldo zero", (await saldo(A.id)) === 0);
    await fetch(`${URL}/api/dev/recarga/${codigo}`, { method: "POST" });
    await fetch(`${URL}/api/dev/recarga/${codigo}`, { method: "POST" });
    checa("pago: credita uma vez só", (await saldo(A.id)) === 2000, String(await saldo(A.id)));
    const [rec] = await db.select().from(patrocinioRecargas).where(eq(patrocinioRecargas.codigo, codigo));
    checa("a recarga fica paga", rec.status === "paga");
    r = await admin.req("POST", "/api/admin/patrocinio/recargas", { valorCents: 2000 });
    checa("a plataforma não recarrega (usa ajuste)", r.status === 400, `HTTP ${r.status}`);

    // Patrocinar.
    r = await orgA.req("POST", "/api/admin/patrocinio/patrocinios", { campaignId: rB.id });
    checa("a rifa do vizinho é 404", r.status === 404, `HTTP ${r.status}`);
    r = await orgA.req("POST", "/api/admin/patrocinio/patrocinios", { campaignId: rA.id });
    checa("patrocina a própria rifa", r.status === 201, `HTTP ${r.status} ${r.json?.message ?? ""}`);
    const pA = r.json?.id as string;
    r = await orgA.req("POST", "/api/admin/patrocinio/patrocinios", { campaignId: rA.id });
    checa("a mesma rifa duas vezes: 409", r.status === 409, `HTTP ${r.status}`);

    // Ajuste da plataforma para a B.
    r = await orgA.req("POST", "/api/admin/patrocinio/ajustes", { organizationId: B.id, valorCents: 100, descricao: "crédito de teste" });
    checa("organizador não ajusta saldo (403)", r.status === 403, `HTTP ${r.status}`);
    r = await admin.req("POST", "/api/admin/patrocinio/ajustes", { organizationId: B.id, valorCents: 100, descricao: "Crédito de boas-vindas" });
    checa("a plataforma credita", r.status === 200 && r.json?.saldoCents === 100, `HTTP ${r.status}`);
    r = await admin.req("POST", "/api/admin/patrocinio/ajustes", { organizationId: B.id, valorCents: -500, descricao: "Débito maior que o saldo" });
    checa("ajuste não deixa o saldo negativo (409)", r.status === 409 && (await saldo(B.id)) === 100, `HTTP ${r.status}`);
    r = await orgB.req("POST", "/api/admin/patrocinio/patrocinios", { campaignId: rB.id });
    const pB = r.json?.id as string;
    r = await orgB.req("POST", `/api/admin/patrocinio/patrocinios/${pA}/pausar`);
    checa("o vizinho não pausa (404)", r.status === 404, `HTTP ${r.status}`);

    r = await new Cliente().req("GET", "/api/public/patrocinadas");
    checa("as duas no bloco", r.json?.length === 2 && r.json.some((x: any) => x.id === pA) && r.json.some((x: any) => x.id === pB), JSON.stringify(r.json));

    // Cliques.
    await clique(pA, new Cliente("aparelho-1"));
    checa("clique cobra o preço", (await saldo(A.id)) === 1950, String(await saldo(A.id)));
    await Promise.all([clique(pA, new Cliente("aparelho-1")), clique(pA, new Cliente("aparelho-1"))]);
    checa("o mesmo aparelho em 24 h não cobra de novo", (await saldo(A.id)) === 1950);
    await clique(pA, new Cliente("aparelho-2", "Googlebot/2.1 (+http://www.google.com/bot.html)"));
    await clique(pA, new Cliente(undefined));
    checa("robô e aparelho sem identificação não contam", (await saldo(A.id)) === 1950);
    await Promise.all([clique(pA, new Cliente("aparelho-3")), clique(pA, new Cliente("aparelho-4"))]);
    checa("aparelhos diferentes contam", (await saldo(A.id)) === 1850, String(await saldo(A.id)));

    await clique(pB, new Cliente("aparelho-1"));
    await clique(pB, new Cliente("aparelho-2"));
    await clique(pB, new Cliente("aparelho-3"));
    checa("sem saldo, para de cobrar (nunca negativo)", (await saldo(B.id)) === 0, String(await saldo(B.id)));
    r = await new Cliente().req("GET", "/api/public/patrocinadas");
    checa("sem saldo, sai do bloco", r.json?.length === 1 && r.json[0].id === pA);

    // Retorno: uma venda que veio do bloco.
    const compra = await new Cliente("aparelho-5").req("POST", "/api/public/orders", {
      campaignId: rA.id,
      quantity: 2,
      buyer: { name: "Comprador Patrocínio", phone: "11944430001" },
      origem: "patrocinada",
    });
    await fetch(`${URL}/api/dev/pay/${compra.json?.code}`, { method: "POST" });
    r = await orgA.req("GET", "/api/admin/patrocinio");
    const ret = r.json?.retorno?.find((x: any) => x.campaignId === rA.id);
    checa("retorno: 3 cliques, R$ 1,50, 1 venda", ret?.cliques === 3 && ret?.gastoCents === 150 && ret?.vendas === 1 && ret?.custoPorVendaCents === 150, JSON.stringify(ret));
    checa("a organização só vê o próprio retorno", !r.json?.retorno?.some((x: any) => x.campaignId === rB.id));
    const [pedido] = await db.select().from(orders).where(eq(orders.code, compra.json?.code));
    checa("a origem da venda fica gravada", pedido?.origem === "patrocinada");
    r = await admin.req("GET", "/api/admin/patrocinio");
    checa("a plataforma vê o saldo de todas", r.json?.plataforma === true && r.json.organizacoes.some((o: any) => o.id === A.id && o.saldoCents === 1850));

    // Pausar e desligar.
    r = await orgA.req("POST", `/api/admin/patrocinio/patrocinios/${pA}/pausar`);
    checa("pausa", r.status === 200 && r.json?.ativo === false);
    await clique(pA, new Cliente("aparelho-9"));
    checa("pausado não cobra", (await saldo(A.id)) === 1850);
    await orgA.req("POST", "/api/admin/patrocinio/patrocinios", { campaignId: rA.id });
    await admin.req("PUT", "/api/admin/patrocinio/config", { ligado: false });
    r = await new Cliente().req("GET", "/api/public/patrocinadas");
    checa("desligado: bloco vazio de novo", r.json?.length === 0);
    const [novo] = (await db.execute(sql`select id from patrocinios where campaign_id = ${rA.id}::uuid and ativo`)).rows as { id: string }[];
    await clique(novo.id, new Cliente("aparelho-8"));
    checa("desligado: clique não cobra, saldo fica", (await saldo(A.id)) === 1850);
  } finally {
    if (antes) await db.update(appSettings).set({ value: antes.value }).where(eq(appSettings.key, "plataforma"));
    else await db.delete(appSettings).where(eq(appSettings.key, "plataforma"));
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
