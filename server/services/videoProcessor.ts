/**
 * Processador de vídeo: a costura entre o que o sistema precisa do vídeo
 * (hoje, o pôster) e quem faz o trabalho.
 *
 * Hoje há uma implementação: o `ffmpeg` local, se estiver instalado. Sem ele
 * o sistema **degrada** — o vídeo segue como foi enviado, sem pôster, e o
 * `<video>` mostra o primeiro quadro como sempre mostrou. Nunca lança: o
 * envio da mídia e a publicação não dependem deste arquivo.
 *
 * PONTO DE ENCAIXE — Cloudflare Stream: o dia em que houver conta e token,
 * uma classe nova implementa `ProcessadorDeVideo` (envia o vídeo, devolve o
 * pôster gerado por eles e, depois, o HLS transcodificado) e entra em
 * `processadorDeVideo()` pela variável `VIDEO_PROCESSOR`. Nada fora deste
 * arquivo precisa mudar. Transcode (recompressão/HLS) NÃO existe aqui: é
 * trabalho pesado de verdade e é do Stream; o `ffmpeg` do processo web não
 * deve fazê-lo.
 */
import { spawn } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import {
  POSTER_INSTANTES_S,
  POSTER_PRAZO_MS,
  POSTER_QUALIDADE,
  POSTER_SAIDA_MAX_BYTES,
  argsDoPoster,
} from "@shared/poster";

export interface ProcessadorDeVideo {
  readonly nome: string;
  /**
   * O pôster do vídeo que está em `arquivo` (WebP), ou `null` quando não deu:
   * sem o programa, vídeo ilegível ou prazo estourado. **Nunca lança.**
   */
  gerarPoster(arquivo: string): Promise<Buffer | null>;
}

/** Sem processador: o vídeo vai como veio. É o que se tinha antes. */
export class SemProcessador implements ProcessadorDeVideo {
  readonly nome = "nenhum";
  async gerarPoster() {
    return null;
  }
}

/** Roda o programa e devolve o que ele escreveu na saída padrão (ou nulo). */
function rodar(bin: string, args: string[], prazoMs: number): Promise<Buffer | null> {
  return new Promise((resolve) => {
    let filho: ReturnType<typeof spawn>;
    try {
      filho = spawn(bin, args, { stdio: ["ignore", "pipe", "ignore"] });
    } catch {
      return resolve(null);
    }
    const partes: Buffer[] = [];
    let total = 0;
    let acabou = false;
    const termina = (v: Buffer | null) => {
      if (acabou) return;
      acabou = true;
      clearTimeout(relogio);
      resolve(v);
    };
    const relogio = setTimeout(() => {
      filho.kill("SIGKILL");
      termina(null);
    }, prazoMs);
    filho.stdout!.on("data", (b: Buffer) => {
      total += b.length;
      if (total > POSTER_SAIDA_MAX_BYTES) {
        filho.kill("SIGKILL");
        return termina(null);
      }
      partes.push(b);
    });
    // Programa ausente (ENOENT) ou que não abriu: cai aqui, sem derrubar o processo.
    filho.on("error", () => termina(null));
    filho.on("close", (codigo) => termina(codigo === 0 && total > 0 ? Buffer.concat(partes) : null));
  });
}

export class FfmpegLocal implements ProcessadorDeVideo {
  readonly nome = "ffmpeg";
  constructor(
    private bin = process.env.FFMPEG_PATH || "ffmpeg",
    private prazoMs = POSTER_PRAZO_MS,
  ) {}

  async gerarPoster(arquivo: string): Promise<Buffer | null> {
    try {
      for (const instante of POSTER_INSTANTES_S) {
        const jpeg = await rodar(this.bin, argsDoPoster(arquivo, instante), this.prazoMs);
        if (!jpeg) continue;
        // Reprocessa: WebP, sem metadados. Um quadro que não abre vira "sem pôster".
        return await sharp(jpeg, { limitInputPixels: 40_000_000 }).webp({ quality: POSTER_QUALIDADE }).toBuffer();
      }
      return null;
    } catch {
      return null;
    }
  }
}

let escolhido: ProcessadorDeVideo | null = null;

/**
 * O processador em uso. `VIDEO_PROCESSOR=nenhum` desliga; o padrão é o
 * `ffmpeg` local, que degrada sozinho se o programa não existir.
 */
export function processadorDeVideo(): ProcessadorDeVideo {
  if (escolhido) return escolhido;
  const quer = (process.env.VIDEO_PROCESSOR ?? "ffmpeg").toLowerCase();
  if (quer === "nenhum") escolhido = new SemProcessador();
  else {
    // "cloudflare-stream" ainda não existe (ver o ponto de encaixe acima):
    // sem credencial, cai no local em vez de falhar.
    if (quer !== "ffmpeg") console.warn(`[video] VIDEO_PROCESSOR="${quer}" não existe; usando o ffmpeg local.`);
    escolhido = new FfmpegLocal();
  }
  return escolhido;
}

/** Só para teste: troca o processador (e volta ao padrão com `null`). */
export function trocarProcessadorDeVideo(p: ProcessadorDeVideo | null) {
  escolhido = p;
}

/** Grava `bytes` num arquivo temporário, entrega o caminho a `fn` e apaga no fim. */
export async function comArquivoTemporario<T>(bytes: Buffer, ext: string, fn: (arquivo: string) => Promise<T>): Promise<T> {
  const pasta = await fs.mkdtemp(path.join(os.tmpdir(), "rifa-video-"));
  const arquivo = path.join(pasta, `entrada${ext}`);
  try {
    await fs.writeFile(arquivo, bytes);
    return await fn(arquivo);
  } finally {
    await fs.rm(pasta, { recursive: true, force: true }).catch(() => {});
  }
}
