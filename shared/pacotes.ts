/**
 * Os pacotes de cotas de uma rifa (5 cotas com X% de desconto, 10 com Y%…).
 *
 * Quem lê é o servidor (`PUT /campaigns/:id/packages`) e a tela de edição:
 * a mesma régua nos dois lados. O pacote entra na conta do preço
 * (`priceOrder()`), então um desconto sem teto vira pedido de valor zero ou
 * negativo — cota de graça reservada e Pix de centavos negativos.
 */

/** Quantos pacotes uma rifa pode ter (a tela de venda mostra poucos). */
export const PACOTES_MAX = 10;

/**
 * O maior desconto de um pacote. É o mesmo teto do cupom do afiliado, que
 * desconta por cima: pacote e cupom juntos nunca zeram o total.
 */
export const DESCONTO_DO_PACOTE_MAX_PCT = 50;

export interface PacoteValido {
  quantity: number;
  discountPct: number;
  highlight: boolean;
}

/**
 * Confere a lista de pacotes que veio do corpo da requisição. Só as chaves
 * conhecidas passam adiante (o corpo é do navegador). Ausente ou lista vazia
 * apaga todos os pacotes.
 */
export function validarPacotes(
  bruto: unknown,
  totalDeCotas: number,
): { pacotes: PacoteValido[] } | { problema: string } {
  if (bruto === undefined || bruto === null) return { pacotes: [] };
  if (!Array.isArray(bruto)) return { problema: "A lista de pacotes veio em formato inválido." };
  if (bruto.length > PACOTES_MAX) return { problema: `No máximo ${PACOTES_MAX} pacotes por rifa.` };

  const pacotes: PacoteValido[] = [];
  const quantidades = new Set<number>();
  for (const item of bruto) {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      return { problema: "Cada pacote precisa de quantidade e desconto." };
    }
    const { quantity, discountPct, highlight } = item as Record<string, unknown>;
    if (typeof quantity !== "number" || !Number.isInteger(quantity) || quantity < 1 || quantity > totalDeCotas) {
      return { problema: `A quantidade de cada pacote vai de 1 a ${totalDeCotas.toLocaleString("pt-BR")} cotas (o total da rifa).` };
    }
    if (
      typeof discountPct !== "number" ||
      !Number.isInteger(discountPct) ||
      discountPct < 0 ||
      discountPct > DESCONTO_DO_PACOTE_MAX_PCT
    ) {
      return { problema: `O desconto de cada pacote vai de 0% a ${DESCONTO_DO_PACOTE_MAX_PCT}%, em número inteiro.` };
    }
    if (highlight !== undefined && typeof highlight !== "boolean") {
      return { problema: "O destaque do pacote é sim ou não." };
    }
    if (quantidades.has(quantity)) {
      return { problema: `Dois pacotes com ${quantity} cotas: deixe só um.` };
    }
    quantidades.add(quantity);
    pacotes.push({ quantity, discountPct, highlight: highlight === true });
  }
  return { pacotes };
}
