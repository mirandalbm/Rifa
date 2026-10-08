/**
 * Cortar o início e o fim do vídeo (Fase D do `docs/PLANO-FERRAMENTAS.md`),
 * em **modo cópia**: o `ffmpeg` copia os pacotes do trecho, sem recomprimir —
 * rápido, sem perda e sem custo de CPU de transcode. O preço é o corte cair no
 * quadro-chave anterior ao início escolhido: o vídeo pode começar um pouco
 * antes. A tela diz isso.
 *
 * Regras puras: o trecho (conferido contra a duração **medida no servidor**) e
 * o comando. Quem roda é `FfmpegLocal.cortar()` em
 * `server/services/videoProcessor.ts`; quem troca o arquivo é
 * `cortarVideo()` em `server/services/media.ts`.
 */

/** Cada corte roda o `ffmpeg` e regrava o arquivo: limite por pessoa. */
export const CORTES_POR_JANELA = { minutos: 10, limite: 10 } as const;
/** O trecho que fica tem pelo menos isto. */
export const CORTE_MINIMO_S = 1;
/**
 * Teto do vídeo que se corta aqui: o arquivo cortado passa pela memória do
 * processo ao ser gravado (e copiado ao bucket). O mesmo teto de baixar o
 * vídeo do bucket para tirar o pôster.
 */
export const CORTE_ATE_BYTES = 200 * 1024 * 1024;
/** Prazo do processo. Cópia de pacotes é rápida; passou disto, algo travou. */
export const CORTE_PRAZO_MS = 120_000;

function numero(bruto: unknown): number {
  if (typeof bruto === "number") return bruto;
  if (typeof bruto === "string" && bruto.trim() !== "") return Number(bruto);
  return NaN;
}

const decimo = (n: number) => Math.round(n * 10) / 10;

/**
 * O trecho que fica, de `inicio` a `fim` em segundos (décimos). Recusa o que
 * não é número, o que passa do vídeo, o trecho curto demais e o corte que não
 * corta nada (o vídeo inteiro).
 */
export function trechoDoCorte(
  inicioBruto: unknown,
  fimBruto: unknown,
  duracaoS: number | null,
): { inicio: number; fim: number } | { erro: string } {
  if (duracaoS == null || !(duracaoS > 0)) return { erro: "A duração deste vídeo não foi medida; não dá para cortar." };
  const i = numero(inicioBruto);
  const f = numero(fimBruto);
  if (!Number.isFinite(i) || !Number.isFinite(f) || i < 0 || f < 0) return { erro: "Escolha onde o vídeo começa e onde termina." };
  if (f > duracaoS + 0.05) return { erro: "O fim passa do fim do vídeo." };
  const inicio = decimo(i);
  const fim = decimo(Math.min(f, duracaoS));
  if (fim - inicio < CORTE_MINIMO_S) return { erro: `O trecho que fica precisa ter pelo menos ${CORTE_MINIMO_S} segundo.` };
  if (inicio === 0 && fim >= duracaoS - 0.1) return { erro: "Nada a cortar: o trecho escolhido é o vídeo inteiro." };
  return { inicio, fim };
}

/**
 * Argumentos do `ffmpeg` para copiar o trecho para `saida`, no mesmo
 * contêiner da entrada (o tipo da mídia não muda). `-ss` antes do `-i` salta
 * direto ao quadro-chave; `-t` é a duração do trecho. Só o primeiro vídeo e o
 * primeiro áudio (se houver): faixa de dados do celular (fuso, localização em
 * faixa própria) nem sempre copia, e não faz falta para tocar. `+faststart`
 * põe o índice no começo, para tocar antes de baixar tudo.
 */
export function argsDoCorte(entrada: string, saida: string, inicio: number, fim: number, mime: string): string[] {
  return [
    "-v", "error",
    "-nostdin",
    "-y",
    // A mesma defesa do pôster: só o demuxer de MP4/MOV e só arquivo local.
    "-protocol_whitelist", "file",
    "-f", "mov",
    "-ss", String(Math.max(0, inicio)),
    "-i", entrada,
    "-t", String(decimo(fim - inicio)),
    "-map", "0:v:0",
    "-map", "0:a:0?",
    "-c", "copy",
    "-avoid_negative_ts", "make_zero",
    "-movflags", "+faststart",
    "-f", mime === "video/quicktime" ? "mov" : "mp4",
    saida,
  ];
}
