import { useState } from "react";
import { Sparkles } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import type { SessaoDaIA } from "@shared/ia";
import type { TipoDeSugestao } from "@shared/sugestaoIA";

/**
 * "Sugerir com o assistente": pede ao assistente (pelo servidor, com os dados
 * da rifa) as frases da imagem ou a legenda, e mostra o que passou na régua.
 * Nada entra sozinho: a sugestão vira texto só no toque da pessoa. Só aparece
 * com o assistente ligado para quem está no painel; cada pedido é uma
 * mensagem paga do assistente, e a tela diz isso.
 */
export function SugestaoDoAssistente({
  url,
  tipo,
  onEscolher,
}: {
  /** A rota que pede (`…/sugerir`); o corpo leva só o tipo. */
  url: string;
  tipo: TipoDeSugestao;
  onEscolher: (texto: string) => void;
}) {
  const { data: sessao } = useQuery<SessaoDaIA>({ queryKey: ["/api/ia/sessao"], staleTime: 5 * 60_000 });
  const [pedindo, setPedindo] = useState(false);
  const [sugestoes, setSugestoes] = useState<string[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  if (!sessao?.ligado) return null;

  async function pedir() {
    setPedindo(true);
    setErro(null);
    try {
      const r = await apiRequest("POST", url, { tipo });
      const j = (await r.json()) as { sugestoes: string[] };
      setSugestoes(j.sugestoes);
    } catch (e) {
      setSugestoes(null);
      setErro((e as Error).message);
    } finally {
      setPedindo(false);
    }
  }

  const rotulo = tipo === "texto" ? "Sugerir frases com o assistente" : "Sugerir legenda com o assistente";
  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={() => void pedir()}
        disabled={pedindo}
        className="inline-flex min-h-8 items-center gap-1.5 rounded-md border border-line px-2.5 text-xs font-semibold text-ink-2 disabled:opacity-50"
      >
        <Sparkles size={14} aria-hidden /> {pedindo ? "Pedindo ao assistente…" : rotulo}
      </button>
      {sessao.cobrado ? <p className="text-[11px] text-muted">Cada pedido usa créditos do assistente.</p> : null}
      <div aria-live="polite">
        {erro ? <p className="text-xs text-red">{erro}</p> : null}
        {sugestoes && !sugestoes.length ? (
          <p className="text-xs text-muted">O assistente não trouxe nada que passe na régua (sem link, sem telefone, sem Pix por fora). Peça de novo.</p>
        ) : null}
        {sugestoes?.length ? (
          <>
            <p className="text-[11px] font-semibold text-ink-2">{tipo === "texto" ? "Toque numa frase para usar:" : "Toque para usar na legenda:"}</p>
            <ul className="mt-1 flex flex-col gap-1.5" aria-label="Sugestões do assistente">
              {sugestoes.map((s) => (
                <li key={s}>
                  <button
                    type="button"
                    onClick={() => onEscolher(s)}
                    className="w-full whitespace-pre-wrap break-words rounded-md border border-line bg-white px-2.5 py-1.5 text-left text-xs text-ink hover:border-green"
                  >
                    {s}
                  </button>
                </li>
              ))}
            </ul>
          </>
        ) : null}
      </div>
    </div>
  );
}
