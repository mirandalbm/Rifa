import { useId, useRef, useState } from "react";
import { Janela } from "@/components/Janela";
import { apiRequest } from "@/lib/queryClient";
import { duracao } from "@shared/publicacao";

/**
 * Escolher a capa do vídeo (Fase D do `docs/PLANO-FERRAMENTAS.md`): a pessoa
 * arrasta até o quadro que quer e o servidor tira aquele quadro com o
 * `ffmpeg` — a tela manda só o segundo, nunca uma imagem. Serve o vídeo do
 * carrossel e o do Reels.
 */
export function EscolherCapa({
  mediaId,
  url,
  poster,
  durationS,
  camada,
  onFechar,
  aoEscolher,
}: {
  mediaId: string;
  url: string;
  poster: string | null;
  durationS: number;
  camada?: string;
  onFechar: () => void;
  aoEscolher: () => void;
}) {
  const video = useRef<HTMLVideoElement>(null);
  const [instante, setInstante] = useState(0.5 <= durationS ? 0.5 : 0);
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const id = useId();
  const titulo = `${id}-titulo`;

  function irPara(t: number) {
    setInstante(t);
    if (video.current) video.current.currentTime = t;
  }

  async function usar() {
    setErro(null);
    setOcupado(true);
    try {
      await apiRequest("PUT", `/api/admin/media/${mediaId}/capa`, { instante });
      aoEscolher();
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
          Capa do vídeo
        </h2>
        <p className="text-xs text-muted">Arraste até o quadro que aparece antes do play. A capa muda a qualquer hora.</p>
        <video
          ref={video}
          src={url}
          poster={poster ?? undefined}
          muted
          playsInline
          preload="auto"
          onLoadedMetadata={(e) => {
            e.currentTarget.currentTime = instante;
          }}
          aria-label="Prévia do quadro escolhido"
          className="mx-auto max-h-[50vh] w-full rounded-lg bg-black object-contain"
        />
        <label className="block">
          <span className="mb-1 flex items-center justify-between text-xs font-semibold">
            Quadro da capa
            <span className="tnum font-normal text-muted">
              {instante.toFixed(1).replace(".", ",")} s de {duracao(durationS)}
            </span>
          </span>
          <input
            type="range"
            min={0}
            max={durationS}
            step={0.1}
            value={instante}
            onChange={(e) => irPara(Number(e.target.value))}
            className="w-full accent-green"
            aria-valuetext={`${instante.toFixed(1)} segundos`}
          />
        </label>
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
            onClick={() => void usar()}
            disabled={ocupado}
            className="min-h-9 rounded-md bg-green px-4 text-sm font-semibold text-on-green disabled:opacity-50"
          >
            {ocupado ? "Tirando o quadro…" : "Usar este quadro"}
          </button>
        </div>
      </div>
    </Janela>
  );
}
