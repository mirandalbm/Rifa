import { describe, expect, it } from "vitest";
import { ENQUETE_OPCOES_MAX, opcaoValida, percentuais, validarEnquete } from "../shared/enqueteStory";

describe("enquete do story", () => {
  it("sem enquete é null; com ela, texto limpo", () => {
    expect(validarEnquete(undefined)).toBeNull();
    expect(validarEnquete(null)).toBeNull();
    expect(validarEnquete({ pergunta: "  Qual   prêmio? ", opcoes: [" Moto ", "Carro"] })).toEqual({ pergunta: "Qual prêmio?", opcoes: ["Moto", "Carro"] });
  });

  it("recusa formato errado, poucas ou muitas opções, opção vazia ou repetida", () => {
    expect(() => validarEnquete("x")).toThrow();
    expect(() => validarEnquete({ pergunta: "Qual?", opcoes: ["Só uma"] })).toThrow(/de 2 a 4/);
    expect(() => validarEnquete({ pergunta: "Qual?", opcoes: Array.from({ length: ENQUETE_OPCOES_MAX + 1 }, (_, i) => `O${i}`) })).toThrow(/de 2 a 4/);
    expect(() => validarEnquete({ pergunta: "Qual?", opcoes: ["Moto", "  "] })).toThrow(/texto/);
    expect(() => validarEnquete({ pergunta: "Qual?", opcoes: ["Moto", "moto"] })).toThrow(/diferentes/);
    expect(() => validarEnquete({ pergunta: "Q", opcoes: ["A", "B"] })).toThrow(/pergunta/);
  });

  it("sem link e sem telefone, na pergunta e nas opções", () => {
    expect(() => validarEnquete({ pergunta: "Veja em golpe.com", opcoes: ["A", "B"] })).toThrow(/pergunta/i);
    expect(() => validarEnquete({ pergunta: "Qual?", opcoes: ["Chama 11 98888-7777", "B"] })).toThrow(/opção/i);
  });

  it("a opção só vale se existir na enquete", () => {
    expect(opcaoValida(0, 2)).toBe(0);
    expect(opcaoValida(1, 2)).toBe(1);
    expect(opcaoValida(2, 2)).toBeNull();
    expect(opcaoValida(-1, 2)).toBeNull();
    expect(opcaoValida(1.5, 2)).toBeNull();
    expect(opcaoValida("1", 2)).toBeNull();
  });

  it("os percentuais somam exatamente 100 (maior resto) e começam em zero", () => {
    expect(percentuais([0, 0])).toEqual([0, 0]);
    expect(percentuais([1, 1, 1])).toEqual([34, 33, 33]);
    expect(percentuais([2, 1])).toEqual([67, 33]);
    expect(percentuais([0, 5])).toEqual([0, 100]);
    for (const v of [[1, 2, 3, 4], [7, 0, 2], [13, 17, 19, 23]]) {
      expect(percentuais(v).reduce((a, b) => a + b, 0)).toBe(100);
    }
  });
});
