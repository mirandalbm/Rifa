/**
 * Gestão de tráfego pago. As regras puras estão em `shared/trafego.ts`; o
 * plano, em `docs/PLANO-TRAFEGO-PAGO.md`.
 *
 * Dinheiro que anda aqui (tudo pelo livro de saldo do patrocínio,
 * `patrocinio_lancamentos`, chave única — repetir nunca lança duas vezes e o
 * saldo nunca fica negativo):
 * - o **pedido** só entra com o aceite explícito da taxa (`aceiteTaxa: true`,
 *   422 sem ele; grava quando, a versão e a impressão SHA-256 do texto) e
 *   reserva no saldo a verba de mídia mais a taxa de gestão, na mesma
 *   transação que grava a campanha (`trafego:<id>`): sem saldo, nada fica.
 *   Saldo retido cautelarmente não paga campanha nova nem a aprovação (a
 *   mídia sairia da conta da plataforma para a rede);
 * - a **aprovação** cobra a taxa de gestão **inteira** (`taxa_cents`,
 *   `taxa_cobrada_em`), na mesma transação do `UPDATE` condicional — o saldo
 *   não se mexe, a taxa já estava dentro da reserva — e ela **nunca volta**,
 *   em caso nenhum depois disso (encerrar sem gastar, rifa fora do ar, verba
 *   que acabou);
 * - **recusa** e **cancelamento** (só em análise, nada foi cobrado) devolvem a
 *   reserva inteira, mídia e taxa (`trafego-devolucao:<id>`);
 * - cada **gasto lançado** consome só a verba de mídia, sem mexer no saldo,
 *   num `UPDATE` condicional que nunca passa da verba; um lançamento por
 *   campanha, dia e rede (o índice decide). A campanha de antes desta regra
 *   (sem `taxa_cobrada_em`) segue com a taxa diária (`taxaDoLancamento()`);
 * - **encerrar** (a organização, a plataforma ou o relógio, quando a rifa sai
 *   do ar) só para a campanha: ela fica "fechando a conta" e **ainda recebe o
 *   gasto dos dias até o encerramento** — a rede cobra a plataforma pelo dia
 *   em que a campanha ainda rodou, e o lançamento chega depois. A mídia que
 *   não foi gasta (`trafego-sobra:<id>`) volta **como crédito** no saldo — nunca
 *   em dinheiro — quando a plataforma **fecha a conta**, ou quando a verba
 *   acaba.
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
  ACEITE_DA_TAXA_VERSAO,
  SITUACOES_EM_ABERTO,
  codigoDaCampanha,
  custoPorVenda,
  linkDoAnuncio,
  problemaNaRecusa,
  problemaNoAceiteDaTaxa,
  reservaDoPedido,
  sobraDaCampanha,
  taxaDoLancamento,
  taxaSobre,
  textoDoAceiteDaTaxa,
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
import { hashDoContrato } from "./contratoPromotora";
import { criacoesDasCampanhas, pausarNaRedeDepois, situacaoDaCriacaoPelaApi } from "./trafegoCriacao";

export class TrafegoError extends Error {
  constructor(message: string, readonly status = 400) {
    super(message);
    this.name = "TrafegoError";
  }
}

export type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

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
  taxaCobradaEm: trafegoCampanhas.taxaCobradaEm,
  taxaAceiteEm: trafegoCampanhas.taxaAceiteEm,
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

export const idValido = (id: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);

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
export async function travar(tx: Tx, id: string): Promise<Campanha> {
  const [dono] = await tx.select({ org: trafegoCampanhas.organizationId }).from(trafegoCampanhas).where(eq(trafegoCampanhas.id, id));
  if (!dono) throw new TrafegoError("Campanha não encontrada.", 404);
  await tx.execute(sql`select 1 from organizations where id = ${dono.org}::uuid for update`);
  const [c] = await tx.select(campos).from(trafegoCampanhas).where(eq(trafegoCampanhas.id, id)).for("update");
  if (!c || c.organizationId !== dono.org) throw new TrafegoError("Campanha não encontrada.", 404);
  return c;
}

/** A régua da vitrine: rifa publicada, não travada, não demonstração, promotora nem arquivada nem banida. */
export async function rifaSegueNoAr(tx: Tx, campaignId: string): Promise<boolean> {
  const r = await tx.execute(sql`
    select 1 from campaigns c join organizations o on o.id = c.organization_id
     where c.id = ${campaignId}::uuid and c.status = 'published' and c.travada_em is null
       and not c.demonstracao and o.archived_at is null and o.banida_em is null`);
  return r.rows.length > 0;
}

/** A auditoria entra na transação do que registra: sem ela, nada muda. */
export async function auditar(tx: Tx, req: Request | null, action: string, id: string, diff: Record<string, unknown>) {
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
 * Fecha a campanha (já travada por quem chama) e devolve ao saldo, como
 * crédito, o que sobrou da reserva, uma vez só (a chave do livro decide). Com
 * a taxa já cobrada na aprovação, o que sobra é só a mídia não gasta; recusada
 * ou cancelada, nada foi cobrado e volta tudo. A data do
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
  // O aceite da taxa vem depois do erro de preenchimento e antes de qualquer gravação.
  const semAceite = problemaNoAceiteDaTaxa(entrada.aceiteTaxa);
  if (semAceite) throw new TrafegoError(semAceite, 422);
  const reservaCents = reservaDoPedido(pedido.investimentoCents, cfg.taxaPct);
  // O texto que a pessoa leu é remontado aqui, do pedido: a impressão nunca vem do navegador.
  const textoDoAceite = textoDoAceiteDaTaxa(cfg.taxaPct, taxaSobre(pedido.investimentoCents, cfg.taxaPct));
  const aceiteSha256 = hashDoContrato(textoDoAceite);
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
          taxaAceiteEm: sql`now() at time zone 'UTC'`,
          taxaAceiteVersao: ACEITE_DA_TAXA_VERSAO,
          taxaAceiteSha256: aceiteSha256,
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
        aceiteDaTaxa: { versao: ACEITE_DA_TAXA_VERSAO, sha256: aceiteSha256 },
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
    const feito = await fecharNaTransacao(tx, atual, "cancelada", {}, "Campanha cancelada: a reserva (mídia e taxa) voltou ao saldo");
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
  const feito = await db.transaction(async (tx) => {
    const atual = await travar(tx, c.id);
    if (atual.status !== "ativa") throw new TrafegoError("Só dá para encerrar a campanha no ar.", 409);
    const parada = await pararNaTransacao(tx, atual, orgOf(req) ? undefined : req.user!.id);
    await auditar(tx, req, "trafego.encerrar", parada.id, { gastoCents: parada.gastoCents, taxaCents: parada.taxaCents });
    return parada;
  });
  // Fase 3: criada no Meta, pausa lá — depois da transação, sem derrubar o encerramento.
  pausarNaRedeDepois(feito.id);
  return feito;
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
        "Campanha recusada: a reserva (mídia e taxa) voltou ao saldo",
      );
      await auditar(tx, req, "trafego.recusar", feito.id, { organizacao: feito.organizationId, motivo: feito.motivo, devolvidoCents: feito.devolvidoCents });
      return feito;
    }
    // Saldo retido não vira mídia: a organização já está travada pela leitura acima.
    await exigirSemRetencao(tx, atual.organizationId);
    if (!(await rifaSegueNoAr(tx, atual.campaignId))) {
      throw new TrafegoError("A rifa saiu do ar (ou a promotora foi suspensa): recuse o pedido para devolver a reserva.", 409);
    }
    // A taxa de gestão é cobrada inteira aqui e nunca volta. O saldo não se mexe: ela já
    // estava dentro da reserva. Só com o aceite gravado no pedido — o pedido feito antes do
    // aceite existir segue com a taxa diária (sem `taxa_cobrada_em`), nunca cobrado às cegas.
    const taxaInteira = atual.taxaAceiteEm ? taxaSobre(atual.investimentoCents, atual.taxaPct) : null;
    const [feito] = await tx
      .update(trafegoCampanhas)
      .set({
        status: "ativa",
        aprovadoEm: new Date(),
        motivo: null,
        decididoPor: req.user!.id,
        ...(taxaInteira !== null ? { taxaCents: taxaInteira, taxaCobradaEm: sql`now() at time zone 'UTC'` } : {}),
      })
      .where(and(eq(trafegoCampanhas.id, id), eq(trafegoCampanhas.status, "em_analise")))
      .returning(campos);
    if (!feito) throw new TrafegoError("Esta campanha já foi decidida.", 409);
    await auditar(tx, req, "trafego.aprovar", feito.id, {
      organizacao: feito.organizationId,
      taxaCobradaCents: feito.taxaCobradaEm ? feito.taxaCents : 0,
      taxaDiaria: !feito.taxaCobradaEm,
    });
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
  const taxa = taxaDoLancamento(c, g.gastoCents);
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
    campanha = await fecharNaTransacao(tx, somada, "encerrada", {}, "Campanha concluída: a mídia não gasta voltou ao saldo como crédito");
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
  }).then((feito) => {
    // A verba acabou e a campanha encerrou: criada no Meta, pausa lá.
    if (feito.campanha.status === "encerrada") pausarNaRedeDepois(feito.campanha.id);
    return feito;
  });
}

export type ResultadoDoImportado = "importado" | "atualizado" | "ja_lancado" | "sem_campanha" | "fora_da_janela" | "excedente";

/**
 * Um gasto que veio da rede (fase 2), na mesma régua do manual: a mesma taxa
 * (`taxaDoLancamento()`: nenhuma por dia se a taxa já foi cobrada na
 * aprovação; a diária, para baixo, só na campanha de antes), o mesmo teto da verba no `UPDATE` condicional, a
 * mesma ordem das travas e a auditoria na mesma transação.
 *
 * - **A campanha** é achada pelo código: a aberta (no ar ou fechando a conta)
 *   se houver uma só; senão a única com o código. Em análise, recusada e
 *   cancelada nunca rodaram (sem aprovação, o dia fica fora).
 * - **O dia é atualizado enquanto está na janela**: a rede ainda fecha o de
 *   ontem e acerta cliques inválidos. O lançado à mão nunca é tocado.
 * - **Só se cobra o dia cobrável**: campanha no ar, ou fechando a conta até o
 *   dia da parada, e só até a verba. O resto que a rede gastou — além da
 *   verba, depois da parada, com a campanha fechada — vai em
 *   `excedente_cents`: custo da plataforma, nunca da organização.
 */
export async function lancarGastoImportado(
  g: { codigo: string; dia: string; rede: RedeDeAnuncio; gastoCents: number; cliques: number },
  ontem: string,
): Promise<{ resultado: ResultadoDoImportado; excedenteCents: number }> {
  const achadas = (
    await db.execute(sql`
      select id, status from trafego_campanhas
       where substr(replace(id::text, '-', ''), 1, 8) = ${g.codigo} and status <> 'em_analise'`)
  ).rows as { id: string; status: string }[];
  const abertas = achadas.filter((a) => a.status === "ativa" || a.status === "encerrando");
  const alvo = abertas.length === 1 ? abertas[0] : abertas.length === 0 && achadas.length === 1 ? achadas[0] : null;
  if (!alvo) return { resultado: "sem_campanha", excedenteCents: 0 };

  let encerrou = false;
  const r = await db.transaction(async (tx) => {
    const c = await travar(tx, alvo.id);
    const desde = c.aprovadoEm ? diaNoFuso(c.aprovadoEm) : null;
    if (!desde || g.dia < desde || g.dia > ontem || !c.redes.includes(g.rede)) return { resultado: "fora_da_janela" as const, excedenteCents: 0 };
    const [antes] = await tx
      .select()
      .from(trafegoGastos)
      .where(and(eq(trafegoGastos.campanhaId, c.id), eq(trafegoGastos.dia, g.dia), eq(trafegoGastos.rede, g.rede)))
      .for("update");
    if (antes && antes.origem !== "importado") return { resultado: "ja_lancado" as const, excedenteCents: 0 };

    const parada = c.encerradoEm ? diaNoFuso(c.encerradoEm) : null;
    const cobravel = (c.status === "ativa" || c.status === "encerrando") && (!parada || g.dia <= parada);
    const jaCobrado = antes?.gastoCents ?? 0;
    // Cobrável: até o que resta da verba (contando o que este dia já tinha). Senão, o dia fica como estava.
    const gasto = cobravel ? Math.min(g.gastoCents, jaCobrado + (c.investimentoCents - c.gastoCents)) : jaCobrado;
    const excedenteCents = Math.max(0, g.gastoCents - gasto);
    const taxa = taxaDoLancamento(c, gasto);
    if (antes && antes.gastoCents === gasto && antes.excedenteCents === excedenteCents && antes.cliques === g.cliques) {
      return { resultado: "ja_lancado" as const, excedenteCents: 0 };
    }

    if (antes) {
      await tx
        .update(trafegoGastos)
        .set({ gastoCents: gasto, taxaCents: taxa, excedenteCents, cliques: g.cliques })
        .where(and(eq(trafegoGastos.id, antes.id), eq(trafegoGastos.origem, "importado")));
    } else {
      const [novo] = await tx
        .insert(trafegoGastos)
        .values({
          campanhaId: c.id,
          organizationId: c.organizationId,
          dia: g.dia,
          rede: g.rede,
          gastoCents: gasto,
          taxaCents: taxa,
          excedenteCents,
          cliques: g.cliques,
          origem: "importado",
          lancadoPor: null,
        })
        .onConflictDoNothing({ target: [trafegoGastos.campanhaId, trafegoGastos.dia, trafegoGastos.rede] })
        .returning({ id: trafegoGastos.id });
      if (!novo) return { resultado: "ja_lancado" as const, excedenteCents: 0 };
    }

    const delta = gasto - jaCobrado;
    const deltaTaxa = taxa - (antes?.taxaCents ?? 0);
    let campanha: Campanha = c;
    if (delta !== 0 || deltaTaxa !== 0) {
      const [somada] = await tx
        .update(trafegoCampanhas)
        .set({
          gastoCents: sql`${trafegoCampanhas.gastoCents} + ${delta}`,
          taxaCents: sql`${trafegoCampanhas.taxaCents} + ${deltaTaxa}`,
        })
        .where(
          and(
            eq(trafegoCampanhas.id, c.id),
            eq(trafegoCampanhas.status, c.status),
            sql`${trafegoCampanhas.gastoCents} + ${delta} between 0 and ${trafegoCampanhas.investimentoCents}`,
          ),
        )
        .returning(campos);
      if (!somada) throw new TrafegoError("O gasto importado passa do que resta da verba.", 409);
      campanha = somada;
      if (somada.gastoCents >= somada.investimentoCents) {
        campanha = await fecharNaTransacao(tx, somada, "encerrada", {}, "Campanha concluída: a mídia não gasta voltou ao saldo como crédito");
      }
    }
    await auditar(tx, null, antes ? "trafego.gasto.importado.atualizado" : "trafego.gasto.importado", c.id, {
      dia: g.dia,
      rede: g.rede,
      gastoCents: gasto,
      taxaCents: taxa,
      cliques: g.cliques,
      ...(antes ? { antes: { gastoCents: antes.gastoCents, taxaCents: antes.taxaCents, excedenteCents: antes.excedenteCents } } : {}),
      ...(excedenteCents > 0 ? { gastoNaRedeCents: g.gastoCents, excedenteCents } : {}),
      encerrada: campanha.status === "encerrada" && c.status !== "encerrada",
    });
    const resultado: ResultadoDoImportado = antes ? "atualizado" : gasto > 0 ? "importado" : "excedente";
    encerrou = campanha.status === "encerrada" && c.status !== "encerrada";
    return { resultado, excedenteCents };
  });
  // A verba acabou pela importação: criada no Meta, pausa lá (depois da transação).
  if (encerrou) pausarNaRedeDepois(alvo.id);
  return r;
}

/** Fechar a conta da campanha encerrada: lançados os últimos dias, a sobra volta ao saldo. */
export async function fecharConta(req: Request, id: string) {
  if (orgOf(req)) throw new TrafegoError("Fechar a conta é da plataforma.", 403);
  if (!idValido(id)) throw new TrafegoError("Campanha não encontrada.", 404);
  const fechada = await db.transaction(async (tx) => {
    const atual = await travar(tx, id);
    if (atual.status !== "encerrando") throw new TrafegoError("Só a campanha encerrada, esperando a conta, pode ser fechada.", 409);
    const feito = await fecharNaTransacao(tx, atual, "encerrada", { decididoPor: req.user!.id }, "Campanha encerrada: a mídia não gasta voltou ao saldo como crédito (a taxa de gestão não volta)");
    await auditar(tx, req, "trafego.fechar", feito.id, { gastoCents: feito.gastoCents, taxaCents: feito.taxaCents, devolvidoCents: feito.devolvidoCents });
    return feito;
  });
  // Se a pausa ao encerrar falhou, fechar tenta de novo (a já pausada não é chamada outra vez).
  pausarNaRedeDepois(fechada.id);
  return fechada;
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
    const parou = await db.transaction(async (tx) => {
      const c = await travar(tx, id);
      if (c.status !== "em_analise" && c.status !== "ativa") return false;
      if (await rifaSegueNoAr(tx, c.campaignId)) return false;
      n++;
      if (c.status === "em_analise") {
        const feito = await fecharNaTransacao(tx, c, "cancelada", {}, "Campanha não iniciada: a rifa saiu do ar e a reserva voltou ao saldo");
        await auditar(tx, null, "trafego.cancelar.fora_do_ar", feito.id, { devolvidoCents: feito.devolvidoCents });
        return false;
      }
      await pararNaTransacao(tx, c, undefined);
      await auditar(tx, null, "trafego.encerrar.fora_do_ar", c.id, { gastoCents: c.gastoCents });
      return true;
    });
    // Parou a no ar: criada no Meta, pausa lá (depois da transação).
    if (parou) pausarNaRedeDepois(id);
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
      excedenteCents: sql<number>`(select coalesce(sum(g.excedente_cents), 0)::int from trafego_gastos g where g.campanha_id = ${trafegoCampanhas.id})`,
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
  const criacoes = await criacoesDasCampanhas(
    linhas.map((l) => l.id),
    !org,
  );
  return {
    config: cfg,
    saldoCents,
    // Fase 3 (só a plataforma): o interruptor e o que falta no servidor — os nomes, nunca os valores.
    criacaoPelaApi: org ? undefined : situacaoDaCriacaoPelaApi(cfg.criarPelaApi),
    campanhas: linhas.map((l) => ({
      ...l,
      organizacao: org ? undefined : l.organizacao,
      // O excedente é custo da plataforma: a organização não vê.
      excedenteCents: org ? undefined : l.excedenteCents,
      orgSlug: undefined,
      rifaSlug: undefined,
      codigo: codigoDaCampanha(l.id),
      utmCampanha: utmCampanhaDe(l.id),
      custoPorVendaCents: custoPorVenda(l.gastoCents + l.taxaCents, l.vendas),
      // Fase 3: a organização só sabe que foi criada no Meta (pausada); a plataforma vê ids, restos e erro.
      meta: criacoes.get(l.id),
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
      excedenteCents: org ? sql<number | null>`null` : trafegoGastos.excedenteCents,
      createdAt: trafegoGastos.createdAt,
      // Quem lançou só para a plataforma: a organização vê "Plataforma".
      lancadoPor: org ? sql<string | null>`null` : users.name,
    })
    .from(trafegoGastos)
    .leftJoin(users, eq(users.id, trafegoGastos.lancadoPor))
    // O dia só de excedente (nada cobrado) é da plataforma: a organização não o vê.
    .where(and(eq(trafegoGastos.campanhaId, c.id), org ? sql`${trafegoGastos.gastoCents} > 0` : undefined))
    .orderBy(desc(trafegoGastos.dia), desc(trafegoGastos.createdAt));
}

/**
 * A margem da plataforma por mês (fuso de São Paulo): a mídia repassada às
 * redes e o excedente (o que a rede gastou além do cobrado, custo da
 * plataforma) entram pelo dia do gasto; a taxa de gestão entra no mês em que
 * foi cobrada — a aprovação (`taxa_cobrada_em`) — e a da campanha de antes
 * desta regra (sem a marca) segue pelos lançamentos diários. No total e por
 * organização, os últimos 12 meses.
 */
async function margemPorMes() {
  const r = await db.execute(sql`
    select substr(g.dia, 1, 7) as mes, o.name as organizacao,
           sum(g.gasto_cents)::bigint as midia, sum(g.taxa_cents)::bigint as taxa, sum(g.excedente_cents)::bigint as excedente
      from trafego_gastos g
      join organizations o on o.id = g.organization_id
     where g.dia >= to_char((now() at time zone 'America/Sao_Paulo') - interval '11 months', 'YYYY-MM') || '-01'
     group by 1, 2`);
  // A taxa cobrada de uma vez na aprovação: no mês (de São Paulo) em que foi cobrada.
  const cobradas = await db.execute(sql`
    select to_char((t.taxa_cobrada_em at time zone 'UTC') at time zone 'America/Sao_Paulo', 'YYYY-MM') as mes,
           o.name as organizacao, sum(t.taxa_cents)::bigint as taxa
      from trafego_campanhas t
      join organizations o on o.id = t.organization_id
     where t.taxa_cobrada_em is not null
       and to_char((t.taxa_cobrada_em at time zone 'UTC') at time zone 'America/Sao_Paulo', 'YYYY-MM')
           >= to_char((now() at time zone 'America/Sao_Paulo') - interval '11 months', 'YYYY-MM')
     group by 1, 2`);
  type Linha = { organizacao: string; midiaCents: number; taxaCents: number; excedenteCents: number };
  const meses = new Map<string, { mes: string; midiaCents: number; taxaCents: number; excedenteCents: number; organizacoes: Linha[] }>();
  const somar = (mes: string, organizacao: string, midia: number, taxa: number, excedente: number) => {
    const m = meses.get(mes) ?? { mes, midiaCents: 0, taxaCents: 0, excedenteCents: 0, organizacoes: [] };
    m.midiaCents += midia;
    m.taxaCents += taxa;
    m.excedenteCents += excedente;
    const o = m.organizacoes.find((x) => x.organizacao === organizacao);
    if (o) {
      o.midiaCents += midia;
      o.taxaCents += taxa;
      o.excedenteCents += excedente;
    } else {
      m.organizacoes.push({ organizacao, midiaCents: midia, taxaCents: taxa, excedenteCents: excedente });
    }
    meses.set(mes, m);
  };
  for (const l of r.rows as { mes: string; organizacao: string; midia: string; taxa: string; excedente: string }[]) {
    // O excedente (verba acabada, campanha parada) é o que a rede gastou e não foi cobrado: sai da margem.
    somar(l.mes, l.organizacao, Number(l.midia), Number(l.taxa), Number(l.excedente));
  }
  for (const l of cobradas.rows as { mes: string; organizacao: string; taxa: string }[]) {
    somar(l.mes, l.organizacao, 0, Number(l.taxa), 0);
  }
  const lista = [...meses.values()].sort((a, b) => (a.mes < b.mes ? 1 : -1));
  for (const m of lista) m.organizacoes.sort((a, b) => b.taxaCents - a.taxaCents);
  return lista;
}
