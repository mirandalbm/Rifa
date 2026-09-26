import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, Button } from "@/components/bits";
import { apiRequest } from "@/lib/queryClient";
import { LIBERACAO_COMISSAO, NOME_LIBERACAO, type LiberacaoComissao } from "@shared/plataforma";

const EXPLICA: Record<LiberacaoComissao, string> = {
  apos_sorteio:
    "A comissão fica disponível depois do sorteio e do prazo de estorno. Protege contra pagar comissão de venda que voltou.",
  imediata:
    "A comissão fica disponível para saque assim que o pagamento é confirmado. Se houver estorno depois do saque, o valor aparece como comissão já paga, para cobrar do divulgador.",
};

/** Quando a comissão de afiliados e cambistas fica disponível — escolha da organização. */
export function ComissaoCard() {
  const qc = useQueryClient();
  const { data } = useQuery<{ liberacaoComissao: LiberacaoComissao | null; porOrganizacao: boolean }>(
    { queryKey: ["/api/admin/comissao"] },
  );
  const [modo, setModo] = useState<LiberacaoComissao>("apos_sorteio");
  const [ok, setOk] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    if (data?.liberacaoComissao) setModo(data.liberacaoComissao);
  }, [data]);

  const salvar = useMutation({
    mutationFn: () => apiRequest("PUT", "/api/admin/comissao", { liberacaoComissao: modo }),
    onSuccess: () => {
      setErro(null);
      setOk(true);
      qc.invalidateQueries({ queryKey: ["/api/admin/comissao"] });
    },
    onError: (e: Error) => {
      setOk(false);
      setErro(e.message);
    },
  });

  // O administrador geral não tem organização: escolhe por organização.
  if (!data || data.porOrganizacao) return null;

  return (
    <Card title="Comissão dos divulgadores">
      <div className="space-y-3 p-4">
        {erro ? <p className="rounded-md bg-red-soft px-3 py-2 text-sm text-red">{erro}</p> : null}
        {ok ? (
          <p className="rounded-md bg-green-soft px-3 py-2 text-sm text-green-deep">
            Salvo. Vale para as próximas vendas.
          </p>
        ) : null}
        {LIBERACAO_COMISSAO.map((m) => (
          <label key={m} className="flex items-start gap-2 text-sm">
            <input
              type="radio"
              name="liberacao"
              checked={modo === m}
              onChange={() => {
                setOk(false);
                setModo(m);
              }}
              className="mt-1 accent-[var(--green)]"
            />
            <span>
              {NOME_LIBERACAO[m]}
              <span className="block text-xs text-muted">{EXPLICA[m]}</span>
            </span>
          </label>
        ))}
        <Button onClick={() => salvar.mutate()} disabled={salvar.isPending}>
          Salvar
        </Button>
      </div>
    </Card>
  );
}
