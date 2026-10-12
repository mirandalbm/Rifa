/**
 * UUID de verdade (8-4-4-4-12). O teste de "tem 36 letras e hífens" deixava
 * passar texto que o Postgres recusa (22P02) — e a rota respondia 500 onde
 * devia dizer 404.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const ehUuid = (id: unknown): id is string => typeof id === "string" && UUID.test(id);
