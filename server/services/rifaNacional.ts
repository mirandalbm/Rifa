/**
 * Rifa nacional (`docs/PLANO-RIFA-NACIONAL.md`, PR 3): o serviço.
 *
 * A organização pede, só o administrador geral aprova, e a rifa aprovada abre
 * a vitrine de todo mundo (a ordem da vitrine é a PR 4). As regras puras
 * (a conta, o mínimo, a configuração) estão em `shared/rifaNacional.ts`; aqui
 * ficam o banco e as corridas. O que vale para tudo abaixo:
 *
 * 1. **A fonte da verdade do estado é `campaigns.nacional_status`**; a linha
 *    de `campanha_solicitacoes` (tipo `nacional`) guarda protocolo, conversa e
 *    histórico. As duas mudam **sempre na mesma transação**.
 * 2. **Consultar e depois gravar é bug** (invariante 11): o pedido é um
 *    `UPDATE` condicional (`nacional_status IS NULL`, rifa no ar ou rascunho,
 *    não travada, mínimo atingido na própria conta do SQL); zero linhas = 409.
 *    "Um em análise por rifa" é o índice `uq_solicitacao_rifa_em_analise`.
 * 3. **Ordem das travas: solicitação → rifa** (a de `decidirSolicitacao()`).
 *    `pedir` ainda não tem solicitação (trava a rifa e só então insere);
 *    `abrirMao`, `cancelar` e `tirarDoAr` travam a solicitação em análise
 *    **antes** da rifa. Ordem trocada vira deadlock.
 * 4. **Total e preço travam enquanto houver pedido ou aprovação** (saída
 *    recomendada do plano): o `UPDATE` do rascunho ganha a condição
 *    `nacional_status IS NULL OR <o mesmo valor>` — a aprovação nunca cai
 *    calada, e a corrida pedir × PATCH se resolve na própria linha.
 * 5. **Dinheiro é inteiro**: a conta no SQL é sempre
 *    `total_quotas::bigint * price_cents::bigint`, nunca inteiro de 32 bits.
 * 6. **Auditoria na mesma transação** de cada passo.
 */
import { randomInt } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import type { Request } from "express";
import { ehUuid } from "@shared/uuid";
import { auditLog, campaigns, campanhaSolicitacaoMensagens, campanhaSolicitacoes, type Campaign } from "@shared/schema";
import { avaliarMinimo, problemaNoMinimo, type ConfigRifaNacional } from "@shared/rifaNacional";
import { MOTIVO_MAX, MOTIVO_MIN, protocoloDaSolicitacao } from "@shared/solicitacoes";
import { db } from "../db";
import { isUniqueViolation } from "../pgError";
import { assertCampaignInScope, orgOf, requirePlatformAdmin } from "./orgs";
import { getPlataforma, lerPlataforma } from "./settings";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export class RifaNacionalError extends Error {
  constructor(message: string, readonly status = 422) {
    super(message);
    this.name = "RifaNacionalError";
  }
}

const NAO_DISPONIVEL = "Rifa nacional não está disponível.";

async function auditar(tx: Tx, req: Request | null, action: string, campaignId: string, diff: Record<string, unknown>) {
  await tx.insert(auditLog).values({
    actorId: req?.user?.id ?? null,
    actorRole: (req?.user?.role ?? null) as never,
    action,
    entity: "campaign",
    entityId: campaignId,
    diff: diff as never,
    ip: req?.ip ?? null,
  });
}

/** A configuração de agora; desligada, o pedido não existe para a organização. */
async function configLigada(): Promise<ConfigRifaNacional> {
  const cfg = (await getPlataforma()).rifaNacional;
  if (!cfg.ligado) throw new RifaNacionalError(NAO_DISPONIVEL, 404);
  return cfg;
}

/**
 * Por que o `UPDATE` condicional não pegou nenhuma linha. Lê a rifa **já
 * travada** por quem chama, então o motivo é o do instante da decisão.
 */
function motivoDaRecusa(c: Campaign, minimoCents: number): string {
  if (c.nacionalStatus === "aprovada") return "Esta rifa já é nacional.";
  if (c.nacionalStatus === "em_analise") return "Esta rifa já tem um pedido de rifa nacional em análise.";
  if (c.demonstracao) return "Rifa de demonstração não pode ser nacional.";
  if (c.travadaEm) return "Rifa travada pela plataforma não pode ser nacional.";
  if (c.status !== "draft" && c.status !== "published") return "Só rifa em rascunho ou no ar pode ser nacional.";
  const minimo = problemaNoMinimo(c.totalQuotas, c.priceCents, minimoCents);
  if (minimo) return minimo;
  return "A rifa já foi sorteada.";
}

/* ------------------------------------------------------------------ *
 * Pedir
 * ------------------------------------------------------------------ */

/**
 * A organização pede o título de nacional (rascunho ou rifa no ar). O pedido é
 * da organização dona: a do vizinho é 404, e a plataforma não pede pelas
 * organizações (ela aprova). Abaixo do mínimo é 422 com a falta dita em reais
 * (cortesia); quem decide é o `UPDATE`.
 */
export async function pedirNacional(req: Request, campaignId: string) {
  // O recorte vem antes do interruptor: a rifa do vizinho é 404 com a config ligada ou não.
  const campanha = await assertCampaignInScope(req, campaignId);
  const cfg = await configLigada();
  if (!orgOf(req)) {
    throw new RifaNacionalError("O pedido de rifa nacional é da organização dona da rifa; a plataforma o aprova.", 403);
  }

  for (let tentativa = 0; tentativa < 5; tentativa++) {
    try {
      return await db.transaction(async (tx) => {
        const [c] = await tx.select().from(campaigns).where(eq(campaigns.id, campanha.id)).for("update");
        if (!c) throw new RifaNacionalError("Campanha não encontrada.", 404);
        // O mínimo de agora, lido na mesma transação.
        const minimo = (await lerPlataforma(tx)).rifaNacional.minimoCents;
        const falta = problemaNoMinimo(c.totalQuotas, c.priceCents, minimo);
        if (falta && c.nacionalStatus === null) throw new RifaNacionalError(falta, 422);

        const r = await tx.execute(sql`
          UPDATE campaigns
             SET nacional_status = 'em_analise',
                 nacional_arrecadacao_cents = total_quotas::bigint * price_cents::bigint
           WHERE id = ${c.id}::uuid
             AND nacional_status IS NULL
             AND status IN ('draft', 'published')
             AND travada_em IS NULL
             AND NOT demonstracao
             AND total_quotas::bigint * price_cents::bigint >= ${minimo}::bigint
             AND NOT EXISTS (SELECT 1 FROM draws d WHERE d.campaign_id = campaigns.id AND d.executed_at IS NOT NULL)
          RETURNING nacional_arrecadacao_cents
        `);
        if (!r.rows.length) throw new RifaNacionalError(motivoDaRecusa(c, minimo), 409);

        const arrecadacaoCents = Number((r.rows[0] as { nacional_arrecadacao_cents: string }).nacional_arrecadacao_cents);
        const [s] = await tx
          .insert(campanhaSolicitacoes)
          .values({
            protocolo: protocoloDaSolicitacao(new Date(), randomInt),
            campaignId: c.id,
            organizationId: c.organizationId,
            tipo: "nacional",
            // O retrato do que foi pedido (o plano, seção 2).
            alteracoes: { totalQuotas: c.totalQuotas, priceCents: c.priceCents, arrecadacaoCents, minimoCents: minimo } as never,
            motivo: null,
            criadoPor: req.user!.id,
          })
          .returning();
        await auditar(tx, req, "nacional.pedir", c.id, {
          protocolo: s.protocolo,
          arrecadacaoCents,
          minimoCents: minimo,
          totalQuotas: c.totalQuotas,
          priceCents: c.priceCents,
        });
        return { ...s, arrecadacaoCents, minimoCents: minimo, teto: cfg.teto };
      });
    } catch (err) {
      if (isUniqueViolation(err, "uq_solicitacao_rifa_em_analise")) {
        throw new RifaNacionalError("Esta rifa já tem um pedido de rifa nacional em análise.", 409);
      }
      if (!isUniqueViolation(err, "uq_solicitacao_protocolo")) throw err;
    }
  }
  throw new RifaNacionalError("Não foi possível gerar o protocolo. Tente de novo.", 500);
}

/* ------------------------------------------------------------------ *
 * Decidir (chamado de dentro de `decidirSolicitacao()`)
 * ------------------------------------------------------------------ */

/**
 * Aprova o pedido, **dentro da transação de `decidirSolicitacao()`** (a
 * solicitação já está travada: a ordem é solicitação → rifa). Relê total e
 * preço da rifa travada — nunca os do retrato do pedido — e confere contra o
 * mínimo **de agora**, no próprio `UPDATE`. Falhou: 409 "recuse o pedido".
 */
export async function aprovarNacionalNaTransacao(
  tx: Tx,
  req: Request,
  s: { id: string; protocolo: string; campaignId: string },
) {
  const minimo = (await lerPlataforma(tx)).rifaNacional.minimoCents;
  const [c] = await tx.select().from(campaigns).where(eq(campaigns.id, s.campaignId)).for("update");
  if (!c) throw new RifaNacionalError("Campanha não encontrada.", 404);
  const r = await tx.execute(sql`
    UPDATE campaigns
       SET nacional_status = 'aprovada',
           nacional_aprovada_em = now() AT TIME ZONE 'UTC',
           nacional_minimo_cents = ${minimo}::bigint,
           nacional_arrecadacao_cents = total_quotas::bigint * price_cents::bigint
     WHERE id = ${c.id}::uuid
       AND nacional_status = 'em_analise'
       AND status IN ('draft', 'published')
       AND travada_em IS NULL
       AND NOT demonstracao
       AND total_quotas::bigint * price_cents::bigint >= ${minimo}::bigint
       AND NOT EXISTS (SELECT 1 FROM draws d WHERE d.campaign_id = campaigns.id AND d.executed_at IS NOT NULL)
    RETURNING nacional_arrecadacao_cents
  `);
  if (!r.rows.length) {
    const porque = c.nacionalStatus !== "em_analise"
      ? "A rifa não está mais com o pedido em análise."
      : motivoDaRecusa({ ...c, nacionalStatus: null }, minimo);
    throw new RifaNacionalError(`O pedido não cabe mais na rifa: ${porque} Recuse-o.`, 409);
  }
  await auditar(tx, req, "nacional.aprovar", c.id, {
    protocolo: s.protocolo,
    arrecadacaoCents: Number((r.rows[0] as { nacional_arrecadacao_cents: string }).nacional_arrecadacao_cents),
    minimoCents: minimo,
  });
}

/** Desfaz o estado da rifa (recusa, desistência, tirar do ar). Só mexe se havia estado. */
async function limparEstado(tx: Tx, campaignId: string, apenasEmAnalise: boolean) {
  const r = await tx.execute(sql`
    UPDATE campaigns
       SET nacional_status = NULL, nacional_aprovada_em = NULL,
           nacional_minimo_cents = NULL, nacional_arrecadacao_cents = NULL
     WHERE id = ${campaignId}::uuid
       AND ${apenasEmAnalise ? sql`nacional_status = 'em_analise'` : sql`nacional_status IS NOT NULL`}
    RETURNING id
  `);
  return r.rows.length > 0;
}

/** Recusa: o pedido sai e a rifa volta a ser comum. Dentro da transação de quem decide. */
export async function recusarNacionalNaTransacao(
  tx: Tx,
  req: Request,
  s: { protocolo: string; campaignId: string },
  resposta: string,
) {
  if (await limparEstado(tx, s.campaignId, true)) {
    await auditar(tx, req, "nacional.recusar", s.campaignId, { protocolo: s.protocolo, resposta });
  }
}

/** A organização cancelou o pedido em análise (`cancelarSolicitacao`), na transação dela. */
export async function cancelarNacionalNaTransacao(tx: Tx, req: Request, s: { protocolo: string; campaignId: string }) {
  if (await limparEstado(tx, s.campaignId, true)) {
    await auditar(tx, req, "nacional.cancelar", s.campaignId, { protocolo: s.protocolo });
  }
}

/* ------------------------------------------------------------------ *
 * Abrir mão e revogar
 * ------------------------------------------------------------------ */

/**
 * A organização abre mão: cancela o pedido em análise ou tira a aprovação.
 * A solicitação em análise é travada **antes** da rifa (a ordem de sempre).
 */
export async function abrirMaoDaNacional(req: Request, campaignId: string) {
  const campanha = await assertCampaignInScope(req, campaignId);
  if (!orgOf(req)) {
    throw new RifaNacionalError("Quem abre mão é a organização dona; a plataforma revoga com motivo.", 403);
  }
  return db.transaction(async (tx) => {
    const emAnalise = await tx.execute(sql`
      SELECT id, protocolo FROM campanha_solicitacoes
       WHERE campaign_id = ${campanha.id}::uuid AND tipo = 'nacional' AND status = 'em_analise'
       FOR UPDATE
    `);
    const [antes] = (
      await tx.execute(sql`SELECT nacional_status FROM campaigns WHERE id = ${campanha.id}::uuid FOR UPDATE`)
    ).rows as { nacional_status: string | null }[];
    if (!antes?.nacional_status) {
      throw new RifaNacionalError("Esta rifa não tem pedido de rifa nacional nem aprovação.", 409);
    }
    const pedido = emAnalise.rows[0] as { id: string; protocolo: string } | undefined;
    if (pedido) {
      await tx
        .update(campanhaSolicitacoes)
        .set({ status: "cancelada", decididoPor: req.user!.id, decididoEm: new Date() })
        .where(and(eq(campanhaSolicitacoes.id, pedido.id), eq(campanhaSolicitacoes.status, "em_analise")));
    }
    await limparEstado(tx, campanha.id, false);
    await auditar(tx, req, "nacional.abrir_mao", campanha.id, {
      eraStatus: antes.nacional_status,
      protocolo: pedido?.protocolo ?? null,
    });
    return { ok: true, eraStatus: antes.nacional_status };
  });
}

/**
 * A plataforma revoga a aprovação, com motivo (a organização o lê na conversa
 * do pedido que foi aprovado). Só a plataforma (403 para organizador).
 */
export async function revogarNacional(req: Request, campaignId: string, motivo: unknown) {
  requirePlatformAdmin(req);
  const texto = String(motivo ?? "").trim();
  if (texto.length < MOTIVO_MIN) {
    throw new RifaNacionalError(`Explique o motivo da revogação (pelo menos ${MOTIVO_MIN} caracteres).`, 400);
  }
  if (!ehUuid(campaignId)) throw new RifaNacionalError("Campanha não encontrada.", 404);
  const campanha = await assertCampaignInScope(req, campaignId);
  const aviso = texto.slice(0, MOTIVO_MAX);
  return db.transaction(async (tx) => {
    const r = await tx.execute(sql`
      UPDATE campaigns
         SET nacional_status = NULL, nacional_aprovada_em = NULL,
             nacional_minimo_cents = NULL, nacional_arrecadacao_cents = NULL
       WHERE id = ${campanha.id}::uuid AND nacional_status = 'aprovada'
      RETURNING id
    `);
    if (!r.rows.length) throw new RifaNacionalError("Esta rifa não é nacional aprovada.", 409);
    // O motivo entra na conversa do pedido aprovado: é onde a organização lê.
    const [pedido] = (
      await tx.execute(sql`
        SELECT id, protocolo FROM campanha_solicitacoes
         WHERE campaign_id = ${campanha.id}::uuid AND tipo = 'nacional' AND status = 'aprovada'
         ORDER BY decidido_em DESC NULLS LAST, created_at DESC LIMIT 1
      `)
    ).rows as { id: string; protocolo: string }[];
    if (pedido) {
      await tx.insert(campanhaSolicitacaoMensagens).values({
        solicitacaoId: pedido.id,
        autor: "plataforma",
        userId: req.user!.id,
        texto: `A condição de rifa nacional foi revogada: ${aviso}`,
      });
    }
    await auditar(tx, req, "nacional.revogar", campanha.id, { protocolo: pedido?.protocolo ?? null, motivo: aviso });
    return { ok: true };
  });
}

/* ------------------------------------------------------------------ *
 * Total e preço travados enquanto houver pedido ou aprovação
 * ------------------------------------------------------------------ */

/**
 * Grava a edição de um **rascunho** que pode tocar total ou preço. O `UPDATE`
 * leva a condição `nacional_status IS NULL OR <o mesmo valor>` para cada um
 * dos dois campos que vierem: com pedido ou aprovação, mudar o número é 409
 * (a aprovação nunca cai calada); mandar o mesmo valor não muda nada e passa.
 * A corrida pedir × PATCH se resolve na própria linha — no `READ COMMITTED` o
 * `UPDATE` reavalia a condição depois de esperar a trava. Sem consultar antes.
 */
export async function atualizarRascunho(
  campaignId: string,
  changes: Partial<typeof campaigns.$inferInsert>,
): Promise<Campaign> {
  const guardas = [];
  if (changes.totalQuotas !== undefined) {
    guardas.push(sql`(${campaigns.nacionalStatus} IS NULL OR ${campaigns.totalQuotas} = ${changes.totalQuotas})`);
  }
  if (changes.priceCents !== undefined) {
    guardas.push(sql`(${campaigns.nacionalStatus} IS NULL OR ${campaigns.priceCents} = ${changes.priceCents})`);
  }
  const [updated] = await db
    .update(campaigns)
    .set(changes)
    .where(and(eq(campaigns.id, campaignId), ...guardas))
    .returning();
  if (updated) return updated;
  const [c] = await db.select({ id: campaigns.id, nacionalStatus: campaigns.nacionalStatus }).from(campaigns).where(eq(campaigns.id, campaignId));
  if (!c) throw new RifaNacionalError("Campanha não encontrada.", 404);
  throw new RifaNacionalError(
    "Esta rifa pediu ser nacional: abra mão do pedido para mudar o total de cotas ou o preço.",
    409,
  );
}

/* ------------------------------------------------------------------ *
 * Leitura: o estado de agora (a tela da PR 5 lê daqui)
 * ------------------------------------------------------------------ */

/**
 * O estado da rifa nacional, no recorte de quem olha (a do vizinho é 404). A
 * organização lê o mínimo mesmo com o interruptor desligado (é só leitura);
 * quem pede é que não pode.
 */
export async function estadoDaNacional(req: Request, campaignId: string) {
  const c = await assertCampaignInScope(req, campaignId);
  const cfg = (await getPlataforma()).rifaNacional;
  const conta = avaliarMinimo(c.totalQuotas, c.priceCents, cfg.minimoCents);
  const [pedido] = await db
    .select({
      id: campanhaSolicitacoes.id,
      protocolo: campanhaSolicitacoes.protocolo,
      status: campanhaSolicitacoes.status,
      decisao: campanhaSolicitacoes.decisao,
      decididoEm: campanhaSolicitacoes.decididoEm,
    })
    .from(campanhaSolicitacoes)
    .where(and(eq(campanhaSolicitacoes.campaignId, c.id), eq(campanhaSolicitacoes.tipo, "nacional")))
    .orderBy(sql`${campanhaSolicitacoes.createdAt} DESC`)
    .limit(1);
  return {
    ligado: cfg.ligado,
    minimoCents: cfg.minimoCents,
    arrecadacaoCents: conta.arrecadacaoCents,
    atinge: conta.atinge,
    faltaCents: conta.faltaCents,
    status: c.nacionalStatus,
    aprovadaEm: c.nacionalAprovadaEm,
    // Total e preço travam com pedido ou aprovação (`atualizarRascunho`).
    totalEPrecoTravados: c.nacionalStatus !== null,
    pedido: pedido ?? null,
  };
}
