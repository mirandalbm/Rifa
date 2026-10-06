import { describe, expect, it } from "vitest";
import { RetencaoError, validarAbatimento, validarMotivoDaRetencao } from "@shared/retencao";

const disponivel = { patrocinioCents: 5000, presenteCents: 1200 };
const motivo = "cobrir a condenação do processo";

describe("retenção cautelar", () => {
  it("motivo é obrigatório e limpo", () => {
    expect(() => validarMotivoDaRetencao("curto")).toThrow(RetencaoError);
    expect(() => validarMotivoDaRetencao(undefined)).toThrow(RetencaoError);
    expect(validarMotivoDaRetencao("  Pix   por fora confirmado  ")).toBe("Pix por fora confirmado");
    expect(validarMotivoDaRetencao("x".repeat(2000))).toHaveLength(1000);
  });

  it("abate do patrocínio até o saldo, nunca mais", () => {
    expect(validarAbatimento({ patrocinioCents: 5000, motivo }, disponivel)).toEqual({ patrocinioCents: 5000, presente: false, motivo });
    const erro = (() => {
      try {
        validarAbatimento({ patrocinioCents: 5001, motivo }, disponivel);
      } catch (e) {
        return e as RetencaoError;
      }
    })();
    expect(erro?.status).toBe(409);
  });

  it("centavos inteiros e não negativos", () => {
    expect(() => validarAbatimento({ patrocinioCents: 10.5, motivo }, disponivel)).toThrow(/centavos/);
    expect(() => validarAbatimento({ patrocinioCents: -1, motivo }, disponivel)).toThrow(/centavos/);
    expect(() => validarAbatimento({ patrocinioCents: "abc", motivo }, disponivel)).toThrow(/centavos/);
  });

  it("o presente entra inteiro, e só se houver", () => {
    expect(validarAbatimento({ presente: true, motivo }, disponivel)).toEqual({ patrocinioCents: 0, presente: true, motivo });
    expect(() => validarAbatimento({ presente: true, motivo }, { patrocinioCents: 5000, presenteCents: 0 })).toThrow(/presente/);
    // Só `true` liga: "sim" vindo do corpo não abate nada.
    expect(() => validarAbatimento({ presente: "sim", motivo }, disponivel)).toThrow(/Escolha/);
  });

  it("abater nada é recusado", () => {
    expect(() => validarAbatimento({ patrocinioCents: 0, presente: false, motivo }, disponivel)).toThrow(/Escolha/);
  });
});
