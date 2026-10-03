/**
 * Banner de divulgação da rifa: a imagem que a organização põe em cima da
 * rifa para divulgar a empresa dela, uma ONG ou o que escolher. Regras
 * puras — a tela e o servidor leem daqui.
 */
import { temLinkOuTelefone } from "./comentarios";

/** As medidas em que a imagem é guardada (3:1), cortada ao centro. */
export const BANNER_DIVULGACAO_LARGURA = 1200;
export const BANNER_DIVULGACAO_ALTURA = 400;
export const BANNER_DIVULGACAO_TITULO_MAX = 100;

/**
 * O título é o texto alternativo da imagem — obrigatório, porque é o que o
 * leitor de tela lê. A régua da legenda: sem link e sem telefone.
 */
export function problemaNoTituloDoBanner(texto: unknown): string | null {
  const t = typeof texto === "string" ? texto.trim() : "";
  if (t.length < 3) return "Descreva a imagem em poucas palavras (é o que o leitor de tela lê).";
  if (t.length > BANNER_DIVULGACAO_TITULO_MAX) return `A descrição passa de ${BANNER_DIVULGACAO_TITULO_MAX} caracteres.`;
  const p = temLinkOuTelefone(t);
  return p ? `A descrição ${p.charAt(0).toLowerCase()}${p.slice(1)}` : null;
}

/** O endereço público da imagem (com `?v=`: troca de imagem, troca de endereço). */
export const urlDoBannerDeDivulgacao = (slug: string, em: Date | string) =>
  `/api/public/campaigns/${slug}/banner-divulgacao?v=${new Date(em).getTime()}`;
