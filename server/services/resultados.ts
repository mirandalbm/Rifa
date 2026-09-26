/**
 * Painel de resultados: vendas por dia, por canal, rifas que mais vendem,
 * ticket médio, seguidores novos e estornos do período.
 *
 * Recorte de sempre (`orgOf`): organização nula é a plataforma e vê tudo;
 * qualquer outra só a própria. O recorte entra em **toda** consulta daqui —
 * uma esquecida somaria o faturamento do vizinho no painel de quem não
 * vendeu aquilo, e responderia 200 (`npm run resultados` confere os
 * números, não só o código).
 *
 * Venda conta pelo dia do pagamento no fuso de São Paulo. `paid_at` é
 * `timestamp` sem fuso guardando UTC: o início do período é convertido uma
 * vez no SQL, e a comparação fica na coluna crua (usa índice).
 */
import { sql } from "drizzle-orm";
import { db } from "../db";
import {
  CANAIS,
  FUSO,
  canalDaVenda,
  diaNoFuso,
  participacao,
  serieDiaria,
  ticketMedio,
  type Canal,
  type Periodo,
} from "@shared/resultados";

export interface DiaDeVenda {
  dia: string;
  pedidos: number;
  receitaCents: number;
  cotas: number;
}

const numero = (v: unknown) => Number(v ?? 0);

export async function resultados(org: string | null, dias: Periodo, hoje = new Date()) {
  const inicio = diaNoFuso(new Date(hoje.getTime() - (dias - 1) * 86_400_000));
  // Meia-noite de São Paulo do primeiro dia, em UTC (o que `paid_at` guarda).
  const desde = sql`((${inicio}::date)::timestamp at time zone ${FUSO}) at time zone 'UTC'`;
  const recorte = org ? sql`and c.organization_id = ${org}::uuid` : sql``;
  const diaSql = sql`((o.paid_at at time zone 'UTC') at time zone ${FUSO})::date`;

  const [porDia, porCanal, porRifa, estornos, seguidores] = await Promise.all([
    db.execute(sql`
      select to_char(${diaSql}, 'YYYY-MM-DD') as dia,
             count(*)::int as pedidos,
             coalesce(sum(o.amount_cents), 0)::bigint as receita,
             coalesce(sum(o.quantity), 0)::bigint as cotas
        from orders o
        join campaigns c on c.id = o.campaign_id
       where o.status = 'paid' and o.paid_at >= ${desde} ${recorte}
       group by 1`),
    db.execute(sql`
      select (o.seller_id is not null) as cambista,
             (o.affiliate_id is not null) as afiliado,
             o.origem,
             count(*)::int as pedidos,
             coalesce(sum(o.amount_cents), 0)::bigint as receita
        from orders o
        join campaigns c on c.id = o.campaign_id
       where o.status = 'paid' and o.paid_at >= ${desde} ${recorte}
       group by 1, 2, 3`),
    db.execute(sql`
      select c.id, c.slug, c.prize_title as premio, c.status,
             count(*)::int as pedidos,
             coalesce(sum(o.amount_cents), 0)::bigint as receita,
             coalesce(sum(o.quantity), 0)::bigint as cotas
        from orders o
        join campaigns c on c.id = o.campaign_id
       where o.status = 'paid' and o.paid_at >= ${desde} ${recorte}
       group by c.id
       order by receita desc, pedidos desc
       limit 10`),
    // Estornos das vendas do período: o dinheiro que voltou.
    db.execute(sql`
      select count(*)::int as pedidos, coalesce(sum(o.amount_cents), 0)::bigint as receita
        from orders o
        join campaigns c on c.id = o.campaign_id
       where o.status = 'refunded' and o.paid_at >= ${desde} ${recorte}`),
    // Quem começou a seguir no período e continua seguindo (deixar de
    // seguir apaga a linha).
    db.execute(sql`
      select count(*)::int as n
        from seguidores s
       where s.created_at >= ${desde}
         ${org ? sql`and s.organization_id = ${org}::uuid` : sql``}`),
  ]);

  const linhasDia = (porDia.rows as Record<string, unknown>[]).map((r) => ({
    dia: String(r.dia),
    pedidos: numero(r.pedidos),
    receitaCents: numero(r.receita),
    cotas: numero(r.cotas),
  }));
  const serie = serieDiaria<DiaDeVenda>(linhasDia, dias, hoje, (dia) => ({ dia, pedidos: 0, receitaCents: 0, cotas: 0 }));

  const receitaCents = serie.reduce((s, d) => s + d.receitaCents, 0);
  const pedidos = serie.reduce((s, d) => s + d.pedidos, 0);
  const cotas = serie.reduce((s, d) => s + d.cotas, 0);

  const somaCanal = new Map<Canal, { pedidos: number; receitaCents: number }>();
  for (const r of porCanal.rows as Record<string, unknown>[]) {
    const canal = canalDaVenda({
      sellerId: r.cambista ? "x" : null,
      affiliateId: r.afiliado ? "x" : null,
      origem: (r.origem as string | null) ?? null,
    });
    const atual = somaCanal.get(canal) ?? { pedidos: 0, receitaCents: 0 };
    atual.pedidos += numero(r.pedidos);
    atual.receitaCents += numero(r.receita);
    somaCanal.set(canal, atual);
  }
  const canais = [...somaCanal.entries()]
    .map(([canal, v]) => ({
      canal,
      nome: CANAIS[canal],
      ...v,
      participacao: participacao(v.receitaCents, receitaCents),
    }))
    .sort((a, b) => b.receitaCents - a.receitaCents || b.pedidos - a.pedidos);

  const est = (estornos.rows[0] ?? {}) as Record<string, unknown>;
  return {
    periodo: { dias, inicio, fim: diaNoFuso(hoje) },
    totais: {
      receitaCents,
      pedidos,
      cotas,
      ticketMedioCents: ticketMedio(receitaCents, pedidos),
      seguidoresNovos: numero((seguidores.rows[0] as Record<string, unknown> | undefined)?.n),
      estornos: { pedidos: numero(est.pedidos), receitaCents: numero(est.receita) },
    },
    porDia: serie,
    canais,
    rifas: (porRifa.rows as Record<string, unknown>[]).map((r) => ({
      id: String(r.id),
      slug: String(r.slug),
      premio: String(r.premio),
      status: String(r.status),
      pedidos: numero(r.pedidos),
      receitaCents: numero(r.receita),
      cotas: numero(r.cotas),
    })),
  };
}
