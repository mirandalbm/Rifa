import { describe, expect, it } from "vitest";
import {
  CONFIG_PRESENTE_PADRAO,
  creditoDoPresente,
  descontoDoPresente,
  textoDoPresente,
  validarConfigPresente,
} from "@shared/presente";
import { splitOrder } from "@shared/pricing";

describe("validarConfigPresente", () => {
  it("nasce desligado", () => {
    expect(CONFIG_PRESENTE_PADRAO.ligado).toBe(false);
    expect(validarConfigPresente(undefined).ligado).toBe(false);
  });
  it("só as chaves conhecidas, nos limites", () => {
    expect(validarConfigPresente({ ligado: true, pct: 15, tetoCents: 2000, script: "x" })).toEqual({ ligado: true, pct: 15, tetoCents: 2000 });
    expect(() => validarConfigPresente({ pct: 0 })).toThrow();
    expect(() => validarConfigPresente({ pct: 51 })).toThrow();
    expect(() => validarConfigPresente({ pct: 10.5 })).toThrow();
    expect(() => validarConfigPresente({ tetoCents: 50 })).toThrow();
    expect(() => validarConfigPresente({ tetoCents: 10_001 })).toThrow();
    expect(validarConfigPresente({ ligado: "sim" }).ligado).toBe(false);
  });
});

describe("descontoDoPresente", () => {
  it("percentual para baixo, até o teto", () => {
    expect(descontoDoPresente(5000, { pct: 10, tetoCents: 700 })).toBe(500);
    expect(descontoDoPresente(10_000, { pct: 10, tetoCents: 700 })).toBe(700);
    expect(descontoDoPresente(999, { pct: 10, tetoCents: 700 })).toBe(99);
  });
  it("o comprador sempre paga alguma coisa", () => {
    for (let total = 0; total <= 400; total++) {
      const d = descontoDoPresente(total, { pct: 50, tetoCents: 10_000 });
      if (total > 0) expect(total - d).toBeGreaterThan(0);
      expect(d).toBeGreaterThanOrEqual(0);
    }
  });
});

describe("creditoDoPresente", () => {
  it("a parte da promotora no desconto: sem a taxa, com a comissão que ela paga", () => {
    expect(creditoDoPresente({ presenteCents: 500, platformPct: 5, commissionPct: 0, comissaoGuardada: false })).toBe(475);
    expect(creditoDoPresente({ presenteCents: 500, platformPct: 5, commissionPct: 10, comissaoGuardada: false })).toBe(475);
  });
  it("com a comissão guardada, a plataforma paga o afiliado e retém a parte dele", () => {
    const r = splitOrder({ paidCents: 500, platformPct: 5, commissionPct: 10 });
    expect(creditoDoPresente({ presenteCents: 500, platformPct: 5, commissionPct: 10, comissaoGuardada: true })).toBe(r.organizerCents);
  });
  it("comprador + crédito + o que a plataforma fica = preço cheio, rateado como se fosse uma venda só", () => {
    for (const [total, pct, taxa] of [
      [5000, 10, 5],
      [1999, 50, 0],
      [777, 33, 12],
    ]) {
      const d = descontoDoPresente(total, { pct, tetoCents: 10_000 });
      const credito = creditoDoPresente({ presenteCents: d, platformPct: taxa, commissionPct: 0, comissaoGuardada: false });
      // A plataforma paga o desconto inteiro; o que não vira crédito é a taxa dela sobre ele.
      expect(credito + Math.floor((d * taxa) / 100)).toBe(d);
    }
  });
  it("sem presente, sem crédito", () => {
    expect(creditoDoPresente({ presenteCents: 0, platformPct: 5, commissionPct: 10, comissaoGuardada: false })).toBe(0);
  });
});

describe("textoDoPresente", () => {
  it("diz o percentual, o teto e quem paga", () => {
    expect(textoDoPresente({ pct: 10, tetoCents: 1000 }).replace(/\s/g, " ")).toBe(
      "10% de desconto na primeira compra, até R$ 10,00, pago pela plataforma",
    );
  });
});
