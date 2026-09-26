/**
 * Rifas patrocinadas por clique (etapa 15) — regras puras.
 *
 * O organizador põe saldo (Pix para a plataforma, ou crédito lançado pela
 * plataforma) e escolhe quais rifas dele aparecem no bloco "Patrocinadas"
 * da vitrine. Cada clique de visitante novo desconta o preço do clique,
 * definido pelo administrador geral. Três regras seguram a conta honesta:
 *
 * - o clique conta **uma vez por visitante em 24 h** por patrocínio;
 * - **robô não conta** (sem aparelho identificado ou com agente de robô);
 * - **saldo não fica negativo**: o desconto é um `UPDATE` condicional, e
 *   sem saldo a rifa sai do bloco.
 */

export const PATROCINADAS_NO_AR = 5;
export const PATROCINIOS_POR_ORGANIZACAO = 3;
export const JANELA_DO_CLIQUE_HORAS = 24;

export const PRECO_CLIQUE_PADRAO_CENTS = 50;
export const PRECO_CLIQUE_MIN_CENTS = 5;
export const PRECO_CLIQUE_MAX_CENTS = 10_000;
export const RECARGA_MINIMA_PADRAO_CENTS = 2_000;
export const RECARGA_MAXIMA_CENTS = 1_000_000;

/** Agentes que nunca são gente: buscadores, pré-visualizadores de link, automação. */
const ROBO =
  /bot|crawl|spider|slurp|facebookexternalhit|whatsapp|telegram|preview|headless|lighthouse|curl|wget|python-requests|axios|node-fetch|go-http|java\//i;

export function ehRobo(userAgent: string | null | undefined): boolean {
  return !userAgent || userAgent.length < 10 || ROBO.test(userAgent);
}

export function precoDoCliqueValido(v: unknown, padrao = PRECO_CLIQUE_PADRAO_CENTS): number {
  if (v === undefined || v === null) return padrao;
  const n = Number(v);
  if (!Number.isInteger(n) || n < PRECO_CLIQUE_MIN_CENTS || n > PRECO_CLIQUE_MAX_CENTS) {
    throw Object.assign(new Error("O preço do clique vai de R$ 0,05 a R$ 100,00."), { status: 400 });
  }
  return n;
}

export function recargaMinimaValida(v: unknown): number {
  if (v === undefined || v === null) return RECARGA_MINIMA_PADRAO_CENTS;
  const n = Number(v);
  if (!Number.isInteger(n) || n < 100 || n > RECARGA_MAXIMA_CENTS) {
    throw Object.assign(new Error("A recarga mínima vai de R$ 1,00 a R$ 10.000,00."), { status: 400 });
  }
  return n;
}

/** Motivo pelo qual a recarga não sai, ou `null`. */
export function problemaNaRecarga(valorCents: number, minimaCents: number): string | null {
  if (!Number.isInteger(valorCents)) return "Informe o valor em reais.";
  if (valorCents < minimaCents) return `A recarga mínima é de ${(minimaCents / 100).toFixed(2).replace(".", ",")} reais.`;
  if (valorCents > RECARGA_MAXIMA_CENTS) return "A recarga máxima é de 10.000,00 reais.";
  return null;
}

/**
 * Quais patrocínios entram no bloco agora: no máximo `PATROCINADAS_NO_AR`,
 * sorteados entre os que podem pagar ao menos um clique. Sorteio a cada
 * visita, para ninguém ficar sempre na frente; `sorteio(n)` injetado para
 * teste.
 */
export function escolherPatrocinadas<T extends { saldoCents: number }>(
  candidatos: T[],
  precoCents: number,
  sorteio: (n: number) => number,
): T[] {
  const aptos = candidatos.filter((c) => c.saldoCents >= precoCents);
  for (let i = aptos.length - 1; i > 0; i--) {
    const j = sorteio(i + 1);
    [aptos[i], aptos[j]] = [aptos[j], aptos[i]];
  }
  return aptos.slice(0, PATROCINADAS_NO_AR);
}

/** Custo por venda: gasto ÷ vendas atribuídas, para baixo (dinheiro é inteiro). */
export function custoPorVenda(gastoCents: number, vendas: number): number | null {
  return vendas > 0 ? Math.floor(gastoCents / vendas) : null;
}
