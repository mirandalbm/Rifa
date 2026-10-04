import { useState } from "react";
import { Button } from "@/components/bits";
import { DIVULGACAO_VIDEO_MAX_BYTES, DIVULGACAO_VIDEO_MAX_SEGUNDOS } from "@shared/divulgacao";

/** O vídeo de uma peça como a tela recebe: o endereço (com `?v=` da troca), o pôster e as medidas. */
export interface VideoDaPeca {
  url: string;
  poster: string | null;
  largura: number;
  altura: number;
}

function lerComoDataUrl(arquivo: File): Promise<string> {
  return new Promise((ok, falha) => {
    const r = new FileReader();
    r.onload = () => ok(String(r.result));
    r.onerror = () => falha(new Error("Não consegui ler o vídeo."));
    r.readAsDataURL(arquivo);
  });
}

/**
 * O vídeo próprio do afiliado na peça (um só, no lugar das fotos). Vai como
 * veio: a tela só confere tipo e tamanho, por cortesia — duração e medidas
 * quem mede é o servidor. Na edição, o vídeo da peça (`atual`) só vai de novo
 * se a pessoa trocar: sem `video` no corpo, o servidor mantém o que estava;
 * `null` tira.
 */
export function useVideoProprio(aoErrar: (texto: string) => void) {
  const [novo, setNovo] = useState<{ dataUrl: string; previa: string } | null>(null);
  const [atual, setAtual] = useState<VideoDaPeca | null>(null);
  const [trocou, setTrocou] = useState(false);
  const limparPrevia = () => {
    if (novo) URL.revokeObjectURL(novo.previa);
  };
  return {
    novo,
    atual,
    trocou,
    /** A peça terá vídeo se salvar agora? */
    tem: trocou ? Boolean(novo) : Boolean(atual),
    async escolher(arquivos: FileList | null) {
      const a = arquivos?.[0];
      if (!a) return;
      if (!/^video\/(mp4|quicktime)$/.test(a.type)) return aoErrar("Envie o vídeo em MP4 ou MOV.");
      if (a.size > DIVULGACAO_VIDEO_MAX_BYTES) {
        return aoErrar(`O vídeo passa de ${DIVULGACAO_VIDEO_MAX_BYTES / 1024 / 1024} MB. Exporte mais leve.`);
      }
      try {
        const dataUrl = await lerComoDataUrl(a);
        limparPrevia();
        setNovo({ dataUrl, previa: URL.createObjectURL(a) });
        setTrocou(true);
        setAtual(null);
      } catch (e) {
        aoErrar((e as Error).message);
      }
    },
    tirar() {
      limparPrevia();
      setNovo(null);
      setAtual(null);
      setTrocou(true);
    },
    /** Abre a edição de uma peça: o vídeo dela aparece, sem ir de novo. */
    carregar(v: VideoDaPeca | null) {
      limparPrevia();
      setNovo(null);
      setAtual(v);
      setTrocou(false);
    },
    limpar() {
      limparPrevia();
      setNovo(null);
      setAtual(null);
      setTrocou(false);
    },
    /** O pedaço do corpo: na peça nova, só se escolheu; na edição, só se trocou (`null` tira). */
    corpo(editando: boolean): { video?: string | null } {
      if (!editando) return novo ? { video: novo.dataUrl } : {};
      return trocou ? { video: novo?.dataUrl ?? null } : {};
    },
  };
}

export type VideoProprioEstado = ReturnType<typeof useVideoProprio>;

export function VideoProprio({ estado, dica }: { estado: VideoProprioEstado; dica: string }) {
  const src = estado.novo?.previa ?? estado.atual?.url ?? null;
  return (
    <fieldset>
      <legend className="label-xs">
        Seu vídeo (até <span className="tnum">{DIVULGACAO_VIDEO_MAX_SEGUNDOS}</span> s, opcional)
      </legend>
      {src ? (
        <video
          src={src}
          poster={estado.novo ? undefined : (estado.atual?.poster ?? undefined)}
          controls
          playsInline
          preload="metadata"
          aria-label="Prévia do seu vídeo"
          className="mt-1 max-h-64 w-full max-w-xs rounded-lg bg-black"
        />
      ) : null}
      <div className="mt-2 flex flex-wrap gap-2">
        <label className="relative inline-flex cursor-pointer items-center rounded-full border border-line px-3 py-1.5 text-xs font-semibold focus-within:ring-2 focus-within:ring-green">
          {src ? "Trocar o vídeo" : "Escolher vídeo"}
          <input
            type="file"
            accept="video/mp4,video/quicktime"
            className="sr-only"
            onChange={(e) => {
              void estado.escolher(e.target.files);
              e.target.value = "";
            }}
          />
        </label>
        {src ? (
          <Button variant="ghost" className="px-3 py-1 text-xs" onClick={estado.tirar}>
            Tirar o vídeo
          </Button>
        ) : null}
      </div>
      <p className="mt-1 text-xs text-muted">{dica}</p>
    </fieldset>
  );
}

/** O vídeo da peça na lista, na fila e na página da rifa: toca só no toque, com o pôster se houver. */
export function VideoDaDivulgacao({ video, rotulo }: { video: VideoDaPeca; rotulo: string }) {
  // Em pé, a altura manda (sem faixa preta dos lados); deitado, a largura.
  const emPe = video.altura > video.largura;
  return (
    <video
      src={video.url}
      poster={video.poster ?? undefined}
      controls
      playsInline
      preload="metadata"
      aria-label={rotulo}
      className={`rounded-lg bg-black ${emPe ? "h-80 w-auto max-w-full" : "h-auto w-full max-w-sm"}`}
      style={{ aspectRatio: `${video.largura} / ${video.altura}` }}
    />
  );
}
