import { describe, expect, it, vi } from "vitest";
import { deitarATela, deveGirarATela, ESTILO_DA_TELA_GIRADA, soltarATela } from "../client/src/lib/telaCheia";

describe("tela cheia do sorteio deita o celular", () => {
  it("pede a orientação deitada e diz que conseguiu", async () => {
    const lock = vi.fn().mockResolvedValue(undefined);
    expect(await deitarATela({ lock })).toBe(true);
    expect(lock).toHaveBeenCalledWith("landscape");
  });

  it("onde o navegador recusa ou não sabe girar, segue como está, sem erro", async () => {
    expect(await deitarATela({ lock: vi.fn().mockRejectedValue(new Error("NotSupportedError")) })).toBe(false);
    expect(await deitarATela({})).toBe(false);
    expect(await deitarATela(undefined)).toBe(false);
  });

  it("sair da tela cheia solta a orientação, e soltar nunca lança", () => {
    const unlock = vi.fn();
    soltarATela({ unlock });
    expect(unlock).toHaveBeenCalledTimes(1);
    expect(() => soltarATela({ unlock: () => { throw new Error("nada travado"); } })).not.toThrow();
    expect(() => soltarATela(undefined)).not.toThrow();
  });
});

describe("no iPhone (tela cheia falsa) o vídeo é desenhado deitado", () => {
  it("gira só na tela cheia falsa com o aparelho em pé", () => {
    expect(deveGirarATela(true, false)).toBe(true);
    expect(deveGirarATela(true, true)).toBe(false);
    expect(deveGirarATela(false, false)).toBe(false);
    expect(deveGirarATela(false, true)).toBe(false);
  });

  it("girada, ocupa a janela inteira de lado: largura e altura trocadas", () => {
    expect(ESTILO_DA_TELA_GIRADA.width).toBe("100dvh");
    expect(ESTILO_DA_TELA_GIRADA.height).toBe("100dvw");
    expect(ESTILO_DA_TELA_GIRADA.transform).toContain("rotate(90deg)");
  });
});
