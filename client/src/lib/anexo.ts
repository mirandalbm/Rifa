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
