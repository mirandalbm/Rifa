import { useState } from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { PanelShell } from "@/components/AppShell";
import { Card, Empty, Kpi } from "@/components/bits";
import { useSession } from "@/lib/session";
import { formatBRL, groupNumber } from "@shared/format";
import { PERIODOS, type Periodo } from "@shared/resultados";

interface Dia {
  dia: string;
  pedidos: number;
  receitaCents: number;
  cotas: number;
}

interface Resultados {
  periodo: { dias: number; inicio: string; fim: string };
  totais: {
    receitaCents: number;
    pedidos: number;
    cotas: number;
    ticketMedioCents: number;
    seguidoresNovos: number;
    estornos: { pedidos: number; receitaCents: number };
  };
  porDia: Dia[];
  canais: { canal: string; nome: string; pedidos: number; receitaCents: number; participacao: number }[];
  rifas: { id: string; slug: string; premio: string; status: string; pedidos: number; receitaCents: number; cotas: number }[];
}

/** "2026-10-01" → "01/10" (sem passar por Date: o dia já vem no fuso certo). */
const diaCurto = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;

/**
 * Painel de resultados: quanto entrou, por onde e em quais rifas. O mesmo
 * para organizador e administrador geral — o que muda é o recorte (a
 * plataforma pode escolher uma organização).
 */
export function AdminResultados() {
  const { data: sessao } = useSession();
  const plataforma = sessao?.role === "admin";
  const [dias, setDias] = useState<Periodo>(30);
  const [organizacao, setOrganizacao] = useState("");
  const { data: orgs = [] } = useQuery<{ id: string; name: string }[]>({
    queryKey: ["/api/admin/organizacoes"],
    enabled: plataforma,
  });
  const { data, isLoading } = useQuery<Resultados>({
    queryKey: ["/api/admin/resultados", { dias, ...(organizacao ? { organizacao } : {}) }],
  });

  return (
    <PanelShell title="Resultados">
      {/* Filtros numa linha só, acima de tudo. */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div role="radiogroup" aria-label="Período" className="inline-flex rounded-md border border-line p-0.5">
          {PERIODOS.map((p) => (
            <button
              key={p}
              type="button"
              role="radio"
              aria-checked={dias === p}
              onClick={() => setDias(p)}
              className={`tnum rounded px-3 py-1 text-sm ${dias === p ? "bg-mist-2 font-semibold text-ink" : "text-muted hover:text-ink"}`}
            >
              {p} dias
            </button>
          ))}
        </div>
        {plataforma ? (
          <select
            value={organizacao}
            onChange={(e) => setOrganizacao(e.target.value)}
            aria-label="Organização"
            className="rounded-md border border-line-2 px-2 py-1.5 text-sm"
          >
            <option value="">Todas as organizações</option>
            {orgs.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>
        ) : null}
        {data ? (
          <span className="tnum text-xs text-muted">
            {diaCurto(data.periodo.inicio)} a {diaCurto(data.periodo.fim)} · vendas pagas, pelo dia do pagamento
          </span>
        ) : null}
      </div>

      {isLoading || !data ? (
        <p className="text-sm text-muted">Carregando…</p>
      ) : (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
            {/* No celular a receita ocupa a linha: é o número que importa, e não cabe em meia. */}
            <div className="col-span-2 md:col-span-1">
              <Kpi label="Receita" value={formatBRL(data.totais.receitaCents)} highlight />
            </div>
            <Kpi label="Pedidos pagos" value={groupNumber(data.totais.pedidos)} />
            <Kpi label="Ticket médio" value={formatBRL(data.totais.ticketMedioCents)} />
            <Kpi label="Cotas vendidas" value={groupNumber(data.totais.cotas)} />
            <Kpi label="Seguidores novos" value={groupNumber(data.totais.seguidoresNovos)} hint="que continuam seguindo" />
            <Kpi
              label="Estornos"
              value={formatBRL(data.totais.estornos.receitaCents)}
              hint={`${groupNumber(data.totais.estornos.pedidos)} pedido(s) das vendas do período`}
            />
          </div>

          <Card title="Receita por dia">
            <GraficoPorDia dias={data.porDia} />
          </Card>

          <div className="grid gap-3 lg:grid-cols-2">
            <Card title="Por canal">
              {data.canais.length === 0 ? (
                <Empty>Nenhuma venda paga no período.</Empty>
              ) : (
                <ul className="space-y-3 p-4">
                  {data.canais.map((c) => {
                    const maior = data.canais[0].receitaCents || 1;
                    return (
                      <li key={c.canal} className="text-sm">
                        <div className="flex items-baseline justify-between gap-2">
                          <span className="font-semibold">{c.nome}</span>
                          <span className="tnum text-ink-2">
                            {formatBRL(c.receitaCents)} <span className="text-muted">· {c.participacao.toLocaleString("pt-BR")}%</span>
                          </span>
                        </div>
                        <div className="mt-1 h-2 rounded-full bg-mist-2">
                          <div
                            className="h-2 rounded-full bg-green"
                            style={{ width: `${Math.max(2, (c.receitaCents / maior) * 100)}%` }}
                          />
                        </div>
                        <p className="tnum mt-0.5 text-[11px] text-muted">{groupNumber(c.pedidos)} pedido(s)</p>
                      </li>
                    );
                  })}
                </ul>
              )}
              <p className="border-t border-line px-4 py-2 text-[11px] text-muted">
                Cambista e afiliado contam pela venda. No site, pelo último lugar de onde a pessoa chegou à rifa
                (vitrine, perfil, story, banner, página do estado ou anúncio).
              </p>
            </Card>

            <Card title="Rifas que mais vendem">
              {data.rifas.length === 0 ? (
                <Empty>Nenhuma venda paga no período.</Empty>
              ) : (
                <table className="w-full table-fixed text-sm">
                  <thead>
                    <tr className="border-b border-line text-left">
                      <th className="label-xs px-4 py-2 font-normal">Rifa</th>
                      <th className="label-xs w-20 px-2 py-2 text-right font-normal">Pedidos</th>
                      <th className="label-xs hidden w-20 px-2 py-2 text-right font-normal sm:table-cell">Cotas</th>
                      <th className="label-xs w-32 px-4 py-2 text-right font-normal">Receita</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.rifas.map((r) => (
                      <tr key={r.id} className="border-b border-line last:border-0">
                        <td className="truncate px-4 py-2" title={r.premio}>
                          <Link href={`/r/${r.slug}`} className="hover:underline">
                            {r.premio}
                          </Link>
                        </td>
                        <td className="tnum px-2 py-2 text-right">{groupNumber(r.pedidos)}</td>
                        <td className="tnum hidden px-2 py-2 text-right sm:table-cell">{groupNumber(r.cotas)}</td>
                        <td className="tnum px-4 py-2 text-right text-green-deep">{formatBRL(r.receitaCents)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </Card>
          </div>
        </div>
      )}
    </PanelShell>
  );
}

/**
 * Colunas da receita diária, uma série só (verde: dinheiro que entrou).
 * Passar o mouse ou o foco numa coluna mostra o dia; a tabela ao lado é a
 * mesma informação para quem não enxerga o gráfico.
 */
function GraficoPorDia({ dias }: { dias: Dia[] }) {
  const [ativo, setAtivo] = useState<number | null>(null);
  const maior = Math.max(...dias.map((d) => d.receitaCents), 0);
  const [tabela, setTabela] = useState(false);
  const escolhido = ativo !== null ? dias[ativo] : null;

  return (
    <div className="p-4">
      <div className="mb-2 flex items-baseline justify-between gap-2 text-xs text-muted">
        <span className="tnum">máx. {formatBRL(maior)}</span>
        <span className="tnum min-h-[1rem] text-ink-2" aria-live="polite">
          {escolhido
            ? `${diaCurto(escolhido.dia)} · ${formatBRL(escolhido.receitaCents)} · ${groupNumber(escolhido.pedidos)} pedido(s) · ${groupNumber(escolhido.cotas)} cota(s)`
            : "passe o dedo ou o mouse nas colunas"}
        </span>
      </div>
      <div
        className="flex h-40 items-end gap-[2px] border-b border-line"
        onMouseLeave={() => setAtivo(null)}
      >
        {dias.map((d, i) => (
          <button
            key={d.dia}
            type="button"
            onMouseEnter={() => setAtivo(i)}
            onFocus={() => setAtivo(i)}
            onClick={() => setAtivo(i)}
            aria-label={`${diaCurto(d.dia)}: ${formatBRL(d.receitaCents)}, ${d.pedidos} pedido(s)`}
            className="group flex h-full flex-1 items-end justify-center focus:outline-none"
          >
            <span
              className={`block w-full max-w-6 rounded-t ${d.receitaCents > 0 ? "bg-green" : "bg-transparent"} ${
                ativo === i ? "opacity-100" : ativo === null ? "opacity-100" : "opacity-60"
              } group-focus-visible:ring-2 group-focus-visible:ring-ink`}
              style={{ height: maior > 0 ? `${(d.receitaCents / maior) * 100}%` : "0%", minHeight: d.receitaCents > 0 ? 3 : 0 }}
            />
          </button>
        ))}
      </div>
      <div className="tnum mt-1 flex justify-between text-[11px] text-muted">
        <span>{diaCurto(dias[0].dia)}</span>
        <span>{diaCurto(dias[Math.floor(dias.length / 2)].dia)}</span>
        <span>{diaCurto(dias[dias.length - 1].dia)}</span>
      </div>
      <button type="button" onClick={() => setTabela(!tabela)} className="mt-2 text-xs text-ink-2 underline">
        {tabela ? "Esconder tabela" : "Ver em tabela"}
      </button>
      {tabela ? (
        <table className="mt-2 w-full text-sm">
          <thead>
            <tr className="border-b border-line text-left">
              <th className="label-xs py-1 font-normal">Dia</th>
              <th className="label-xs py-1 text-right font-normal">Pedidos</th>
              <th className="label-xs py-1 text-right font-normal">Cotas</th>
              <th className="label-xs py-1 text-right font-normal">Receita</th>
            </tr>
          </thead>
          <tbody>
            {[...dias].reverse().map((d) => (
              <tr key={d.dia} className="border-b border-line last:border-0">
                <td className="tnum py-1">{diaCurto(d.dia)}</td>
                <td className="tnum py-1 text-right">{groupNumber(d.pedidos)}</td>
                <td className="tnum py-1 text-right">{groupNumber(d.cotas)}</td>
                <td className="tnum py-1 text-right">{formatBRL(d.receitaCents)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
    </div>
  );
}
