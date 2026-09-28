import { describe, expect, it } from "vitest";
import { embaralharPagina } from "../client/src/lib/embaralhar";

describe("embaralharPagina", () => {
  it("traz exatamente os números da página, sem repetir nem faltar", () => {
    const r = embaralharPagina(101, 200, 42);
    expect(r).toHaveLength(100);
    expect([...r].sort((a, b) => a - b)).toEqual(Array.from({ length: 100 }, (_, i) => 101 + i));
  });

  it("a mesma semente dá a mesma ordem; outra página, outra ordem", () => {
    expect(embaralharPagina(1, 100, 7)).toEqual(embaralharPagina(1, 100, 7));
    expect(embaralharPagina(1, 100, 7)).not.toEqual(embaralharPagina(1, 100, 8));
    const a = embaralharPagina(1, 100, 7).map((n) => n % 100);
    const b = embaralharPagina(101, 200, 7).map((n) => n % 100);
    expect(a).not.toEqual(b);
  });

  it("embaralha de verdade e cabe na última página curta", () => {
    const r = embaralharPagina(1, 100, 3);
    expect(r).not.toEqual(Array.from({ length: 100 }, (_, i) => i + 1));
    expect(embaralharPagina(901, 937, 3)).toHaveLength(37);
  });
});
