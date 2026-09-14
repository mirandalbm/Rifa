import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { PanelShell } from "@/components/AppShell";
import { Card, Button, Pill, Empty, Kpi } from "@/components/bits";
import { apiRequest } from "@/lib/queryClient";
import { LIMIT_FIELDS, type AntiFraudLimits } from "@shared/antifraude";

interface Painel {
  limits: AntiFraudLimits;
  resumo: { rule: string; total: number; ultimo: string }[];
  eventos: {
    id: string;
    rule: string;
    reason: string;
    subject: string | null;
    createdAt: string;
  }[];
  bloqueios: {
    id: string;
    kind: string;
    value: string;
    reason: string | null;
    createdAt: string;
  }[];
}

const REGRA_LABEL: Record<string, string> = {
  reserva_aberta: "reserva sem pagar",
  ritmo_telefone: "ritmo por telefone",
  ritmo_aparelho: "ritmo por aparelho",
  ritmo_ip: "ritmo por IP",
  autoindicacao: "autoindicação",
  forca_bruta: "força bruta de senha",
  otp_excessivo: "código em excesso",
  bloqueio: "bloqueio manual",
};

const TIPO_LABEL: Record<string, string> = {
  phone: "telefone",
  device: "aparelho",
  ip: "IP",
};

/**
 * Antifraude.
 *
 * A tela existe para responder duas perguntas: o que foi barrado, e por quê.
 * Sem isso, limite apertado demais vira venda perdida que ninguém enxerga.
 */
export function AdminAntifraude() {
  const qc = useQueryClient();
  const { data } = useQuery<Painel>({ queryKey: ["/api/admin/antifraude"] });

  const [rascunho, setRascunho] = useState<Partial<AntiFraudLimits>>({});
  const [bloqueio, setBloqueio] = useState({ kind: "phone", value: "", reason: "" });
  const [erro, setErro] = useState<string | null>(null);

  const valor = (campo: keyof AntiFraudLimits) =>
    (rascunho[campo] ?? data?.limits[campo] ?? 0) as number;

  const salvar = useMutation({
    mutationFn: () =>
      apiRequest("PUT", "/api/admin/antifraude/limites", {
        ...data?.limits,
        ...rascunho,
      }),
    onSuccess: () => {
      setRascunho({});
      setErro(null);
      qc.invalidateQueries({ queryKey: ["/api/admin/antifraude"] });
    },
    onError: (err: Error) => setErro(err.message),
  });

  const criarBloqueio = useMutation({
    mutationFn: () => apiRequest("POST", "/api/admin/antifraude/bloqueios", bloqueio),
    onSuccess: () => {
      setBloqueio({ kind: "phone", value: "", reason: "" });
      setErro(null);
      qc.invalidateQueries({ queryKey: ["/api/admin/antifraude"] });
    },
    onError: (err: Error) => setErro(err.message),
  });

  const remover = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/admin/antifraude/bloqueios/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/admin/antifraude"] }),
  });

  const totalBarrado = data?.resumo.reduce((soma, r) => soma + r.total, 0) ?? 0;

  return (
    <PanelShell title="Antifraude">
      {erro ? (
        <p className="mb-3 rounded-md bg-red-soft px-3 py-2 text-sm text-red">{erro}</p>
      ) : null}

      <div className="mb-3 grid gap-3 sm:grid-cols-3">
        {/* Sem destaque verde: na paleta, verde é dinheiro que entrou.
            Recusa não é receita — pintar de verde faria o número ser lido
            como venda. */}
        <Kpi
          label="Barrado em 7 dias"
          value={String(totalBarrado)}
          hint="tentativas recusadas"
        />
        <Kpi label="Bloqueios manuais" value={String(data?.bloqueios.length ?? 0)} />
        <Kpi
          label="Reserva sem pagar"
          value={String(
            data?.resumo.find((r) => r.rule === "reserva_aberta")?.total ?? 0,
          )}
          hint="o ataque que trava a rifa"
        />
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <Card title="Limites">
          <div className="space-y-3 p-4">
            <p className="text-xs text-muted">
              Reservar cota e não pagar é o jeito mais barato de travar uma rifa: a
              campanha parece vendida e ninguém consegue comprar. Por isso os dois
              primeiros limites são os que mais protegem.
            </p>

            {LIMIT_FIELDS.map((campo) => (
              <div key={campo.key}>
                <label htmlFor={`limite-${campo.key}`} className="label-xs">
                  {campo.label}
                </label>
                <input
                  id={`limite-${campo.key}`}
                  type="number"
                  min={campo.min}
                  max={campo.max}
                  value={valor(campo.key)}
                  onChange={(e) =>
                    setRascunho({ ...rascunho, [campo.key]: Number(e.target.value) })
                  }
                  className="tnum mt-1 w-32 rounded-md border border-line-2 px-3 py-2 text-sm"
                />
                <p className="mt-1 text-[11px] text-muted">{campo.hint}</p>
              </div>
            ))}

            <label
              htmlFor="limite-autoindicacao"
              className="flex cursor-pointer items-start gap-2 rounded-md border border-line-2 px-3 py-2"
            >
              <input
                id="limite-autoindicacao"
                type="checkbox"
                checked={
                  (rascunho.blockSelfReferral ?? data?.limits.blockSelfReferral) ?? true
                }
                onChange={(e) =>
                  setRascunho({ ...rascunho, blockSelfReferral: e.target.checked })
                }
                className="mt-1"
              />
              <span className="flex-1 text-sm">
                Bloquear autoindicação de afiliado
                <span className="block text-[11px] text-muted">
                  Impede o afiliado de comprar pelo próprio link no mesmo aparelho.
                </span>
              </span>
            </label>

            <Button
              onClick={() => salvar.mutate()}
              disabled={Object.keys(rascunho).length === 0 || salvar.isPending}
            >
              Salvar limites
            </Button>
          </div>
        </Card>

        <div className="space-y-3">
          <Card title="Bloqueios manuais">
            <div className="space-y-3 p-4">
              <div className="flex flex-wrap items-end gap-2">
                <div>
                  <label htmlFor="bloqueio-tipo" className="label-xs">Tipo</label>
                  <select
                    id="bloqueio-tipo"
                    value={bloqueio.kind}
                    onChange={(e) => setBloqueio({ ...bloqueio, kind: e.target.value })}
                    className="mt-1 rounded-md border border-line-2 px-3 py-2 text-sm"
                  >
                    <option value="phone">telefone</option>
                    <option value="device">aparelho (hash)</option>
                    <option value="ip">IP (hash)</option>
                  </select>
                </div>
                <div className="flex-1">
                  <label htmlFor="bloqueio-valor" className="label-xs">Valor</label>
                  <input
                    id="bloqueio-valor"
                    value={bloqueio.value}
                    onChange={(e) => setBloqueio({ ...bloqueio, value: e.target.value })}
                    className="tnum mt-1 w-full rounded-md border border-line-2 px-3 py-2 text-sm"
                  />
                </div>
                <Button
                  onClick={() => criarBloqueio.mutate()}
                  disabled={bloqueio.value.trim().length < 4}
                >
                  Bloquear
                </Button>
              </div>

              {data?.bloqueios.length === 0 ? (
                <Empty>Nenhum bloqueio manual.</Empty>
              ) : (
                <ul className="divide-y divide-line">
                  {data?.bloqueios.map((b) => (
                    <li key={b.id} className="flex items-center gap-2 py-2 text-sm">
                      <Pill status="expired">{TIPO_LABEL[b.kind] ?? b.kind}</Pill>
                      <span className="tnum flex-1 truncate text-xs">{b.value}</span>
                      <Button
                        variant="ghost"
                        className="px-2 py-1 text-xs"
                        onClick={() => remover.mutate(b.id)}
                      >
                        liberar
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </Card>

          <Card title="O que foi barrado" right={<span className="label-xs">7 dias</span>}>
            {data?.resumo.length === 0 ? (
              <Empty>Nada barrado na semana.</Empty>
            ) : (
              <ul className="divide-y divide-line">
                {data?.resumo
                  .sort((a, b) => b.total - a.total)
                  .map((r) => (
                    <li key={r.rule} className="flex items-center gap-3 px-4 py-2 text-sm">
                      <span className="flex-1">{REGRA_LABEL[r.rule] ?? r.rule}</span>
                      <span className="tnum">{r.total}</span>
                    </li>
                  ))}
              </ul>
            )}
          </Card>
        </div>
      </div>

      <div className="mt-3">
        <Card title="Últimas recusas" right={<span className="label-xs">telefone mascarado</span>}>
          {data?.eventos.length === 0 ? (
            <Empty>Nenhuma recusa registrada.</Empty>
          ) : (
            <ul className="divide-y divide-line">
              {data?.eventos.map((e) => (
                <li key={e.id} className="flex flex-wrap items-center gap-3 px-4 py-2 text-sm">
                  <span className="tnum text-[11px] text-muted">
                    {new Date(e.createdAt).toLocaleString("pt-BR")}
                  </span>
                  <Pill status="expired">{REGRA_LABEL[e.rule] ?? e.rule}</Pill>
                  <span className="tnum text-xs text-muted">{e.subject}</span>
                  <span className="flex-1 text-xs text-ink-2">{e.reason}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </PanelShell>
  );
}
