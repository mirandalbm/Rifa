/**
 * Leitura de erro do Postgres.
 *
 * Fica num arquivo sem dependência de banco de propósito: é isto que os
 * testes exercitam, e reconhecer um conflito de índice é decisão de regra,
 * não de infraestrutura.
 */

/** Violação de índice único. */
export const UNIQUE_VIOLATION = "23505";

/** Deadlock: o Postgres escolheu uma das transações e a desfez inteira. */
export const DEADLOCK = "40P01";

/**
 * O erro é um deadlock? O Postgres já desfez a transação, e repetir é seguro
 * (o Drizzle embrulha o erro do driver; o código está em `cause`).
 */
export function isDeadlock(err: unknown): boolean {
  const causa = (err as { cause?: unknown })?.cause;
  if (causa && causa !== err && isDeadlock(causa)) return true;
  return (err as { code?: string })?.code === DEADLOCK;
}

/**
 * O erro é a violação deste índice único?
 *
 * Precisa ser específico: numa transação que grava pedido *e* cota, um
 * `23505` genérico pode ser colisão de cota — e essa não se resolve
 * sorteando outro código.
 */
export function isUniqueViolation(err: unknown, constraint: string): boolean {
  // O Drizzle embrulha o erro do driver (`DrizzleQueryError`) e guarda o
  // original em `cause`. Sem desembrulhar, o conflito vira erro 500.
  const causa = (err as { cause?: unknown })?.cause;
  if (causa && causa !== err && isUniqueViolation(causa, constraint)) return true;

  const e = err as { code?: string; constraint?: string; message?: string };
  if (e?.code !== UNIQUE_VIOLATION) return false;
  // O driver nem sempre preenche `constraint` (depende de onde o erro
  // sobe); a mensagem do Postgres sempre traz o nome do índice.
  return e.constraint === constraint || Boolean(e.message?.includes(constraint));
}
