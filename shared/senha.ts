/**
 * Regra de senha — uma só, lida pelo servidor (que decide) e pela tela (que
 * avisa antes de enviar).
 *
 * O administrador geral pede mais: o painel dele alcança o caixa de todas as
 * organizações. É o mesmo mínimo que `npm run admin:create` exige.
 */

export const MIN_SENHA = 8;
export const MIN_SENHA_ADMIN = 12;

/** As que aparecem primeiro em qualquer lista de senhas vazadas. */
const CONHECIDAS = new Set([
  "12345678",
  "123456789",
  "1234567890",
  "123456789012",
  "senha123",
  "senha1234",
  "admin123",
  "password",
  "qwertyui",
  "abcd1234",
  "11111111",
  "00000000",
]);

export function minimoSenha(role: string): number {
  return role === "admin" ? MIN_SENHA_ADMIN : MIN_SENHA;
}

/** Motivo da recusa, ou `null` se a senha serve. */
export function senhaInvalida(senha: string, role: string): string | null {
  const minimo = minimoSenha(role);
  if (senha.length < minimo) {
    return `A senha precisa ter pelo menos ${minimo} caracteres.`;
  }
  if (senha.length > 200) return "Senha longa demais.";
  if (CONHECIDAS.has(senha.toLowerCase())) {
    return "Essa senha é conhecida demais. Escolha outra.";
  }
  return null;
}
