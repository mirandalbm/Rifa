import { describe, expect, it } from "vitest";
import { RetencaoError, validarAbatimento, validarMotivoDaRetencao } from "@shared/retencao";

const disponivel = { patrocinioCents: 5000, presenteCents: 1200 };
const motivo = "cobrir a condenação do processo";
const base = { motivo, fundamento: "judicial", referencia: "0001234-56.2026.8.26.0100" };
const saida = { motivo, fundamento: "judicial", referencia: "0001234-56.2026.8.26.0100" };

describe("retenção cautelar", () => {
  it("motivo é obrigatório e limpo", () => {
    expect(() => validarMotivoDaRetencao("curto")).toThrow(RetencaoError);
    expect(() => validarMotivoDaRetencao(undefined)).toThrow(RetencaoError);
    expect(validarMotivoDaRetencao("  Pix   por fora confirmado  ")).toBe("Pix por fora confirmado");
    expect(validarMotivoDaRetencao("x".repeat(2000))).toHaveLength(1000);
  });

  it("abate do patrocínio até o saldo, nunca mais", () => {
    expect(validarAbatimento({ patrocinioCents: 5000, ...base }, disponivel)).toEqual({ patrocinioCents: 5000, presente: false, ...saida });
    const erro = (() => {
      try {
        validarAbatimento({ patrocinioCents: 5001, ...base }, disponivel);
      } catch (e) {
        return e as RetencaoError;
      }
    })();
    expect(erro?.status).toBe(409);
  });

  it("centavos inteiros e não negativos", () => {
    expect(() => validarAbatimento({ patrocinioCents: 10.5, ...base }, disponivel)).toThrow(/centavos/);
    expect(() => validarAbatimento({ patrocinioCents: -1, ...base }, disponivel)).toThrow(/centavos/);
    expect(() => validarAbatimento({ patrocinioCents: "abc", ...base }, disponivel)).toThrow(/centavos/);
  });

  it("o presente entra inteiro, e só se houver", () => {
    expect(validarAbatimento({ presente: true, ...base }, disponivel)).toEqual({ patrocinioCents: 0, presente: true, ...saida });
    expect(() => validarAbatimento({ presente: true, ...base }, { patrocinioCents: 5000, presenteCents: 0 })).toThrow(/presente/);
    // Só `true` liga: "sim" vindo do corpo não abate nada.
    expect(() => validarAbatimento({ presente: "sim", ...base }, disponivel)).toThrow(/Escolha/);
  });

  it("abater exige fundamento (decisão judicial ou acordo) e a referência — resposta 1.5", () => {
    expect(() => validarAbatimento({ patrocinioCents: 100, motivo }, disponivel)).toThrow(/fundamento/);
    expect(() => validarAbatimento({ patrocinioCents: 100, motivo, fundamento: "vontade", referencia: "x123" }, disponivel)).toThrow(/fundamento/);
    expect(() => validarAbatimento({ patrocinioCents: 100, motivo, fundamento: "acordo", referencia: "" }, disponivel)).toThrow(/processo/);
    expect(validarAbatimento({ patrocinioCents: 100, motivo, fundamento: "acordo", referencia: " Acordo  de 08/10 " }, disponivel).referencia).toBe("Acordo de 08/10");
  });

  it("abater nada é recusado", () => {
    expect(() => validarAbatimento({ patrocinioCents: 0, presente: false, ...base }, disponivel)).toThrow(/Escolha/);
  });
});
