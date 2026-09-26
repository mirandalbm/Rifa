import { describe, expect, it } from "vitest";
import {
  PATROCINADAS_NO_AR,
  custoPorVenda,
  ehRobo,
  escolherPatrocinadas,
  precoDoCliqueValido,
  problemaNaRecarga,
} from "@shared/patrocinio";

describe("robô não conta", () => {
  it("reconhece buscador, pré-visualização e automação", () => {
    for (const ua of ["Googlebot/2.1", "facebookexternalhit/1.1", "WhatsApp/2.23", "curl/8.0", "HeadlessChrome/120", "python-requests/2.31", "", null]) {
      expect(ehRobo(ua)).toBe(true);
    }
  });
  it("deixa passar navegador de gente", () => {
    expect(ehRobo("Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/124 Mobile Safari/537.36")).toBe(false);
  });
});

describe("preço e recarga", () => {
  it("preço do clique dentro dos limites", () => {
    expect(precoDoCliqueValido(undefined)).toBe(50);
    expect(precoDoCliqueValido(120)).toBe(120);
    expect(() => precoDoCliqueValido(1)).toThrow(/preço/);
    expect(() => precoDoCliqueValido(1.5)).toThrow();
  });
  it("recarga respeita o mínimo", () => {
    expect(problemaNaRecarga(1000, 2000)).toMatch(/mínima/);
    expect(problemaNaRecarga(2000, 2000)).toBeNull();
    expect(problemaNaRecarga(2_000_000, 2000)).toMatch(/máxima/);
  });
});

describe("escolherPatrocinadas", () => {
  const cands = Array.from({ length: 8 }, (_, i) => ({ id: i, saldoCents: i === 0 ? 10 : 1000 }));
  it("só quem paga um clique, no máximo cinco", () => {
    const e = escolherPatrocinadas(cands, 50, () => 0);
    expect(e.length).toBe(PATROCINADAS_NO_AR);
    expect(e.some((c) => c.id === 0)).toBe(false);
  });
  it("sorteia a ordem", () => {
    const a = escolherPatrocinadas(cands, 50, () => 0).map((c) => c.id);
    const b = escolherPatrocinadas(cands, 50, (n) => n - 1).map((c) => c.id);
    expect(a).not.toEqual(b);
  });
  it("não mexe na lista de entrada", () => {
    const copia = cands.map((c) => c.id);
    escolherPatrocinadas(cands, 50, () => 0);
    expect(cands.map((c) => c.id)).toEqual(copia);
  });
});

describe("custoPorVenda", () => {
  it("para baixo, e nulo sem venda", () => {
    expect(custoPorVenda(1000, 3)).toBe(333);
    expect(custoPorVenda(1000, 0)).toBeNull();
  });
});
