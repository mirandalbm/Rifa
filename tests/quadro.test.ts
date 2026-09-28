import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { casaCheia, colunasDoMapa } from "../client/src/lib/quadro";
import { contraste } from "../shared/template";

const css = readFileSync(path.resolve(import.meta.dirname, "../client/src/index.css"), "utf8");
function variaveis(inicio: string): Record<string, string> {
  const i = css.indexOf(inicio);
  const trecho = css.slice(i, css.indexOf("}", i));
  return Object.fromEntries([...trecho.matchAll(/(--[\w-]+):\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()]));
}

describe("quadriculado dos números", () => {
  it("alterna como xadrez com 5 e com 10 colunas — vizinhos nunca têm a mesma cor", () => {
    for (const c of [5, 10]) {
      for (let i = 0; i < 100; i++) {
        if ((i + 1) % c !== 0) expect(casaCheia(i + 1, c)).not.toBe(casaCheia(i, c));
        if (i + c < 100) expect(casaCheia(i + c, c)).not.toBe(casaCheia(i, c));
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
    it(`no ${tema}, texto e borda com contraste ≥ 3:1 em cada casa`, () => {
      const v = variaveis(inicio);
      expect(contraste(v["--quadro-cheio"], v["--quadro-cheio-texto"])).toBeGreaterThanOrEqual(3);
      expect(contraste(v["--quadro-vazado"], v["--quadro-vazado-texto"])).toBeGreaterThanOrEqual(3);
      expect(contraste(v["--quadro-vazado"], v["--quadro-vazado-borda"])).toBeGreaterThanOrEqual(3);
      expect(contraste(v["--quadro-escolhido"], v["--quadro-escolhido-texto"])).toBeGreaterThanOrEqual(3);
      // O escolhido se distingue das duas cores do quadriculado.
      expect(v["--quadro-escolhido"]).not.toBe(v["--quadro-cheio"]);
      expect(v["--quadro-escolhido"]).not.toBe(v["--quadro-vazado"]);
    });
  }
});
