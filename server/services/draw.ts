/**
 * Sorteio auditável, de 100 a 1.000.000 de cotas (docs/PLANO-RIFA.md §6).
 *
 * O 1º prêmio da Loteria Federal tem 5 dígitos e endereça no máximo 100.000
 * cotas — para 1.000.000 não existe mapeamento direto. A regra única:
 *
 *   1. Antes da primeira venda publicamos o HASH de uma semente secreta.
 *   2. No dia, o número sai de HMAC(semente, os 5 prêmios do concurso).
 *   3. Depois publicamos a semente: qualquer pessoa refaz a conta.
 *
 * A Federal é a entropia pública que ninguém controla; o hash prévio é a
 * prova de que não escolhemos a semente depois de ver o resultado.
 */
import { createHash, createHmac, randomBytes } from "node:crypto";

export interface SeedCommitment {
  seed: string;
  seedHash: string;
}

export function commitSeed(): SeedCommitment {
  const seed = randomBytes(32).toString("hex");
  return { seed, seedHash: hashSeed(seed) };
}

export function hashSeed(seed: string): string {
  return createHash("sha256").update(seed).digest("hex");
}

export function verifySeed(seed: string, publishedHash: string): boolean {
  return hashSeed(seed) === publishedHash;
}

/**
 * Deriva o número sorteado sem viés de módulo: descarta as amostras que
 * caem na sobra da divisão e tira outra. Sem isso os primeiros números da
 * faixa teriam probabilidade maior — pequena, mas real, e indefensável.
 */
export function drawNumber(params: {
  seed: string;
  federalPrizes: string[];
  totalQuotas: number;
}): number {
  const { seed, federalPrizes, totalQuotas } = params;

  if (federalPrizes.length !== 5) {
    throw Object.assign(new Error("São necessários os 5 prêmios do concurso federal."), { status: 400 });
  }
  if (totalQuotas < 1) throw Object.assign(new Error("Total de cotas inválido."), { status: 400 });

  const publicEntropy = federalPrizes.map((p) => p.trim()).join("-");
  const total = BigInt(totalQuotas);
  const range = 1n << 64n;
  const limit = (range / total) * total;

  for (let counter = 0; counter < 1000; counter++) {
    const digest = createHmac("sha256", seed)
      .update(`${publicEntropy}:${counter}`)
      .digest();
    const value = digest.readBigUInt64BE(0);
    if (value < limit) {
      return Number((value % total) + 1n);
    }
  }
  // Probabilidade astronômica; explodir é melhor do que sortear com viés.
  throw new Error("Não foi possível derivar o número sem viés.");
}
