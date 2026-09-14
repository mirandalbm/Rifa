import { describe, it, expect } from "vitest";
import {
  priceOrder,
  bestPackageFor,
  commissionCents,
  commissionAvailableAt,
} from "../shared/pricing";

const packages = [
  { quantity: 5, discountPct: 0 },
  { quantity: 10, discountPct: 5 },
  { quantity: 25, discountPct: 8 },
  { quantity: 50, discountPct: 12 },
];

describe("pacotes por quantidade", () => {
  it("aplica o maior pacote que a quantidade alcança", () => {
    expect(bestPackageFor(37, packages)?.quantity).toBe(25);
  });

  it("não aplica pacote abaixo do mínimo", () => {
    expect(bestPackageFor(3, packages)).toBeNull();
  });
});

describe("preço do pedido", () => {
  it("calcula sem desconto", () => {
    const p = priceOrder({ quantity: 3, unitCents: 490 });
    expect(p.subtotalCents).toBe(1470);
    expect(p.totalCents).toBe(1470);
  });

  it("aplica o pacote antes do cupom", () => {
    // 50 x R$4,90 = R$245,00 -> -12% = R$215,60 -> -10% = R$194,04
    const p = priceOrder({ quantity: 50, unitCents: 490, packages, couponPct: 10 });
    expect(p.subtotalCents).toBe(24_500);
    expect(p.packageDiscountCents).toBe(2_940);
    expect(p.couponDiscountCents).toBe(2_156);
    expect(p.totalCents).toBe(19_404);
  });

  it("nunca produz centavo fracionado", () => {
    for (let q = 1; q <= 120; q++) {
      const p = priceOrder({ quantity: q, unitCents: 333, packages, couponPct: 7 });
      expect(Number.isInteger(p.totalCents)).toBe(true);
      expect(p.totalCents).toBeGreaterThan(0);
      expect(p.totalCents).toBeLessThanOrEqual(p.subtotalCents);
    }
  });

  it("recusa quantidade inválida", () => {
    expect(() => priceOrder({ quantity: 0, unitCents: 490 })).toThrow();
    expect(() => priceOrder({ quantity: 1.5, unitCents: 490 })).toThrow();
  });
});

describe("comissão", () => {
  it("arredonda para baixo: a plataforma não deve mais do que recebeu", () => {
    expect(commissionCents(1323, 12)).toBe(158); // 158,76 -> 158
  });

  it("libera depois da carência", () => {
    const paid = new Date("2026-09-14T12:00:00Z");
    const at = commissionAvailableAt(paid, 7, null);
    expect(at.toISOString()).toBe("2026-09-21T12:00:00.000Z");
  });

  it("espera o sorteio quando ele é mais tarde que a carência", () => {
    const paid = new Date("2026-09-14T12:00:00Z");
    const draw = new Date("2026-10-05T12:00:00Z");
    expect(commissionAvailableAt(paid, 7, draw).toISOString()).toBe(draw.toISOString());
  });
});
