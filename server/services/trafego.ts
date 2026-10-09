/**
 * Gestão de tráfego pago. As regras puras estão em `shared/trafego.ts`; o
 * plano, em `docs/PLANO-TRAFEGO-PAGO.md`.
 *
 * Dinheiro que anda aqui (tudo pelo livro de saldo do patrocínio,
 * `patrocinio_lancamentos`, chave única — repetir nunca lança duas vezes e o
 * saldo nunca fica negativo):
 * - o **pedido** reserva no saldo a verba de mídia mais a taxa de gestão, na
 *   mesma transação que grava a campanha (`trafego:<id>`): sem saldo, nada
 *   fica. Saldo retido cautelarmente não paga campanha nova nem a aprovação
 *   (a mídia sairia da conta da plataforma para a rede);
 * - **recusa** e **cancelamento** (só em análise, nada foi gasto) devolvem a
 *   reserva inteira (`trafego-devolucao:<id>`);
 * - cada **gasto lançado** consome a reserva (mídia + taxa do próprio gasto,
 *   para baixo) sem mexer no saldo, num `UPDATE` condicional que nunca passa
 *   da verba; um lançamento por campanha, dia e rede (o índice decide);
 * - **encerrar** (a organização, a plataforma ou o relógio, quando a rifa sai
 *   do ar) só para a campanha: ela fica "fechando a conta" e **ainda recebe o
 *   gasto dos dias até o encerramento** — a rede cobra a plataforma pelo dia
 *   em que a campanha ainda rodou, e o lançamento chega depois. A sobra
 *   (`trafego-sobra:<id>`) só volta quando a plataforma **fecha a conta**, ou
 *   quando a verba acaba.
 *
 * Ordem das travas, sempre: a linha da organização, depois a campanha (a
 * mesma de quem retém e de quem paga). Pedir trava a organização antes de
 * gravar; fechar, decidir e lançar também — na ordem inversa, pedir uma
 * campanha nova enquanto a anterior da mesma rifa fecha era deadlock.
 *
 * Uma rifa tem no máximo uma campanha em aberto — o índice parcial decide
 * (nunca um SELECT antes), e a violação derruba a transação inteira, reserva
 * junto. Recorte: a organização vê e mexe só nas dela (a do vizinho é 404);
 * decidir, lançar gasto, fechar a conta e configurar são da plataforma (403).
 * A auditoria vai na mesma transação do que ela registra.
 */
import type { Request } from "express";
import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "../db";
import { auditLog, campaigns, organizations, trafegoCampanhas, trafegoGastos, users } from "@shared/schema";
import {
  SITUACOES_EM_ABERTO,
  codigoDaCampanha,
  custoPorVenda,
  linkDoAnuncio,
  problemaNaRecusa,
  reservaDoPedido,
  sobraDaCampanha,
  taxaSobre,
  utmCampanhaDe,
  validarGasto,
  validarPedidoDeTrafego,
  type ConfigTrafegoPago,
  type RedeDeAnuncio,
} from "@shared/trafego";
import { diaNoFuso } from "@shared/resultados";
import { isUniqueViolation } from "../pgError";
import { assertCampaignInScope, orgOf } from "./orgs";
import { lancar } from "./patrocinio";
import { exigirSemRetencao } from "./retencao";
import { getPlataforma } from "./settings";
import { baseDoSite } from "./urls";

export class TrafegoError extends Error {
  constructor(message: string, readonly status = 400) {
    super(message);
    this.name = "TrafegoError";
  }
}

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

const campos = {
  id: trafegoCampanhas.id,
  organizationId: trafegoCampanhas.organizationId,
  campaignId: trafegoCampanhas.campaignId,
  redes: trafegoCampanhas.redes,
  uf: trafegoCampanhas.uf,
  cidade: trafegoCampanhas.cidade,
  observacao: trafegoCampanhas.observacao,
  investimentoCents: trafegoCampanhas.investimentoCents,
  verbaDiaCents: trafegoCampanhas.verbaDiaCents,
  taxaPct: trafegoCampanhas.taxaPct,
  reservaCents: trafegoCampanhas.reservaCents,
  gastoCents: trafegoCampanhas.gastoCents,
  taxaCents: trafegoCampanhas.taxaCents,
  status: trafegoCampanhas.status,
  motivo: trafegoCampanhas.motivo,
  createdAt: trafegoCampanhas.createdAt,
  aprovadoEm: trafegoCampanhas.aprovadoEm,
  encerradoEm: trafegoCampanhas.encerradoEm,
  devolvidoCents: trafegoCampanhas.devolvidoCents,
};
type Campanha = { [K in keyof typeof campos]: (typeof trafegoCampanhas.$inferSelect)[K & keyof typeof trafegoCampanhas.$inferSelect] };

const aviso = (e: unknown) =>
  e instanceof TrafegoError ? e : new TrafegoError((e as Error).message, (e as { status?: number }).status ?? 400);

async function config(): Promise<ConfigTrafegoPago> {
  return (await getPlataforma()).trafegoPago;
}

/** O produto só existe para a organização com a plataforma tendo ligado. */
async function configLigada(): Promise<ConfigTrafegoPago> {
  const cfg = await config();
  if (!cfg.ligado) throw new TrafegoError("Não encontrado.", 404);
  return cfg;
}

const idValido = (id: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);

/** A campanha no recorte de quem pede: a do vizinho é 404, nunca 403. */
async function campanhaNoRecorte(req: Request, id: string): Promise<Campanha> {
  if (!idValido(id)) throw new TrafegoError("Campanha não encontrada.", 404);
  const [c] = await db.select(campos).from(trafegoCampanhas).where(eq(trafegoCampanhas.id, id));
  const org = orgOf(req);
  if (!c || (org && c.organizationId !== org)) throw new TrafegoError("Campanha não encontrada.", 404);
  return c;
}

/**
 * Trava a organização e depois a campanha, nesta ordem (a de quem retém e de
 * quem paga). O dono da campanha nunca muda, então lê-lo antes é seguro; a
 * conferência repete-se com as duas linhas travadas.
 */
async function travar(tx: Tx, id: string): Promise<Campanha> {
  const [dono] = await tx.select({ org: trafegoCampanhas.organizationId }).from(trafegoCampanhas).where(eq(trafegoCampanhas.id, id));
  if (!dono) throw new TrafegoError("Campanha não encontrada.", 404);
  await tx.execute(sql`select 1 from organizations where id = ${dono.org}::uuid for update`);
  const [c] = await tx.select(campos).from(trafegoCampanhas).where(eq(trafegoCampanhas.id, id)).for("update");
  if (!c || c.organizationId !== dono.org) throw new TrafegoError("Campanha não encontrada.", 404);
  return c;
}

/** A régua da vitrine: rifa publicada, não travada, não demonstração, promotora nem arquivada nem banida. */
async function rifaSegueNoAr(tx: Tx, campaignId: string): Promise<boolean> {
  const r = await tx.execute(sql`
    select 1 from campaigns c join organizations o on o.id = c.organization_id
     where c.id = ${campaignId}::uuid and c.status = 'published' and c.travada_em is null
       and not c.demonstracao and o.archived_at is null and o.banida_em is null`);
  return r.rows.length > 0;
}

/** A auditoria entra na transação do que registra: sem ela, nada muda. */
async function auditar(tx: Tx, req: Request | null, action: string, id: string, diff: Record<string, unknown>) {
  await tx.insert(auditLog).values({
    actorId: req?.user?.id ?? null,
    actorRole: (req?.user?.role ?? null) as never,
    action,
    entity: "trafego_campanha",
    entityId: id,
    diff: diff as never,
    ip: req?.ip ?? null,
  });
}

/**
 * Fecha a campanha (já travada por quem chama) e devolve ao saldo o que
 * sobrou da reserva, uma vez só (a chave do livro decide). A data do
 * encerramento que já existia (a parada) fica: é ela que limita os gastos.
 */
async function fecharNaTransacao(
  tx: Tx,
  c: Campanha,
  status: "encerrada" | "recusada" | "cancelada",
  extra: { motivo?: string | null; decididoPor?: string | null },
  descricao: string,
) {
  const [feito] = await tx
    .update(trafegoCampanhas)
    .set({
      status,
      encerradoEm: sql`coalesce(${trafegoCampanhas.encerradoEm}, now())`,
      ...(extra.motivo !== undefined ? { motivo: extra.motivo } : {}),
      ...(extra.decididoPor !== undefined ? { decididoPor: extra.decididoPor } : {}),
    })
    .where(and(eq(trafegoCampanhas.id, c.id), eq(trafegoCampanhas.status, c.status)))
    .returning(campos);
  if (!feito) throw new TrafegoError("Esta campanha mudou de situação. Atualize a tela.", 409);
  const sobra = sobraDaCampanha(feito);
  if (sobra > 0) {
    const devolucao = status !== "encerrada";
    await lancar(tx, {
      organizationId: feito.organizationId,
      valorCents: sobra,
      motivo: devolucao ? "trafego-devolucao" : "trafego-sobra",
      chave: devolucao ? `trafego-devolucao:${c.id}` : `trafego-sobra:${c.id}`,
      descricao,
    });
    await tx.update(trafegoCampanhas).set({ devolvidoCents: sobra }).where(eq(trafegoCampanhas.id, c.id));
    feito.devolvidoCents = sobra;
  }
  return feito;
}

/** Para a campanha no ar: ela passa a "fechando a conta", sem devolver nada ainda. */
async function pararNaTransacao(tx: Tx, c: Campanha, decididoPor: string | null | undefined) {
  const [feito] = await tx
    .update(trafegoCampanhas)
    .set({ status: "encerrando", encerradoEm: new Date(), ...(decididoPor !== undefined ? { decididoPor } : {}) })
    .where(and(eq(trafegoCampanhas.id, c.id), eq(trafegoCampanhas.status, "ativa")))
    .returning(campos);
  if (!feito) throw new TrafegoError("Esta campanha mudou de situação. Atualize a tela.", 409);
  return feito;
}

/* ------------------------------------------------------------------ *
 * Organização: pedir, cancelar, encerrar
 * ------------------------------------------------------------------ */

export async function pedirCampanha(req: Request, entrada: Record<string, unknown>) {
  const cfg = await configLigada();
  const org = orgOf(req);
  // Quem contrata é a organização, com o saldo dela: a plataforma não contrata por ela.
  if (!org) throw new TrafegoError("Quem contrata a campanha é a organização.", 403);
  const rifa = await assertCampaignInScope(req, String(entrada.campaignId ?? ""));
  if (rifa.status !== "published" || rifa.travadaEm || rifa.demonstracao) {
    throw new TrafegoError("Só rifa no ar, à venda, pode ter campanha de anúncios.", 409);
  }
  let pedido: ReturnType<typeof validarPedidoDeTrafego>;
  try {
    pedido = validarPedidoDeTrafego(cfg, entrada);
  } catch (e) {
    throw aviso(e);
  }
  const reservaCents = reservaDoPedido(pedido.investimentoCents, cfg.taxaPct);
  try {
    return await db.transaction(async (tx) => {
      // A trava da organização vem antes de tudo (a mesma ordem de quem retém).
      await exigirSemRetencao(tx, org);
      const [nova] = await tx
        .insert(trafegoCampanhas)
        .values({
          organizationId: org,
          campaignId: rifa.id,
          redes: pedido.redes,
          uf: pedido.uf,
          cidade: pedido.cidade,
          observacao: pedido.observacao,
          investimentoCents: pedido.investimentoCents,
          verbaDiaCents: pedido.verbaDiaCents,
          taxaPct: cfg.taxaPct,
          reservaCents,
          criadoPor: req.user!.id,
        })
        .returning(campos);
      // Reserva na mesma transação: sem saldo, a campanha também não fica.
      await lancar(tx, {
        organizationId: org,
        valorCents: -reservaCents,
        motivo: "trafego",
        chave: `trafego:${nova.id}`,
        descricao: `Tráfego pago (reserva): ${rifa.prizeTitle}`,
        userId: req.user!.id,
      });
      await auditar(tx, req, "trafego.pedido", nova.id, {
        campaignId: nova.campaignId,
        redes: nova.redes,
        investimentoCents: nova.investimentoCents,
        taxaPct: nova.taxaPct,
        reservaCents: nova.reservaCents,
      });
      return nova;
    });
  } catch (e) {
    if (isUniqueViolation(e, "uq_trafego_aberto_por_rifa")) {
      throw new TrafegoError("Esta rifa já tem uma campanha em andamento.", 409);
    }
    throw e;
  }
}

export async function cancelarCampanha(req: Request, id: string) {
  const c = await campanhaNoRecorte(req, id);
  if (!orgOf(req)) throw new TrafegoError("Quem cancela o pedido é a organização. A plataforma recusa.", 403);
  return db.transaction(async (tx) => {
    const atual = await travar(tx, c.id);
    if (atual.status !== "em_analise") throw new TrafegoError("Só dá para cancelar enquanto está em análise.", 409);
    const feito = await fecharNaTransacao(tx, atual, "cancelada", {}, "Campanha cancelada: a reserva voltou ao saldo");
    await auditar(tx, req, "trafego.cancelar", feito.id, { devolvidoCents: feito.devolvidoCents });
    return feito;
  });
}

/**
 * Encerrar a campanha no ar (a organização ou a plataforma): ela para e fica
 * "fechando a conta" até a plataforma lançar os últimos dias e fechar. A
 * sobra não volta aqui — o dia em que a campanha ainda rodou a rede cobra.
 */
export async function encerrarCampanha(req: Request, id: string) {
  const c = await campanhaNoRecorte(req, id);
  return db.transaction(async (tx) => {
    const atual = await travar(tx, c.id);
    if (atual.status !== "ativa") throw new TrafegoError("Só dá para encerrar a campanha no ar.", 409);
    const feito = await pararNaTransacao(tx, atual, orgOf(req) ? undefined : req.user!.id);
    await auditar(tx, req, "trafego.encerrar", feito.id, { gastoCents: feito.gastoCents, taxaCents: feito.taxaCents });
    return feito;
  });
}

/* ------------------------------------------------------------------ *
 * Plataforma: decidir, lançar gasto, fechar a conta
 * ------------------------------------------------------------------ */

export async function decidirCampanha(req: Request, id: string, entrada: { aprovar?: unknown; motivo?: unknown }) {
  if (orgOf(req)) throw new TrafegoError("Decidir é da plataforma.", 403);
  const aprovar = entrada.aprovar === true;
  if (!aprovar) {
    const p = problemaNaRecusa(entrada.motivo);
    if (p) throw new TrafegoError(p);
  }
  if (!idValido(id)) throw new TrafegoError("Campanha não encontrada.", 404);
  return db.transaction(async (tx) => {
    const atual = await travar(tx, id);
    if (atual.status !== "em_analise") throw new TrafegoError("Esta campanha já foi decidida.", 409);
    if (!aprovar) {
      const feito = await fecharNaTransacao(
        tx,
        atual,
        "recusada",
        { motivo: String(entrada.motivo).trim(), decididoPor: req.user!.id },
        "Campanha recusada: a reserva voltou ao saldo",
      );
      await auditar(tx, req, "trafego.recusar", feito.id, { organizacao: feito.organizationId, motivo: feito.motivo, devolvidoCents: feito.devolvidoCents });
      return feito;
    }
    // Saldo retido não vira mídia: a organização já está travada pela leitura acima.
    await exigirSemRetencao(tx, atual.organizationId);
    if (!(await rifaSegueNoAr(tx, atual.campaignId))) {
      throw new TrafegoError("A rifa saiu do ar (ou a promotora foi suspensa): recuse o pedido para devolver a reserva.", 409);
    }
    const [feito] = await tx
      .update(trafegoCampanhas)
      .set({ status: "ativa", aprovadoEm: new Date(), motivo: null, decididoPor: req.user!.id })
      .where(and(eq(trafegoCampanhas.id, id), eq(trafegoCampanhas.status, "em_analise")))
      .returning(campos);
    if (!feito) throw new TrafegoError("Esta campanha já foi decidida.", 409);
    await auditar(tx, req, "trafego.aprovar", feito.id, { organizacao: feito.organizationId });
    return feito;
  });
}

/**
 * Grava um gasto na campanha já travada (por quem chama) e soma na campanha
 * num `UPDATE` condicional que nunca passa da verba; gastou a verba inteira, a
 * campanha encerra aqui mesmo. Devolve `null` quando o dia nesta rede já foi
 * lançado (o índice decide, `ON CONFLICT DO NOTHING`) — o manual responde 409,
 * a importação conta como "já lançado".
 */
async function gravarGasto(
  tx: Tx,
  c: Campanha,
  g: { dia: string; rede: RedeDeAnuncio; gastoCents: number; cliques: number | null },
  autor: { req: Request | null; origem: "manual" | "importado" },
  extraNaAuditoria: Record<string, unknown> = {},
) {
  const taxa = taxaSobre(g.gastoCents, c.taxaPct);
  const [lancado] = await tx
    .insert(trafegoGastos)
    .values({
      campanhaId: c.id,
      organizationId: c.organizationId,
      dia: g.dia,
      rede: g.rede,
      gastoCents: g.gastoCents,
      taxaCents: taxa,
      cliques: g.cliques,
      origem: autor.origem,
      lancadoPor: autor.req?.user?.id ?? null,
    })
    .onConflictDoNothing({ target: [trafegoGastos.campanhaId, trafegoGastos.dia, trafegoGastos.rede] })
    .returning();
  if (!lancado) return null;
  const [somada] = await tx
    .update(trafegoCampanhas)
    .set({
      gastoCents: sql`${trafegoCampanhas.gastoCents} + ${g.gastoCents}`,
      taxaCents: sql`${trafegoCampanhas.taxaCents} + ${taxa}`,
    })
    .where(
      and(
        eq(trafegoCampanhas.id, c.id),
        eq(trafegoCampanhas.status, c.status),
        sql`${trafegoCampanhas.gastoCents} + ${g.gastoCents} <= ${trafegoCampanhas.investimentoCents}`,
      ),
    )
    .returning(campos);
  if (!somada) throw new TrafegoError("O gasto passa do que resta da verba.", 409);
  let campanha = somada;
  if (somada.gastoCents >= somada.investimentoCents) {
    campanha = await fecharNaTransacao(tx, somada, "encerrada", {}, "Campanha concluída: a sobra da reserva voltou ao saldo");
  }
  await auditar(tx, autor.req, autor.origem === "importado" ? "trafego.gasto.importado" : "trafego.gasto", c.id, {
    dia: lancado.dia,
    rede: lancado.rede,
    gastoCents: lancado.gastoCents,
    taxaCents: lancado.taxaCents,
    cliques: lancado.cliques,
    encerrada: campanha.status === "encerrada",
    ...extraNaAuditoria,
  });
  return { gasto: lancado, campanha };
}

/** O último dia que a campanha ainda pode receber: o da parada, ou hoje (a importação passa ontem). */
const ultimoDiaDoGasto = (c: Campanha, hoje: string) => (c.status === "encerrando" && c.encerradoEm ? diaNoFuso(c.encerradoEm) : hoje);

/**
 * O gasto de um dia numa rede, copiado do painel da rede. Vale para a
 * campanha no ar e para a que está fechando a conta (só os dias até o
 * encerramento). Gastou a verba inteira, a campanha encerra aqui mesmo.
 */
export async function lancarGasto(req: Request, id: string, entrada: unknown) {
  if (orgOf(req)) throw new TrafegoError("Lançar o gasto é da plataforma.", 403);
  if (!idValido(id)) throw new TrafegoError("Campanha não encontrada.", 404);
  return db.transaction(async (tx) => {
    const c = await travar(tx, id);
    if (c.status !== "ativa" && c.status !== "encerrando") throw new TrafegoError("Só a campanha no ar (ou fechando a conta) recebe gasto.", 409);
    let g: ReturnType<typeof validarGasto>;
    try {
      g = validarGasto(
        entrada,
        { redes: c.redes, investimentoCents: c.investimentoCents, gastoCents: c.gastoCents, diaDaAprovacao: c.aprovadoEm ? diaNoFuso(c.aprovadoEm) : null },
        ultimoDiaDoGasto(c, diaNoFuso(new Date())),
      );
    } catch (e) {
      throw aviso(e);
    }
    const feito = await gravarGasto(tx, c, g, { req, origem: "manual" });
    if (!feito) throw new TrafegoError("O gasto deste dia nesta rede já foi lançado.", 409);
    return feito;
  });
}

export type ResultadoDoImportado = "importado" | "ja_lancado" | "sem_campanha" | "fora_da_janela" | "verba_esgotada";

/**
 * Um gasto que veio da rede (fase 2), pela mesma conta do manual. A campanha é
 * achada pelo código (só as no ar ou fechando a conta, e só se o código for de
 * uma só) e travada; o dia tem de estar entre a aprovação e a parada (ou
 * ontem), e a rede tem de ser da campanha. A rede pode ter gastado além da
 * verba (o orçamento lá foi mal posto): entra só o que resta, e o excedente
 * vai na auditoria e no resumo — quem paga a diferença é a plataforma, nunca a
 * organização. O dia já lançado (à mão ou numa importação anterior) fica como
 * está.
 */
export async function lancarGastoImportado(
  g: { codigo: string; dia: string; rede: RedeDeAnuncio; gastoCents: number; cliques: number },
  ontem: string,
): Promise<{ resultado: ResultadoDoImportado; excedenteCents: number }> {
  const achadas = await db.execute(sql`
    select id from trafego_campanhas
     where substr(replace(id::text, '-', ''), 1, 8) = ${g.codigo} and status in ('ativa', 'encerrando')`);
  if (achadas.rows.length !== 1) return { resultado: "sem_campanha", excedenteCents: 0 };
  const id = (achadas.rows[0] as { id: string }).id;
  return db.transaction(async (tx) => {
    const c = await travar(tx, id);
    if (c.status !== "ativa" && c.status !== "encerrando") return { resultado: "sem_campanha" as const, excedenteCents: 0 };
    const desde = c.aprovadoEm ? diaNoFuso(c.aprovadoEm) : null;
    const ate = ultimoDiaDoGasto(c, ontem) < ontem ? ultimoDiaDoGasto(c, ontem) : ontem;
    if ((desde && g.dia < desde) || g.dia > ate || !c.redes.includes(g.rede)) return { resultado: "fora_da_janela" as const, excedenteCents: 0 };
    const resta = c.investimentoCents - c.gastoCents;
    if (resta <= 0) return { resultado: "verba_esgotada" as const, excedenteCents: g.gastoCents };
    const gasto = Math.min(g.gastoCents, resta);
    const excedenteCents = g.gastoCents - gasto;
    const feito = await gravarGasto(
      tx,
      c,
      { dia: g.dia, rede: g.rede, gastoCents: gasto, cliques: g.cliques },
      { req: null, origem: "importado" },
      excedenteCents > 0 ? { gastoNaRedeCents: g.gastoCents, excedenteCents } : {},
    );
    if (!feito) return { resultado: "ja_lancado" as const, excedenteCents: 0 };
    return { resultado: "importado" as const, excedenteCents };
  });
}

/** Fechar a conta da campanha encerrada: lançados os últimos dias, a sobra volta ao saldo. */
export async function fecharConta(req: Request, id: string) {
  if (orgOf(req)) throw new TrafegoError("Fechar a conta é da plataforma.", 403);
  if (!idValido(id)) throw new TrafegoError("Campanha não encontrada.", 404);
  return db.transaction(async (tx) => {
    const atual = await travar(tx, id);
    if (atual.status !== "encerrando") throw new TrafegoError("Só a campanha encerrada, esperando a conta, pode ser fechada.", 409);
    const feito = await fecharNaTransacao(tx, atual, "encerrada", { decididoPor: req.user!.id }, "Campanha encerrada: o que não foi gasto voltou ao saldo");
    await auditar(tx, req, "trafego.fechar", feito.id, { gastoCents: feito.gastoCents, taxaCents: feito.taxaCents, devolvidoCents: feito.devolvidoCents });
    return feito;
  });
}

/* ------------------------------------------------------------------ *
 * Relógio
 * ------------------------------------------------------------------ */

/**
 * A rifa saiu do ar (ou virou demonstração, foi travada, a promotora foi
 * arquivada ou banida): a campanha em análise é cancelada com a reserva de
 * volta; a no ar para e fica fechando a conta (a plataforma lança os últimos
 * dias e fecha). Confere a rifa de novo com a campanha travada: a que voltou
 * ao ar no meio fica como está.
 */
export async function encerrarTrafegoForaDoAr(): Promise<number> {
  const perdidos = await db.execute(sql`
    select t.id from trafego_campanhas t
      join campaigns c on c.id = t.campaign_id
      join organizations o on o.id = t.organization_id
     where t.status in ('em_analise','ativa')
       and (c.status <> 'published' or c.travada_em is not null or c.demonstracao
            or o.archived_at is not null or o.banida_em is not null)`);
  let n = 0;
  for (const { id } of perdidos.rows as { id: string }[]) {
    await db.transaction(async (tx) => {
      const c = await travar(tx, id);
      if (c.status !== "em_analise" && c.status !== "ativa") return;
      if (await rifaSegueNoAr(tx, c.campaignId)) return;
      if (c.status === "em_analise") {
        const feito = await fecharNaTransacao(tx, c, "cancelada", {}, "Campanha não iniciada: a rifa saiu do ar e a reserva voltou ao saldo");
        await auditar(tx, null, "trafego.cancelar.fora_do_ar", feito.id, { devolvidoCents: feito.devolvidoCents });
      } else {
        await pararNaTransacao(tx, c, undefined);
        await auditar(tx, null, "trafego.encerrar.fora_do_ar", c.id, { gastoCents: c.gastoCents });
      }
      n++;
    });
  }
  return n;
}

/* ------------------------------------------------------------------ *
 * Leitura
 * ------------------------------------------------------------------ */

/**
 * O painel: a organização vê as campanhas e o saldo dela; a plataforma vê
 * todas (com o nome da organização), os links para pôr nos anúncios e a
 * margem por mês. Desligado, a organização sem campanha recebe 404 (o
 * produto não existe para ela); a plataforma vê para poder ligar.
 *
 * A venda atribuída é a paga na rifa com a UTM da campanha (`trafego-<código>`):
 * estatística, e a tela diz isso.
 */
export async function painelDoTrafego(req: Request) {
  const cfg = await config();
  const org = orgOf(req);
  // Desligado, a organização sem campanha não vê o produto; a que tem campanha
  // (com dinheiro reservado) continua vendo, cancelando e encerrando as dela.
  if (!cfg.ligado && org) {
    const [tem] = await db.select({ id: trafegoCampanhas.id }).from(trafegoCampanhas).where(eq(trafegoCampanhas.organizationId, org)).limit(1);
    if (!tem) throw new TrafegoError("Não encontrado.", 404);
  }
  const linhas = await db
    .select({
      ...campos,
      organizacao: organizations.name,
      orgSlug: organizations.slug,
      rifa: campaigns.prizeTitle,
      rifaSlug: campaigns.slug,
      vendas: sql<number>`(select count(*)::int from orders x
        where x.campaign_id = ${trafegoCampanhas.campaignId} and x.status = 'paid'
          and x.utm->>'campaign' = 'trafego-' || substr(replace(${trafegoCampanhas.id}::text, '-', ''), 1, 8))`,
      // Os cliques que vieram da rede (importados ou digitados com o gasto).
      cliques: sql<number>`(select coalesce(sum(g.cliques), 0)::int from trafego_gastos g where g.campanha_id = ${trafegoCampanhas.id})`,
      receitaCents: sql<number>`(select coalesce(sum(x.amount_cents), 0)::int from orders x
        where x.campaign_id = ${trafegoCampanhas.campaignId} and x.status = 'paid'
          and x.utm->>'campaign' = 'trafego-' || substr(replace(${trafegoCampanhas.id}::text, '-', ''), 1, 8))`,
    })
    .from(trafegoCampanhas)
    .innerJoin(organizations, eq(organizations.id, trafegoCampanhas.organizationId))
    .innerJoin(campaigns, eq(campaigns.id, trafegoCampanhas.campaignId))
    .where(org ? eq(trafegoCampanhas.organizationId, org) : undefined)
    .orderBy(desc(trafegoCampanhas.createdAt))
    .limit(100);

  let saldoCents: number | null = null;
  if (org) {
    const [o] = await db.select({ s: organizations.patrocinioSaldoCents }).from(organizations).where(eq(organizations.id, org));
    saldoCents = o?.s ?? 0;
  }
  const base = baseDoSite(req);
  return {
    config: cfg,
    saldoCents,
    campanhas: linhas.map((l) => ({
      ...l,
      organizacao: org ? undefined : l.organizacao,
      orgSlug: undefined,
      rifaSlug: undefined,
      codigo: codigoDaCampanha(l.id),
      utmCampanha: utmCampanhaDe(l.id),
      custoPorVendaCents: custoPorVenda(l.gastoCents + l.taxaCents, l.vendas),
      // O endereço que vai em cada anúncio: só para quem monta a campanha (a plataforma).
      links: org
        ? undefined
        : Object.fromEntries(
            (l.redes as RedeDeAnuncio[]).map((r) => [r, linkDoAnuncio(base, { id: l.id, orgSlug: l.orgSlug, rifaSlug: l.rifaSlug }, r)]),
          ),
    })),
    margem: org ? undefined : await margemPorMes(),
  };
}

/** Os gastos lançados de uma campanha, do mais novo ao mais antigo (no recorte). */
export async function gastosDaCampanha(req: Request, id: string) {
  const c = await campanhaNoRecorte(req, id);
  const org = orgOf(req);
  return db
    .select({
      id: trafegoGastos.id,
      dia: trafegoGastos.dia,
      rede: trafegoGastos.rede,
      gastoCents: trafegoGastos.gastoCents,
      taxaCents: trafegoGastos.taxaCents,
      cliques: trafegoGastos.cliques,
      origem: trafegoGastos.origem,
      createdAt: trafegoGastos.createdAt,
      // Quem lançou só para a plataforma: a organização vê "Plataforma".
      lancadoPor: org ? sql<string | null>`null` : users.name,
    })
    .from(trafegoGastos)
    .leftJoin(users, eq(users.id, trafegoGastos.lancadoPor))
    .where(eq(trafegoGastos.campanhaId, c.id))
    .orderBy(desc(trafegoGastos.dia), desc(trafegoGastos.createdAt));
}

/**
 * A margem da plataforma por mês (fuso de São Paulo, pelo dia do gasto): a
 * mídia repassada às redes e a taxa de gestão, no total e por organização.
 * Os últimos 12 meses.
 */
async function margemPorMes() {
  const r = await db.execute(sql`
    select substr(g.dia, 1, 7) as mes, o.name as organizacao,
           sum(g.gasto_cents)::bigint as midia, sum(g.taxa_cents)::bigint as taxa
      from trafego_gastos g
      join organizations o on o.id = g.organization_id
     where g.dia >= to_char((now() at time zone 'America/Sao_Paulo') - interval '11 months', 'YYYY-MM') || '-01'
     group by 1, 2
     order by 1 desc, 4 desc`);
  const meses = new Map<string, { mes: string; midiaCents: number; taxaCents: number; organizacoes: { organizacao: string; midiaCents: number; taxaCents: number }[] }>();
  for (const l of r.rows as { mes: string; organizacao: string; midia: string; taxa: string }[]) {
    const m = meses.get(l.mes) ?? { mes: l.mes, midiaCents: 0, taxaCents: 0, organizacoes: [] };
    const midia = Number(l.midia);
    const taxa = Number(l.taxa);
    m.midiaCents += midia;
    m.taxaCents += taxa;
    m.organizacoes.push({ organizacao: l.organizacao, midiaCents: midia, taxaCents: taxa });
    meses.set(l.mes, m);
  }
  return [...meses.values()];
}
