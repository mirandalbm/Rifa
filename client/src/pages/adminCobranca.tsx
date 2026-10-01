import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { PanelShell } from "@/components/AppShell";
import { Card, Button, Pill, Empty, Money, Kpi } from "@/components/bits";
import { TabelaOuCartoes, VerMais } from "@/components/painel";
import { useListaPaginada } from "@/lib/paginada";
import { apiRequest } from "@/lib/queryClient";
import { useSession } from "@/lib/session";
import { formatBRL } from "@shared/format";
import {
  BILLING_LABEL,
  MAX_PLATFORM_PCT,
  type BillingMode,
  type BillingPlan,
} from "@shared/billing";

interface LinhaCarteira {
  organizationId: string;
  name: string;
  mode: BillingMode;
  platformFeePct: number;
  monthlyCents: number;
  active: boolean;
  abertoCents: number;
  pagoCents: number;
  retidaCents: number;
  lancamentos: number;
  /** O que a plataforma deve à organização: a parte dela nos presentes. */
  creditoCents: number;
}

interface Extrato {
  plano: BillingPlan;
  totais: { abertoCents: number; pagoCents: number; retidaCents: number };
  creditos: { devidoCents: number; pagoCents: number };
  linhas: {
    charge: {
      id: string;
      kind: "venda" | "mensalidade";
      competencia: string | null;
      amountCents: number;
      pct: number | null;
      status: string;
      createdAt: string;
    };
    orderCode: number | null;
    campanha: string | null;
  }[];
}

/**
 * Cobrança da plataforma.
 *
 * Mesma tela, dois lados. O administrador geral vê a carteira: em que
 * contrato cada organização está e quanto deve. O organizador vê a conta
 * dele — cobrar sem mostrar de onde veio cada lançamento seria indefensável,
 * e é a primeira coisa que um cliente pede quando desconfia da fatura.
 */
type LinhaDoExtrato = Extrato["linhas"][number];

function DeOndeVeio({ l }: { l: LinhaDoExtrato }) {
  return l.charge.kind === "mensalidade" ? (
    <>
      Mensalidade <span className="tnum text-muted">{l.charge.competencia}</span>
    </>
  ) : (
    <>
      Venda do pedido <span className="tnum">{l.orderCode}</span>
      {l.charge.pct ? <span className="tnum text-muted"> · {l.charge.pct}%</span> : null}
      {l.campanha ? <span className="block text-[11px] text-muted">{l.campanha}</span> : null}
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

/* ---------------- o lado da plataforma ---------------- */

function Carteira() {
  const qc = useQueryClient();
  const { data } = useQuery<{ carteira: LinhaCarteira[] }>({
    queryKey: ["/api/admin/cobranca"],
  });
  const [editando, setEditando] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  const recarregar = () => qc.invalidateQueries({ queryKey: ["/api/admin/cobranca"] });

  const baixar = useMutation({
    mutationFn: (id: string) => apiRequest("POST", `/api/admin/cobranca/${id}/baixa`),
    onSuccess: recarregar,
    onError: (err: Error) => setErro(err.message),
  });

  const lancar = useMutation({
    mutationFn: () => apiRequest("POST", "/api/admin/cobranca/mensalidades"),
    onSuccess: recarregar,
    onError: (err: Error) => setErro(err.message),
  });

  const total = data?.carteira.reduce((s, o) => s + o.abertoCents, 0) ?? 0;
  const cobrando = data?.carteira.filter((o) => o.mode !== "gratis").length ?? 0;

  return (
    <PanelShell title="Cobrança">
      {erro ? (
        <p className="mb-3 rounded-md bg-red-soft px-3 py-2 text-sm text-red">{erro}</p>
      ) : null}

      <div className="mb-3 grid gap-3 sm:grid-cols-3">
        <Kpi label="A receber" value={formatBRL(total)} hint="somando todas" highlight={total > 0} />
        <Kpi label="Organizações cobrando" value={String(cobrando)} />
        <Kpi
          label="Sem cobrança"
          value={String((data?.carteira.length ?? 0) - cobrando)}
          hint="o padrão de quem ainda não tem contrato"
        />
      </div>

      <Card
        title="Carteira"
        right={
          <Button variant="ghost" onClick={() => lancar.mutate()} disabled={lancar.isPending}>
            lançar mensalidades
          </Button>
        }
      >
        {data?.carteira.length ? (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-left">
                <th className="px-4 py-2 font-medium text-muted">Organização</th>
                <th className="px-4 py-2 font-medium text-muted">Contrato</th>
                <th className="px-4 py-2 text-right font-medium text-muted">Em aberto</th>
                <th className="px-4 py-2 text-right font-medium text-muted">Já pago</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody>
              {data.carteira.map((o) => (
                <Linha
                  key={o.organizationId}
                  org={o}
                  editando={editando === o.organizationId}
                  abrir={() => setEditando(o.organizationId)}
                  fechar={() => setEditando(null)}
                  salvo={() => {
                    setEditando(null);
                    setErro(null);
                    recarregar();
                  }}
                  falhou={setErro}
                  baixar={() => baixar.mutate(o.organizationId)}
                />
              ))}
            </tbody>
          </table>
        ) : (
          <Empty>Nenhuma organização ainda.</Empty>
        )}

        <p className="border-t border-line px-4 py-3 text-xs text-muted">
          A taxa por venda sai <b>antes</b> da comissão: o afiliado recebe sobre
          o que sobrou, não sobre o bruto. Quem paga mensalidade não paga nada
          por venda — os dois juntos seriam um terceiro contrato.
        </p>
      </Card>
    </PanelShell>
  );
}

function Linha({
  org,
  editando,
  abrir,
  fechar,
  salvo,
  falhou,
  baixar,
}: {
  org: LinhaCarteira;
  editando: boolean;
  abrir: () => void;
  fechar: () => void;
  salvo: () => void;
  falhou: (m: string) => void;
  baixar: () => void;
}) {
  const [plano, setPlano] = useState<Partial<BillingPlan>>({
    mode: org.mode,
    platformFeePct: org.platformFeePct || 5,
    monthlyCents: org.monthlyCents || 29900,
  });

  const salvar = useMutation({
    mutationFn: () =>
      apiRequest("PUT", `/api/admin/cobranca/${org.organizationId}/plano`, plano),
    onSuccess: salvo,
    onError: (err: Error) => falhou(err.message),
  });

  return (
    <>
      <tr className="border-b border-line last:border-0">
        <td className="px-4 py-3">
          <span className="font-medium">{org.name}</span>
          {!org.active ? (
            <span className="ml-2">
              <Pill status="blocked">suspensa</Pill>
            </span>
          ) : null}
        </td>
        <td className="px-4 py-3">
          <Pill status={org.mode === "gratis" ? "draft" : "active"}>
            {BILLING_LABEL[org.mode]}
          </Pill>
          <span className="tnum ml-2 text-xs text-muted">
            {org.mode === "comissao" ? `${org.platformFeePct}%` : null}
            {org.mode === "mensalidade" ? `${formatBRL(org.monthlyCents)}/mês` : null}
          </span>
        </td>
        <td className="px-4 py-3 text-right">
          <Money cents={org.abertoCents} />
          {org.creditoCents > 0 ? (
            <span className="block text-[11px] text-muted">
              a repassar (presentes): <Money cents={org.creditoCents} />
            </span>
          ) : null}
        </td>
        <td className="px-4 py-3 text-right text-muted">
          <Money cents={org.pagoCents} />
          {org.retidaCents > 0 ? (
            <span className="block text-[11px]">
              retida no split: <Money cents={org.retidaCents} />
            </span>
          ) : null}
        </td>
        <td className="px-4 py-3 text-right">
          <div className="flex justify-end gap-2 whitespace-nowrap">
            <Button variant="ghost" onClick={editando ? fechar : abrir}>
              {editando ? "fechar" : "contrato"}
            </Button>
            {org.abertoCents > 0 || org.creditoCents > 0 ? (
              <Button variant="ghost" onClick={baixar}>
                dar baixa
              </Button>
            ) : null}
          </div>
        </td>
      </tr>

      {editando ? (
        <tr className="border-b border-line bg-mist">
          <td colSpan={5} className="px-4 py-3">
            <div className="flex flex-wrap items-end gap-3">
              <div>
                <label htmlFor={`modo-${org.organizationId}`} className="label-xs">
                  Como cobrar
                </label>
                <select
                  id={`modo-${org.organizationId}`}
                  value={plano.mode}
                  onChange={(e) =>
                    setPlano({ ...plano, mode: e.target.value as BillingMode })
                  }
                  className="mt-1 rounded-md border border-line-2 px-3 py-2 text-sm"
                >
                  {(Object.keys(BILLING_LABEL) as BillingMode[]).map((m) => (
                    <option key={m} value={m}>
                      {BILLING_LABEL[m]}
                    </option>
                  ))}
                </select>
              </div>

              {plano.mode === "comissao" ? (
                <div>
                  <label htmlFor={`pct-${org.organizationId}`} className="label-xs">
                    Percentual por venda (máx. {MAX_PLATFORM_PCT}%)
                  </label>
                  <input
                    id={`pct-${org.organizationId}`}
                    type="number"
                    min={1}
                    max={MAX_PLATFORM_PCT}
                    value={plano.platformFeePct}
                    onChange={(e) =>
                      setPlano({ ...plano, platformFeePct: Number(e.target.value) })
                    }
                    className="tnum mt-1 w-28 rounded-md border border-line-2 px-3 py-2 text-sm"
                  />
                </div>
              ) : null}

              {plano.mode === "mensalidade" ? (
                <div>
                  <label htmlFor={`mes-${org.organizationId}`} className="label-xs">
                    Valor do mês (R$)
                  </label>
                  <input
                    id={`mes-${org.organizationId}`}
                    type="number"
                    min={1}
                    step="0.01"
                    value={(plano.monthlyCents ?? 0) / 100}
                    onChange={(e) =>
                      setPlano({
                        ...plano,
                        monthlyCents: Math.round(Number(e.target.value) * 100),
                      })
                    }
                    className="tnum mt-1 w-32 rounded-md border border-line-2 px-3 py-2 text-sm"
                  />
                </div>
              ) : null}

              <Button onClick={() => salvar.mutate()} disabled={salvar.isPending}>
                Salvar contrato
              </Button>
            </div>
          </td>
        </tr>
      ) : null}
    </>
  );
}

/* ---------------- o lado do organizador ---------------- */

function MinhaConta() {
  // O extrato anda por chave: a primeira página traz o contrato e os totais
  // (que valem para a conta toda), "Ver mais" traz os lançamentos seguintes.
  const { paginas, hasNextPage, fetchNextPage, isFetchingNextPage } = useListaPaginada<Extrato>("/api/admin/cobranca/extrato");
  const data = paginas[0];
  const lancamentos = paginas.flatMap((p) => p.linhas);

  return (
    <PanelShell title="Cobrança">
      <div className="mb-3 grid gap-3 sm:grid-cols-4">
        <Kpi
          label="Seu contrato"
          value={data ? BILLING_LABEL[data.plano.mode] : "—"}
          hint={
            data?.plano.mode === "comissao"
              ? `${data.plano.platformFeePct}% por venda, descontado antes da comissão`
              : data?.plano.mode === "mensalidade"
                ? `${formatBRL(data.plano.monthlyCents)} por mês, e nada por venda`
                : "nenhuma cobrança da plataforma"
          }
        />
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

        {data?.plano.mode === "comissao" ? (
          <p className="border-t border-line px-4 py-3 text-xs text-muted">
            A taxa da plataforma sai antes da comissão do afiliado: ele recebe o
            percentual dele sobre o que sobrou da venda, não sobre o bruto.
          </p>
        ) : null}
      </Card>
    </PanelShell>
  );
}
