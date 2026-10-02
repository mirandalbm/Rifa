import { describe, expect, it } from "vitest";
import { COMPROVANTE_MAX_MS, comprovanteConfere, comprovanteDaExibicao } from "../server/services/ticketDoClique";

const ID = "8f1c2d3e-4b5a-4c6d-8e7f-0a1b2c3d4e5f";

describe("comprovante da exibição do anúncio", () => {
  it("vale para o mesmo anúncio e aparelho, entre 1 s e 30 min", () => {
    const t0 = 1_800_000_000_000;
    const c = comprovanteDaExibicao(ID, "aparelho-1", t0);
    expect(comprovanteConfere(c, ID, "aparelho-1", t0 + 2_000)).toBe(true);
    expect(comprovanteConfere(c, ID, "aparelho-1", t0 + 500)).toBe(false); // na hora: robô
    expect(comprovanteConfere(c, ID, "aparelho-1", t0 + COMPROVANTE_MAX_MS + 1)).toBe(false);
  });

  it("não vale para outro aparelho, outro anúncio ou mexido", () => {
    const t0 = 1_800_000_000_000;
    const c = comprovanteDaExibicao(ID, "aparelho-1", t0);
    expect(comprovanteConfere(c, ID, "aparelho-2", t0 + 2_000)).toBe(false);
    expect(comprovanteConfere(c, ID.replace("8f", "9f"), "aparelho-1", t0 + 2_000)).toBe(false);
    const [q, mac] = c.split(".");
    expect(comprovanteConfere(`${Number(q) - 1000}.${mac}`, ID, "aparelho-1", t0 + 2_000)).toBe(false);
    expect(comprovanteConfere(`${q}.${"0".repeat(32)}`, ID, "aparelho-1", t0 + 2_000)).toBe(false);
  });

  it("formato fora do esperado é só não confere", () => {
    for (const x of [undefined, null, 42, "", "abc", "1.2.3", `${Date.now()}.zz`, "x".repeat(100)]) {
      expect(comprovanteConfere(x, ID, "aparelho-1")).toBe(false);
    }
  });
});
