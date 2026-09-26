/**
 * Prova do painel de resultados, pela API de verdade: os números batem com
 * as vendas; o organizador vê só a própria organização (confere os
 * **valores**, não só o 200); canal por venda (cambista, afiliado, origem do
 * site); origem desconhecida vira nula; estornos e seguidores novos do
 * período; e a foto do ganhador só depois do sorteio, com recorte.
 *
 *   npm run resultados      (com `npm run dev` no ar e o seed aplicado)
 */
import "dotenv/config";
import { baseUrl } from "./base-url";
import { eq, inArray, sql } from "drizzle-orm";
import sharp from "sharp";
import { db, pool } from "../server/db";
import { hashPassword } from "../server/auth";
import {
  affiliates,
  buyers,
  campaignStats,
  campaigns,
  orders,
  organizations,
  seguidores,
  users,
} from "../shared/schema";
import { diaNoFuso } from "../shared/resultados";

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
    return { status: r.status, tipo, json: tipo.includes("json") ? await r.json() : null };
  }
}

const SLUGS = ["resultados-teste-a", "resultados-teste-b"];
const EMAILS = ["resultados-a@teste.rifa", "resultados-b@teste.rifa", "resultados-afiliado@teste.rifa"];
const TELEFONES = ["11966660001", "11966660002", "11966660003"];

async function limpar() {
  const orgs = await db.select({ id: organizations.id }).from(organizations).where(inArray(organizations.slug, SLUGS));
  const ids = orgs.map((o) => o.id);
  if (ids.length) {
    const cs = (await db.select({ id: campaigns.id }).from(campaigns).where(inArray(campaigns.organizationId, ids))).map((c) => c.id);
    if (cs.length) {
      await db.execute(sql`delete from quota_alloc where campaign_id in ${sql.raw(`('${cs.join("','")}')`)}`);
      await db.execute(sql`delete from free_pool where campaign_id in ${sql.raw(`('${cs.join("','")}')`)}`);
      await db.execute(sql`delete from commissions where order_id in (select id from orders where campaign_id in ${sql.raw(`('${cs.join("','")}')`)})`);
      await db.execute(sql`delete from platform_charges where order_id in (select id from orders where campaign_id in ${sql.raw(`('${cs.join("','")}')`)})`);
      await db.delete(orders).where(inArray(orders.campaignId, cs));
    }
    await db.delete(seguidores).where(inArray(seguidores.organizationId, ids));
    await db.delete(campaigns).where(inArray(campaigns.organizationId, ids));
    await db.delete(users).where(inArray(users.email, EMAILS));
    await db.delete(organizations).where(inArray(organizations.id, ids));
  }
  await db.delete(affiliates).where(eq(affiliates.code, "RESA1"));
  await db.delete(users).where(inArray(users.email, EMAILS));
  await db.delete(buyers).where(inArray(buyers.phone, TELEFONES));
  await db.execute(sql`delete from rate_events where bucket like 'login:%' or bucket like 'order:%'`);
}

let codigo = 97_100_000;
async function venda(campaignId: string, buyerId: string, cents: number, extra: Partial<typeof orders.$inferInsert> = {}) {
  await db.insert(orders).values({
    code: codigo++,
    campaignId,
    buyerId,
    quantity: 2,
    amountCents: cents,
    status: "paid",
    paidAt: new Date(),
    expiresAt: new Date(Date.now() + 86_400_000),
    ...extra,
  });
}

async function main() {
  console.log("\n=== painel de resultados ===\n");
  await limpar();

  const lados = [];
  for (const [i, slug] of SLUGS.entries()) {
    const [org] = await db.insert(organizations).values({ slug, name: `Resultados ${i ? "B" : "A"}`, cidade: "Recife", uf: "PE" }).returning();
    await db.insert(users).values({
      role: "organizer",
      organizationId: org.id,
      name: `Organizador ${i ? "B" : "A"}`,
      email: EMAILS[i],
      passwordHash: await hashPassword("senha-resultados-1"),
    });
    const [c] = await db
      .insert(campaigns)
      .values({
        organizationId: org.id,
        slug: `${slug}-rifa`,
        title: "Moto",
        prizeTitle: `Moto ${i ? "B" : "A"}`,
        totalQuotas: 1000,
        priceCents: 500,
        status: "published",
        publishedAt: new Date(),
        drawAt: new Date(Date.now() + 10 * 86_400_000),
        authorizationCode: `SPA-RES-${i}`,
      })
      .returning();
    await db.insert(campaignStats).values({ campaignId: c.id });
    lados.push({ org, campanha: c });
  }
  const [a, b] = lados;
  const [comprador] = await db.insert(buyers).values({ name: "Carla Resultados", phone: TELEFONES[0] }).returning();
  const [usuarioAfiliado] = await db
    .insert(users)
    .values({ role: "affiliate", name: "Afiliado A", email: EMAILS[2], passwordHash: await hashPassword("senha-resultados-1") })
    .returning();
  const [afiliado] = await db.insert(affiliates).values({ userId: usuarioAfiliado.id, code: "RESA1" }).returning();

  try {
    // Vendas de A: 1.000 (perfil), 2.000 (story), 3.000 (afiliado), 500 estornada.
    await venda(a.campanha.id, comprador.id, 1000, { origem: "perfil" });
    await venda(a.campanha.id, comprador.id, 2000, { origem: "story" });
    await venda(a.campanha.id, comprador.id, 3000, { affiliateId: afiliado.id, origem: "story" });
    await venda(a.campanha.id, comprador.id, 500, { status: "refunded" });
    // Uma venda de 40 dias atrás: fora do período de 30.
    await venda(a.campanha.id, comprador.id, 9999, { paidAt: new Date(Date.now() - 40 * 86_400_000) });
    // Pendente não é receita.
    await venda(a.campanha.id, comprador.id, 7777, { status: "pending", paidAt: null });
    // Vendas de B: 50.000.
    await venda(b.campanha.id, comprador.id, 50_000, { origem: "banner" });
    await db.insert(seguidores).values({ organizationId: a.org.id, buyerId: comprador.id, sino: true });

    const orgA = new Cliente();
    let r = await orgA.req("POST", "/api/auth/login", { email: EMAILS[0], password: "senha-resultados-1" });
    if (r.status !== 200) throw new Error(`login A: HTTP ${r.status} ${r.json?.message ?? ""}`);

    r = await orgA.req("GET", "/api/admin/resultados?dias=30");
    const t = r.json?.totais;
    checa("receita de A: só pagas, no período, sem a vizinha", t?.receitaCents === 6000, String(t?.receitaCents));
    checa("pedidos pagos e ticket médio (arredondado para baixo)", t?.pedidos === 3 && t?.ticketMedioCents === 2000, `${t?.pedidos} · ${t?.ticketMedioCents}`);
    checa("cotas vendidas", t?.cotas === 6, String(t?.cotas));
    checa("estornos do período", t?.estornos?.pedidos === 1 && t?.estornos?.receitaCents === 500);
    checa("seguidores novos", t?.seguidoresNovos === 1, String(t?.seguidoresNovos));
    const hoje = r.json?.porDia?.[r.json.porDia.length - 1];
    checa("a série tem 30 dias e termina hoje (fuso de São Paulo)", r.json?.porDia?.length === 30 && hoje?.dia === diaNoFuso(new Date()) && hoje?.receitaCents === 6000, `${r.json?.porDia?.length} · ${hoje?.dia}`);
    const canal = (k: string) => r.json?.canais?.find((c: any) => c.canal === k);
    checa("canal: afiliado conta pela venda, mesmo com origem", canal("afiliado")?.receitaCents === 3000);
    checa("canal: story e perfil pela origem", canal("story")?.receitaCents === 2000 && canal("perfil")?.receitaCents === 1000);
    checa("participação em %", canal("afiliado")?.participacao === 50, String(canal("afiliado")?.participacao));
    checa("o banner da vizinha não aparece em A", !canal("banner"));
    checa("rifas que mais vendem: só a de A", r.json?.rifas?.length === 1 && r.json.rifas[0].id === a.campanha.id);

    r = await orgA.req("GET", `/api/admin/resultados?dias=90&organizacao=${b.org.id}`);
    checa("organizador não escolhe outra organização pelo ?organizacao=", r.json?.totais?.receitaCents === 6000 + 9999, String(r.json?.totais?.receitaCents));
    r = await orgA.req("GET", "/api/admin/resultados?dias=999");
    checa("período fora da lista vira 30 dias", r.json?.periodo?.dias === 30);

    const admin = new Cliente();
    r = await admin.req("POST", "/api/auth/login", {
      email: process.env.SEED_ADMIN_EMAIL ?? "admin@rifa.br",
      password: process.env.SEED_ADMIN_PASSWORD ?? "admin123",
    });
    if (r.status !== 200) throw new Error(`login do administrador: HTTP ${r.status}`);
    r = await admin.req("GET", `/api/admin/resultados?dias=7&organizacao=${b.org.id}`);
    checa("a plataforma escolhe uma organização", r.json?.totais?.receitaCents === 50_000 && r.json?.canais?.[0]?.canal === "banner");
    r = await admin.req("GET", "/api/admin/resultados?dias=7");
    checa("e vê a plataforma toda somada", (r.json?.totais?.receitaCents ?? 0) >= 56_000);

    // Origem gravada no pedido pelo site; valor inventado vira nulo.
    const anon = new Cliente();
    for (const [origem, tel] of [["story", TELEFONES[1]], ["hacker", TELEFONES[2]]] as const) {
      r = await anon.req("POST", "/api/public/orders", {
        campaignId: b.campanha.id,
        quantity: 1,
        buyer: { name: "Pessoa Origem", phone: tel },
        origem,
      });
      if (r.status !== 201) throw new Error(`pedido: HTTP ${r.status} ${r.json?.message ?? ""}`);
      const [o] = await db.select({ origem: orders.origem }).from(orders).where(eq(orders.code, r.json.code));
      checa(`origem "${origem}" gravada como ${origem === "story" ? "story" : "nula"}`, o?.origem === (origem === "story" ? "story" : null), String(o?.origem));
    }

    // Foto do ganhador: só depois do sorteio, com recorte.
    const foto = `data:image/jpeg;base64,${(await sharp({ create: { width: 900, height: 900, channels: 3, background: "#b45309" } }).jpeg().toBuffer()).toString("base64")}`;
    r = await orgA.req("PUT", `/api/admin/campaigns/${a.campanha.id}/foto-ganhador`, { foto });
    checa("foto do ganhador antes do sorteio: 409", r.status === 409, `HTTP ${r.status}`);
    await db.update(campaigns).set({ status: "drawn" }).where(eq(campaigns.id, a.campanha.id));
    await db.update(campaigns).set({ status: "drawn" }).where(eq(campaigns.id, b.campanha.id));
    r = await orgA.req("PUT", `/api/admin/campaigns/${b.campanha.id}/foto-ganhador`, { foto });
    checa("foto do ganhador na rifa da vizinha: 404", r.status === 404, `HTTP ${r.status}`);
    r = await orgA.req("PUT", `/api/admin/campaigns/${a.campanha.id}/foto-ganhador`, { foto });
    checa("depois do sorteio, publica", r.status === 200, `HTTP ${r.status} ${r.json?.message ?? ""}`);
    const perfil = (await anon.req("GET", `/api/public/o/${SLUGS[0]}`)).json;
    const capa = perfil?.destaques?.[0]?.capa as string | undefined;
    checa("vira a capa do destaque no perfil", Boolean(capa?.includes("/foto-ganhador")), capa);
    const img = await fetch(URL + (capa ?? "/nada"));
    const meta = img.status === 200 ? await sharp(Buffer.from(await img.arrayBuffer())).metadata() : null;
    checa("servida reprocessada: WebP 1080×1350", img.headers.get("content-type") === "image/webp" && meta?.width === 1080 && meta?.height === 1350, `${meta?.width}×${meta?.height}`);
    r = await orgA.req("PUT", `/api/admin/campaigns/${a.campanha.id}/foto-ganhador`, { foto: null });
    const semFoto = (await anon.req("GET", `/api/public/o/${SLUGS[0]}`)).json;
    checa("tirar a foto devolve a capa de antes", !semFoto?.destaques?.[0]?.capa?.includes("/foto-ganhador"));
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
