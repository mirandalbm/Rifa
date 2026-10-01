import { describe, it, expect } from "vitest";
import {
  validateBillingPlan,
  platformPctFor,
  monthlyCentsFor,
  competenciaDe,
  competenciaAnterior,
  FREE_PLAN,
  MAX_PLATFORM_PCT,
  lancamentoDaTaxa,
} from "../shared/billing";
import { splitOrder } from "../shared/pricing";

describe("contrato de cobrança da plataforma", () => {
  it("o padrão é não cobrar — organização antiga não acorda devendo", () => {
    expect(FREE_PLAN.mode).toBe("gratis");
    expect(validateBillingPlan({}).mode).toBe("gratis");
    expect(platformPctFor(FREE_PLAN)).toBe(0);
    expect(monthlyCentsFor(FREE_PLAN)).toBe(0);
  });

  it("mensalidade não cobra nada por venda", () => {
    // É isto que impede a cobrança dupla: quem paga por mês tem taxa zero no
    // rateio, e o afiliado recebe sobre o valor cheio.
    const plano = validateBillingPlan({ mode: "mensalidade", monthlyCents: 29_900 });

    expect(platformPctFor(plano)).toBe(0);
    expect(monthlyCentsFor(plano)).toBe(29_900);

    const r = splitOrder({
      paidCents: 10_000,
      platformPct: platformPctFor(plano),
      commissionPct: 10,
    });
    expect(r.platformFeeCents).toBe(0);
    expect(r.commissionCents).toBe(1_000);
  });

  it("comissão não cobra nada por mês", () => {
    const plano = validateBillingPlan({ mode: "comissao", platformFeePct: 5 });
    expect(monthlyCentsFor(plano)).toBe(0);
    expect(platformPctFor(plano)).toBe(5);
  });

  it("trocar de modo zera o campo do outro", () => {
    // Percentual guardado num plano de mensalidade é bomba de relógio: basta
    // alguém trocar o modo de volta para cobrar num número esquecido.
    const mensal = validateBillingPlan({
      mode: "mensalidade",
      monthlyCents: 19_900,
      platformFeePct: 8,
    });
    expect(mensal.platformFeePct).toBe(0);

    const comissao = validateBillingPlan({
      mode: "comissao",
      platformFeePct: 8,
      monthlyCents: 19_900,
    });
    expect(comissao.monthlyCents).toBe(0);

    const gratis = validateBillingPlan({
      mode: "gratis",
      platformFeePct: 8,
      monthlyCents: 19_900,
    });
    expect(gratis.platformFeePct).toBe(0);
    expect(gratis.monthlyCents).toBe(0);
  });

  it("modo escolhido sem o valor dele é recusado", () => {
    expect(() => validateBillingPlan({ mode: "comissao" })).toThrow();
    expect(() => validateBillingPlan({ mode: "comissao", platformFeePct: 0 })).toThrow();
    expect(() => validateBillingPlan({ mode: "mensalidade" })).toThrow();
    expect(() => validateBillingPlan({ mode: "mensalidade", monthlyCents: 0 })).toThrow();
  });

  it("percentual e mensalidade têm teto", () => {
    expect(() =>
      validateBillingPlan({ mode: "comissao", platformFeePct: MAX_PLATFORM_PCT + 1 }),
    ).toThrow();
    expect(() =>
      validateBillingPlan({ mode: "mensalidade", monthlyCents: 9_999_999_9 }),
    ).toThrow();
  });

  it("modo inventado não passa", () => {
    expect(() => validateBillingPlan({ mode: "pix_na_mao" as never })).toThrow();
  });

  it("a competência vira a chave que evita cobrar o mesmo mês duas vezes", () => {
    expect(competenciaDe(new Date(2026, 8, 14))).toBe("2026-09");
    expect(competenciaDe(new Date(2026, 0, 1))).toBe("2026-01");
    expect(competenciaAnterior(new Date(2026, 0, 3))).toBe("2025-12");
    expect(competenciaAnterior(new Date(2026, 8, 1))).toBe("2026-08");
  });
});

describe("taxa da venda e o split do Pix", () => {
  const base = { organizationId: "org", orderId: "pedido", amountCents: 500, pct: 10 };

  it("sem split, a taxa nasce devida (aberta)", () => {
    const v = lancamentoDaTaxa(base)!;
    expect(v).toMatchObject({ kind: "venda", amountCents: 500, pct: 10 });
    expect(v).not.toHaveProperty("status");
    expect(v).not.toHaveProperty("paidAt");
  });

  it("com o Pix dividido na origem, a taxa nasce retida — cobrar de novo seria cobrar duas vezes", () => {
    const agora = new Date("2026-10-01T12:00:00Z");
    expect(lancamentoDaTaxa({ ...base, retidaNoSplit: true }, agora)).toMatchObject({ status: "retida", paidAt: agora });
  });

  it("taxa zero não lança nada, com ou sem split", () => {
    expect(lancamentoDaTaxa({ ...base, amountCents: 0, retidaNoSplit: true })).toBeNull();
  });
});
