import { describe, expect, it } from "vitest";
import { bloqueioDoContrato, CONTRATO_MAX, CONTRATO_MIN, validarContrato, versaoLida } from "@shared/contratoPromotora";

describe("contrato da promotora", () => {
  it("guarda só o texto, sem espaço nas pontas e com quebra de linha única", () => {
    const corpo = "a".repeat(CONTRATO_MIN - 1);
    expect(validarContrato({ texto: `  ${corpo}\r\nb  `, outro: "x" })).toEqual({ texto: `${corpo}\nb` });
  });

  it("recusa texto curto, longo ou que não é texto", () => {
    expect(() => validarContrato({ texto: "curto" })).toThrow(/pelo menos/);
    expect(() => validarContrato({ texto: "a".repeat(CONTRATO_MAX + 1) })).toThrow(/passa de/);
    expect(() => validarContrato({ texto: 12 })).toThrow(/Cole o texto/);
    expect(() => validarContrato(null)).toThrow(/Cole o texto/);
  });

  it("a versão lida é inteiro positivo", () => {
    expect(versaoLida("3")).toBe(3);
    for (const v of [0, -1, 1.5, "abc", undefined, null]) expect(() => versaoLida(v)).toThrow(/versão/);
  });

  it("o bloqueio diz a versão e onde aceitar", () => {
    expect(bloqueioDoContrato(2)).toMatch(/versão 2.*Configurações/);
  });
});
