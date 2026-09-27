/**
 * Comparador de rostos: a foto do perfil é da pessoa do documento?
 *
 * **Nasce desligado.** Sem comparador, quem confere é uma pessoa da
 * plataforma, com as duas fotos lado a lado (Atendimento → Verificações).
 * Com `ROSTO_PROVEDOR=rekognition` (e as credenciais da AWS no ambiente:
 * `ROSTO_AWS_ACCESS_KEY_ID`, `ROSTO_AWS_SECRET_ACCESS_KEY` e
 * `ROSTO_AWS_REGION`), o caso claro se resolve sozinho: semelhança acima de
 * `LIMIAR_ROSTO` verifica; abaixo, não recusa — vai para a análise humana.
 *
 * A foto é dado biométrico (LGPD, art. 11): a pessoa consente na tela
 * antes de enviar, as imagens vão só para a comparação (o provedor não
 * guarda — `CompareFaces` não indexa) e nada disso sai do cofre fora daqui.
 *
 * Falha do provedor nunca recusa ninguém: vira análise humana.
 */
import sharp from "sharp";
import { CompareFacesCommand, RekognitionClient } from "@aws-sdk/client-rekognition";

export interface ComparadorDeRostos {
  nome: string;
  /** Semelhança de 0 a 100, ou `null` quando não achou rosto em uma das fotos. */
  comparar(fotoDoPerfil: Buffer, fotoDoDocumento: Buffer): Promise<number | null>;
}

/** JPEG de até 1600 px: o formato que todo provedor aceita, e abaixo dos 5 MB do Rekognition. */
export async function paraComparar(imagem: Buffer): Promise<Buffer> {
  return sharp(imagem, { limitInputPixels: 40_000_000 })
    .rotate()
    .resize(1600, 1600, { fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 90 })
    .toBuffer();
}

function rekognition(): ComparadorDeRostos | null {
  const accessKeyId = process.env.ROSTO_AWS_ACCESS_KEY_ID;
  const secretAccessKey = process.env.ROSTO_AWS_SECRET_ACCESS_KEY;
  if (!accessKeyId || !secretAccessKey) {
    console.warn("[rosto] ROSTO_PROVEDOR=rekognition sem ROSTO_AWS_ACCESS_KEY_ID/ROSTO_AWS_SECRET_ACCESS_KEY: comparação manual.");
    return null;
  }
  const cliente = new RekognitionClient({
    region: process.env.ROSTO_AWS_REGION ?? "us-east-1",
    credentials: { accessKeyId, secretAccessKey },
    maxAttempts: 2,
  });
  return {
    nome: "rekognition",
    async comparar(perfil, documento) {
      const r = await cliente.send(
        new CompareFacesCommand({
          SourceImage: { Bytes: await paraComparar(perfil) },
          TargetImage: { Bytes: await paraComparar(documento) },
          SimilarityThreshold: 0,
        }),
        { abortSignal: AbortSignal.timeout(10_000) },
      );
      const melhor = Math.max(-1, ...(r.FaceMatches ?? []).map((m) => m.Similarity ?? 0));
      return melhor < 0 ? null : Math.floor(melhor);
    },
  };
}

let cache: ComparadorDeRostos | null | undefined;

/** O comparador configurado no ambiente, ou `null` (análise humana). */
export function comparadorAtivo(): ComparadorDeRostos | null {
  if (cache !== undefined) return cache;
  cache = process.env.ROSTO_PROVEDOR === "rekognition" ? rekognition() : null;
  return cache;
}
