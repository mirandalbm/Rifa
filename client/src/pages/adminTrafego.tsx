import { BadgeDollarSign, ChartNoAxesCombined, ClipboardList, MousePointerClick } from "lucide-react";
import { useState, type ReactNode } from "react";
import { Link } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { PanelShell } from "@/components/AppShell";
import { Button, Campo, Card, Empty, Money, Pill, Progress } from "@/components/bits";
import { apiRequest } from "@/lib/queryClient";
import { useSession } from "@/lib/session";
import { formatBRL } from "@shared/format";
import { UFS } from "@shared/endereco";
import {
  LISTA_DE_REDES,
  OBSERVACAO_MAX,
  REDES_DE_ANUNCIO,
  SITUACOES_DA_CAMPANHA,
  SITUACOES_EM_ABERTO,
  reservaDoPedido,
  type ConfigTrafegoPago,
  type RedeDeAnuncio,
  type SituacaoDaCampanha,
} from "@shared/trafego";

interface CampanhaDeTrafego {
  id: string;
  organizacao?: string;
  campaignId: string;
  rifa: string;
  redes: RedeDeAnuncio[];
  uf: string | null;
  cidade: string | null;
  observacao: string | null;
  investimentoCents: number;
  verbaDiaCents: number;
  taxaPct: number;
  reservaCents: number;
  gastoCents: number;
  taxaCents: number;
  status: SituacaoDaCampanha;
  motivo: string | null;
  createdAt: string;
  aprovadoEm: string | null;
  encerradoEm: string | null;
  devolvidoCents: number;
  vendas: number;
  receitaCents: number;
  cliques: number;
  codigo: string;
  utmCampanha: string;
  custoPorVendaCents: number | null;
  links?: Partial<Record<RedeDeAnuncio, string>>;
}

interface MesDaMargem {
  mes: string;
  midiaCents: number;
  taxaCents: number;
  organizacoes: { organizacao: string; midiaCents: number; taxaCents: number }[];
}

interface Painel {
  config: ConfigTrafegoPago;
  saldoCents: number | null;
  campanhas: CampanhaDeTrafego[];
  margem?: MesDaMargem[];
}

interface Gasto {
  id: string;
  dia: string;
  rede: RedeDeAnuncio;
  gastoCents: number;
  taxaCents: number;
  cliques: number | null;
  origem: "manual" | "importado";
  lancadoPor: string | null;
}

interface ResumoDaImportacao {
  em: string;
  fonte: string;
  desde: string;
  ate: string;
  importados: number;
  jaLancados: number;
  semCampanha: number;
  foraDaJanela: number;
  verbaEsgotada: number;
  excedenteCents: number;
  ignoradas: Partial<Record<string, number>>;
  erro: string | null;
}

interface Rifa {
  campaign: { id: string; prizeTitle: string; status: string; travadaEm?: string | null; demonstracao?: boolean };
}

const CHAVE = ["/api/admin/trafego"];

/** A situação vai em texto na pílula, nunca só pela cor. */
const TOM: Record<SituacaoDaCampanha, string> = {
  em_analise: "pending",
  ativa: "paid",
  encerrando: "pending",
  encerrada: "closed",
  recusada: "expired",
  cancelada: "closed",
};

const data = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("pt-BR") : "—");
const diaBR = (dia: string) => dia.split("-").reverse().join("/");
const dataEHora = (iso: string) => new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" });
const reais = (cents: number) => (cents / 100).toFixed(2).replace(".", ",");
/** "20,50" → 2050; texto que não é dinheiro vira 0 (o servidor confere de novo). */
const centavos = (texto: string) => {
  const n = Number(texto.replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
};
/** Hoje no fuso de São Paulo, como o servidor confere o dia do gasto. */
const hojeEmSaoPaulo = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
const nomeDoMes = (mes: string) => {
  const [a, m] = mes.split("-").map(Number);
  const t = new Date(Date.UTC(a, m - 1, 15)).toLocaleDateString("pt-BR", { month: "long", year: "numeric", timeZone: "UTC" });
  return t.charAt(0).toUpperCase() + t.slice(1);
};

function Aviso({ msg }: { msg: { ok: boolean; texto: string } | null }) {
  if (!msg) return null;
  return <p className={`rounded-md px-3 py-2 text-sm ${msg.ok ? "bg-green-soft text-green-deep" : "bg-red-soft text-red"}`}>{msg.texto}</p>;
}

/**
 * Tráfego pago (menu Marketing): a plataforma anuncia a rifa no Google, no
 * Meta (Facebook e Instagram) e no TikTok pelas contas dela. A organização
 * pede com o saldo da publicidade (investimento + taxa ficam reservados), a
 * plataforma aprova, monta a campanha e lança o gasto de cada dia, que
 * consome a reserva com a taxa de gestão; o que sobra volta ao saldo no fim.
 * Desligado, a organização vê só como vai funcionar — nunca um botão que
 * não faz nada. O plano está em `docs/PLANO-TRAFEGO-PAGO.md`.
 */
export function AdminTrafego() {
  const { data: sessao } = useSession();
  const plataforma = sessao?.role === "admin";
  const { data: painel, isError } = useQuery<Painel>({ queryKey: CHAVE, retry: false });

  return (
    <PanelShell title="Tráfego pago">
      {isError ? (
        <ComoFunciona />
      ) : !painel ? (
        <p className="text-sm text-muted">Carregando…</p>
      ) : plataforma ? (
        <div className="space-y-3">
          <div className="grid grid-cols-1 gap-3 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
            <div className="min-w-0 space-y-3">
              <ConfigDoTrafego config={painel.config} />
              <ImportacaoDoGasto />
              <Margem meses={painel.margem ?? []} />
            </div>
            <div className="min-w-0">
              <Campanhas painel={painel} plataforma />
            </div>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
          <div className="min-w-0 space-y-3">
            {painel.config.ligado ? (
              <NovaCampanha painel={painel} />
            ) : (
              <Card title="Anunciar uma rifa">
                <p className="px-4 py-3 text-sm text-ink-2">
                  A plataforma não está aceitando pedidos novos agora. As suas campanhas seguem aqui: dá para cancelar o pedido em análise e
                  encerrar a que está no ar, e o que não foi gasto volta ao saldo.
                </p>
              </Card>
            )}
          </div>
          <div className="min-w-0">
            <Campanhas painel={painel} plataforma={false} />
          </div>
        </div>
      )}
    </PanelShell>
  );
}

/** O que a organização vê enquanto a plataforma não liga o produto. */
function ComoFunciona() {
  return (
    <div className="space-y-3">
      <Card
        title="Anúncios da sua rifa no Google, no Instagram e no TikTok"
        right={
          <span className="shrink-0 whitespace-nowrap">
            <Pill status="pending">Em breve</Pill>
          </span>
        }
      >
        <p className="px-4 py-3 text-sm text-ink-2">
          Você escolhe a rifa e quanto quer investir; a plataforma monta a campanha, acompanha todo dia e mostra quanto gastou e quantas
          vendas o anúncio trouxe. Você paga o que for gasto mais uma taxa de gestão, do mesmo saldo da publicidade. Quando a plataforma
          liberar, o pedido aparece aqui.
        </p>
      </Card>
      <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Passo icone={<ClipboardList size={18} />} titulo="Pedido">
          Rifa publicada, valor total e por dia, onde anunciar e para que região. O valor fica reservado no saldo.
        </Passo>
        <Passo icone={<MousePointerClick size={18} />} titulo="Campanha">
          A plataforma monta o anúncio com as artes e o vídeo da própria rifa e confere as regras de cada rede.
        </Passo>
        <Passo icone={<BadgeDollarSign size={18} />} titulo="Cobrança">
          Do saldo sai o que foi gasto no dia mais a taxa — nunca além do reservado. Encerrou, o que sobrou volta ao saldo.
        </Passo>
        <Passo icone={<ChartNoAxesCombined size={18} />} titulo="Resultado">
          Gasto, vendas e custo por venda. A venda atribuída ao anúncio é estimativa e a tela diz isso.
        </Passo>
      </ul>
    </div>
  );
}

function Passo({ icone, titulo, children }: { icone: ReactNode; titulo: string; children: ReactNode }) {
  return (
    <li className="cartao space-y-1 rounded-lg border border-line bg-white p-3">
      <span className="flex items-center gap-2 text-sm font-semibold text-ink">
        <span className="text-green-deep" aria-hidden>
          {icone}
        </span>
        {titulo}
      </span>
      <p className="text-xs text-ink-2">{children}</p>
    </li>
  );
}

/* ------------------------------------------------------------------ *
 * Organização: pedir
 * ------------------------------------------------------------------ */

function NovaCampanha({ painel }: { painel: Painel }) {
  const qc = useQueryClient();
  const { config, saldoCents } = painel;
  const { data: campanhas = [] } = useQuery<Rifa[]>({ queryKey: ["/api/admin/campaigns"] });
  const abertas = new Set(painel.campanhas.filter((c) => SITUACOES_EM_ABERTO.includes(c.status)).map((c) => c.campaignId));
  const rifas = campanhas.filter(
    (c) => c.campaign.status === "published" && !c.campaign.travadaEm && !c.campaign.demonstracao && !abertas.has(c.campaign.id),
  );

  const [campaignId, setCampaignId] = useState("");
  const [redes, setRedes] = useState<RedeDeAnuncio[]>(config.redes.length === 1 ? [...config.redes] : []);
  const [investimento, setInvestimento] = useState(reais(config.investimentoMinCents));
  const [verbaDia, setVerbaDia] = useState(reais(config.verbaDiaMinCents));
  const [uf, setUf] = useState("");
  const [cidade, setCidade] = useState("");
  const [observacao, setObservacao] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null);

  const investimentoCents = centavos(investimento);
  const reserva = investimentoCents > 0 ? reservaDoPedido(investimentoCents, config.taxaPct) : 0;
  const faltaSaldo = reserva > (saldoCents ?? 0);
  const dias = centavos(verbaDia) > 0 ? Math.ceil(investimentoCents / centavos(verbaDia)) : null;

  const pedir = useMutation({
    mutationFn: () =>
      apiRequest("POST", "/api/admin/trafego/campanhas", {
        campaignId,
        redes,
        investimentoCents,
        verbaDiaCents: centavos(verbaDia),
        uf: uf || null,
        cidade: cidade.trim() || null,
        observacao: observacao.trim() || null,
      }),
    onSuccess: () => {
      setCampaignId("");
      setObservacao("");
      setMsg({ ok: true, texto: "Pedido enviado. O valor ficou reservado no saldo até a plataforma aprovar a campanha." });
      qc.invalidateQueries({ queryKey: CHAVE });
    },
    onError: (e: Error) => setMsg({ ok: false, texto: e.message }),
  });

  return (
    <Card title="Anunciar uma rifa">
      <form
        className="space-y-3 p-4 text-sm"
        onSubmit={(e) => {
          e.preventDefault();
          setMsg(null);
          pedir.mutate();
        }}
      >
        <p className="text-xs text-muted">
          A plataforma monta a campanha nas contas de anúncio dela, com as artes e o vídeo da sua rifa, e acompanha todo dia. Do saldo sai o
          que for gasto em mídia mais <span className="tnum">{config.taxaPct}%</span> de taxa de gestão sobre esse gasto — nunca além do
          reservado.
        </p>

        <Campo rotulo="Rifa" dica="Só rifa no ar, e uma campanha aberta por rifa.">
          <select value={campaignId} onChange={(e) => setCampaignId(e.target.value)}>
            <option value="">Escolha…</option>
            {rifas.map((c) => (
              <option key={c.campaign.id} value={c.campaign.id}>
                {c.campaign.prizeTitle}
              </option>
            ))}
          </select>
        </Campo>

        <fieldset className="space-y-1">
          <legend className="label-xs">Onde anunciar</legend>
          {config.redes.map((r) => (
            <label key={r} className="flex items-center gap-2">
              <input
                type="checkbox"
                className="h-4 w-4"
                checked={redes.includes(r)}
                onChange={(e) => setRedes((atual) => (e.target.checked ? [...atual, r] : atual.filter((x) => x !== r)))}
              />
              {REDES_DE_ANUNCIO[r]}
            </label>
          ))}
        </fieldset>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Campo
            rotulo="Investimento em mídia (R$)"
            dica={
              <>
                Mínimo <span className="tnum">{formatBRL(config.investimentoMinCents)}</span>.
              </>
            }
          >
            <input inputMode="decimal" value={investimento} onChange={(e) => setInvestimento(e.target.value)} />
          </Campo>
          <Campo
            rotulo="Por dia (R$)"
            dica={
              <>
                Mínimo <span className="tnum">{formatBRL(config.verbaDiaMinCents)}</span>
                {dias ? (
                  <>
                    {" "}
                    · cerca de <span className="tnum">{dias}</span> dia(s)
                  </>
                ) : null}
                .
              </>
            }
          >
            <input inputMode="decimal" value={verbaDia} onChange={(e) => setVerbaDia(e.target.value)} />
          </Campo>
          <Campo rotulo="Estado (opcional)" dica="Sem estado, o Brasil todo.">
            <select value={uf} onChange={(e) => setUf(e.target.value)}>
              <option value="">Brasil todo</option>
              {Object.entries(UFS).map(([sigla, nome]) => (
                <option key={sigla} value={sigla}>
                  {nome}
                </option>
              ))}
            </select>
          </Campo>
          <Campo rotulo="Cidade (opcional)" dica="Só com o estado escolhido.">
            <input value={cidade} disabled={!uf} maxLength={60} onChange={(e) => setCidade(e.target.value)} />
          </Campo>
        </div>

        <Campo rotulo="Observação para quem monta a campanha (opcional)" dica="Público, horário, o que destacar. Sem link nem telefone.">
          <textarea rows={3} maxLength={OBSERVACAO_MAX} value={observacao} onChange={(e) => setObservacao(e.target.value)} />
        </Campo>

        <dl className="space-y-1 rounded-md bg-mist px-3 py-2">
          <div className="flex items-center justify-between">
            <dt className="text-muted">Mídia</dt>
            <dd className="tnum">{formatBRL(investimentoCents)}</dd>
          </div>
          <div className="flex items-center justify-between">
            <dt className="text-muted">
              Taxa de gestão (<span className="tnum">{config.taxaPct}%</span>, se gastar tudo)
            </dt>
            <dd className="tnum">{formatBRL(reserva - investimentoCents)}</dd>
          </div>
          <div className="flex items-center justify-between font-semibold">
            <dt>Fica reservado</dt>
            <dd className="tnum">{formatBRL(reserva)}</dd>
          </div>
        </dl>
        <p className={`text-xs ${faltaSaldo ? "text-red" : "text-muted"}`}>
          Seu saldo: <Money cents={saldoCents ?? 0} />.{" "}
          {faltaSaldo ? (
            <>
              Falta saldo para este pedido.{" "}
              <Link href="/admin/marketing/publicidade?aba=patrocinadas" className="font-semibold underline">
                Recarregar
              </Link>
            </>
          ) : null}
        </p>
        <p className="text-xs text-muted">
          Recusado ou cancelado antes de ir ao ar, tudo volta ao saldo. Encerrada a campanha (por você ou porque a rifa saiu do ar), a
          plataforma lança os últimos dias que a rede cobrou e fecha a conta; aí o que não foi gasto volta como crédito. Acabou a verba, a
          sobra volta na hora.
        </p>

        <Aviso msg={msg} />
        <Button type="submit" disabled={!campaignId || redes.length === 0 || investimentoCents <= 0 || faltaSaldo || pedir.isPending}>
          {pedir.isPending ? "Enviando…" : "Pedir campanha"}
        </Button>
      </form>
    </Card>
  );
}

/* ------------------------------------------------------------------ *
 * Plataforma: tabela
 * ------------------------------------------------------------------ */

function ConfigDoTrafego({ config: c }: { config: ConfigTrafegoPago }) {
  const qc = useQueryClient();
  const [ligado, setLigado] = useState(c.ligado);
  const [taxa, setTaxa] = useState(String(c.taxaPct));
  const [minimo, setMinimo] = useState(reais(c.investimentoMinCents));
  const [porDia, setPorDia] = useState(reais(c.verbaDiaMinCents));
  const [redes, setRedes] = useState<RedeDeAnuncio[]>(c.redes);
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null);

  const salvar = useMutation({
    mutationFn: () =>
      apiRequest("PUT", "/api/admin/trafego/config", {
        ligado,
        taxaPct: Number(taxa),
        investimentoMinCents: centavos(minimo),
        verbaDiaMinCents: centavos(porDia),
        redes,
      }),
    onSuccess: () => {
      setMsg({ ok: true, texto: "Salvo." });
      qc.invalidateQueries({ queryKey: CHAVE });
    },
    onError: (e: Error) => setMsg({ ok: false, texto: e.message }),
  });

  return (
    <Card title="Taxa e mínimos">
      <form
        className="space-y-3 p-4 text-sm"
        onSubmit={(e) => {
          e.preventDefault();
          setMsg(null);
          salvar.mutate();
        }}
      >
        <label className="flex items-start gap-2">
          <input type="checkbox" checked={ligado} onChange={(e) => setLigado(e.target.checked)} className="mt-1 h-4 w-4" />
          <span>
            <span className="font-semibold">Oferecer tráfego pago às organizações</span>
            <span className="block text-xs text-muted">
              Desligado, elas só veem como vai funcionar e não pedem campanha nova. As que estão no ar seguem até alguém encerrar.
            </span>
          </span>
        </label>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Campo rotulo="Taxa de gestão (%)" dica="Sobre o gasto em mídia.">
            <input type="number" inputMode="numeric" min={0} max={100} value={taxa} onChange={(e) => setTaxa(e.target.value)} />
          </Campo>
          <Campo rotulo="Investimento mínimo (R$)">
            <input inputMode="decimal" value={minimo} onChange={(e) => setMinimo(e.target.value)} />
          </Campo>
          <Campo rotulo="Mínimo por dia (R$)">
            <input inputMode="decimal" value={porDia} onChange={(e) => setPorDia(e.target.value)} />
          </Campo>
        </div>
        <fieldset className="space-y-1">
          <legend className="label-xs">Redes com conta pronta</legend>
          {LISTA_DE_REDES.map((r) => (
            <label key={r} className="flex items-center gap-2">
              <input
                type="checkbox"
                className="h-4 w-4"
                checked={redes.includes(r)}
                onChange={(e) => setRedes((atual) => (e.target.checked ? [...atual, r] : atual.filter((x) => x !== r)))}
              />
              {REDES_DE_ANUNCIO[r]}
            </label>
          ))}
        </fieldset>
        <p className="text-xs text-muted">
          A taxa é fotografada em cada pedido: mudar aqui não mexe nas campanhas já pedidas. Ligue só as redes em que a conta de anúncios
          da plataforma aceita rifa autorizada.
        </p>
        <Aviso msg={msg} />
        <Button type="submit" disabled={salvar.isPending}>
          {salvar.isPending ? "Salvando…" : "Salvar"}
        </Button>
      </form>
    </Card>
  );
}

const IGNORADAS: Record<string, string> = {
  sem_codigo: "sem o código no nome",
  rede: "de rede desconhecida",
  data: "fora da janela de dias",
  valor: "com número inválido",
};

/**
 * Fase 2: o gasto dos dias fechados vem das redes pelo Windsor.ai, de hora em
 * hora, pela mesma régua do lançamento à mão. Sem a chave no servidor, diz
 * isso e o lançamento à mão segue valendo.
 */
function ImportacaoDoGasto() {
  const qc = useQueryClient();
  const { data } = useQuery<{ ligada: boolean; ultima: ResumoDaImportacao | null }>({ queryKey: ["/api/admin/trafego/importacao"] });
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null);
  const importar = useMutation({
    mutationFn: async () => (await apiRequest("POST", "/api/admin/trafego/importacao", {})).json() as Promise<ResumoDaImportacao>,
    onSuccess: (r) => {
      setMsg(r.erro ? { ok: false, texto: r.erro } : { ok: true, texto: `${r.importados} gasto(s) importado(s).` });
      qc.invalidateQueries({ queryKey: ["/api/admin/trafego/importacao"] });
      qc.invalidateQueries({ queryKey: CHAVE });
    },
    onError: (e: Error) => setMsg({ ok: false, texto: e.message }),
  });
  const u = data?.ultima ?? null;
  const ignoradas = u ? Object.entries(u.ignoradas).filter(([, n]) => (n ?? 0) > 0) : [];
  return (
    <Card title="Gasto importado das redes">
      <div className="space-y-2 px-4 py-3 text-sm">
        {!data ? (
          <p className="text-muted">Carregando…</p>
        ) : !data.ligada ? (
          <p className="text-ink-2">
            Desligada: falta a chave <code className="rounded bg-mist px-1 font-mono text-[11px]">WINDSOR_API_KEY</code> no servidor. O gasto
            segue sendo lançado à mão em cada campanha.
          </p>
        ) : (
          <>
            <p className="text-ink-2">
              De hora em hora, o gasto e os cliques dos dias já fechados (até 3 dias atrás) vêm do Google, do Meta e do TikTok pelo
              Windsor.ai. A campanha é achada pelo código <code className="font-mono text-[11px]">trafego-…</code> no nome dela na rede, e o
              dia já lançado fica como está.
            </p>
            {u ? (
              <div className="space-y-1 rounded-md bg-mist px-3 py-2 text-xs">
                <p>
                  Última volta: <span className="tnum">{dataEHora(u.em)}</span> · dias <span className="tnum">{diaBR(u.desde)}</span> a{" "}
                  <span className="tnum">{diaBR(u.ate)}</span>
                </p>
                <p>
                  <span className="tnum">{u.importados}</span> importado(s) · <span className="tnum">{u.jaLancados}</span> já lançado(s) ·{" "}
                  <span className="tnum">{u.semCampanha}</span> sem campanha no ar · <span className="tnum">{u.foraDaJanela}</span> fora da
                  campanha
                </p>
                {ignoradas.length ? (
                  <p className="text-muted">
                    Linhas ignoradas: {ignoradas.map(([m, n]) => `${n} ${IGNORADAS[m] ?? m}`).join(", ")}.
                  </p>
                ) : null}
                {u.excedenteCents > 0 ? (
                  <p className="text-red">
                    A rede gastou <Money cents={u.excedenteCents} /> além da verba: a organização não paga esse valor. Confira o orçamento na
                    rede.
                  </p>
                ) : null}
                {u.erro ? <p className="text-red">{u.erro}</p> : null}
              </div>
            ) : (
              <p className="text-xs text-muted">Ainda não houve importação.</p>
            )}
            <Aviso msg={msg} />
            <Button
              variant="ghost"
              disabled={importar.isPending}
              onClick={() => {
                setMsg(null);
                importar.mutate();
              }}
            >
              {importar.isPending ? "Importando…" : "Importar agora"}
            </Button>
          </>
        )}
      </div>
    </Card>
  );
}

function Margem({ meses }: { meses: MesDaMargem[] }) {
  return (
    <Card title="Margem por mês">
      {meses.length === 0 ? (
        <Empty>Nenhum gasto lançado nos últimos 12 meses.</Empty>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <caption className="sr-only">Gasto em mídia e taxa de gestão por mês e por organização</caption>
            <thead>
              <tr className="border-b border-line text-left text-xs text-muted">
                <th scope="col" className="px-4 py-2 font-medium">
                  Mês
                </th>
                <th scope="col" className="px-4 py-2 text-right font-medium">
                  Mídia
                </th>
                <th scope="col" className="px-4 py-2 text-right font-medium">
                  Taxa (margem)
                </th>
              </tr>
            </thead>
            <tbody>
              {meses.map((m) => (
                <MesDaTabela key={m.mes} mes={m} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

function MesDaTabela({ mes: m }: { mes: MesDaMargem }) {
  return (
    <>
      <tr className="border-b border-line font-semibold">
        <th scope="row" className="px-4 py-2 text-left">
          {nomeDoMes(m.mes)}
        </th>
        <td className="px-4 py-2 text-right">
          <Money cents={m.midiaCents} />
        </td>
        <td className="px-4 py-2 text-right text-green-deep">
          <Money cents={m.taxaCents} />
        </td>
      </tr>
      {m.organizacoes.map((o) => (
        <tr key={o.organizacao} className="border-b border-line text-xs text-ink-2">
          <th scope="row" className="truncate px-4 py-1 pl-8 text-left font-normal">
            {o.organizacao}
          </th>
          <td className="px-4 py-1 text-right">
            <Money cents={o.midiaCents} />
          </td>
          <td className="px-4 py-1 text-right">
            <Money cents={o.taxaCents} />
          </td>
        </tr>
      ))}
    </>
  );
}

/* ------------------------------------------------------------------ *
 * As campanhas (os dois recortes)
 * ------------------------------------------------------------------ */

function Campanhas({ painel, plataforma }: { painel: Painel; plataforma: boolean }) {
  const { campanhas } = painel;
  const fila = campanhas.filter((c) => c.status === "em_analise");
  const ativas = campanhas.filter((c) => c.status === "ativa");
  const fechando = campanhas.filter((c) => c.status === "encerrando");
  const outras = campanhas.filter((c) => !SITUACOES_EM_ABERTO.includes(c.status));
  const grupos = plataforma
    ? [
        { titulo: "Esperando aprovação", lista: fila },
        { titulo: "No ar", lista: ativas },
        { titulo: "Fechando a conta", lista: fechando },
        { titulo: "Encerradas", lista: outras },
      ]
    : [{ titulo: "Minhas campanhas", lista: campanhas }];

  return (
    <div className="space-y-3">
      {grupos.map((g) => (
        <Card key={g.titulo} title={g.titulo} right={<span className="tnum text-xs text-muted">{g.lista.length}</span>}>
          {g.lista.length === 0 ? <Empty>Nenhuma campanha aqui.</Empty> : null}
          <ul className="divide-y divide-line">
            {g.lista.map((c) => (
              <CartaoDaCampanha key={c.id} c={c} plataforma={plataforma} />
            ))}
          </ul>
        </Card>
      ))}
      <p className="px-1 text-xs text-muted">
        Vendas pelo anúncio: as compras pagas que chegaram pelo link da campanha. É estimativa — quem viu o anúncio e voltou depois por
        outro caminho, ou trocou de aparelho, não aparece aqui.
      </p>
    </div>
  );
}

function CartaoDaCampanha({ c, plataforma }: { c: CampanhaDeTrafego; plataforma: boolean }) {
  const qc = useQueryClient();
  const [erro, setErro] = useState<string | null>(null);
  const [verGastos, setVerGastos] = useState(false);
  const recarregar = () => {
    qc.invalidateQueries({ queryKey: CHAVE });
    qc.invalidateQueries({ queryKey: [`/api/admin/trafego/campanhas/${c.id}/gastos`] });
  };
  const falhou = (e: Error) => setErro(e.message);

  const cancelar = useMutation({
    mutationFn: () => apiRequest("POST", `/api/admin/trafego/campanhas/${c.id}/cancelar`),
    onSuccess: recarregar,
    onError: falhou,
  });
  const encerrar = useMutation({
    mutationFn: () => apiRequest("POST", `/api/admin/trafego/campanhas/${c.id}/encerrar`),
    onSuccess: recarregar,
    onError: falhou,
  });
  const fechar = useMutation({
    mutationFn: () => apiRequest("POST", `/api/admin/trafego/campanhas/${c.id}/fechar`),
    onSuccess: recarregar,
    onError: falhou,
  });
  const decidir = useMutation({
    mutationFn: (p: { aprovar: boolean; motivo?: string }) => apiRequest("POST", `/api/admin/trafego/campanhas/${c.id}/decisao`, p),
    onSuccess: recarregar,
    onError: falhou,
  });

  const regiao = c.cidade ? `${c.cidade}/${c.uf}` : c.uf ? UFS[c.uf as keyof typeof UFS] : "Brasil todo";
  const total = c.gastoCents + c.taxaCents;

  return (
    <li className="space-y-2 p-4 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <Pill status={TOM[c.status]}>{SITUACOES_DA_CAMPANHA[c.status]}</Pill>
        <span className="tnum text-xs text-muted">{data(c.createdAt)}</span>
        <span className="font-mono text-[11px] text-muted">#{c.codigo}</span>
      </div>
      <p className="min-w-0 truncate font-semibold">{c.rifa}</p>
      {plataforma && c.organizacao ? <p className="truncate text-xs text-muted">{c.organizacao}</p> : null}
      <p className="text-xs text-ink-2">
        {c.redes.map((r) => REDES_DE_ANUNCIO[r]).join(", ")} · {regiao} · <Money cents={c.verbaDiaCents} /> por dia · taxa{" "}
        <span className="tnum">{c.taxaPct}%</span>
      </p>

      <div className="space-y-1">
        <div className="flex items-center justify-between text-xs">
          <span className="text-muted">Gasto em mídia</span>
          <span>
            <Money cents={c.gastoCents} /> de <Money cents={c.investimentoCents} />
          </span>
        </div>
        <Progress value={c.gastoCents} total={c.investimentoCents} />
      </div>

      <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs sm:grid-cols-4">
        <div>
          <dt className="text-muted">Taxa cobrada</dt>
          <dd>
            <Money cents={c.taxaCents} />
          </dd>
        </div>
        <div>
          <dt className="text-muted">Total debitado</dt>
          <dd>
            <Money cents={total} />
          </dd>
        </div>
        <div>
          <dt className="text-muted">Vendas pelo anúncio</dt>
          <dd className="tnum">
            {c.vendas} · <Money cents={c.receitaCents} />
          </dd>
        </div>
        <div>
          <dt className="text-muted">Custo por venda</dt>
          <dd>{c.custoPorVendaCents === null ? "—" : <Money cents={c.custoPorVendaCents} />}</dd>
        </div>
        <div>
          <dt className="text-muted">Cliques na rede</dt>
          <dd className="tnum">{c.cliques}</dd>
        </div>
      </dl>

      {c.status === "encerrando" ? (
        <p className="text-xs text-ink-2">
          Parada em <span className="tnum">{data(c.encerradoEm)}</span>. A plataforma lança os últimos dias que a rede cobrou e fecha a
          conta; aí o que não foi gasto volta ao saldo.
        </p>
      ) : null}
      {c.status === "ativa" || c.status === "encerrando" ? (
        <p className="text-xs text-muted">
          Reservado: <Money cents={c.reservaCents} /> · ainda pode ser debitado <Money cents={c.reservaCents - total} />.
        </p>
      ) : null}
      {c.devolvidoCents > 0 ? (
        <p className="text-xs text-muted">
          Voltou ao saldo: <Money cents={c.devolvidoCents} />.
        </p>
      ) : null}
      {c.motivo && c.status === "recusada" ? <p className="text-xs text-red">Motivo: {c.motivo}</p> : null}
      {c.observacao ? (
        <p className="rounded-md bg-mist px-3 py-2 text-xs text-ink-2">
          <span className="font-semibold">Observação: </span>
          {c.observacao}
        </p>
      ) : null}

      {plataforma && c.status === "ativa" && c.links ? <LinksDosAnuncios links={c.links} utm={c.utmCampanha} /> : null}

      {erro ? <p className="rounded-md bg-red-soft px-3 py-2 text-xs text-red">{erro}</p> : null}

      <div className="flex flex-wrap gap-2">
        {c.status === "em_analise" && !plataforma ? (
          <Button
            variant="ghost"
            disabled={cancelar.isPending}
            onClick={() => {
              setErro(null);
              if (window.confirm("Cancelar este pedido? O valor reservado volta ao saldo.")) cancelar.mutate();
            }}
          >
            Cancelar pedido
          </Button>
        ) : null}
        {c.status === "ativa" ? (
          <Button
            variant="ghost"
            disabled={encerrar.isPending}
            onClick={() => {
              setErro(null);
              if (
                window.confirm(
                  "Encerrar a campanha? Ela para agora; a plataforma lança os últimos dias que a rede cobrou e o que não foi gasto volta ao saldo.",
                )
              )
                encerrar.mutate();
            }}
          >
            Encerrar campanha
          </Button>
        ) : null}
        {plataforma && c.status === "encerrando" ? (
          <Button
            disabled={fechar.isPending}
            onClick={() => {
              setErro(null);
              if (window.confirm("Fechar a conta? Confira antes que todos os dias até a parada foram lançados: depois disso, nenhum gasto entra.")) fechar.mutate();
            }}
          >
            Fechar a conta
          </Button>
        ) : null}
        {c.gastoCents > 0 || c.status === "ativa" || c.status === "encerrando" ? (
          <Button variant="ghost" aria-expanded={verGastos} onClick={() => setVerGastos((v) => !v)}>
            {verGastos ? "Esconder gastos por dia" : "Gastos por dia"}
          </Button>
        ) : null}
      </div>

      {c.status === "em_analise" && plataforma ? (
        <Decisao rifa={c.rifa} ocupado={decidir.isPending} onDecidir={(aprovar, motivo) => decidir.mutate({ aprovar, motivo })} />
      ) : null}
      {plataforma && (c.status === "ativa" || c.status === "encerrando") ? <LancarGasto c={c} aoLancar={recarregar} /> : null}
      {verGastos ? <GastosDaCampanha id={c.id} plataforma={plataforma} /> : null}
    </li>
  );
}

function LinksDosAnuncios({ links, utm }: { links: Partial<Record<RedeDeAnuncio, string>>; utm: string }) {
  const [copiado, setCopiado] = useState<string | null>(null);
  return (
    <div className="space-y-1">
      <p className="text-xs text-ink-2">
        Ponha <code className="rounded bg-mist px-1 font-mono text-[11px]">{utm}</code> no nome da campanha em cada rede: é por ele que o
        gasto do dia é importado.
      </p>
      <span className="label-xs">Link do anúncio (com a UTM da campanha)</span>
      {(Object.entries(links) as [RedeDeAnuncio, string][]).map(([rede, link]) => (
        <div key={rede} className="flex items-center gap-2">
          <span className="w-28 shrink-0 text-xs text-muted">{REDES_DE_ANUNCIO[rede]}</span>
          <code className="min-w-0 flex-1 truncate rounded bg-mist px-2 py-1 text-[11px]">{link}</code>
          <Button
            variant="ghost"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(link);
                setCopiado(rede);
              } catch {
                setCopiado(null);
              }
            }}
          >
            {copiado === rede ? "Copiado" : "Copiar"}
            <span className="sr-only"> o link de {REDES_DE_ANUNCIO[rede]}</span>
          </Button>
        </div>
      ))}
    </div>
  );
}

function LancarGasto({ c, aoLancar }: { c: CampanhaDeTrafego; aoLancar: () => void }) {
  // Fechando a conta, só os dias até a parada.
  const ultimoDia =
    c.status === "encerrando" && c.encerradoEm
      ? new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date(c.encerradoEm))
      : hojeEmSaoPaulo();
  const [dia, setDia] = useState(ultimoDia);
  const [rede, setRede] = useState<RedeDeAnuncio>(c.redes[0]);
  const [valor, setValor] = useState("");
  const [cliques, setCliques] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null);
  const gasto = centavos(valor);
  const taxa = Math.floor((gasto * c.taxaPct) / 100);

  const lancar = useMutation({
    mutationFn: () => apiRequest("POST", `/api/admin/trafego/campanhas/${c.id}/gastos`, { dia, rede, gastoCents: gasto, cliques: cliques.trim() === "" ? null : Number(cliques) }),
    onSuccess: () => {
      setValor("");
      setCliques("");
      setMsg({ ok: true, texto: "Gasto lançado e debitado da reserva." });
      aoLancar();
    },
    onError: (e: Error) => setMsg({ ok: false, texto: e.message }),
  });

  return (
    <form
      className="space-y-2 rounded-md border border-line p-3"
      onSubmit={(e) => {
        e.preventDefault();
        setMsg(null);
        lancar.mutate();
      }}
    >
      <p className="text-xs font-semibold">Lançar o gasto de um dia (do painel da rede)</p>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-4">
        <Campo rotulo="Dia">
          <input type="date" value={dia} max={ultimoDia} onChange={(e) => setDia(e.target.value)} />
        </Campo>
        <Campo rotulo="Rede">
          <select value={rede} onChange={(e) => setRede(e.target.value as RedeDeAnuncio)}>
            {c.redes.map((r) => (
              <option key={r} value={r}>
                {REDES_DE_ANUNCIO[r]}
              </option>
            ))}
          </select>
        </Campo>
        <Campo rotulo="Gasto (R$)">
          <input inputMode="decimal" value={valor} onChange={(e) => setValor(e.target.value)} />
        </Campo>
        <Campo rotulo="Cliques (opcional)">
          <input inputMode="numeric" value={cliques} onChange={(e) => setCliques(e.target.value.replace(/\D/g, ""))} />
        </Campo>
      </div>
      <p className="text-xs text-muted">
        Debita <Money cents={gasto} /> + <Money cents={taxa} /> de taxa. Resta de verba <Money cents={c.investimentoCents - c.gastoCents} />
        ; um lançamento por dia e rede.
      </p>
      <Aviso msg={msg} />
      <Button type="submit" disabled={gasto <= 0 || lancar.isPending}>
        {lancar.isPending ? "Lançando…" : "Lançar gasto"}
      </Button>
    </form>
  );
}

function GastosDaCampanha({ id, plataforma }: { id: string; plataforma: boolean }) {
  const { data: gastos, isError } = useQuery<Gasto[]>({ queryKey: [`/api/admin/trafego/campanhas/${id}/gastos`] });
  if (isError) return <p className="text-xs text-red">Não deu para carregar os gastos.</p>;
  if (!gastos) return <p className="text-xs text-muted">Carregando…</p>;
  if (gastos.length === 0) return <p className="text-xs text-muted">Nenhum gasto lançado ainda.</p>;
  return (
    <ul className="divide-y divide-line rounded-md border border-line text-xs">
      {gastos.map((g) => (
        <li key={g.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
          <span>
            <span className="tnum">{diaBR(g.dia)}</span> · {REDES_DE_ANUNCIO[g.rede]}
            {g.origem === "importado" ? <span className="text-muted"> · importado da rede</span> : null}
            {plataforma && g.lancadoPor ? <span className="text-muted"> · {g.lancadoPor}</span> : null}
          </span>
          <span>
            <Money cents={g.gastoCents} /> + <Money cents={g.taxaCents} /> de taxa
            {g.cliques !== null ? (
              <span className="text-muted">
                {" "}
                · <span className="tnum">{g.cliques}</span> cliques
              </span>
            ) : null}
          </span>
        </li>
      ))}
    </ul>
  );
}

function Decisao({ rifa, ocupado, onDecidir }: { rifa: string; ocupado: boolean; onDecidir: (aprovar: boolean, motivo?: string) => void }) {
  const [recusando, setRecusando] = useState(false);
  const [motivo, setMotivo] = useState("");
  if (!recusando) {
    return (
      <div className="flex flex-wrap gap-2">
        <Button disabled={ocupado} onClick={() => onDecidir(true)}>
          Aprovar e pôr no ar
        </Button>
        <Button variant="ghost" disabled={ocupado} onClick={() => setRecusando(true)}>
          Recusar…
        </Button>
      </div>
    );
  }
  return (
    <div className="space-y-2">
      <Campo rotulo={`Motivo da recusa — ${rifa}`} dica="A organização lê isto. Tudo o que foi reservado volta ao saldo dela.">
        <textarea rows={3} value={motivo} onChange={(e) => setMotivo(e.target.value)} />
      </Campo>
      <div className="flex flex-wrap gap-2">
        <Button disabled={ocupado || motivo.trim().length < 10} onClick={() => onDecidir(false, motivo)}>
          Recusar e devolver
        </Button>
        <Button variant="ghost" onClick={() => setRecusando(false)}>
          Voltar
        </Button>
      </div>
    </div>
  );
}
