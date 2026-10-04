import { describe, expect, it, vi } from "vitest";
import { deitarATela, soltarATela } from "../client/src/lib/telaCheia";

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
