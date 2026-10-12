import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button, Card, Money } from "@/components/bits";
import { apiRequest } from "@/lib/queryClient";

interface Contestacao {
  cobranca: string;
  desde: string;
  provedor: string | null;
  contestadoCents: number | null;
  pagoCents: number | null;
  pedidos: string | null;
  organizacao: string | null;
}

/**
 * Contestação do Pix (MED, chargeback) que o provedor avisou sem cobrir o
 * pago: o sistema não desfez nada sozinho. Só a plataforma vê. Ela confere
 * no provedor, faz o que for preciso pelos caminhos de sempre (o estorno do
 * pedido é pelo chamado ou pelo aviso do provedor) e registra aqui o que
 * decidiu — só então a linha sai da Caixa de entrada. Sem dado do comprador.
 */
export function ContestacoesAConferir() {
  const qc = useQueryClient();
  const chave = ["/api/admin/contestacoes"];
  const { data } = useQuery<Contestacao[]>({ queryKey: chave });
  const [nota, setNota] = useState<Record<string, string>>({});
  const [erro, setErro] = useState<string | null>(null);
  const conferir = useMutation({
    mutationFn: (cobranca: string) =>
      apiRequest("POST", `/api/admin/contestacoes/${encodeURIComponent(cobranca)}/conferida`, { observacao: nota[cobranca] ?? "" }),
    onSuccess: () => {
      setErro(null);
      qc.invalidateQueries({ queryKey: chave });
      qc.invalidateQueries({ queryKey: ["/api/admin/caixa-de-entrada"] });
    },
    onError: (e: Error) => setErro(e.message),
  });

  if (!data || data.length === 0) return null;
  return (
    <section id="contestacoes" className="mb-4">
      <Card title="Contestações do Pix a conferir">
        <div className="space-y-3 p-4 text-sm">
          <p className="text-xs text-muted">
            O provedor avisou uma contestação (devolução por golpe ou chargeback) que não cobre o valor pago: nada foi
            desfeito no sistema. Confira no painel do provedor, resolva o pedido pelo caminho de sempre se for o caso, e
            registre aqui o que foi decidido.
          </p>
          {erro ? <p className="rounded-md bg-red-soft px-3 py-2 text-xs text-red">{erro}</p> : null}
          <ul className="space-y-3">
            {data.map((c) => (
              <li key={c.cobranca} className="rounded-md border border-line p-3">
                <p className="font-medium">
                  Pedido(s) <span className="tnum">{c.pedidos ?? "—"}</span>
                  {c.organizacao ? <span className="text-muted"> · {c.organizacao}</span> : null}
                </p>
                <p className="text-xs text-muted">
                  {c.contestadoCents !== null ? (
                    <>
                      Contestado <Money cents={c.contestadoCents} />
                    </>
                  ) : (
                    "Valor contestado não informado"
                  )}
                  {c.pagoCents !== null ? (
                    <>
                      {" "}
                      de <Money cents={c.pagoCents} />
                    </>
                  ) : null}{" "}
                  · {c.provedor ?? "provedor"} · desde <span className="tnum">{new Date(c.desde).toLocaleString("pt-BR")}</span>
                </p>
                <div className="mt-2 grid grid-cols-1 gap-2 xl:grid-cols-[minmax(0,1fr)_auto] xl:items-end">
                  <label className="block min-w-0">
                    <span className="label-xs">O que foi conferido e decidido</span>
                    <input
                      className="campo"
                      maxLength={1000}
                      value={nota[c.cobranca] ?? ""}
                      onChange={(e) => setNota({ ...nota, [c.cobranca]: e.target.value })}
                    />
                  </label>
                  <Button
                    disabled={conferir.isPending || (nota[c.cobranca] ?? "").trim().length < 5}
                    onClick={() => conferir.mutate(c.cobranca)}
                  >
                    Registrar a conferência
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </Card>
    </section>
  );
}
