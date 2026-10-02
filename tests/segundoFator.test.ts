import { describe, expect, it } from "vitest";
import { abrirTexto, estaSelado, selarTexto } from "../server/services/cofre";

describe("segredo selado no cofre", () => {
  it("sela e abre; o selado não mostra o segredo", () => {
    const s = selarTexto("JBSWY3DPEHPK3PXP");
    expect(estaSelado(s)).toBe(true);
    expect(s).not.toContain("JBSWY3DPEHPK3PXP");
    expect(abrirTexto(s)).toBe("JBSWY3DPEHPK3PXP");
    expect(selarTexto("JBSWY3DPEHPK3PXP")).not.toBe(s); // IV novo a cada vez
  });

  it("mexer num byte do selado é recusado, nunca vira outro segredo", () => {
    const s = selarTexto("JBSWY3DPEHPK3PXP");
    const [prefixo, resto] = [s.slice(0, 9), s.slice(9)];
    const [iv, tag, dados] = resto.split(".");
    const mexido = Buffer.from(dados, "base64");
    mexido[0] ^= 1;
    expect(() => abrirTexto(`${prefixo}${iv}.${tag}.${mexido.toString("base64")}`)).toThrow();
    expect(() => abrirTexto(`${prefixo}${iv}.${tag}`)).toThrow();
    expect(() => abrirTexto("JBSWY3DPEHPK3PXP")).toThrow();
  });
});
