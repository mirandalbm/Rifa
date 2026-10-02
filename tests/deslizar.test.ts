import { describe, expect, it } from "vitest";
import {
  DISTANCIA_PARA_ABRIR,
  direcaoDoArrasto,
  resultadoDoGesto,
  toquePodeAbrir,
  type ElementoDoToque,
} from "../client/src/lib/deslizar";

type No = ElementoDoToque & { ox?: string; attrs?: Record<string, string> };
const no = (p: Partial<No> = {}, pai: No | null = null): No => ({
  tagName: "DIV",
  scrollLeft: 0,
  scrollWidth: 100,
  clientWidth: 100,
  parentElement: pai,
  getAttribute(n: string) {
    return this.attrs?.[n] ?? null;
  },
  ...p,
});
const ox = (e: ElementoDoToque) => (e as No).ox ?? "visible";

describe("gesto que abre o sorteio no Início", () => {
  it("só decide depois de alguns pixels, e de lado é sobretudo horizontal", () => {
    expect(direcaoDoArrasto(5, 3)).toBe("indefinido");
    expect(direcaoDoArrasto(40, 10)).toBe("lado");
    expect(direcaoDoArrasto(20, 30)).toBe("rolagem");
    expect(direcaoDoArrasto(-40, 15)).toBe("lado");
  });

  it("abre para a direita, fecha para a esquerda, e rolagem não é gesto", () => {
    expect(resultadoDoGesto(DISTANCIA_PARA_ABRIR, 0, false)).toBe("abrir");
    expect(resultadoDoGesto(DISTANCIA_PARA_ABRIR - 1, 0, false)).toBeNull();
    expect(resultadoDoGesto(-DISTANCIA_PARA_ABRIR, 0, false)).toBeNull();
    expect(resultadoDoGesto(-DISTANCIA_PARA_ABRIR, 0, true)).toBe("fechar");
    expect(resultadoDoGesto(DISTANCIA_PARA_ABRIR, 0, true)).toBeNull();
    expect(resultadoDoGesto(90, 80, false)).toBeNull();
  });

  it("carrossel na primeira peça deixa abrir; rolado, fica com o toque", () => {
    const carrossel = no({ ox: "auto", scrollWidth: 500, clientWidth: 100 });
    expect(toquePodeAbrir(no({}, carrossel), ox)).toBe(true);
    carrossel.scrollLeft = 100;
    expect(toquePodeAbrir(no({}, carrossel), ox)).toBe(false);
  });

  it("campo de digitar e janela aberta ficam fora", () => {
    expect(toquePodeAbrir(no({ tagName: "INPUT" }), ox)).toBe(false);
    expect(toquePodeAbrir(no({ tagName: "TEXTAREA" }), ox)).toBe(false);
    expect(
      toquePodeAbrir(no({}, no({ attrs: { "aria-modal": "true" } })), ox),
    ).toBe(false);
    expect(
      toquePodeAbrir(no({}, no({ attrs: { "data-sem-gesto": "" } })), ox),
    ).toBe(false);
    expect(toquePodeAbrir(no({ tagName: "BUTTON" }), ox)).toBe(true);
    expect(toquePodeAbrir(null, ox)).toBe(true);
  });
});
