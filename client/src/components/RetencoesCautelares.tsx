import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button, Card, Money, Pill } from "@/components/bits";
import { apiRequest } from "@/lib/queryClient";
import {
  MOTIVO_MIN,
  ORIGENS_DA_RETENCAO,
  O_QUE_FICA_RETIDO,
  SITUACOES_DA_RETENCAO,
  type OrigemDaRetencao,
  type SituacaoDaRetencao,
} from "@shared/retencao";

interface Valores {
  patrocinioCents: number;
  presenteCents: number;
  reembolsoCents: number;
}

interface Retencao {
  id: string;
  organizationId: string;
  organizacao: string;
  banida: boolean;
  status: SituacaoDaRetencao;
  origem: OrigemDaRetencao;
  motivo: string;
  criadoEm: string;
  noInicio: Valores;
  agora: Valores | null;
  decisao: string | null;
  abatidoCents: number | null;
  decididoEm: string | null;
}

const PILL: Record<SituacaoDaRetencao, string> = { ativa: "pending", liberada: "paid", abatida: "closed" };

/** Centavos a partir do que a pessoa digita em reais ("12,50"). */
function centavos(texto: string): number {
  const limpo = texto.replace(/\s/g, "").replace(/\./g, "").replace(",", ".");
  if (!limpo) return 0;
  const n = Number(limpo);
  return Number.isFinite(n) ? Math.round(n * 100) : NaN;
}

/**
 * Retenção cautelar de saldo (contrato com a promotora): o que a plataforma
 * guarda em nome da organização fica parado até a plataforma liberar ou
 * abater. Nasce sozinha no banimento; aqui também dá para reter sem banir.
 * Só a plataforma vê (o servidor recusa o organizador).
 */
export function RetencoesCautelares({ organizacoes }: { organizacoes: { id: string; nome: string }[] }) {
  const qc = useQueryClient();
  const chave = ["/api/admin/retencoes"];
  const { data } = useQuery<Retencao[]>({ queryKey: chave });
  const [erro, setErro] = useState<string | null>(null);
  const [nova, setNova] = useState({ org: "", motivo: "" });
  const [motivo, setMotivo] = useState<Record<string, string>>({});
  const [valor, setValor] = useState<Record<string, string>>({});
  const [presente, setPresente] = useState<Record<string, boolean>>({});

  const feito = () => {
    setErro(null);
    qc.invalidateQueries({ queryKey: chave });
    qc.invalidateQueries({ queryKey: ["/api/admin/cobranca"] });
    qc.invalidateQueries({ queryKey: ["/api/admin/caixa-de-entrada"] });
  };
  const reter = useMutation({
    mutationFn: () => apiRequest("POST", `/api/admin/organizacoes/${nova.org}/retencao`, { motivo: nova.motivo }),
    onSuccess: () => {
      setNova({ org: "", motivo: "" });
      feito();
    },
    onError: (e: Error) => setErro(e.message),
  });
  const liberar = useMutation({
    mutationFn: (id: string) => apiRequest("POST", `/api/admin/retencoes/${id}/liberar`, { motivo: motivo[id] ?? "" }),
    onSuccess: feito,
    onError: (e: Error) => setErro(e.message),
  });
  const abater = useMutation({
    mutationFn: (id: string) =>
      apiRequest("POST", `/api/admin/retencoes/${id}/abater`, {
        patrocinioCents: centavos(valor[id] ?? ""),
        presente: presente[id] === true,
        motivo: motivo[id] ?? "",
      }),
    onSuccess: feito,
    onError: (e: Error) => setErro(e.message),
  });

  const ativas = data?.filter((r) => r.status === "ativa") ?? [];
  const decididas = data?.filter((r) => r.status !== "ativa") ?? [];
  const comAtiva = new Set(ativas.map((r) => r.organizationId));

  return (
    <section id="retencoes" className="mb-4">
      <Card title="Saldo retido">
        <div className="space-y-3 p-4 text-sm">
          <p className="text-xs text-muted">
            Retenção cautelar: o que está na conta da plataforma em nome da organização fica parado — {O_QUE_FICA_RETIDO.join("; ")}.
            O Pix das vendas cai direto na carteira da promotora pelo split e não é retido. Nasce sozinha ao banir; libere
            quando não houver passivo, ou abata o que for preciso para cobri-lo.
          </p>
          {erro ? (
            <p role="alert" className="rounded-md bg-red-soft px-3 py-2 text-xs text-red">
              {erro}
            </p>
          ) : null}

          {ativas.length === 0 ? <p className="text-xs text-muted">Nenhum saldo retido agora.</p> : null}
          <ul className="space-y-3">
            {ativas.map((r) => {
              const agora = r.agora ?? r.noInicio;
              const m = motivo[r.id] ?? "";
              return (
                <li key={r.id} className="rounded-md border border-line p-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-medium">
                        {r.organizacao}
                        {r.banida ? <span className="text-muted"> · banida</span> : null}
                      </p>
                      <p className="text-xs text-muted">
                        {ORIGENS_DA_RETENCAO[r.origem]} · desde{" "}
                        <span className="tnum">{new Date(r.criadoEm).toLocaleString("pt-BR")}</span>
                      </p>
                      <p className="mt-1 text-xs">{r.motivo}</p>
                    </div>
                    <Pill status={PILL[r.status]}>{SITUACOES_DA_RETENCAO[r.status]}</Pill>
                  </div>
                  <dl className="mt-2 grid grid-cols-1 gap-1 text-xs sm:grid-cols-3">
                    <div>
                      <dt className="text-muted">Saldo de patrocínio</dt>
                      <dd>
                        <Money cents={agora.patrocinioCents} />
                      </dd>
                    </div>
                    <div>
                      <dt className="text-muted">Crédito do presente</dt>
                      <dd>
                        <Money cents={agora.presenteCents} />
                      </dd>
                    </div>
                    <div>
                      <dt className="text-muted">Reembolso aprovado a pagar</dt>
                      <dd>
                        <Money cents={agora.reembolsoCents} />
                      </dd>
                    </div>
                  </dl>
                  <div className="mt-3 grid grid-cols-1 gap-2 xl:grid-cols-[minmax(0,1fr)_14rem] xl:items-end">
                    <label className="block min-w-0">
                      <span className="label-xs">Motivo da decisão (fica na auditoria)</span>
                      <input className="campo" maxLength={1000} value={m} onChange={(e) => setMotivo({ ...motivo, [r.id]: e.target.value })} />
                    </label>
                    <label className="block min-w-0">
                      <span className="label-xs">Abater do patrocínio (R$)</span>
                      <input
                        className="campo tnum"
                        inputMode="decimal"
                        placeholder="0,00"
                        value={valor[r.id] ?? ""}
                        onChange={(e) => setValor({ ...valor, [r.id]: e.target.value })}
                      />
                    </label>
                  </div>
                  {agora.presenteCents > 0 ? (
                    <label className="mt-2 flex items-start gap-2 text-xs">
                      <input
                        type="checkbox"
                        className="mt-0.5"
                        checked={presente[r.id] === true}
                        onChange={(e) => setPresente({ ...presente, [r.id]: e.target.checked })}
                      />
                      <span>
                        Abater também todo o crédito do presente (<Money cents={agora.presenteCents} />)
                      </span>
                    </label>
                  ) : null}
                  <div className="mt-2 flex flex-col gap-2 sm:flex-row">
                    <Button disabled={abater.isPending || m.trim().length < MOTIVO_MIN} onClick={() => abater.mutate(r.id)}>
                      Abater e encerrar
                    </Button>
                    <Button variant="ghost" disabled={liberar.isPending || m.trim().length < MOTIVO_MIN} onClick={() => liberar.mutate(r.id)}>
                      Liberar o saldo
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>

          <details>
            <summary className="cursor-pointer text-xs font-semibold">Reter o saldo de uma organização sem banir</summary>
            <div className="mt-2 grid grid-cols-1 gap-2 xl:grid-cols-[14rem_minmax(0,1fr)_auto] xl:items-end">
              <label className="block min-w-0">
                <span className="label-xs">Organização</span>
                <select className="campo" value={nova.org} onChange={(e) => setNova({ ...nova, org: e.target.value })}>
                  <option value="">Escolha…</option>
                  {organizacoes
                    .filter((o) => !comAtiva.has(o.id))
                    .map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.nome}
                      </option>
                    ))}
                </select>
              </label>
              <label className="block min-w-0">
                <span className="label-xs">Motivo</span>
                <input className="campo" maxLength={1000} value={nova.motivo} onChange={(e) => setNova({ ...nova, motivo: e.target.value })} />
              </label>
              <Button disabled={reter.isPending || !nova.org || nova.motivo.trim().length < MOTIVO_MIN} onClick={() => reter.mutate()}>
                Reter o saldo
              </Button>
            </div>
          </details>

          {decididas.length ? (
            <details>
              <summary className="cursor-pointer text-xs font-semibold">Encerradas ({decididas.length})</summary>
              <ul className="mt-2 space-y-1 text-xs">
                {decididas.map((r) => (
                  <li key={r.id} className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{r.organizacao}</span>
                    <Pill status={PILL[r.status]}>{SITUACOES_DA_RETENCAO[r.status]}</Pill>
                    {r.abatidoCents ? (
                      <span>
                        abatido <Money cents={r.abatidoCents} />
                      </span>
                    ) : null}
                    {r.decisao ? <span className="text-muted">{r.decisao}</span> : null}
                  </li>
                ))}
              </ul>
            </details>
          ) : null}
        </div>
      </Card>
    </section>
  );
}
