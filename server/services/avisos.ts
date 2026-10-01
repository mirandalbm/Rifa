/**
 * Os avisos do painel: os últimos comentários de apostador nas rifas do
 * recorte de quem está logado (`orgOf`: a organização vê as dela, a
 * plataforma vê todas). "Lido" é por pessoa (`users.avisos_vistos_em`):
 * abrir o sino marca tudo até agora como visto, e o que chegar depois volta
 * a contar.
 */
import type { Request } from "express";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { db } from "../db";
import { buyers, campaigns, comentarios, organizations, users } from "@shared/schema";
import { nomeNoComentario } from "@shared/comentarios";
import { AVISOS_MAX, trechoDoAviso, type AvisoDoPainel } from "@shared/avisos";
import { orgOf } from "./orgs";

export async function avisosDoPainel(req: Request): Promise<AvisoDoPainel[]> {
  // Só quem responde pela rifa: a plataforma e o organizador. O afiliado
  // também tem organização nula na conta, e nulo aqui abriria todas.
  if (req.user?.role !== "admin" && req.user?.role !== "organizer") return [];
  const org = orgOf(req);
  const [eu] = await db.select({ vistosEm: users.avisosVistosEm }).from(users).where(eq(users.id, req.user!.id));
  const vistosEm = eu?.vistosEm ?? null;
  const linhas = await db
    .select({
      id: comentarios.id,
      texto: comentarios.texto,
      createdAt: comentarios.createdAt,
      apelido: buyers.apelido,
      nome: buyers.name,
      titulo: campaigns.title,
      slug: campaigns.slug,
      orgSlug: organizations.slug,
    })
    .from(comentarios)
    .innerJoin(campaigns, eq(campaigns.id, comentarios.campaignId))
    .innerJoin(organizations, eq(organizations.id, comentarios.organizationId))
    .leftJoin(buyers, eq(buyers.id, comentarios.buyerId))
    .where(
      and(
        eq(comentarios.autor, "comprador"),
        isNull(comentarios.removidoEm),
        // O recorte é o da rifa, como em toda consulta do painel.
        org ? eq(campaigns.organizationId, org) : sql`TRUE`,
      ),
    )
    .orderBy(desc(comentarios.createdAt))
    .limit(AVISOS_MAX);
  return linhas.map((l) => ({
    id: l.id,
    tipo: "comentario" as const,
    quem: l.apelido ?? nomeNoComentario(l.nome),
    trecho: trechoDoAviso(l.texto),
    rifa: { titulo: l.titulo, slug: l.slug, orgSlug: l.orgSlug },
    createdAt: l.createdAt.toISOString(),
    lido: vistosEm !== null && l.createdAt <= vistosEm,
  }));
}

/** Abrir o sino: tudo até agora fica visto, para esta pessoa. */
export async function marcarAvisosVistos(req: Request): Promise<void> {
  await db.update(users).set({ avisosVistosEm: new Date() }).where(eq(users.id, req.user!.id));
}
