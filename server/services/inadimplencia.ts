/**
 * Falta de pagamento da promotora (cláusula X.13 (a); regras em
 * `shared/inadimplencia.ts`).
 *
 * A plataforma notifica (só ela: 403 para organizador), com as taxas em
 * aberto daquele instante. Passados 10 dias, se alguma delas seguir em
 * aberto, `problemaDeInadimplencia()` barra a publicação de rifa nova — em
 * `publishBlockers` e de novo dentro da transação de `publishCampaign()`.
 * O acerto (`darBaixa()`) encerra a notificação na mesma transação que paga;
 * a taxa cancelada por estorno também sai da conta, e a notificação sem nada
 * em aberto não bloqueia (é encerrada na próxima notificação ou baixa).
 */
import { ehUuid } from "@shared/uuid";
import type { Request } from "express";
import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "../db";
import { auditLog, cobrancaNotificacoes, organizations, platformCharges, presenteCreditos } from "@shared/schema";
import {
  InadimplenciaError,
  bloqueioDaNotificacao,
  problemaDaInadimplencia,
  problemaParaNotificar,
  validarMotivoDoCancelamento,
  type NotificacaoDeCobranca,
} from "@shared/inadimplencia";
import { requirePlatformAdmin } from "./orgs";

export { InadimplenciaError };

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type Executor = Tx | typeof db;

const uuidValido = (id: unknown): id is string => typeof id === "string" && ehUuid(id);

/** O que ainda está em aberto das taxas notificadas (a venda de depois não entra). */
const abertoDaNotificacao = sql<number>`(
  select coalesce(sum(pc.amount_cents), 0)::int from platform_charges pc
   where pc.id = any(${cobrancaNotificacoes.cobrancaIds}) and pc.status = 'aberta'
)`;

/** As notificações abertas, por organização (uma só por organização, pelo índice). */
export async function notificacoesAbertas(ex: Executor, organizationIds?: string[]): Promise<Map<string, NotificacaoDeCobranca>> {
  if (organizationIds && organizationIds.length === 0) return new Map();
  const linhas = await ex
    .select({
      id: cobrancaNotificacoes.id,
      organizationId: cobrancaNotificacoes.organizationId,
      valorCents: cobrancaNotificacoes.valorCents,
      notificadaEm: cobrancaNotificacoes.notificadaEm,
      bloqueiaEm: cobrancaNotificacoes.bloqueiaEm,
      abertoCents: abertoDaNotificacao,
    })
    .from(cobrancaNotificacoes)
    .where(
      and(
        eq(cobrancaNotificacoes.status, "aberta"),
        organizationIds ? inArray(cobrancaNotificacoes.organizationId, organizationIds) : sql`true`,
      ),
    );
  return new Map(linhas.map(({ organizationId, ...n }) => [organizationId, { ...n, abertoCents: Number(n.abertoCents) }]));
}

/** A notificação aberta de uma organização, ou `null`. */
export async function notificacaoDa(ex: Executor, organizationId: string): Promise<NotificacaoDeCobranca | null> {
  return (await notificacoesAbertas(ex, [organizationId])).get(organizationId) ?? null;
}

/** O que impede a organização de publicar rifa nova por falta de pagamento, ou `null`. */
export async function problemaDeInadimplencia(organizationId: string, ex: Executor = db, agora = new Date()): Promise<string | null> {
  return problemaDaInadimplencia(await notificacaoDa(ex, organizationId), agora);
}

/**
 * Encerra como regularizada a notificação sem nada em aberto. Roda na
 * transação do acerto (`darBaixa()`) e antes de notificar de novo.
 */
export async function regularizarNaTransacao(tx: Tx, organizationId: string, ator: string | null): Promise<boolean> {
  const feitas = await tx
    .update(cobrancaNotificacoes)
    .set({ status: "regularizada", encerradaEm: new Date(), encerradaPor: ator })
    .where(
      and(
        eq(cobrancaNotificacoes.organizationId, organizationId),
        eq(cobrancaNotificacoes.status, "aberta"),
        sql`${abertoDaNotificacao} = 0`,
      ),
    )
    .returning({ id: cobrancaNotificacoes.id });
  return feitas.length > 0;
}

/**
 * Notifica a falta de pagamento. A linha da organização é travada (a mesma
 * ordem do acerto); a notificação guarda as taxas abertas daquele instante e
 * o dia do bloqueio. Uma aberta por organização: o índice decide (409).
 */
export async function notificarFaltaDePagamento(req: Request, organizationId: string) {
  requirePlatformAdmin(req);
  if (!uuidValido(organizationId)) throw new InadimplenciaError("Organização não encontrada.", 404);
  return db.transaction(async (tx) => {
    const [org] = await tx.select({ id: organizations.id }).from(organizations).where(eq(organizations.id, organizationId)).for("update");
    if (!org) throw new InadimplenciaError("Organização não encontrada.", 404);
    // A notificação que ficou sem nada em aberto (estorno) não segura a vaga da nova.
    await regularizarNaTransacao(tx, organizationId, req.user!.id);

    const abertas = await tx
      .select({ id: platformCharges.id, amountCents: platformCharges.amountCents })
      .from(platformCharges)
      .where(and(eq(platformCharges.organizationId, organizationId), eq(platformCharges.status, "aberta")));
    const abertoCents = abertas.reduce((s, c) => s + c.amountCents, 0);
    const [credito] = await tx
      .select({ cents: sql<number>`coalesce(sum(${presenteCreditos.amountCents}), 0)::int` })
      .from(presenteCreditos)
      .where(and(eq(presenteCreditos.organizationId, organizationId), eq(presenteCreditos.status, "devido")));
    const problema = problemaParaNotificar(abertoCents, Number(credito?.cents ?? 0));
    if (problema) throw new InadimplenciaError(problema, 409);

    const agora = new Date();
    const [linha] = await tx
      .insert(cobrancaNotificacoes)
      .values({
        organizationId,
        cobrancaIds: abertas.map((c) => c.id),
        valorCents: abertoCents,
        notificadaEm: agora,
        bloqueiaEm: bloqueioDaNotificacao(agora),
        notificadaPor: req.user!.id,
      })
      .onConflictDoNothing()
      .returning();
    if (!linha) throw new InadimplenciaError("Esta organização já foi notificada: a notificação segue aberta.", 409);
    await tx.insert(auditLog).values({
      actorId: req.user!.id,
      actorRole: req.user!.role as never,
      action: "cobranca.notificar",
      entity: "organization",
      entityId: organizationId,
      diff: { notificacaoId: linha.id, valorCents: abertoCents, taxas: abertas.length, bloqueiaEm: linha.bloqueiaEm } as never,
      ip: req.ip,
    });
    return linha;
  });
}

/** Cancela a notificação (feita por engano, acordo de pagamento): exige motivo. */
export async function cancelarNotificacao(req: Request, id: string, motivoBruto: unknown) {
  requirePlatformAdmin(req);
  if (!uuidValido(id)) throw new InadimplenciaError("Notificação não encontrada.", 404);
  const motivo = validarMotivoDoCancelamento(motivoBruto);
  return db.transaction(async (tx) => {
    const [feita] = await tx
      .update(cobrancaNotificacoes)
      .set({ status: "cancelada", encerradaEm: new Date(), encerradaPor: req.user!.id, motivoDoCancelamento: motivo })
      .where(and(eq(cobrancaNotificacoes.id, id), eq(cobrancaNotificacoes.status, "aberta")))
      .returning();
    if (!feita) {
      const [existe] = await tx.select({ id: cobrancaNotificacoes.id }).from(cobrancaNotificacoes).where(eq(cobrancaNotificacoes.id, id));
      throw existe
        ? new InadimplenciaError("Esta notificação já foi encerrada.", 409)
        : new InadimplenciaError("Notificação não encontrada.", 404);
    }
    await tx.insert(auditLog).values({
      actorId: req.user!.id,
      actorRole: req.user!.role as never,
      action: "cobranca.notificar.cancelar",
      entity: "organization",
      entityId: feita.organizationId,
      diff: { notificacaoId: id, motivo } as never,
      ip: req.ip,
    });
    return feita;
  });
}
