import { useId, useRef, useState } from "react";
import { Janela } from "@/components/Janela";
import { apiRequest } from "@/lib/queryClient";
import { duracao } from "@shared/publicacao";
import { CORTE_MINIMO_S } from "@shared/corte";

const virgula = (n: number) => n.toFixed(1).replace(".", ",");

/**
 * Cortar o início e o fim do vídeo (Fase D do `docs/PLANO-FERRAMENTAS.md`):
 * a pessoa marca onde começa e onde termina e o servidor copia o trecho com o
 * `ffmpeg`, sem recomprimir — a tela manda só os dois segundos. Em modo cópia o
 * corte cai no quadro-chave anterior ao início, e a tela diz isso. Serve o
 * vídeo do carrossel e o do Reels.
 */
export function CortarVideo({
  mediaId,
  url,
  poster,
  durationS,
  camada,
  onFechar,
  aoCortar,
}: {
  mediaId: string;
  url: string;
  poster: string | null;
  durationS: number;
  camada?: string;
  onFechar: () => void;
  aoCortar: () => void;
}) {
  const video = useRef<HTMLVideoElement>(null);
  const [inicio, setInicio] = useState(0);
  const [fim, setFim] = useState(durationS);
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const id = useId();
  const titulo = `${id}-titulo`;
  const fica = Math.max(0, fim - inicio);
  const curto = fica < CORTE_MINIMO_S;
  const inteiro = inicio === 0 && fim >= durationS - 0.1;

  function irPara(t: number) {
    const v = video.current;
    if (!v) return;
    v.pause();
    v.currentTime = t;
  }

  function mudarInicio(t: number) {
    setInicio(Math.min(t, Math.max(0, fim - CORTE_MINIMO_S)));
    irPara(t);
  }

  function mudarFim(t: number) {
    setFim(Math.max(t, Math.min(durationS, inicio + CORTE_MINIMO_S)));
    irPara(t);
  }

  function verOTrecho() {
    const v = video.current;
    if (!v) return;
    v.currentTime = inicio;
    void v.play();
  }

  async function cortar() {
    setErro(null);
    setOcupado(true);
    try {
      await apiRequest("PUT", `/api/admin/media/${mediaId}/corte`, { inicio, fim });
      aoCortar();
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
          Cortar o vídeo
        </h2>
        <p className="text-xs text-muted">
          Marque onde o vídeo começa e onde termina. O corte é feito sem recomprimir, por isso pode começar um pouco antes do ponto escolhido (no
          quadro-chave mais próximo). O que fica de fora é apagado.
        </p>
        <video
          ref={video}
          src={url}
          poster={poster ?? undefined}
          muted
          playsInline
          preload="auto"
          onTimeUpdate={(e) => {
            if (e.currentTarget.currentTime >= fim) e.currentTarget.pause();
          }}
          aria-label="Prévia do trecho"
          className="mx-auto max-h-[45vh] w-full rounded-lg bg-black object-contain"
        />
        <label className="block">
          <span className="mb-1 flex items-center justify-between text-xs font-semibold">
            Começa em
            <span className="tnum font-normal text-muted">{virgula(inicio)} s</span>
          </span>
          <input
            type="range"
            min={0}
            max={durationS}
            step={0.1}
            value={inicio}
            onChange={(e) => mudarInicio(Number(e.target.value))}
            className="w-full accent-green"
            aria-valuetext={`${inicio.toFixed(1)} segundos`}
          />
        </label>
        <label className="block">
          <span className="mb-1 flex items-center justify-between text-xs font-semibold">
            Termina em
            <span className="tnum font-normal text-muted">{virgula(fim)} s</span>
          </span>
          <input
            type="range"
            min={0}
            max={durationS}
            step={0.1}
            value={fim}
            onChange={(e) => mudarFim(Number(e.target.value))}
            className="w-full accent-green"
            aria-valuetext={`${fim.toFixed(1)} segundos`}
          />
        </label>
        <p className="tnum text-xs text-ink-2">
          Fica com {duracao(Math.round(fica))} de {duracao(durationS)}.
        </p>
        {erro ? (
          <p role="alert" className="rounded-md bg-red-soft px-3 py-2 text-xs text-red">
            {erro}
          </p>
        ) : null}
        <div className="flex flex-wrap justify-end gap-2">
          <button type="button" onClick={verOTrecho} className="mr-auto min-h-9 rounded-md border border-line px-4 text-sm font-semibold">
            Ver o trecho
          </button>
          <button type="button" onClick={onFechar} className="min-h-9 rounded-md border border-line px-4 text-sm font-semibold">
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => void cortar()}
            disabled={ocupado || curto || inteiro}
            className="min-h-9 rounded-md bg-green px-4 text-sm font-semibold text-on-green disabled:opacity-50"
          >
            {ocupado ? "Cortando…" : "Cortar"}
          </button>
        </div>
      </div>
    </Janela>
  );
}
