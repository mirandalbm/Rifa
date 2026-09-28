/**
 * Variantes responsivas da imagem (docs/PLANO-RIFA.md §4.2).
 *
 * A tela inicial da rifa tem orçamento de 400 KB de imagem antes da
 * interação, e quem chega pelo WhatsApp costuma estar no 4G. Servir o
 * original de 8 MB para um celular de 390 px queima esse orçamento
 * inteiro na primeira foto.
 */
import sharp from "sharp";
import { storage } from "./storage";

export interface ImageVariant {
  width: number;
  format: "avif" | "webp";
  key: string;
  bytes: number;
}

/** Larguras que cobrem celular, tablet e desktop em telas 1x e 2x. */
const WIDTHS = [400, 800, 1600];

export interface ProcessedImage {
  variants: ImageVariant[];
  /** Data URI de 20 px — entra no HTML e some quando a foto real carrega. */
  lqip: string;
  /** Largura e altura como a foto é exibida, já com a rotação do EXIF. */
  largura: number;
  altura: number;
}

/**
 * Teto de pixels ao abrir a imagem, o mesmo das outras fotos do sistema: um
 * PNG de poucos megabytes pode dizer 16.000 × 16.000 e, aberto, ocupar mais
 * de 1 GB de memória — o processo cai e leva todo mundo junto.
 */
const LIMITE_DE_PIXELS = 40_000_000;
/**
 * `rotate()` sem argumento aplica a rotação do EXIF: o celular grava a foto
 * em pé deitada, com a orientação no cabeçalho, e a variante sai sem
 * metadados — sem girar antes, a foto apareceria deitada na publicação.
 */
const abrir = (source: Buffer) => sharp(source, { limitInputPixels: LIMITE_DE_PIXELS }).rotate();

export async function processImage(
  source: Buffer,
  baseKey: string,
): Promise<ProcessedImage> {
  const store = storage();
  const meta = await sharp(source, { limitInputPixels: LIMITE_DE_PIXELS }).metadata();
  // Orientação 5 a 8 do EXIF é giro de 90° ou 270°: largura e altura trocam.
  const deitada = (meta.orientation ?? 1) >= 5;
  const largura = (deitada ? meta.height : meta.width) ?? WIDTHS[WIDTHS.length - 1];
  const altura = (deitada ? meta.width : meta.height) ?? largura;
  const original = largura;

  const variants: ImageVariant[] = [];

  for (const width of WIDTHS) {
    // Nunca ampliar: gerar 1600 a partir de uma foto de 1200 só pesa.
    if (width > original) continue;

    for (const format of ["avif", "webp"] as const) {
      const pipeline = abrir(source).resize({ width, withoutEnlargement: true });
      const buf =
        format === "avif"
          ? await pipeline.avif({ quality: 55 }).toBuffer()
          : await pipeline.webp({ quality: 78 }).toBuffer();

      const key = `${baseKey}.w${width}.${format}`;
      await store.write(key, buf, `image/${format}`);
      variants.push({ width, format, key, bytes: buf.length });
    }
  }

  const lqipBuf = await abrir(source)
    .resize({ width: 20 })
    .webp({ quality: 40 })
    .toBuffer();

  return {
    variants,
    lqip: `data:image/webp;base64,${lqipBuf.toString("base64")}`,
    largura,
    altura,
  };
}

/** Monta o srcset de um formato, do menor para o maior. */
export function srcSet(
  variants: ImageVariant[] | null | undefined,
  format: "avif" | "webp",
  publicUrl: (key: string) => string,
): string | null {
  if (!variants?.length) return null;
  const list = variants
    .filter((v) => v.format === format)
    .sort((a, b) => a.width - b.width)
    .map((v) => `${publicUrl(v.key)} ${v.width}w`);
  return list.length > 0 ? list.join(", ") : null;
}

/** Apaga as variantes junto com o original — lixo em bucket é conta no fim do mês. */
export async function removeVariants(variants: ImageVariant[] | null | undefined) {
  if (!variants?.length) return;
  const store = storage();
  await Promise.all(variants.map((v) => store.remove(v.key).catch(() => {})));
}
