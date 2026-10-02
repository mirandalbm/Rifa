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

export function segredoDaIA(env = process.env.CHATBASE_IDENTITY_SECRET): string | null {
  const s = env?.trim();
  return s && s.length >= 16 ? s : null;
}

/** HMAC-SHA256 do id com o segredo, em hexadecimal — o `user_hash` do Chatbase. */
export function hashDaIA(userId: string, segredo: string): string {
  return crypto.createHmac("sha256", segredo).update(userId).digest("hex");
}
