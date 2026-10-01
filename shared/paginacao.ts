/**
 * Paginação por chave (keyset) das listas do painel: Pedidos e o extrato de
 * Cobrança. Nada de `OFFSET` — a lista anda para trás no tempo e a próxima
 * página começa depois da última linha vista, então linha nova no topo não
 * empurra nem repete nada.
 *
 * O cursor é `<criado em, ISO>|<id>`: o par decide a ordem (`created_at`
 * sozinho empata em vendas do mesmo milissegundo). Vem da URL, então só o
 * formato exato é aceito — o resto vira "primeira página", nunca erro nem
 * SQL.
 */

export const PAGINA_PADRAO = 25;
export const PAGINA_MAX = 100;

const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,6})?Z$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface CursorDaLista {
  criadoEm: Date;
  id: string;
}

export function fazerCursor(criadoEm: Date, id: string): string {
  return `${criadoEm.toISOString()}|${id}`;
}

/** Lê o cursor da URL; texto fora do formato é `null` (primeira página). */
export function lerCursor(texto: unknown): CursorDaLista | null {
  if (typeof texto !== "string") return null;
  const [iso, id, ...resto] = texto.split("|");
  if (resto.length || !iso || !id || !ISO.test(iso) || !UUID.test(id)) return null;
  const criadoEm = new Date(iso);
  return Number.isNaN(criadoEm.getTime()) ? null : { criadoEm, id };
}

/** O tamanho da página pedido, preso entre 1 e o máximo. */
export function limiteDaPagina(texto: unknown, padrao = PAGINA_PADRAO): number {
  const n = Number(texto);
  if (!Number.isInteger(n) || n < 1) return padrao;
  return Math.min(n, PAGINA_MAX);
}

/**
 * Pede-se uma linha a mais que a página: se ela veio, há próxima página e o
 * cursor é o da última linha **mostrada**. Sem `COUNT(*)`.
 */
export function cortarPagina<T extends { criadoEm: Date; id: string }>(
  linhas: T[],
  limite: number,
): { itens: T[]; proximo: string | null } {
  if (linhas.length <= limite) return { itens: linhas, proximo: null };
  const itens = linhas.slice(0, limite);
  const ultima = itens[itens.length - 1];
  return { itens, proximo: fazerCursor(ultima.criadoEm, ultima.id) };
}
