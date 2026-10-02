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

/**
 * Como a rifa chega ao sorteio — escolha da promotora nos dados legais, que
 * trava ao publicar e entra no regulamento:
 *
 * - `data`: sorteia na data marcada, com o mínimo de cotas vendidas que ela
 *   definir (0 = sem mínimo); número não vendido segue a aproximação.
 * - `cheia_com_data`: só sorteia com a rifa cheia (mínimo de 100%); não
 *   cheia na data, a promotora pede o adiamento.
 * - `quando_completar`: sem data marcada; quando a última cota é paga, o
 *   sorteio é marcado sozinho para a próxima extração da Loteria Federal.
 * - `promotora_completa`: sorteia na data; as cotas não vendidas ficam com a
 *   promotora — se o número sorteado for uma delas, o prêmio fica com ela.
 */
export const MODOS_DO_SORTEIO = ["data", "cheia_com_data", "quando_completar", "promotora_completa"] as const;
export type ModoDoSorteio = (typeof MODOS_DO_SORTEIO)[number];

export const ROTULO_DO_MODO: Record<ModoDoSorteio, string> = {
  data: "Na data marcada",
  cheia_com_data: "Rifa cheia, na data marcada",
  quando_completar: "Rifa cheia, sorteio quando completar",
  promotora_completa: "Na data, a promotora fica com as cotas não vendidas",
};

export const EXPLICACAO_DO_MODO: Record<ModoDoSorteio, string> = {
  data: "Sorteia na data, com o mínimo de cotas vendidas que você definir. Número sorteado não vendido passa ao vendido mais próximo.",
  cheia_com_data: "Só sorteia com todas as cotas vendidas. Se não completar até a data, você pede o adiamento.",
  quando_completar: "Sem data marcada: quando a última cota for paga, o sorteio é marcado para a próxima extração da Loteria Federal.",
  promotora_completa: "Sorteia na data. As cotas não vendidas ficam com a promotora: se o número sorteado for uma delas, o prêmio fica com ela.",
};

export function modoValido(m: unknown): m is ModoDoSorteio {
  return typeof m === "string" && (MODOS_DO_SORTEIO as readonly string[]).includes(m);
}

/** Os modos de rifa cheia exigem 100%; os outros usam o mínimo que a promotora definiu. */
export function minimoDoModo(modo: ModoDoSorteio, pct: number): number {
  return modo === "cheia_com_data" || modo === "quando_completar" ? 100 : modo === "promotora_completa" ? 0 : pct;
}

/** Só o modo "quando completar" nasce sem data. */
export function modoSemData(modo: ModoDoSorteio): boolean {
  return modo === "quando_completar";
}

/**
 * Data provisória da comissão que espera um sorteio ainda sem data (modo
 * "quando completar"): longe de propósito; quando a data é marcada, a
 * comissão passa a esperar por ela.
 */
export const SORTEIO_SEM_DATA = new Date("9999-12-31T00:00:00Z");

/** Extrações da Loteria Federal: quartas e sábados, às 19h de Brasília (22h UTC). */
export const DIAS_DA_FEDERAL = [3, 6] as const;
export const HORA_DA_FEDERAL_UTC = 22;

/**
 * A próxima extração da Federal com pelo menos `antecedenciaMs` de folga —
 * tempo para avisar quem comprou e para os pedidos de reembolso fecharem
 * (2 h antes), sem pegar ninguém de surpresa.
 */
export function proximaExtracaoFederal(agora: Date, antecedenciaMs = 24 * 60 * 60 * 1000): Date {
  const minimo = agora.getTime() + antecedenciaMs;
  const d = new Date(Date.UTC(agora.getUTCFullYear(), agora.getUTCMonth(), agora.getUTCDate(), HORA_DA_FEDERAL_UTC));
  for (let i = 0; i < 15; i++, d.setUTCDate(d.getUTCDate() + 1)) {
    if ((DIAS_DA_FEDERAL as readonly number[]).includes(d.getUTCDay()) && d.getTime() >= minimo) return new Date(d);
  }
  throw new Error("Não achei a próxima extração da Federal.");
}
