/**
 * Dados legais da campanha — puros, lidos pelo servidor (que decide) e pela
 * tela (que avisa antes de enviar).
 *
 * A Lei 5.768/71 autoriza a campanha, não a plataforma: cada rifa tem o seu
 * certificado da SPA/MF e a sua data de sorteio. Os dois travam ao publicar,
 * como o total de cotas — quem comprou comprou aquela data e aquela
 * autorização.
 */

/** O arquivo do certificado, antes do reprocessamento. */
export const CERTIFICADO_MAX_BYTES = 5 * 1024 * 1024;
export const CERTIFICADO_MIMES = ["application/pdf", "image/jpeg", "image/png", "image/webp"];

/** Margem mínima entre agora e o sorteio: menos que isto não dá para vender. */
export const SORTEIO_ANTECEDENCIA_MIN_MS = 60 * 60 * 1000;

export interface DadosLegais {
  authorizationCode?: string | null;
  drawAt?: Date | null;
}

/** Devolve o problema, ou `null` se os dados podem ser gravados. */
export function problemaNosDadosLegais(d: DadosLegais, agora: Date): string | null {
  if (d.authorizationCode !== undefined && d.authorizationCode !== null) {
    const codigo = d.authorizationCode.trim();
    if (codigo.length < 5) return "Informe o número do certificado de autorização da SPA/MF.";
    if (codigo.length > 80) return "O número do certificado pode ter no máximo 80 caracteres.";
  }
  if (d.drawAt !== undefined && d.drawAt !== null) {
    if (Number.isNaN(d.drawAt.getTime())) return "Data do sorteio inválida.";
    if (d.drawAt.getTime() - agora.getTime() < SORTEIO_ANTECEDENCIA_MIN_MS) {
      return "O sorteio precisa ser pelo menos 1 hora depois de agora.";
    }
  }
  return null;
}

/**
 * Confere o arquivo pelo conteúdo, não pelo nome nem pelo tipo que o
 * navegador declarou: PDF começa com "%PDF-"; imagem é reprocessada depois.
 */
export function tipoDoCertificado(bytes: Uint8Array): "pdf" | "imagem" | null {
  const inicio = String.fromCharCode(...bytes.slice(0, 5));
  if (inicio === "%PDF-") return "pdf";
  // JPEG, PNG e WebP pelas assinaturas.
  if (bytes[0] === 0xff && bytes[1] === 0xd8) return "imagem";
  if (bytes[0] === 0x89 && inicio.slice(1, 4) === "PNG") return "imagem";
  if (String.fromCharCode(...bytes.slice(8, 12)) === "WEBP") return "imagem";
  return null;
}
