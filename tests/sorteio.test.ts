import { describe, it, expect } from "vitest";
import { randomBytes } from "node:crypto";
import { conferirSorteio, numeroDoSorteio, sha256Hex, transmissaoValida } from "../shared/sorteio";
import { commitSeed, drawNumber, hashSeed } from "../server/services/draw";

const premios = () => Array.from({ length: 5 }, () => String(randomBytes(3).readUIntBE(0, 3) % 100000).padStart(5, "0"));

describe("conferência pública do sorteio", () => {
  it("o navegador chega no mesmo número que o servidor, em centenas de casos", async () => {
    for (const total of [100, 777, 1000, 99_999, 1_000_000]) {
      for (let i = 0; i < 60; i++) {
        const { seed } = commitSeed();
        const federalPrizes = premios();
        const servidor = drawNumber({ seed, federalPrizes, totalQuotas: total });
        const navegador = await numeroDoSorteio({ seed, federalPrizes, totalQuotas: total });
        expect(navegador).toBe(servidor);
      }
    }
  });

  it("o hash confere com o do servidor", async () => {
    const { seed, seedHash } = commitSeed();
    expect(await sha256Hex(seed)).toBe(seedHash);
    expect(hashSeed(seed)).toBe(seedHash);
  });

  it("aponta semente trocada e número anunciado errado", async () => {
    const { seed, seedHash } = commitSeed();
    const federalPrizes = premios();
    const certo = drawNumber({ seed, federalPrizes, totalQuotas: 1000 });

    const ok = await conferirSorteio({ seed, seedHash, federalPrizes, totalQuotas: 1000, resultNumber: certo });
    expect(ok).toEqual({ hashConfere: true, numero: certo, numeroConfere: true });

    const outraSemente = await conferirSorteio({
      seed: commitSeed().seed,
      seedHash,
      federalPrizes,
      totalQuotas: 1000,
      resultNumber: certo,
    });
    expect(outraSemente.hashConfere).toBe(false);

    const anunciadoErrado = await conferirSorteio({
      seed,
      seedHash,
      federalPrizes,
      totalQuotas: 1000,
      resultNumber: (certo % 1000) + 1,
    });
    expect(anunciadoErrado.numeroConfere).toBe(false);
  });
});

describe("link da transmissão", () => {
  it("só https, sem credencial", () => {
    expect(transmissaoValida("https://youtube.com/live/abc")).toBe(true);
    expect(transmissaoValida("https://www.instagram.com/p/xyz/")).toBe(true);
    expect(transmissaoValida("http://youtube.com/live/abc")).toBe(false);
    expect(transmissaoValida("javascript:alert(1)")).toBe(false);
    expect(transmissaoValida("https://u:p@exemplo.com")).toBe(false);
    expect(transmissaoValida("https://" + "a".repeat(600))).toBe(false);
    expect(transmissaoValida(null)).toBe(false);
  });
});
