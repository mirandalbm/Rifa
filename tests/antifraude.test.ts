import { describe, it, expect } from "vitest";
import {
  DEFAULT_LIMITS,
  LIMIT_FIELDS,
  validateLimits,
  WINDOWS,
} from "../shared/antifraude";

describe("limites do antifraude", () => {
  it("o limite mais apertado é o de reserva em aberto, não o de compra", () => {
    // Bloqueio de estoque é o ataque barato: segurar cota sem pagar.
    expect(DEFAULT_LIMITS.openOrdersPerPhone).toBeLessThan(
      DEFAULT_LIMITS.ordersPerPhone,
    );
  });

  it("o limite por IP é folgado — operadora põe um bairro atrás de um IP", () => {
    expect(DEFAULT_LIMITS.ordersPerIp).toBeGreaterThan(
      DEFAULT_LIMITS.ordersPerPhone * 10,
    );
  });

  it("aceita ajuste dentro da faixa", () => {
    expect(validateLimits({ ordersPerPhone: 12 }).ordersPerPhone).toBe(12);
  });

  it("recusa valor abaixo do mínimo, dizendo qual campo", () => {
    expect(() => validateLimits({ openOrdersPerPhone: 0 })).toThrow(/Pedidos abertos/);
  });

  it("recusa valor acima do máximo", () => {
    expect(() => validateLimits({ ordersPerIp: 999_999 })).toThrow(/máximo/);
  });

  it("arredonda em vez de guardar fração", () => {
    expect(validateLimits({ ordersPerPhone: 7.6 }).ordersPerPhone).toBe(8);
  });

  it("ignora chave desconhecida e valor de tipo errado", () => {
    const l = validateLimits({
      inventado: 99,
      ordersPerPhone: "muitos",
    } as never);
    expect(Object.keys(l).sort()).toEqual(
      [...LIMIT_FIELDS.map((f) => f.key), "blockSelfReferral"].sort(),
    );
    expect(l.ordersPerPhone).toBe(DEFAULT_LIMITS.ordersPerPhone);
  });

  it("permite desligar o bloqueio de autoindicação conscientemente", () => {
    expect(validateLimits({ blockSelfReferral: false }).blockSelfReferral).toBe(false);
    expect(DEFAULT_LIMITS.blockSelfReferral).toBe(true);
  });

  it("todo campo da tela tem faixa declarada", () => {
    for (const campo of LIMIT_FIELDS) {
      expect(campo.min, campo.key).toBeGreaterThan(0);
      expect(campo.max, campo.key).toBeGreaterThan(campo.min!);
    }
  });

  it("as janelas são fixas e em minutos", () => {
    expect(WINDOWS.orders).toBe(10);
    expect(WINDOWS.login).toBe(15);
  });
});
