import { useId, useState } from "react";
import { Janela } from "@/components/Janela";
import { EditorDeFigurinhas, doGravado, paraEnviar, type FigurinhaDoForm } from "@/components/Figurinhas";
import { apiRequest } from "@/lib/queryClient";
import { type Figurinha, validarFigurinhas } from "@shared/figurinhasStory";

/**
 * As figurinhas do vídeo do Reels (Fase D do `docs/PLANO-FERRAMENTAS.md`): o
 * mesmo quadro das do story — contagem do sorteio, Comprar, texto e emoji —,
 * sempre da rifa do vídeo. A tela manda só os dados; quem confere é o servidor.
 */
export function FigurinhasDoReels({
  mediaId,
  gravadas,
  poster,
  camada,
  onFechar,
  aoSalvar,
}: {
  mediaId: string;
  gravadas: Figurinha[] | null | undefined;
  poster: string | null;
  camada?: string;
  onFechar: () => void;
  aoSalvar: () => void;
}) {
  const [figurinhas, setFigurinhas] = useState<FigurinhaDoForm[]>(() => (gravadas ?? []).map(doGravado));
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const id = useId();
  const titulo = `${id}-titulo`;
  let problema: string | null = null;
  try {
    validarFigurinhas(figurinhas.map(paraEnviar), { temRifa: true });
  } catch (e) {
    problema = (e as Error).message;
  }

  async function salvar() {
    setErro(null);
    setOcupado(true);
    try {
      await apiRequest("PUT", `/api/admin/media/${mediaId}/figurinhas`, { figurinhas: figurinhas.map(paraEnviar) });
      aoSalvar();
      onFechar();
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setOcupado(false);
    }
  }

  return (
    <Janela onFechar={onFechar} rotuloPor={titulo} camada={camada}>
      <div className="space-y-3 p-4">
        <h2 id={titulo} className="font-display text-base font-bold">
          Figurinhas do vídeo
        </h2>
        <EditorDeFigurinhas
          figurinhas={figurinhas}
          mudar={setFigurinhas}
          temRifa
          fundo={poster}
          explicacao="A contagem e o Comprar são da rifa do vídeo: o Comprar some sozinho quando a rifa para de vender."
        />
        {erro ? (
          <p role="alert" className="rounded-md bg-red-soft px-3 py-2 text-xs text-red">
            {erro}
          </p>
        ) : null}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onFechar} className="min-h-9 rounded-md border border-line px-4 text-sm font-semibold">
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => void salvar()}
            disabled={ocupado || Boolean(problema)}
            className="min-h-9 rounded-md bg-green px-4 text-sm font-semibold text-on-green disabled:opacity-50"
          >
            {ocupado ? "Salvando…" : "Salvar figurinhas"}
          </button>
        </div>
      </div>
    </Janela>
  );
}
