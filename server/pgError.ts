/**
 * Leitura de erro do Postgres.
 *
 * Fica num arquivo sem dependência de banco de propósito: é isto que os
 * testes exercitam, e reconhecer um conflito de índice é decisão de regra,
 * não de infraestrutura.
 */

/** Violação de índice único. */
export const UNIQUE_VIOLATION = "23505";

/**
 * O erro é a violação deste índice único?
 *
 * Precisa ser específico: numa transação que grava pedido *e* cota, um
 * `23505` genérico pode ser colisão de cota — e essa não se resolve
 * sorteando outro código.
 */
export function isUniqueViolation(err: unknown, constraint: string): boolean {
  const e = err as { code?: string; constraint?: string; message?: string };
  if (e?.code !== UNIQUE_VIOLATION) return false;
  // O driver nem sempre preenche `constraint` (depende de onde o erro
  // sobe); a mensagem do Postgres sempre traz o nome do índice.
  return e.constraint === constraint || Boolean(e.message?.includes(constraint));
}
