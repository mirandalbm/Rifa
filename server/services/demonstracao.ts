/**
 * Organização de demonstração: para a plataforma ver, em produção, como fica
 * um perfil completo — capa, foto, bio, cor de destaque, links e destaques
 * de rifas sorteadas com a foto do ganhador.
 *
 * Também põe rifas "no ar" na vitrine, para a página inicial ter o que
 * mostrar antes do lançamento — marcadas `campaigns.demonstracao`: o cartão
 * diz "Demonstração" no lugar do selo SPA/MF, a página não oferece compra e
 * `createOrder` recusa (site, cambista e bônus). Sem número de autorização,
 * sem usuário (ninguém entra como ela) e sem sorteio: a data fica longe e o
 * reset do lançamento apaga tudo.
 *
 * Remover é arquivar (DELETE de organização não existe): o perfil some na
 * hora, como o de qualquer arquivada. Criar de novo restaura e refaz.
 */
import { and, eq, inArray } from "drizzle-orm";
import sharp from "sharp";
import { db } from "../db";
import { campaignMedia, campaignStats, campaigns, organizations } from "@shared/schema";
import { salvarPerfil } from "./perfil";
import { salvarFotoDoGanhador } from "./ganhador";
import { archiveOrganization, restoreOrganization } from "./orgs";

export const SLUG_DA_DEMONSTRACAO = "demonstracao";

const DESTAQUES = [
  { slug: "demonstracao-moto-cg-160", titulo: "Honda CG 160 0 km", dias: 12, de: "#f5c542", para: "#00873E" },
  { slug: "demonstracao-iphone", titulo: "iPhone 16 Pro", dias: 40, de: "#6d28d9", para: "#0ea5e9" },
] as const;

const NO_AR = [
  { slug: "demonstracao-moto-pop-110i", titulo: "Honda Pop 110i 0 km", cotas: 100_000, preco: 199, de: "#0B1F14", para: "#00873E" },
  { slug: "demonstracao-pix-5-mil", titulo: "Pix de R$ 5.000", cotas: 50_000, preco: 99, de: "#6B4B00", para: "#FFC700" },
  { slug: "demonstracao-smart-tv-55", titulo: "Smart TV 55\" 4K", cotas: 20_000, preco: 149, de: "#1e1b4b", para: "#6d28d9" },
] as const;

/** Imagem de exemplo em SVG, direto no banco (data URI): não depende do disco. */
function svg(w: number, h: number, de: string, para: string, texto: string, sub: string) {
  const corpo = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
    <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${de}"/><stop offset="1" stop-color="${para}"/></linearGradient></defs>
    <rect width="${w}" height="${h}" fill="url(#g)"/>
    <circle cx="${w * 0.84}" cy="${h * 0.22}" r="${h * 0.3}" fill="#FFC700" fill-opacity=".16"/>
    <text x="${w / 2}" y="${h * 0.5}" text-anchor="middle" font-family="Helvetica,Arial,sans-serif"
      font-size="${h * 0.09}" font-weight="700" fill="#fff" fill-opacity=".9">${texto}</text>
    <text x="${w / 2}" y="${h * 0.62}" text-anchor="middle" font-family="Helvetica,Arial,sans-serif"
      font-size="${h * 0.045}" fill="#fff" fill-opacity=".6">${sub}</text>
  </svg>`;
  return `data:image/svg+xml;base64,${Buffer.from(corpo).toString("base64")}`;
}

/** Imagem de exemplo, desenhada aqui: nada de foto de terceiro. */
async function imagem(w: number, h: number, de: string, para: string, texto: string): Promise<string> {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">
    <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${de}"/><stop offset="1" stop-color="${para}"/></linearGradient></defs>
    <rect width="${w}" height="${h}" fill="url(#g)"/>
    <circle cx="${w * 0.82}" cy="${h * 0.25}" r="${Math.min(w, h) * 0.28}" fill="#fff" fill-opacity=".12"/>
    <text x="${w / 2}" y="${h * 0.56}" text-anchor="middle" font-family="Helvetica,Arial,sans-serif"
      font-size="${Math.min(w, h) * 0.12}" font-weight="700" fill="#fff">${texto}</text>
  </svg>`;
  const png = await sharp(Buffer.from(svg)).png().toBuffer();
  return `data:image/png;base64,${png.toString("base64")}`;
}

export async function criarDemonstracao(baseUrl: string) {
  let [org] = await db.select().from(organizations).where(eq(organizations.slug, SLUG_DA_DEMONSTRACAO));
  if (org?.archivedAt) await restoreOrganization(org.id);
  if (!org) {
    [org] = await db
      .insert(organizations)
      .values({ name: "Demonstração", slug: SLUG_DA_DEMONSTRACAO, cidade: "São Paulo", uf: "SP" })
      .onConflictDoNothing()
      .returning();
    // Dois cliques ao mesmo tempo: o outro criou, esta lê.
    if (!org) [org] = await db.select().from(organizations).where(eq(organizations.slug, SLUG_DA_DEMONSTRACAO));
  }
  await db
    .update(organizations)
    .set({ active: true, observacao: "Perfil de demonstração — sem rifa à venda." })
    .where(eq(organizations.id, org.id));

  const site = /^https:\/\//.test(baseUrl) ? baseUrl.replace(/\/+$/, "") : null;
  await salvarPerfil(org.id, {
    bio: "Perfil de demonstração da plataforma.\nAssim fica a página de uma organização com capa, cor e links.",
    destaque: { claro: "#6d28d9", escuro: "#c4b5fd" },
    links: [
      { rotulo: "Instagram", url: "https://www.instagram.com/" },
      ...(site ? [{ rotulo: "Nosso site", url: `${site}/` }] : []),
    ],
    foto: await imagem(400, 400, "#0B1F14", "#00873E", "DEMO"),
    capa: await imagem(1500, 500, "#4c1d95", "#db2777", "Demonstração"),
  });

  // Rifas já sorteadas: viram os círculos de destaque, com a foto do ganhador.
  for (const d of DESTAQUES) {
    const quando = new Date(Date.now() - d.dias * 86_400_000);
    await db
      .insert(campaigns)
      .values({
        organizationId: org.id,
        slug: d.slug,
        title: d.titulo,
        prizeTitle: d.titulo,
        description: "Rifa de demonstração — não houve venda.",
        totalQuotas: 1000,
        priceCents: 100,
        status: "drawn",
        drawAt: quando,
      })
      .onConflictDoNothing();
    const [c] = await db
      .select({ id: campaigns.id })
      .from(campaigns)
      .where(and(eq(campaigns.slug, d.slug), eq(campaigns.organizationId, org.id)));
    if (c) await salvarFotoDoGanhador(c.id, await imagem(1080, 1350, d.de, d.para, "GANHADOR"));
  }

  // Rifas "no ar" de demonstração: entram na vitrine, nunca vendem.
  const sorteio = new Date(Date.now() + 60 * 86_400_000);
  for (const r of NO_AR) {
    await db
      .insert(campaigns)
      .values({
        organizationId: org.id,
        slug: r.slug,
        title: r.titulo,
        prizeTitle: r.titulo,
        description: "Rifa de demonstração — exemplo de como fica uma rifa na plataforma. Não está à venda.",
        totalQuotas: r.cotas,
        priceCents: r.preco,
        status: "published",
        publishedAt: new Date(),
        drawAt: sorteio,
        demonstracao: true,
      })
      .onConflictDoNothing();
    const [c] = await db
      .select({ id: campaigns.id })
      .from(campaigns)
      .where(and(eq(campaigns.slug, r.slug), eq(campaigns.organizationId, org.id)));
    if (!c) continue;
    // Refazer (ou recriar depois de remover) põe no ar de novo.
    await db
      .update(campaigns)
      .set({ status: "published", demonstracao: true, drawAt: sorteio })
      .where(eq(campaigns.id, c.id));
    await db.insert(campaignStats).values({ campaignId: c.id }).onConflictDoNothing();
    const [temMidia] = await db
      .select({ id: campaignMedia.id })
      .from(campaignMedia)
      .where(eq(campaignMedia.campaignId, c.id))
      .limit(1);
    if (!temMidia) {
      await db.insert(campaignMedia).values([
        { campaignId: c.id, role: "banner", position: 0, storageKey: svg(1600, 900, r.de, r.para, r.titulo, "demonstração"), mime: "image/svg+xml", status: "ready" },
        ...[1, 2, 3].map((i) => ({
          campaignId: c.id,
          role: "photo" as const,
          position: i,
          storageKey: svg(1200, 900, r.para, r.de, r.titulo, `foto ${i}`),
          mime: "image/svg+xml",
          status: "ready" as const,
        })),
      ]);
    }
  }

  return { slug: SLUG_DA_DEMONSTRACAO };
}

export async function removerDemonstracao() {
  const [org] = await db
    .select({ id: organizations.id, archivedAt: organizations.archivedAt })
    .from(organizations)
    .where(eq(organizations.slug, SLUG_DA_DEMONSTRACAO));
  if (!org || org.archivedAt) return { ok: true };
  // As rifas de demonstração saem do ar antes (voltam a rascunho). Se alguém
  // publicou outra rifa de verdade aqui, o arquivamento recusa, como para
  // qualquer organização.
  await db
    .update(campaigns)
    .set({ status: "draft" })
    .where(and(eq(campaigns.organizationId, org.id), eq(campaigns.demonstracao, true)));
  await archiveOrganization(org.id);
  return { ok: true };
}

export async function situacaoDaDemonstracao() {
  const [org] = await db
    .select({ id: organizations.id, archivedAt: organizations.archivedAt })
    .from(organizations)
    .where(eq(organizations.slug, SLUG_DA_DEMONSTRACAO));
  const rifas = org
    ? await db
        .select({ id: campaigns.id })
        .from(campaigns)
        .where(and(eq(campaigns.organizationId, org.id), inArray(campaigns.slug, [...DESTAQUES, ...NO_AR].map((d) => d.slug))))
    : [];
  return { existe: Boolean(org && !org.archivedAt), slug: SLUG_DA_DEMONSTRACAO, rifas: rifas.length };
}
