import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button, Card, Money, Pill } from "@/components/bits";
import { apiRequest } from "@/lib/queryClient";
import { MOTIVOS_DO_PIX_TARDIO, SITUACOES_DO_PIX_TARDIO, type MotivoDoPixTardio, type SituacaoDoPixTardio } from "@shared/pixTardio";

interface Caso {
  id: string;
  motivo: MotivoDoPixTardio;
  status: SituacaoDoPixTardio;
  valorCents: number;
  provider: string | null;
  erro: string | null;
  observacao: string | null;
  createdAt: string;
  resolvidoEm: string | null;
  pedido: string;
  rifa: string | null;
}

const PILL: Record<SituacaoDoPixTardio, string> = {
  pendente: "pending",
  devolvendo: "pending",
  devolvido: "paid",
  resolvido: "paid",
};

/**
 * Pix que chegou tarde (reserva vencida ou rifa já sorteada): dinheiro que
 * entrou sem bilhete. Só a plataforma vê (o servidor recusa o organizador) —
 * devolve pelo provedor ou marca como resolvido por fora. Sem nome nem
 * telefone de quem pagou: o pedido basta para achar a cobrança.
 */
export function PixTardios() {
  const qc = useQueryClient();
  const chave = ["/api/admin/pix-tardios"];
  const { data } = useQuery<{ abertos: Caso[]; resolvidos: Caso[] }>({ queryKey: chave });
  const [nota, setNota] = useState<Record<string, string>>({});
  const [erro, setErro] = useState<string | null>(null);
  const feito = () => {
    setErro(null);
    qc.invalidateQueries({ queryKey: chave });
    qc.invalidateQueries({ queryKey: ["/api/admin/caixa-de-entrada"] });
  };
  const devolver = useMutation({
    mutationFn: (id: string) => apiRequest("POST", `/api/admin/pix-tardios/${id}/devolver`),
    onSuccess: feito,
    onError: (e: Error) => {
      setErro(e.message);
      qc.invalidateQueries({ queryKey: chave });
    },
  });
  const resolver = useMutation({
    mutationFn: (id: string) => apiRequest("POST", `/api/admin/pix-tardios/${id}/resolver`, { observacao: nota[id] ?? "" }),
    onSuccess: feito,
    onError: (e: Error) => setErro(e.message),
  });

  if (!data || (data.abertos.length === 0 && data.resolvidos.length === 0)) return null;
  return (
    <section id="pix-tardio" className="mb-4">
      <Card title="Pix a devolver">
        <div className="space-y-3 p-4 text-sm">
          <p className="text-xs text-muted">
            Pagamentos confirmados depois de a reserva vencer ou depois do sorteio: os números não ficaram com a pessoa,
            e o dinheiro precisa voltar. "Devolver" pede a devolução ao provedor, do valor exato; se ela já foi feita por
            fora, marque como resolvido dizendo como.
          </p>
          {erro ? <p className="rounded-md bg-red-soft px-3 py-2 text-xs text-red">{erro}</p> : null}
          {data.abertos.length === 0 ? <p className="text-xs text-muted">Nada a devolver agora.</p> : null}
          <ul className="space-y-3">
            {data.abertos.map((c) => (
              <li key={c.id} className="rounded-md border border-line p-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-medium">
                      Pedido <span className="tnum">#{c.pedido}</span> · <Money cents={c.valorCents} />
                    </p>
                    <p className="text-xs text-muted">
                      {c.rifa ?? "—"} · {MOTIVOS_DO_PIX_TARDIO[c.motivo] ?? c.motivo} · desde{" "}
                      <span className="tnum">{new Date(c.createdAt).toLocaleString("pt-BR")}</span>
                    </p>
                  </div>
                  <Pill status={PILL[c.status]}>{SITUACOES_DO_PIX_TARDIO[c.status]}</Pill>
                </div>
                {c.erro ? <p className="mt-2 text-xs text-red">{c.erro}</p> : null}
                {c.status === "pendente" || c.status === "devolvendo" ? (
                  // Botão, campo e botão lado a lado só a partir de `xl`: no tablet, com o
                  // menu aberto, o campo ficava espremido entre os dois botões.
                  <div className="mt-2 grid grid-cols-1 gap-2 xl:grid-cols-[auto_minmax(0,1fr)_auto] xl:items-end">
                    {c.status === "pendente" ? (
                      <Button disabled={devolver.isPending} onClick={() => devolver.mutate(c.id)}>
                        Devolver pelo provedor
                      </Button>
                    ) : (
                      // Em devolução: o provedor pode ter devolvido sem confirmar.
                      // Só se fecha depois de conferir lá — outro clique devolveria duas vezes.
                      <span className="text-xs text-muted">Confira no provedor antes de fechar.</span>
                    )}
                    <label className="block min-w-0">
                      <span className="label-xs">Como foi resolvido por fora</span>
                      <input
                        className="campo"
                        maxLength={300}
                        value={nota[c.id] ?? ""}
                        onChange={(e) => setNota({ ...nota, [c.id]: e.target.value })}
                      />
                    </label>
                    <Button
                      variant="ghost"
                      disabled={resolver.isPending || (nota[c.id] ?? "").trim().length < 5}
                      onClick={() => resolver.mutate(c.id)}
                    >
                      Marcar como resolvido
                    </Button>
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
          {data.resolvidos.length ? (
            <details>
              <summary className="cursor-pointer text-xs font-semibold">Resolvidos ({data.resolvidos.length})</summary>
              <ul className="mt-2 space-y-1 text-xs">
                {data.resolvidos.map((c) => (
                  <li key={c.id} className="flex flex-wrap items-center gap-2">
                    <span className="tnum">#{c.pedido}</span>
                    <Money cents={c.valorCents} />
                    <Pill status={PILL[c.status]}>{SITUACOES_DO_PIX_TARDIO[c.status]}</Pill>
                    {c.observacao ? <span className="text-muted">{c.observacao}</span> : null}
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
