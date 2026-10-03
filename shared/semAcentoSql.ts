/**
 * A expressão SQL que tira acento e maiúscula de uma coluna — a mesma na
 * consulta da busca (`server/services/buscar.ts`) e nos índices de trigrama
 * (`shared/schema.ts`). O índice só serve à consulta se as duas forem
 * idênticas, letra por letra: por isso moram aqui, num lugar só.
 * `translate` e `lower` são imutáveis, o que o índice de expressão exige.
 *
 * **Mudou uma letra, suba `VERSAO_SEM_ACENTO`** (e `ASSINATURA_SEM_ACENTO`): o
 * nome dos índices leva a versão, e o `drizzle-kit` só recria índice quando o
 * nome muda — ele não compara a expressão. `tests/semAcentoSql.test.ts` falha
 * se as letras mudarem sem a versão.
 */
export const ACENTOS_DE = "áàâãäéèêëíìîïóòôõöúùûüç";
export const ACENTOS_PARA = "aaaaaeeeeiiiiooooouuuuc";

export const VERSAO_SEM_ACENTO = 1;
/** As letras da versão acima; o teste confere que nada mudou sem subir a versão. */
export const ASSINATURA_SEM_ACENTO = "áàâãäéèêëíìîïóòôõöúùûüç>aaaaaeeeeiiiiooooouuuuc";
