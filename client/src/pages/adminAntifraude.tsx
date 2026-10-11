import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { PanelShell } from "@/components/AppShell";
import { Button, Caixa, Campo, Pill, Empty, Kpi } from "@/components/bits";
import { Abas, CartaoDoPainel, TabelaOuCartoes } from "@/components/painel";
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

/** "Liberar" um bloqueio: o valor vai no nome do botão (são vários na lista). */
function Liberar({ id, valor, aoLiberar }: { id: string; valor: string; aoLiberar: (id: string) => void }) {
  return (
    <Button variant="cinza" className="h-9 px-3 text-xs" aria-label={`Liberar ${valor}`} onClick={() => aoLiberar(id)}>
      Liberar
    </Button>
  );
}

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

      <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-3 md:mb-6 md:gap-6">
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

      {/* Uma aba por assunto: a lista das recusas é longa e empurrava os limites para baixo. */}
      <Abas
        rotulo="Assuntos do antifraude"
        abas={[
          {
            id: "limites",
            titulo: "Limites",
            conteudo: (
              <div className="max-w-2xl">
                <CartaoDoPainel titulo="Limites">
                  <div className="space-y-3.5 px-5 pb-5">
                    <p className="text-[13px] leading-[18px] text-ink-2">
                      Reservar cota e não pagar é o jeito mais barato de travar uma rifa: a
                      campanha parece vendida e ninguém consegue comprar. Por isso os dois
                      primeiros limites são os que mais protegem.
                    </p>

                    {LIMIT_FIELDS.map((campo) => (
                      // No celular o rótulo vai acima do campo; do tablet em diante, ao lado (Figma).
                      <Campo
                        key={campo.key}
                        rotulo={campo.label}
                        dica={campo.hint}
                        className="sm:flex sm:flex-wrap sm:items-center sm:gap-x-[10px] [&>p]:basis-full"
                      >
                        <input
                          id={`limite-${campo.key}`}
                          type="number"
                          min={campo.min}
                          max={campo.max}
                          value={valor(campo.key)}
                          onChange={(e) =>
                            setRascunho({ ...rascunho, [campo.key]: Number(e.target.value) })
                          }
                          className="campo tnum block w-[120px] text-sm sm:mt-0"
                        />
                      </Campo>
                    ))}

                    <Caixa
                      id="limite-autoindicacao"
                      className="rounded-lg border border-line-2 px-[13px] py-[13px]"
                      marcada={(rascunho.blockSelfReferral ?? data?.limits.blockSelfReferral) ?? true}
                      aoMudar={(marcada) => setRascunho({ ...rascunho, blockSelfReferral: marcada })}
                      sub="Impede o afiliado de comprar pelo próprio link no mesmo aparelho."
                    >
                      Bloquear autoindicação de afiliado
                    </Caixa>

                    <Button
                      onClick={() => salvar.mutate()}
                      disabled={Object.keys(rascunho).length === 0 || salvar.isPending}
                    >
                      Salvar limites
                    </Button>
                  </div>
                </CartaoDoPainel>
              </div>
            ),
          },
          {
            id: "bloqueios",
            titulo: "Bloqueios manuais",
            conteudo: (
              <CartaoDoPainel titulo="Bloqueios manuais" subtitulo="Telefone, aparelho ou IP que não compra nem entra — nem na maquininha.">
                <div className="flex flex-col gap-3 px-5 pb-4 sm:flex-row sm:flex-wrap sm:items-end">
                  <Campo rotulo="Tipo">
                    <select
                      id="bloqueio-tipo"
                      value={bloqueio.kind}
                      onChange={(e) => setBloqueio({ ...bloqueio, kind: e.target.value })}
                      className="campo block text-sm sm:w-48"
                    >
                      <option value="phone">telefone</option>
                      <option value="device">aparelho (hash)</option>
                      <option value="ip">IP (hash)</option>
                    </select>
                  </Campo>
                  <Campo rotulo="Valor" className="min-w-0 flex-1">
                    <input
                      id="bloqueio-valor"
                      value={bloqueio.value}
                      onChange={(e) => setBloqueio({ ...bloqueio, value: e.target.value })}
                      className="campo tnum text-sm"
                    />
                  </Campo>
                  <Button
                    onClick={() => criarBloqueio.mutate()}
                    disabled={bloqueio.value.trim().length < 4}
                  >
                    Bloquear
                  </Button>
                </div>

                {data?.bloqueios.length === 0 ? (
                  <Empty>Nenhum bloqueio manual. Para barrar alguém, escolha o tipo, informe o valor e toque em Bloquear.</Empty>
                ) : (
                  <div className="border-t border-line">
                  <TabelaOuCartoes
                    aria="Bloqueios manuais"
                    itens={data?.bloqueios ?? []}
                    chave={(b) => b.id}
                    colunas={[
                      { titulo: "Tipo", celula: (b) => <Pill status="expired">{TIPO_LABEL[b.kind] ?? b.kind}</Pill> },
                      { titulo: "Valor", celula: (b) => <span className="tnum block max-w-[360px] truncate text-xs">{b.value}</span> },
                      { titulo: "Motivo", celula: (b) => <span className="text-xs text-ink-2">{b.reason ?? "—"}</span> },
                      { titulo: "Desde", celula: (b) => <span className="tnum whitespace-nowrap text-xs text-muted">{new Date(b.createdAt).toLocaleString("pt-BR")}</span> },
                      { titulo: "", direita: true, celula: (b) => <Liberar id={b.id} valor={b.value} aoLiberar={(id) => remover.mutate(id)} /> },
                    ]}
                    cartao={(b) => (
                      <div className="flex min-w-0 items-center gap-2 text-sm">
                        <Pill status="expired">{TIPO_LABEL[b.kind] ?? b.kind}</Pill>
                        <span className="min-w-0 flex-1">
                          <span className="tnum block truncate text-xs">{b.value}</span>
                          {b.reason ? <span className="block text-xs text-muted">{b.reason}</span> : null}
                        </span>
                        <Liberar id={b.id} valor={b.value} aoLiberar={(id) => remover.mutate(id)} />
                      </div>
                    )}
                  />
                  </div>
                )}
              </CartaoDoPainel>
            ),
          },
          {
            id: "barrado",
            titulo: "O que foi barrado",
            conteudo: (
              <div className="grid grid-cols-1 items-start gap-4 md:gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
                <CartaoDoPainel titulo="O que foi barrado" acao={<span className="label-xs">7 dias</span>}>
                  {data?.resumo.length === 0 ? (
                    <Empty>Nada barrado na semana.</Empty>
                  ) : (
                    <ul className="divide-y divide-line border-t border-line">
                      {data?.resumo
                        .sort((a, b) => b.total - a.total)
                        .map((r) => (
                          <li key={r.rule} className="flex items-center gap-3 px-5 py-2.5 text-sm">
                            <span className="flex-1">{REGRA_LABEL[r.rule] ?? r.rule}</span>
                            <span className="tnum">{r.total}</span>
                          </li>
                        ))}
                    </ul>
                  )}
                </CartaoDoPainel>
                <CartaoDoPainel
                  titulo="Últimas recusas"
                  subtitulo="O motivo é o que o comprador leu na tela; o telefone vai mascarado, IP e aparelho em hash."
                >
                  {data?.eventos.length === 0 ? (
                    <Empty>Nenhuma recusa registrada.</Empty>
                  ) : (
                    <TabelaOuCartoes
                      aria="Últimas recusas"
                      itens={data?.eventos ?? []}
                      chave={(e) => e.id}
                      colunas={[
                        { titulo: "Quando", celula: (e) => <span className="tnum whitespace-nowrap text-xs text-muted">{new Date(e.createdAt).toLocaleString("pt-BR")}</span> },
                        { titulo: "Regra", celula: (e) => <span className="whitespace-nowrap"><Pill status="expired">{REGRA_LABEL[e.rule] ?? e.rule}</Pill></span> },
                        { titulo: "Quem", celula: (e) => <span className="tnum text-xs text-muted">{e.subject ?? "—"}</span> },
                        { titulo: "Motivo", celula: (e) => <span className="text-xs text-ink-2">{e.reason}</span> },
                      ]}
                      cartao={(e) => (
                        <div className="min-w-0 space-y-1 text-sm">
                          <div className="flex flex-wrap items-center gap-2">
                            <Pill status="expired">{REGRA_LABEL[e.rule] ?? e.rule}</Pill>
                            <span className="tnum text-[11px] text-muted">{new Date(e.createdAt).toLocaleString("pt-BR")}</span>
                          </div>
                          <p className="text-xs text-ink-2">{e.reason}</p>
                          {e.subject ? <p className="tnum text-xs text-muted">{e.subject}</p> : null}
                        </div>
                      )}
                    />
                  )}
                </CartaoDoPainel>
              </div>
            ),
          },
        ]}
      />
    </PanelShell>
  );
}
