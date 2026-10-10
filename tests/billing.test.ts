import { describe, it, expect } from "vitest";
import { lancamentoDaTaxa } from "../shared/billing";

describe("taxa da venda e o split do Pix", () => {
  const base = { organizationId: "org", orderId: "pedido", vendaCents: 450, pixCents: 50, modo: "percentual", vendaBp: 450 };

  it("sem split, a taxa nasce devida (aberta), com a venda e o Pix numa linha", () => {
    const v = lancamentoDaTaxa(base)!;
    expect(v).toMatchObject({ kind: "venda", amountCents: 500, vendaCents: 450, pixCents: 50, modo: "percentual", pct: 450 });
    expect(v).not.toHaveProperty("status");
    expect(v).not.toHaveProperty("paidAt");
  });

  it("por cota não guarda percentual", () => {
    expect(lancamentoDaTaxa({ ...base, modo: "por_cota", vendaBp: 0 })!.pct).toBeNull();
  });

  it("com o Pix dividido na origem, a taxa nasce retida — cobrar de novo seria cobrar duas vezes", () => {
    const agora = new Date("2026-10-01T12:00:00Z");
    expect(lancamentoDaTaxa({ ...base, retidaNoSplit: true }, agora)).toMatchObject({ status: "retida", paidAt: agora });
  });

  it("taxa zero não lança nada, com ou sem split", () => {
    expect(lancamentoDaTaxa({ ...base, vendaCents: 0, pixCents: 0, retidaNoSplit: true })).toBeNull();
  });

  it("valor quebrado ou negativo é defeito, não lançamento", () => {
    expect(() => lancamentoDaTaxa({ ...base, vendaCents: -1 })).toThrow();
    expect(() => lancamentoDaTaxa({ ...base, pixCents: 1.5 })).toThrow();
  });
});
