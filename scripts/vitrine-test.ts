/**
 * Prova da vitrine, pela API de verdade: banners da plataforma (só o
 * administrador geral, link seguro, janela, limite de 5), stories (24 h,
 * recorte por organização, rifa só da própria, limite, imagem que some ao
 * vencer), estados com rifa no ar e o feed com perfil e autorização.
 * Devolve o estado de antes no fim.
 *
 *   npm run vitrine      (com `npm run dev` no ar e o seed aplicado)
 */
import "dotenv/config";
import { baseUrl } from "./base-url";
import { eq, notInArray, sql } from "drizzle-orm";
import sharp from "sharp";
import { db, pool } from "../server/db";
import { campaignStats, campaigns, organizations, plataformaBanners, stories } from "../shared/schema";
import { apagarStoriesVencidos } from "../server/services/vitrine";
import { BANNERS_MAX, STORIES_MAX } from "../shared/vitrine";

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

const VIZINHA = "vitrine-teste-vizinha";

async function imagem(cor: string, largura = 800, altura = 800) {
  const b = await sharp({ create: { width: largura, height: altura, channels: 3, background: cor } }).jpeg().toBuffer();
  return `data:image/jpeg;base64,${b.toString("base64")}`;
}

async function medir(caminho: string) {
  const r = await fetch(URL + caminho);
  if (r.status !== 200) return { status: r.status, tipo: "", largura: 0, altura: 0 };
  const m = await sharp(Buffer.from(await r.arrayBuffer())).metadata();
  return { status: r.status, tipo: r.headers.get("content-type") ?? "", largura: m.width ?? 0, altura: m.height ?? 0 };
}

async function limparVizinha() {
  await db.execute(sql`delete from campaigns where organization_id in (select id from organizations where slug = ${VIZINHA})`);
  await db.execute(sql`delete from organizations where slug = ${VIZINHA}`);
}

async function main() {
  console.log("\n=== vitrine ===\n");
  // Os banners de antes saem durante o teste (ele cria até o limite) e
  // voltam inteiros no fim.
  const bannersAntes = await db.select().from(plataformaBanners);
  const storiesAntes = (await db.select({ id: stories.id }).from(stories)).map((s) => s.id);
  await limparVizinha();

  const [vizinha] = await db
    .insert(organizations)
    .values({ slug: VIZINHA, name: "Vizinha da Vitrine", cidade: "Salvador", uf: "BA" })
    .returning();
  const [rifaVizinha] = await db
    .insert(campaigns)
    .values({
      organizationId: vizinha.id,
      slug: "vitrine-teste-vizinha-no-ar",
      title: "Bicicleta",
      prizeTitle: "Bicicleta aro 29",
      totalQuotas: 500,
      priceCents: 300,
      status: "published",
      publishedAt: new Date(),
      drawAt: new Date(Date.now() + 7 * 86_400_000),
      authorizationCode: "SPA-VITRINE-1",
    })
    .returning();
  await db.insert(campaignStats).values({ campaignId: rifaVizinha.id });

  try {
    const anon = new Cliente();
    const admin = new Cliente();
    let r = await admin.req("POST", "/api/auth/login", {
      email: process.env.SEED_ADMIN_EMAIL ?? "admin@rifa.br",
      password: process.env.SEED_ADMIN_PASSWORD ?? "admin123",
    });
    if (r.status !== 200) throw new Error(`login do administrador: HTTP ${r.status}`);
    const marina = new Cliente();
    r = await marina.req("POST", "/api/auth/login", { email: "marina@rifassaojose.br", password: "organizador123" });
    if (r.status !== 200) throw new Error(`login da organizadora: HTTP ${r.status}`);

    /* ---------------- banners ---------------- */
    console.log("  — banners");
    const azul = await imagem("#1d4ed8", 1600, 900);
    r = await marina.req("POST", "/api/admin/banners", { imagem: azul, titulo: "Invasão" });
    checa("organizador não cria banner da plataforma (403)", r.status === 403, `HTTP ${r.status}`);
    r = await admin.req("POST", "/api/admin/banners", { imagem: azul, titulo: "Golpe", link: "//golpe.com" });
    checa("link //outro-site é recusado", r.status === 400, r.json?.message);
    r = await admin.req("POST", "/api/admin/banners", { imagem: azul, titulo: "Golpe", link: "javascript:alert(1)" });
    checa("link javascript: é recusado", r.status === 400, r.json?.message);
    r = await admin.req("POST", "/api/admin/banners", { imagem: "data:text/html;base64,PHNjcmlwdD4=", titulo: "Não é imagem" });
    checa("arquivo que não é imagem é recusado", r.status === 400, r.json?.message);

    // Abre espaço: o teste precisa criar até o limite.
    await db.delete(plataformaBanners);
    r = await admin.req("POST", "/api/admin/banners", { imagem: azul, titulo: "Promoção de verão", link: "/ajuda", segundos: 5 });
    const b1 = r.json?.id as string;
    checa("cria banner", r.status === 201 && Boolean(b1), `HTTP ${r.status} ${r.json?.message ?? ""}`);
    const img = await medir(r.json?.imagem ?? "/nada");
    checa("imagem reprocessada: WebP 1200×600", img.tipo === "image/webp" && img.largura === 1200 && img.altura === 600, `${img.tipo} ${img.largura}×${img.altura}`);
    r = await anon.req("GET", "/api/public/banners");
    checa("banner ligado aparece na vitrine", r.json?.some((b: any) => b.id === b1 && b.titulo === "Promoção de verão" && b.link === "/ajuda"));

    r = await admin.req("PATCH", `/api/admin/banners/${b1}`, { ativo: false });
    r = await anon.req("GET", "/api/public/banners");
    checa("desligado some da vitrine", !r.json?.some((b: any) => b.id === b1));
    r = await admin.req("PATCH", `/api/admin/banners/${b1}`, { ativo: true, inicio: new Date(Date.now() + 86_400_000).toISOString() });
    r = await anon.req("GET", "/api/public/banners");
    checa("com início amanhã, ainda não aparece", !r.json?.some((b: any) => b.id === b1));
    r = await admin.req("PATCH", `/api/admin/banners/${b1}`, { inicio: null });
    r = await anon.req("GET", "/api/public/banners");
    checa("sem janela, volta", r.json?.some((b: any) => b.id === b1));

    const ids = [b1];
    for (let i = 2; i <= BANNERS_MAX; i++) {
      r = await admin.req("POST", "/api/admin/banners", { imagem: azul, titulo: `Banner ${i}` });
      ids.push(r.json?.id);
    }
    const extras = await Promise.all(
      [1, 2].map(() => admin.req("POST", "/api/admin/banners", { imagem: azul, titulo: "Um a mais" })),
    );
    const [{ n: totalBanners }] = await db.select({ n: sql<number>`count(*)::int` }).from(plataformaBanners);
    checa(`limite de ${BANNERS_MAX}, mesmo com dois pedidos ao mesmo tempo`, extras.every((e) => e.status === 409) && totalBanners === BANNERS_MAX, `${extras.map((e) => e.status)} · ${totalBanners}`);
    r = await admin.req("PUT", "/api/admin/banners/ordem", { ids: [...ids].reverse() });
    r = await anon.req("GET", "/api/public/banners");
    checa("reordenar muda a ordem da vitrine", r.json?.[0]?.id === ids[ids.length - 1]);
    r = await admin.req("PUT", "/api/admin/banners/ordem", { ids: ids.slice(1) });
    checa("ordem sem todos os banners é recusada", r.status === 400);

    /* ---------------- stories ---------------- */
    console.log("  — stories");
    const org = (await marina.req("GET", "/api/admin/organizer")).json;
    const minhas = ((await marina.req("GET", "/api/admin/campaigns")).json as any[]).filter((c) => c.campaign.status === "published");
    const verde = await imagem("#16a34a", 900, 1600);

    r = await marina.req("POST", "/api/admin/stories", { imagem: verde, campaignId: rifaVizinha.id });
    checa("story não leva para rifa de outra organização", r.status === 400, r.json?.message);
    r = await marina.req("POST", "/api/admin/stories", { imagem: verde, legenda: "  Sorteio   sábado! ", campaignId: minhas[0]?.campaign.id });
    const s1 = r.json?.id as string;
    checa("organizadora posta story", r.status === 201 && Boolean(s1), `HTTP ${r.status} ${r.json?.message ?? ""}`);
    r = await admin.req("POST", "/api/admin/stories", { imagem: verde, organizacaoId: vizinha.id });
    const sVizinha = r.json?.id as string;
    checa("administrador geral posta para uma organização", r.status === 201);

    r = await anon.req("GET", `/api/public/o/${org.slug}/stories`);
    const meu = r.json?.stories?.find((s: any) => s.id === s1);
    checa("o perfil lista o story, com legenda limpa e a rifa", meu?.legenda === "Sorteio sábado!" && meu?.rifa?.slug === minhas[0]?.campaign.slug);
    checa("o perfil não mistura story de outra organização", !r.json?.stories?.some((s: any) => s.id === sVizinha));
    const simg = await medir(meu?.imagem ?? "/nada");
    checa("imagem do story: WebP 1080×1920", simg.tipo === "image/webp" && simg.largura === 1080 && simg.altura === 1920, `${simg.tipo} ${simg.largura}×${simg.altura}`);
    r = await anon.req("GET", `/api/public/o/${org.slug}`);
    const ultimo = r.json?.ultimoStory ? new Date(r.json.ultimoStory).getTime() : 0;
    checa("o perfil acende o anel (ultimoStory, em UTC)", Math.abs(ultimo - Date.now()) < 5 * 60_000, r.json?.ultimoStory);

    r = await marina.req("GET", "/api/admin/stories");
    checa("o painel da organizadora lista só os dela", r.json?.some((s: any) => s.id === s1) && !r.json?.some((s: any) => s.id === sVizinha));
    r = await marina.req("DELETE", `/api/admin/stories/${sVizinha}`);
    checa("apagar story da vizinha: 404", r.status === 404, `HTTP ${r.status}`);
    const [aindaLa] = await db.select({ id: stories.id }).from(stories).where(eq(stories.id, sVizinha));
    checa("e ele continua lá", Boolean(aindaLa));

    // Limite: completa até o máximo e tenta dois a mais ao mesmo tempo.
    const noAr = (await marina.req("GET", "/api/admin/stories")).json.length as number;
    for (let i = noAr; i < STORIES_MAX; i++) await marina.req("POST", "/api/admin/stories", { imagem: verde });
    const aMais = await Promise.all([1, 2].map(() => marina.req("POST", "/api/admin/stories", { imagem: verde })));
    const [{ n: meus }] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(stories)
      .where(sql`${stories.organizationId} = ${org.organizacaoId} and ${stories.expiraEm} > now()`);
    checa(`no máximo ${STORIES_MAX} no ar, mesmo ao mesmo tempo`, aMais.every((a) => a.status === 409) && meus === STORIES_MAX, `${aMais.map((a) => a.status)} · ${meus}`);

    // Vence: some da rota na hora, e o relógio tira do banco.
    await db.update(stories).set({ expiraEm: new Date(Date.now() - 1000) }).where(eq(stories.id, s1));
    r = await anon.req("GET", `/api/public/o/${org.slug}/stories`);
    checa("story vencido some do perfil", !r.json?.stories?.some((s: any) => s.id === s1));
    const vencida = await medir(`/api/public/stories/${s1}/imagem`);
    checa("e a imagem dele também (404)", vencida.status === 404, `HTTP ${vencida.status}`);
    await apagarStoriesVencidos();
    const [sumiu] = await db.select({ id: stories.id }).from(stories).where(eq(stories.id, s1));
    checa("o relógio apaga o vencido do banco", !sumiu);

    /* ---------------- estados e feed ---------------- */
    console.log("  — estados e feed");
    r = await anon.req("GET", "/api/public/estados?uf=BA");
    checa("estados com rifa no ar, o de quem olha primeiro", r.json?.[0]?.uf === "BA" && r.json?.[0]?.nome === "Bahia" && r.json?.[0]?.rifas >= 1, JSON.stringify(r.json?.slice(0, 3)));
    r = await anon.req("GET", "/api/public/campaigns?estado=BA");
    checa("/estado/BA traz só rifa da Bahia", r.json?.length >= 1 && r.json.every((c: any) => c.organizacao?.uf === "BA"));
    r = await anon.req("GET", "/api/public/campaigns?estado=XX");
    const todas = await anon.req("GET", "/api/public/campaigns");
    checa("estado inválido não filtra nada", r.json?.length === todas.json?.length);
    const c = todas.json?.find((x: any) => x.id === rifaVizinha.id);
    checa("o feed traz o selo da autorização e o perfil (com foto)", c?.autorizacao === "SPA-VITRINE-1" && c?.organizacao?.slug === VIZINHA && "foto" in (c?.organizacao ?? {}));
  } finally {
    await db.delete(stories).where(storiesAntes.length ? notInArray(stories.id, storiesAntes) : sql`true`);
    await db.delete(plataformaBanners);
    if (bannersAntes.length) await db.insert(plataformaBanners).values(bannersAntes);
    await limparVizinha();
  }

  console.log(falhas === 0 ? "\n  tudo certo\n" : `\n  ${falhas} verificação(ões) falharam\n`);
  await pool.end();
  process.exit(falhas === 0 ? 0 : 1);
}

main().catch(async (err) => {
  console.error(err);
  await limparVizinha().catch(() => {});
  await pool.end().catch(() => {});
  process.exit(1);
});
