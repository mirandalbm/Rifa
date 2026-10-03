/**
 * A expressão SQL que tira acento e maiúscula de uma coluna — a mesma na
 * consulta da busca (`server/services/buscar.ts`) e nos índices de trigrama
 * (`shared/schema.ts`). O índice só serve à consulta se as duas forem
 * idênticas, letra por letra: por isso moram aqui, num lugar só.
 * `translate` e `lower` são imutáveis, o que o índice de expressão exige.
 */
export const ACENTOS_DE = "áàâãäéèêëíìîïóòôõöúùûüç";
export const ACENTOS_PARA = "aaaaaeeeeiiiiooooouuuuc";
