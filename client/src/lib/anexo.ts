import { ANEXO_MAX_BYTES } from "@shared/chamados";

/**
 * Lê a imagem escolhida como `data:` URL, para ir no corpo do chamado. O
 * servidor reprocessa (e é ele quem decide); aqui só barramos o óbvio, para
 * a pessoa não esperar um envio que vai ser recusado.
 */
export function lerImagem(arquivo: File): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!arquivo.type.startsWith("image/")) {
      reject(new Error("Escolha uma imagem (foto ou print)."));
      return;
    }
    if (arquivo.size > ANEXO_MAX_BYTES) {
      reject(new Error("A imagem passa de 5 MB. Envie um print menor."));
      return;
    }
    const leitor = new FileReader();
    leitor.onload = () => resolve(String(leitor.result));
    leitor.onerror = () => reject(new Error("Não consegui ler a imagem."));
    leitor.readAsDataURL(arquivo);
  });
}

/**
 * Lê a foto do perfil (ou a capa) já reduzida no aparelho: a foto da câmera
 * do celular tem 3 a 12 MB e passaria dos limites do envio, mas o servidor
 * guarda no máximo 1500 px. Aqui ela sai em JPEG com o lado maior em `lado`
 * px, com a rotação do EXIF aplicada. O servidor reprocessa de todo jeito
 * (e é ele quem decide). Se o navegador não souber abrir o arquivo (HEIC no
 * Chrome, por exemplo), manda como veio e o servidor responde.
 */
export async function lerFoto(arquivo: File, lado = 1600): Promise<string> {
  if (!arquivo.type.startsWith("image/") && arquivo.type !== "") throw new Error("Escolha uma imagem (JPG, PNG ou WebP).");
  try {
    const bitmap = await createImageBitmap(arquivo, { imageOrientation: "from-image" });
    const escala = Math.min(1, lado / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * escala));
    canvas.height = Math.max(1, Math.round(bitmap.height * escala));
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("sem canvas");
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close?.();
    return canvas.toDataURL("image/jpeg", 0.88);
  } catch {
    return lerImagem(arquivo);
  }
}
