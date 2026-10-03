import { describe, it, expect } from "vitest";
import { randomBytes } from "node:crypto";
import { createHmac } from "node:crypto";
import { conferirSorteio, entropiaDoSorteio, numeroDoSorteio, sha256Hex, transmissaoValida } from "../shared/sorteio";
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

  it("as outras loterias: o navegador e o servidor também chegam no mesmo número", async () => {
    const dezenas = (n: number, max: number) => {
      const s = new Set<number>();
      while (s.size < n) s.add(1 + (randomBytes(2).readUInt16BE(0) % max));
      return [...s].sort((a, b) => a - b).map((v) => String(v).padStart(2, "0"));
    };
    for (const [loteria, n, max] of [["mega_sena", 6, 60], ["quina", 5, 80], ["lotofacil", 15, 25]] as const) {
      for (let i = 0; i < 40; i++) {
        const { seed } = commitSeed();
        const federalPrizes = dezenas(n, max);
        const servidor = drawNumber({ seed, federalPrizes, totalQuotas: 10_000, loteria });
        expect(await numeroDoSorteio({ seed, federalPrizes, totalQuotas: 10_000, loteria })).toBe(servidor);
      }
    }
  });

  it("a Federal segue a conta de sempre (sorteio antigo continua conferindo)", () => {
    const seed = "a".repeat(64);
    const p = ["01234", "56789", "00001", "99999", "12345"];
    // A conta de antes, escrita à mão: HMAC(semente, "p1-p2-p3-p4-p5:0").
    const v = createHmac("sha256", seed).update(`${p.join("-")}:0`).digest().readBigUInt64BE(0);
    const limite = ((1n << 64n) / 1000n) * 1000n;
    if (v < limite) expect(drawNumber({ seed, federalPrizes: p, totalQuotas: 1000 })).toBe(Number((v % 1000n) + 1n));
    expect(entropiaDoSorteio(p)).toBe(entropiaDoSorteio(p, "federal"));
    expect(entropiaDoSorteio(p)).toBe("01234-56789-00001-99999-12345");
    expect(entropiaDoSorteio(["04", "11", "23", "35", "48", "59"], "mega_sena")).toBe("mega_sena:04-11-23-35-48-59");
    expect(() => entropiaDoSorteio(["01"], "mega_sena")).toThrow(/6 dezenas/);
    expect(() => entropiaDoSorteio(p.slice(0, 4))).toThrow(/5 prêmios/);
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
