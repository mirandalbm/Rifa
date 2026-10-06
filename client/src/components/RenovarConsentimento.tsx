import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Janela } from "@/components/Janela";
import { Button } from "@/components/bits";

type Pedido =
  | { renovar: false }
  | { renovar: true; renovarAte: string; texto: string[]; chave: string };

/**
 * Quem foi verificado com a autorização de antes (ou sem nenhuma) precisa
 * autorizar de novo a comparação da foto (resposta 7.3 do advogado): ao
 * entrar, esta janela fica por cima da tela até a pessoa escolher —
 * autorizar e manter o selo, ou não autorizar e o selo sai. Não fecha no
 * Esc nem no fundo: as duas saídas são os dois botões. O texto e a chave vêm
 * do servidor (o mesmo da tela de verificação).
 */
export function RenovarConsentimento({ base }: { base: string }) {
  const qc = useQueryClient();
  const { data } = useQuery<Pedido>({ queryKey: [`${base}/consentimento`], staleTime: 5 * 60_000, retry: false });
  const [marcado, setMarcado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const feito = () => {
    qc.invalidateQueries({ queryKey: [`${base}/consentimento`] });
    qc.invalidateQueries({ queryKey: [base] });
  };
  const autorizar = useMutation({
    mutationFn: () =>
      apiRequest("POST", `${base}/consentimento`, { consentimentoFoto: true, consentimentoChave: data && data.renovar ? data.chave : "" }),
    onSuccess: feito,
    onError: (e: Error) => setErro(e.message),
  });
  const recusar = useMutation({
    mutationFn: () => apiRequest("DELETE", `${base}/consentimento`),
    onSuccess: feito,
    onError: (e: Error) => setErro(e.message),
  });
  if (!data?.renovar) return null;
  const ate = new Date(data.renovarAte).toLocaleDateString("pt-BR");
  const ocupado = autorizar.isPending || recusar.isPending;

  return (
    <Janela onFechar={() => {}} rotuloPor="titulo-renovar-consentimento" largura="sm:max-w-lg">
      <div className="p-4">
        <h2 id="titulo-renovar-consentimento" className="text-lg font-semibold">
          Confirme sua autorização para manter o selo
        </h2>
        <p className="mt-1 text-sm text-ink-2">
          Atualizamos nossa política de segurança. Para manter seu selo de verificado, confirme sua autorização. Sem ela,
          o selo sai em <span className="tnum">{ate}</span>.
        </p>
        <div className="mt-3 max-h-[45svh] space-y-1.5 overflow-y-auto rounded-md bg-mist px-3 py-2 text-xs text-ink-2">
          {data.texto.map((p) => (
            <p key={p}>{p}</p>
          ))}
        </div>
        <label className="mt-3 flex items-start gap-2 text-sm">
          <input type="checkbox" checked={marcado} onChange={(e) => setMarcado(e.target.checked)} className="mt-1" />
          <span>Li e autorizo a comparação da foto do meu perfil com a do meu documento.</span>
        </label>
        {erro ? (
          <p role="alert" className="mt-2 text-sm text-red">
            {erro}
          </p>
        ) : null}
        <div className="mt-4 flex flex-col gap-2 sm:flex-row-reverse">
          <Button disabled={!marcado || ocupado} onClick={() => autorizar.mutate()}>
            Autorizar e manter o selo
          </Button>
          <Button
            variant="ghost"
            disabled={ocupado}
            onClick={() => {
              if (window.confirm("Não autorizar? O selo de verificado sai agora.")) recusar.mutate();
            }}
          >
            Não autorizar (o selo sai)
          </Button>
        </div>
      </div>
    </Janela>
  );
}
