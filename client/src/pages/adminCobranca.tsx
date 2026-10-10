import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { PanelShell } from "@/components/AppShell";
import { Card, Button, Pill, Empty, Money, Kpi, Campo } from "@/components/bits";
import { TabelaOuCartoes, VerMais } from "@/components/painel";
import { RetencoesCautelares } from "@/components/RetencoesCautelares";
import { useListaPaginada } from "@/lib/paginada";
import { apiRequest } from "@/lib/queryClient";
import { useSession } from "@/lib/session";
import { formatBRL } from "@shared/format";
import {
  FAIXAS_PIX_MAX,
  NOME_DO_MODO,
  PERCENTUAL_MAX,
  PIX_PCT_MAX,
  POR_COTA_MAX_CENTS,
  textoDaFaixa,
  textoPct,
  dataDaVigencia,
  type ConfigCobranca,
  type FaixaPix,
  type TabelaAgendada,
  type TabelasDaCobranca,
} from "@shared/cobranca";

interface LinhaCarteira {
  organizationId: string;
  name: string;
  active: boolean;
  abertoCents: number;
  pagoCents: number;
  retidaCents: number;
  lancamentos: number;
  /** O que a plataforma deve à organização: a parte dela nos presentes. */
  creditoCents: number;
}

interface Extrato {
  tabela: ConfigCobranca;
  /** A tabela agendada que ainda não vale (cláusula X.3). */
  proxima: TabelaAgendada | null;
  totais: { abertoCents: number; pagoCents: number; retidaCents: number };
  creditos: { devidoCents: number; pagoCents: number };
  linhas: {
    charge: {
      id: string;
      kind: "venda" | "mensalidade";
      amountCents: number;
      vendaCents: number;
      pixCents: number;
      modo: string | null;
      /** Percentual da venda em pontos-base (1% = 100), no modo percentual. */
      pct: number | null;
      status: string;
      createdAt: string;
    };
    orderCode: number | null;
    pedidoStatus: string | null;
    campanha: string | null;
  }[];
}

/**
 * Cobrança da plataforma.
 *
 * Mesma tela, dois lados. O administrador geral vê a tabela de cobrança (o
 * percentual sobre a venda, o valor por cota e as faixas da taxa Pix) e a
 * carteira: quanto cada organização deve. O organizador vê a tabela e a conta
 * dele — cobrar sem mostrar de onde veio cada lançamento seria indefensável.
 * Quem escolhe percentual ou por cota é a organização, rifa a rifa.
 */
type LinhaDoExtrato = Extrato["linhas"][number];

function DeOndeVeio({ l }: { l: LinhaDoExtrato }) {
  const c = l.charge;
  return (
    <>
      Venda do pedido <span className="tnum">{l.orderCode}</span>
      {c.modo === "percentual" && c.pct ? <span className="tnum text-muted"> · {textoPct(c.pct / 100)}</span> : null}
      {c.modo === "por_cota" ? <span className="text-muted"> · por cota</span> : null}
      {l.campanha ? <span className="block text-[11px] text-muted">{l.campanha}</span> : null}
      {l.pedidoStatus === "refunded" && c.status !== "cancelada" ? (
        <span className="block text-[11px] text-muted">pedido estornado: fica só a taxa Pix</span>
      ) : c.pixCents > 0 ? (
        <span className="block text-[11px] text-muted">
          venda <Money cents={c.vendaCents} /> + Pix <Money cents={c.pixCents} />
        </span>
      ) : null}
    </>
  );
}

function SituacaoDaTaxa({ status }: { status: string }) {
  return (
    <Pill status={status === "aberta" ? "reserved" : status === "cancelada" ? "closed" : "active"}>
      {ROTULO_DA_TAXA[status] ?? status}
    </Pill>
  );
}

/** O status da taxa em texto: "retida no split" é a que o Pix já dividiu — nada a pagar. */
const ROTULO_DA_TAXA: Record<string, string> = {
  aberta: "em aberto",
  paga: "paga",
  retida: "retida no split",
  cancelada: "cancelada",
};

export function AdminCobranca() {
  const { data: sessao } = useSession();
  const daPlataforma = sessao?.role === "admin";

  return daPlataforma ? <Carteira /> : <MinhaConta />;
}

/** A tabela em texto, para quem lê (organizador) e para conferir (plataforma). */
function ResumoDaTabela({ tabela }: { tabela: ConfigCobranca }) {
  return (
    <div className="space-y-3 px-4 py-3 text-sm">
      <p>
        Cada rifa escolhe, antes de publicar, como a plataforma cobra por ela:{" "}
        <b>{NOME_DO_MODO.percentual.toLowerCase()}</b> (<span className="tnum">{textoPct(tabela.percentualPct)}</span> de
        cada venda) ou <b>{NOME_DO_MODO.por_cota.toLowerCase()}</b> (<span className="tnum">{formatBRL(tabela.porCotaCents)}</span>{" "}
        por cota vendida). A escolha trava ao publicar.
      </p>
      <div>
        <p className="font-medium">Taxa de transação Pix</p>
        <p className="text-xs text-muted">
          Sobre o valor de cada Pix pago pelo site, descontada da organização (nunca de quem compra). Quanto mais
          transações no mês, menor a taxa. A faixa é a do volume do mês no momento do pedido.
        </p>
        <ul className="mt-1 list-disc pl-5">
          {tabela.faixasPix.map((_, i) => (
            <li key={i} className="tnum">
              {textoDaFaixa(tabela.faixasPix, i)}
            </li>
          ))}
        </ul>
      </div>
      <p className="text-xs text-muted">
        A plataforma sai antes da comissão: o afiliado recebe o percentual dele sobre o que sobrou da venda depois
        das duas taxas. Só Pix: não aceitamos cartão.
      </p>
    </div>
  );
}

/* ---------------- o lado da plataforma ---------------- */

function Carteira() {
  const qc = useQueryClient();
  const { data } = useQuery<{ carteira: LinhaCarteira[] }>({
    queryKey: ["/api/admin/cobranca"],
  });
  const [erro, setErro] = useState<string | null>(null);

  const recarregar = () => qc.invalidateQueries({ queryKey: ["/api/admin/cobranca"] });

  const baixar = useMutation({
    mutationFn: (id: string) => apiRequest("POST", `/api/admin/cobranca/${id}/baixa`),
    onSuccess: recarregar,
    onError: (err: Error) => setErro(err.message),
  });

  const total = data?.carteira.reduce((s, o) => s + o.abertoCents, 0) ?? 0;
  const retida = data?.carteira.reduce((s, o) => s + o.retidaCents, 0) ?? 0;

  return (
    <PanelShell title="Cobrança">
      {erro ? (
        <p role="alert" className="mb-3 rounded-md bg-red-soft px-3 py-2 text-sm text-red">
          {erro}
        </p>
      ) : null}

      <div className="mb-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Kpi label="A receber" value={formatBRL(total)} hint="somando todas" highlight={total > 0} />
        <Kpi label="Retida no split" value={formatBRL(retida)} hint="o Pix já dividiu: nada a cobrar" />
      </div>

      <TabelaDeCobranca />

      <RetencoesCautelares organizacoes={data?.carteira.map((o) => ({ id: o.organizationId, nome: o.name })) ?? []} />

      <Card title="Carteira">
        {data?.carteira.length ? (
          <TabelaOuCartoes
            aria="Carteira de cobrança"
            itens={data.carteira}
            chave={(o) => o.organizationId}
            colunas={[
              {
                titulo: "Organização",
                celula: (o) => (
                  <>
                    <span className="font-medium">{o.name}</span>
                    {!o.active ? (
                      <span className="ml-2">
                        <Pill status="blocked">suspensa</Pill>
                      </span>
                    ) : null}
                  </>
                ),
              },
              {
                titulo: "Em aberto",
                direita: true,
                celula: (o) => (
                  <>
                    <Money cents={o.abertoCents} />
                    {o.creditoCents > 0 ? (
                      <span className="block text-[11px] text-muted">
                        a repassar (presentes): <Money cents={o.creditoCents} />
                      </span>
                    ) : null}
                  </>
                ),
              },
              {
                titulo: "Já pago",
                direita: true,
                celula: (o) => (
                  <span className="text-muted">
                    <Money cents={o.pagoCents} />
                    {o.retidaCents > 0 ? (
                      <span className="block text-[11px]">
                        retida no split: <Money cents={o.retidaCents} />
                      </span>
                    ) : null}
                  </span>
                ),
              },
              {
                titulo: "",
                celula: (o) =>
                  o.abertoCents > 0 || o.creditoCents > 0 ? (
                    <Button variant="ghost" onClick={() => baixar.mutate(o.organizationId)}>
                      dar baixa
                    </Button>
                  ) : null,
              },
            ]}
            cartao={(o) => (
              <div className="space-y-1 text-sm">
                <p className="font-medium">{o.name}</p>
                <p>
                  Em aberto: <Money cents={o.abertoCents} />
                </p>
                <p className="text-muted">
                  Já pago: <Money cents={o.pagoCents} />
                </p>
                {o.abertoCents > 0 || o.creditoCents > 0 ? (
                  <Button variant="ghost" onClick={() => baixar.mutate(o.organizationId)}>
                    dar baixa
                  </Button>
                ) : null}
              </div>
            )}
          />
        ) : (
          <Empty>Nenhuma organização ainda.</Empty>
        )}
      </Card>
    </PanelShell>
  );
}

/** Centavos para o campo em reais, e de volta. */
const emReais = (c: number) => (c / 100).toFixed(2);
const deReais = (v: string) => Math.round(Number(v.replace(",", ".")) * 100);

/**
 * A tabela de cobrança da plataforma. Vale para as rifas publicadas a partir
 * da vigência: a rifa publicada guardou a dela, e o pedido, a dele. Reduzir
 * vale na hora; aumentar exige agendar com 30 dias de aviso (cláusula X.3),
 * salvo antes de qualquer promotora ter aceitado o contrato.
 */
function TabelaDeCobranca() {
  const qc = useQueryClient();
  const { data } = useQuery<TabelasDaCobranca>({ queryKey: ["/api/admin/cobranca/tabela"] });
  const [pct, setPct] = useState("0");
  const [porCota, setPorCota] = useState("0.00");
  const [faixas, setFaixas] = useState<{ ate: string; pct: string }[]>([{ ate: "", pct: "0" }]);
  const [vigenteEm, setVigenteEm] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null);

  useEffect(() => {
    if (!data) return;
    const t = data.vigente;
    setPct(String(t.percentualPct));
    setPorCota(emReais(t.porCotaCents));
    setFaixas(t.faixasPix.map((f) => ({ ate: f.ate === null ? "" : String(f.ate), pct: String(f.pct) })));
  }, [data]);

  const recarregar = () => qc.invalidateQueries({ queryKey: ["/api/admin/cobranca/tabela"] });

  const salvar = useMutation({
    mutationFn: () => {
      const faixasPix: FaixaPix[] = faixas.map((f, i) => ({
        ate: i === faixas.length - 1 ? null : Number(f.ate),
        pct: Number(f.pct.replace(",", ".")),
      }));
      return apiRequest("PUT", "/api/admin/cobranca/tabela", {
        percentualPct: Number(pct.replace(",", ".")),
        porCotaCents: deReais(porCota),
        faixasPix,
        ...(vigenteEm ? { vigenteEm } : {}),
      });
    },
    onSuccess: () => {
      setMsg({
        ok: true,
        texto: vigenteEm
          ? `Tabela agendada para ${dataDaVigencia(vigenteEm)}. As organizações são avisadas no painel.`
          : "Tabela salva. Vale para as rifas publicadas daqui em diante.",
      });
      setVigenteEm("");
      recarregar();
    },
    onError: (err: Error) => setMsg({ ok: false, texto: err.message }),
  });

  const cancelar = useMutation({
    mutationFn: () => apiRequest("DELETE", "/api/admin/cobranca/tabela/proxima"),
    onSuccess: () => {
      setMsg({ ok: true, texto: "Agendamento cancelado. Segue valendo a tabela atual." });
      recarregar();
    },
    onError: (err: Error) => setMsg({ ok: false, texto: err.message }),
  });

  return (
    <Card title="Tabela de cobrança">
      <form
        className="space-y-4 px-4 py-3"
        onSubmit={(e) => {
          e.preventDefault();
          setMsg(null);
          salvar.mutate();
        }}
      >
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Campo rotulo="Percentual sobre a venda (%)" dica={`De 0 a ${PERCENTUAL_MAX}%, até duas casas.`}>
            <input inputMode="decimal" value={pct} onChange={(e) => setPct(e.target.value)} className="campo tnum" />
          </Campo>
          <Campo rotulo="Valor por cota vendida (R$)" dica={`Até ${formatBRL(POR_COTA_MAX_CENTS)}. Nunca maior que o preço da cota.`}>
            <input inputMode="decimal" value={porCota} onChange={(e) => setPorCota(e.target.value)} className="campo tnum" />
          </Campo>
        </div>

        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">Taxa Pix por volume do mês</legend>
          <p className="text-xs text-muted">
            De {1} a {FAIXAS_PIX_MAX} faixas, até {PIX_PCT_MAX}%. Os tetos sobem e a taxa nunca sobe; a última não tem
            teto.
          </p>
          {faixas.map((f, i) => {
            const ultima = i === faixas.length - 1;
            return (
              <div key={i} className="grid grid-cols-1 items-end gap-2 sm:grid-cols-[1fr_1fr_auto]">
                <Campo rotulo={`Faixa ${i + 1}: até quantas transações`}>
                  <input
                    inputMode="numeric"
                    value={ultima ? "" : f.ate}
                    placeholder={ultima ? "sem teto" : undefined}
                    disabled={ultima}
                    onChange={(e) => setFaixas(faixas.map((x, j) => (j === i ? { ...x, ate: e.target.value } : x)))}
                    className="campo tnum"
                  />
                </Campo>
                <Campo rotulo={`Faixa ${i + 1}: taxa (%)`}>
                  <input
                    inputMode="decimal"
                    value={f.pct}
                    onChange={(e) => setFaixas(faixas.map((x, j) => (j === i ? { ...x, pct: e.target.value } : x)))}
                    className="campo tnum"
                  />
                </Campo>
                <Button
                  variant="ghost"
                  type="button"
                  disabled={faixas.length === 1}
                  onClick={() => setFaixas(faixas.filter((_, j) => j !== i))}
                  aria-label={`Tirar a faixa ${i + 1}`}
                >
                  tirar
                </Button>
              </div>
            );
          })}
          <Button
            variant="ghost"
            type="button"
            disabled={faixas.length >= FAIXAS_PIX_MAX}
            onClick={() => {
              // A nova entra antes da última (a sem teto).
              const ultima = faixas[faixas.length - 1];
              setFaixas([...faixas.slice(0, -1), { ate: "", pct: ultima.pct }, ultima]);
            }}
          >
            + faixa
          </Button>
        </fieldset>

        <Campo
          rotulo="Vale a partir de (opcional)"
          dica={
            data
              ? `Vazio: vale agora. Reduzir pode valer na hora; aumentar qualquer taxa exige ${data.avisoDias} dias de aviso às organizações — a partir de ${dataDaVigencia(data.primeiroDiaComAviso)}.`
              : undefined
          }
        >
          <input type="date" value={vigenteEm} onChange={(e) => setVigenteEm(e.target.value)} className="campo tnum" />
        </Campo>

        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" disabled={salvar.isPending}>
            {vigenteEm ? "Agendar tabela" : "Salvar tabela"}
          </Button>
          {data?.proxima ? (
            <span className="text-xs text-muted">
              {vigenteEm ? "Agendar de novo troca a agendada." : "Salvar sem data descarta a tabela agendada."}
            </span>
          ) : null}
          {msg ? (
            <span role="status" className={`text-sm ${msg.ok ? "text-green-deep" : "text-red"}`}>
              {msg.texto}
            </span>
          ) : null}
        </div>
      </form>
      {data ? (
        <>
          <p className="px-4 pt-2 text-sm font-medium">Em vigor</p>
          <ResumoDaTabela tabela={data.vigente} />
        </>
      ) : null}
      {data?.proxima ? (
        <div className="border-t border-line">
          <div className="flex flex-wrap items-center justify-between gap-2 px-4 pt-3">
            <p className="text-sm font-medium">
              <Pill status="reserved">agendada</Pill>{" "}
              <span className="ml-1">
                A partir de <span className="tnum">{dataDaVigencia(data.proxima.vigenteEm)}</span>
              </span>
            </p>
            <Button variant="ghost" onClick={() => cancelar.mutate()} disabled={cancelar.isPending}>
              Cancelar agendamento
            </Button>
          </div>
          <ResumoDaTabela tabela={data.proxima.tabela} />
        </div>
      ) : null}
    </Card>
  );
}

/* ---------------- o lado do organizador ---------------- */

function MinhaConta() {
  // O extrato anda por chave: a primeira página traz a tabela e os totais
  // (que valem para a conta toda), "Ver mais" traz os lançamentos seguintes.
  const { paginas, hasNextPage, fetchNextPage, isFetchingNextPage } = useListaPaginada<Extrato>("/api/admin/cobranca/extrato");
  const data = paginas[0];
  const lancamentos = paginas.flatMap((p) => p.linhas);

  return (
    <PanelShell title="Cobrança">
      <div className="mb-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Kpi label="Em aberto" value={formatBRL(data?.totais.abertoCents ?? 0)} />
        <Kpi
          label="Já pago"
          value={formatBRL((data?.totais.pagoCents ?? 0) + (data?.totais.retidaCents ?? 0))}
          hint={data?.totais.retidaCents ? `${formatBRL(data.totais.retidaCents)} retidos no split do Pix, sem nada a pagar` : undefined}
        />
        {data?.creditos.devidoCents ? (
          <Kpi
            label="A receber da plataforma"
            value={formatBRL(data.creditos.devidoCents)}
            hint="sua parte nos descontos de presente que a plataforma pagou; entra no próximo acerto"
          />
        ) : null}
      </div>

      {data?.proxima ? (
        <Card title={`Tabela nova a partir de ${dataDaVigencia(data.proxima.vigenteEm)}`} right={<Pill status="reserved">aviso</Pill>}>
          <p className="px-4 pt-3 text-sm">
            Vale para as rifas publicadas a partir de <span className="tnum">{dataDaVigencia(data.proxima.vigenteEm)}</span>. As
            rifas já publicadas seguem com a tabela que gravaram na publicação.
          </p>
          <ResumoDaTabela tabela={data.proxima.tabela} />
        </Card>
      ) : null}

      {data ? (
        <Card title="Como a plataforma cobra">
          <ResumoDaTabela tabela={data.tabela} />
        </Card>
      ) : null}

      <Card title="Lançamentos">
        {lancamentos.length ? (
          <>
            <TabelaOuCartoes
              aria="Lançamentos de cobrança"
              itens={lancamentos}
              chave={(l) => l.charge.id}
              colunas={[
                { titulo: "Quando", celula: (l) => <span className="tnum text-muted">{new Date(l.charge.createdAt).toLocaleDateString("pt-BR")}</span> },
                { titulo: "De onde veio", celula: (l) => <DeOndeVeio l={l} /> },
                { titulo: "Valor", direita: true, celula: (l) => <Money cents={l.charge.amountCents} /> },
                { titulo: "Situação", celula: (l) => <SituacaoDaTaxa status={l.charge.status} /> },
              ]}
              cartao={(l) => (
                <div className="space-y-1">
                  <div className="flex items-start justify-between gap-3">
                    <span className="tnum text-xs text-muted">{new Date(l.charge.createdAt).toLocaleDateString("pt-BR")}</span>
                    <SituacaoDaTaxa status={l.charge.status} />
                  </div>
                  <p className="text-sm">
                    <DeOndeVeio l={l} />
                  </p>
                  <p className="text-right text-sm">
                    <Money cents={l.charge.amountCents} />
                  </p>
                </div>
              )}
            />
            <VerMais temMais={Boolean(hasNextPage)} carregando={isFetchingNextPage} aoPedir={() => fetchNextPage()} mostradas={lancamentos.length} />
          </>
        ) : (
          <Empty>Nenhuma cobrança até agora.</Empty>
        )}
      </Card>
    </PanelShell>
  );
}
