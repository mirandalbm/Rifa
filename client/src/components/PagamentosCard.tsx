import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, Button, Pill } from "@/components/bits";
import { apiRequest } from "@/lib/queryClient";

interface Provedor {
  id: "mercadopago" | "asaas";
  nome: string;
  faltando: string[];
  exigeCpf: boolean;
  webhook: string;
}

interface Plataforma {
  provedorPix: Provedor["id"] | null;
  estornoManual: boolean;
  provedorEmUso: string;
  provedores: Provedor[];
}

/**
 * Pagamentos e estorno — decisões da plataforma, só do administrador geral.
 *
 * Trocar o provedor vale para as vendas novas; o Pix já emitido continua
 * sendo confirmado pelo provedor que o criou. O estorno pelo painel nasce
 * desligado: numa rifa, compra é participação.
 */
export function PagamentosCard() {
  const qc = useQueryClient();
  const { data } = useQuery<Plataforma>({ queryKey: ["/api/admin/plataforma"] });
  const [provedor, setProvedor] = useState<string>("");
  const [estorno, setEstorno] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [ok, setOk] = useState(false);

  useEffect(() => {
    if (!data) return;
    setProvedor(data.provedorPix ?? "");
    setEstorno(data.estornoManual);
  }, [data]);

  const salvar = useMutation({
    mutationFn: () =>
      apiRequest("PUT", "/api/admin/plataforma", {
        provedorPix: provedor || null,
        estornoManual: estorno,
      }),
    onSuccess: () => {
      setErro(null);
      setOk(true);
      qc.invalidateQueries({ queryKey: ["/api/admin/plataforma"] });
    },
    onError: (e: Error) => {
      setOk(false);
      setErro(e.message);
    },
  });

  if (!data) return null;
  const escolhido = data.provedores.find((p) => p.id === provedor);

  return (
    <Card
      title="Pagamentos e estorno"
      right={<span className="label-xs">em uso: {data.provedorEmUso}</span>}
    >
      <div className="space-y-4 p-4">
        {erro ? <p className="rounded-md bg-red-soft px-3 py-2 text-sm text-red">{erro}</p> : null}
        {ok ? (
          <p className="rounded-md bg-green-soft px-3 py-2 text-sm text-green-deep">Salvo.</p>
        ) : null}

        <fieldset className="space-y-2">
          <legend className="label-xs">Quem gera o Pix das vendas novas</legend>
          <label className="flex items-start gap-2 text-sm">
            <input
              type="radio"
              name="provedor"
              checked={provedor === ""}
              onChange={() => setProvedor("")}
              className="mt-1 accent-[var(--green)]"
            />
            <span>
              Seguir a configuração do servidor
              <span className="block text-xs text-muted">variável PAYMENT_PROVIDER no Railway</span>
            </span>
          </label>
          {data.provedores.map((p) => (
            <label key={p.id} className="flex items-start gap-2 text-sm">
              <input
                type="radio"
                name="provedor"
                checked={provedor === p.id}
                onChange={() => setProvedor(p.id)}
                className="mt-1 accent-[var(--green)]"
              />
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-center gap-2">
                  {p.nome}
                  {p.faltando.length ? (
                    <Pill status="pending">sem credencial</Pill>
                  ) : (
                    <Pill status="paid">pronto</Pill>
                  )}
                </span>
                <span className="block text-xs text-muted">
                  {p.id === "asaas"
                    ? "Divide na origem: a parte do promotor cai direto na carteira Asaas da organização. Pede CPF do comprador."
                    : "Tudo entra na conta da plataforma; o rateio fica no controle do painel."}
                </span>
                {p.faltando.length ? (
                  <span className="block text-xs text-red">
                    Falta no Railway: <span className="tnum">{p.faltando.join(", ")}</span>
                  </span>
                ) : null}
              </span>
            </label>
          ))}
        </fieldset>

        {escolhido ? (
          <div className="rounded-md bg-mist px-3 py-2 text-xs text-ink-2">
            Cadastre no painel do {escolhido.nome} o webhook:
            <span className="tnum mt-1 block break-all text-ink">{escolhido.webhook}</span>
          </div>
        ) : null}

        <div className="border-t border-line pt-3">
          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              checked={estorno}
              onChange={(e) => setEstorno(e.target.checked)}
              className="mt-1 h-4 w-4 accent-[var(--green)]"
            />
            <span>
              Aceitar pedidos de reembolso
              <span className="block text-xs text-muted">
                Desligado por padrão: numa rifa, a compra é participação. Ligado, o comprador
                logado pode pedir reembolso em "Minhas cotas", antes do sorteio, com o print do
                bilhete; a organização decide em Atendimento, e o protocolo e o prazo de
                devolução saem sozinhos. Com Pix, o dinheiro volta para a mesma conta que pagou.
                Estorno avisado pelo próprio banco é registrado mesmo com esta opção desligada.
              </span>
            </span>
          </label>
        </div>

        <Button onClick={() => salvar.mutate()} disabled={salvar.isPending}>
          Salvar
        </Button>
      </div>
    </Card>
  );
}
