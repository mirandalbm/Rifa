/**
 * A chave do balde da janela deslizante do antifraude (`rate_events.bucket`).
 * Num arquivo sem banco de propósito: é a regra que os testes exercitam.
 */
import { createHash } from "node:crypto";

/** O maior balde que vai ao índice como veio (o limite do btree do Postgres é ~2,7 KB por linha). */
const BALDE_MAX = 200;

/**
 * O balde vem, muitas vezes, do que a pessoa digitou (o e-mail do login, o
 * telefone do código). Texto enorme estoura a linha do índice
 * (`idx_rate_bucket`) e o byte nulo o Postgres recusa: o `INSERT` falhava e,
 * numa rota aberta, isso era um pedido anônimo derrubando o servidor. O que
 * passa de `BALDE_MAX` (ou leva byte nulo) vira o começo legível mais a
 * impressão do todo — o mesmo texto cai sempre no mesmo balde, e o balde
 * curto segue exatamente como era.
 */
export function chaveDoBalde(bucket: string): string {
  if (bucket.length <= BALDE_MAX && !bucket.includes("\0")) return bucket;
  const inicio = bucket.slice(0, 60).replaceAll("\0", "");
  return `${inicio}#${createHash("sha256").update(bucket).digest("hex").slice(0, 32)}`;
}
