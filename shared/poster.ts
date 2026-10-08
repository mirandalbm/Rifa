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
 * Os instantes candidatos a pôster (a capa automática, Fase D do
 * `docs/PLANO-FERRAMENTAS.md`). O primeiro quadro costuma ser preto (fade de
 * entrada) e o de 0,5 s pode estar borrado no movimento: o processador tira um
 * quadro de cada instante e fica com o melhor (`melhorQuadro()`). Vídeo mais
 * curto que um instante simplesmente não rende aquele quadro. Se nenhum
 * render, tenta o primeiro de verdade (`POSTER_ULTIMO_RECURSO_S`).
 */
export const POSTER_CANDIDATOS_S = [0.5, 1.5, 3, 5] as const;
export const POSTER_ULTIMO_RECURSO_S = 0;
/** Brilho médio (0 a 255) fora desta faixa é quadro preto ou estourado: só vence se não houver outro. */
export const POSTER_BRILHO_MIN = 28;
export const POSTER_BRILHO_MAX = 235;

/** O que se mede de cada quadro candidato: o brilho médio (0–255) e a nitidez (a do `sharp`). */
export interface MedidaDoQuadro {
  brilho: number;
  nitidez: number;
}

/**
 * Qual candidato vira o pôster: entre os de brilho aceitável, o mais nítido
 * (empate fica com o primeiro, o mais cedo); sem nenhum aceitável, o mais
 * nítido de todos. `null` só sem candidato. Regra pura: o processador mede, a
 * regra escolhe.
 */
export function melhorQuadro(medidas: (MedidaDoQuadro | null)[]): number | null {
  const valido = (m: MedidaDoQuadro | null): m is MedidaDoQuadro =>
    !!m && Number.isFinite(m.brilho) && Number.isFinite(m.nitidez);
  const aceitavel = (m: MedidaDoQuadro) => m.brilho >= POSTER_BRILHO_MIN && m.brilho <= POSTER_BRILHO_MAX;
  let melhor: number | null = null;
  for (const passo of [true, false]) {
    medidas.forEach((m, i) => {
      if (!valido(m) || (passo && !aceitavel(m))) return;
      if (melhor === null || m.nitidez > (medidas[melhor] as MedidaDoQuadro).nitidez) melhor = i;
    });
    if (melhor !== null) return melhor;
  }
  return null;
}

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
    // Defesa em profundidade: só o demuxer de MP4/MOV e só arquivo local. Sem isso o
    // formato é adivinhado pelo conteúdo, e uma playlist (HLS) ou um `concat` disfarçado
    // de vídeo poderia fazer o ffmpeg ler outro arquivo ou abrir uma conexão.
    "-protocol_whitelist", "file",
    "-f", "mov",
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

/**
 * Escolher a capa (Fase D do `docs/PLANO-FERRAMENTAS.md`): a organização
 * escolhe o segundo do vídeo que vira o pôster. O instante vem do navegador,
 * mas é só um número conferido contra a duração **medida no servidor**; o
 * quadro é tirado aqui, pelo `ffmpeg`, nunca enviado pela tela.
 */
export const CAPAS_POR_JANELA = { minutos: 10, limite: 20 } as const;

export function instanteDaCapa(bruto: unknown, duracaoS: number | null): { instante: number } | { erro: string } {
  if (duracaoS == null || !(duracaoS > 0)) return { erro: "A duração deste vídeo não foi medida; não dá para escolher o quadro." };
  const n = typeof bruto === "number" ? bruto : typeof bruto === "string" && bruto.trim() !== "" ? Number(bruto) : NaN;
  if (!Number.isFinite(n) || n < 0) return { erro: "Escolha um instante do vídeo." };
  // O último décimo pode não ter quadro: o teto fica um pouco antes do fim.
  const teto = Math.max(0, duracaoS - 0.1);
  if (n > duracaoS) return { erro: "Esse instante passa do fim do vídeo." };
  return { instante: Math.round(Math.min(n, teto) * 10) / 10 };
}
