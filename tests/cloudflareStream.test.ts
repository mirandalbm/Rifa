import { afterEach, describe, expect, it } from "vitest";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import {
  CloudflareStream,
  ComReserva,
  STREAM_ENVIO_MAX_BYTES,
  processadorDeVideo,
  trocarProcessadorDeVideo,
  type ProcessadorDeVideo,
} from "../server/services/videoProcessor";

const TOKEN = "token-secreto-de-teste";
const THUMB = "https://customer-abc123.cloudflarestream.com/UID1/thumbnails/thumbnail.jpg";

async function quadro() {
  return sharp({ create: { width: 1280, height: 720, channels: 3, background: "#2255aa" } }).jpeg().toBuffer();
}
const resp = (corpo: unknown, status = 200) => new Response(JSON.stringify(corpo), { status });

async function arquivoDeVideo(bytes = 2048) {
  const pasta = await fs.mkdtemp(path.join(os.tmpdir(), "stream-teste-"));
  const arq = path.join(pasta, "v.mp4");
  await fs.writeFile(arq, Buffer.alloc(bytes, 7));
  return { arq, pasta };
}

/** Um Stream de mentira: guarda as chamadas e responde como a API. */
function streamFalso(opcoes: { prontoNaConsulta?: number; estado?: string; falhaNoEnvio?: boolean; miniatura?: string } = {}) {
  const chamadas: { metodo: string; url: string; auth: string | null }[] = [];
  let consultas = 0;
  const f = (async (entrada: RequestInfo | URL, init?: RequestInit) => {
    const url = String(entrada);
    const metodo = init?.method ?? "GET";
    chamadas.push({ metodo, url, auth: new Headers(init?.headers).get("authorization") });
    if (url.includes("thumbnails")) return new Response(await quadro(), { status: 200 });
    if (metodo === "POST") {
      return opcoes.falhaNoEnvio ? resp({ success: false }, 400) : resp({ success: true, result: { uid: "UID1" } });
    }
    if (metodo === "DELETE") return resp({ success: true });
    consultas++;
    const pronto = consultas >= (opcoes.prontoNaConsulta ?? 1);
    return resp({
      success: true,
      result: {
        status: { state: opcoes.estado ?? (pronto ? "ready" : "inprogress") },
        readyToStream: pronto && opcoes.estado !== "error",
        thumbnail: opcoes.miniatura ?? THUMB,
      },
    });
  }) as typeof fetch;
  return { f, chamadas };
}

const novo = (f: typeof fetch, extra = {}) =>
  new CloudflareStream({ accountId: "conta1", token: TOKEN, fetch: f, intervaloMs: 5, prazoMs: 2000, ...extra });

describe("Cloudflare Stream: pôster", () => {
  it("envia, espera ficar pronto, busca o quadro em WebP e apaga o vídeo do Stream", async () => {
    const { arq, pasta } = await arquivoDeVideo();
    const s = streamFalso({ prontoNaConsulta: 3 });
    const poster = await novo(s.f).gerarPoster(arq);
    expect(poster).not.toBeNull();
    const meta = await sharp(poster!).metadata();
    expect(meta.format).toBe("webp");
    // quem redimensiona é o Stream: o pedido do quadro leva largura, instante e fit
    const pedidoDoQuadro = new URL(s.chamadas.find((c) => c.url.includes("thumbnails"))!.url);
    expect(pedidoDoQuadro.searchParams.get("width")).toBe("720");
    expect(pedidoDoQuadro.searchParams.get("time")).toBe("0.5s");
    expect(pedidoDoQuadro.searchParams.get("fit")).toBe("scale-down");
    // o último pedido é o DELETE do vídeo, e todo pedido ao Stream leva o token
    expect(s.chamadas.at(-1)).toMatchObject({ metodo: "DELETE" });
    expect(s.chamadas.filter((c) => c.metodo === "DELETE")).toHaveLength(1);
    for (const c of s.chamadas.filter((c) => !c.url.includes("thumbnails"))) expect(c.auth).toBe(`Bearer ${TOKEN}`);
    // o token nunca vai na URL nem no pedido do quadro
    expect(s.chamadas.some((c) => c.url.includes(TOKEN))).toBe(false);
    expect(s.chamadas.find((c) => c.url.includes("thumbnails"))!.auth).toBeNull();
    await fs.rm(pasta, { recursive: true, force: true });
  });

  it("envio recusado vira 'sem pôster' e não há o que apagar", async () => {
    const { arq, pasta } = await arquivoDeVideo();
    const s = streamFalso({ falhaNoEnvio: true });
    expect(await novo(s.f).gerarPoster(arq)).toBeNull();
    expect(s.chamadas.some((c) => c.metodo === "DELETE")).toBe(false);
    await fs.rm(pasta, { recursive: true, force: true });
  });

  it("vídeo que o Stream não processa (erro) ou que não fica pronto no prazo: sem pôster, e apaga", async () => {
    const { arq, pasta } = await arquivoDeVideo();
    for (const [opcoes, extra] of [
      [{ estado: "error" }, {}],
      [{ prontoNaConsulta: 9999 }, { prazoMs: 80 }],
    ] as const) {
      const s = streamFalso(opcoes);
      expect(await novo(s.f, extra).gerarPoster(arq)).toBeNull();
      expect(s.chamadas.filter((c) => c.metodo === "DELETE")).toHaveLength(1);
    }
    await fs.rm(pasta, { recursive: true, force: true });
  });

  it("não segue endereço de quadro fora do Stream", async () => {
    const { arq, pasta } = await arquivoDeVideo();
    for (const miniatura of ["https://evil.example.com/x.jpg", "http://customer-a.cloudflarestream.com/x.jpg", "https://cloudflarestream.com.evil.io/x.jpg"]) {
      const s = streamFalso({ miniatura });
      expect(await novo(s.f).gerarPoster(arq)).toBeNull();
      expect(s.chamadas.some((c) => c.url.includes("evil") || c.url.startsWith("http:"))).toBe(false);
      expect(s.chamadas.filter((c) => c.metodo === "DELETE")).toHaveLength(1);
    }
    await fs.rm(pasta, { recursive: true, force: true });
  });

  it("nunca lança: rede caindo, arquivo ausente e arquivo vazio", async () => {
    const { arq, pasta } = await arquivoDeVideo(0);
    const cai = (async () => {
      throw new Error("rede");
    }) as unknown as typeof fetch;
    expect(await novo(cai).gerarPoster(arq)).toBeNull();
    expect(await novo(cai).gerarPoster(path.join(pasta, "nao-existe.mp4"))).toBeNull();
    await fs.rm(pasta, { recursive: true, force: true });
  });

  it("acima do teto do envio simples nem sai da máquina", async () => {
    expect(STREAM_ENVIO_MAX_BYTES).toBe(200 * 1024 * 1024);
  });
});

describe("escolha do processador", () => {
  const guarda = { ...process.env };
  afterEach(() => {
    process.env = { ...guarda };
    trocarProcessadorDeVideo(null);
  });

  it("cloudflare-stream sem credencial cai no ffmpeg local; com credencial usa o Stream com reserva", () => {
    process.env.VIDEO_PROCESSOR = "cloudflare-stream";
    delete process.env.CLOUDFLARE_ACCOUNT_ID;
    delete process.env.CLOUDFLARE_STREAM_TOKEN;
    trocarProcessadorDeVideo(null);
    expect(processadorDeVideo().nome).toBe("ffmpeg");
    process.env.CLOUDFLARE_ACCOUNT_ID = "conta1";
    process.env.CLOUDFLARE_STREAM_TOKEN = TOKEN;
    trocarProcessadorDeVideo(null);
    expect(processadorDeVideo().nome).toBe("cloudflare-stream+ffmpeg");
  });

  it("a reserva só entra quando o principal não dá pôster", async () => {
    const chamou: string[] = [];
    const faz = (nome: string, r: Buffer | null | "lanca"): ProcessadorDeVideo => ({
      nome,
      async gerarPoster() {
        chamou.push(nome);
        if (r === "lanca") throw new Error("x");
        return r;
      },
    });
    const b = Buffer.from("ok");
    expect(await new ComReserva(faz("a", b), faz("b", b)).gerarPoster("x")).toBe(b);
    expect(chamou).toEqual(["a"]);
    chamou.length = 0;
    expect(await new ComReserva(faz("a", null), faz("b", b)).gerarPoster("x")).toBe(b);
    expect(chamou).toEqual(["a", "b"]);
    expect(await new ComReserva(faz("a", "lanca"), faz("b", "lanca")).gerarPoster("x")).toBeNull();
  });
});
