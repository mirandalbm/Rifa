/**
 * Pôster do vídeo (o quadro que aparece antes de dar o play).
 *
 * Regras puras — o que é pôster, quanto custa, que comando o processador
 * local monta. Quem roda o `ffmpeg` é `server/services/videoProcessor.ts`;
 * aqui não há processo nem banco, para o teste exercitar sem nenhum dos dois.
 */

/** Largura máxima do pôster. Acima disso só pesa: a tela mostra em até 480 px. */
export const POSTER_LARGURA_MAX = 720;
/** O pôster sai em WebP, como as outras imagens do sistema. */
export const POSTER_QUALIDADE = 78;
/** Prazo do processo: vídeo que não rende o quadro nesse tempo fica sem pôster. */
export const POSTER_PRAZO_MS = 20_000;
/** Teto do que o processo pode devolver (um quadro JPEG não passa disso). */
export const POSTER_SAIDA_MAX_BYTES = 8 * 1024 * 1024;
/** Vídeo maior que isto, fora do disco local, não é baixado só para tirar o quadro. */
export const POSTER_BAIXAR_ATE_BYTES = 200 * 1024 * 1024;
/**
 * O primeiro quadro costuma ser preto (fade de entrada). Tenta meio segundo
 * adiante e, se o vídeo for mais curto que isso, o primeiro de verdade.
 */
export const POSTER_INSTANTES_S = [0.5, 0] as const;

/** Chave do pôster no armazenamento: opaca, gerada aqui — nunca vem do navegador. */
export function chaveDoPoster(campaignId: string, sufixo: string): string {
  return `campanhas/${campaignId}/poster-${sufixo}.webp`;
}

/**
 * Argumentos do `ffmpeg` para tirar UM quadro e mandar para a saída padrão
 * como JPEG. `-ss` antes do `-i` salta direto (sem decodificar o vídeo
 * inteiro); a rotação gravada no vídeo é aplicada pelo próprio `ffmpeg`.
 */
export function argsDoPoster(arquivo: string, instanteS: number): string[] {
  return [
    "-v", "error",
    "-nostdin",
    "-ss", String(Math.max(0, instanteS)),
    "-i", arquivo,
    "-frames:v", "1",
    "-vf", `scale='min(${POSTER_LARGURA_MAX},iw)':-2`,
    "-f", "image2pipe",
    "-vcodec", "mjpeg",
    "-q:v", "3",
    "pipe:1",
  ];
}

/** O endereço do pôster na resposta pública: ausente é `null`, nunca texto vazio. */
export function posterPublico(url: string | null | undefined): string | null {
  return url ? url : null;
}
