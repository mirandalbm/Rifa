/**
 * Comentários na publicação da rifa: o apostador com conta comenta e
 * responde; a organização dona da rifa responde e modera; a plataforma
 * modera todas. Regras de texto em `shared/comentarios.ts`.
 *
 * - O contador (`campaigns.comentarios_count`) anda na mesma transação que
 *   grava ou apaga — nunca `COUNT(*)` na vitrine.
 * - Apagar confere o dono **antes** (o comentário de outra organização é
 *   404) e é um `UPDATE` condicional: dois cliques, um desconto no contador.
 * - O apostador aparece pelo primeiro nome e a inicial; telefone nunca sai.
 */
import type { Request } from "express";
import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { db } from "../db";
import { buyers, campaigns, comentarios, organizations } from "@shared/schema";
import {
  COMENTARIOS_POR_JANELA,
  JANELA_DE_COMENTARIOS_MIN,
  limparComentario,
  nomeNoComentario,
  problemaNoComentario,
} from "@shared/comentarios";
import { mensagemRespostaAoComentario } from "@shared/push";
import { hit } from "./antifraude";
import { avisar, emSegundoPlano } from "./push";

export class ComentarioError extends Error {
  constructor(message: string, readonly status = 400) {
    super(message);
    this.name = "ComentarioError";
  }
}

const LISTA_MAX = 200;

async function rifaPublica(slug: string) {
  const [r] = await db
    .select({
      id: campaigns.id,
      slug: campaigns.slug,
      status: campaigns.status,
      organizationId: campaigns.organizationId,
      orgNome: organizations.name,
      orgSlug: organizations.slug,
    })
    .from(campaigns)
    .innerJoin(organizations, eq(organizations.id, campaigns.organizationId))
    .where(and(eq(campaigns.slug, slug), isNull(organizations.archivedAt)));
  if (!r || r.status === "draft") throw new ComentarioError("Rifa não encontrada.", 404);
  return r;
}

/** A organização dona desta rifa, pela sessão do painel. */
function ehDaOrganizacao(req: Request, orgId: string) {
  return req.user?.role === "organizer" && req.user.organizationId === orgId;
}

export async function listarComentarios(req: Request, slug: string) {
  const rifa = await rifaPublica(slug);
  const linhas = await db
    .select({
      id: comentarios.id,
      parentId: comentarios.parentId,
      autor: comentarios.autor,
      buyerId: comentarios.buyerId,
      texto: comentarios.texto,
      createdAt: comentarios.createdAt,
      nomeComprador: buyers.name,
    })
    .from(comentarios)
    .leftJoin(buyers, eq(buyers.id, comentarios.buyerId))
    .where(and(eq(comentarios.campaignId, rifa.id), isNull(comentarios.removidoEm)))
    .orderBy(desc(comentarios.createdAt))
    .limit(LISTA_MAX)
    // Os mais recentes entram no limite; a conversa volta à ordem do tempo.
    .then((r) => r.reverse());

  const moderador = ehDaOrganizacao(req, rifa.organizationId) || req.user?.role === "admin";
  const meuBuyer = req.session.buyer?.id ?? null;
  const publico = (l: (typeof linhas)[number]) => ({
    id: l.id,
    autor: l.autor as "comprador" | "organizacao",
    nome: l.autor === "organizacao" ? rifa.orgNome : nomeNoComentario(l.nomeComprador),
    texto: l.texto,
    createdAt: l.createdAt,
    meu: Boolean(meuBuyer && l.buyerId === meuBuyer && l.autor === "comprador"),
    podeApagar: moderador || Boolean(meuBuyer && l.buyerId === meuBuyer && l.autor === "comprador"),
  });
  const topo = linhas.filter((l) => !l.parentId);
  const respostas = new Map<string, ReturnType<typeof publico>[]>();
  for (const l of linhas) {
    if (l.parentId) respostas.set(l.parentId, [...(respostas.get(l.parentId) ?? []), publico(l)]);
  }
  return {
    organizacao: { nome: rifa.orgNome, slug: rifa.orgSlug },
    // Quem pode escrever: apostador com conta, ou a organização dona.
    podeComentar: Boolean(meuBuyer) || ehDaOrganizacao(req, rifa.organizationId),
    comoOrganizacao: ehDaOrganizacao(req, rifa.organizationId),
    // Mais novo em cima; as respostas, na ordem da conversa.
    lista: topo.reverse().map((l) => ({ ...publico(l), respostas: respostas.get(l.id) ?? [] })),
  };
}

export async function comentar(req: Request, slug: string, entrada: { texto?: unknown; respostaA?: unknown }) {
  const rifa = await rifaPublica(slug);
  const comoOrganizacao = ehDaOrganizacao(req, rifa.organizationId);
  const buyerId = req.session.buyer?.id ?? null;
  if (!comoOrganizacao && !buyerId) throw new ComentarioError("Entre na sua conta para comentar.", 401);

  // Erro de preenchimento sai antes de contar a tentativa.
  const problema = problemaNoComentario(entrada.texto);
  if (problema) throw new ComentarioError(problema, 400);
  const quem = comoOrganizacao ? `org:${req.user!.id}` : `comprador:${buyerId}`;
  const limite = await hit(`comentario:${quem}`, JANELA_DE_COMENTARIOS_MIN, COMENTARIOS_POR_JANELA);
  if (limite.excedeu) throw new ComentarioError("Muitos comentários seguidos. Espere alguns minutos.", 429);

  // Resposta vai sempre para o comentário do topo (uma camada só).
  let parentId: string | null = null;
  let autorDoPai: { buyerId: string | null; autor: string } | null = null;
  if (entrada.respostaA) {
    const id = String(entrada.respostaA);
    if (!/^[0-9a-f-]{36}$/i.test(id)) throw new ComentarioError("Comentário não encontrado.", 404);
    const [pai] = await db
      .select({ id: comentarios.id, parentId: comentarios.parentId, buyerId: comentarios.buyerId, autor: comentarios.autor })
      .from(comentarios)
      .where(and(eq(comentarios.id, id), eq(comentarios.campaignId, rifa.id), isNull(comentarios.removidoEm)));
    if (!pai) throw new ComentarioError("Comentário não encontrado.", 404);
    parentId = pai.parentId ?? pai.id;
    autorDoPai = { buyerId: pai.buyerId, autor: pai.autor };
  }

  const texto = limparComentario(String(entrada.texto));
  const novo = await db.transaction(async (tx) => {
    const [c] = await tx
      .insert(comentarios)
      .values({
        campaignId: rifa.id,
        organizationId: rifa.organizationId,
        parentId,
        autor: comoOrganizacao ? "organizacao" : "comprador",
        buyerId: comoOrganizacao ? null : buyerId,
        userId: comoOrganizacao ? req.user!.id : null,
        texto,
      })
      .returning();
    await tx
      .update(campaigns)
      .set({ comentariosCount: sql`${campaigns.comentariosCount} + 1` })
      .where(eq(campaigns.id, rifa.id));
    return c;
  });

  // A organização respondeu um apostador: ele fica sabendo (push e coração).
  if (comoOrganizacao && autorDoPai?.autor === "comprador" && autorDoPai.buyerId) {
    emSegundoPlano(
      avisar(
        [autorDoPai.buyerId],
        "comentario",
        novo.id,
        mensagemRespostaAoComentario({
          org: rifa.orgNome,
          texto,
          url: `/o/${rifa.orgSlug}/r/${rifa.slug}#comentarios`,
        }),
      ),
      "resposta ao comentário",
    );
  }
  return { id: novo.id };
}

/**
 * Apaga (marca). Pode: quem escreveu (apostador), a organização dona da
 * rifa e a plataforma. Para os demais, o comentário não existe (404).
 * Apagar o do topo leva as respostas junto.
 */
export async function apagarComentario(req: Request, id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new ComentarioError("Comentário não encontrado.", 404);
  const [c] = await db
    .select({
      id: comentarios.id,
      campaignId: comentarios.campaignId,
      organizationId: comentarios.organizationId,
      parentId: comentarios.parentId,
      autor: comentarios.autor,
      buyerId: comentarios.buyerId,
    })
    .from(comentarios)
    .where(and(eq(comentarios.id, id), isNull(comentarios.removidoEm)));
  const buyerId = req.session.buyer?.id ?? null;
  const pode =
    c &&
    (req.user?.role === "admin" ||
      ehDaOrganizacao(req, c.organizationId) ||
      (c.autor === "comprador" && buyerId && c.buyerId === buyerId));
  if (!pode) throw new ComentarioError("Comentário não encontrado.", 404);

  return db.transaction(async (tx) => {
    const alvo = c.parentId
      ? [c.id]
      : [
          c.id,
          ...(
            await tx
              .select({ id: comentarios.id })
              .from(comentarios)
              .where(and(eq(comentarios.parentId, c.id), isNull(comentarios.removidoEm)))
          ).map((r) => r.id),
        ];
    const apagados = await tx
      .update(comentarios)
      .set({ removidoEm: new Date(), removidoPor: req.user?.id ?? null })
      .where(and(inArray(comentarios.id, alvo), isNull(comentarios.removidoEm)))
      .returning({ id: comentarios.id });
    // Outro clique chegou antes: o comentário já foi apagado — nada muda.
    if (!apagados.some((a) => a.id === c.id)) throw new ComentarioError("Comentário não encontrado.", 404);
    if (apagados.length) {
      await tx
        .update(campaigns)
        .set({ comentariosCount: sql`greatest(${campaigns.comentariosCount} - ${apagados.length}, 0)` })
        .where(eq(campaigns.id, c.campaignId));
    }
    return { apagados: apagados.length };
  });
}
