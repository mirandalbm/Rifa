import { describe, it, expect } from "vitest";
import {
  probeImage,
  probeVideoDuration,
  bufferReader,
  UnreadableMediaError,
} from "../server/services/probe";

/* ---------------- construtores de arquivo sintético ---------------- */

function png(width: number, height: number): Buffer {
  const buf = Buffer.alloc(24);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(buf, 0);
  buf.writeUInt32BE(13, 8);
  buf.write("IHDR", 12, "ascii");
  buf.writeUInt32BE(width, 16);
  buf.writeUInt32BE(height, 20);
  return buf;
}

function jpeg(width: number, height: number): Buffer {
  // SOI + APP0 de 16 bytes + SOF0 com as dimensões.
  const parts = [
    Buffer.from([0xff, 0xd8]),
    Buffer.from([0xff, 0xe0, 0x00, 0x10]),
    Buffer.alloc(14),
    Buffer.from([0xff, 0xc0, 0x00, 0x11, 0x08]),
    (() => {
      const b = Buffer.alloc(4);
      b.writeUInt16BE(height, 0);
      b.writeUInt16BE(width, 2);
      return b;
    })(),
    Buffer.alloc(10),
  ];
  return Buffer.concat(parts);
}

function box(type: string, content: Buffer): Buffer {
  const header = Buffer.alloc(8);
  header.writeUInt32BE(content.length + 8, 0);
  header.write(type, 4, "ascii");
  return Buffer.concat([header, content]);
}

function mvhd(durationSeconds: number, timescale = 1000): Buffer {
  const content = Buffer.alloc(100);
  content[0] = 0; // versão 0
  content.writeUInt32BE(timescale, 12);
  content.writeUInt32BE(Math.round(durationSeconds * timescale), 16);
  return box("mvhd", content);
}

/** mdat grande na frente: prova que o corpo do vídeo não é lido. */
function mp4(durationSeconds: number, opts: { moovLast?: boolean } = {}): Buffer {
  const ftyp = box("ftyp", Buffer.from("isomiso2avc1mp41", "ascii"));
  const mdat = box("mdat", Buffer.alloc(64 * 1024));
  const moov = box("moov", mvhd(durationSeconds));
  return opts.moovLast
    ? Buffer.concat([ftyp, mdat, moov])
    : Buffer.concat([ftyp, moov, mdat]);
}

/* ------------------------------- testes ------------------------------- */

describe("dimensões de imagem", () => {
  it("lê PNG", () => {
    expect(probeImage(png(1600, 900))).toEqual({ format: "png", width: 1600, height: 900 });
  });

  it("lê JPEG", () => {
    expect(probeImage(jpeg(1200, 800))).toEqual({ format: "jpeg", width: 1200, height: 800 });
  });

  it("recusa formato desconhecido em vez de adivinhar", () => {
    expect(() => probeImage(Buffer.from("não é imagem nenhuma"))).toThrow(UnreadableMediaError);
  });
});

describe("duração do vídeo", () => {
  it("mede a duração pelo cabeçalho, sem ler o mdat", async () => {
    const file = mp4(48);
    const read = bufferReader(file);
    expect(await probeVideoDuration(read, file.length)).toBeCloseTo(48, 3);
  });

  it("encontra o moov mesmo quando ele vem depois do vídeo", async () => {
    const file = mp4(37.5, { moovLast: true });
    expect(await probeVideoDuration(bufferReader(file), file.length)).toBeCloseTo(37.5, 3);
  });

  it("lê apenas cabeçalhos — nunca o corpo do arquivo", async () => {
    const file = mp4(30);
    let bytesRead = 0;
    const counting = async (offset: number, length: number) => {
      bytesRead += length;
      return file.subarray(offset, offset + length);
    };
    await probeVideoDuration(counting, file.length);
    // O arquivo tem 64 KB; a medição não pode chegar perto disso.
    expect(bytesRead).toBeLessThan(512);
  });

  it("reprova o vídeo acima de 60 s — que é o ponto do produto", async () => {
    const file = mp4(82);
    const seconds = await probeVideoDuration(bufferReader(file), file.length);
    expect(seconds).toBeGreaterThan(60);
  });

  it("recusa container que não sabe medir, em vez de confiar no cliente", async () => {
    const notMp4 = Buffer.from("webm ou qualquer outra coisa");
    await expect(
      probeVideoDuration(bufferReader(notMp4), notMp4.length),
    ).rejects.toThrow(UnreadableMediaError);
  });
});
