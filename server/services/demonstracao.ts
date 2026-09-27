/**
 * Organização de demonstração: para a plataforma ver, em produção, como fica
 * um perfil completo — capa, foto, bio, cor de destaque, links e destaques
 * de rifas sorteadas com a foto do ganhador.
 *
 * O que ela NÃO tem, de propósito: rifa no ar. Rifa publicada entra na
 * vitrine e pode ser comprada, e aqui não há autorização SPA/MF de verdade.
 * Por isso também não há usuário (ninguém entra como ela) nem número de
 * autorização nas rifas sorteadas.
 *
 * Remover é arquivar (DELETE de organização não existe): o perfil some na
 * hora, como o de qualquer arquivada. Criar de novo restaura e refaz.
 */
import { and, eq, inArray } from "drizzle-orm";
import sharp from "sharp";
import { db } from "../db";
import { campaigns, organizations } from "@shared/schema";
import { salvarPerfil } from "./perfil";
import { salvarFotoDoGanhador } from "./ganhador";
import { archiveOrganization, restoreOrganization } from "./orgs";

export const SLUG_DA_DEMONSTRACAO = "demonstracao";

const DESTAQUES = [
  { slug: "demonstracao-moto-cg-160", titulo: "Honda CG 160 0 km", dias: 12, de: "#f5c542", para: "#00873E" },
  { slug: "demonstracao-iphone", titulo: "iPhone 16 Pro", dias: 40, de: "#6d28d9", para: "#0ea5e9" },
] as const;

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

  return { slug: SLUG_DA_DEMONSTRACAO };
}

export async function removerDemonstracao() {
  const [org] = await db
    .select({ id: organizations.id, archivedAt: organizations.archivedAt })
    .from(organizations)
    .where(eq(organizations.slug, SLUG_DA_DEMONSTRACAO));
  if (!org || org.archivedAt) return { ok: true };
  // Só as rifas dela são as de demonstração; se alguém publicou outra aqui,
  // o arquivamento recusa (rifa no ar), como para qualquer organização.
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
        .where(and(eq(campaigns.organizationId, org.id), inArray(campaigns.slug, DESTAQUES.map((d) => d.slug))))
    : [];
  return { existe: Boolean(org && !org.archivedAt), slug: SLUG_DA_DEMONSTRACAO, destaques: rifas.length };
}
