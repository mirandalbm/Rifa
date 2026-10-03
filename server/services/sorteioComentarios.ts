/**
 * Comentários do sorteio oficial (a tela do sorteio no celular), como no
 * YouTube: todo mundo lê; escreve quem tem conta e apelido. As mesmas regras
 * dos comentários da rifa (`shared/comentarios.ts`): sem link e sem telefone,
 * emoji só de perfil verificado, uma camada de resposta, curtida pela chave
 * (comentário, pessoa) e limite por pessoa. Sem organização dona: quem modera
 * é a plataforma (e quem escreveu apaga o seu).
 *
 * - O contador (`sorteios_oficiais.comentarios_count`) anda na mesma
 *   transação que grava ou apaga — nunca `COUNT(*)`.
 * - Apagar é marcar, num `UPDATE` condicional: dois cliques, um desconto.
 * - O apostador aparece pelo apelido (ou o primeiro nome e a inicial);
 *   telefone nunca sai.
 */
import type { Request } from "express";
import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { db } from "../db";
import { buyers, sorteioComentarioCurtidas, sorteioComentarios, sorteiosOficiais } from "@shared/schema";
import {
  COMENTARIOS_POR_JANELA,
  EMOJI_SO_VERIFICADO,
  JANELA_DE_COMENTARIOS_MIN,
  limparComentario,
  nomeNoComentario,
  problemaNoComentario,
  temEmoji,
} from "@shared/comentarios";
import { hit } from "./antifraude";
import { urlDaFotoDoApostador } from "./perfilApostador";
import { ComentarioError } from "./comentarios";

const LISTA_MAX = 200;
const UUID = /^[0-9a-f-]{36}$/i;

/** O sorteio existe e não foi cancelado; senão, para quem pergunta, não existe. */
async function sorteioAberto(id: string) {
  if (!UUID.test(id)) throw new ComentarioError("Sorteio não encontrado.", 404);
  const [s] = await db
    .select({ id: sorteiosOficiais.id, canceladoEm: sorteiosOficiais.canceladoEm })
    .from(sorteiosOficiais)
    .where(eq(sorteiosOficiais.id, id));
  if (!s || s.canceladoEm) throw new ComentarioError("Sorteio não encontrado.", 404);
  return s;
}

const daPlataforma = (req: Request) => req.user?.role === "admin";

export async function listarComentariosDoSorteio(req: Request, sorteioId: string) {
  const s = await sorteioAberto(sorteioId);
  const meuBuyer = req.session.buyer?.id ?? null;
  const linhas = await db
    .select({
      id: sorteioComentarios.id,
      parentId: sorteioComentarios.parentId,
      buyerId: sorteioComentarios.buyerId,
      texto: sorteioComentarios.texto,
      curtidas: sorteioComentarios.curtidas,
      createdAt: sorteioComentarios.createdAt,
      nomeComprador: buyers.name,
      apelido: buyers.apelido,
      fotoEm: buyers.fotoEm,
      verificadoEm: buyers.verificadoEm,
      curti: meuBuyer
        ? sql<boolean>`exists (select 1 from ${sorteioComentarioCurtidas} cc
             where cc.comentario_id = "sorteio_comentarios"."id" and cc.buyer_id = ${meuBuyer}::uuid)`
        : sql<boolean>`false`,
    })
    .from(sorteioComentarios)
    .leftJoin(buyers, eq(buyers.id, sorteioComentarios.buyerId))
    .where(and(eq(sorteioComentarios.sorteioOficialId, s.id), isNull(sorteioComentarios.removidoEm)))
    .orderBy(desc(sorteioComentarios.createdAt))
    .limit(LISTA_MAX)
    // Os mais recentes entram no limite; a conversa volta à ordem do tempo.
    .then((r) => r.reverse());

  const plataforma = daPlataforma(req);
  const publico = (l: (typeof linhas)[number]) => {
    const meu = Boolean(meuBuyer && l.buyerId === meuBuyer);
    return {
      id: l.id,
      autor: "comprador" as const,
      nome: l.apelido ?? nomeNoComentario(l.nomeComprador),
      perfil: l.apelido ? `/u/${l.apelido}` : null,
      foto: urlDaFotoDoApostador(l.apelido, l.fotoEm),
      verificado: Boolean(l.verificadoEm),
      texto: l.texto,
      curtidas: l.curtidas,
      curti: Boolean(l.curti),
      createdAt: l.createdAt,
      meu,
      // Quem escreveu e a plataforma apagam; não há organização dona.
      podeApagar: meu || plataforma,
      podePedirRemocao: false,
      remocaoEmAnalise: false,
    };
  };
  const respostas = new Map<string, ReturnType<typeof publico>[]>();
  for (const l of linhas) {
    if (l.parentId) respostas.set(l.parentId, [...(respostas.get(l.parentId) ?? []), publico(l)]);
  }
  const eu = meuBuyer
    ? (await db.select({ apelido: buyers.apelido, verificadoEm: buyers.verificadoEm }).from(buyers).where(eq(buyers.id, meuBuyer)))[0]
    : null;
  return {
    // A mesma forma da lista da rifa (o componente da tela é um só).
    organizacao: { nome: "a comunidade do sorteio", slug: "", verificada: false },
    premiados: [],
    podeComentar: Boolean(meuBuyer),
    comoOrganizacao: false,
    precisaApelido: Boolean(meuBuyer) && !eu?.apelido,
    podeCurtir: Boolean(meuBuyer),
    podeUsarEmoji: Boolean(eu?.verificadoEm),
    lista: linhas
      .filter((l) => !l.parentId)
      .reverse()
      .map((l) => ({ ...publico(l), respostas: respostas.get(l.id) ?? [] })),
  };
}

export async function comentarNoSorteio(req: Request, sorteioId: string, entrada: { texto?: unknown; respostaA?: unknown }) {
  const s = await sorteioAberto(sorteioId);
  const buyerId = req.session.buyer?.id ?? null;
  if (!buyerId) throw new ComentarioError("Entre na sua conta para comentar.", 401);
  // Erro de preenchimento sai antes de contar a tentativa.
  const problema = problemaNoComentario(entrada.texto);
  if (problema) throw new ComentarioError(problema, 400);
  const [eu] = await db.select({ apelido: buyers.apelido, verificadoEm: buyers.verificadoEm }).from(buyers).where(eq(buyers.id, buyerId));
  if (!eu?.apelido) throw new ComentarioError("Escolha seu apelido para comentar.", 409);
  if (!eu.verificadoEm && temEmoji(String(entrada.texto))) throw new ComentarioError(EMOJI_SO_VERIFICADO, 403);
  // O mesmo balde dos comentários da rifa: o limite é da pessoa, não do lugar.
  const limite = await hit(`comentario:comprador:${buyerId}`, JANELA_DE_COMENTARIOS_MIN, COMENTARIOS_POR_JANELA);
  if (limite.excedeu) throw new ComentarioError("Muitos comentários seguidos. Espere alguns minutos.", 429);

  // Resposta vai sempre para o comentário do topo (uma camada só).
  let parentId: string | null = null;
  if (entrada.respostaA) {
    const id = String(entrada.respostaA);
    if (!UUID.test(id)) throw new ComentarioError("Comentário não encontrado.", 404);
    const [pai] = await db
      .select({ id: sorteioComentarios.id, parentId: sorteioComentarios.parentId })
      .from(sorteioComentarios)
      .where(and(eq(sorteioComentarios.id, id), eq(sorteioComentarios.sorteioOficialId, s.id), isNull(sorteioComentarios.removidoEm)));
    if (!pai) throw new ComentarioError("Comentário não encontrado.", 404);
    parentId = pai.parentId ?? pai.id;
  }

  const texto = limparComentario(String(entrada.texto));
  const novo = await db.transaction(async (tx) => {
    // A resposta trava o comentário do topo e confere que ele segue no ar:
    // apagado no meio, a resposta não entra (senão o contador contaria uma
    // resposta que nunca aparece).
    if (parentId) {
      const vivo = (
        await tx.execute(sql`
          SELECT id FROM sorteio_comentarios WHERE id = ${parentId}::uuid AND removido_em IS NULL FOR UPDATE
        `)
      ).rows;
      if (!vivo.length) throw new ComentarioError("Comentário não encontrado.", 404);
    }
    const [c] = await tx
      .insert(sorteioComentarios)
      .values({ sorteioOficialId: s.id, parentId, buyerId, texto })
      .returning({ id: sorteioComentarios.id });
    await tx
      .update(sorteiosOficiais)
      .set({ comentariosCount: sql`${sorteiosOficiais.comentariosCount} + 1` })
      .where(eq(sorteiosOficiais.id, s.id));
    return c;
  });
  return { id: novo.id };
}

/** Curtir pela chave (comentário, pessoa): o contador só anda quando a linha entrou ou saiu. */
export async function curtirComentarioDoSorteio(req: Request, id: string, curtir: boolean) {
  const buyerId = req.session.buyer?.id;
  if (!buyerId) throw new ComentarioError("Entre na sua conta para curtir.", 401);
  if (!UUID.test(id)) throw new ComentarioError("Comentário não encontrado.", 404);
  return db.transaction(async (tx) => {
    const [c] = await tx
      .select({ id: sorteioComentarios.id })
      .from(sorteioComentarios)
      .innerJoin(sorteiosOficiais, eq(sorteiosOficiais.id, sorteioComentarios.sorteioOficialId))
      .where(and(eq(sorteioComentarios.id, id), isNull(sorteioComentarios.removidoEm), isNull(sorteiosOficiais.canceladoEm)));
    if (!c) throw new ComentarioError("Comentário não encontrado.", 404);
    const mudou = curtir
      ? await tx.insert(sorteioComentarioCurtidas).values({ comentarioId: id, buyerId }).onConflictDoNothing().returning()
      : await tx
          .delete(sorteioComentarioCurtidas)
          .where(and(eq(sorteioComentarioCurtidas.comentarioId, id), eq(sorteioComentarioCurtidas.buyerId, buyerId)))
          .returning();
    if (mudou.length) {
      await tx
        .update(sorteioComentarios)
        .set({
          curtidas: curtir ? sql`${sorteioComentarios.curtidas} + 1` : sql`greatest(${sorteioComentarios.curtidas} - 1, 0)`,
        })
        .where(eq(sorteioComentarios.id, id));
    }
    const [depois] = await tx.select({ n: sorteioComentarios.curtidas }).from(sorteioComentarios).where(eq(sorteioComentarios.id, id));
    return { curtidas: depois.n, curti: curtir };
  });
}

/**
 * Apagar (marcar). Quem escreveu e a plataforma; para os demais, 404. O do
 * topo leva as respostas, e o contador desce na mesma transação.
 */
export async function apagarComentarioDoSorteio(req: Request, id: string) {
  if (!UUID.test(id)) throw new ComentarioError("Comentário não encontrado.", 404);
  const [c] = await db
    .select({
      id: sorteioComentarios.id,
      sorteioOficialId: sorteioComentarios.sorteioOficialId,
      parentId: sorteioComentarios.parentId,
      buyerId: sorteioComentarios.buyerId,
    })
    .from(sorteioComentarios)
    .innerJoin(sorteiosOficiais, eq(sorteiosOficiais.id, sorteioComentarios.sorteioOficialId))
    .where(and(eq(sorteioComentarios.id, id), isNull(sorteioComentarios.removidoEm), isNull(sorteiosOficiais.canceladoEm)));
  const buyerId = req.session.buyer?.id ?? null;
  const pode = c && (daPlataforma(req) || (buyerId && c.buyerId === buyerId));
  if (!pode) throw new ComentarioError("Comentário não encontrado.", 404);
  const apagados = await db.transaction(async (tx) => {
    const alvo = c.parentId
      ? [c.id]
      : [
          c.id,
          ...(
            await tx
              .select({ id: sorteioComentarios.id })
              .from(sorteioComentarios)
              .where(and(eq(sorteioComentarios.parentId, c.id), isNull(sorteioComentarios.removidoEm)))
          ).map((r) => r.id),
        ];
    const feitos = await tx
      .update(sorteioComentarios)
      .set({ removidoEm: new Date(), removidoPor: req.user?.id ?? null })
      .where(and(inArray(sorteioComentarios.id, alvo), isNull(sorteioComentarios.removidoEm)))
      .returning({ id: sorteioComentarios.id });
    // Outro clique chegou antes: já foi apagado — nada muda.
    if (!feitos.some((f) => f.id === c.id)) throw new ComentarioError("Comentário não encontrado.", 404);
    await tx
      .update(sorteiosOficiais)
      .set({ comentariosCount: sql`greatest(${sorteiosOficiais.comentariosCount} - ${feitos.length}, 0)` })
      .where(eq(sorteiosOficiais.id, c.sorteioOficialId));
    return feitos.length;
  });
  return { apagados };
}
