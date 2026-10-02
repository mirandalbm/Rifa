/**
 * Mudança em rifa publicada: a organização pede, a plataforma decide.
 *
 * As regras estão em `shared/solicitacoes.ts`; aqui ficam banco e dinheiro.
 * O que vale para tudo abaixo:
 *
 * 1. **Nada muda na rifa até a aprovação.** O pedido guarda o antes e o
 *    depois; aprovar aplica exatamente aquilo, numa transação com o pedido
 *    travado — dois cliques, uma decisão.
 * 2. **Um em análise por rifa e tipo** (e, na remoção de comentário, por
 *    comentário) — quem decide são os índices parciais
 *    `uq_solicitacao_rifa_em_analise` e `uq_solicitacao_comentario_em_analise`,
 *    não um `SELECT` antes.
 * 3. **Recorte por organização** em toda leitura, e 404 para o pedido do
 *    vizinho. Decidir é só da plataforma (403).
 * 4. **Adiar mexe no relógio da comissão.** A comissão que esperava o
 *    sorteio passa a esperar a data nova — senão seria liberada antes do
 *    sorteio que ela devia esperar.
 */
import { randomInt } from "node:crypto";
import { and, asc, desc, eq, isNull, sql } from "drizzle-orm";
import type { Request } from "express";
import { db } from "../db";
import {
  campaigns,
  campaignStats,
  campanhaSolicitacaoMensagens,
  campanhaSolicitacoes,
  buyers,
  comentarios,
  draws,
  organizations,
  type Campaign,
} from "@shared/schema";
import {
  CAMPOS_EDITAVEIS,
  MOTIVO_MAX,
  MOTIVO_MIN,
  problemaNoAdiamento,
  protocoloDaSolicitacao,
  validarEdicao,
  type Alteracoes,
  type CampoEditavel,
  type StatusSolicitacao,
  type TipoSolicitacao,
  type ValorEditavel,
} from "@shared/solicitacoes";
import { isUniqueViolation } from "../pgError";
import { nomeRealPublico } from "@shared/perfilApostador";
import { removerNaTransacao } from "./comentarios";
import { orgOf } from "./orgs";
import { avisarAdiamento, emSegundoPlano } from "./push";

export class SolicitacaoError extends Error {
  constructor(message: string, readonly status = 422) {
    super(message);
    this.name = "SolicitacaoError";
  }
}

const TEXTO_MAX = 2000;

function valoresAtuais(c: Campaign): Record<CampoEditavel, ValorEditavel> {
  return {
    title: c.title,
    description: c.description ?? null,
    minPerOrder: c.minPerOrder,
    maxPerOrder: c.maxPerOrder,
    reservationTtlMin: c.reservationTtlMin,
    commissionPctDefault: c.commissionPctDefault,
  };
}

/**
 * Confere a edição contra a rifa atual. Serve à edição direta (rascunho, ou
 * a própria plataforma) e ao pedido de análise: a mesma régua nos dois.
 */
export function conferirEdicao(c: Campaign, entrada: Record<string, unknown>): Alteracoes {
  const r = validarEdicao(entrada, valoresAtuais(c));
  if (!r.ok) throw new SolicitacaoError(r.erro);
  return r.alteracoes;
}

/** Só o "para" de cada campo, pronto para o `UPDATE`. */
export function valoresNovos(alteracoes: Alteracoes) {
  const set: Partial<Record<CampoEditavel, ValorEditavel>> = {};
  for (const [campo, v] of Object.entries(alteracoes) as [CampoEditavel, { para: ValorEditavel }][]) {
    set[campo] = v.para;
  }
  return set as Partial<Pick<Campaign, CampoEditavel>>;
}

async function sorteada(campaignId: string) {
  const [d] = await db
    .select({ executedAt: draws.executedAt })
    .from(draws)
    .where(eq(draws.campaignId, campaignId));
  return Boolean(d?.executedAt);
}

async function vendidas(campaignId: string) {
  const [s] = await db
    .select({ n: campaignStats.soldCount })
    .from(campaignStats)
    .where(eq(campaignStats.campaignId, campaignId));
  return s?.n ?? 0;
}

/** Grava o pedido. O protocolo e o "um em análise" são decididos pelos índices. */
async function registrar(
  req: Request,
  c: Pick<Campaign, "id" | "organizationId" | "drawAt">,
  dados: {
    tipo: TipoSolicitacao;
    alteracoes?: Alteracoes;
    drawAtNovo?: Date;
    comentarioId?: string;
    motivo: string | null;
  },
) {
  for (let tentativa = 0; tentativa < 5; tentativa++) {
    try {
      return await db.transaction(async (tx) => {
        const [s] = await tx
          .insert(campanhaSolicitacoes)
          .values({
            protocolo: protocoloDaSolicitacao(new Date(), randomInt),
            campaignId: c.id,
            organizationId: c.organizationId,
            tipo: dados.tipo,
            alteracoes: dados.alteracoes ?? null,
            drawAtAtual: dados.tipo === "adiamento" ? c.drawAt : null,
            drawAtNovo: dados.drawAtNovo ?? null,
            comentarioId: dados.comentarioId ?? null,
            motivo: dados.motivo,
            criadoPor: req.user!.id,
          })
          .returning();
        if (dados.motivo) {
          await tx.insert(campanhaSolicitacaoMensagens).values({
            solicitacaoId: s.id,
            autor: orgOf(req) ? "organizacao" : "plataforma",
            userId: req.user!.id,
            texto: dados.motivo,
          });
        }
        return s;
      });
    } catch (err) {
      if (isUniqueViolation(err, "uq_solicitacao_comentario_em_analise")) {
        throw new SolicitacaoError("A remoção deste comentário já está em análise.", 409);
      }
      if (isUniqueViolation(err, "uq_solicitacao_rifa_em_analise")) {
        throw new SolicitacaoError(
          dados.tipo === "edicao"
            ? "Já existe uma edição desta rifa em análise. Espere a resposta ou cancele o pedido."
            : "Já existe um adiamento desta rifa em análise. Espere a resposta ou cancele o pedido.",
          409,
        );
      }
      if (!isUniqueViolation(err, "uq_solicitacao_protocolo")) throw err;
    }
  }
  throw new SolicitacaoError("Não foi possível gerar o protocolo. Tente de novo.", 500);
}

/** Edição de rifa publicada: vira pedido, a rifa não muda ainda. */
export async function pedirEdicao(req: Request, c: Campaign, entrada: Record<string, unknown>) {
  if (c.status !== "published" || (await sorteada(c.id))) {
    throw new SolicitacaoError("Só rifa publicada e ainda não sorteada passa por análise para editar.");
  }
  const alteracoes = conferirEdicao(c, entrada);
  const motivo = typeof entrada.motivo === "string" && entrada.motivo.trim() ? entrada.motivo.trim().slice(0, MOTIVO_MAX) : null;
  return registrar(req, c, { tipo: "edicao", alteracoes, motivo });
}

/** Adiar o sorteio por não atingir a meta: vira pedido, a data não muda ainda. */
export async function pedirAdiamento(req: Request, c: Campaign, entrada: { novaData?: unknown; motivo?: unknown }) {
  const novaData = entrada.novaData ? new Date(String(entrada.novaData)) : null;
  const motivo = String(entrada.motivo ?? "");
  const problema = problemaNoAdiamento({
    status: c.status,
    sorteada: await sorteada(c.id),
    drawAt: c.drawAt,
    vendidas: await vendidas(c.id),
    total: c.totalQuotas,
    novaData,
    motivo,
    agora: new Date(),
  });
  if (problema) throw new SolicitacaoError(problema);
  return registrar(req, c, { tipo: "adiamento", drawAtNovo: novaData!, motivo: motivo.trim() });
}

/**
 * A organização pede para tirar um comentário da rifa dela. O comentário
 * continua no ar até a plataforma decidir: pode ser justamente a denúncia
 * contra quem pede.
 */
export async function pedirRemocaoDeComentario(
  req: Request,
  dados: { campaignId: string; comentarioId: string; motivo: unknown },
) {
  const motivo = String(dados.motivo ?? "").trim();
  if (motivo.length < MOTIVO_MIN) {
    throw new SolicitacaoError("Explique por que o comentário deve sair (pelo menos 10 caracteres).", 400);
  }
  const [c] = await db
    .select({ id: campaigns.id, organizationId: campaigns.organizationId, drawAt: campaigns.drawAt })
    .from(campaigns)
    .where(eq(campaigns.id, dados.campaignId));
  if (!c) throw new SolicitacaoError("Rifa não encontrada.", 404);
  return registrar(req, c, {
    tipo: "remover_comentario",
    comentarioId: dados.comentarioId,
    motivo: motivo.slice(0, MOTIVO_MAX),
  });
}

/** A lista do Atendimento, no recorte de quem olha. */
export async function listarSolicitacoes(req: Request, status?: string) {
  const org = orgOf(req);
  const filtros = [];
  if (org) filtros.push(eq(campanhaSolicitacoes.organizationId, org));
  if (status) filtros.push(eq(campanhaSolicitacoes.status, status as StatusSolicitacao));
  return db
    .select({
      id: campanhaSolicitacoes.id,
      protocolo: campanhaSolicitacoes.protocolo,
      tipo: campanhaSolicitacoes.tipo,
      status: campanhaSolicitacoes.status,
      createdAt: campanhaSolicitacoes.createdAt,
      campaignId: campanhaSolicitacoes.campaignId,
      rifa: campaigns.title,
      organizacao: organizations.name,
    })
    .from(campanhaSolicitacoes)
    .innerJoin(campaigns, eq(campaigns.id, campanhaSolicitacoes.campaignId))
    .innerJoin(organizations, eq(organizations.id, campanhaSolicitacoes.organizationId))
    .where(filtros.length ? and(...filtros) : undefined)
    .orderBy(desc(campanhaSolicitacoes.createdAt))
    .limit(200);
}

/** O número ao lado de "Atendimento": pedidos esperando a plataforma. */
export async function solicitacoesEmAnalise(req: Request) {
  const org = orgOf(req);
  const r = await db.execute(sql`
    SELECT count(*)::int AS n FROM campanha_solicitacoes
     WHERE status = 'em_analise' ${org ? sql`AND organization_id = ${org}::uuid` : sql``}
  `);
  return (r.rows[0] as { n: number }).n;
}

/** O pedido no recorte de quem olha — o do vizinho é 404. */
async function noRecorte(req: Request, id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new SolicitacaoError("Pedido não encontrado.", 404);
  const [s] = await db.select().from(campanhaSolicitacoes).where(eq(campanhaSolicitacoes.id, id));
  const org = orgOf(req);
  if (!s || (org && s.organizationId !== org)) throw new SolicitacaoError("Pedido não encontrado.", 404);
  return s;
}

export async function detalheDaSolicitacao(req: Request, id: string) {
  const s = await noRecorte(req, id);
  const [c] = await db
    .select({ campaign: campaigns, org: organizations.name, vendidas: campaignStats.soldCount })
    .from(campaigns)
    .innerJoin(organizations, eq(organizations.id, campaigns.organizationId))
    .leftJoin(campaignStats, eq(campaignStats.campaignId, campaigns.id))
    .where(eq(campaigns.id, s.campaignId));
  const mensagens = await db
    .select({
      id: campanhaSolicitacaoMensagens.id,
      autor: campanhaSolicitacaoMensagens.autor,
      texto: campanhaSolicitacaoMensagens.texto,
      createdAt: campanhaSolicitacaoMensagens.createdAt,
    })
    .from(campanhaSolicitacaoMensagens)
    .where(eq(campanhaSolicitacaoMensagens.solicitacaoId, s.id))
    .orderBy(asc(campanhaSolicitacaoMensagens.createdAt));
  // Remoção de comentário: quem analisa lê o comentário inteiro, com o autor.
  const [comentario] = s.comentarioId
    ? await db
        .select({
          texto: comentarios.texto,
          autor: comentarios.autor,
          createdAt: comentarios.createdAt,
          removidoEm: comentarios.removidoEm,
          apelido: buyers.apelido,
          nome: buyers.name,
        })
        .from(comentarios)
        .leftJoin(buyers, eq(buyers.id, comentarios.buyerId))
        .where(eq(comentarios.id, s.comentarioId))
    : [];
  return {
    comentario: comentario
      ? {
          texto: comentario.texto,
          autor: comentario.apelido ?? nomeRealPublico(comentario.nome),
          nomeReal: nomeRealPublico(comentario.nome),
          createdAt: comentario.createdAt,
          removido: Boolean(comentario.removidoEm),
        }
      : null,
    solicitacao: {
      id: s.id,
      protocolo: s.protocolo,
      tipo: s.tipo,
      status: s.status,
      alteracoes: s.alteracoes as Alteracoes | null,
      drawAtAtual: s.drawAtAtual,
      drawAtNovo: s.drawAtNovo,
      motivo: s.motivo,
      decisao: s.decisao,
      decididoEm: s.decididoEm,
      createdAt: s.createdAt,
    },
    rifa: {
      id: c.campaign.id,
      titulo: c.campaign.title,
      premio: c.campaign.prizeTitle,
      slug: c.campaign.slug,
      status: c.campaign.status,
      drawAt: c.campaign.drawAt,
      adiamentos: c.campaign.adiamentos,
      vendidas: c.vendidas ?? 0,
      total: c.campaign.totalQuotas,
      organizacao: c.org,
    },
    // Quem decidiu aparece como "Plataforma"; a pessoa fica na auditoria.
    mensagens: mensagens.map((m) => ({
      ...m,
      nome: m.autor === "plataforma" ? "Plataforma" : "Organização",
      anexoId: null,
    })),
    rotulos: CAMPOS_EDITAVEIS,
  };
}

/** Conversa do pedido, dos dois lados, enquanto ele está em análise. */
export async function escreverNaSolicitacao(req: Request, id: string, texto: unknown) {
  const s = await noRecorte(req, id);
  const t = String(texto ?? "").trim();
  if (!t) throw new SolicitacaoError("Escreva a mensagem.", 400);
  if (t.length > TEXTO_MAX) throw new SolicitacaoError(`A mensagem passa de ${TEXTO_MAX} caracteres.`, 400);
  if (s.status !== "em_analise") throw new SolicitacaoError("Este pedido já foi encerrado.", 409);
  await db.insert(campanhaSolicitacaoMensagens).values({
    solicitacaoId: s.id,
    autor: orgOf(req) ? "organizacao" : "plataforma",
    userId: req.user!.id,
    texto: t,
  });
  return { ok: true };
}

/** A organização desiste do pedido (só em análise). */
export async function cancelarSolicitacao(req: Request, id: string) {
  const s = await noRecorte(req, id);
  const r = await db
    .update(campanhaSolicitacoes)
    .set({ status: "cancelada", decididoPor: req.user!.id, decididoEm: new Date() })
    .where(and(eq(campanhaSolicitacoes.id, s.id), eq(campanhaSolicitacoes.status, "em_analise")))
    .returning({ id: campanhaSolicitacoes.id });
  if (!r.length) throw new SolicitacaoError("Este pedido já foi encerrado.", 409);
  return { ok: true };
}

/**
 * A palavra da plataforma. Recusar exige explicação. Aprovar aplica o
 * pedido na mesma transação que o encerra; se a rifa mudou de um jeito que
 * o pedido não cabe mais (foi sorteada, a data já é outra), recusa com 409
 * e nada muda.
 */
export async function decidirSolicitacao(
  req: Request,
  id: string,
  entrada: { aprovar?: unknown; resposta?: unknown },
) {
  const s = await noRecorte(req, id);
  const aprovar = entrada.aprovar === true;
  const resposta = String(entrada.resposta ?? "").trim().slice(0, TEXTO_MAX);
  if (!aprovar && resposta.length < 5) {
    throw new SolicitacaoError("Explique à organização por que o pedido foi recusado.", 400);
  }

  const resultado = await db.transaction(async (tx) => {
    const trava = await tx.execute(sql`
      SELECT status FROM campanha_solicitacoes WHERE id = ${s.id}::uuid FOR UPDATE
    `);
    if ((trava.rows[0] as { status: string }).status !== "em_analise") {
      throw new SolicitacaoError("Este pedido já foi decidido.", 409);
    }

    if (aprovar && s.tipo === "remover_comentario") {
      // Comentário não depende do estado da rifa: sai e desconta o contador.
      // Se quem escreveu já o apagou, não há o que tirar — a decisão fica.
      const [ainda] = await tx
        .select({ id: comentarios.id })
        .from(comentarios)
        .where(and(eq(comentarios.id, s.comentarioId!), isNull(comentarios.removidoEm)));
      if (ainda) await removerNaTransacao(tx, s.comentarioId!, req.user!.id);
    } else if (aprovar) {
      const [c] = await tx.select().from(campaigns).where(eq(campaigns.id, s.campaignId)).for("update");
      const [d] = await tx.select({ executedAt: draws.executedAt }).from(draws).where(eq(draws.campaignId, c.id));
      if (c.status !== "published" || d?.executedAt) {
        throw new SolicitacaoError("A rifa não está mais no ar sem sorteio: o pedido não cabe mais. Recuse-o.", 409);
      }

      if (s.tipo === "edicao") {
        // Confere de novo contra a rifa de agora: outra mudança pode ter
        // entrado depois do pedido (máximo menor que o mínimo, por exemplo).
        const pedido = s.alteracoes as Alteracoes;
        const conferido = validarEdicao(
          Object.fromEntries(Object.entries(pedido).map(([k, v]) => [k, v!.para])),
          valoresAtuais(c),
        );
        if (!conferido.ok && conferido.erro !== "Nada mudou em relação à rifa atual.") {
          throw new SolicitacaoError(`O pedido não cabe mais na rifa: ${conferido.erro}`, 409);
        }
        if (conferido.ok) {
          await tx.update(campaigns).set(valoresNovos(conferido.alteracoes)).where(eq(campaigns.id, c.id));
        }
      } else {
        if (!s.drawAtNovo || !c.drawAt || c.drawAt.getTime() !== s.drawAtAtual?.getTime()) {
          throw new SolicitacaoError("A data do sorteio mudou desde o pedido. Recuse e peça de novo.", 409);
        }
        if (s.drawAtNovo.getTime() <= Date.now()) {
          throw new SolicitacaoError("A data pedida já passou. Recuse e peça de novo.", 409);
        }
        await tx
          .update(campaigns)
          .set({
            drawAt: s.drawAtNovo,
            drawAtOriginal: c.drawAtOriginal ?? c.drawAt,
            adiamentos: sql`${campaigns.adiamentos} + 1`,
          })
          .where(eq(campaigns.id, c.id));
        // A comissão que esperava o sorteio passa a esperar o novo.
        await tx.execute(sql`
          UPDATE commissions SET available_at = ${s.drawAtNovo}
           WHERE status = 'pending'
             AND available_at < ${s.drawAtNovo}
             AND order_id IN (SELECT id FROM orders WHERE campaign_id = ${c.id}::uuid)
        `);
        // Quem comprou antes do adiamento pode desistir com devolução integral
        // (shared/reembolso.ts). O chamado que já estava aberto ou aprovado,
        // com taxa, passa a devolver tudo — senão a promessa do texto valeria
        // só para quem pedisse depois.
        await tx.execute(sql`
          UPDATE chamados ch
             SET tipo_reembolso = 'adiamento', taxa_pct = 0, taxa_cents = 0, devolver_cents = o.amount_cents
            FROM orders o
           WHERE o.id = ch.order_id
             AND o.campaign_id = ${c.id}::uuid
             AND ch.status IN ('aberto', 'aprovado')
             AND ch.tipo_reembolso = 'com_taxa'
        `);
      }
    }

    await tx
      .update(campanhaSolicitacoes)
      .set({
        status: aprovar ? "aprovada" : "recusada",
        decisao: resposta || null,
        decididoPor: req.user!.id,
        decididoEm: new Date(),
      })
      .where(eq(campanhaSolicitacoes.id, s.id));
    await tx.insert(campanhaSolicitacaoMensagens).values({
      solicitacaoId: s.id,
      autor: "plataforma",
      userId: req.user!.id,
      texto: resposta || (aprovar ? "Pedido aprovado." : "Pedido recusado."),
    });
    return { status: aprovar ? "aprovada" : "recusada" };
  });

  // Quem comprou e quem segue fica sabendo da data nova. Fora da resposta:
  // falha de push não desfaz a aprovação.
  if (aprovar && s.tipo === "adiamento") emSegundoPlano(avisarAdiamento(s.campaignId), "sorteio adiado");
  return resultado;
}
