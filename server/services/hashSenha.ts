/**
 * Hash da senha: scrypt do próprio Node, sem dependência extra. Sem banco,
 * para o teste alcançar (`tests/hashSenha.test.ts`).
 */
import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scryptAsync = promisify(scrypt);

/**
 * Custo do scrypt da senha: N = 2¹⁶, r = 8, p = 2 (64 MiB por cálculo), uma
 * das combinações que a OWASP recomenda. O padrão do Node (N = 2¹⁴) custa um
 * quarto disso para quem tenta adivinhar a senha a partir do banco vazado.
 * Fica no próprio hash (`s2$N$r$p$sal$chave`): subir o custo de novo não
 * invalida nenhuma senha, só passa a refazer as antigas no login.
 */
export const CUSTO_DA_SENHA = { N: 2 ** 16, r: 8, p: 2 } as const;
const PREFIXO_S2 = "s2$";

function derivar(plain: string, salt: string, c: { N: number; r: number; p: number }) {
  return new Promise<Buffer>((ok, erro) =>
    scrypt(plain, salt, 64, { N: c.N, r: c.r, p: c.p, maxmem: 256 * c.N * c.r }, (e, k) => (e ? erro(e) : ok(k))),
  );
}

export async function hashPassword(plain: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const { N, r, p } = CUSTO_DA_SENHA;
  const derived = await derivar(plain, salt, CUSTO_DA_SENHA);
  return `${PREFIXO_S2}${N}$${r}$${p}$${salt}$${derived.toString("hex")}`;
}

/**
 * Código de uso único (o do WhatsApp, 6 dígitos, minutos de vida): o custo
 * padrão basta — o limite de tentativas é quem protege, e o código some logo.
 */
export async function hashCodigo(plain: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const derived = (await scryptAsync(plain, salt, 64)) as Buffer;
  return `${salt}:${derived.toString("hex")}`;
}

export async function verifyPassword(plain: string, stored: string): Promise<boolean> {
  let derived: Buffer;
  let key: string;
  if (stored.startsWith(PREFIXO_S2)) {
    const [N, r, p, salt, k] = stored.slice(PREFIXO_S2.length).split("$");
    const c = { N: Number(N), r: Number(r), p: Number(p) };
    // Só o que nós gravamos: custo fora da faixa é dado mexido, e um N enorme
    // vindo do banco travaria o processo.
    if (!salt || !k || ![c.N, c.r, c.p].every(Number.isInteger) || c.N < 2 ** 14 || c.N > 2 ** 20 || c.r < 1 || c.r > 16 || c.p < 1 || c.p > 4) {
      return false;
    }
    derived = await derivar(plain, salt, c);
    key = k;
  } else {
    const [salt, k] = stored.split(":");
    if (!salt || !k) return false;
    derived = (await scryptAsync(plain, salt, 64)) as Buffer;
    key = k;
  }
  const expected = Buffer.from(key, "hex");
  if (expected.length !== derived.length) return false;
  return timingSafeEqual(derived, expected);
}

/** O hash guardado é de custo menor que o de agora? (Refazer no login, com a senha certa na mão.) */
export function senhaPedeNovoHash(stored: string): boolean {
  if (!stored.startsWith(PREFIXO_S2)) return true;
  const [N, r, p] = stored.slice(PREFIXO_S2.length).split("$").map(Number);
  return N < CUSTO_DA_SENHA.N || r < CUSTO_DA_SENHA.r || p < CUSTO_DA_SENHA.p;
}
