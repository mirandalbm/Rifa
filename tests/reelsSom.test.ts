import { afterEach, describe, expect, it, vi } from "vitest";
import { guardarSomDosReels, lerSomDosReels } from "../client/src/lib/reelsSom";

function armazenamentoDeMentira() {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
  };
}

describe("o som dos reels, lembrado no aparelho", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("o padrão é mudo", () => {
    vi.stubGlobal("localStorage", armazenamentoDeMentira());
    expect(lerSomDosReels()).toBe(false);
  });

  it("ligar guarda, desligar apaga", () => {
    vi.stubGlobal("localStorage", armazenamentoDeMentira());
    guardarSomDosReels(true);
    expect(lerSomDosReels()).toBe(true);
    guardarSomDosReels(false);
    expect(lerSomDosReels()).toBe(false);
  });

  it("sem armazenamento (aba privada, bloqueio), não quebra: só não lembra", () => {
    const quebrado = {
      getItem: () => {
        throw new Error("bloqueado");
      },
      setItem: () => {
        throw new Error("bloqueado");
      },
      removeItem: () => {
        throw new Error("bloqueado");
      },
    };
    vi.stubGlobal("localStorage", quebrado);
    expect(() => guardarSomDosReels(true)).not.toThrow();
    expect(lerSomDosReels()).toBe(false);
  });

  it("valor estranho guardado vale como mudo", () => {
    const a = armazenamentoDeMentira();
    a.setItem("rifa.reels.som", "talvez");
    vi.stubGlobal("localStorage", a);
    expect(lerSomDosReels()).toBe(false);
  });
});
