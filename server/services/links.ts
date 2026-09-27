/**
 * Endereço curto (`/c/<codigo>`) do perfil e de cada rifa, e a contagem de
 * cliques nos links do perfil (redes sociais e contato, por `/l/<perfil>/<n>`).
 *
 * Redirecionamento só para destino guardado: o curto leva ao perfil ou à
 * rifa (caminho do próprio site); o `/l/` leva ao link número `n` que a
 * organização cadastrou — já conferido por `validarLinks()` (só https).
 * Nada vindo da URL vira destino, então ninguém usa a plataforma para
 * mandar gente a um site qualquer com o nome dela.
 */
import { randomInt } from "node:crypto";
import { and, eq, gte, sql } from "drizzle-orm";
import { db } from "../db";
import { campaigns, linksCurtos, organizations, perfilLinkCliques } from "@shared/schema";
import { ehRobo } from "@shared/patrocinio";
import type { LinkDoPerfil } from "@shared/perfil";

/** Sem 0/O, 1/I/L: o código é lido em voz alta e digitado à mão. */
const ALFABETO = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
const TAMANHO = 6;

function novoCodigo() {
  let c = "";
  for (let i = 0; i < TAMANHO; i++) c += ALFABETO[randomInt(ALFABETO.length)];
  return c;
}

type Destino = { tipo: "perfil"; organizationId: string } | { tipo: "rifa"; organizationId: string; campaignId: string };

async function existente(d: Destino) {
  const [l] = await db
    .select()
    .from(linksCurtos)
    .where(
      d.tipo === "perfil"
        ? and(eq(linksCurtos.tipo, "perfil"), eq(linksCurtos.organizationId, d.organizationId))
        : and(eq(linksCurtos.tipo, "rifa"), eq(linksCurtos.campaignId, d.campaignId)),
    );
  return l ?? null;
}

/**
 * O curto do destino, criado na primeira vez. O índice parcial decide "um
 * por destino" e o único do código decide colisão: `ON CONFLICT DO NOTHING`
 * e, se não entrou, lê o que existe — ou foi colisão de código, e tenta outro.
 */
async function garantir(d: Destino) {
  for (let tentativa = 0; tentativa < 6; tentativa++) {
    const [novo] = await db
      .insert(linksCurtos)
      .values({
        codigo: novoCodigo(),
        tipo: d.tipo,
        organizationId: d.organizationId,
        campaignId: d.tipo === "rifa" ? d.campaignId : null,
      })
      .onConflictDoNothing()
      .returning();
    if (novo) return novo;
    const ja = await existente(d);
    if (ja) return ja;
  }
  throw new Error("Não consegui gerar o endereço curto. Tente de novo.");
}

export async function linkCurtoDoPerfil(organizationId: string) {
  const l = await garantir({ tipo: "perfil", organizationId });
  return { codigo: l.codigo, caminho: `/c/${l.codigo}`, cliques: l.cliques };
}

export async function linkCurtoDaRifa(campaignId: string) {
  const [c] = await db
    .select({ id: campaigns.id, organizationId: campaigns.organizationId })
    .from(campaigns)
    .where(eq(campaigns.id, campaignId));
  if (!c?.organizationId) throw new Error("Rifa não encontrada.");
  const l = await garantir({ tipo: "rifa", organizationId: c.organizationId, campaignId: c.id });
  return { codigo: l.codigo, caminho: `/c/${l.codigo}`, cliques: l.cliques };
}

/**
 * Para onde o curto leva — caminho do próprio site, nunca endereço de fora.
 * Conta o acesso (gente; robô não) num `UPDATE`. Perfil arquivado ou rifa
 * em rascunho: `null` (404), como no resto.
 */
export async function resolverLinkCurto(codigo: string, userAgent: string | undefined) {
  const cod = codigo.toUpperCase();
  if (!/^[2-9A-Z]{6}$/.test(cod)) return null;
  const [l] = await db
    .select({
      id: linksCurtos.id,
      tipo: linksCurtos.tipo,
      orgSlug: organizations.slug,
      arquivada: organizations.archivedAt,
      rifaSlug: campaigns.slug,
      status: campaigns.status,
    })
    .from(linksCurtos)
    .innerJoin(organizations, eq(organizations.id, linksCurtos.organizationId))
    .leftJoin(campaigns, eq(campaigns.id, linksCurtos.campaignId))
    .where(eq(linksCurtos.codigo, cod));
  if (!l || l.arquivada) return null;
  let destino: string | null = null;
  if (l.tipo === "perfil") destino = `/o/${l.orgSlug}`;
  else if (l.rifaSlug && l.status !== "draft") destino = `/o/${l.orgSlug}/r/${l.rifaSlug}`;
  if (!destino) return null;
  if (!ehRobo(userAgent)) {
    await db.update(linksCurtos).set({ cliques: sql`${linksCurtos.cliques} + 1` }).where(eq(linksCurtos.id, l.id));
  }
  return destino;
}

/** Dia de São Paulo, AAAA-MM-DD — o mesmo dia que o organizador vê. */
function diaDeSaoPaulo(d = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(d);
}

/**
 * Link número `n` do perfil: conta o clique (gente) e devolve o endereço
 * cadastrado. Índice fora da lista ou perfil arquivado: `null` (404).
 */
export async function clicarLinkDoPerfil(slug: string, indice: number, userAgent: string | undefined) {
  if (!Number.isInteger(indice) || indice < 0) return null;
  const [org] = await db
    .select({ id: organizations.id, links: organizations.links, arquivada: organizations.archivedAt })
    .from(organizations)
    .where(eq(organizations.slug, slug));
  const link = (org?.links as LinkDoPerfil[] | null)?.[indice];
  if (!org || org.arquivada || !link) return null;
  if (!ehRobo(userAgent)) {
    await db
      .insert(perfilLinkCliques)
      .values({ organizationId: org.id, url: link.url, dia: diaDeSaoPaulo(), cliques: 1 })
      .onConflictDoUpdate({
        target: [perfilLinkCliques.organizationId, perfilLinkCliques.url, perfilLinkCliques.dia],
        set: { cliques: sql`${perfilLinkCliques.cliques} + 1` },
      });
  }
  return link.url;
}

/** Cliques por link nos últimos `dias`, na ordem em que os links aparecem. */
export async function cliquesDosLinks(organizationId: string, dias = 30) {
  const [org] = await db
    .select({ links: organizations.links })
    .from(organizations)
    .where(eq(organizations.id, organizationId));
  const desde = diaDeSaoPaulo(new Date(Date.now() - (dias - 1) * 86_400_000));
  const linhas = await db
    .select({ url: perfilLinkCliques.url, cliques: sql<number>`sum(${perfilLinkCliques.cliques})::int` })
    .from(perfilLinkCliques)
    .where(and(eq(perfilLinkCliques.organizationId, organizationId), gte(perfilLinkCliques.dia, desde)))
    .groupBy(perfilLinkCliques.url);
  const porUrl = new Map(linhas.map((l) => [l.url, l.cliques]));
  return {
    dias,
    links: ((org?.links as LinkDoPerfil[] | null) ?? []).map((l) => ({
      rotulo: l.rotulo,
      url: l.url,
      cliques: porUrl.get(l.url) ?? 0,
    })),
  };
}
