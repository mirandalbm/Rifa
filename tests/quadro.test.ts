import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { colunasDoMapa, corDaCasa } from "../client/src/lib/quadro";
import { contraste } from "../shared/template";

const css = readFileSync(path.resolve(import.meta.dirname, "../client/src/index.css"), "utf8");
function variaveis(inicio: string): Record<string, string> {
  const i = css.indexOf(inicio);
  const trecho = css.slice(i, css.indexOf("}", i));
  return Object.fromEntries([...trecho.matchAll(/(--[\w-]+):\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()]));
}

describe("quadriculado dos números", () => {
  it("cor ao acaso, mas fixa por número, e as duas aparecem em proporção parecida", () => {
    let azuis = 0;
    for (let n = 1; n <= 10000; n++) {
      expect(corDaCasa(n)).toBe(corDaCasa(n));
      if (corDaCasa(n) === "quadro-azul") azuis++;
    }
    expect(azuis).toBeGreaterThan(4500);
    expect(azuis).toBeLessThan(5500);
  });

  it("sem padrão à vista: nem listra por coluna nem alternância simples", () => {
    const cores = Array.from({ length: 100 }, (_, i) => corDaCasa(i + 1));
    const alternado = cores.every((c, i) => i === 0 || c !== cores[i - 1]);
    expect(alternado).toBe(false);
    for (const colunas of [5, 10]) {
      for (let c = 0; c < colunas; c++) {
        const coluna = cores.filter((_, i) => i % colunas === c);
        expect(new Set(coluna).size).toBe(2);
      }
    }
  });

  it("10 colunas no tablet ou com número curto; 5 com número longo no celular", () => {
    expect(colunasDoMapa(3, false)).toBe(10);
    expect(colunasDoMapa(4, false)).toBe(5);
    expect(colunasDoMapa(7, false)).toBe(5);
    expect(colunasDoMapa(7, true)).toBe(10);
  });

  for (const [tema, inicio] of [
    ["claro", ":root {"],
    ["escuro", ':root[data-tema="escuro"]'],
  ] as const) {
    it(`no ${tema}, azul, verde e escolhido com contraste ≥ 3:1 em cada casa`, () => {
      const v = variaveis(inicio);
      expect(contraste(v["--quadro-azul"], v["--quadro-texto"])).toBeGreaterThanOrEqual(3);
      expect(contraste(v["--quadro-verde"], v["--quadro-texto"])).toBeGreaterThanOrEqual(3);
      expect(contraste(v["--quadro-escolhido"], v["--quadro-escolhido-texto"])).toBeGreaterThanOrEqual(3);
      // O escolhido se distingue das duas cores do quadriculado.
      expect(contraste(v["--quadro-escolhido"], v["--quadro-azul"])).toBeGreaterThanOrEqual(3);
      expect(contraste(v["--quadro-escolhido"], v["--quadro-verde"])).toBeGreaterThanOrEqual(3);
    });
  }
});
