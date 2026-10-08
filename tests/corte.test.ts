import { describe, expect, it } from "vitest";
import { CORTE_MINIMO_S, argsDoCorte, trechoDoCorte } from "../shared/corte";

describe("trechoDoCorte", () => {
  it("aceita o trecho dentro do vídeo, em décimos", () => {
    expect(trechoDoCorte(1.04, 3.96, 10)).toEqual({ inicio: 1, fim: 4 });
    expect(trechoDoCorte("2", "8.5", 10)).toEqual({ inicio: 2, fim: 8.5 });
    expect(trechoDoCorte(0, 5, 10)).toEqual({ inicio: 0, fim: 5 });
    expect(trechoDoCorte(3, 10, 10)).toEqual({ inicio: 3, fim: 10 });
  });
  it("recusa o que não é número ou é negativo", () => {
    for (const [i, f] of [["meio", 3], [1, null], [-1, 3], [1, -2], [undefined, 3], ["", 3], [NaN, 3], [1, Infinity]] as const) {
      expect("erro" in trechoDoCorte(i, f, 10)).toBe(true);
    }
  });
  it("recusa o fim depois do vídeo e a duração não medida", () => {
    expect(trechoDoCorte(0, 11, 10)).toMatchObject({ erro: expect.stringMatching(/fim/) });
    expect("erro" in trechoDoCorte(0, 5, null)).toBe(true);
    expect("erro" in trechoDoCorte(0, 5, 0)).toBe(true);
  });
  it("recusa trecho curto demais e o invertido", () => {
    expect("erro" in trechoDoCorte(4, 4 + CORTE_MINIMO_S - 0.1, 10)).toBe(true);
    expect("erro" in trechoDoCorte(6, 2, 10)).toBe(true);
  });
  it("recusa o corte que não corta nada", () => {
    expect(trechoDoCorte(0, 10, 10)).toMatchObject({ erro: expect.stringMatching(/Nada a cortar/) });
    expect("erro" in trechoDoCorte(0, 9.95, 10)).toBe(true);
  });
});

describe("argsDoCorte", () => {
  it("copia sem recomprimir, só arquivo local, no mesmo contêiner", () => {
    const a = argsDoCorte("/tmp/in.mp4", "/tmp/out.mp4", 1.5, 4, "video/mp4");
    expect(a).toContain("copy");
    expect(a[a.indexOf("-c") + 1]).toBe("copy");
    expect(a[a.indexOf("-protocol_whitelist") + 1]).toBe("file");
    expect(a[a.indexOf("-ss") + 1]).toBe("1.5");
    expect(a[a.indexOf("-t") + 1]).toBe("2.5");
    expect(a.indexOf("-ss")).toBeLessThan(a.indexOf("-i"));
    expect(a.at(-2)).toBe("mp4");
    expect(a.at(-1)).toBe("/tmp/out.mp4");
    expect(argsDoCorte("/tmp/in.mov", "/tmp/out.mov", 0, 3, "video/quicktime").at(-2)).toBe("mov");
    // Nada de recompressão: nenhum codificador nomeado.
    expect(a.some((x) => /libx264|libx265|-crf|-vf/.test(x))).toBe(false);
  });
});
