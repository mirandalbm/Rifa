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

  it("só o demuxer de MP4/MOV e só arquivo local, antes da entrada", () => {
    const args = argsDoPoster("/tmp/v.mp4", 0);
    const i = args.indexOf("-i");
    expect(args[args.indexOf("-protocol_whitelist") + 1]).toBe("file");
    expect(args[args.indexOf("-f") + 1]).toBe("mov");
    // As duas opções valem para a entrada, então vêm antes do `-i`.
    expect(args.indexOf("-protocol_whitelist")).toBeLessThan(i);
    expect(args.indexOf("-f")).toBeLessThan(i);
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

  it.skipIf(!temFfmpeg)("com o ffmpeg de verdade: o vídeo que começa preto ganha a capa do quadro com imagem", async () => {
    const mp4 = path.join(pasta, "comeca-preto.mp4");
    // 2 s pretos e 4 s de imagem com detalhe (testsrc): a capa de antes, a 0,5 s, saía preta.
    const r = spawnSync("ffmpeg", [
      "-v", "error", "-y",
      "-f", "lavfi", "-i", "color=c=black:s=320x240:d=2:r=10",
      "-f", "lavfi", "-i", "testsrc=s=320x240:d=4:r=10",
      "-filter_complex", "[0:v][1:v]concat=n=2:v=1[v]", "-map", "[v]",
      "-pix_fmt", "yuv420p", mp4,
    ]);
    expect(r.status).toBe(0);
    const out = await new FfmpegLocal().gerarPoster(mp4);
    expect(out).not.toBeNull();
    const { medirQuadro } = await import("../server/services/videoProcessor");
    expect((await medirQuadro(out!))!.brilho).toBeGreaterThan(40);
  });
});

describe("instante da capa escolhida (Fase D)", () => {
  it("só número dentro do vídeo, arredondado ao décimo e um pouco antes do fim", async () => {
    const { instanteDaCapa } = await import("../shared/poster");
    expect(instanteDaCapa(1.53, 10)).toEqual({ instante: 1.5 });
    expect(instanteDaCapa("2", 10)).toEqual({ instante: 2 });
    expect(instanteDaCapa(10, 10)).toEqual({ instante: 9.9 });
    expect(instanteDaCapa(0, 10)).toEqual({ instante: 0 });
    expect("erro" in instanteDaCapa(10.5, 10)).toBe(true);
    expect("erro" in instanteDaCapa(-1, 10)).toBe(true);
    expect("erro" in instanteDaCapa("meio", 10)).toBe(true);
    expect("erro" in instanteDaCapa("", 10)).toBe(true);
    expect("erro" in instanteDaCapa(null, 10)).toBe(true);
    expect("erro" in instanteDaCapa(1, null)).toBe(true);
    expect("erro" in instanteDaCapa(1, 0)).toBe(true);
  });
});

describe("capa automática: o melhor quadro entre os candidatos", () => {
  const quadro = async (cor: string, detalhe: boolean, borrar = 0) => {
    const svg =
      `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="180"><rect width="320" height="180" fill="${cor}"/>` +
      (detalhe ? Array.from({ length: 12 }, (_, i) => `<rect x="${i * 26}" y="${(i % 3) * 50}" width="13" height="40" fill="#fff"/>`).join("") : "") +
      `</svg>`;
    let img = sharp(Buffer.from(svg));
    if (borrar) img = img.blur(borrar);
    return img.jpeg().toBuffer();
  };

  it("a regra: nem preto nem estourado, o mais nítido; empate fica com o mais cedo", async () => {
    const { melhorQuadro, POSTER_BRILHO_MIN } = await import("../shared/poster");
    expect(melhorQuadro([])).toBeNull();
    expect(melhorQuadro([null, null])).toBeNull();
    // o preto (brilho baixo) perde mesmo sendo o mais "nítido"
    expect(melhorQuadro([{ brilho: 5, nitidez: 9 }, { brilho: 120, nitidez: 3 }, { brilho: 110, nitidez: 4 }])).toBe(2);
    // empate: o primeiro
    expect(melhorQuadro([{ brilho: 100, nitidez: 4 }, { brilho: 100, nitidez: 4 }])).toBe(0);
    // sem nenhum aceitável, o mais nítido de todos (melhor que nenhum pôster)
    expect(melhorQuadro([{ brilho: 2, nitidez: 1 }, { brilho: 250, nitidez: 2 }])).toBe(1);
    expect(melhorQuadro([{ brilho: POSTER_BRILHO_MIN, nitidez: 1 }])).toBe(0);
  });

  it("mede brilho e nitidez de verdade", async () => {
    const { medirQuadro } = await import("../server/services/videoProcessor");
    const preto = await medirQuadro(await quadro("#000", false));
    const nitido = await medirQuadro(await quadro("#336699", true));
    const borrado = await medirQuadro(await quadro("#336699", true, 6));
    expect(preto!.brilho).toBeLessThan(10);
    expect(nitido!.brilho).toBeGreaterThan(40);
    expect(nitido!.nitidez).toBeGreaterThan(borrado!.nitidez);
    expect(await medirQuadro(Buffer.from("não é imagem"))).toBeNull();
  });

  it("fica com o quadro bom: nem o preto do início, nem o borrado", async () => {
    const { melhorPoster } = await import("../server/services/videoProcessor");
    const preto = await quadro("#000", false);
    const nitido = await quadro("#336699", true);
    const borrado = await quadro("#336699", true, 6);
    const pedidos: number[] = [];
    const porInstante: Record<number, Buffer | null> = { 0.5: preto, 1.5: borrado, 3: nitido, 5: null };
    const out = await melhorPoster(async (t) => (pedidos.push(t), porInstante[t] ?? null), Date.now() + 10_000);
    expect(pedidos).toEqual([0.5, 1.5, 3, 5]);
    expect((await sharp(out!).metadata()).format).toBe("webp");
    // o escolhido é o nítido: a mesma nitidez depois do WebP fica acima da do borrado
    const { medirQuadro } = await import("../server/services/videoProcessor");
    expect((await medirQuadro(out!))!.nitidez).toBeGreaterThan((await medirQuadro(borrado))!.nitidez);
  });

  it("vídeo curto: nenhum candidato rende, tenta o primeiro quadro; nada rende, sem pôster", async () => {
    const { melhorPoster } = await import("../server/services/videoProcessor");
    const nitido = await quadro("#336699", true);
    const pedidos: number[] = [];
    expect(await melhorPoster(async (t) => (pedidos.push(t), t === 0 ? nitido : null), Date.now() + 10_000)).not.toBeNull();
    expect(pedidos).toEqual([0.5, 1.5, 3, 5, 0]);
    expect(await melhorPoster(async () => null, Date.now() + 10_000)).toBeNull();
    // quem lança vira "não rendeu", nunca exceção
    expect(await melhorPoster(async () => { throw new Error("x"); }, Date.now() + 10_000)).toBeNull();
  });

  it("passado o prazo total, para de tentar e fica com o que já tem", async () => {
    const { melhorPoster } = await import("../server/services/videoProcessor");
    const nitido = await quadro("#336699", true);
    const pedidos: number[] = [];
    const out = await melhorPoster(async (t) => {
      pedidos.push(t);
      await new Promise((ok) => setTimeout(ok, 60));
      return nitido;
    }, Date.now() + 50);
    expect(out).not.toBeNull();
    expect(pedidos).toEqual([0.5]);
  });
});
