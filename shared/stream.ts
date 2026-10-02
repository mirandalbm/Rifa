/**
 * Entrega do vídeo pelo Cloudflare Stream (HLS).
 *
 * Regras puras: o que é um `uid` do Stream, que endereço de HLS vale e como a
 * tela escolhe por onde tocar. Quem fala com o Stream é
 * `server/services/videoProcessor.ts`; quem toca é `client/src/lib/hls.ts`.
 */

/** O `uid` do vídeo no Stream: 32 caracteres hexadecimais. Outro formato não vira caminho de URL. */
export const UID_DO_STREAM = /^[a-f0-9]{32}$/;

export function uidValido(uid: unknown): uid is string {
  return typeof uid === "string" && UID_DO_STREAM.test(uid);
}

/**
 * O endereço do HLS que o Stream devolveu, se for o do próprio vídeo:
 * `https://customer-<código>.cloudflarestream.com/<uid>/manifest/video.m3u8`,
 * sem usuário, senha, porta, consulta nem âncora. Qualquer outra coisa é `null`
 * — o endereço sai na tela de todo apostador e o navegador vai buscá-lo.
 */
export function hlsDoStream(endereco: unknown, uid: string): string | null {
  if (typeof endereco !== "string" || !uidValido(uid)) return null;
  let u: URL;
  try {
    u = new URL(endereco);
  } catch {
    return null;
  }
  if (u.protocol !== "https:" || u.username || u.password || u.port || u.search || u.hash) return null;
  if (!/^customer-[a-z0-9]+\.cloudflarestream\.com$/.test(u.hostname)) return null;
  if (u.pathname !== `/${uid}/manifest/video.m3u8`) return null;
  return u.toString();
}

/**
 * A entrega em HLS só existe quando a plataforma decide guardar o vídeo no
 * Stream (cobra por minuto guardado): `CLOUDFLARE_STREAM_ENTREGA=hls`, junto
 * do processador `cloudflare-stream`. Desligada, o Stream só tira o pôster e
 * apaga o vídeo, como antes.
 */
export function entregaHlsLigada(env: Record<string, string | undefined>): boolean {
  return (
    (env.VIDEO_PROCESSOR ?? "").trim().toLowerCase() === "cloudflare-stream" &&
    (env.CLOUDFLARE_STREAM_ENTREGA ?? "").trim().toLowerCase() === "hls"
  );
}

export type FonteDoVideo = "hls-nativo" | "hls-js" | "original";

/**
 * Por onde a tela toca: o HLS nativo (Safari, iPhone), o hls.js onde há Media
 * Source, ou o arquivo original — sem HLS, ou sem como tocá-lo. A falha do HLS
 * depois de escolhido também volta ao original (quem decide é a tela).
 */
export function fonteDoVideo(o: { hls: string | null | undefined; nativo: boolean; mse: boolean }): FonteDoVideo {
  if (!o.hls) return "original";
  if (o.nativo) return "hls-nativo";
  if (o.mse) return "hls-js";
  return "original";
}
