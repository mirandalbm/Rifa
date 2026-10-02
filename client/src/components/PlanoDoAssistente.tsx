import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { formatBRL } from "@shared/format";
import {
  DIAS_DO_CICLO,
  type PagamentoIAPublico,
  type ResumoCobrancaIA,
} from "@shared/iaCobranca";
import { apiRequest } from "@/lib/queryClient";

export const CONTA_DA_IA = ["/api/ia/conta"];

const dia = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString("pt-BR") : "—";
const hora = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleTimeString("pt-BR", {
        hour: "2-digit",
        minute: "2-digit",
      })
    : "—";

/**
 * O plano de quem paga o assistente (organização ou afiliado). Enquanto há um
 * Pix em aberto, a tela confere a cada 5 s se ele foi pago. Quem decide o
 * valor é o servidor: daqui só sai o tipo, o pacote e o CPF/CNPJ do pagador.
 */
export function useContaDaIA(cobrado: boolean) {
  return useQuery<ResumoCobrancaIA>({
    queryKey: CONTA_DA_IA,
    enabled: cobrado,
    refetchInterval: (q) => (q.state.data?.pendente ? 5000 : false),
  });
}

/** A faixa de saldo sob o título da coluna. Estado em texto, nunca só cor. */
export function SaldoDoAssistente({
  conta,
  onAbrirPlano,
}: {
  conta: ResumoCobrancaIA;
  onAbrirPlano: () => void;
}) {
  const total = conta.franquiaCreditos + conta.avulsoCreditos;
  return (
    <div className="flex shrink-0 items-center gap-2 border-b border-line px-4 py-2 text-xs">
      <p className="min-w-0 flex-1 text-muted">
        {conta.ativa ? (
          <>
            <span
              className={`tnum font-semibold ${total > 0 ? "text-ink" : "text-red"}`}
            >
              {total}
            </span>{" "}
            crédito(s): <span className="tnum">{conta.franquiaCreditos}</span>{" "}
            da franquia até <span className="tnum">{dia(conta.cicloAte)}</span>
            {conta.avulsoCreditos !== 0 ? (
              <>
                {" "}
                e <span className="tnum">{conta.avulsoCreditos}</span> avulso(s)
              </>
            ) : null}
          </>
        ) : (
          "Sem assinatura ativa"
        )}
      </p>
      <button
        type="button"
        onClick={onAbrirPlano}
        className="shrink-0 rounded-md px-2 py-1 font-semibold text-green-deep hover:bg-mist"
      >
        Plano
      </button>
    </div>
  );
}

function PixEmAberto({ pix }: { pix: PagamentoIAPublico }) {
  const [copiado, setCopiado] = useState(false);
  return (
    <div className="space-y-2 rounded-md border border-yellow bg-yellow-soft p-3">
      <p className="font-semibold text-yellow-deep">
        {pix.tipo === "assinatura" ? "Assinatura" : "Pacote"} de{" "}
        <span className="tnum">{formatBRL(pix.valorCents)}</span> esperando o
        Pix
      </p>
      {pix.pixQr ? (
        <img
          src={pix.pixQr}
          alt="QR do Pix do assistente"
          className="h-40 w-40 bg-white"
        />
      ) : null}
      {pix.pixCopyPaste ? (
        <>
          <p className="tnum break-all rounded bg-white px-2 py-1 text-xs text-ink">
            {pix.pixCopyPaste}
          </p>
          <button
            type="button"
            className="rounded-md border border-line bg-white px-3 py-1.5 text-xs font-semibold text-ink"
            onClick={() => {
              void navigator.clipboard
                ?.writeText(pix.pixCopyPaste ?? "")
                .then(() => setCopiado(true));
            }}
          >
            {copiado ? "Copiado" : "Copiar o código Pix"}
          </button>
        </>
      ) : null}
      <p className="tnum text-xs text-muted" role="status">
        pedido {pix.codigo} · vale até {hora(pix.expiresAt)} · a tela confere
        sozinha quando o Pix cair
      </p>
    </div>
  );
}

export function PlanoDoAssistente({
  conta,
  onVoltar,
}: {
  conta: ResumoCobrancaIA;
  onVoltar?: () => void;
}) {
  const qc = useQueryClient();
  const [documento, setDocumento] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const pagar = useMutation({
    mutationFn: async (corpo: {
      tipo: "assinatura" | "avulso";
      pacote?: number;
    }) =>
      (await (
        await apiRequest("POST", "/api/ia/pagamentos", {
          ...corpo,
          documento: documento || undefined,
        })
      ).json()) as PagamentoIAPublico,
    onMutate: () => setErro(null),
    onSuccess: () => qc.invalidateQueries({ queryKey: CONTA_DA_IA }),
    onError: (e: Error) => setErro(e.message),
  });
  const { preco } = conta;
  const semPreco = preco.assinaturaCents <= 0;

  return (
    <section aria-labelledby="titulo-do-plano" className="space-y-4 text-sm">
      <div className="flex items-center gap-2">
        <h3 id="titulo-do-plano" className="flex-1 text-base font-semibold">
          Plano do assistente
        </h3>
        {onVoltar ? (
          <button
            type="button"
            onClick={onVoltar}
            className="rounded-md px-2 py-1 text-xs font-semibold text-green-deep hover:bg-mist"
          >
            Voltar à conversa
          </button>
        ) : null}
      </div>

      <p className={conta.ativa ? "text-ink" : "text-muted"}>
        {conta.ativa ? (
          <>
            Assinatura ativa até{" "}
            <span className="tnum font-semibold">{dia(conta.cicloAte)}</span>.{" "}
            <span className="tnum">{conta.franquiaCreditos}</span> crédito(s) da
            franquia e <span className="tnum">{conta.avulsoCreditos}</span>{" "}
            avulso(s).
          </>
        ) : (
          <>
            Para conversar com o assistente, assine. A franquia vale por{" "}
            <span className="tnum">{DIAS_DO_CICLO}</span> dias; renovar antes
            soma ao que sobrou.
          </>
        )}
      </p>
      {conta.ativa && conta.franquiaCreditos + conta.avulsoCreditos <= 0 ? (
        <p className="text-red">
          Os créditos acabaram. Compre um pacote ou renove a assinatura.
        </p>
      ) : null}

      {conta.pendente ? (
        <PixEmAberto pix={conta.pendente} />
      ) : semPreco ? (
        <p className="text-muted">
          A assinatura ainda não tem preço. Fale com o suporte.
        </p>
      ) : (
        <div className="space-y-3">
          {conta.pedeDocumento ? (
            <div>
              <label htmlFor="ia-documento" className="label-xs">
                CPF ou CNPJ de quem paga
              </label>
              <input
                id="ia-documento"
                className="campo tnum"
                inputMode="numeric"
                autoComplete="off"
                value={documento}
                onChange={(e) => setDocumento(e.target.value)}
              />
              <p className="mt-1 text-xs text-muted">
                Vai só para o Pix; não fica guardado.
              </p>
            </div>
          ) : null}
          <button
            type="button"
            disabled={pagar.isPending}
            onClick={() => pagar.mutate({ tipo: "assinatura" })}
            className="w-full rounded-md bg-green px-4 py-2.5 font-semibold text-on-green disabled:opacity-50"
          >
            {conta.ativa ? "Renovar" : "Assinar"} por{" "}
            <span className="tnum">{formatBRL(preco.assinaturaCents)}</span>:{" "}
            <span className="tnum">{preco.franquiaCreditos}</span> créditos por{" "}
            <span className="tnum">{DIAS_DO_CICLO}</span> dias
          </button>
          {preco.pacotes.length > 0 ? (
            <div className="space-y-2">
              <p className="text-xs font-semibold">
                Créditos avulsos (não vencem)
              </p>
              {!conta.ativa ? (
                <p className="text-xs text-muted">
                  Os pacotes ficam disponíveis com a assinatura ativa.
                </p>
              ) : null}
              {preco.pacotes.map((p, i) => (
                <button
                  key={p.creditos}
                  type="button"
                  disabled={!conta.ativa || pagar.isPending}
                  onClick={() => pagar.mutate({ tipo: "avulso", pacote: i })}
                  className="w-full rounded-md border border-line px-4 py-2 text-left hover:bg-mist disabled:opacity-50"
                >
                  <span className="tnum font-semibold">{p.creditos}</span>{" "}
                  créditos por{" "}
                  <span className="tnum">{formatBRL(p.precoCents)}</span>
                </button>
              ))}
            </div>
          ) : null}
        </div>
      )}
      {erro ? (
        <p role="alert" className="text-xs text-red">
          {erro}
        </p>
      ) : null}
      <p className="text-xs text-muted">
        Cada mensagem gasta os créditos que o assistente informa; primeiro sai a
        franquia, depois o avulso. O Pix é pago à plataforma.
      </p>
    </section>
  );
}
