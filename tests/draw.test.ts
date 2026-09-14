import { describe, it, expect } from "vitest";
import { commitSeed, drawNumber, verifySeed, hashSeed } from "../server/services/draw";

const PRIZES = ["48219", "07314", "91002", "55628", "30471"];

describe("compromisso da semente", () => {
  it("o hash publicado confere com a semente revelada", () => {
    const { seed, seedHash } = commitSeed();
    expect(verifySeed(seed, seedHash)).toBe(true);
    expect(verifySeed(seed + "x", seedHash)).toBe(false);
  });

  it("sementes diferentes geram hashes diferentes", () => {
    expect(hashSeed("a")).not.toBe(hashSeed("b"));
  });
});

describe("número sorteado", () => {
  const seed = "semente-de-teste";

  it("é determinístico: qualquer pessoa refaz a conta", () => {
    const a = drawNumber({ seed, federalPrizes: PRIZES, totalQuotas: 1_000_000 });
    const b = drawNumber({ seed, federalPrizes: PRIZES, totalQuotas: 1_000_000 });
    expect(a).toBe(b);
  });

  it("cai dentro da faixa, inclusive no teto de 1 milhão", () => {
    for (const total of [100, 1_000, 100_000, 1_000_000]) {
      const n = drawNumber({ seed, federalPrizes: PRIZES, totalQuotas: total });
      expect(n).toBeGreaterThanOrEqual(1);
      expect(n).toBeLessThanOrEqual(total);
    }
  });

  it("muda quando o resultado da Federal muda", () => {
    const a = drawNumber({ seed, federalPrizes: PRIZES, totalQuotas: 1_000_000 });
    const b = drawNumber({
      seed,
      federalPrizes: ["00001", ...PRIZES.slice(1)],
      totalQuotas: 1_000_000,
    });
    expect(a).not.toBe(b);
  });

  it("exige os 5 prêmios do concurso", () => {
    expect(() =>
      drawNumber({ seed, federalPrizes: ["48219"], totalQuotas: 1000 }),
    ).toThrow();
  });

  it("distribui sem viés perceptível entre as metades", () => {
    let low = 0;
    const runs = 2000;
    for (let i = 0; i < runs; i++) {
      const n = drawNumber({
        seed: `semente-${i}`,
        federalPrizes: PRIZES,
        totalQuotas: 1_000_000,
      });
      if (n <= 500_000) low++;
    }
    // Margem folgada: o teste pega viés grosseiro, não ruído estatístico.
    expect(low / runs).toBeGreaterThan(0.44);
    expect(low / runs).toBeLessThan(0.56);
  });
});
