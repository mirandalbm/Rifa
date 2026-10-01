import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import {
  POSTER_LARGURA_MAX,
  argsDoPoster,
  chaveDoPoster,
  posterPublico,
} from "../shared/poster";
import { FfmpegLocal, SemProcessador, comArquivoTemporario } from "../server/services/videoProcessor";
import { chaveDaCampanha } from "../server/services/storage";

/**
 * O pôster do vídeo é só um quadro tirado em segundo plano. O que importa
 * aqui é a degradação: sem o programa, com programa que trava, que devolve
 * lixo ou que devolve demais, o resultado é sempre "sem pôster" — nunca uma
 * exceção que chegasse ao envio da mídia.
 */
describe("regras do pôster", () => {
  it("o comando tira um quadro só, para a saída padrão, limitado em largura", () => {
    const args = argsDoPoster("/tmp/v.mp4", 0.5);
    expect(args).toContain("pipe:1");
    expect(args[args.indexOf("-frames:v") + 1]).toBe("1");
    expect(args[args.indexOf("-i") + 1]).toBe("/tmp/v.mp4");
    expect(args.join(" ")).toContain(`min(${POSTER_LARGURA_MAX},iw)`);
    // O salto vem antes da entrada: não decodifica o vídeo inteiro.
    expect(args.indexOf("-ss")).toBeLessThan(args.indexOf("-i"));
  });

  it("instante negativo vira zero", () => {
    expect(argsDoPoster("x", -3)[argsDoPoster("x", -3).indexOf("-ss") + 1]).toBe("0");
  });

  it("a chave do pôster é gerada aqui, dentro da pasta da rifa, e não é uma chave de envio", () => {
    const k = chaveDoPoster("d59c80b9-133f-4156-9f9c-2db9ba3e0a09", "abc");
    expect(k).toBe("campanhas/d59c80b9-133f-4156-9f9c-2db9ba3e0a09/poster-abc.webp");
    // O navegador não consegue "confirmar" uma chave de pôster como se fosse mídia dele.
    expect(chaveDaCampanha(k, "d59c80b9-133f-4156-9f9c-2db9ba3e0a09", "video")).toBe(false);
  });

  it("sem pôster é nulo, nunca texto vazio", () => {
    expect(posterPublico(null)).toBeNull();
    expect(posterPublico("")).toBeNull();
    expect(posterPublico("/uploads/a.webp")).toBe("/uploads/a.webp");
  });
});

describe("processador local", () => {
  let pasta: string;
  let jpeg: Buffer;
  const script = async (nome: string, corpo: string) => {
    const f = path.join(pasta, nome);
    await fs.writeFile(f, `#!/bin/sh\n${corpo}\n`, { mode: 0o755 });
    return f;
  };

  beforeAll(async () => {
    pasta = await fs.mkdtemp(path.join(os.tmpdir(), "poster-test-"));
    jpeg = await sharp({ create: { width: 1080, height: 1920, channels: 3, background: "#d00000" } }).jpeg().toBuffer();
    await fs.writeFile(path.join(pasta, "quadro.jpg"), jpeg);
  });
  afterAll(async () => {
    await fs.rm(pasta, { recursive: true, force: true });
  });

  it("programa que não existe: sem pôster, sem exceção", async () => {
    expect(await new FfmpegLocal("/nao/existe/ffmpeg-nenhum").gerarPoster("/tmp/qualquer.mp4")).toBeNull();
  });

  it("o processador desligado devolve sempre nulo", async () => {
    expect(await new SemProcessador().gerarPoster()).toBeNull();
  });

  it("programa que devolve o quadro: vira WebP", async () => {
    const bin = await script("bom.sh", `cat "${path.join(pasta, "quadro.jpg")}"`);
    const out = await new FfmpegLocal(bin, 5000).gerarPoster("x.mp4");
    expect(out).not.toBeNull();
    const meta = await sharp(out!).metadata();
    expect(meta.format).toBe("webp");
    expect(meta.width).toBe(1080); // o programa é quem reduz; aqui só se reprocessa
  });

  it("programa que falha (código 1): sem pôster", async () => {
    const bin = await script("falha.sh", "exit 1");
    expect(await new FfmpegLocal(bin, 5000).gerarPoster("x.mp4")).toBeNull();
  });

  it("programa que sai com lixo no lugar da imagem: sem pôster", async () => {
    const bin = await script("lixo.sh", "echo isto nao e uma imagem");
    expect(await new FfmpegLocal(bin, 5000).gerarPoster("x.mp4")).toBeNull();
  });

  it("programa que trava: o prazo mata e devolve nulo", async () => {
    const bin = await script("trava.sh", "sleep 30");
    const t0 = Date.now();
    expect(await new FfmpegLocal(bin, 300).gerarPoster("x.mp4")).toBeNull();
    expect(Date.now() - t0).toBeLessThan(5000);
  });

  it("programa que despeja mais que o teto: sem pôster", async () => {
    const bin = await script("enche.sh", "head -c 20000000 /dev/zero");
    expect(await new FfmpegLocal(bin, 5000).gerarPoster("x.mp4")).toBeNull();
  });

  it("o arquivo temporário some depois de usado", async () => {
    let usado = "";
    await comArquivoTemporario(Buffer.from("abc"), ".mp4", async (f) => {
      usado = f;
      expect((await fs.readFile(f)).toString()).toBe("abc");
    });
    await expect(fs.stat(usado)).rejects.toBeTruthy();
  });

  const temFfmpeg = spawnSync("ffmpeg", ["-version"]).status === 0;
  it.skipIf(!temFfmpeg)("com o ffmpeg de verdade: tira o quadro de um vídeo em pé e respeita a largura", async () => {
    const mp4 = path.join(pasta, "real.mp4");
    const r = spawnSync("ffmpeg", ["-v", "error", "-y", "-f", "lavfi", "-i", "color=c=red:s=1080x1920:d=1:r=10", "-pix_fmt", "yuv420p", mp4]);
    expect(r.status).toBe(0);
    const out = await new FfmpegLocal().gerarPoster(mp4);
    expect(out).not.toBeNull();
    const meta = await sharp(out!).metadata();
    expect(meta.format).toBe("webp");
    expect(meta.width).toBe(POSTER_LARGURA_MAX);
    expect(meta.height!).toBeGreaterThan(meta.width!);
  });
});
