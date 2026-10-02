/**
 * Processador de vídeo: a costura entre o que o sistema precisa do vídeo
 * (hoje, o pôster) e quem faz o trabalho.
 *
 * Hoje há uma implementação: o `ffmpeg` local, se estiver instalado. Sem ele
 * o sistema **degrada** — o vídeo segue como foi enviado, sem pôster, e o
 * `<video>` mostra o primeiro quadro como sempre mostrou. Nunca lança: o
 * envio da mídia e a publicação não dependem deste arquivo.
 *
 * Cloudflare Stream (`VIDEO_PROCESSOR=cloudflare-stream`, com
 * `CLOUDFLARE_ACCOUNT_ID` e `CLOUDFLARE_STREAM_TOKEN`): `CloudflareStream`
 * envia o vídeo, espera o Stream processar, busca o quadro dele e **apaga o
 * vídeo do Stream** — hoje ele serve só para tirar o pôster sem `ffmpeg` no
 * processo web (o Stream cobra por minuto guardado). Se o Stream falhar, o
 * `ffmpeg` local tenta (`ComReserva`). A entrega em HLS (guardar o `uid` e
 * tocar pelo Stream) é o passo seguinte e NÃO existe aqui: o `ffmpeg` do
 * processo web não deve fazer transcode.
 */
import { spawn } from "node:child_process";
import { promises as fs, openAsBlob } from "node:fs";
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

/**
 * Quantos `ffmpeg` rodam ao mesmo tempo no processo web. Cada um é CPU e RAM
 * de verdade: com muitos envios seguidos, sem fila, o site para de responder.
 * O resto espera a vez (o pôster é em segundo plano, esperar não custa nada).
 */
export function limiteDeFfmpeg(env = process.env.FFMPEG_MAX_SIMULTANEOS): number {
  const n = Number(env);
  return Number.isInteger(n) && n >= 1 && n <= 8 ? n : 2;
}

/** Semáforo mínimo: `rodar(fn)` só começa quando há vaga, na ordem de chegada. */
export class Vagas {
  private emUso = 0;
  private fila: (() => void)[] = [];
  constructor(private max: number) {}
  get usando() {
    return this.emUso;
  }
  get esperando() {
    return this.fila.length;
  }
  async rodar<T>(fn: () => Promise<T>): Promise<T> {
    if (this.emUso >= this.max) await new Promise<void>((livre) => this.fila.push(livre));
    else this.emUso++;
    try {
      return await fn();
    } finally {
      const proximo = this.fila.shift();
      if (proximo) proximo(); // a vaga passa direto para o próximo da fila
      else this.emUso--;
    }
  }
}

const vagasDoFfmpeg = new Vagas(limiteDeFfmpeg());
/**
 * Vagas para trazer o vídeo do bucket ao disco temporário: o semáforo do
 * `ffmpeg` limita CPU, este limita o disco (sem ele, N envios deixavam N
 * arquivos de até 200 MB no `tmpdir` esperando a vez). Fica seguro de aninhar
 * porque é outra instância: quem tem vaga de download só espera a do `ffmpeg`.
 */
const vagasDoDownload = new Vagas(limiteDeFfmpeg());
export const comVagaDeDownload = <T>(fn: () => Promise<T>) => vagasDoDownload.rodar(fn);

export class FfmpegLocal implements ProcessadorDeVideo {
  readonly nome = "ffmpeg";
  constructor(
    private bin = process.env.FFMPEG_PATH || "ffmpeg",
    private prazoMs = POSTER_PRAZO_MS,
  ) {}

  gerarPoster(arquivo: string): Promise<Buffer | null> {
    return vagasDoFfmpeg.rodar(() => this.gerar(arquivo));
  }

  private async gerar(arquivo: string): Promise<Buffer | null> {
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

export interface OpcoesDoStream {
  accountId: string;
  token: string;
  /** Injetável para teste; o padrão é o `fetch` do Node. */
  fetch?: typeof fetch;
  /** Prazo total (envio + processamento + quadro). */
  prazoMs?: number;
  /** Intervalo entre as consultas de "já ficou pronto?". */
  intervaloMs?: number;
  /** Largura do quadro pedido ao Stream. */
  largura?: number;
}

/** O Stream aceita até 200 MB no envio simples; acima disso é "sem pôster". */
export const STREAM_ENVIO_MAX_BYTES = 200 * 1024 * 1024;
const API_DO_STREAM = "https://api.cloudflare.com/client/v4/accounts";
const vagasDoStream = new Vagas(3);

/**
 * Pôster pelo Cloudflare Stream. Rede, não CPU: não passa pela fila do
 * `ffmpeg`, mas tem teto próprio (3 envios ao mesmo tempo). **Nunca lança** e
 * **sempre apaga** o vídeo do Stream no fim, dê certo ou não — o token vem do
 * ambiente e nunca aparece no log.
 */
export class CloudflareStream implements ProcessadorDeVideo {
  readonly nome = "cloudflare-stream";
  private f: typeof fetch;
  private prazoMs: number;
  private intervaloMs: number;
  private largura: number;
  constructor(private o: OpcoesDoStream) {
    this.f = o.fetch ?? fetch;
    this.prazoMs = o.prazoMs ?? 120_000;
    this.intervaloMs = o.intervaloMs ?? 2_000;
    this.largura = o.largura ?? 720;
  }

  gerarPoster(arquivo: string): Promise<Buffer | null> {
    return vagasDoStream.rodar(() => this.gerar(arquivo));
  }

  private get base() {
    return `${API_DO_STREAM}/${encodeURIComponent(this.o.accountId)}/stream`;
  }
  private get auth() {
    return { Authorization: `Bearer ${this.o.token}` };
  }

  private async gerar(arquivo: string): Promise<Buffer | null> {
    const fim = Date.now() + this.prazoMs;
    const restante = () => Math.max(1_000, fim - Date.now());
    let uid: string | null = null;
    try {
      const { size } = await fs.stat(arquivo);
      if (size === 0 || size > STREAM_ENVIO_MAX_BYTES) return null;
      // `openAsBlob` lê do disco sob demanda: o vídeo não entra inteiro na memória.
      const corpo = new FormData();
      corpo.append("file", await openAsBlob(arquivo), "video");
      corpo.append("requireSignedURLs", "false");
      const envio = await this.f(this.base, {
        method: "POST",
        headers: this.auth,
        body: corpo,
        signal: AbortSignal.timeout(restante()),
      });
      const j = (await envio.json().catch(() => null)) as { success?: boolean; result?: { uid?: string } } | null;
      uid = typeof j?.result?.uid === "string" ? j.result.uid : null;
      if (!envio.ok || !j?.success || !uid) return null;

      let miniatura: string | null = null;
      while (Date.now() < fim) {
        const r = await this.f(`${this.base}/${uid}`, { headers: this.auth, signal: AbortSignal.timeout(restante()) });
        const d = (await r.json().catch(() => null)) as {
          result?: { status?: { state?: string }; readyToStream?: boolean; thumbnail?: string };
        } | null;
        const estado = d?.result?.status?.state;
        if (estado === "error") return null;
        if (r.ok && d?.result?.readyToStream && typeof d.result.thumbnail === "string") {
          miniatura = d.result.thumbnail;
          break;
        }
        await new Promise((ok) => setTimeout(ok, this.intervaloMs));
      }
      if (!miniatura) return null;

      // O endereço vem da resposta do Stream: só vale https e no domínio dele.
      const url = new URL(miniatura);
      if (url.protocol !== "https:" || !/(^|\.)cloudflarestream\.com$/.test(url.hostname)) return null;
      url.searchParams.set("time", `${POSTER_INSTANTES_S[0]}s`);
      url.searchParams.set("width", String(this.largura));
      url.searchParams.set("fit", "scale-down");
      const q = await this.f(url, { signal: AbortSignal.timeout(restante()) });
      if (!q.ok) return null;
      const bytes = Buffer.from(await q.arrayBuffer());
      if (bytes.length === 0 || bytes.length > POSTER_SAIDA_MAX_BYTES) return null;
      return await sharp(bytes, { limitInputPixels: 40_000_000 }).webp({ quality: POSTER_QUALIDADE }).toBuffer();
    } catch {
      return null;
    } finally {
      if (uid) await this.apagar(uid);
    }
  }

  private async apagar(uid: string) {
    try {
      const r = await this.f(`${this.base}/${uid}`, { method: "DELETE", headers: this.auth, signal: AbortSignal.timeout(15_000) });
      if (!r.ok && r.status !== 404) console.warn(`[video] Stream: não consegui apagar o vídeo ${uid} (HTTP ${r.status}).`);
    } catch {
      console.warn(`[video] Stream: não consegui apagar o vídeo ${uid}.`);
    }
  }
}

/** Tenta o principal; se não der pôster, tenta o reserva. */
export class ComReserva implements ProcessadorDeVideo {
  constructor(
    private principal: ProcessadorDeVideo,
    private reserva: ProcessadorDeVideo,
  ) {}
  get nome() {
    return `${this.principal.nome}+${this.reserva.nome}`;
  }
  async gerarPoster(arquivo: string): Promise<Buffer | null> {
    const a = await this.principal.gerarPoster(arquivo).catch(() => null);
    return a ?? this.reserva.gerarPoster(arquivo).catch(() => null);
  }
}

let escolhido: ProcessadorDeVideo | null = null;

/**
 * O processador em uso. `VIDEO_PROCESSOR=nenhum` desliga; `cloudflare-stream`
 * usa o Stream (com o `ffmpeg` de reserva); o padrão é o `ffmpeg` local, que
 * degrada sozinho se o programa não existir.
 */
export function processadorDeVideo(): ProcessadorDeVideo {
  if (escolhido) return escolhido;
  const quer = (process.env.VIDEO_PROCESSOR ?? "ffmpeg").toLowerCase();
  if (quer === "nenhum") escolhido = new SemProcessador();
  else if (quer === "cloudflare-stream") {
    const accountId = process.env.CLOUDFLARE_ACCOUNT_ID?.trim();
    const token = process.env.CLOUDFLARE_STREAM_TOKEN?.trim();
    if (accountId && token) escolhido = new ComReserva(new CloudflareStream({ accountId, token }), new FfmpegLocal());
    else {
      // Sem credencial, cai no local em vez de falhar.
      console.warn("[video] cloudflare-stream pede CLOUDFLARE_ACCOUNT_ID e CLOUDFLARE_STREAM_TOKEN; usando o ffmpeg local.");
      escolhido = new FfmpegLocal();
    }
  } else {
    if (quer !== "ffmpeg") console.warn(`[video] VIDEO_PROCESSOR="${quer}" não existe; usando o ffmpeg local.`);
    escolhido = new FfmpegLocal();
  }
  return escolhido;
}

/** Só para teste: troca o processador (e volta ao padrão com `null`). */
export function trocarProcessadorDeVideo(p: ProcessadorDeVideo | null) {
  escolhido = p;
}

/**
 * Traz o objeto do armazenamento para um arquivo temporário **em pedaços**
 * (`PEDACO_BYTES` por vez), entrega o caminho a `fn` e apaga no fim: a memória
 * do processo web fica em um pedaço, não no vídeo inteiro.
 */
export const PEDACO_BYTES = 4 * 1024 * 1024;
export async function comArquivoTemporarioEmPedacos<T>(
  tamanho: number,
  ler: (offset: number, length: number) => Promise<Buffer>,
  ext: string,
  fn: (arquivo: string) => Promise<T>,
): Promise<T> {
  const pasta = await fs.mkdtemp(path.join(os.tmpdir(), "rifa-video-"));
  const arquivo = path.join(pasta, `entrada${ext}`);
  try {
    const f = await fs.open(arquivo, "w");
    try {
      for (let offset = 0; offset < tamanho; offset += PEDACO_BYTES) {
        const pedaco = await ler(offset, Math.min(PEDACO_BYTES, tamanho - offset));
        if (pedaco.length === 0) break;
        await f.write(pedaco);
      }
    } finally {
      await f.close();
    }
    return await fn(arquivo);
  } finally {
    await fs.rm(pasta, { recursive: true, force: true }).catch(() => {});
  }
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
