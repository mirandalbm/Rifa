/**
 * A identidade do assistente de IA (Chatbase), sem banco: o segredo de
 * verificação e o hash que o navegador leva. Fica à parte de `ia.ts` para a
 * prova das regras rodar sem `DATABASE_URL` (o `db` exige a variável no
 * momento em que o módulo carrega).
 *
 * O segredo vem de `CHATBASE_IDENTITY_SECRET` e nunca sai do servidor: com ele,
 * qualquer um se passaria por outro usuário nas ações do assistente.
 */
import crypto from "node:crypto";

/** O segredo só vale com 16 caracteres ou mais (sem espaços nas pontas). Puro: não lê o ambiente. */
export function segredoValido(valor: string | null | undefined): string | null {
  const s = valor?.trim();
  return s && s.length >= 16 ? s : null;
}

/** O segredo do ambiente, ou `null` — sem ele o assistente não liga. */
export const segredoDaIA = (): string | null => segredoValido(process.env.CHATBASE_IDENTITY_SECRET);

/** HMAC-SHA256 do id com o segredo, em hexadecimal — o `user_hash` do Chatbase. */
export function hashDaIA(userId: string, segredo: string): string {
  return crypto.createHmac("sha256", segredo).update(userId).digest("hex");
}
