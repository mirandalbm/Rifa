/**
 * O assunto de uma foto, pelo recorte atento do `sharp` (`position:
 * "attention"`, o mesmo das artes prontas e das fotos de perfil). Sem banco:
 * recebe os bytes e devolve o foco em fração, ou `null` se a foto não abre.
 */
import sharp from "sharp";
import { focoEmFracao, type Foco } from "@shared/editorImagem";

/** O quadrado em que o `sharp` procura o assunto: pequeno, rápido e firme o bastante para enquadrar. */
export const LADO_DA_ATENCAO = 128;

export async function focoDosBytes(bytes: Buffer): Promise<Foco | null> {
  try {
    // Primeiro a foto em pé como a tela a mostra (rotação do EXIF) e pequena; depois a atenção.
    const pequena = await sharp(bytes, { limitInputPixels: 40_000_000 })
      .rotate()
      .resize(512, 512, { fit: "inside", withoutEnlargement: true })
      .toBuffer({ resolveWithObject: true });
    const { info } = await sharp(pequena.data)
      .resize(LADO_DA_ATENCAO, LADO_DA_ATENCAO, { fit: "cover", position: "attention" })
      .toBuffer({ resolveWithObject: true });
    return focoEmFracao({ x: info.attentionX, y: info.attentionY }, { largura: pequena.info.width, altura: pequena.info.height }, LADO_DA_ATENCAO);
  } catch {
    return null;
  }
}
