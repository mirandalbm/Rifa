/**
 * Número que vem do corpo da requisição (valor em centavos, cliques, dias,
 * percentual): só vale número de verdade ou texto de número. `Number()` solto
 * aceita o que não é número — `""` e `[]` viram 0, `true` vira 1, `[100]`
 * vira 100 — e um percentual de taxa mandado vazio virava 0%, calado.
 *
 * Devolve `NaN` para o que não é número; quem chama confere com
 * `Number.isInteger()` e a faixa, como já fazia.
 */
export function numeroDoCorpo(v: unknown): number {
  if (typeof v === "number") return v;
  if (typeof v === "string" && v.trim() !== "") return Number(v);
  return Number.NaN;
}
