import { describe, it, expect } from "vitest";
import {
  DEFAULT_PAYMENT_METHODS,
  validatePaymentMethods,
  enabledPhysical,
  paymentSummary,
  isEnabled,
  labelFor,
} from "../shared/payments";

describe("meios de pagamento", () => {
  it("vem tudo ligado por padrão", () => {
    expect(Object.values(DEFAULT_PAYMENT_METHODS).every(Boolean)).toBe(true);
  });

  it("aceita desligar parte deles", () => {
    const s = validatePaymentMethods({ cartao_maquininha: false });
    expect(s.cartao_maquininha).toBe(false);
    expect(s.pix_online).toBe(true);
  });

  it("recusa desligar todos: a rifa ficaria sem como vender", () => {
    expect(() =>
      validatePaymentMethods({
        pix_online: false,
        dinheiro: false,
        cartao_maquininha: false,
        pix_maquininha: false,
      }),
    ).toThrow(/ao menos um/i);
  });

  it("permite rifa só física, sem Pix online", () => {
    const s = validatePaymentMethods({ pix_online: false });
    const resumo = paymentSummary(s);
    expect(resumo.online).toBe(false);
    expect(resumo.somenteFisico).toBe(true);
    expect(resumo.fisico).toEqual(["dinheiro", "cartao_maquininha", "pix_maquininha"]);
  });

  it("permite rifa só online, sem venda física", () => {
    const s = validatePaymentMethods({
      dinheiro: false,
      cartao_maquininha: false,
      pix_maquininha: false,
    });
    expect(enabledPhysical(s)).toEqual([]);
    expect(paymentSummary(s).online).toBe(true);
    expect(paymentSummary(s).somenteFisico).toBe(false);
  });

  it("ignora chave desconhecida em vez de aceitar lixo", () => {
    const s = validatePaymentMethods({ inventado: true } as never);
    expect(Object.keys(s).sort()).toEqual(
      ["cartao_maquininha", "dinheiro", "pix_maquininha", "pix_online"],
    );
  });

  it("responde se um meio está ligado e como se chama", () => {
    expect(isEnabled(DEFAULT_PAYMENT_METHODS, "dinheiro")).toBe(true);
    expect(labelFor("pix_online")).toBe("Pix na loja online");
  });
});
