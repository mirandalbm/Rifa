/**
 * Medição de mídia no servidor.
 *
 * A regra do produto é que a duração do vídeo e o tamanho da imagem são
 * medidos por nós, nunca informados pelo navegador — o que o cliente manda
 * é trivial de forjar, e o limite de 60 s é uma promessa ao comprador.
 *
 * As funções aqui leem só os cabeçalhos: a leitura chega por callback, então
 * o mesmo código serve para arquivo em disco e para objeto remoto lido por
 * Range, sem baixar 300 MB de vídeo para descobrir a duração.
 */

/** Lê `length` bytes a partir de `offset`. Pode devolver menos no fim do arquivo. */
export type RangeReader = (offset: number, length: number) => Promise<Buffer>;

export class UnreadableMediaError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UnreadableMediaError";
  }
}

/* ------------------------------------------------------------------ *
 * Imagem: dimensões pelo cabeçalho
 * ------------------------------------------------------------------ */

export interface ImageInfo {
  format: "png" | "jpeg" | "webp";
  width: number;
  height: number;
}

export function probeImage(head: Buffer): ImageInfo {
  // PNG: assinatura de 8 bytes, depois IHDR com largura e altura.
  if (
    head.length >= 24 &&
    head.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  ) {
    return {
      format: "png",
      width: head.readUInt32BE(16),
      height: head.readUInt32BE(20),
    };
  }

  // JPEG: percorre os marcadores até um SOF, que carrega as dimensões.
  if (head.length >= 4 && head[0] === 0xff && head[1] === 0xd8) {
    let i = 2;
    while (i + 9 < head.length) {
      if (head[i] !== 0xff) {
        i++;
        continue;
      }
      const marker = head[i + 1];
      // SOF0..SOF15, menos os marcadores que não descrevem quadro.
      const isSof =
        marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
      if (isSof) {
        return {
          format: "jpeg",
          height: head.readUInt16BE(i + 5),
          width: head.readUInt16BE(i + 7),
        };
      }
      const segmentLength = head.readUInt16BE(i + 2);
      if (segmentLength < 2) break;
      i += 2 + segmentLength;
    }
    throw new UnreadableMediaError("Não foi possível ler as dimensões deste JPEG.");
  }

  // WebP: RIFF + WEBP, com três variantes de cabeçalho.
  if (
    head.length >= 30 &&
    head.subarray(0, 4).toString("ascii") === "RIFF" &&
    head.subarray(8, 12).toString("ascii") === "WEBP"
  ) {
    const chunk = head.subarray(12, 16).toString("ascii");
    if (chunk === "VP8 ") {
      return {
        format: "webp",
        width: head.readUInt16LE(26) & 0x3fff,
        height: head.readUInt16LE(28) & 0x3fff,
      };
    }
    if (chunk === "VP8L") {
      const bits = head.readUInt32LE(21);
      return {
        format: "webp",
        width: (bits & 0x3fff) + 1,
        height: ((bits >> 14) & 0x3fff) + 1,
      };
    }
    if (chunk === "VP8X") {
      return {
        format: "webp",
        width: (head.readUIntLE(24, 3) & 0xffffff) + 1,
        height: (head.readUIntLE(27, 3) & 0xffffff) + 1,
      };
    }
  }

  throw new UnreadableMediaError(
    "Formato de imagem não reconhecido. Envie JPG, PNG ou WebP.",
  );
}

/* ------------------------------------------------------------------ *
 * Vídeo: duração pelo mvhd do container MP4/MOV
 * ------------------------------------------------------------------ */

const BOX_HEADER = 8;

/**
 * Percorre as caixas do container ISO-BMFF (MP4, MOV, M4V) sem baixar o
 * conteúdo: lê 16 bytes de cada cabeçalho e pula o corpo. O `mdat`, que é
 * o vídeo em si, nunca é lido.
 *
 * Devolve a duração em segundos.
 */
export async function probeVideoDuration(
  read: RangeReader,
  totalSize: number,
): Promise<number> {
  const moov = await findBox(read, 0, totalSize, "moov");
  if (!moov) {
    throw new UnreadableMediaError(
      "Não foi possível medir a duração: envie o vídeo em MP4 ou MOV.",
    );
  }

  const mvhd = await findBox(read, moov.contentStart, moov.end, "mvhd");
  if (!mvhd) {
    throw new UnreadableMediaError("Vídeo sem cabeçalho de duração (mvhd).");
  }

  const header = await read(mvhd.contentStart, 32);
  if (header.length < 20) {
    throw new UnreadableMediaError("Cabeçalho de vídeo incompleto.");
  }

  const version = header[0];
  let timescale: number;
  let duration: number;

  if (version === 1) {
    if (header.length < 32) throw new UnreadableMediaError("Cabeçalho de vídeo incompleto.");
    timescale = header.readUInt32BE(20);
    duration = Number(header.readBigUInt64BE(24));
  } else {
    timescale = header.readUInt32BE(12);
    duration = header.readUInt32BE(16);
  }

  if (!timescale) throw new UnreadableMediaError("Vídeo com escala de tempo inválida.");
  return duration / timescale;
}

interface BoxRef {
  type: string;
  start: number;
  contentStart: number;
  end: number;
}

/** Procura uma caixa entre `from` e `to`, lendo só os cabeçalhos. */
async function findBox(
  read: RangeReader,
  from: number,
  to: number,
  wanted: string,
): Promise<BoxRef | null> {
  let offset = from;

  while (offset + BOX_HEADER <= to) {
    const header = await read(offset, 16);
    if (header.length < BOX_HEADER) return null;

    let size = header.readUInt32BE(0);
    const type = header.subarray(4, 8).toString("ascii");
    let contentStart = offset + BOX_HEADER;

    if (size === 1) {
      // Caixa grande: o tamanho real vem nos 8 bytes seguintes.
      if (header.length < 16) return null;
      size = Number(header.readBigUInt64BE(8));
      contentStart = offset + 16;
    } else if (size === 0) {
      // Vai até o fim do arquivo.
      size = to - offset;
    }

    if (size < BOX_HEADER) return null;

    if (type === wanted) {
      return { type, start: offset, contentStart, end: Math.min(offset + size, to) };
    }

    offset += size;
  }

  return null;
}

/** Leitor sobre um Buffer já em memória — usado em teste e em arquivo pequeno. */
export function bufferReader(buf: Buffer): RangeReader {
  return async (offset, length) => buf.subarray(offset, offset + length);
}
