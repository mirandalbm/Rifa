import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/bits";
import { CartaoDoPainel } from "@/components/painel";
import { Trevo, useCoresDoSelo } from "@/components/SeloVerificado";
import { apiRequest } from "@/lib/queryClient";
import {
  NOME_SUJEITO,
  PALETA_DO_SELO,
  ROTULO_DO_SELO,
  SUJEITOS,
  validarCoresDoSelo,
  type CorDoSelo,
  type CoresDoSelo,
} from "@shared/verificacao";

/**
 * A plataforma escolhe a cor do selo de cada um, entre as 12 da paleta
 * (todas com contraste nos dois temas). Três cores diferentes: é a cor que
 * diz de quem é o selo.
 */
export function CoresDoSeloCard() {
  const qc = useQueryClient();
  const atuais = useCoresDoSelo();
  const [cores, setCores] = useState<CoresDoSelo>(atuais);
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null);
  useEffect(() => setCores(atuais), [atuais]);

  let problema: string | null = null;
  try {
    validarCoresDoSelo(cores);
  } catch (e) {
    problema = (e as Error).message;
  }
  const salvar = useMutation({
    mutationFn: () => apiRequest("PUT", "/api/admin/selos", { cores }),
    onSuccess: () => {
      setMsg({ ok: true, texto: "Cores salvas." });
      qc.invalidateQueries({ queryKey: ["/api/public/selos"] });
    },
    onError: (e: Error) => setMsg({ ok: false, texto: e.message }),
  });

  return (
    <CartaoDoPainel titulo="Selo de verificado">
        <div className="grid grid-cols-1 gap-4 px-5 pb-5 text-sm">
          <p className="text-muted">
            O trevo com o sinal de confirmação aparece ao lado do nome de quem teve documentos (e, para pessoa, a foto)
            conferidos. Escolha a cor de cada um entre as 12 da paleta.
          </p>
          {SUJEITOS.map((s) => (
            <fieldset key={s} className="min-w-0">
              <legend className="mb-2 flex items-center gap-2 font-semibold">
                <Trevo cor={PALETA_DO_SELO[cores[s]].hex} tamanho={20} rotulo={ROTULO_DO_SELO[s]} />
                {NOME_SUJEITO[s]} — <span className="font-normal text-muted">{PALETA_DO_SELO[cores[s]].nome}</span>
              </legend>
              <div className="flex flex-wrap gap-1.5">
                {(Object.entries(PALETA_DO_SELO) as [CorDoSelo, { nome: string; hex: string }][]).map(([k, c]) => {
                  const escolhida = cores[s] === k;
                  return (
                    <button
                      key={k}
                      type="button"
                      aria-pressed={escolhida}
                      aria-label={`${c.nome} para ${NOME_SUJEITO[s].toLowerCase()}`}
                      title={c.nome}
                      onClick={() => {
                        setMsg(null);
                        setCores({ ...cores, [s]: k });
                      }}
                      className={`rounded-full p-1 ${escolhida ? "ring-2 ring-ink" : "hover:bg-mist"}`}
                    >
                      <Trevo cor={c.hex} tamanho={24} rotulo={c.nome} />
                    </button>
                  );
                })}
              </div>
            </fieldset>
          ))}
          {problema ? (
            <p role="alert" className="text-xs text-red">
              {problema}
            </p>
          ) : null}
          {msg ? (
            <p role={msg.ok ? "status" : "alert"} className={`rounded-md px-3 py-2 ${msg.ok ? "bg-green-soft text-green-deep" : "bg-red-soft text-red"}`}>
              {msg.texto}
            </p>
          ) : null}
          <div>
            <Button disabled={Boolean(problema) || salvar.isPending} onClick={() => salvar.mutate()}>
              Salvar cores
            </Button>
          </div>
        </div>
    </CartaoDoPainel>
  );
}
