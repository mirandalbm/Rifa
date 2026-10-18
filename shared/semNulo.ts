/**
 * O byte nulo (`\u0000`) não existe em texto do Postgres: qualquer `INSERT`,
 * `WHERE` ou comparação que o leve falha com "invalid byte sequence" (22021).
 * Numa rota aberta, isso virava erro 500 — e, na rota `async` sem `try`, um
 * pedido anônimo derrubando o processo. Ninguém digita um byte nulo: ele chega
 * pelo endereço (`%00`), pela consulta ou por dentro do JSON. Recusar na
 * porta, uma vez, vale para todas as rotas.
 */

const PROFUNDIDADE_MAX = 12;
const VISITAS_MAX = 20_000;

/** O texto tem byte nulo, cru ou como `%00` no endereço? */
export function enderecoTemByteNulo(endereco: string): boolean {
  return endereco.includes("\0") || /%00/i.test(endereco);
}

/**
 * O valor (texto, lista ou objeto vindo de JSON ou de formulário) leva byte
 * nulo em algum texto, na chave ou no conteúdo? Para depois de olhar
 * `VISITAS_MAX` nós — corpo gigante e raso não vira conta cara.
 */
export function temByteNulo(valor: unknown): boolean {
  let visitas = 0;
  const olhar = (v: unknown, nivel: number): boolean => {
    if (typeof v === "string") return v.includes("\0");
    if (v === null || typeof v !== "object" || ArrayBuffer.isView(v) || nivel > PROFUNDIDADE_MAX) return false;
    if (++visitas > VISITAS_MAX) return false;
    if (Array.isArray(v)) return v.some((x) => olhar(x, nivel + 1));
    for (const [k, x] of Object.entries(v as Record<string, unknown>)) {
      if (k.includes("\0") || olhar(x, nivel + 1)) return true;
    }
    return false;
  };
  return olhar(valor, 0);
}

/** O erro do Postgres é "texto com byte nulo" (22021), mesmo embrulhado pelo Drizzle? */
export function erroDeByteNulo(err: unknown): boolean {
  const e = err as { code?: string; cause?: unknown } | null | undefined;
  if (!e) return false;
  if (e.code === "22021") return true;
  return e.cause && e.cause !== err ? erroDeByteNulo(e.cause) : false;
}
