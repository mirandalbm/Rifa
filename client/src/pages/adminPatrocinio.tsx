import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { PanelShell } from "@/components/AppShell";
import { Button, Card, Empty, Money, Pill } from "@/components/bits";
import { apiRequest } from "@/lib/queryClient";
import { formatBRL, groupNumber } from "@shared/format";
import { UFS } from "@shared/endereco";
import {
  ALCANCES,
  precoDoPacote,
  type Alcance,
  type ConfigPatrocinio,
  type FaixaDeDesconto,
} from "@shared/patrocinio";

/* ------------------------------------------------------------------ *
 * Tipos do painel
 * ------------------------------------------------------------------ */

interface Totais {
  exibicoes: number;
  cliques: number;
  barrados: number;
  gastoCents: number;
  pedidos: number;
  vendas: number;
  receitaCents: number;
  taxaDeCliquePct: number | null;
  conversaoPct: number | null;
  custoPorCliqueCents: number | null;
  custoPorVendaCents: number | null;
  retorno: number | null;
}
interface DiaSerie {
  dia: string;
  exibicoes: number;
  cliques: number;
  gastoCents: number;
  receitaCents: number;
  vendas: number;
}
interface Estado {
  uf: string | null;
  exibicoes: number;
  cliques: number;
  gastoCents: number;
}
type Config = ConfigPatrocinio & { ligado: boolean; reembolso: boolean };
interface Comum {
  dias: number;
  config: Config;
  totais: Totais;
  serie: DiaSerie[];
  porEstado: Estado[];
}
interface Anuncio {
  id: string;
  rifa: string;
  alcance: Alcance;
  uf: string | null;
  cidade: string | null;
  comprados: number;
  usados: number;
  valorPagoCents: number;
  descontoPct: number;
  gastoCents: number;
  reembolsoCents: number;
  status: string;
  situacao: "no_ar" | "na_fila" | "parado" | "encerrado" | "cancelado";
  posicaoNaFila: number | null;
  entraEmCliques: number | null;
  entraEmHoras: number | null;
  exibicoes: number;
  cliques: number;
  barrados: number;
  vendas: number;
  receitaCents: number;
}
interface Reembolso {
  id: string;
  protocolo: string;
  status: "aberto" | "aprovado" | "pago" | "recusado";
  organizacao: string;
  valorCents: number;
  chavePix: string;
  motivo: string;
  retidoCents: number | null;
  devolverCents: number | null;
  explicacao: string | null;
  createdAt: string;
  decididoEm: string | null;
  pagoEm: string | null;
  mensagens: {
    autor: "organizacao" | "plataforma";
    texto: string;
    createdAt: string;
  }[];
}
interface DaOrg extends Comum {
  reembolsos: Reembolso[];
  plataforma: false;
  saldoCents: number;
  padrao: { uf: string | null; cidade: string | null };
  anuncios: Anuncio[];
  rifas: { id: string; titulo: string }[];
  extrato: {
    valorCents: number;
    motivo: string;
    descricao: string | null;
    createdAt: string;
  }[];
  recargaPendente: {
    codigo: number;
    valorCents: number;
    pixQr: string | null;
    pixCopyPaste: string | null;
    expiresAt: string;
  } | null;
}
interface NaFila {
  id: string;
  organizacao: string;
  rifa: string;
  comprados: number;
  usados: number;
  gastoCents: number;
  noAr: boolean;
  posicaoNaFila: number | null;
  entraEmCliques: number | null;
  entraEmHoras: number | null;
}
interface DaPlataforma extends Comum {
  plataforma: true;
  reembolsos: Reembolso[];
  fila: {
    segmento: string;
    alcance: Alcance;
    vagas: number;
    cliquesPorHora: number;
    anuncios: NaFila[];
  }[];
  vendidoCents: number;
  anunciosVendidos: number;
  organizacoes: { id: string; nome: string; saldoCents: number }[];
}
type Painel = DaOrg | DaPlataforma;

/* ------------------------------------------------------------------ *
 * Ajudantes
 * ------------------------------------------------------------------ */

/** "12,50" → 1250. Nulo quando não é um valor em reais. */
function centavos(texto: string): number | null {
  const t = texto
    .replace(/\s|R\$/g, "")
    .replace(/\./g, "")
    .replace(",", ".");
  if (!/^-?\d+(\.\d{1,2})?$/.test(t)) return null;
  return Math.round(Number(t) * 100);
}
const reais = (c: number) => (c / 100).toFixed(2).replace(".", ",");
const pct = (v: number | null) =>
  v === null ? "—" : `${v.toLocaleString("pt-BR")}%`;
const diaCurto = (d: string) => d.slice(8, 10) + "/" + d.slice(5, 7);

/** "nacional" → "Brasil"; "estado:SP" → "Estado: SP"; "cidade:SP:campinas" → "Campinas/SP". */
function nomeDoSegmento(seg: string): string {
  if (seg === "nacional") return "Brasil inteiro";
  const [tipo, uf, cidade] = seg.split(":");
  if (tipo === "estado") return `Estado: ${UFS[uf as keyof typeof UFS] ?? uf}`;
  return `${(cidade ?? "").replace(/\b\w/g, (l) => l.toUpperCase())}/${uf}`;
}
function ondeAparece(a: {
  alcance: Alcance;
  uf: string | null;
  cidade: string | null;
}): string {
  if (a.alcance === "nacional") return "Brasil inteiro";
  if (a.alcance === "estado") return `Estado: ${a.uf}`;
  return `${a.cidade}/${a.uf}`;
}
function previsao(a: {
  entraEmCliques: number | null;
  entraEmHoras: number | null;
}): string {
  if (a.entraEmCliques === null) return "sem previsão";
  if (a.entraEmCliques === 0) return "entra no próximo clique";
  return `entra em ~${groupNumber(a.entraEmCliques)} cliques${a.entraEmHoras !== null ? ` (~${a.entraEmHoras.toLocaleString("pt-BR")} h)` : ""}`;
}

function Aviso({ msg }: { msg: { ok: boolean; texto: string } | null }) {
  if (!msg) return null;
  return (
    <p
      className={`rounded-md px-3 py-2 text-sm ${msg.ok ? "bg-green-soft text-green-deep" : "bg-red-soft text-red"}`}
    >
      {msg.texto}
    </p>
  );
}

function Barra({ usados, comprados }: { usados: number; comprados: number }) {
  const p = comprados > 0 ? Math.min(100, (100 * usados) / comprados) : 0;
  return (
    <div
      className="h-2 overflow-hidden rounded-full bg-mist-2"
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={comprados}
      aria-valuenow={usados}
      aria-label={`${usados} de ${comprados} cliques gastos`}
    >
      <div className="h-full bg-yellow" style={{ width: `${p}%` }} />
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Página
 * ------------------------------------------------------------------ */

/**
 * Rifas patrocinadas (etapa 15). A mesma tela para os dois lados: o
 * patrocinador vê o retorno do dinheiro dele (números, funil, gasto ×
 * receita, anúncios e compra); a plataforma, a fila de cada região com a
 * previsão de quem entra, a configuração e os saldos.
 */
export function AdminPatrocinio() {
  const [dias, setDias] = useState(30);
  const { data } = useQuery<Painel>({
    queryKey: ["/api/admin/patrocinio", { dias }],
    refetchInterval: 20_000,
  });
  return (
    <PanelShell title="Patrocínio">
      <div
        className="mb-3 flex flex-wrap items-center gap-1"
        role="tablist"
        aria-label="Período"
      >
        {[7, 30, 90].map((d) => (
          <button
            key={d}
            type="button"
            role="tab"
            aria-selected={dias === d}
            onClick={() => setDias(d)}
            className={
              dias === d
                ? "rounded-md bg-green px-3 py-1.5 text-sm font-semibold text-on-green"
                : "rounded-md px-3 py-1.5 text-sm text-ink-2 hover:bg-mist-2"
            }
          >
            {d} dias
          </button>
        ))}
      </div>
      {!data ? (
        <Empty>Carregando…</Empty>
      ) : data.plataforma ? (
        <DaPlataformaView dados={data} />
      ) : (
        <DaOrganizacaoView dados={data} />
      )}
    </PanelShell>
  );
}

/* ------------------------------------------------------------------ *
 * Números (os dois lados)
 * ------------------------------------------------------------------ */

function Numeros({ t, extra }: { t: Totais; extra?: [string, string][] }) {
  const itens: [string, string, string?][] = [
    ["Gasto", formatBRL(t.gastoCents)],
    ["Receita das vendas", formatBRL(t.receitaCents), "text-green-deep"],
    [
      "Retorno",
      t.retorno === null ? "—" : `${t.retorno.toLocaleString("pt-BR")}×`,
    ],
    ["Vendas", groupNumber(t.vendas)],
    [
      "Custo por venda",
      t.custoPorVendaCents === null ? "—" : formatBRL(t.custoPorVendaCents),
    ],
    ["Cliques", groupNumber(t.cliques)],
    ["Taxa de clique", pct(t.taxaDeCliquePct)],
    [
      "Custo por clique",
      t.custoPorCliqueCents === null ? "—" : formatBRL(t.custoPorCliqueCents),
    ],
    ...(extra ?? []).map(([a, b]) => [a, b] as [string, string]),
  ];
  return (
    <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {itens.map(([rotulo, valor, cor]) => (
        <div
          key={rotulo}
          className="rounded-xl border border-line bg-white p-3"
        >
          <dt className="label-xs">{rotulo}</dt>
          <dd className={`tnum mt-1 text-lg font-semibold ${cor ?? ""}`}>
            {valor}
          </dd>
        </div>
      ))}
    </dl>
  );
}

function Funil({ t }: { t: Totais }) {
  const etapas: [string, number][] = [
    ["Exibições", t.exibicoes],
    ["Cliques", t.cliques],
    ["Pedidos", t.pedidos],
    ["Vendas pagas", t.vendas],
  ];
  const topo = Math.max(1, t.exibicoes);
  return (
    <Card title="Funil">
      <ol className="space-y-2 p-4 text-sm">
        {etapas.map(([rotulo, n], i) => {
          const antes = i > 0 ? etapas[i - 1][1] : null;
          return (
            <li key={rotulo}>
              <div className="flex items-baseline justify-between gap-2">
                <span>{rotulo}</span>
                <span className="tnum">
                  {groupNumber(n)}
                  {antes ? (
                    <span className="text-xs text-muted">
                      {" "}
                      ·{" "}
                      {antes > 0
                        ? `${Math.round((1000 * n) / antes) / 10}%`
                        : "—"}{" "}
                      da etapa anterior
                    </span>
                  ) : null}
                </span>
              </div>
              <div className="mt-1 h-2 rounded-full bg-mist-2">
                <div
                  className="h-full rounded-full bg-ink-2"
                  style={{
                    width: `${Math.max(n > 0 ? 1 : 0, (100 * n) / topo)}%`,
                  }}
                />
              </div>
            </li>
          );
        })}
      </ol>
      <p className="border-t border-line px-4 py-2 text-[11px] text-muted">
        Barrados no período:{" "}
        <span className="tnum">{groupNumber(t.barrados)}</span> clique(s) de
        robô, repetidos em 24 h ou com o pacote esgotado — não foram cobrados.
      </p>
    </Card>
  );
}

/** Gasto × receita por dia. Receita em verde (dinheiro que entrou); gasto em cinza. Legenda em texto. */
function GastoReceita({ serie }: { serie: DiaSerie[] }) {
  const [ativo, setAtivo] = useState<number | null>(null);
  const [tabela, setTabela] = useState(false);
  const maior = Math.max(
    1,
    ...serie.map((d) => Math.max(d.gastoCents, d.receitaCents)),
  );
  const d = ativo !== null ? serie[ativo] : null;
  return (
    <Card title="Gasto × receita por dia">
      <div className="p-4">
        <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2 text-xs text-muted">
          <span className="flex items-center gap-3">
            <span className="flex items-center gap-1">
              <span
                className="inline-block h-2 w-3 rounded-sm bg-ink-2"
                aria-hidden
              />{" "}
              gasto
            </span>
            <span className="flex items-center gap-1">
              <span
                className="inline-block h-2 w-3 rounded-sm bg-green"
                aria-hidden
              />{" "}
              receita
            </span>
          </span>
          <span className="tnum min-h-[1rem] text-ink-2" aria-live="polite">
            {d
              ? `${diaCurto(d.dia)} · gasto ${formatBRL(d.gastoCents)} · receita ${formatBRL(d.receitaCents)} · ${d.cliques} clique(s)`
              : "passe o dedo ou o mouse"}
          </span>
        </div>
        <div
          className="flex h-36 items-end gap-[3px] border-b border-line"
          onMouseLeave={() => setAtivo(null)}
        >
          {serie.map((x, i) => (
            <button
              key={x.dia}
              type="button"
              onMouseEnter={() => setAtivo(i)}
              onFocus={() => setAtivo(i)}
              onClick={() => setAtivo(i)}
              aria-label={`${diaCurto(x.dia)}: gasto ${formatBRL(x.gastoCents)}, receita ${formatBRL(x.receitaCents)}`}
              className="flex h-full flex-1 items-end justify-center gap-[1px] focus:outline-none focus-visible:ring-2 focus-visible:ring-ink"
            >
              <span
                className="block w-1/2 max-w-3 rounded-t bg-ink-2"
                style={{ height: `${(100 * x.gastoCents) / maior}%` }}
              />
              <span
                className="block w-1/2 max-w-3 rounded-t bg-green"
                style={{ height: `${(100 * x.receitaCents) / maior}%` }}
              />
            </button>
          ))}
        </div>
        <div className="tnum mt-1 flex justify-between text-[11px] text-muted">
          <span>{diaCurto(serie[0].dia)}</span>
          <span>{diaCurto(serie[serie.length - 1].dia)}</span>
        </div>
        <button
          type="button"
          onClick={() => setTabela(!tabela)}
          className="mt-2 text-xs text-ink-2 underline"
        >
          {tabela ? "Esconder tabela" : "Ver em tabela"}
        </button>
        {tabela ? (
          <table className="mt-2 w-full text-sm">
            <thead>
              <tr className="label-xs border-b border-line text-left">
                <th className="py-1 font-normal">Dia</th>
                <th className="py-1 text-right font-normal">Exibições</th>
                <th className="py-1 text-right font-normal">Cliques</th>
                <th className="py-1 text-right font-normal">Gasto</th>
                <th className="py-1 text-right font-normal">Receita</th>
              </tr>
            </thead>
            <tbody>
              {[...serie].reverse().map((x) => (
                <tr key={x.dia} className="border-b border-line last:border-0">
                  <td className="tnum py-1">{diaCurto(x.dia)}</td>
                  <td className="tnum py-1 text-right">
                    {groupNumber(x.exibicoes)}
                  </td>
                  <td className="tnum py-1 text-right">
                    {groupNumber(x.cliques)}
                  </td>
                  <td className="tnum py-1 text-right">
                    {formatBRL(x.gastoCents)}
                  </td>
                  <td className="tnum py-1 text-right">
                    {formatBRL(x.receitaCents)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : null}
      </div>
    </Card>
  );
}

function PorEstado({ estados }: { estados: Estado[] }) {
  return (
    <Card title="De onde vieram">
      {estados.length ? (
        <div className="overflow-x-auto">
          <table className="w-full text-xs sm:text-sm">
            <thead>
              <tr className="label-xs border-b border-line text-left">
                <th className="px-2 py-2 font-normal sm:px-4">Estado</th>
                <th className="px-2 py-2 text-right font-normal">Exibições</th>
                <th className="px-2 py-2 text-right font-normal">Cliques</th>
                <th className="px-2 py-2 text-right font-normal sm:px-4">
                  Gasto
                </th>
              </tr>
            </thead>
            <tbody>
              {estados.map((e) => (
                <tr
                  key={e.uf ?? "?"}
                  className="border-b border-line last:border-0"
                >
                  <td className="px-2 py-2 sm:px-4">
                    <span className="sm:hidden">{e.uf ?? "—"}</span>
                    <span className="hidden sm:inline">
                      {e.uf
                        ? (UFS[e.uf as keyof typeof UFS] ?? e.uf)
                        : "Sem região escolhida"}
                    </span>
                  </td>
                  <td className="tnum px-2 py-2 text-right">
                    {groupNumber(e.exibicoes)}
                  </td>
                  <td className="tnum px-2 py-2 text-right">
                    {groupNumber(e.cliques)}
                  </td>
                  <td className="tnum whitespace-nowrap px-2 py-2 text-right sm:px-4">
                    {formatBRL(e.gastoCents)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <Empty>Nada no período.</Empty>
      )}
    </Card>
  );
}

/* ------------------------------------------------------------------ *
 * Lado do patrocinador (organização)
 * ------------------------------------------------------------------ */

const PILL_SITUACAO: Record<Anuncio["situacao"], [string, string]> = {
  no_ar: ["active", "na vitrine"],
  na_fila: ["pending", "na fila"],
  parado: ["draft", "parado"],
  encerrado: ["paid", "encerrado"],
  cancelado: ["expired", "cancelado"],
};

function DaOrganizacaoView({ dados }: { dados: DaOrg }) {
  const qc = useQueryClient();
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null);
  const recarregar = () =>
    qc.invalidateQueries({ queryKey: ["/api/admin/patrocinio"] });
  const falhou = (e: Error) => setMsg({ ok: false, texto: e.message });
  const ativos = dados.anuncios.filter((a) => a.status === "ativo");
  const antigos = dados.anuncios.filter((a) => a.status !== "ativo");

  return (
    <div className="space-y-3">
      {!dados.config.ligado ? (
        <p className="rounded-md bg-yellow-soft px-3 py-2 text-sm text-yellow-deep">
          As rifas patrocinadas ainda não estão ativas na plataforma. O saldo
          fica guardado.
        </p>
      ) : null}
      <Aviso msg={msg} />
      <Numeros
        t={dados.totais}
        extra={[
          ["Exibições", groupNumber(dados.totais.exibicoes)],
          ["Conversão do clique", pct(dados.totais.conversaoPct)],
        ]}
      />
      <div className="grid gap-3 lg:grid-cols-2">
        <GastoReceita serie={dados.serie} />
        <Funil t={dados.totais} />
      </div>

      <Card
        title="Seus anúncios"
        right={
          <span className="tnum text-xs text-muted">
            {ativos.length} ativo(s)
          </span>
        }
      >
        {ativos.length ? (
          <ul className="divide-y divide-line">
            {ativos.map((a) => (
              <li key={a.id} className="space-y-2 px-4 py-3 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="min-w-0 flex-1 font-semibold">{a.rifa}</span>
                  <span className="text-xs text-muted">{ondeAparece(a)}</span>
                  <Pill status={PILL_SITUACAO[a.situacao][0]}>
                    {a.situacao === "na_fila"
                      ? `${a.posicaoNaFila}º na fila`
                      : PILL_SITUACAO[a.situacao][1]}
                  </Pill>
                </div>
                <Barra usados={a.usados} comprados={a.comprados} />
                <p className="tnum text-xs text-muted">
                  {groupNumber(a.usados)} de {groupNumber(a.comprados)} cliques
                  · gasto {formatBRL(a.gastoCents)} de{" "}
                  {formatBRL(a.valorPagoCents)}
                  {a.descontoPct ? ` (${a.descontoPct}% de desconto)` : ""}
                  {a.situacao === "na_fila" ? ` · ${previsao(a)}` : ""}
                </p>
                <p className="tnum text-xs">
                  {groupNumber(a.exibicoes)} exibições ·{" "}
                  {groupNumber(a.cliques)} cliques · {groupNumber(a.vendas)}{" "}
                  venda(s) ·{" "}
                  <span className="text-green-deep">
                    {formatBRL(a.receitaCents)}
                  </span>
                </p>
              </li>
            ))}
          </ul>
        ) : (
          <Empty>Nenhum anúncio ativo. Compre um abaixo.</Empty>
        )}
        <p className="border-t border-line px-4 py-2 text-[11px] text-muted">
          A fila é por ordem de chegada. O anúncio que entra na vitrine fica até
          gastar todos os cliques comprados; aí o próximo da fila entra sozinho.
          Não há cancelamento: enquanto a rifa está no ar, o crédito do anúncio
          fica com ele. Se a rifa sair do ar antes de gastar tudo, o que sobrou
          volta ao saldo como crédito, para usar em qualquer rifa.
        </p>
      </Card>

      <div className="grid gap-3 lg:grid-cols-2">
        <NovoAnuncio
          dados={dados}
          aoComprar={() => {
            setMsg({
              ok: true,
              texto: "Anúncio comprado: ele entrou na fila.",
            });
            recarregar();
          }}
          aoFalhar={falhou}
        />
        <SaldoERecarga
          dados={dados}
          aoMudar={recarregar}
          aoFalhar={falhou}
          setMsg={setMsg}
        />
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <PorEstado estados={dados.porEstado} />
        <Card title="Extrato do saldo">
          {dados.extrato.length ? (
            <ul className="divide-y divide-line">
              {dados.extrato.map((e, i) => (
                <li
                  key={i}
                  className="flex items-center gap-3 px-4 py-2 text-sm"
                >
                  <span className="min-w-0 flex-1">
                    {e.descricao ?? e.motivo}
                    <span className="tnum block text-xs text-muted">
                      {new Date(e.createdAt).toLocaleString("pt-BR")}
                    </span>
                  </span>
                  <Money
                    cents={e.valorCents}
                    className={e.valorCents > 0 ? "text-green-deep" : ""}
                  />
                </li>
              ))}
            </ul>
          ) : (
            <Empty>Nenhum lançamento ainda.</Empty>
          )}
        </Card>
      </div>

      {antigos.length ? (
        <Card title="Anúncios encerrados">
          <ul className="divide-y divide-line">
            {antigos.map((a) => (
              <li
                key={a.id}
                className="flex flex-wrap items-center gap-2 px-4 py-2 text-sm"
              >
                <span className="min-w-0 flex-1">
                  {a.rifa}{" "}
                  <span className="text-xs text-muted">· {ondeAparece(a)}</span>
                </span>
                <span className="tnum text-xs text-muted">
                  {groupNumber(a.cliques)} cliques · {a.vendas} venda(s) ·{" "}
                  {formatBRL(a.receitaCents)}
                  {a.reembolsoCents
                    ? ` · ${formatBRL(a.reembolsoCents)} voltaram ao saldo`
                    : ""}
                </span>
                <Pill status={PILL_SITUACAO[a.situacao][0]}>
                  {PILL_SITUACAO[a.situacao][1]}
                </Pill>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      {/* Desligado, o reembolso não existe na tela: nem botão, nem menção. Só o
          pedido que já existia segue visível, para terminar a conversa. */}
      {dados.config.reembolso || dados.reembolsos.length ? (
        <ReembolsosCard
          reembolsos={dados.reembolsos}
          plataforma={false}
          podePedir={dados.config.reembolso}
          saldoCents={dados.saldoCents}
        />
      ) : null}
    </div>
  );
}

const PILL_REEMBOLSO: Record<Reembolso["status"], [string, string]> = {
  aberto: ["pending", "em análise"],
  aprovado: ["pending", "aprovado · a pagar"],
  pago: ["paid", "pago"],
  recusado: ["expired", "recusado"],
};

/**
 * Pedidos de reembolso do saldo, com a conversa. A mesma tela para os dois
 * lados: a organização fala com "Suporte" e só vê o botão de pedir com o
 * interruptor ligado; a plataforma vê de quem é, decide e dá baixa no Pix.
 */
function ReembolsosCard({
  reembolsos,
  plataforma,
  podePedir,
  saldoCents,
}: {
  reembolsos: Reembolso[];
  plataforma: boolean;
  podePedir: boolean;
  saldoCents: number;
}) {
  const emAnalise = reembolsos.filter((r) => r.status === "aberto").length;
  const aPagar = reembolsos.filter((r) => r.status === "aprovado").length;
  return (
    <Card
      title={
        plataforma ? "Pedidos de reembolso do saldo" : "Reembolso do saldo"
      }
      right={
        emAnalise || aPagar ? (
          <Pill status="pending">
            {[
              emAnalise ? `${emAnalise} em análise` : "",
              aPagar ? `${aPagar} a pagar` : "",
            ]
              .filter(Boolean)
              .join(" · ")}
          </Pill>
        ) : undefined
      }
    >
      {!plataforma && podePedir && !emAnalise ? (
        <PedirReembolso saldoCents={saldoCents} />
      ) : null}
      {reembolsos.length ? (
        <ul className="divide-y divide-line border-t border-line">
          {reembolsos.map((r) => (
            <ConversaDoReembolso key={r.id} r={r} plataforma={plataforma} />
          ))}
        </ul>
      ) : plataforma ? (
        <Empty>Nenhum pedido.</Empty>
      ) : null}
    </Card>
  );
}

function PedirReembolso({ saldoCents }: { saldoCents: number }) {
  const qc = useQueryClient();
  const [aberto, setAberto] = useState(false);
  const [valor, setValor] = useState(reais(saldoCents));
  const [chavePix, setChavePix] = useState("");
  const [motivo, setMotivo] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null);
  const pedir = useMutation({
    mutationFn: () =>
      apiRequest("POST", "/api/admin/patrocinio/reembolsos", {
        valorCents: centavos(valor),
        chavePix,
        motivo,
      }),
    onSuccess: () => {
      setAberto(false);
      setMotivo("");
      setMsg({
        ok: true,
        texto: "Pedido enviado ao suporte. A conversa segue aqui embaixo.",
      });
      qc.invalidateQueries({ queryKey: ["/api/admin/patrocinio"] });
    },
    onError: (e: Error) => setMsg({ ok: false, texto: e.message }),
  });
  if (!aberto)
    return (
      <div className="space-y-2 p-4 text-sm">
        <Aviso msg={msg} />
        <Button
          variant="ghost"
          disabled={saldoCents < 100}
          onClick={() => setAberto(true)}
        >
          Pedir reembolso do saldo
        </Button>
      </div>
    );
  const valorCents = centavos(valor);
  return (
    <form
      className="space-y-3 p-4 text-sm"
      onSubmit={(e) => {
        e.preventDefault();
        setMsg(null);
        pedir.mutate();
      }}
    >
      <Aviso msg={msg} />
      <div className="grid gap-2 sm:grid-cols-[10rem_1fr]">
        <label className="block">
          <span className="label-xs">Valor (R$)</span>
          <input
            value={valor}
            onChange={(e) => setValor(e.target.value)}
            inputMode="decimal"
            className="tnum mt-1 w-full rounded-md border border-line-2 px-3 py-2"
          />
        </label>
        <label className="block">
          <span className="label-xs">Chave Pix para a devolução</span>
          <input
            value={chavePix}
            onChange={(e) => setChavePix(e.target.value)}
            maxLength={140}
            className="mt-1 w-full rounded-md border border-line-2 px-3 py-2"
          />
        </label>
      </div>
      <label className="block">
        <span className="label-xs">Motivo</span>
        <textarea
          value={motivo}
          onChange={(e) => setMotivo(e.target.value)}
          rows={3}
          maxLength={1000}
          className="mt-1 w-full rounded-md border border-line-2 px-3 py-2"
        />
      </label>
      <p className="text-xs text-muted">
        Vale para o saldo livre (
        <span className="tnum">{formatBRL(saldoCents)}</span>); o crédito de
        anúncio de rifa no ar não entra. O valor fica reservado enquanto o
        suporte analisa e volta ao saldo se o pedido for recusado. O suporte
        pode reter o custo de divulgação externa já feita.
      </p>
      <div className="flex gap-2">
        <Button
          type="submit"
          disabled={
            valorCents === null ||
            valorCents < 100 ||
            valorCents > saldoCents ||
            chavePix.trim().length < 5 ||
            motivo.trim().length < 10 ||
            pedir.isPending
          }
        >
          Enviar ao suporte
        </Button>
        <Button type="button" variant="ghost" onClick={() => setAberto(false)}>
          Voltar
        </Button>
      </div>
    </form>
  );
}

function ConversaDoReembolso({
  r,
  plataforma,
}: {
  r: Reembolso;
  plataforma: boolean;
}) {
  const qc = useQueryClient();
  const [texto, setTexto] = useState("");
  const [retido, setRetido] = useState("0,00");
  const [explicacao, setExplicacao] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const recarregar = () =>
    qc.invalidateQueries({ queryKey: ["/api/admin/patrocinio"] });
  const falhou = (x: Error) => setErro(x.message);
  const responder = useMutation({
    mutationFn: () =>
      apiRequest("POST", `/api/admin/patrocinio/reembolsos/${r.id}/mensagens`, {
        texto,
      }),
    onSuccess: () => {
      setTexto("");
      setErro(null);
      recarregar();
    },
    onError: falhou,
  });
  const decidir = useMutation({
    mutationFn: (aprovar: boolean) =>
      apiRequest("POST", `/api/admin/patrocinio/reembolsos/${r.id}/decisao`, {
        aprovar,
        retidoCents: aprovar ? centavos(retido) : 0,
        explicacao,
      }),
    onSuccess: () => {
      setErro(null);
      recarregar();
    },
    onError: falhou,
  });
  const pagar = useMutation({
    mutationFn: () =>
      apiRequest("POST", `/api/admin/patrocinio/reembolsos/${r.id}/pago`),
    onSuccess: recarregar,
    onError: falhou,
  });
  const retidoCents = centavos(retido);
  const devolveria =
    retidoCents === null ? null : Math.max(0, r.valorCents - retidoCents);
  const quem = (autor: string) =>
    autor === "plataforma" ? "Suporte" : plataforma ? r.organizacao : "Você";

  return (
    <li className="space-y-2 px-4 py-3 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <span className="tnum font-semibold">{r.protocolo}</span>
        <span className="min-w-0 flex-1 truncate text-muted">
          {plataforma ? r.organizacao : ""}
        </span>
        <Pill status={PILL_REEMBOLSO[r.status][0]}>
          {PILL_REEMBOLSO[r.status][1]}
        </Pill>
      </div>
      <p className="tnum text-xs text-muted">
        Pedido: {formatBRL(r.valorCents)} · Pix: {r.chavePix}
        {r.devolverCents !== null && r.status !== "recusado"
          ? ` · retido ${formatBRL(r.retidoCents ?? 0)} · devolver ${formatBRL(r.devolverCents)}`
          : ""}
        {r.status === "recusado" ? " · o valor voltou ao saldo" : ""}
      </p>
      <ol className="space-y-1">
        {r.mensagens.map((m, i) => (
          <li
            key={i}
            className={`rounded-md px-3 py-2 ${m.autor === "plataforma" ? "bg-mist" : "border border-line"}`}
          >
            <span className="text-xs font-semibold">{quem(m.autor)}</span>
            <span className="tnum ml-2 text-[11px] text-muted">
              {new Date(m.createdAt).toLocaleString("pt-BR")}
            </span>
            <p className="whitespace-pre-wrap">{m.texto}</p>
          </li>
        ))}
      </ol>
      {erro ? (
        <p className="rounded-md bg-red-soft px-3 py-2 text-xs text-red">
          {erro}
        </p>
      ) : null}
      {r.status === "aberto" ? (
        <form
          className="flex gap-2"
          onSubmit={(ev) => {
            ev.preventDefault();
            responder.mutate();
          }}
        >
          <input
            value={texto}
            onChange={(ev) => setTexto(ev.target.value)}
            placeholder="Escreva uma mensagem"
            aria-label={`Mensagem no pedido ${r.protocolo}`}
            className="min-w-0 flex-1 rounded-md border border-line-2 px-3 py-2"
          />
          <Button
            type="submit"
            variant="ghost"
            disabled={texto.trim().length < 2 || responder.isPending}
          >
            Enviar
          </Button>
        </form>
      ) : null}
      {plataforma && r.status === "aberto" ? (
        <div className="space-y-2 rounded-md border border-line p-3">
          <span className="label-xs">Decisão</span>
          <div className="grid gap-2 sm:grid-cols-[10rem_1fr]">
            <label className="block">
              <span className="text-xs">Retido pela plataforma (R$)</span>
              <input
                value={retido}
                onChange={(ev) => setRetido(ev.target.value)}
                inputMode="decimal"
                className="tnum mt-1 w-full rounded-md border border-line-2 px-3 py-2"
              />
            </label>
            <label className="block">
              <span className="text-xs">Explicação para a organização</span>
              <input
                value={explicacao}
                onChange={(ev) => setExplicacao(ev.target.value)}
                className="mt-1 w-full rounded-md border border-line-2 px-3 py-2"
              />
            </label>
          </div>
          <p className="tnum text-xs text-muted">
            {devolveria === null
              ? "Informe o valor retido em reais."
              : `Aprovando, a plataforma devolve ${formatBRL(devolveria)} por Pix. Recusando, os ${formatBRL(r.valorCents)} voltam ao saldo.`}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              disabled={
                explicacao.trim().length < 10 ||
                retidoCents === null ||
                decidir.isPending
              }
              onClick={() => decidir.mutate(true)}
            >
              Aprovar reembolso
            </Button>
            <Button
              variant="ghost"
              disabled={explicacao.trim().length < 10 || decidir.isPending}
              onClick={() => decidir.mutate(false)}
            >
              Recusar
            </Button>
          </div>
        </div>
      ) : null}
      {plataforma && r.status === "aprovado" ? (
        <Button
          variant="ghost"
          onClick={() => pagar.mutate()}
          disabled={pagar.isPending}
        >
          Pix de {formatBRL(r.devolverCents ?? 0)} feito — dar baixa
        </Button>
      ) : null}
    </li>
  );
}

function NovoAnuncio({
  dados,
  aoComprar,
  aoFalhar,
}: {
  dados: DaOrg;
  aoComprar: () => void;
  aoFalhar: (e: Error) => void;
}) {
  const cfg = dados.config;
  const [rifa, setRifa] = useState(dados.rifas[0]?.id ?? "");
  const [alcance, setAlcance] = useState<Alcance>("estado");
  const [uf, setUf] = useState(dados.padrao.uf ?? "");
  const [cidade, setCidade] = useState(dados.padrao.cidade ?? "");
  const [cliques, setCliques] = useState(
    String(Math.max(cfg.minimoCliques, 100)),
  );
  const n = Number(cliques);
  const preco = useMemo(() => {
    try {
      return precoDoPacote(cfg, alcance, n);
    } catch (e) {
      return { erro: (e as Error).message };
    }
  }, [cfg, alcance, n]);
  const comprar = useMutation({
    mutationFn: () =>
      apiRequest("POST", "/api/admin/patrocinio/anuncios", {
        campaignId: rifa,
        alcance,
        uf,
        cidade,
        cliques: n,
      }),
    onSuccess: aoComprar,
    onError: aoFalhar,
  });
  const total = "totalCents" in preco ? preco.totalCents : null;
  const semSaldo = total !== null && total > dados.saldoCents;

  return (
    <Card title="Novo anúncio">
      <form
        className="space-y-3 p-4 text-sm"
        onSubmit={(e) => {
          e.preventDefault();
          comprar.mutate();
        }}
      >
        <label className="block">
          <span className="label-xs">Rifa</span>
          <select
            value={rifa}
            onChange={(e) => setRifa(e.target.value)}
            className="mt-1 w-full rounded-md border border-line-2 px-2 py-2"
          >
            {dados.rifas.map((r) => (
              <option key={r.id} value={r.id}>
                {r.titulo}
              </option>
            ))}
          </select>
        </label>
        <fieldset>
          <legend className="label-xs">Onde aparece</legend>
          <div className="mt-1 grid grid-cols-3 gap-2">
            {(Object.keys(ALCANCES) as Alcance[]).map((a) => (
              <label
                key={a}
                className={`min-w-0 cursor-pointer rounded-md border px-1 py-2 text-center ${alcance === a ? "border-green bg-green-soft" : "border-line-2"}`}
              >
                <input
                  type="radio"
                  name="alcance"
                  className="sr-only"
                  checked={alcance === a}
                  onChange={() => setAlcance(a)}
                />
                <span className="block text-xs font-semibold sm:text-sm">
                  {ALCANCES[a]}
                </span>
                <span className="tnum block text-[11px] text-muted">
                  {formatBRL(cfg.precos[a])}
                  <span className="hidden sm:inline">/clique</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>
        {alcance !== "nacional" ? (
          <div className="grid grid-cols-[6rem_1fr] gap-2">
            <label className="block">
              <span className="label-xs">Estado</span>
              <select
                value={uf}
                onChange={(e) => setUf(e.target.value)}
                className="mt-1 w-full rounded-md border border-line-2 px-2 py-2"
              >
                <option value="">—</option>
                {Object.keys(UFS).map((u) => (
                  <option key={u} value={u}>
                    {u}
                  </option>
                ))}
              </select>
            </label>
            {alcance === "cidade" ? (
              <label className="block">
                <span className="label-xs">Cidade</span>
                <input
                  value={cidade}
                  onChange={(e) => setCidade(e.target.value)}
                  className="mt-1 w-full rounded-md border border-line-2 px-3 py-2"
                />
              </label>
            ) : null}
          </div>
        ) : null}
        <label className="block">
          <span className="label-xs">
            Cliques (mínimo {groupNumber(cfg.minimoCliques)})
          </span>
          <input
            type="number"
            min={cfg.minimoCliques}
            value={cliques}
            onChange={(e) => setCliques(e.target.value)}
            className="tnum mt-1 w-40 rounded-md border border-line-2 px-3 py-2"
          />
        </label>
        {cfg.faixas.length ? (
          <p className="text-xs text-muted">
            Desconto por volume:{" "}
            {cfg.faixas.map((f, i) => (
              <span
                key={f.aPartirDe}
                className={`tnum ${n >= f.aPartirDe && (i === cfg.faixas.length - 1 || n < cfg.faixas[i + 1].aPartirDe) ? "font-semibold text-ink" : ""}`}
              >
                {i ? " · " : ""}
                {groupNumber(f.aPartirDe)}+ cliques: {f.descontoPct}%
              </span>
            ))}
          </p>
        ) : null}
        <div className="rounded-md bg-mist px-3 py-2">
          {"erro" in preco ? (
            <p className="text-xs text-red">{preco.erro}</p>
          ) : (
            <p className="tnum">
              {groupNumber(n)} × {formatBRL(preco.precoCliqueCents)}
              {preco.descontoPct ? ` − ${preco.descontoPct}%` : ""} ={" "}
              <strong>{formatBRL(preco.totalCents)}</strong>
              <span className="block text-xs text-muted">
                sai do saldo agora; o anúncio entra no fim da fila de{" "}
                {ondeAparece({ alcance, uf, cidade })}
              </span>
            </p>
          )}
        </div>
        {semSaldo ? (
          <p className="text-xs text-red">
            Saldo insuficiente: recarregue{" "}
            {formatBRL(total! - dados.saldoCents)} ou mais.
          </p>
        ) : null}
        <Button
          type="submit"
          disabled={
            !cfg.ligado ||
            !rifa ||
            "erro" in preco ||
            semSaldo ||
            comprar.isPending
          }
        >
          Comprar anúncio
        </Button>
      </form>
    </Card>
  );
}

function SaldoERecarga({
  dados,
  aoMudar,
  aoFalhar,
  setMsg,
}: {
  dados: DaOrg;
  aoMudar: () => void;
  aoFalhar: (e: Error) => void;
  setMsg: (m: { ok: boolean; texto: string } | null) => void;
}) {
  const [valor, setValor] = useState(reais(dados.config.recargaMinimaCents));
  const recarga = useMutation({
    mutationFn: () =>
      apiRequest("POST", "/api/admin/patrocinio/recargas", {
        valorCents: centavos(valor),
      }),
    onSuccess: () => {
      setMsg({
        ok: true,
        texto: "Pix gerado. Assim que for pago, o saldo entra sozinho.",
      });
      aoMudar();
    },
    onError: aoFalhar,
  });
  return (
    <Card
      title="Saldo"
      right={
        <Money
          cents={dados.saldoCents}
          className="text-lg font-bold text-green-deep"
        />
      }
    >
      <div className="space-y-3 p-4 text-sm">
        <p className="text-muted">
          O saldo paga os anúncios. Cada clique conta uma vez por aparelho a
          cada 24 horas, e robô não conta — o que for barrado aparece no funil e
          não é cobrado.
        </p>
        {dados.recargaPendente ? (
          <div className="space-y-2 rounded-md border border-yellow bg-yellow-soft p-3">
            <p className="font-semibold text-yellow-deep">
              Recarga de{" "}
              <span className="tnum">
                {formatBRL(dados.recargaPendente.valorCents)}
              </span>{" "}
              esperando o Pix
            </p>
            {dados.recargaPendente.pixQr ? (
              <img
                src={dados.recargaPendente.pixQr}
                alt="QR do Pix da recarga"
                className="h-40 w-40"
              />
            ) : null}
            {dados.recargaPendente.pixCopyPaste ? (
              <p className="tnum break-all rounded bg-white px-2 py-1 text-xs">
                {dados.recargaPendente.pixCopyPaste}
              </p>
            ) : null}
            <p className="tnum text-xs text-muted">
              pedido {dados.recargaPendente.codigo} · vale até{" "}
              {new Date(dados.recargaPendente.expiresAt).toLocaleTimeString(
                "pt-BR",
              )}
            </p>
          </div>
        ) : (
          <form
            className="flex flex-wrap items-end gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              setMsg(null);
              recarga.mutate();
            }}
          >
            <label className="block">
              <span className="label-xs">Recarregar (R$)</span>
              <input
                value={valor}
                onChange={(e) => setValor(e.target.value)}
                inputMode="decimal"
                className="tnum mt-1 w-32 rounded-md border border-line-2 px-3 py-2"
              />
            </label>
            <Button
              type="submit"
              disabled={
                !dados.config.ligado ||
                centavos(valor) === null ||
                recarga.isPending
              }
            >
              Gerar Pix
            </Button>
            <span className="w-full text-xs text-muted">
              Mínimo de {formatBRL(dados.config.recargaMinimaCents)}. O Pix vai
              para a conta da plataforma.
            </span>
          </form>
        )}
      </div>
    </Card>
  );
}

/* ------------------------------------------------------------------ *
 * Lado da plataforma
 * ------------------------------------------------------------------ */

function DaPlataformaView({ dados }: { dados: DaPlataforma }) {
  return (
    <div className="space-y-3">
      <Numeros
        t={dados.totais}
        extra={[
          ["Vendido em anúncios", formatBRL(dados.vendidoCents)],
          ["Anúncios vendidos", groupNumber(dados.anunciosVendidos)],
          ["Exibições", groupNumber(dados.totais.exibicoes)],
          ["Cliques barrados", groupNumber(dados.totais.barrados)],
        ]}
      />
      <FilaCard fila={dados.fila} />
      <ReembolsosCard
        reembolsos={dados.reembolsos}
        plataforma
        podePedir={false}
        saldoCents={0}
      />
      <div className="grid gap-3 lg:grid-cols-2">
        <ConfigCard config={dados.config} />
        <SaldosCard organizacoes={dados.organizacoes} />
      </div>
      <div className="grid gap-3 lg:grid-cols-2">
        <GastoReceita serie={dados.serie} />
        <PorEstado estados={dados.porEstado} />
      </div>
    </div>
  );
}

function FilaCard({ fila }: { fila: DaPlataforma["fila"] }) {
  return (
    <Card title="Fila das vitrines">
      {fila.length ? (
        <div className="divide-y divide-line">
          {fila.map((s) => (
            <section key={s.segmento} className="p-4 text-sm">
              <header className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
                <h3 className="font-display font-bold">
                  {nomeDoSegmento(s.segmento)}
                </h3>
                <span className="tnum text-xs text-muted">
                  {s.vagas} vaga(s) · {s.cliquesPorHora.toLocaleString("pt-BR")}{" "}
                  clique(s)/h nas últimas 24 h
                </span>
              </header>
              <ol className="space-y-2">
                {s.anuncios.map((a) => (
                  <li
                    key={a.id}
                    className={`rounded-md border px-3 py-2 ${a.noAr ? "border-green bg-green-soft" : "border-line"}`}
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <Pill status={a.noAr ? "active" : "pending"}>
                        {a.noAr ? "na vitrine" : `${a.posicaoNaFila}º na fila`}
                      </Pill>
                      <span className="min-w-0 flex-1 truncate font-semibold">
                        {a.organizacao}{" "}
                        <span className="font-normal text-muted">
                          · {a.rifa}
                        </span>
                      </span>
                    </div>
                    {a.noAr ? (
                      <div className="mt-2 space-y-1">
                        <Barra usados={a.usados} comprados={a.comprados} />
                        <p className="tnum text-xs text-muted">
                          {groupNumber(a.usados)} de {groupNumber(a.comprados)}{" "}
                          cliques · faltam {groupNumber(a.comprados - a.usados)}{" "}
                          · gasto {formatBRL(a.gastoCents)}
                        </p>
                      </div>
                    ) : (
                      <p className="tnum mt-1 text-xs text-muted">
                        {groupNumber(a.comprados)} cliques comprados ·{" "}
                        {previsao(a)}
                      </p>
                    )}
                  </li>
                ))}
              </ol>
            </section>
          ))}
        </div>
      ) : (
        <Empty>Nenhum anúncio ativo em nenhuma região.</Empty>
      )}
      <p className="border-t border-line px-4 py-2 text-[11px] text-muted">
        A previsão supõe as vagas do segmento recebendo cliques no mesmo ritmo
        das últimas 24 h. Quando o anúncio da vitrine gasta o último clique, o
        1º da fila entra sozinho.
      </p>
    </Card>
  );
}

function ConfigCard({ config }: { config: Config }) {
  const qc = useQueryClient();
  const [ligado, setLigado] = useState(config.ligado);
  const [reembolso, setReembolso] = useState(config.reembolso);
  const [precos, setPrecos] = useState({
    cidade: reais(config.precos.cidade),
    estado: reais(config.precos.estado),
    nacional: reais(config.precos.nacional),
  });
  const [faixas, setFaixas] = useState(
    config.faixas.map((f) => ({
      aPartirDe: String(f.aPartirDe),
      descontoPct: String(f.descontoPct),
    })),
  );
  const [minimo, setMinimo] = useState(String(config.minimoCliques));
  const [vagas, setVagas] = useState({
    cidade: String(config.vagas.cidade),
    estado: String(config.vagas.estado),
    nacional: String(config.vagas.nacional),
  });
  const [recarga, setRecarga] = useState(reais(config.recargaMinimaCents));
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null);
  useEffect(() => setLigado(config.ligado), [config.ligado]);
  useEffect(() => setReembolso(config.reembolso), [config.reembolso]);

  const salvar = useMutation({
    mutationFn: () =>
      apiRequest("PUT", "/api/admin/patrocinio/config", {
        ligado,
        reembolso,
        patrocinio: {
          precos: {
            cidade: centavos(precos.cidade),
            estado: centavos(precos.estado),
            nacional: centavos(precos.nacional),
          },
          faixas: faixas.map(
            (f): FaixaDeDesconto => ({
              aPartirDe: Number(f.aPartirDe),
              descontoPct: Number(f.descontoPct),
            }),
          ),
          minimoCliques: Number(minimo),
          vagas: {
            cidade: Number(vagas.cidade),
            estado: Number(vagas.estado),
            nacional: Number(vagas.nacional),
          },
          recargaMinimaCents: centavos(recarga),
        },
      }),
    onSuccess: () => {
      setMsg({
        ok: true,
        texto: "Salvo. Vale para os anúncios comprados daqui em diante.",
      });
      qc.invalidateQueries({ queryKey: ["/api/admin/patrocinio"] });
    },
    onError: (e: Error) => setMsg({ ok: false, texto: e.message }),
  });
  const campo = "tnum mt-1 w-full rounded-md border border-line-2 px-2 py-2";

  return (
    <Card
      title="Configuração"
      right={
        <Pill status={config.ligado ? "active" : "draft"}>
          {config.ligado ? "ligado" : "desligado"}
        </Pill>
      }
    >
      <div className="space-y-3 p-4 text-sm">
        <Aviso msg={msg} />
        <label className="flex items-start gap-2">
          <input
            type="checkbox"
            checked={ligado}
            onChange={(e) => setLigado(e.target.checked)}
            className="mt-1 h-4 w-4 accent-[var(--green)]"
          />
          <span>
            Rifas patrocinadas por clique
            <span className="block text-xs text-muted">
              Desligado, o bloco some da vitrine, clique não é cobrado e nada se
              compra; saldos e anúncios ficam guardados.
            </span>
          </span>
        </label>
        <label className="flex items-start gap-2">
          <input
            type="checkbox"
            checked={reembolso}
            onChange={(e) => setReembolso(e.target.checked)}
            className="mt-1 h-4 w-4 accent-[var(--green)]"
          />
          <span>
            Mostrar o botão "Pedir reembolso do saldo" ao organizador
            <span className="block text-xs text-muted">
              Desligado, o botão não aparece no painel do organizador (nem se
              fala em reembolso) e o pedido é recusado no servidor. Pedido que
              já existia continua visível até terminar a conversa.
            </span>
          </span>
        </label>
        <div>
          <span className="label-xs">
            Preço do clique (R$) e vagas na vitrine
          </span>
          <div className="mt-1 grid grid-cols-3 gap-2">
            {(Object.keys(ALCANCES) as Alcance[]).map((a) => (
              <div key={a}>
                <span className="text-xs">{ALCANCES[a]}</span>
                <input
                  value={precos[a]}
                  onChange={(e) =>
                    setPrecos({ ...precos, [a]: e.target.value })
                  }
                  inputMode="decimal"
                  aria-label={`Preço do clique: ${ALCANCES[a]}`}
                  className={campo}
                />
                <input
                  value={vagas[a]}
                  onChange={(e) => setVagas({ ...vagas, [a]: e.target.value })}
                  type="number"
                  min={0}
                  max={5}
                  aria-label={`Vagas: ${ALCANCES[a]}`}
                  className={campo}
                />
                <span className="text-[11px] text-muted">vaga(s)</span>
              </div>
            ))}
          </div>
        </div>
        <div>
          <span className="label-xs">Pacotes com desconto</span>
          <ul className="mt-1 space-y-1">
            {faixas.map((f, i) => (
              <li key={i} className="flex items-center gap-2">
                <span className="text-xs">a partir de</span>
                <input
                  value={f.aPartirDe}
                  onChange={(e) =>
                    setFaixas(
                      faixas.map((x, j) =>
                        j === i ? { ...x, aPartirDe: e.target.value } : x,
                      ),
                    )
                  }
                  type="number"
                  aria-label="A partir de quantos cliques"
                  className="tnum w-24 rounded-md border border-line-2 px-2 py-1"
                />
                <span className="text-xs">cliques:</span>
                <input
                  value={f.descontoPct}
                  onChange={(e) =>
                    setFaixas(
                      faixas.map((x, j) =>
                        j === i ? { ...x, descontoPct: e.target.value } : x,
                      ),
                    )
                  }
                  type="number"
                  aria-label="Desconto em %"
                  className="tnum w-16 rounded-md border border-line-2 px-2 py-1"
                />
                <span className="text-xs">%</span>
                <button
                  type="button"
                  onClick={() => setFaixas(faixas.filter((_, j) => j !== i))}
                  className="text-xs text-red underline"
                >
                  tirar
                </button>
              </li>
            ))}
          </ul>
          {faixas.length < 6 ? (
            <button
              type="button"
              onClick={() =>
                setFaixas([...faixas, { aPartirDe: "", descontoPct: "" }])
              }
              className="mt-1 text-xs underline"
            >
              + faixa
            </button>
          ) : null}
        </div>
        <div className="grid grid-cols-2 gap-2">
          <label className="block">
            <span className="label-xs">Mínimo de cliques por anúncio</span>
            <input
              value={minimo}
              onChange={(e) => setMinimo(e.target.value)}
              type="number"
              min={1}
              className={campo}
            />
          </label>
          <label className="block">
            <span className="label-xs">Recarga mínima (R$)</span>
            <input
              value={recarga}
              onChange={(e) => setRecarga(e.target.value)}
              inputMode="decimal"
              className={campo}
            />
          </label>
        </div>
        <Button onClick={() => salvar.mutate()} disabled={salvar.isPending}>
          Salvar
        </Button>
        <p className="text-[11px] text-muted">
          Mudar preço ou desconto não mexe nos anúncios já comprados: cada um
          guarda o preço do dia da compra.
        </p>
      </div>
    </Card>
  );
}

function SaldosCard({
  organizacoes,
}: {
  organizacoes: DaPlataforma["organizacoes"];
}) {
  const qc = useQueryClient();
  const [ajuste, setAjuste] = useState({
    organizationId: "",
    valor: "",
    descricao: "",
  });
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null);
  const ajustar = useMutation({
    mutationFn: () =>
      apiRequest("POST", "/api/admin/patrocinio/ajustes", {
        organizationId: ajuste.organizationId,
        valorCents: centavos(ajuste.valor),
        descricao: ajuste.descricao,
      }),
    onSuccess: () => {
      setAjuste({ organizationId: "", valor: "", descricao: "" });
      setMsg({ ok: true, texto: "Saldo ajustado." });
      qc.invalidateQueries({ queryKey: ["/api/admin/patrocinio"] });
    },
    onError: (e: Error) => setMsg({ ok: false, texto: e.message }),
  });
  return (
    <Card title="Saldo das organizações">
      <ul className="max-h-64 divide-y divide-line overflow-y-auto">
        {organizacoes.map((o) => (
          <li key={o.id} className="flex items-center gap-3 px-4 py-2 text-sm">
            <span className="min-w-0 flex-1 truncate">{o.nome}</span>
            <Money cents={o.saldoCents} />
          </li>
        ))}
      </ul>
      <form
        className="space-y-2 border-t border-line p-4 text-sm"
        onSubmit={(e) => {
          e.preventDefault();
          setMsg(null);
          ajustar.mutate();
        }}
      >
        <Aviso msg={msg} />
        <span className="label-xs">Ajuste de saldo (crédito ou débito)</span>
        <select
          value={ajuste.organizationId}
          onChange={(e) =>
            setAjuste({ ...ajuste, organizationId: e.target.value })
          }
          className="w-full rounded-md border border-line-2 px-2 py-2"
        >
          <option value="">Organização</option>
          {organizacoes.map((o) => (
            <option key={o.id} value={o.id}>
              {o.nome}
            </option>
          ))}
        </select>
        <div className="grid grid-cols-[8rem_1fr] gap-2">
          <input
            value={ajuste.valor}
            onChange={(e) => setAjuste({ ...ajuste, valor: e.target.value })}
            placeholder="-10,00 ou 50,00"
            inputMode="decimal"
            className="tnum rounded-md border border-line-2 px-3 py-2"
          />
          <input
            value={ajuste.descricao}
            onChange={(e) =>
              setAjuste({ ...ajuste, descricao: e.target.value })
            }
            placeholder="Motivo (vai para o extrato)"
            className="rounded-md border border-line-2 px-3 py-2"
          />
        </div>
        <Button
          type="submit"
          variant="ghost"
          disabled={
            !ajuste.organizationId ||
            centavos(ajuste.valor) === null ||
            ajustar.isPending
          }
        >
          Lançar ajuste
        </Button>
      </form>
    </Card>
  );
}
