/**
 * Toca o vídeo pelo HLS do Cloudflare Stream quando o servidor manda um
 * (`hls`), e volta ao arquivo original (`url`) se não der: sem HLS, sem como
 * tocá-lo, ou erro no meio. Quem escolhe é `fonteDoVideo()` em
 * `shared/stream.ts`.
 *
 * O hls.js só é baixado quando precisa (Chrome e Firefox no computador; o
 * Safari e o iPhone tocam HLS sozinhos), e só começa a baixar o vídeo no play
 * — o `preload="metadata"` do feed continua valendo.
 */
import { useEffect, type RefObject } from "react";
import { fonteDoVideo } from "@shared/stream";

function suporte(v: HTMLVideoElement) {
  const w = window as unknown as { MediaSource?: unknown; ManagedMediaSource?: unknown };
  return {
    nativo: v.canPlayType("application/vnd.apple.mpegurl") !== "",
    mse: Boolean(w.MediaSource || w.ManagedMediaSource),
  };
}

export function useVideoHls(ref: RefObject<HTMLVideoElement | null>, url: string | null | undefined, hls: string | null | undefined) {
  useEffect(() => {
    const v = ref.current;
    if (!v || !url) return;
    let encerrado = false;
    let desfazer: (() => void) | null = null;
    // Volta ao original no ponto em que estava, uma vez só.
    const original = () => {
      if (encerrado || v.getAttribute("src") === url) return;
      const instante = v.currentTime;
      const tocava = !v.paused;
      desfazer?.();
      desfazer = null;
      v.src = url;
      if (instante > 0) v.currentTime = instante;
      if (tocava) v.play().catch(() => {});
    };

    const fonte = fonteDoVideo({ hls, ...suporte(v) });
    if (fonte === "original" || !hls) {
      v.src = url;
    } else if (fonte === "hls-nativo") {
      v.addEventListener("error", original, { once: true });
      desfazer = () => v.removeEventListener("error", original);
      v.src = hls;
    } else {
      // A versão "light": sem legendas nem DRM, que não usamos.
      import("hls.js/light")
        .then(({ default: Hls }) => {
          if (encerrado) return;
          if (!Hls.isSupported()) return original();
          const h = new Hls({ autoStartLoad: false, capLevelToPlayerSize: true });
          let comecou = false;
          const comecar = () => {
            if (comecou) return;
            comecou = true;
            h.startLoad(-1);
          };
          h.on(Hls.Events.ERROR, (_e, d) => {
            if (d.fatal) original();
          });
          v.addEventListener("play", comecar, { once: true });
          desfazer = () => {
            v.removeEventListener("play", comecar);
            h.destroy();
          };
          h.loadSource(hls);
          h.attachMedia(v);
          // O reels já pode ter pedido o play enquanto o hls.js chegava: aí o
          // evento já passou e o carregamento começa agora.
          if (!v.paused) comecar();
        })
        .catch(original);
    }
    return () => {
      encerrado = true;
      desfazer?.();
    };
  }, [ref, url, hls]);
}
