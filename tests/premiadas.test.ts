import { describe, expect, it } from "vitest";
import { PREMIADAS_MAX, numerosPremiados } from "@shared/premiadas";

describe("numerosPremiados", () => {
  it("lê a lista digitada com vírgula, espaço ou ponto e vírgula", () => {
    expect(numerosPremiados("12, 345;1000  7", 1000, false)).toEqual({ numeros: [12, 345, 1000, 7] });
    expect(numerosPremiados([5, 6], 10, false)).toEqual({ numeros: [5, 6] });
  });
  it("recusa fora da faixa, repetido, vazio e lista grande demais", () => {
    expect("problema" in numerosPremiados("0", 10, false)).toBe(true);
    expect("problema" in numerosPremiados("11", 10, false)).toBe(true);
    expect("problema" in numerosPremiados("3, 3", 10, false)).toBe(true);
    expect("problema" in numerosPremiados("", 10, false)).toBe(true);
    expect("problema" in numerosPremiados(Array.from({ length: PREMIADAS_MAX + 1 }, (_, i) => i + 1), 10_000, false)).toBe(true);
  });
  it("na numeração a partir de zero, lê o número da tela e guarda o interno", () => {
    // 000 a 999: o 000 digitado é a cota interna 1; o 999, a 1000.
    expect(numerosPremiados("000, 139 999", 1000, true)).toEqual({ numeros: [1, 140, 1000] });
    expect("problema" in numerosPremiados("1000", 1000, true)).toBe(true);
    expect("problema" in numerosPremiados("0, 000", 1000, true)).toBe(true);
  });
});
