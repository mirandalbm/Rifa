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
import {
  campaignMedia,
  campaignStats,
  campaigns,
  organizacaoCapas,
  organizacaoFotos,
  organizations,
} from "@shared/schema";
import { salvarPerfil } from "./perfil";
import { apagarNoStream } from "./streamPendentes";
import { salvarFotoDoGanhador } from "./ganhador";
import { archiveOrganization, OrgScopeError, restoreOrganization } from "./orgs";
import { postarStory, VitrineError } from "./vitrine";

export const SLUG_DA_DEMONSTRACAO = "demonstracao";

const DESTAQUES = [
  { slug: "demonstracao-moto-cg-160", titulo: "Honda CG 160 0 km", dias: 12, de: "#f5c542", para: "#00873E" },
  { slug: "demonstracao-iphone", titulo: "iPhone 16 Pro", dias: 40, de: "#6d28d9", para: "#0ea5e9" },
] as const;

const NO_AR = [
  { slug: "demonstracao-moto-pop-110i", titulo: "Honda Pop 110i 0 km", cotas: 100_000, preco: 199, de: "#0B1F14", para: "#00873E" },
  { slug: "demonstracao-pix-5-mil", titulo: "Pix de R$ 5.000", cotas: 50_000, preco: 99, de: "#06305F", para: "#0A6FD6" },
  { slug: "demonstracao-smart-tv-55", titulo: "Smart TV 55\" 4K", cotas: 20_000, preco: 149, de: "#1e1b4b", para: "#6d28d9" },
] as const;

/** Texto dentro do SVG: nome de organização ou prêmio pode trazer "&" ou "<". */
function xml(t: string) {
  return t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** Imagem de exemplo em SVG, direto no banco (data URI): não depende do disco. */
function svg(w: number, h: number, de: string, para: string, texto: string, sub: string) {
  const corpo = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
    <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${de}"/><stop offset="1" stop-color="${para}"/></linearGradient></defs>
    <rect width="${w}" height="${h}" fill="url(#g)"/>
    <circle cx="${w * 0.84}" cy="${h * 0.22}" r="${h * 0.3}" fill="#0A6FD6" fill-opacity=".16"/>
    <text x="${w / 2}" y="${h * 0.5}" text-anchor="middle" font-family="Helvetica,Arial,sans-serif"
      font-size="${h * 0.09}" font-weight="700" fill="#fff" fill-opacity=".9">${xml(texto)}</text>
    <text x="${w / 2}" y="${h * 0.62}" text-anchor="middle" font-family="Helvetica,Arial,sans-serif"
      font-size="${h * 0.045}" fill="#fff" fill-opacity=".6">${xml(sub)}</text>
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
      font-size="${Math.min(w, h) * 0.12}" font-weight="700" fill="#fff">${xml(texto)}</text>
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

  // Stories de exemplo, levando à primeira rifa de demonstração no ar.
  const [primeira] = await db
    .select({ id: campaigns.id })
    .from(campaigns)
    .where(and(eq(campaigns.slug, NO_AR[0].slug), eq(campaigns.organizationId, org.id)));
  await storiesDeExemplo(org.id, primeira?.id ?? null, "Demonstração");

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

/* ------------------------------------------------------------------ *
 * Preencher com exemplo — organização de teste
 * ------------------------------------------------------------------ */

const PALETA = [
  { de: "#0B1F14", para: "#00873E" },
  { de: "#06305F", para: "#0A6FD6" },
  { de: "#1e1b4b", para: "#6d28d9" },
  { de: "#4c1d95", para: "#db2777" },
] as const;

/** As fotos da publicação de uma rifa de teste: banner e três fotos em SVG. */
async function midiaDeExemplo(campaignId: string, titulo: string, i: number) {
  const c = PALETA[i % PALETA.length];
  const saiu = await db.delete(campaignMedia).where(eq(campaignMedia.campaignId, campaignId)).returning({ streamUid: campaignMedia.streamUid });
  // O vídeo que estava no Stream sai junto (cobra por minuto guardado).
  for (const m of saiu) await apagarNoStream(m.streamUid);
  await db.insert(campaignMedia).values([
    { campaignId, role: "banner", position: 0, storageKey: svg(1600, 900, c.de, c.para, titulo, "rifa de teste"), mime: "image/svg+xml", status: "ready" },
    ...[1, 2, 3].map((n) => ({
      campaignId,
      role: "photo" as const,
      position: n,
      storageKey: svg(1200, 900, c.para, c.de, titulo, `foto ${n}`),
      mime: "image/svg+xml",
      status: "ready" as const,
    })),
  ]);
}

/** Stories de exemplo (vivem 24 h, como qualquer story). Passou do teto, para. */
async function storiesDeExemplo(orgId: string, campaignId: string | null, nome: string) {
  const textos = ["Sorteio chegando!", "Últimos números", "Obrigado, apoiadores!"];
  let feitos = 0;
  for (const [i, legenda] of textos.entries()) {
    const c = PALETA[(i + 1) % PALETA.length];
    try {
      await postarStory(orgId, {
        imagem: await imagem(1080, 1920, c.de, c.para, legenda),
        legenda: `${legenda} · ${nome}`.slice(0, 150),
        campaignId,
      });
      feitos++;
    } catch (e) {
      if (e instanceof VitrineError && e.status === 409) break;
      throw e;
    }
  }
  return feitos;
}

/**
 * Deixa uma organização de teste com cara de pronta, sem tocar no que ela
 * já tem de verdade: foto e capa só se faltarem; as fotos da publicação só
 * das rifas marcadas como teste; dois destaques (rifas de exemplo já
 * sorteadas, também marcadas, com foto do ganhador) e três stories.
 *
 * Recusa organização com rifa de verdade no ar (não marcada como teste):
 * exemplo em vitrine de promotor real seria propaganda falsa com o nome dele.
 */
export async function preencherComExemplo(orgId: string, baseUrl = "") {
  const [org] = await db.select().from(organizations).where(eq(organizations.id, orgId));
  if (!org || org.archivedAt) throw new OrgScopeError("Organização não encontrada.", 404);

  const rifas = await db
    .select({ id: campaigns.id, titulo: campaigns.prizeTitle, status: campaigns.status, demo: campaigns.demonstracao })
    .from(campaigns)
    .where(eq(campaigns.organizationId, orgId));
  if (rifas.some((r) => r.status === "published" && !r.demo)) {
    throw new OrgScopeError(
      "Esta organização tem rifa de verdade no ar. Marque como teste (em Campanhas) antes de preencher com exemplo.",
      409,
    );
  }

  // Links (redes sociais e contato): só se ainda não tiver nenhum. Apontam
  // para a rede (sem conta de ninguém) e para páginas do próprio site.
  if (!((org.links as unknown[] | null)?.length)) {
    const site = /^https:\/\//.test(baseUrl) ? baseUrl.replace(/\/+$/, "") : null;
    await salvarPerfil(orgId, {
      links: [
        { rotulo: "Instagram", url: "https://www.instagram.com/" },
        ...(site
          ? [
              { rotulo: "Fale conosco", url: `${site}/ajuda` },
              { rotulo: "Nosso site", url: `${site}/o/${org.slug}` },
            ]
          : []),
      ],
    });
  }

  // Foto e capa: só o que falta — a enviada pelo organizador fica.
  const [temFoto] = await db.select({ id: organizacaoFotos.organizationId }).from(organizacaoFotos).where(eq(organizacaoFotos.organizationId, orgId));
  const [temCapa] = await db.select({ id: organizacaoCapas.organizationId }).from(organizacaoCapas).where(eq(organizacaoCapas.organizationId, orgId));
  const iniciais = org.name.split(/\s+/).filter((p) => p.length > 2).slice(0, 2).map((p) => p[0].toUpperCase()).join("") || org.name.slice(0, 2).toUpperCase();
  if (!temFoto || !temCapa) {
    await salvarPerfil(orgId, {
      ...(temFoto ? {} : { foto: await imagem(400, 400, "#0B1F14", "#00873E", iniciais) }),
      ...(temCapa ? {} : { capa: await imagem(1500, 500, "#1e3a2f", "#2b3f7a", org.name) }),
    });
  }

  // Fotos da publicação das rifas de teste no ar.
  const noAr = rifas.filter((r) => r.demo && r.status === "published");
  for (const [i, r] of noAr.entries()) await midiaDeExemplo(r.id, r.titulo, i);

  // Destaques: duas rifas de exemplo já sorteadas, com foto do ganhador.
  const destaques = [
    { sufixo: "exemplo-sorteada-1", titulo: "Pix de R$ 2.000", dias: 15 },
    { sufixo: "exemplo-sorteada-2", titulo: "Smart TV 50\"", dias: 45 },
  ];
  for (const [i, d] of destaques.entries()) {
    const slug = `${org.slug}-${d.sufixo}`.slice(0, 80);
    await db
      .insert(campaigns)
      .values({
        organizationId: orgId,
        slug,
        title: d.titulo,
        prizeTitle: d.titulo,
        description: "Rifa de exemplo — não houve venda.",
        totalQuotas: 1000,
        priceCents: 100,
        status: "drawn",
        drawAt: new Date(Date.now() - d.dias * 86_400_000),
        demonstracao: true,
      })
      .onConflictDoNothing();
    const [c] = await db
      .select({ id: campaigns.id })
      .from(campaigns)
      .where(and(eq(campaigns.slug, slug), eq(campaigns.organizationId, orgId)));
    if (c) {
      const cor = PALETA[(i + 2) % PALETA.length];
      await salvarFotoDoGanhador(c.id, await imagem(1080, 1350, cor.de, cor.para, "GANHADOR"));
    }
  }

  const stories = await storiesDeExemplo(orgId, noAr[0]?.id ?? null, org.name);
  return { fotosDePublicacao: noAr.length, destaques: destaques.length, stories };
}
