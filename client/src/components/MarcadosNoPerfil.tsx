import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/bits";
import { CartaoDeDivulgacao, type Divulgacao } from "@/components/DivulgacoesDaRifa";
import { apiRequest } from "@/lib/queryClient";

interface PedidoDeMarcacao {
  id: string;
  quem: string;
  rifa: string;
  legenda: string;
  criadaEm: string;
}

/**
 * As publicações em que a pessoa foi marcada e aceitou, no ar. Quem vê o
 * perfil vê; quem está no próprio perfil também vê os pedidos que espera
 * aceitar (`PedidosDeMarcacao`). Só o aceite põe a publicação aqui.
 */
export function MarcadosNoPerfil({ apelido, proprio }: { apelido: string; proprio: boolean }) {
  const { data, isLoading, error } = useQuery<Divulgacao[]>({
    queryKey: [`/api/public/u/${apelido}/marcados`],
  });
  return (
    <>
      {proprio ? <PedidosDeMarcacao apelido={apelido} /> : null}
      {isLoading ? <p className="px-4 py-6 text-center text-sm text-muted">Carregando…</p> : null}
      {error ? <p role="alert" className="px-4 py-6 text-center text-sm text-red">Não consegui carregar as publicações marcadas.</p> : null}
      {data && data.length === 0 ? (
        <p className="mx-auto max-w-md px-4 py-6 text-center text-[13px] leading-[18px] text-muted">
          {proprio
            ? "Quando alguém marcar você numa publicação e você aceitar, ela aparece aqui."
            : "Nenhuma publicação marcada ainda."}
        </p>
      ) : null}
      {data && data.length ? (
        <div className="grid grid-cols-1 items-start gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {data.map((d) => (
            <CartaoDeDivulgacao key={d.id} d={d} />
          ))}
        </div>
      ) : null}
    </>
  );
}

/**
 * Os pedidos de marcação que esperam a resposta de quem está logado. Aceitar
 * põe a publicação no perfil; recusar tira o pedido. Só aparece quando há
 * pedido, então quem não foi marcado não vê bloco nenhum.
 */
function PedidosDeMarcacao({ apelido }: { apelido: string }) {
  const qc = useQueryClient();
  const [erro, setErro] = useState<string | null>(null);
  const { data } = useQuery<PedidoDeMarcacao[]>({ queryKey: ["/api/public/conta/marcacoes"] });
  const atualizar = () => {
    qc.invalidateQueries({ queryKey: ["/api/public/conta/marcacoes"] });
    qc.invalidateQueries({ queryKey: [`/api/public/u/${apelido}/marcados`] });
  };
  const aceitar = useMutation({
    mutationFn: (id: string) => apiRequest("POST", `/api/public/marcacoes/${id}/aceitar`),
    onSuccess: () => {
      setErro(null);
      atualizar();
    },
    onError: (e: Error) => setErro(e.message),
  });
  const recusar = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/public/marcacoes/${id}`),
    onSuccess: () => {
      setErro(null);
      atualizar();
    },
    onError: (e: Error) => setErro(e.message),
  });
  if (!data?.length) return null;
  const ocupado = aceitar.isPending || recusar.isPending;
  return (
    <section aria-labelledby="pedidos-de-marcacao" className="mx-auto mb-4 max-w-xl px-4">
      <h2 id="pedidos-de-marcacao" className="text-sm font-semibold text-ink-2">
        Pedidos para você aceitar ({data.length})
      </h2>
      <p className="mt-1 text-[12px] text-muted">Só vai ao seu perfil o que você aceitar. Você pode tirar a marcação depois.</p>
      <ul className="mt-2 space-y-2">
        {data.map((p) => (
          <li key={p.id} className="rounded-xl border border-line-2 bg-white p-3 text-sm">
            <p>
              <strong className="font-semibold">{p.quem}</strong> marcou você numa publicação da rifa <strong className="font-semibold">{p.rifa}</strong>.
            </p>
            <p className="mt-1 line-clamp-2 text-muted">{p.legenda}</p>
            <div className="mt-2 flex flex-wrap gap-2">
              <Button disabled={ocupado} onClick={() => aceitar.mutate(p.id)}>
                Aceitar
              </Button>
              <Button variant="ghost" disabled={ocupado} onClick={() => recusar.mutate(p.id)}>
                Recusar
              </Button>
            </div>
          </li>
        ))}
      </ul>
      {erro ? <p role="alert" className="mt-2 text-xs text-red">{erro}</p> : null}
    </section>
  );
}
