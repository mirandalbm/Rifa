/**
 * A regra de `shared/titularidade.ts` em SQL, para as consultas que listam e
 * exportam em volume (não dá para buscar pedido a pedido).
 */
import { sql, type SQL } from "drizzle-orm";

/**
 * Verdadeiro quando a sessão pode ver o cliente deste pedido: plataforma
 * (organização nula), venda de cambista ou ganhador. `o` é o apelido da
 * tabela `orders` na consulta.
 */
export function clienteVisivelSql(organizationId: string | null, o = "o"): SQL {
  if (!organizationId) return sql`TRUE`;
  const p = sql.raw(o);
  return sql`(${p}.seller_id IS NOT NULL
    OR EXISTS (SELECT 1 FROM draws dw WHERE dw.winner_order_id = ${p}.id)
    OR EXISTS (SELECT 1 FROM prized_quotas pz WHERE pz.claimed_by_order_id = ${p}.id))`;
}

/** Nome para o painel: o de verdade, ou "Cliente C-XXXXXXXX". */
export function nomeNoPainelSql(visivel: SQL, b = "b"): SQL {
  const t = sql.raw(b);
  return sql`CASE WHEN ${visivel} THEN ${t}.name
                  ELSE coalesce('Cliente ' || ${t}.codigo, 'Cliente da plataforma') END`;
}

/** Dado pessoal (telefone, CPF, e-mail) só quando visível; senão nulo. */
export function dadoNoPainelSql(visivel: SQL, coluna: string): SQL {
  return sql`CASE WHEN ${visivel} THEN ${sql.raw(coluna)} END`;
}
