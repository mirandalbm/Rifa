import { describe, expect, it } from "vitest";
import { leituraDoLink } from "../shared/aoVivo";

describe("o painel diz se o link da transmissão toca na tela", () => {
  it("o link da live (do Compartilhar) toca, com ou sem o rastreio do fim", () => {
    for (const l of [
      "https://www.youtube.com/live/S-4jed6TgNY?is=221YXTUlTM6LcEOk",
      "https://youtu.be/S-4jed6TgNY",
      "https://www.youtube.com/watch?v=S-4jed6TgNY",
      "https://m.youtube.com/watch?v=S-4jed6TgNY",
      "  https://www.youtube.com/live/S-4jed6TgNY  ",
    ]) {
      const r = leituraDoLink(l);
      expect(r.situacao, l).toBe("toca");
      expect(r.texto).toMatch(/YouTube vai tocar/);
    }
    expect(leituraDoLink("https://www.twitch.tv/caixa").situacao).toBe("toca");
  });

  it("o link do canal só abre o YouTube e diz o que copiar no lugar", () => {
    for (const l of ["https://www.youtube.com/@caixa", "https://www.youtube.com/@caixa/live", "https://www.youtube.com/channel/UC1234567890123456789012"]) {
      const r = leituraDoLink(l);
      expect(r.situacao, l).toBe("aba");
      expect(r.texto).toMatch(/Copiar link/);
    }
  });

  it("vazio não diz nada; link sem https ou quebrado é inválido; outro site abre em outra aba", () => {
    expect(leituraDoLink("   ")).toEqual({ situacao: "vazio", texto: "" });
    expect(leituraDoLink("youtube.com/live/S-4jed6TgNY").situacao).toBe("invalido");
    expect(leituraDoLink("http://www.youtube.com/live/S-4jed6TgNY").situacao).toBe("invalido");
    expect(leituraDoLink("https://exemplo.com.br/sorteio").situacao).toBe("aba");
  });
});
