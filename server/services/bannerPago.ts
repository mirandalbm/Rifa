/**
 * Banner pago na vitrine. As regras puras estão em `shared/bannerPago.ts`.
 *
 * Dinheiro que anda aqui (tudo pelo livro de saldo do patrocínio,
 * `patrocinio_lancamentos`, chave única — repetir nunca lança duas vezes e o
 * saldo nunca fica negativo):
 * - o **pedido** debita o saldo na mesma transação que grava o pedido
 *   (`banner:<id>`): sem saldo, nada fica;
 * - **recusa** e **cancelamento** (só enquanto em análise) devolvem tudo
 *   (`banner-devolucao:<id>`);
 * - banner que sai do ar **antes do fim** (rifa encerrada, travada, promotora
 *   arquivada) devolve os dias não usados como crédito (`banner-sobra:<id>`).
 *
 * O dia de topo só começa a contar quando o banner pega uma vaga. Uma rifa
 * tem no máximo um pedido em aberto — o índice parcial decide (nunca um
 * SELECT antes), e a violação derruba a transação inteira, débito junto.
 */
import type { Request } from "express";
import { and, asc, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { db } from "../db";
import { bannerPedidos, campaigns, organizations } from "@shared/schema";
import {
  SITUACOES_EM_ABERTO,
  bannerPagoNoAr,
  diasQueFaltam,
  precoDoBanner,
  problemaNaRecusa,
  sobraDoBanner,
  validarTituloDoBanner,
  DIA_MS,
  type ConfigBannerPago,
} from "@shared/bannerPago";
import { BANNER_TAMANHO } from "@shared/vitrine";
import { isUniqueViolation } from "../pgError";
import { assertCampaignInScope, orgOf } from "./orgs";
import { lancar } from "./patrocinio";
import { getPlataforma } from "./settings";
import { processar } from "./vitrine";

export class BannerPagoError extends Error {
  constructor(message: string, readonly status = 400) {
    super(message);
    this.name = "BannerPagoError";
  }
}

const TRAVA_VAGAS = 811_104;

const campos = {
  id: bannerPedidos.id,
  organizationId: bannerPedidos.organizationId,
  campaignId: bannerPedidos.campaignId,
  titulo: bannerPedidos.titulo,
  dias: bannerPedidos.dias,
  precoDiaCents: bannerPedidos.precoDiaCents,
  valorPagoCents: bannerPedidos.valorPagoCents,
  status: bannerPedidos.status,
  motivo: bannerPedidos.motivo,
  createdAt: bannerPedidos.createdAt,
  aprovadoEm: bannerPedidos.aprovadoEm,
  inicio: bannerPedidos.inicio,
  fim: bannerPedidos.fim,
  devolvidoCents: bannerPedidos.devolvidoCents,
};

/** O produto só existe para a organização com a plataforma tendo ligado. */
async function configLigada(): Promise<ConfigBannerPago> {
  const cfg = (await getPlataforma()).bannerPago;
  if (!cfg.ligado) throw new BannerPagoError("Não encontrado.", 404);
  return cfg;
}

const aviso = (e: unknown) => {
  if (e instanceof BannerPagoError) return e;
  return new BannerPagoError((e as Error).message, (e as { status?: number }).status ?? 400);
};

/* ------------------------------------------------------------------ *
 * Organização: pedir e cancelar
 * ------------------------------------------------------------------ */

export async function comprarBanner(
  req: Request,
  entrada: { campaignId?: unknown; titulo?: unknown; imagem?: unknown; dias?: unknown },
) {
  const cfg = await configLigada();
  const org = orgOf(req);
  // Quem compra é a organização, com o saldo dela: a plataforma não compra pelo organizador.
  if (!org) throw new BannerPagoError("Quem compra o banner é a organização.", 403);
  const campanha = await assertCampaignInScope(req, String(entrada.campaignId ?? ""));
  if (campanha.status !== "published" || campanha.travadaEm || campanha.demonstracao) {
    throw new BannerPagoError("Só rifa no ar, à venda, pode ter banner.", 409);
  }
  let titulo: string;
  let preco: ReturnType<typeof precoDoBanner>;
  try {
    titulo = validarTituloDoBanner(entrada.titulo);
    preco = precoDoBanner(cfg, entrada.dias);
  } catch (e) {
    throw aviso(e);
  }
  // A imagem é conferida (e aberta) antes de qualquer gravação.
  const bytes = await processar(entrada.imagem, BANNER_TAMANHO.largura, BANNER_TAMANHO.altura).catch((e: Error) => {
    throw new BannerPagoError(e.message, (e as { status?: number }).status ?? 400);
  });

  try {
    return await db.transaction(async (tx) => {
      const [novo] = await tx
        .insert(bannerPedidos)
        .values({
          organizationId: org,
          campaignId: campanha.id,
          titulo,
          mime: "image/webp",
          bytes,
          dias: preco.dias,
          precoDiaCents: cfg.precoDiaCents,
          valorPagoCents: preco.totalCents,
        })
        .returning(campos);
      // Paga na mesma transação: sem saldo, o pedido também não fica.
      await lancar(tx, {
        organizationId: org,
        valorCents: -preco.totalCents,
        motivo: "banner",
        chave: `banner:${novo.id}`,
        descricao: `Banner na vitrine: ${preco.dias} dia(s) — ${campanha.prizeTitle}`,
        userId: req.user!.id,
      });
      return novo;
    });
  } catch (e) {
    if (isUniqueViolation(e, "uq_banner_pedido_aberto_por_rifa")) {
      throw new BannerPagoError("Esta rifa já tem um banner em andamento.", 409);
    }
    throw e;
  }
}

/** Devolve o que foi pago, uma vez só (a chave do livro decide). */
async function devolver(tx: Parameters<Parameters<typeof db.transaction>[0]>[0], p: { id: string; organizationId: string; cents: number; motivo: string; chave: string; descricao: string }) {
  if (p.cents <= 0) return;
  await lancar(tx, { organizationId: p.organizationId, valorCents: p.cents, motivo: p.motivo, chave: p.chave, descricao: p.descricao });
  await tx.update(bannerPedidos).set({ devolvidoCents: p.cents }).where(eq(bannerPedidos.id, p.id));
}

/** A organização desiste enquanto o banner ainda está em análise: volta tudo. */
export async function cancelarBanner(req: Request, id: string) {
  await configLigada();
  const [p] = await db.select(campos).from(bannerPedidos).where(eq(bannerPedidos.id, id));
  const org = orgOf(req);
  // O pedido do vizinho é 404, nunca 403.
  if (!p || !org || p.organizationId !== org) throw new BannerPagoError("Pedido não encontrado.", 404);
  return db.transaction(async (tx) => {
    const [feito] = await tx
      .update(bannerPedidos)
      .set({ status: "cancelado", encerradoEm: new Date() })
      .where(and(eq(bannerPedidos.id, id), eq(bannerPedidos.status, "em_analise")))
      .returning(campos);
    if (!feito) throw new BannerPagoError("Só dá para cancelar enquanto está em análise.", 409);
    await devolver(tx, {
      id,
      organizationId: feito.organizationId,
      cents: feito.valorPagoCents,
      motivo: "banner-devolucao",
      chave: `banner-devolucao:${id}`,
      descricao: "Banner cancelado: o valor voltou ao saldo",
    });
    return feito;
  });
}

/* ------------------------------------------------------------------ *
 * Plataforma: decidir
 * ------------------------------------------------------------------ */

/**
 * Aprova ou recusa a arte. Só a plataforma (a rota barra). O pedido é
 * travado e o `UPDATE` é condicional (`em_analise`): dois cliques, uma
 * decisão e um 409.
 */
export async function decidirBanner(
  req: Request,
  id: string,
  entrada: { aprovar?: unknown; motivo?: unknown },
) {
  if (orgOf(req)) throw new BannerPagoError("Decidir é da plataforma.", 403);
  const aprovar = entrada.aprovar === true;
  if (!aprovar) {
    const p = problemaNaRecusa(entrada.motivo);
    if (p) throw new BannerPagoError(p);
  }
  const decidido = await db.transaction(async (tx) => {
    const [atual] = await tx.select(campos).from(bannerPedidos).where(eq(bannerPedidos.id, id)).for("update");
    if (!atual) throw new BannerPagoError("Pedido não encontrado.", 404);
    const agora = new Date();
    const [feito] = await tx
      .update(bannerPedidos)
      .set(
        aprovar
          ? { status: "aprovado", aprovadoEm: agora, motivo: null }
          : { status: "recusado", encerradoEm: agora, motivo: String(entrada.motivo).trim() },
      )
      .where(and(eq(bannerPedidos.id, id), eq(bannerPedidos.status, "em_analise")))
      .returning(campos);
    if (!feito) throw new BannerPagoError("Este pedido já foi decidido.", 409);
    if (!aprovar) {
      await devolver(tx, {
        id,
        organizationId: feito.organizationId,
        cents: feito.valorPagoCents,
        motivo: "banner-devolucao",
        chave: `banner-devolucao:${id}`,
        descricao: "Banner recusado: o valor voltou ao saldo",
      });
    }
    return feito;
  });
  // Aprovado: se há vaga livre, já entra no ar (sem esperar o relógio).
  if (aprovar) await promoverBannersPagos();
  return decidido;
}

/* ------------------------------------------------------------------ *
 * Vagas e relógio
 * ------------------------------------------------------------------ */

/**
 * Põe no ar os aprovados que cabem nas vagas, do mais antigo ao mais novo.
 * A trava de transação serializa quem conta e quem promove — duas réplicas
 * (ou o relógio e a aprovação) não passam do número de vagas. Rifa que não
 * está mais no ar não ocupa vaga: fica para o encerramento devolver.
 */
export async function promoverBannersPagos(): Promise<number> {
  const cfg = (await getPlataforma()).bannerPago;
  let n = 0;
  await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(${TRAVA_VAGAS})`);
    const agora = new Date();
    const [{ ocupadas }] = await tx
      .select({ ocupadas: sql<number>`count(*)::int` })
      .from(bannerPedidos)
      .where(and(eq(bannerPedidos.status, "no_ar"), sql`${bannerPedidos.fim} > ${agora}`));
    let livres = cfg.vagas - ocupadas;
    if (livres <= 0) return;
    const fila = await tx.execute(sql`
      select b.id, b.dias from banner_pedidos b
        join campaigns c on c.id = b.campaign_id
        join organizations o on o.id = b.organization_id
       where b.status = 'aprovado'
         and c.status = 'published' and c.travada_em is null
         and o.archived_at is null and o.banida_em is null
       order by b.aprovado_em asc, b.id asc
       limit ${livres}
       for update of b skip locked`);
    for (const l of fila.rows as { id: string; dias: number }[]) {
      if (livres <= 0) break;
      await tx
        .update(bannerPedidos)
        .set({ status: "no_ar", inicio: agora, fim: new Date(agora.getTime() + l.dias * DIA_MS) })
        .where(and(eq(bannerPedidos.id, l.id), eq(bannerPedidos.status, "aprovado")));
      livres--;
      n++;
    }
  });
  return n;
}

/**
 * Relógio: encerra o que venceu e o que perdeu a rifa (ou a promotora),
 * devolve os dias não usados e depois preenche as vagas. Cada pedido é
 * tomado num `UPDATE` condicional: duas réplicas, uma devolução.
 */
export async function encerrarBannersPagos() {
  const agora = new Date();
  // Venceu: acabou o prazo comprado. Nada a devolver.
  const venceram = await db
    .update(bannerPedidos)
    .set({ status: "encerrado", encerradoEm: agora })
    .where(and(eq(bannerPedidos.status, "no_ar"), sql`${bannerPedidos.fim} <= ${agora}`))
    .returning({ id: bannerPedidos.id });

  // Perdeu a rifa ou a promotora: encerra e devolve o que não foi usado.
  const perdidos = await db.execute(sql`
    select b.id from banner_pedidos b
      join campaigns c on c.id = b.campaign_id
      join organizations o on o.id = b.organization_id
     where b.status in ('em_analise','aprovado','no_ar')
       and (c.status <> 'published' or c.travada_em is not null or o.archived_at is not null or o.banida_em is not null)`);
  let devolvidos = 0;
  for (const { id } of perdidos.rows as { id: string }[]) {
    await db.transaction(async (tx) => {
      const [p] = await tx.select(campos).from(bannerPedidos).where(eq(bannerPedidos.id, id)).for("update");
      if (!p || !SITUACOES_EM_ABERTO.includes(p.status as never)) return;
      const noAr = p.status === "no_ar";
      const sobra = sobraDoBanner({ valorPagoCents: p.valorPagoCents, dias: p.dias, inicio: noAr ? p.inicio : null, agora });
      await tx
        .update(bannerPedidos)
        .set({ status: p.status === "em_analise" ? "cancelado" : "encerrado", encerradoEm: agora })
        .where(and(eq(bannerPedidos.id, id), eq(bannerPedidos.status, p.status)));
      await devolver(tx, {
        id,
        organizationId: p.organizationId,
        cents: sobra,
        motivo: noAr ? "banner-sobra" : "banner-devolucao",
        chave: noAr ? `banner-sobra:${id}` : `banner-devolucao:${id}`,
        descricao: noAr ? "Dias de banner não usados voltaram ao saldo: a rifa saiu do ar" : "Banner não exibido: a rifa saiu do ar e o valor voltou ao saldo",
      });
      devolvidos++;
    });
  }
  const promovidos = await promoverBannersPagos();
  return { venceram: venceram.length, devolvidos, promovidos };
}

/* ------------------------------------------------------------------ *
 * Leitura
 * ------------------------------------------------------------------ */

const urlDaArte = (id: string) => `/api/admin/banner-pago/pedidos/${id}/imagem`;

/**
 * Os pedidos do painel. A organização vê só os dela; a plataforma vê todos,
 * com o nome da organização. A fila é calculada (os aprovados, do mais antigo
 * ao mais novo), nunca guardada.
 */
export async function painelDoBannerPago(req: Request) {
  const cfg = (await getPlataforma()).bannerPago;
  const org = orgOf(req);
  // Desligado: a organização não vê nada (o produto não existe); a plataforma vê para poder ligar.
  if (!cfg.ligado && org) throw new BannerPagoError("Não encontrado.", 404);
  const linhas = await db
    .select({ ...campos, organizacao: organizations.name, rifa: campaigns.prizeTitle, rifaSlug: campaigns.slug })
    .from(bannerPedidos)
    .innerJoin(organizations, eq(organizations.id, bannerPedidos.organizationId))
    .innerJoin(campaigns, eq(campaigns.id, bannerPedidos.campaignId))
    .where(org ? eq(bannerPedidos.organizationId, org) : undefined)
    .orderBy(desc(bannerPedidos.createdAt))
    .limit(100);
  const agora = new Date();
  // Quem está na frente na fila: os aprovados mais antigos de todas as organizações (a contagem não expõe quem).
  const aprovados = await db
    .select({ id: bannerPedidos.id })
    .from(bannerPedidos)
    .where(eq(bannerPedidos.status, "aprovado"))
    .orderBy(asc(bannerPedidos.aprovadoEm), asc(bannerPedidos.id));
  const posicao = new Map(aprovados.map((a, i) => [a.id, i + 1]));
  const [{ noAr }] = await db
    .select({ noAr: sql<number>`count(*)::int` })
    .from(bannerPedidos)
    .where(and(eq(bannerPedidos.status, "no_ar"), sql`${bannerPedidos.fim} > ${agora}`));
  let saldoCents: number | null = null;
  if (org) {
    const [o] = await db.select({ s: organizations.patrocinioSaldoCents }).from(organizations).where(eq(organizations.id, org));
    saldoCents = o?.s ?? 0;
  }
  return {
    config: cfg,
    saldoCents,
    vagasOcupadas: noAr,
    pedidos: linhas.map((l) => ({
      ...l,
      organizacao: org ? undefined : l.organizacao,
      imagem: urlDaArte(l.id),
      posicaoNaFila: posicao.get(l.id) ?? null,
      noAr: bannerPagoNoAr(l, agora),
      diasQueFaltam: l.status === "no_ar" ? diasQueFaltam(l.fim, agora) : null,
    })),
  };
}

/** A arte do pedido, só para quem é dono (ou a plataforma): o do vizinho é 404. */
export async function arteDoPedido(req: Request, id: string) {
  const [p] = await db
    .select({ bytes: bannerPedidos.bytes, mime: bannerPedidos.mime, organizationId: bannerPedidos.organizationId })
    .from(bannerPedidos)
    .where(eq(bannerPedidos.id, id));
  const org = orgOf(req);
  if (!p || (org && p.organizationId !== org)) return null;
  return p;
}

/** Os banners pagos que estão na tela agora (o que a vitrine mostra). */
export async function bannersPagosNoAr() {
  const cfg = (await getPlataforma()).bannerPago;
  if (!cfg.ligado) return [];
  const agora = new Date();
  const linhas = await db
    .select({
      id: bannerPedidos.id,
      titulo: bannerPedidos.titulo,
      inicio: bannerPedidos.inicio,
      fim: bannerPedidos.fim,
      status: bannerPedidos.status,
      orgSlug: organizations.slug,
      rifaSlug: campaigns.slug,
    })
    .from(bannerPedidos)
    .innerJoin(campaigns, eq(campaigns.id, bannerPedidos.campaignId))
    .innerJoin(organizations, eq(organizations.id, bannerPedidos.organizationId))
    .where(
      and(
        eq(bannerPedidos.status, "no_ar"),
        sql`${bannerPedidos.fim} > ${agora}`,
        eq(campaigns.status, "published"),
        isNull(campaigns.travadaEm),
        isNull(organizations.archivedAt),
        isNull(organizations.banidaEm),
      ),
    )
    .orderBy(asc(bannerPedidos.inicio));
  return linhas
    .filter((l) => bannerPagoNoAr(l, agora))
    .map((l) => ({
      id: l.id,
      titulo: l.titulo,
      link: `/o/${l.orgSlug}/r/${l.rifaSlug}`,
      segundos: cfg.segundos,
      imagem: `/api/public/banners-pagos/${l.id}/imagem`,
      patrocinado: true as const,
    }));
}

/** A arte pública, só enquanto o banner está no ar. */
export async function imagemDoBannerPago(id: string) {
  const agora = new Date();
  const [p] = await db
    .select({ bytes: bannerPedidos.bytes, mime: bannerPedidos.mime })
    .from(bannerPedidos)
    .innerJoin(campaigns, eq(campaigns.id, bannerPedidos.campaignId))
    .innerJoin(organizations, eq(organizations.id, bannerPedidos.organizationId))
    .where(
      and(
        eq(bannerPedidos.id, id),
        eq(bannerPedidos.status, "no_ar"),
        sql`${bannerPedidos.fim} > ${agora}`,
        eq(campaigns.status, "published"),
        isNull(organizations.archivedAt),
        isNull(organizations.banidaEm),
      ),
    );
  return p ?? null;
}

/** Quantos pedidos esperam decisão (a Caixa de entrada). */
export async function bannersEmAnalise(): Promise<number> {
  const [{ n }] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(bannerPedidos)
    .where(inArray(bannerPedidos.status, ["em_analise"]));
  return n;
}
