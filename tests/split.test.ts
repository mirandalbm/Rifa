import { describe, it, expect } from "vitest";
import { splitOrder, priceOrder } from "../shared/pricing";

describe("rateio da venda", () => {
  it("a plataforma sai antes: a comissão incide sobre o que sobrou", () => {
    // R$ 100,00, plataforma 5%, afiliado 10%.
    const r = splitOrder({ paidCents: 10_000, platformPct: 5, commissionPct: 10 });

    expect(r.platformFeeCents).toBe(500);
    // 10% de 9.500, não de 10.000 — esta é a diferença entre sair antes e
    // sair depois, e são 50 centavos por cem reais.
    expect(r.netAfterPlatformCents).toBe(9_500);
    expect(r.commissionCents).toBe(950);
    expect(r.organizerCents).toBe(8_550);
  });

  it("sair depois daria outro número — é o erro que a ordem evita", () => {
    const certo = splitOrder({ paidCents: 10_000, platformPct: 5, commissionPct: 10 });
    const seFosseSobreOBruto = Math.floor((10_000 * 10) / 100);

    expect(seFosseSobreOBruto).toBe(1_000);
    expect(certo.commissionCents).toBe(950);
    expect(seFosseSobreOBruto).toBeGreaterThan(certo.commissionCents);
  });

  it("a soma é EXATA, nunca aproximada", () => {
    // A garantia que importa: o sistema não distribui dinheiro que não
    // existe, e não some com centavo de ninguém.
    for (let pago = 0; pago <= 2_000; pago++) {
      for (const [plat, com] of [[0, 0], [5, 10], [3, 12], [7, 15], [1, 1], [33, 33]]) {
        const r = splitOrder({ paidCents: pago, platformPct: plat, commissionPct: com });
        expect(r.platformFeeCents + r.commissionCents + r.organizerCents).toBe(pago);
      }
    }
  });

  it("nenhuma fatia fica negativa", () => {
    for (const pago of [0, 1, 7, 99, 100, 12_345]) {
      for (const [plat, com] of [[0, 100], [100, 0], [100, 100], [50, 50]]) {
        const r = splitOrder({ paidCents: pago, platformPct: plat, commissionPct: com });
        expect(r.platformFeeCents).toBeGreaterThanOrEqual(0);
        expect(r.commissionCents).toBeGreaterThanOrEqual(0);
        expect(r.organizerCents).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it("o centavo do arredondamento fica com o promotor, nunca com a plataforma", () => {
    // R$ 0,33 a 10%: 3,3 centavos. A plataforma leva 3, não 4.
    const r = splitOrder({ paidCents: 33, platformPct: 10, commissionPct: 10 });
    expect(r.platformFeeCents).toBe(3);
    expect(r.commissionCents).toBe(3); // 10% de 30
    expect(r.organizerCents).toBe(27);
  });

  it("plataforma em 100% não deixa nada para trás nem inventa dívida", () => {
    const r = splitOrder({ paidCents: 10_000, platformPct: 100, commissionPct: 50 });
    expect(r.platformFeeCents).toBe(10_000);
    expect(r.netAfterPlatformCents).toBe(0);
    expect(r.commissionCents).toBe(0);
    expect(r.organizerCents).toBe(0);
  });

  it("sem taxa, o rateio é o de antes — a mudança não mexe em quem não usa", () => {
    const r = splitOrder({ paidCents: 39_204, platformPct: 0, commissionPct: 12 });
    expect(r.platformFeeCents).toBe(0);
    expect(r.commissionCents).toBe(4_704); // o mesmo R$ 47,04 de sempre
    expect(r.organizerCents).toBe(34_500);
  });

  it("percentual fora da faixa é recusado", () => {
    expect(() => splitOrder({ paidCents: 100, platformPct: -1, commissionPct: 10 })).toThrow();
    expect(() => splitOrder({ paidCents: 100, platformPct: 101, commissionPct: 10 })).toThrow();
    expect(() => splitOrder({ paidCents: 100, platformPct: 5, commissionPct: 101 })).toThrow();
    expect(() => splitOrder({ paidCents: -1, platformPct: 5, commissionPct: 10 })).toThrow();
    expect(() => splitOrder({ paidCents: 1.5, platformPct: 5, commissionPct: 10 })).toThrow();
  });

  it("a base do rateio é o pago, não o de tabela", () => {
    // Pacote e cupom já reduziram o preço: a plataforma cobra sobre o que
    // entrou na conta, não sobre o que a rifa pedia.
    const preco = priceOrder({
      quantity: 50,
      unitCents: 990,
      packages: [{ quantity: 50, discountPct: 12 }],
      couponPct: 10,
    });
    const r = splitOrder({
      paidCents: preco.totalCents,
      platformPct: 5,
      commissionPct: 12,
    });

    expect(preco.subtotalCents).toBe(49_500);
    expect(r.paidCents).toBe(39_204);
    expect(r.platformFeeCents).toBe(1_960);
    expect(r.platformFeeCents + r.commissionCents + r.organizerCents).toBe(39_204);
  });
});
