import { useState } from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { PanelShell } from "@/components/AppShell";
import { Empty, Filtros, Kpi } from "@/components/bits";
import { CartaoDoPainel } from "@/components/painel";
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
        <Filtros
          exclusivo
          rotulo="Período"
          ativa={String(dias)}
          aoMudar={(v) => setDias(Number(v) as Periodo)}
          opcoes={PERIODOS.map((p) => ({ valor: String(p), rotulo: <span className="tnum">{p} dias</span> }))}
        />
        {plataforma ? (
          <select
            value={organizacao}
            onChange={(e) => setOrganizacao(e.target.value)}
            aria-label="Organização"
            className="campo w-auto text-sm"
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
        <div className="space-y-4 md:space-y-6">
          <div className="grid grid-cols-2 gap-4 md:grid-cols-3 md:gap-6 xl:grid-cols-6">
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

          <CartaoDoPainel titulo="Receita por dia">
            <GraficoPorDia dias={data.porDia} />
          </CartaoDoPainel>

          <div className="grid grid-cols-1 gap-4 md:gap-6 lg:grid-cols-2">
            <CartaoDoPainel titulo="Por canal">
              {data.canais.length === 0 ? (
                <Empty>Nenhuma venda paga no período.</Empty>
              ) : (
                <ul className="space-y-3 px-5">
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
                        <div className="mt-1.5 h-1.5 rounded-full bg-mist-2">
                          <div
                            className="h-1.5 rounded-full bg-green"
                            style={{ width: `${Math.max(2, (c.receitaCents / maior) * 100)}%` }}
                          />
                        </div>
                        <p className="tnum mt-1 text-[11px] text-muted">{groupNumber(c.pedidos)} pedido(s)</p>
                      </li>
                    );
                  })}
                </ul>
              )}
              <p className="px-5 pb-5 pt-3 text-[11px] text-muted">
                Cambista e afiliado contam pela venda. No site, pelo último lugar de onde a pessoa chegou à rifa
                (vitrine, perfil, story, banner, página do estado ou anúncio).
              </p>
            </CartaoDoPainel>

            <CartaoDoPainel titulo="Rifas que mais vendem">
              {data.rifas.length === 0 ? (
                <Empty>Nenhuma venda paga no período.</Empty>
              ) : (
                // Uma rifa por linha, contada de cima para baixo (pedidos, cotas, receita): cabe no celular e no cartão estreito.
                <ul className="divide-y divide-line px-5 pb-2" aria-label="Rifas que mais vendem">
                  {data.rifas.map((r) => (
                    <li key={r.id} className="py-3 text-sm">
                      <Link href={`/r/${r.slug}`} className="block truncate font-semibold hover:underline" title={r.premio}>
                        {r.premio}
                      </Link>
                      <dl className="mt-1 space-y-0.5 text-xs">
                        <div className="flex items-baseline gap-1.5">
                          <dt className="label-xs">pedidos:</dt>
                          <dd className="tnum">{groupNumber(r.pedidos)}</dd>
                        </div>
                        <div className="flex items-baseline gap-1.5">
                          <dt className="label-xs">cotas:</dt>
                          <dd className="tnum">{groupNumber(r.cotas)}</dd>
                        </div>
                        <div className="flex items-baseline gap-1.5">
                          <dt className="label-xs">receita:</dt>
                          <dd className="tnum text-sm font-medium text-green-deep">{formatBRL(r.receitaCents)}</dd>
                        </div>
                      </dl>
                    </li>
                  ))}
                </ul>
              )}
            </CartaoDoPainel>
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
    <div className="px-5 pb-5">
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2 text-xs text-muted">
        <span className="tnum">máx. {formatBRL(maior)}</span>
        <span className="tnum min-h-[1rem] text-ink-2" aria-live="polite">
          {escolhido
            ? `${diaCurto(escolhido.dia)} · ${formatBRL(escolhido.receitaCents)} · ${groupNumber(escolhido.pedidos)} pedido(s) · ${groupNumber(escolhido.cotas)} cota(s)`
            : "passe o dedo ou o mouse nas colunas"}
        </span>
      </div>
      <div
        className="flex h-40 items-end gap-[2px] overflow-x-auto border-b border-line"
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
            className="group flex h-full min-w-6 flex-1 items-end justify-center focus:outline-none"
          >
            {/* Dia sem venda aparece com zero: o traço de 3 px na base, como no Figma (e "R$ 0,00" no foco). */}
            <span
              className={`block w-full max-w-6 rounded-t ${d.receitaCents > 0 ? "bg-green" : "bg-line-2"} ${
                ativo === i ? "opacity-100" : ativo === null ? "opacity-100" : "opacity-60"
              } group-focus-visible:ring-2 group-focus-visible:ring-ink`}
              style={{ height: maior > 0 && d.receitaCents > 0 ? `${(d.receitaCents / maior) * 100}%` : 3, minHeight: 3 }}
            />
          </button>
        ))}
      </div>
      <div className="tnum mt-1 flex justify-between text-[11px] text-muted">
        <span>{diaCurto(dias[0].dia)}</span>
        <span>{diaCurto(dias[Math.floor(dias.length / 2)].dia)}</span>
        <span>{diaCurto(dias[dias.length - 1].dia)}</span>
      </div>
      <button
        type="button"
        onClick={() => setTabela(!tabela)}
        aria-expanded={tabela}
        className="mt-3 inline-flex min-h-6 items-center text-xs font-semibold text-green-deep hover:underline"
      >
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
