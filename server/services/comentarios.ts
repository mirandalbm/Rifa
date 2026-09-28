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
import {
  buyers,
  campaigns,
  campanhaSolicitacoes,
  comentarioCurtidas,
  comentarios,
  organizacaoFotos,
  orders,
  organizations,
  prizedQuotas,
} from "@shared/schema";
import {
  COMENTARIOS_POR_JANELA,
  EMOJI_SO_VERIFICADO,
  temEmoji,
  JANELA_DE_COMENTARIOS_MIN,
  limparComentario,
  nomeNoComentario,
  problemaNoComentario,
} from "@shared/comentarios";
import { mensagemRespostaAoComentario } from "@shared/push";
import { formatQuota } from "@shared/format";
import { hit } from "./antifraude";
import { avisar, emSegundoPlano } from "./push";
import { urlDaFoto } from "./perfil";
import { urlDaFotoDoApostador } from "./perfilApostador";
import { pedirRemocaoDeComentario } from "./solicitacoes";
import { varrerTextoDoOrganizador } from "./seguranca";

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
      totalQuotas: campaigns.totalQuotas,
      organizationId: campaigns.organizationId,
      orgNome: organizations.name,
      orgSlug: organizations.slug,
      orgFotoEm: organizacaoFotos.updatedAt,
      orgVerificadaEm: organizations.verificadaEm,
    })
    .from(campaigns)
    .innerJoin(organizations, eq(organizations.id, campaigns.organizationId))
    .leftJoin(organizacaoFotos, eq(organizacaoFotos.organizationId, organizations.id))
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
  const meuBuyer = req.session.buyer?.id ?? null;
  const linhas = await db
    .select({
      id: comentarios.id,
      parentId: comentarios.parentId,
      autor: comentarios.autor,
      buyerId: comentarios.buyerId,
      texto: comentarios.texto,
      curtidas: comentarios.curtidas,
      createdAt: comentarios.createdAt,
      nomeComprador: buyers.name,
      apelido: buyers.apelido,
      fotoEm: buyers.fotoEm,
      verificadoEm: buyers.verificadoEm,
      curti: meuBuyer
        ? sql<boolean>`exists (select 1 from ${comentarioCurtidas} cc
             where cc.comentario_id = "comentarios"."id" and cc.buyer_id = ${meuBuyer}::uuid)`
        : sql<boolean>`false`,
    })
    .from(comentarios)
    .leftJoin(buyers, eq(buyers.id, comentarios.buyerId))
    .where(and(eq(comentarios.campaignId, rifa.id), isNull(comentarios.removidoEm)))
    .orderBy(desc(comentarios.createdAt))
    .limit(LISTA_MAX)
    // Os mais recentes entram no limite; a conversa volta à ordem do tempo.
    .then((r) => r.reverse());

  const daOrganizacao = ehDaOrganizacao(req, rifa.organizationId);
  const plataforma = req.user?.role === "admin";
  // A organização vê quais remoções ela já pediu (e esperam a plataforma).
  const emAnalise = new Set(
    daOrganizacao || plataforma
      ? (
          await db
            .select({ id: campanhaSolicitacoes.comentarioId })
            .from(campanhaSolicitacoes)
            .where(
              and(
                eq(campanhaSolicitacoes.campaignId, rifa.id),
                eq(campanhaSolicitacoes.tipo, "remover_comentario"),
                eq(campanhaSolicitacoes.status, "em_analise"),
              ),
            )
        ).map((r) => r.id)
      : [],
  );
  const publico = (l: (typeof linhas)[number]) => {
    const org = l.autor === "organizacao";
    const meu = Boolean(meuBuyer && l.buyerId === meuBuyer && !org);
    return {
      id: l.id,
      autor: l.autor as "comprador" | "organizacao",
      // Apelido, como o nome de usuário do Instagram; quem comentou antes de
      // o apelido existir aparece pelo primeiro nome e a inicial.
      nome: org ? rifa.orgNome : (l.apelido ?? nomeNoComentario(l.nomeComprador)),
      perfil: org ? `/o/${rifa.orgSlug}` : l.apelido ? `/u/${l.apelido}` : null,
      foto: org ? urlDaFoto(rifa.orgSlug, rifa.orgFotoEm) : urlDaFotoDoApostador(l.apelido, l.fotoEm),
      // O selo de trevo (apostador ou organização verificados).
      verificado: org ? Boolean(rifa.orgVerificadaEm) : Boolean(l.verificadoEm),
      texto: l.texto,
      curtidas: l.curtidas,
      curti: Boolean(l.curti),
      createdAt: l.createdAt,
      meu,
      // Quem escreveu e a plataforma apagam; a organização pede a remoção.
      podeApagar: meu || plataforma,
      podePedirRemocao: daOrganizacao && !org && !emAnalise.has(l.id),
      remocaoEmAnalise: emAnalise.has(l.id),
    };
  };
  const topo = linhas.filter((l) => !l.parentId);
  const respostas = new Map<string, ReturnType<typeof publico>[]>();
  for (const l of linhas) {
    if (l.parentId) respostas.set(l.parentId, [...(respostas.get(l.parentId) ?? []), publico(l)]);
  }
  const eu = meuBuyer
    ? (await db.select({ apelido: buyers.apelido, verificadoEm: buyers.verificadoEm }).from(buyers).where(eq(buyers.id, meuBuyer)))[0]
    : null;
  // Quem levou uma cota premiada fica fixo no topo, com o troféu e a cota.
  // Só pedido pago: o estorno devolve a cota premiada e o destaque some junto.
  // O número só aparece depois de reclamado — antes, nunca sai em rota pública.
  const ganhadores = await db
    .select({
      numero: prizedQuotas.number,
      premio: prizedQuotas.prizeLabel,
      em: prizedQuotas.claimedAt,
      nomeComprador: buyers.name,
      apelido: buyers.apelido,
      fotoEm: buyers.fotoEm,
      verificadoEm: buyers.verificadoEm,
    })
    .from(prizedQuotas)
    .innerJoin(orders, eq(orders.id, prizedQuotas.claimedByOrderId))
    .innerJoin(buyers, eq(buyers.id, orders.buyerId))
    .where(and(eq(prizedQuotas.campaignId, rifa.id), eq(orders.status, "paid")))
    .orderBy(desc(prizedQuotas.claimedAt))
    .limit(20);
  return {
    organizacao: { nome: rifa.orgNome, slug: rifa.orgSlug, verificada: Boolean(rifa.orgVerificadaEm) },
    premiados: ganhadores.map((g) => ({
      numero: g.numero,
      cota: formatQuota(g.numero, rifa.totalQuotas),
      premio: g.premio,
      em: g.em,
      nome: g.apelido ?? nomeNoComentario(g.nomeComprador),
      perfil: g.apelido ? `/u/${g.apelido}` : null,
      foto: urlDaFotoDoApostador(g.apelido, g.fotoEm),
      verificado: Boolean(g.verificadoEm),
    })),
    // Quem pode escrever: apostador com conta, ou a organização dona.
    podeComentar: Boolean(meuBuyer) || daOrganizacao,
    comoOrganizacao: daOrganizacao,
    // Apostador sem apelido escolhe um antes do primeiro comentário.
    precisaApelido: !daOrganizacao && Boolean(meuBuyer) && !eu?.apelido,
    podeCurtir: Boolean(meuBuyer),
    // Emoji é vantagem de perfil verificado; a tela explica e leva à verificação.
    podeUsarEmoji: daOrganizacao ? Boolean(rifa.orgVerificadaEm) : Boolean(eu?.verificadoEm),
    // Mais novo em cima; as respostas, na ordem da conversa.
    lista: topo.reverse().map((l) => ({ ...publico(l), respostas: respostas.get(l.id) ?? [] })),
  };
}

/**
 * Curtir (ou descurtir) um comentário. A chave (comentário, pessoa) decide:
 * o contador só anda quando a linha entrou ou saiu, na mesma transação —
 * cinco toques simultâneos, uma curtida.
 */
export async function curtirComentario(req: Request, id: string, curtir: boolean) {
  const buyerId = req.session.buyer?.id;
  if (!buyerId) throw new ComentarioError("Entre na sua conta para curtir.", 401);
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new ComentarioError("Comentário não encontrado.", 404);
  return db.transaction(async (tx) => {
    const [c] = await tx
      .select({ id: comentarios.id })
      .from(comentarios)
      .where(and(eq(comentarios.id, id), isNull(comentarios.removidoEm)));
    if (!c) throw new ComentarioError("Comentário não encontrado.", 404);
    const mudou = curtir
      ? await tx.insert(comentarioCurtidas).values({ comentarioId: id, buyerId }).onConflictDoNothing().returning()
      : await tx
          .delete(comentarioCurtidas)
          .where(and(eq(comentarioCurtidas.comentarioId, id), eq(comentarioCurtidas.buyerId, buyerId)))
          .returning();
    if (mudou.length) {
      await tx
        .update(comentarios)
        .set({ curtidas: curtir ? sql`${comentarios.curtidas} + 1` : sql`greatest(${comentarios.curtidas} - 1, 0)` })
        .where(eq(comentarios.id, id));
    }
    const [depois] = await tx.select({ n: comentarios.curtidas }).from(comentarios).where(eq(comentarios.id, id));
    return { curtidas: depois.n, curti: curtir };
  });
}

export async function comentar(req: Request, slug: string, entrada: { texto?: unknown; respostaA?: unknown }) {
  const rifa = await rifaPublica(slug);
  const comoOrganizacao = ehDaOrganizacao(req, rifa.organizationId);
  const buyerId = req.session.buyer?.id ?? null;
  if (!comoOrganizacao && !buyerId) throw new ComentarioError("Entre na sua conta para comentar.", 401);

  // Erro de preenchimento sai antes de contar a tentativa.
  const problema = problemaNoComentario(entrada.texto);
  if (problema) throw new ComentarioError(problema, 400);
  // Como no Instagram, quem comenta tem nome de usuário (o apelido). Foto
  // não é exigida; emoji, sim, é só de perfil verificado.
  let verificado = Boolean(rifa.orgVerificadaEm);
  if (!comoOrganizacao) {
    const [eu] = await db.select({ apelido: buyers.apelido, verificadoEm: buyers.verificadoEm }).from(buyers).where(eq(buyers.id, buyerId!));
    if (!eu?.apelido) throw new ComentarioError("Escolha seu apelido para comentar.", 409);
    verificado = Boolean(eu.verificadoEm);
  }
  if (!verificado && temEmoji(String(entrada.texto))) throw new ComentarioError(EMOJI_SO_VERIFICADO, 403);
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

  // Texto do próprio organizador pedindo pagamento por fora vira denúncia
  // automática para a plataforma — sem barrar o comentário (ela decide).
  if (comoOrganizacao) {
    emSegundoPlano(
      varrerTextoDoOrganizador({
        organizationId: rifa.organizationId,
        campaignId: rifa.id,
        comentarioId: novo.id,
        onde: "comentário da organização",
        texto,
      }),
      "varredura",
    );
  }

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
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * Marca o comentário (e, se for do topo, as respostas) como removido e
 * desconta o contador, numa transação que já está aberta. `UPDATE`
 * condicional: se outro clique chegou antes, 404 e nada muda.
 */
export async function removerNaTransacao(tx: Tx, comentarioId: string, userId: string | null) {
  const [c] = await tx
    .select({ id: comentarios.id, campaignId: comentarios.campaignId, parentId: comentarios.parentId })
    .from(comentarios)
    .where(eq(comentarios.id, comentarioId));
  if (!c) throw new ComentarioError("Comentário não encontrado.", 404);
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
    .set({ removidoEm: new Date(), removidoPor: userId })
    .where(and(inArray(comentarios.id, alvo), isNull(comentarios.removidoEm)))
    .returning({ id: comentarios.id });
  // Outro clique chegou antes: o comentário já foi apagado — nada muda.
  if (!apagados.some((a) => a.id === c.id)) throw new ComentarioError("Comentário não encontrado.", 404);
  await tx
    .update(campaigns)
    .set({ comentariosCount: sql`greatest(${campaigns.comentariosCount} - ${apagados.length}, 0)` })
    .where(eq(campaigns.id, c.campaignId));
  return apagados.length;
}

/**
 * Apagar. Quem escreveu, a plataforma — e a organização, no que ela mesma
 * escreveu — apagam na hora. Comentário de apostador, a organização **pede**
 * a remoção (vira solicitação no Atendimento): o comentário pode ser a
 * denúncia contra ela, e quem decide é a plataforma. Para os demais, 404.
 */
export async function apagarComentario(req: Request, id: string, motivo?: unknown) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new ComentarioError("Comentário não encontrado.", 404);
  const [c] = await db
    .select({
      id: comentarios.id,
      campaignId: comentarios.campaignId,
      organizationId: comentarios.organizationId,
      autor: comentarios.autor,
      buyerId: comentarios.buyerId,
    })
    .from(comentarios)
    .where(and(eq(comentarios.id, id), isNull(comentarios.removidoEm)));
  const buyerId = req.session.buyer?.id ?? null;
  const daOrganizacao = Boolean(c) && ehDaOrganizacao(req, c.organizationId);
  const direto =
    c &&
    (req.user?.role === "admin" ||
      (daOrganizacao && c.autor === "organizacao") ||
      (c.autor === "comprador" && buyerId && c.buyerId === buyerId));
  if (direto) {
    const apagados = await db.transaction((tx) => removerNaTransacao(tx, c.id, req.user?.id ?? null));
    return { apagados };
  }
  if (daOrganizacao) {
    const pedido = await pedirRemocaoDeComentario(req, { campaignId: c.campaignId, comentarioId: c.id, motivo });
    return { protocolo: pedido.protocolo, solicitacaoId: pedido.id };
  }
  throw new ComentarioError("Comentário não encontrado.", 404);
}
