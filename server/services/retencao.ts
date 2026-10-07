/**
 * Retenção cautelar de saldo (regras em `shared/retencao.ts`).
 *
 * Enquanto a retenção de uma organização está `ativa`, nada do que a
 * plataforma deve a ela sai da conta: o reembolso do saldo de patrocínio
 * não é pedido, aprovado nem pago, e o acerto (`darBaixa`) recebe as taxas
 * dela mas não repassa o crédito do presente. O dinheiro continua onde
 * estava; só não sai. Liberar devolve tudo ao normal; abater usa parte (ou
 * tudo) para cobrir o passivo, pelo livro do patrocínio e marcando os
 * créditos do presente como abatidos.
 *
 * A corrida entre "reter" e "pagar" é resolvida pela linha da organização:
 * reter pega a linha `FOR UPDATE` (o banimento já a atualiza na mesma
 * transação) e todo pagamento confere a retenção com a mesma linha travada.
 */
import type { Request } from "express";
import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "../db";
import { auditLog, organizations, presenteCreditos, retencoesCautelares } from "@shared/schema";
import {
  FUNDAMENTOS_DO_ABATE,
  MENSAGEM_RETIDO,
  RetencaoError,
  validarAbatimento,
  validarMotivoDaRetencao,
  type OrigemDaRetencao,
  type SituacaoDaRetencao,
} from "@shared/retencao";
import { orgOf } from "./orgs";
import { lancar } from "./patrocinio";

export { RetencaoError };

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type Executor = Tx | typeof db;

const uuidValido = (id: unknown): id is string => typeof id === "string" && /^[0-9a-f-]{36}$/i.test(id);

function soPlataforma(req: Request) {
  if (orgOf(req)) throw new RetencaoError("Retenção de saldo é da plataforma.", 403);
}

/** O que está na conta da plataforma em nome da organização agora. */
export async function retidoAgora(ex: Executor, organizationId: string) {
  const r = await ex.execute(sql`
    select
      (select patrocinio_saldo_cents from organizations where id = ${organizationId}::uuid)::int as patrocinio,
      (select coalesce(sum(amount_cents), 0) from presente_creditos
        where organization_id = ${organizationId}::uuid and status = 'devido')::int as presente,
      (select coalesce(sum(devolver_cents), 0) from patrocinio_reembolsos
        where organization_id = ${organizationId}::uuid and status = 'aprovado')::int as reembolso`);
  const l = r.rows[0] as { patrocinio: number | null; presente: number; reembolso: number };
  return { patrocinioCents: Number(l.patrocinio ?? 0), presenteCents: Number(l.presente), reembolsoCents: Number(l.reembolso) };
}

/**
 * Há retenção ativa? Pega a linha da organização `FOR UPDATE` antes de olhar:
 * quem retém pega a mesma linha, então a retenção que está nascendo espera o
 * pagamento terminar, ou o pagamento a enxerga. `FOR UPDATE`, não `FOR
 * SHARE`: vários caminhos de pagamento depois mexem no saldo da própria
 * linha, e dois `FOR SHARE` subindo para escrita ao mesmo tempo se travam.
 */
export async function temRetencaoAtiva(tx: Tx, organizationId: string): Promise<boolean> {
  await tx.execute(sql`select 1 from organizations where id = ${organizationId}::uuid for update`);
  const [r] = await tx
    .select({ id: retencoesCautelares.id })
    .from(retencoesCautelares)
    .where(and(eq(retencoesCautelares.organizationId, organizationId), eq(retencoesCautelares.status, "ativa")));
  return Boolean(r);
}

/** Recusa (409) o pagamento à organização com saldo retido. */
export async function exigirSemRetencao(tx: Tx, organizationId: string) {
  if (await temRetencaoAtiva(tx, organizationId)) throw new RetencaoError(MENSAGEM_RETIDO, 409);
}

/**
 * Cria a retenção dentro da transação de quem chama (o banimento). A linha
 * da organização já precisa estar travada por quem chama — o banimento a
 * atualiza antes. Já havendo uma ativa, não cria outra (o índice decide) e
 * devolve `null`.
 */
export async function reterNaTransacao(
  tx: Tx,
  p: { organizationId: string; origem: OrigemDaRetencao; motivo: string; denunciaId?: string | null; userId?: string | null; actorRole?: string | null; ip?: string | null },
) {
  const valores = await retidoAgora(tx, p.organizationId);
  const [linha] = await tx
    .insert(retencoesCautelares)
    .values({
      organizationId: p.organizationId,
      origem: p.origem,
      motivo: p.motivo,
      denunciaId: p.denunciaId ?? null,
      patrocinioCents: valores.patrocinioCents,
      presenteCents: valores.presenteCents,
      reembolsoCents: valores.reembolsoCents,
      criadoPor: p.userId ?? null,
    })
    .onConflictDoNothing()
    .returning();
  if (!linha) return null;
  await tx.insert(auditLog).values({
    actorId: p.userId ?? null,
    actorRole: (p.actorRole ?? null) as never,
    action: "retencao.criar",
    entity: "organization",
    entityId: p.organizationId,
    diff: { retencaoId: linha.id, origem: p.origem, motivo: p.motivo, ...valores } as never,
    ip: p.ip ?? null,
  });
  return linha;
}

/** A plataforma retém sem banir (suspeita ainda em apuração). */
export async function reterManual(req: Request, organizationId: string, motivoBruto: unknown) {
  soPlataforma(req);
  if (!uuidValido(organizationId)) throw new RetencaoError("Organização não encontrada.", 404);
  const motivo = validarMotivoDaRetencao(motivoBruto);
  return db.transaction(async (tx) => {
    const [org] = await tx.select({ id: organizations.id }).from(organizations).where(eq(organizations.id, organizationId)).for("update");
    if (!org) throw new RetencaoError("Organização não encontrada.", 404);
    const linha = await reterNaTransacao(tx, {
      organizationId,
      origem: "manual",
      motivo,
      userId: req.user!.id,
      actorRole: req.user!.role,
      ip: req.ip,
    });
    if (!linha) throw new RetencaoError("Esta organização já tem o saldo retido.", 409);
    return linha;
  });
}

/** Trava a retenção ativa (e antes a organização, na mesma ordem dos pagamentos). */
async function travarAtiva(tx: Tx, id: string) {
  const [r] = await tx.select().from(retencoesCautelares).where(eq(retencoesCautelares.id, id));
  if (!r) throw new RetencaoError("Retenção não encontrada.", 404);
  await tx.execute(sql`select 1 from organizations where id = ${r.organizationId}::uuid for update`);
  const [atual] = await tx.select().from(retencoesCautelares).where(eq(retencoesCautelares.id, id)).for("update");
  if (atual.status !== "ativa") throw new RetencaoError("Esta retenção já foi decidida.", 409);
  return atual;
}

/** Libera: o saldo volta a poder sair, como antes. */
export async function liberarRetencao(req: Request, id: string, motivoBruto: unknown) {
  soPlataforma(req);
  if (!uuidValido(id)) throw new RetencaoError("Retenção não encontrada.", 404);
  const motivo = validarMotivoDaRetencao(motivoBruto);
  return db.transaction(async (tx) => {
    const r = await travarAtiva(tx, id);
    const [feita] = await tx
      .update(retencoesCautelares)
      .set({ status: "liberada", decisao: motivo, decididoPor: req.user!.id, decididoEm: new Date() })
      .where(and(eq(retencoesCautelares.id, id), eq(retencoesCautelares.status, "ativa")))
      .returning();
    if (!feita) throw new RetencaoError("Esta retenção já foi decidida.", 409);
    await tx.insert(auditLog).values({
      actorId: req.user!.id,
      actorRole: req.user!.role as never,
      action: "retencao.liberar",
      entity: "organization",
      entityId: r.organizationId,
      diff: { retencaoId: id, motivo } as never,
      ip: req.ip,
    });
    return feita;
  });
}

/**
 * Abate: usa o retido para cobrir o passivo. O saldo de patrocínio sai pelo
 * livro (`retencao-abate:<id>`, uma vez só) e os créditos do presente
 * devidos viram `abatido` — não são mais repassados. A retenção termina; o
 * que sobrar volta a poder sair.
 */
export async function abaterRetencao(
  req: Request,
  id: string,
  entrada: { patrocinioCents?: unknown; presente?: unknown; motivo?: unknown; fundamento?: unknown; referencia?: unknown },
) {
  soPlataforma(req);
  if (!uuidValido(id)) throw new RetencaoError("Retenção não encontrada.", 404);
  return db.transaction(async (tx) => {
    const r = await travarAtiva(tx, id);
    const agora = await retidoAgora(tx, r.organizationId);
    const a = validarAbatimento(entrada, agora);
    let presenteCents = 0;
    if (a.patrocinioCents > 0) {
      await lancar(tx, {
        organizationId: r.organizationId,
        valorCents: -a.patrocinioCents,
        motivo: "retencao",
        chave: `retencao-abate:${id}`,
        descricao: `Abatido do saldo retido: ${a.motivo}`.slice(0, 200),
        userId: req.user!.id,
      });
    }
    if (a.presente) {
      const linhas = await tx
        .update(presenteCreditos)
        .set({ status: "abatido", pagoEm: new Date() })
        .where(and(eq(presenteCreditos.organizationId, r.organizationId), eq(presenteCreditos.status, "devido")))
        .returning({ amountCents: presenteCreditos.amountCents });
      presenteCents = linhas.reduce((s, l) => s + l.amountCents, 0);
    }
    const abatidoCents = a.patrocinioCents + presenteCents;
    const decisao = `${FUNDAMENTOS_DO_ABATE[a.fundamento]} (${a.referencia}): ${a.motivo}`.slice(0, 1000);
    const [feita] = await tx
      .update(retencoesCautelares)
      .set({ status: "abatida", decisao, abatidoCents, decididoPor: req.user!.id, decididoEm: new Date() })
      .where(and(eq(retencoesCautelares.id, id), eq(retencoesCautelares.status, "ativa")))
      .returning();
    if (!feita) throw new RetencaoError("Esta retenção já foi decidida.", 409);
    await tx.insert(auditLog).values({
      actorId: req.user!.id,
      actorRole: req.user!.role as never,
      action: "retencao.abater",
      entity: "organization",
      entityId: r.organizationId,
      diff: { retencaoId: id, motivo: a.motivo, fundamento: a.fundamento, referencia: a.referencia, patrocinioCents: a.patrocinioCents, presenteCents } as never,
      ip: req.ip,
    });
    return feita;
  });
}

/** A lista da plataforma: as ativas primeiro, com o valor de agora ao lado do retrato. */
export async function listarRetencoes(req: Request) {
  soPlataforma(req);
  const linhas = await db
    .select({ r: retencoesCautelares, organizacao: organizations.name, banida: organizations.banidaEm })
    .from(retencoesCautelares)
    .innerJoin(organizations, eq(organizations.id, retencoesCautelares.organizationId))
    .orderBy(sql`(${retencoesCautelares.status} = 'ativa') desc`, desc(retencoesCautelares.criadoEm))
    .limit(60);
  return Promise.all(
    linhas.map(async ({ r, organizacao, banida }) => ({
      id: r.id,
      organizationId: r.organizationId,
      organizacao,
      banida: Boolean(banida),
      status: r.status as SituacaoDaRetencao,
      origem: r.origem as OrigemDaRetencao,
      motivo: r.motivo,
      criadoEm: r.criadoEm,
      noInicio: { patrocinioCents: r.patrocinioCents, presenteCents: r.presenteCents, reembolsoCents: r.reembolsoCents },
      agora: r.status === "ativa" ? await retidoAgora(db, r.organizationId) : null,
      decisao: r.decisao,
      abatidoCents: r.abatidoCents,
      decididoEm: r.decididoEm,
    })),
  );
}
