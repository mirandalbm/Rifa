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
import { randomInt } from "node:crypto";
import { auditLog, buyers, sorteioComentarioCurtidas, sorteioComentarioDenuncias, sorteioComentarios, sorteiosOficiais } from "@shared/schema";
import {
  COMENTARIOS_POR_JANELA,
  EMOJI_SO_VERIFICADO,
  JANELA_DE_COMENTARIOS_MIN,
  limparComentario,
  nomeNoComentario,
  problemaNoComentario,
  temEmoji,
} from "@shared/comentarios";
import { DENUNCIAS_POR_DIA, DENUNCIA_TEXTO_MAX } from "@shared/seguranca";
import {
  MOTIVOS_DA_DENUNCIA_DE_COMENTARIO_DO_SORTEIO,
  motivoDoSorteioValido,
  problemaNaDecisao,
  problemaParaDenunciar,
} from "@shared/sorteioDenuncias";
import { isUniqueViolation } from "../pgError";
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
      // Denuncia quem entrou e não escreveu (a plataforma apaga direto).
      podeDenunciar: Boolean(meuBuyer) && !meu && !plataforma,
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
    // Trava o comentário antes das respostas: a mesma ordem da decisão da
    // denúncia, para as duas nunca se esperarem em ciclo.
    await tx.execute(sql`SELECT id FROM sorteio_comentarios WHERE id = ${c.id}::uuid FOR UPDATE`);
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

/* ------------------------------------------------------------------ *
 * Denúncia: o apostador denuncia, só a plataforma vê e decide
 * ------------------------------------------------------------------ */

const protocolo = () => {
  const d = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date()).replace(/-/g, "");
  return `DS-${d}-${String(randomInt(0, 1_000_000)).padStart(6, "0")}`;
};

const nomeDoMotivo = (m: string) =>
  MOTIVOS_DA_DENUNCIA_DE_COMENTARIO_DO_SORTEIO[m as keyof typeof MOTIVOS_DA_DENUNCIA_DE_COMENTARIO_DO_SORTEIO] ?? m;

/** O comentário (e o de cima, se for resposta), gravado na hora: só apelido, nunca telefone. */
async function trechoDoComentario(c: { id: string; parentId: string | null }) {
  const ids = c.parentId ? [c.parentId, c.id] : [c.id];
  const linhas = await db
    .select({
      id: sorteioComentarios.id,
      texto: sorteioComentarios.texto,
      em: sorteioComentarios.createdAt,
      apelido: buyers.apelido,
      nome: buyers.name,
    })
    .from(sorteioComentarios)
    .leftJoin(buyers, eq(buyers.id, sorteioComentarios.buyerId))
    .where(inArray(sorteioComentarios.id, ids));
  return ids
    .map((id) => linhas.find((l) => l.id === id))
    .filter((l): l is (typeof linhas)[number] => Boolean(l))
    .map((l) => ({
      de: l.apelido ?? (l.nome ? nomeNoComentario(l.nome) : "conta removida"),
      texto: l.texto,
      em: l.em.toISOString(),
      denunciado: l.id === c.id,
    }));
}

/**
 * O apostador com conta denuncia um comentário no ar de um sorteio não
 * cancelado (senão, 404). O próprio, não (409). Erro de preenchimento sai
 * antes de contar a tentativa; uma aberta por comentário e pessoa, pelo índice.
 */
export async function denunciarComentarioDoSorteio(req: Request, id: string, entrada: { motivo?: unknown; texto?: unknown }) {
  const buyerId = req.session.buyer?.id ?? null;
  const semConta = problemaParaDenunciar({
    temConta: Boolean(buyerId),
    meu: false,
  });
  if (semConta) throw new ComentarioError(semConta, 401);
  if (!UUID.test(id)) throw new ComentarioError("Comentário não encontrado.", 404);
  const [c] = await db
    .select({
      id: sorteioComentarios.id,
      parentId: sorteioComentarios.parentId,
      buyerId: sorteioComentarios.buyerId,
      sorteioOficialId: sorteioComentarios.sorteioOficialId,
    })
    .from(sorteioComentarios)
    .innerJoin(sorteiosOficiais, eq(sorteiosOficiais.id, sorteioComentarios.sorteioOficialId))
    .where(and(eq(sorteioComentarios.id, id), isNull(sorteioComentarios.removidoEm), isNull(sorteiosOficiais.canceladoEm)));
  if (!c) throw new ComentarioError("Comentário não encontrado.", 404);
  const proprio = problemaParaDenunciar({
    temConta: true,
    meu: c.buyerId === buyerId,
  });
  if (proprio) throw new ComentarioError(proprio, 409);
  const motivo = entrada.motivo;
  if (!motivoDoSorteioValido(motivo)) throw new ComentarioError("Escolha o motivo da denúncia.", 400);
  const texto = typeof entrada.texto === "string" ? entrada.texto.trim().slice(0, DENUNCIA_TEXTO_MAX) : "";
  if ((await hit(`denuncia-sorteio:${buyerId}`, 24 * 60, DENUNCIAS_POR_DIA)).excedeu) {
    throw new ComentarioError("Muitas denúncias hoje. Tente amanhã.", 429);
  }
  const trecho = await trechoDoComentario(c);
  for (let i = 0; i < 5; i++) {
    try {
      const [d] = await db.transaction(async (tx) => {
        // Apagado entre a leitura e a gravação, não vira pendência inútil na fila.
        const vivo = (await tx.execute(sql`SELECT id FROM sorteio_comentarios WHERE id = ${c.id}::uuid AND removido_em IS NULL FOR SHARE`))
          .rows;
        if (!vivo.length) throw new ComentarioError("Comentário não encontrado.", 404);
        return tx
          .insert(sorteioComentarioDenuncias)
          .values({
            protocolo: protocolo(),
            comentarioId: c.id,
            sorteioOficialId: c.sorteioOficialId,
            buyerId: buyerId!,
            motivo,
            texto: texto || null,
            trecho,
          })
          .returning({ protocolo: sorteioComentarioDenuncias.protocolo });
      });
      return { protocolo: d.protocolo };
    } catch (err) {
      if (isUniqueViolation(err, "uq_sorteio_denuncia_aberta")) {
        throw new ComentarioError("Você já denunciou este comentário. A plataforma vai analisar.", 409);
      }
      if (!isUniqueViolation(err, "uq_sorteio_denuncia_protocolo")) throw err;
    }
  }
  throw new ComentarioError("Não consegui registrar. Tente de novo.", 500);
}

/** A fila (só a plataforma): sem texto do comentário nem de quem denunciou. */
export async function listarDenunciasDoSorteio(status?: string) {
  const linhas = await db
    .select({
      id: sorteioComentarioDenuncias.id,
      protocolo: sorteioComentarioDenuncias.protocolo,
      motivo: sorteioComentarioDenuncias.motivo,
      status: sorteioComentarioDenuncias.status,
      createdAt: sorteioComentarioDenuncias.createdAt,
      sorteio: sorteiosOficiais.titulo,
      loteria: sorteiosOficiais.loteria,
      concurso: sorteiosOficiais.concurso,
    })
    .from(sorteioComentarioDenuncias)
    .innerJoin(sorteiosOficiais, eq(sorteiosOficiais.id, sorteioComentarioDenuncias.sorteioOficialId))
    .where(status ? eq(sorteioComentarioDenuncias.status, status) : undefined)
    .orderBy(desc(sorteioComentarioDenuncias.createdAt))
    .limit(100);
  return linhas.map((d) => ({
    id: d.id,
    protocolo: d.protocolo,
    motivoTexto: nomeDoMotivo(d.motivo),
    status: d.status,
    criadaEm: d.createdAt.toISOString(),
    sorteio: d.sorteio,
    loteria: d.loteria,
    concurso: d.concurso,
  }));
}

/** O detalhe com o trecho. A rota grava a auditoria antes de chamar. */
export async function detalheDaDenunciaDoSorteio(id: string) {
  if (!UUID.test(id)) throw new ComentarioError("Denúncia não encontrada.", 404);
  const [d] = await db
    .select({
      d: sorteioComentarioDenuncias,
      sorteio: sorteiosOficiais.titulo,
      removidoEm: sorteioComentarios.removidoEm,
      denunciou: buyers.apelido,
    })
    .from(sorteioComentarioDenuncias)
    .innerJoin(sorteiosOficiais, eq(sorteiosOficiais.id, sorteioComentarioDenuncias.sorteioOficialId))
    .innerJoin(sorteioComentarios, eq(sorteioComentarios.id, sorteioComentarioDenuncias.comentarioId))
    .leftJoin(buyers, eq(buyers.id, sorteioComentarioDenuncias.buyerId))
    .where(eq(sorteioComentarioDenuncias.id, id));
  if (!d) throw new ComentarioError("Denúncia não encontrada.", 404);
  return {
    id: d.d.id,
    protocolo: d.d.protocolo,
    motivoTexto: nomeDoMotivo(d.d.motivo),
    denunciou: d.denunciou ?? "conta sem apelido",
    texto: d.d.texto,
    status: d.d.status,
    decisao: d.d.decisao,
    criadaEm: d.d.createdAt.toISOString(),
    sorteio: d.sorteio,
    comentarioApagado: Boolean(d.removidoEm),
    trecho: d.d.trecho,
  };
}

/**
 * Decidir é `UPDATE` condicional (`aberta`): dois cliques, uma decisão e um
 * 409. Procedente apaga o comentário (o do topo leva as respostas), desce o
 * contador e encerra as outras denúncias abertas do mesmo comentário — tudo
 * na mesma transação, com a auditoria. O comentário já apagado por quem
 * escreveu só fecha a fila.
 *
 * Ordem das travas: **o comentário antes da denúncia**. Duas denúncias do
 * mesmo comentário decididas ao mesmo tempo esperam no comentário; a segunda
 * entra, acha a dela já fechada pela primeira e dá 409 — travar a denúncia
 * antes faria as duas se esperarem para sempre (deadlock, 500).
 */
export async function decidirDenunciaDoSorteio(req: Request, id: string, entrada: { decisao?: unknown; resposta?: unknown }) {
  if (!UUID.test(id)) throw new ComentarioError("Denúncia não encontrada.", 404);
  const resposta = typeof entrada.resposta === "string" ? entrada.resposta.trim().slice(0, 1000) : "";
  const problema = problemaNaDecisao(entrada.decisao, resposta);
  if (problema) throw new ComentarioError(problema, 400);
  const decisao = entrada.decisao as string;
  return db.transaction(async (tx) => {
    const agora = new Date();
    const [alvoDaDenuncia] = await tx
      .select({ comentarioId: sorteioComentarioDenuncias.comentarioId })
      .from(sorteioComentarioDenuncias)
      .where(eq(sorteioComentarioDenuncias.id, id));
    if (!alvoDaDenuncia) throw new ComentarioError("Denúncia não encontrada.", 404);
    const [c] = (
      await tx.execute(sql`
        SELECT id, parent_id, sorteio_oficial_id FROM sorteio_comentarios WHERE id = ${alvoDaDenuncia.comentarioId}::uuid FOR UPDATE
      `)
    ).rows as {
      id: string;
      parent_id: string | null;
      sorteio_oficial_id: string;
    }[];
    const [d] = await tx
      .update(sorteioComentarioDenuncias)
      .set({
        status: decisao,
        decisao: resposta || null,
        decididaPor: req.user!.id,
        decididaEm: agora,
      })
      .where(and(eq(sorteioComentarioDenuncias.id, id), eq(sorteioComentarioDenuncias.status, "aberta")))
      .returning({ comentarioId: sorteioComentarioDenuncias.comentarioId });
    if (!d) throw new ComentarioError("Esta denúncia já foi decidida ou não existe.", 409);
    let apagados = 0;
    if (decisao === "procedente") {
      if (c) {
        const alvo = c.parent_id
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
          .set({ removidoEm: agora, removidoPor: req.user!.id })
          .where(and(inArray(sorteioComentarios.id, alvo), isNull(sorteioComentarios.removidoEm)))
          .returning({ id: sorteioComentarios.id });
        apagados = feitos.length;
        if (apagados) {
          await tx
            .update(sorteiosOficiais)
            .set({
              comentariosCount: sql`greatest(${sorteiosOficiais.comentariosCount} - ${apagados}, 0)`,
            })
            .where(eq(sorteiosOficiais.id, c.sorteio_oficial_id));
        }
      }
      // As outras denúncias abertas do mesmo comentário saem da fila junto.
      await tx
        .update(sorteioComentarioDenuncias)
        .set({
          status: "procedente",
          decisao: resposta,
          decididaPor: req.user!.id,
          decididaEm: agora,
        })
        .where(and(eq(sorteioComentarioDenuncias.comentarioId, d.comentarioId), eq(sorteioComentarioDenuncias.status, "aberta")));
    }
    // A auditoria só registra a decisão que aconteceu, na mesma transação.
    await tx.insert(auditLog).values({
      actorId: req.user?.id ?? null,
      actorRole: req.user?.role ?? null,
      action: `sorteio.comentario.denuncia.${decisao}`,
      entity: "sorteio_comentario_denuncia",
      entityId: id,
      diff: { resposta: resposta || null, apagados },
      ip: req.ip,
    });
    return { status: decisao, apagados };
  });
}
