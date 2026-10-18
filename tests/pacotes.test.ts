import { describe, expect, it } from "vitest";
import { priceOrder } from "@shared/pricing";
import { DESCONTO_DO_PACOTE_MAX_PCT, PACOTES_MAX, validarPacotes } from "@shared/pacotes";

describe("pacotes de cotas da rifa", () => {
  it("aceita a lista de sempre e guarda só as chaves conhecidas", () => {
    const r = validarPacotes(
      [
        { quantity: 5, discountPct: 0, highlight: false, organizationId: "outra" },
        { quantity: 10, discountPct: 5, highlight: true },
        { quantity: 25, discountPct: 8 },
      ],
      1000,
    );
    expect(r).toEqual({
      pacotes: [
        { quantity: 5, discountPct: 0, highlight: false },
        { quantity: 10, discountPct: 5, highlight: true },
        { quantity: 25, discountPct: 8, highlight: false },
      ],
    });
  });

  it("sem lista (ou lista vazia) apaga os pacotes", () => {
    expect(validarPacotes(undefined, 1000)).toEqual({ pacotes: [] });
    expect(validarPacotes(null, 1000)).toEqual({ pacotes: [] });
    expect(validarPacotes([], 1000)).toEqual({ pacotes: [] });
  });

  it("o desconto vai de 0 a 50: acima disso o pedido ficaria de graça ou negativo", () => {
    expect(validarPacotes([{ quantity: 5, discountPct: DESCONTO_DO_PACOTE_MAX_PCT }], 1000)).toHaveProperty("pacotes");
    for (const discountPct of [51, 100, 150, -1, 12.5, "10", null, NaN]) {
      expect(validarPacotes([{ quantity: 5, discountPct }], 1000), String(discountPct)).toHaveProperty("problema");
    }
    // O que o teto evita: o pedido de 5 cotas a 9,90 com 150% de desconto saía de -R$ 24,75.
    const caro = priceOrder({ quantity: 5, unitCents: 990, packages: [{ quantity: 5, discountPct: 150 }] });
    expect(caro.totalCents).toBeLessThan(0);
    const limite = priceOrder({
      quantity: 5,
      unitCents: 990,
      packages: [{ quantity: 5, discountPct: DESCONTO_DO_PACOTE_MAX_PCT }],
      couponPct: 50,
    });
    expect(limite.totalCents).toBeGreaterThan(0);
  });

  it("a quantidade é inteira, de 1 ao total da rifa, e não se repete", () => {
    for (const quantity of [0, -5, 1.5, "5", null, 1001]) {
      expect(validarPacotes([{ quantity, discountPct: 5 }], 1000), String(quantity)).toHaveProperty("problema");
    }
    expect(validarPacotes([{ quantity: 1000, discountPct: 5 }], 1000)).toHaveProperty("pacotes");
    expect(validarPacotes([{ quantity: 5, discountPct: 1 }, { quantity: 5, discountPct: 2 }], 1000)).toHaveProperty("problema");
  });

  it("lista que não é lista, item que não é objeto e excesso de pacotes são recusados", () => {
    expect(validarPacotes("nope", 1000)).toHaveProperty("problema");
    expect(validarPacotes({ quantity: 5 }, 1000)).toHaveProperty("problema");
    expect(validarPacotes([null], 1000)).toHaveProperty("problema");
    expect(validarPacotes([[5, 5]], 1000)).toHaveProperty("problema");
    expect(validarPacotes([{ quantity: 5, discountPct: 5, highlight: "sim" }], 1000)).toHaveProperty("problema");
    const demais = Array.from({ length: PACOTES_MAX + 1 }, (_, i) => ({ quantity: i + 1, discountPct: 1 }));
    expect(validarPacotes(demais, 1000)).toHaveProperty("problema");
    expect(validarPacotes(demais.slice(0, PACOTES_MAX), 1000)).toHaveProperty("pacotes");
  });
});
