import { apiRequest } from "@/lib/queryClient";

/**
 * Publica um vídeo só no Reels de uma rifa, pelos mesmos dois passos de toda
 * mídia: o servidor dá o endereço assinado (com o teto de bytes), o arquivo
 * sobe para ele e a confirmação grava — é aí que o servidor mede duração e
 * medidas e confere a legenda. O envio vai por `XMLHttpRequest` só para a tela
 * ter o progresso (o `fetch` não conta os bytes enviados).
 */
export async function enviarReels(
  campaignId: string,
  file: File,
  legenda: string,
  aoProgresso?: (fracao: number) => void,
): Promise<void> {
  const chave = `/api/admin/campaigns/${campaignId}/media`;
  const ticket = (await (
    await apiRequest("POST", `${chave}/upload-url`, { role: "reels", filename: file.name, mime: file.type, bytes: file.size })
  ).json()) as { url: string; storageKey: string; headers: Record<string, string> };
  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", ticket.url);
    xhr.withCredentials = true;
    for (const [nome, valor] of Object.entries(ticket.headers ?? {})) xhr.setRequestHeader(nome, valor);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && aoProgresso) aoProgresso(Math.min(1, e.loaded / e.total));
    };
    xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error("Falha ao enviar o vídeo.")));
    xhr.onerror = () => reject(new Error("Falha ao enviar o vídeo. Confira a internet e tente de novo."));
    xhr.send(file);
  });
  await apiRequest("POST", chave, { role: "reels", storageKey: ticket.storageKey, mime: file.type, legenda });
}
