/**
 * Gestão de tráfego pago. As regras puras estão em `shared/trafego.ts`; o
 * plano, em `docs/PLANO-TRAFEGO-PAGO.md`.
 *
 * Dinheiro que anda aqui (tudo pelo livro de saldo do patrocínio,
 * `patrocinio_lancamentos`, chave única — repetir nunca lança duas vezes e o
 * saldo nunca fica negativo):
 * - o **pedido** reserva no saldo a verba de mídia mais a taxa de gestão, na
 *   mesma transação que grava a campanha (`trafego:<id>`): sem saldo, nada
 *   fica. Saldo retido cautelarmente não paga campanha nova (a mídia sairia
 *   da conta da plataforma para a rede);
 * - **recusa** e **cancelamento** (só em análise) devolvem a reserva inteira
 *   (`trafego-devolucao:<id>`);
 * - cada **gasto lançado** consome a reserva (mídia + taxa do próprio gasto,
 *   para baixo) sem mexer no saldo, num `UPDATE` condicional que nunca passa
 *   da verba; um lançamento por campanha, dia e rede (o índice decide);
 * - no **fim** (verba gasta, encerrada por uma das partes, rifa ou promotora
 *   fora do ar) a sobra volta ao saldo (`trafego-sobra:<id>`).
 *
 * Uma rifa tem no máximo uma campanha em aberto — o índice parcial decide
 * (nunca um SELECT antes), e a violação derruba a transação inteira, reserva
 * junto. Recorte: a organização vê e mexe só nas dela (a do vizinho é 404);
 * decidir, lançar gasto e configurar são da plataforma (a rota barra com 403).
 */
import type { Request } from "express";
import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "../db";
import { campaigns, organizations, trafegoCampanhas, trafegoGastos, users } from "@shared/schema";
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

/** A campanha no recorte de quem pede: a do vizinho é 404, nunca 403. */
const idValido = (id: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);

async function campanhaNoRecorte(req: Request, id: string): Promise<Campanha> {
  if (!idValido(id)) throw new TrafegoError("Campanha não encontrada.", 404);
  const [c] = await db.select(campos).from(trafegoCampanhas).where(eq(trafegoCampanhas.id, id));
  const org = orgOf(req);
  if (!c || (org && c.organizationId !== org)) throw new TrafegoError("Campanha não encontrada.", 404);
  return c;
}

/** A régua da vitrine: rifa publicada, não travada, promotora nem arquivada nem banida. */
async function rifaSegueNoAr(tx: Tx, campaignId: string): Promise<boolean> {
  const r = await tx.execute(sql`
    select 1 from campaigns c join organizations o on o.id = c.organization_id
     where c.id = ${campaignId}::uuid and c.status = 'published' and c.travada_em is null
       and o.archived_at is null and o.banida_em is null`);
  return r.rows.length > 0;
}

/**
 * Fecha a campanha (já travada por quem chama) e devolve ao saldo o que
 * sobrou da reserva, uma vez só (a chave do livro decide).
 */
async function fecharNaTransacao(
  tx: Tx,
  c: Campanha,
  status: "encerrada" | "recusada" | "cancelada",
  extra: { motivo?: string | null; decididoPor?: string | null },
  descricao: string,
) {
  const agora = new Date();
  const [feito] = await tx
    .update(trafegoCampanhas)
    .set({
      status,
      encerradoEm: agora,
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
      return nova;
    });
  } catch (e) {
    if (isUniqueViolation(e, "uq_trafego_aberto_por_rifa")) {
      throw new TrafegoError("Esta rifa já tem uma campanha em andamento.", 409);
    }
    throw e;
  }
}

/** A organização desiste enquanto a campanha está em análise: a reserva volta inteira. */
export async function cancelarCampanha(req: Request, id: string) {
  const c = await campanhaNoRecorte(req, id);
  if (!orgOf(req)) throw new TrafegoError("Quem cancela o pedido é a organização. A plataforma recusa.", 403);
  return db.transaction(async (tx) => {
    const [atual] = await tx.select(campos).from(trafegoCampanhas).where(eq(trafegoCampanhas.id, c.id)).for("update");
    if (!atual || atual.status !== "em_analise") throw new TrafegoError("Só dá para cancelar enquanto está em análise.", 409);
    return fecharNaTransacao(tx, atual, "cancelada", {}, "Campanha cancelada: a reserva voltou ao saldo");
  });
}

/**
 * Encerra a campanha no ar (a organização ou a plataforma): para de gastar e
 * a sobra da reserva volta. A plataforma precisa pausar a campanha na rede —
 * a tela diz isso a ela.
 */
export async function encerrarCampanha(req: Request, id: string) {
  const c = await campanhaNoRecorte(req, id);
  return db.transaction(async (tx) => {
    const [atual] = await tx.select(campos).from(trafegoCampanhas).where(eq(trafegoCampanhas.id, c.id)).for("update");
    if (!atual || atual.status !== "ativa") throw new TrafegoError("Só dá para encerrar a campanha no ar.", 409);
    return fecharNaTransacao(
      tx,
      atual,
      "encerrada",
      { decididoPor: orgOf(req) ? undefined : req.user!.id },
      "Campanha encerrada: o que não foi gasto voltou ao saldo",
    );
  });
}

/* ------------------------------------------------------------------ *
 * Plataforma: decidir e lançar o gasto
 * ------------------------------------------------------------------ */

/**
 * Aprova (a plataforma vai montar a campanha) ou recusa (a reserva volta).
 * O pedido é travado e o `UPDATE` é condicional (`em_analise`): dois cliques,
 * uma decisão e um 409.
 */
export async function decidirCampanha(req: Request, id: string, entrada: { aprovar?: unknown; motivo?: unknown }) {
  if (orgOf(req)) throw new TrafegoError("Decidir é da plataforma.", 403);
  const aprovar = entrada.aprovar === true;
  if (!aprovar) {
    const p = problemaNaRecusa(entrada.motivo);
    if (p) throw new TrafegoError(p);
  }
  if (!idValido(id)) throw new TrafegoError("Campanha não encontrada.", 404);
  return db.transaction(async (tx) => {
    const [atual] = await tx.select(campos).from(trafegoCampanhas).where(eq(trafegoCampanhas.id, id)).for("update");
    if (!atual) throw new TrafegoError("Campanha não encontrada.", 404);
    if (atual.status !== "em_analise") throw new TrafegoError("Esta campanha já foi decidida.", 409);
    if (aprovar && !(await rifaSegueNoAr(tx, atual.campaignId))) {
      throw new TrafegoError("A rifa saiu do ar (ou a promotora foi suspensa): recuse o pedido para devolver a reserva.", 409);
    }
    if (!aprovar) {
      return fecharNaTransacao(
        tx,
        atual,
        "recusada",
        { motivo: String(entrada.motivo).trim(), decididoPor: req.user!.id },
        "Campanha recusada: a reserva voltou ao saldo",
      );
    }
    const [feito] = await tx
      .update(trafegoCampanhas)
      .set({ status: "ativa", aprovadoEm: new Date(), motivo: null, decididoPor: req.user!.id })
      .where(and(eq(trafegoCampanhas.id, id), eq(trafegoCampanhas.status, "em_analise")))
      .returning(campos);
    if (!feito) throw new TrafegoError("Esta campanha já foi decidida.", 409);
    return feito;
  });
}

/**
 * O gasto de um dia numa rede, copiado do painel da rede. Consome a reserva
 * (mídia + taxa do gasto, para baixo) num `UPDATE` condicional que nunca
 * passa da verba; o mesmo dia e rede duas vezes é 409 (o índice decide).
 * Gastou a verba inteira: a campanha encerra e a sobra (o arredondamento da
 * taxa) volta ao saldo, na mesma transação.
 */
export async function lancarGasto(req: Request, id: string, entrada: unknown) {
  if (orgOf(req)) throw new TrafegoError("Lançar o gasto é da plataforma.", 403);
  if (!idValido(id)) throw new TrafegoError("Campanha não encontrada.", 404);
  try {
    return await db.transaction(async (tx) => {
      const [c] = await tx.select(campos).from(trafegoCampanhas).where(eq(trafegoCampanhas.id, id)).for("update");
      if (!c) throw new TrafegoError("Campanha não encontrada.", 404);
      if (c.status !== "ativa") throw new TrafegoError("Só a campanha no ar recebe gasto.", 409);
      let g: ReturnType<typeof validarGasto>;
      try {
        g = validarGasto(
          entrada,
          { redes: c.redes, investimentoCents: c.investimentoCents, gastoCents: c.gastoCents, diaDaAprovacao: c.aprovadoEm ? diaNoFuso(c.aprovadoEm) : null },
          diaNoFuso(new Date()),
        );
      } catch (e) {
        throw aviso(e);
      }
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
          lancadoPor: req.user!.id,
        })
        .returning();
      const [somada] = await tx
        .update(trafegoCampanhas)
        .set({
          gastoCents: sql`${trafegoCampanhas.gastoCents} + ${g.gastoCents}`,
          taxaCents: sql`${trafegoCampanhas.taxaCents} + ${taxa}`,
        })
        .where(
          and(
            eq(trafegoCampanhas.id, c.id),
            eq(trafegoCampanhas.status, "ativa"),
            sql`${trafegoCampanhas.gastoCents} + ${g.gastoCents} <= ${trafegoCampanhas.investimentoCents}`,
          ),
        )
        .returning(campos);
      if (!somada) throw new TrafegoError("O gasto passa do que resta da verba.", 409);
      let campanha = somada;
      if (somada.gastoCents >= somada.investimentoCents) {
        campanha = await fecharNaTransacao(tx, somada, "encerrada", {}, "Campanha concluída: a sobra da reserva voltou ao saldo");
      }
      return { gasto: lancado, campanha };
    });
  } catch (e) {
    if (isUniqueViolation(e, "uq_trafego_gasto_do_dia")) {
      throw new TrafegoError("O gasto deste dia nesta rede já foi lançado.", 409);
    }
    throw e;
  }
}

/* ------------------------------------------------------------------ *
 * Relógio
 * ------------------------------------------------------------------ */

/**
 * Rifa que saiu do ar (ou foi travada) e promotora arquivada ou banida levam
 * a campanha junto: em análise, a reserva volta inteira; no ar, a sobra.
 * Cada uma é tomada com a linha travada e o `UPDATE` condicional: duas
 * réplicas, uma devolução.
 */
export async function encerrarTrafegoForaDoAr(): Promise<number> {
  const perdidos = await db.execute(sql`
    select t.id from trafego_campanhas t
      join campaigns c on c.id = t.campaign_id
      join organizations o on o.id = t.organization_id
     where t.status in ('em_analise','ativa')
       and (c.status <> 'published' or c.travada_em is not null or o.archived_at is not null or o.banida_em is not null)`);
  let n = 0;
  for (const { id } of perdidos.rows as { id: string }[]) {
    await db.transaction(async (tx) => {
      const [c] = await tx.select(campos).from(trafegoCampanhas).where(eq(trafegoCampanhas.id, id)).for("update");
      if (!c || !SITUACOES_EM_ABERTO.includes(c.status as never)) return;
      await fecharNaTransacao(
        tx,
        c,
        c.status === "em_analise" ? "cancelada" : "encerrada",
        {},
        c.status === "em_analise"
          ? "Campanha não iniciada: a rifa saiu do ar e a reserva voltou ao saldo"
          : "Campanha encerrada: a rifa saiu do ar e o que não foi gasto voltou ao saldo",
      );
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
 * margem por mês. Desligado, a organização recebe 404 (o produto não existe
 * para ela); a plataforma vê para poder ligar.
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
