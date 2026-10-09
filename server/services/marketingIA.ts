/**
 * Marketing AI: o plano de divulgação e a leitura dos resultados de uma rifa
 * (montados aqui, dos dados — nada inventado), e os textos de anúncio (pelo
 * assistente, na régua de `shared/marketingIA.ts`). O recorte é o da rota
 * (`assertCampaignInScope`: a rifa do vizinho é 404).
 */
import type { Request } from "express";
import { sql } from "drizzle-orm";
import { db } from "../db";
import { CANAIS, canalDaVenda, type Canal } from "@shared/resultados";
import {
  leituraDosResultados,
  planoDeDivulgacao,
  type CampanhaDaLeitura,
  type CanalDaLeitura,
  type DadosDaLeitura,
} from "@shared/marketingIA";
import { codigoDaCampanha } from "@shared/trafego";
import { artesDaRifa, rifaDaArte } from "./artes";
import { dadosParaSugerir } from "./editorImagem";
import { anunciosComIA, exigirAssistente, IAError } from "./ia";
import { ChatbaseError } from "./chatbase";
import { CobrancaIAError } from "./iaCobranca";

export class MarketingIAError extends Error {
  constructor(message: string, readonly status = 400) {
    super(message);
    this.name = "MarketingIAError";
  }
}

/** Os números da leitura: só venda paga, só desta rifa. */
async function dadosDaLeitura(campaignId: string): Promise<DadosDaLeitura | null> {
  const base = await db.execute(sql`
    select c.total_quotas as total, coalesce(s.sold_count, 0) as vendidas, coalesce(s.bonus_count, 0) as bonus,
           c.minimo_vendido_pct as minimo, c.modo_sorteio as modo,
           (extract(epoch from c.draw_at) * 1000)::float8 as draw_ms, (extract(epoch from c.published_at) * 1000)::float8 as publicada_ms
      from campaigns c left join campaign_stats s on s.campaign_id = c.id
     where c.id = ${campaignId}::uuid`);
  const b = base.rows[0] as
    | { total: number; vendidas: number; bonus: number; minimo: number; modo: string | null; draw_ms: number | null; publicada_ms: number | null }
    | undefined;
  if (!b) return null;

  const semana = await db.execute(sql`
    select coalesce(sum(quantity), 0)::int as n from orders
     where campaign_id = ${campaignId}::uuid and status = 'paid' and method <> 'bonus'
       and paid_at >= (now() at time zone 'UTC') - interval '7 days'`);

  const porCanal = await db.execute(sql`
    select seller_id is not null as cambista, affiliate_id is not null as afiliado, origem,
           count(*)::int as pedidos, coalesce(sum(amount_cents), 0)::bigint as receita
      from orders
     where campaign_id = ${campaignId}::uuid and status = 'paid' and method <> 'bonus'
     group by 1, 2, 3`);
  const canais = new Map<Canal, CanalDaLeitura>();
  for (const l of porCanal.rows as { cambista: boolean; afiliado: boolean; origem: string | null; pedidos: number; receita: string }[]) {
    const canal = canalDaVenda({ sellerId: l.cambista ? "x" : null, affiliateId: l.afiliado ? "x" : null, origem: l.origem });
    const atual = canais.get(canal) ?? { canal, rotulo: CANAIS[canal], pedidos: 0, receitaCents: 0 };
    atual.pedidos += l.pedidos;
    atual.receitaCents += Number(l.receita);
    canais.set(canal, atual);
  }

  const doTrafego = await db.execute(sql`
    select t.id, t.status, (t.gasto_cents + t.taxa_cents) as custo,
           (select count(*)::int from orders x where x.campaign_id = t.campaign_id and x.status = 'paid'
              and x.utm->>'campaign' = 'trafego-' || substr(replace(t.id::text, '-', ''), 1, 8)) as vendas,
           (select coalesce(sum(x.amount_cents), 0)::bigint from orders x where x.campaign_id = t.campaign_id and x.status = 'paid'
              and x.utm->>'campaign' = 'trafego-' || substr(replace(t.id::text, '-', ''), 1, 8)) as receita
      from trafego_campanhas t
     where t.campaign_id = ${campaignId}::uuid and t.status in ('ativa', 'encerrando', 'encerrada')
     order by t.created_at desc
     limit 10`);
  const campanhas: CampanhaDaLeitura[] = (doTrafego.rows as { id: string; status: string; custo: number; vendas: number; receita: string }[]).map((l) => ({
    codigo: codigoDaCampanha(l.id),
    custoCents: Number(l.custo),
    vendas: l.vendas,
    receitaCents: Number(l.receita),
    noAr: l.status === "ativa",
  }));

  return {
    total: b.total,
    vendidas: b.vendidas,
    bonus: b.bonus,
    vendidasNaSemana: (semana.rows[0] as { n: number }).n,
    minimoPct: b.minimo,
    modoSorteio: b.modo,
    // O timestamp é guardado em UTC sem fuso: lido em milissegundos, sem depender do fuso do processo.
    drawAt: b.draw_ms == null ? null : new Date(b.draw_ms),
    publicadaEm: b.publicada_ms == null ? null : new Date(b.publicada_ms),
    canais: [...canais.values()],
    campanhas,
  };
}

/** O plano e a leitura da rifa (já no recorte de quem pede). */
export async function marketingDaRifa(campaignId: string, agora = new Date()) {
  const r = await rifaDaArte(campaignId);
  const dados = await dadosDaLeitura(campaignId);
  if (!r || !dados) return null;
  const artes = artesDaRifa(r);
  return {
    noAr: artes.includes("rifa"),
    artes,
    plano: artes.length
      ? planoDeDivulgacao({ drawAt: dados.drawAt, publicadaEm: dados.publicadaEm, artes, sorteada: Boolean(r.dados.resultado) }, agora)
      : [],
    leitura: r.dados.status === "draft" ? [] : leituraDosResultados(dados, agora),
  };
}

/**
 * Os textos de anúncio: só para a rifa no ar, de verdade e não travada (a
 * régua das artes). Sem o assistente, 404 antes de olhar a rifa; os erros do
 * assistente (sem saldo, limite, Chatbase fora ou sem créditos) voltam com a
 * mensagem deles — nunca como "erro interno".
 */
export async function anunciosDaRifa(req: Request, campaignId: string) {
  try {
    await exigirAssistente(req);
    const r = await rifaDaArte(campaignId);
    if (!r) throw new MarketingIAError("Campanha não encontrada.", 404);
    if (!artesDaRifa(r).includes("rifa")) throw new MarketingIAError("Só rifa no ar, à venda, tem texto de anúncio.", 409);
    return await anunciosComIA(req, dadosParaSugerir(r));
  } catch (e) {
    if (e instanceof IAError || e instanceof ChatbaseError || e instanceof CobrancaIAError) throw new MarketingIAError(e.message, e.status);
    throw e;
  }
}
