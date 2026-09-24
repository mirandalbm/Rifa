import { describe, it, expect } from "vitest";
import { formatQuota, quotaDigits, normalizePhone, hidePhone, percent } from "../shared/format";

describe("número da cota", () => {
  it("usa o comprimento do total da campanha", () => {
    expect(quotaDigits(1_000_000)).toBe(7);
    expect(formatQuota(1, 1_000_000)).toBe("0000001");
    expect(formatQuota(847_219, 1_000_000)).toBe("0847219");
    expect(formatQuota(1, 10_000)).toBe("00001");
    expect(formatQuota(42, 100)).toBe("042");
  });
});

describe("telefone", () => {
  it("normaliza qualquer formatação", () => {
    expect(normalizePhone("(11) 98888-7777")).toBe("11988887777");
  });

  it("esconde o miolo em tela pública", () => {
    expect(hidePhone("11988887777")).toBe("(11) ••••-7777");
  });
});

describe("progresso", () => {
  it("não passa de 100%", () => {
    expect(percent(1500, 1000)).toBe(100);
    expect(percent(0, 0)).toBe(0);
    expect(percent(683, 1000)).toBe(68);
  });
});
