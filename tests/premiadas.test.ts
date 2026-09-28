import { describe, expect, it } from "vitest";
import { PREMIADAS_MAX, numerosPremiados } from "@shared/premiadas";

describe("numerosPremiados", () => {
  it("lê a lista digitada com vírgula, espaço ou ponto e vírgula", () => {
    expect(numerosPremiados("12, 345;1000  7", 1000)).toEqual({ numeros: [12, 345, 1000, 7] });
    expect(numerosPremiados([5, 6], 10)).toEqual({ numeros: [5, 6] });
  });
  it("recusa fora da faixa, repetido, vazio e lista grande demais", () => {
    expect("problema" in numerosPremiados("0", 10)).toBe(true);
    expect("problema" in numerosPremiados("11", 10)).toBe(true);
    expect("problema" in numerosPremiados("3, 3", 10)).toBe(true);
    expect("problema" in numerosPremiados("", 10)).toBe(true);
    expect("problema" in numerosPremiados(Array.from({ length: PREMIADAS_MAX + 1 }, (_, i) => i + 1), 10_000)).toBe(true);
  });
});
