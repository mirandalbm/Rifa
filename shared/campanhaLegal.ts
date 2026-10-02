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

/**
 * Mínimo de cotas vendidas para o sorteio acontecer, em percentual do total,
 * definido pela promotora conforme a autorização (0 = sem mínimo). Trava ao
 * publicar, como a data: quem comprou comprou sabendo a regra. Não atingido
 * na data, o sorteio não roda e a promotora pede o adiamento.
 */
export const MINIMO_VENDIDO_MAX_PCT = 100;

/** Inteiro de 0 a 100, ou o problema. */
export function problemaNoMinimoVendido(pct: unknown): string | null {
  if (typeof pct !== "number" || !Number.isInteger(pct)) return "O mínimo de cotas vendidas é um percentual inteiro.";
  if (pct < 0 || pct > MINIMO_VENDIDO_MAX_PCT) return "O mínimo de cotas vendidas vai de 0% a 100%.";
  return null;
}

/** Quantas cotas pagas o mínimo exige (arredonda para cima: 1,2 cota vira 2). */
export function cotasMinimasParaSortear(totalCotas: number, pct: number): number {
  if (pct <= 0) return 0;
  return Math.ceil((totalCotas * pct) / 100);
}

/** O mínimo foi atingido? Sem mínimo, sempre. */
export function minimoAtingido(vendidas: number, totalCotas: number, pct: number): boolean {
  return vendidas >= cotasMinimasParaSortear(totalCotas, pct);
}
