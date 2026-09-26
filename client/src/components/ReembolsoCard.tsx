import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, Button } from "@/components/bits";
import { apiRequest } from "@/lib/queryClient";
import { PRAZO_ESTORNO_MIN, PRAZO_ESTORNO_MAX } from "@shared/chamados";

/**
 * Prazo de devolução da organização: quantos dias ela tem, depois de aprovar
 * um pedido de reembolso, para devolver o dinheiro. Sai no protocolo que o
 * comprador recebe — é compromisso, não sugestão.
 */
export function ReembolsoCard() {
  const qc = useQueryClient();
  const { data } = useQuery<{ prazoEstornoDias: number | null; porOrganizacao: boolean }>({
    queryKey: ["/api/admin/reembolso"],
  });
  const [dias, setDias] = useState("7");
  const [ok, setOk] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    if (data?.prazoEstornoDias) setDias(String(data.prazoEstornoDias));
  }, [data]);

  const salvar = useMutation({
    mutationFn: () => apiRequest("PUT", "/api/admin/reembolso", { prazoEstornoDias: Number(dias) }),
    onSuccess: () => {
      setErro(null);
      setOk(true);
      qc.invalidateQueries({ queryKey: ["/api/admin/reembolso"] });
    },
    onError: (e: Error) => {
      setOk(false);
      setErro(e.message);
    },
  });

  if (!data || data.porOrganizacao) return null;

  return (
    <Card title="Prazo de reembolso">
      <div className="space-y-3 p-4 text-sm">
        {erro ? <p className="rounded-md bg-red-soft px-3 py-2 text-red">{erro}</p> : null}
        {ok ? (
          <p className="rounded-md bg-green-soft px-3 py-2 text-green-deep">
            Salvo. Vale para os próximos chamados aprovados.
          </p>
        ) : null}
        <label htmlFor="prazo" className="label-xs">
          Dias para devolver, depois de aprovar o chamado
        </label>
        <input
          id="prazo"
          type="number"
          min={PRAZO_ESTORNO_MIN}
          max={PRAZO_ESTORNO_MAX}
          value={dias}
          onChange={(e) => {
            setOk(false);
            setDias(e.target.value);
          }}
          className="tnum w-24 rounded-md border border-line-2 px-3 py-2"
        />
        <p className="text-xs text-muted">
          O comprador pede o reembolso em "Minhas cotas", logado e com o print do bilhete. Ao
          aprovar em Atendimento, o protocolo sai com a data-limite calculada por este prazo (de{" "}
          <span className="tnum">{PRAZO_ESTORNO_MIN}</span> a <span className="tnum">{PRAZO_ESTORNO_MAX}</span>{" "}
          dias).
        </p>
        <Button onClick={() => salvar.mutate()} disabled={salvar.isPending}>
          Salvar
        </Button>
      </div>
    </Card>
  );
}
