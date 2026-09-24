import { describe, it, expect } from "vitest";
import {
  base32Encode,
  base32Decode,
  generateSecret,
  totpCode,
  verifyTotp,
  otpauthUrl,
} from "../server/services/totp";

describe("base32", () => {
  it("vai e volta sem perder byte", () => {
    const buf = Buffer.from("12345678901234567890");
    expect(base32Decode(base32Encode(buf))).toEqual(buf);
  });

  it("recusa segredo com caractere inválido", () => {
    expect(() => base32Decode("ABC!")).toThrow();
  });
});

describe("código TOTP", () => {
  // Vetor do RFC 6238: segredo ASCII "12345678901234567890".
  const rfcSecret = base32Encode(Buffer.from("12345678901234567890"));

  it("bate com o vetor de teste do RFC 6238", () => {
    expect(totpCode(rfcSecret, 59_000)).toBe("287082");
    expect(totpCode(rfcSecret, 1_111_111_109_000)).toBe("081804");
    expect(totpCode(rfcSecret, 1_234_567_890_000)).toBe("005924");
  });

  it("muda a cada 30 segundos", () => {
    // Âncora no início de um passo: 1700000010 é múltiplo de 30.
    const t = 1_700_000_010_000;
    expect(totpCode(rfcSecret, t)).toBe(totpCode(rfcSecret, t + 29_000));
    expect(totpCode(rfcSecret, t)).not.toBe(totpCode(rfcSecret, t + 30_000));
  });
});

describe("verificação", () => {
  const secret = generateSecret();
  const now = 1_700_000_000_000;

  it("aceita o código do momento", () => {
    expect(verifyTotp(secret, totpCode(secret, now), { atMs: now })).toBe(true);
  });

  it("tolera relógio adiantado ou atrasado em uma janela", () => {
    expect(verifyTotp(secret, totpCode(secret, now - 30_000), { atMs: now })).toBe(true);
    expect(verifyTotp(secret, totpCode(secret, now + 30_000), { atMs: now })).toBe(true);
  });

  it("recusa código de dois minutos atrás", () => {
    expect(verifyTotp(secret, totpCode(secret, now - 120_000), { atMs: now })).toBe(false);
  });

  it("recusa código errado e código truncado", () => {
    expect(verifyTotp(secret, "000000", { atMs: now, window: 0 })).toBe(
      totpCode(secret, now) === "000000",
    );
    expect(verifyTotp(secret, "123", { atMs: now })).toBe(false);
    expect(verifyTotp(secret, "", { atMs: now })).toBe(false);
  });

  it("recusa o código de OUTRO segredo", () => {
    const outro = generateSecret();
    expect(verifyTotp(secret, totpCode(outro, now), { atMs: now })).toBe(false);
  });
});

describe("url do autenticador", () => {
  it("carrega emissor, conta e parâmetros", () => {
    const url = otpauthUrl({ secret: "ABC234", account: "admin@rifa.br" });
    expect(url).toContain("otpauth://totp/rifa.br%3Aadmin%40rifa.br");
    expect(url).toContain("secret=ABC234");
    expect(url).toContain("period=30");
  });
});
