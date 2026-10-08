/**
 * Reels gerado pelo sistema (Fase F do `docs/PLANO-FERRAMENTAS.md`): um vídeo
 * em pé com as fotos da rifa, cada uma com um movimento lento (aproxima e
 * afasta, alternado), uma transição suave entre elas e, por cima, a faixa com
 * o prêmio, o preço da cota e a autorização. Quem desenha a faixa e prepara as
 * fotos é o site (`sharp`, sem recomprimir vídeo); quem monta o vídeo é o
 * trabalhador (`ffmpeg`, `server/trabalhos/reelsGerado.ts`), pela fila.
 *
 * **A data do sorteio não vai gravada no vídeo**: ela muda com o adiamento e o
 * vídeo ficaria mentindo. Vai como figurinha (a contagem, que é dado e
 * acompanha a data), junto do botão Comprar, que só aparece enquanto a rifa
 * vende. Prêmio, preço e autorização travam ao publicar — por isso só a rifa
 * publicada gera.
 */

import { quemApura } from "./artes";
import { formatBRL } from "./format";

export const TIPO_REELS_GERADO = "reels_gerado";

/** Quantas fotos entram, no máximo (o banner primeiro, depois as do carrossel). */
export const REELS_GERADO_FOTOS_MAX = 6;

/** O quadro do vídeo: o 9:16 do Reels. */
export const QUADRO_DO_REELS_GERADO = { largura: 1080, altura: 1920 } as const;
export const QUADROS_POR_SEGUNDO = 30;
/** A transição entre duas fotos (segundos). */
export const TRANSICAO_S = 0.5;
/** Quanto o movimento aproxima no fim de cada foto (1,10 = 10%). */
export const APROXIMACAO_MAX = 1.1;

/** Quantos vídeos uma pessoa pede por hora (cada um é minuto de CPU do trabalhador). */
export const REELS_GERADOS_POR_HORA = 6;

/** Quanto cada foto fica na tela: com poucas fotos, mais tempo em cada. */
export function segundosPorFoto(fotos: number): number {
  if (fotos <= 1) return 6;
  if (fotos === 2) return 4.5;
  return 3.5;
}

/** A duração do vídeo: cada foto, menos as transições que se sobrepõem. */
export function duracaoDoReelsGerado(fotos: number): number {
  const n = Math.max(1, Math.floor(fotos));
  const s = segundosPorFoto(n);
  return Math.round((n * s - (n - 1) * TRANSICAO_S) * 100) / 100;
}

/** Quem pode gerar: a régua da rifa (os dados já lidos do banco). */
export interface RifaParaGerar {
  status: string;
  demonstracao: boolean;
  /** Travada, ou promotora arquivada ou banida. */
  travada: boolean;
  sorteada: boolean;
}

export function problemaParaGerarReels(r: RifaParaGerar): string | null {
  if (r.status !== "published") return "Só a rifa publicada gera o vídeo: o prêmio e o preço gravados no vídeo travam ao publicar.";
  if (r.demonstracao) return "Rifa de demonstração não entra no Reels.";
  if (r.travada) return "Esta rifa está travada e não entra no Reels.";
  if (r.sorteada) return "A rifa já foi sorteada.";
  return null;
}

/** O que vai gravado na faixa: o prêmio, o preço da cota, quem apura e a autorização — nunca a data. */
export interface TextosDoReelsGerado {
  titulo: string;
  destaque: string;
  linhas: string[];
}

export function textosDoReelsGerado(d: { premio: string; precoCents: number; metodoApuracao: string | null; autorizacao: string | null }): TextosDoReelsGerado {
  return {
    titulo: d.premio,
    destaque: `${formatBRL(d.precoCents)} a cota`,
    linhas: [`Sorteio ${quemApura(d.metodoApuracao)}`, d.autorizacao ? `Autorizada SPA/MF nº ${d.autorizacao}` : null].filter(Boolean) as string[],
  };
}

/** As figurinhas que o vídeo gerado já leva: a contagem e o Comprar (dados, nunca gravados no vídeo). */
export const FIGURINHAS_DO_REELS_GERADO = [
  { tipo: "contagem", x: 0.5, y: 0.2 },
  { tipo: "comprar", x: 0.5, y: 0.46 },
] as const;

/** O movimento de cada foto: as pares aproximam, as ímpares afastam. */
function zoomDa(i: number, quadros: number): string {
  const passo = ((APROXIMACAO_MAX - 1) / Math.max(1, quadros - 1)).toFixed(6);
  return i % 2 === 0 ? `min(1+${passo}*on,${APROXIMACAO_MAX})` : `max(${APROXIMACAO_MAX}-${passo}*on,1)`;
}

/**
 * Os argumentos do `ffmpeg` (sem o binário): uma foto por entrada, já no
 * 9:16 (o site corta), cada uma vira `segundosPorFoto` de vídeo com o
 * movimento; as fotos se juntam com `xfade`; a faixa (PNG transparente) vai
 * por cima. H.264 em `yuv420p` (toca em todo aparelho), sem som, com o índice
 * no começo (`+faststart`, toca antes de baixar inteiro).
 */
export function argsDoReelsGerado(fotos: readonly string[], faixa: string, saida: string): string[] {
  const n = fotos.length;
  if (n < 1) throw new Error("Sem fotos para o vídeo.");
  const { largura, altura } = QUADRO_DO_REELS_GERADO;
  const s = segundosPorFoto(n);
  const quadros = Math.round(s * QUADROS_POR_SEGUNDO);
  const entradas = [...fotos.flatMap((f) => ["-i", f]), "-i", faixa];
  // Ampliar antes do zoompan tira o "tremido" do movimento lento.
  const filtros: string[] = fotos.map(
    (_, i) =>
      `[${i}:v]scale=${largura * 2}:${altura * 2},zoompan=z='${zoomDa(i, quadros)}':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${quadros}:s=${largura}x${altura}:fps=${QUADROS_POR_SEGUNDO},setsar=1,format=yuv420p[f${i}]`,
  );
  let atual = "f0";
  for (let k = 1; k < n; k++) {
    const proximo = `x${k}`;
    filtros.push(`[${atual}][f${k}]xfade=transition=fade:duration=${TRANSICAO_S}:offset=${(k * (s - TRANSICAO_S)).toFixed(2)}[${proximo}]`);
    atual = proximo;
  }
  filtros.push(`[${atual}][${n}:v]overlay=0:0:format=auto,format=yuv420p[saida]`);
  return [
    "-hide_banner",
    "-loglevel",
    "error",
    "-y",
    ...entradas,
    "-filter_complex",
    filtros.join(";"),
    "-map",
    "[saida]",
    "-t",
    String(duracaoDoReelsGerado(n)),
    "-r",
    String(QUADROS_POR_SEGUNDO),
    "-c:v",
    "libx264",
    "-preset",
    "veryfast",
    "-crf",
    "23",
    "-pix_fmt",
    "yuv420p",
    "-movflags",
    "+faststart",
    "-an",
    saida,
  ];
}
