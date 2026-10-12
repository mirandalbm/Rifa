/**
 * A contestação do Pix (MED, chargeback) que o provedor avisou sem cobrir o
 * pago: o sistema não a desfaz sozinho. O webhook grava
 * `pagamento.contestacao.a_conferir` no `audit_log` (uma linha por aviso), e
 * ela fica na Caixa de entrada **até a plataforma registrar a decisão**
 * (`pagamento.contestacao.conferida`, com a observação) — nunca some sozinha.
 * O que fazer com o pedido segue pelos caminhos que já existem (o estorno é
 * do chamado ou do aviso do provedor); aqui só se registra que alguém olhou.
 *
 * Só a plataforma vê e decide. Nada de dado do comprador: a cobrança, os
 * pedidos e a organização.
 */
import type { Request } from "express";
import { sql } from "drizzle-orm";
import { db } from "../db";
import { auditLog } from "@shared/schema";
import { ACAO_CONTESTACAO_A_CONFERIR } from "../payments/provider";

export const ACAO_CONTESTACAO_CONFERIDA = "pagamento.contestacao.conferida";

/** Trava de transação por cobrança (duas chaves): dois cliques, uma decisão. */
const TRAVA_DA_CONTESTACAO = 811_902;

export class ContestacaoError extends Error {
  constructor(message: string, readonly status = 400) {
    super(message);
    this.name = "ContestacaoError";
  }
}

/** Id de cobrança no formato de algum provedor: letras, números, `_` e `-`. Fora disso, não existe. */
export function cobrancaValida(id: unknown): id is string {
  return typeof id === "string" && /^[A-Za-z0-9_-]{1,80}$/.test(id);
}

/**
 * O aviso `a_conferir` ainda sem decisão: não há `conferida` da mesma
 * cobrança gravada depois dele. Em SQL, sobre `audit_log` com o apelido dado.
 */
export function contestacaoPendenteSql(apelido = "a") {
  const t = sql.raw(apelido);
  return sql`(${t}.action = ${ACAO_CONTESTACAO_A_CONFERIR} AND NOT EXISTS (
    SELECT 1 FROM audit_log d
     WHERE d.action = ${ACAO_CONTESTACAO_CONFERIDA} AND d.entity_id = ${t}.entity_id AND d.created_at >= ${t}.created_at))`;
}

/** As contestações esperando a plataforma: uma por cobrança (o aviso mais novo). */
export async function contestacoesAConferir() {
  const { rows } = await db.execute(sql`
    SELECT DISTINCT ON (a.entity_id) a.entity_id AS cobranca, a.created_at AS desde,
           a.diff->>'provedor' AS provedor,
           (a.diff->>'contestadoCents')::int AS contestado_cents,
           (a.diff->>'pagoCents')::int AS pago_cents,
           (SELECT string_agg(ord.code::text, ', ') FROM orders ord WHERE ord.psp_charge_id = a.entity_id) AS pedidos,
           (SELECT min(org.name) FROM orders ord JOIN campaigns c ON c.id = ord.campaign_id
              JOIN organizations org ON org.id = c.organization_id WHERE ord.psp_charge_id = a.entity_id) AS org
      FROM audit_log a
     WHERE ${contestacaoPendenteSql("a")}
     ORDER BY a.entity_id, a.created_at DESC
     LIMIT 200`);
  return (rows as Record<string, unknown>[]).map((r) => ({
    cobranca: String(r.cobranca),
    // `timestamp` lido por SQL cru volta como texto sem fuso: é UTC.
    desde: r.desde instanceof Date ? r.desde : new Date(`${String(r.desde).replace(" ", "T")}Z`),
    provedor: (r.provedor as string | null) ?? null,
    contestadoCents: r.contestado_cents === null ? null : Number(r.contestado_cents),
    pagoCents: r.pago_cents === null ? null : Number(r.pago_cents),
    pedidos: (r.pedidos as string | null) ?? null,
    organizacao: (r.org as string | null) ?? null,
  }));
}

/**
 * A plataforma registra que conferiu a contestação, com a observação do que
 * decidiu. Sem aviso pendente da cobrança: 404 (nunca houve) ou 409 (já
 * conferida). A decisão e a auditoria são a mesma linha.
 */
export async function marcarContestacaoConferida(req: Request, cobranca: string, observacao: string) {
  const texto = observacao.trim();
  if (texto.length < 5) throw new ContestacaoError("Escreva o que foi conferido e decidido (pelo menos 5 letras).");
  if (texto.length > 1000) throw new ContestacaoError("A observação pode ter até 1000 letras.");
  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(${TRAVA_DA_CONTESTACAO}, hashtext(${cobranca}))`);
    const { rows: avisos } = await tx.execute(
      sql`SELECT count(*)::int AS total, count(*) FILTER (WHERE ${contestacaoPendenteSql("a")})::int AS pendentes
            FROM audit_log a WHERE a.action = ${ACAO_CONTESTACAO_A_CONFERIR} AND a.entity_id = ${cobranca}`,
    );
    const r = (avisos[0] ?? {}) as { total?: number; pendentes?: number };
    if (!Number(r.total)) throw new ContestacaoError("Contestação não encontrada.", 404);
    if (!Number(r.pendentes)) throw new ContestacaoError("Esta contestação já foi conferida.", 409);
    await tx.insert(auditLog).values({
      actorId: req.user?.id ?? null,
      actorRole: req.user?.role ?? null,
      action: ACAO_CONTESTACAO_CONFERIDA,
      entity: "cobranca",
      entityId: cobranca,
      diff: { observacao: texto },
      ip: req.ip,
    });
    return { cobranca, conferida: true };
  });
}
