import { describe, expect, it } from "vitest";
import { faltaParaOSorteio, nomeCurto, srcDaTwitch, videoDaTransmissao } from "@shared/aoVivo";
import { TEMPLATE_PADRAO, validarApoios, validarTemplate } from "@shared/template";

describe("nomeCurto", () => {
  it("primeiro nome e inicial do último", () => {
    expect(nomeCurto("Marina Souza Lima")).toBe("Marina L.");
    expect(nomeCurto("Ana")).toBe("Ana");
    expect(nomeCurto("  ")).toBe("Alguém");
    expect(nomeCurto("Comprador 4")).toBe("Comprador");
  });
});

describe("videoDaTransmissao", () => {
  it("YouTube em todos os formatos vira o player sem cookie", () => {
    for (const url of [
      "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      "https://youtu.be/dQw4w9WgXcQ",
      "https://youtube.com/live/dQw4w9WgXcQ?feature=share",
      "https://m.youtube.com/shorts/dQw4w9WgXcQ",
    ]) {
      expect(videoDaTransmissao(url)).toEqual({
        tipo: "embutido",
        servico: "youtube",
        src: "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?autoplay=1&mute=1&playsinline=1",
      });
    }
  });
  it("Vimeo, Twitch e Facebook", () => {
    expect(videoDaTransmissao("https://vimeo.com/123456")).toMatchObject({ servico: "vimeo", src: "https://player.vimeo.com/video/123456?autoplay=1&muted=1" });
    expect(videoDaTransmissao("https://www.twitch.tv/MeuCanal")).toEqual({ tipo: "twitch", canal: "meucanal" });
    expect(srcDaTwitch("meucanal", "rifa.br")).toContain("parent=rifa.br");
    expect(videoDaTransmissao("https://www.facebook.com/pagina/videos/123")).toMatchObject({ servico: "facebook" });
  });
  it("outro endereço vira link, nunca moldura; inválido é nulo", () => {
    expect(videoDaTransmissao("https://exemplo.com.br/ao-vivo")).toEqual({ tipo: "link", href: "https://exemplo.com.br/ao-vivo" });
    expect(videoDaTransmissao("https://youtube.com/watch?v=curto")).toEqual({ tipo: "link", href: "https://youtube.com/watch?v=curto" });
    expect(videoDaTransmissao("http://youtube.com/watch?v=dQw4w9WgXcQ")).toBeNull();
    expect(videoDaTransmissao("javascript:alert(1)")).toBeNull();
    expect(videoDaTransmissao(null)).toBeNull();
  });
});

describe("faltaParaOSorteio", () => {
  it("conta dias, horas, minutos e segundos, e vira ao vivo na hora", () => {
    const agora = Date.UTC(2026, 0, 1, 0, 0, 0);
    expect(faltaParaOSorteio(new Date(agora + 90_061_000), agora)).toEqual({ aoVivo: false, dias: 1, horas: 1, minutos: 1, segundos: 1 });
    expect(faltaParaOSorteio(new Date(agora - 1), agora).aoVivo).toBe(true);
  });
});

describe("validarApoios (logos do rodapé)", () => {
  const img = (id: string) => `/api/public/marca/apoio/${id}?v=123`;
  it("aceita o que o servidor gerou, com nome e link conferidos", () => {
    expect(validarApoios([{ id: "abcd1234-ef", nome: "Casa de Apoio", imagem: img("abcd1234-ef"), link: "https://apoio.org.br" }])).toEqual([
      { id: "abcd1234-ef", nome: "Casa de Apoio", imagem: img("abcd1234-ef"), link: "https://apoio.org.br/" },
    ]);
    expect(validarApoios(undefined)).toEqual([]);
  });
  it("recusa imagem de fora, link perigoso, sem nome e repetido", () => {
    expect(() => validarApoios([{ id: "abcd1234", nome: "X", imagem: "https://outro.site/logo.png", link: null }])).toThrow();
    expect(() => validarApoios([{ id: "abcd1234", nome: "Casa", imagem: img("abcd1234"), link: "javascript:alert(1)" }])).toThrow();
    expect(() => validarApoios([{ id: "abcd1234", nome: "Casa", imagem: img("abcd1234"), link: "//outro.site" }])).toThrow();
    expect(() => validarApoios([{ id: "abcd1234", nome: "", imagem: img("abcd1234"), link: null }])).toThrow();
    const a = { id: "abcd1234", nome: "Casa", imagem: img("abcd1234"), link: null };
    expect(() => validarApoios([a, a])).toThrow();
  });
  it("template antigo, sem logos, continua válido", () => {
    const { apoios, ...antigo } = TEMPLATE_PADRAO;
    expect(validarTemplate(antigo).apoios).toEqual([]);
    expect(apoios).toEqual([]);
  });
});

describe("qualidade do vídeo", () => {
  it("só o Vimeo oferece o seletor", async () => {
    const { aceitaQualidade } = await import("@shared/aoVivo");
    expect(aceitaQualidade(videoDaTransmissao("https://vimeo.com/123456"))).toBe(true);
    expect(aceitaQualidade(videoDaTransmissao("https://youtu.be/dQw4w9WgXcQ"))).toBe(false);
    expect(aceitaQualidade(videoDaTransmissao("https://www.twitch.tv/canal"))).toBe(false);
    expect(aceitaQualidade(videoDaTransmissao("https://exemplo.com/live"))).toBe(false);
    expect(aceitaQualidade(null)).toBe(false);
  });

  it("põe a qualidade no endereço do Vimeo, e só nele", async () => {
    const { srcComQualidade } = await import("@shared/aoVivo");
    const vimeo = "https://player.vimeo.com/video/123456?autoplay=1&muted=1";
    expect(srcComQualidade(vimeo, "auto")).toBe(vimeo);
    expect(srcComQualidade(vimeo, "1080p")).toBe("https://player.vimeo.com/video/123456?autoplay=1&muted=1&quality=1080p");
    expect(srcComQualidade(vimeo, "4k")).toContain("quality=4k");
    const yt = "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?autoplay=1";
    expect(srcComQualidade(yt, "720p")).toBe(yt);
    // Valor fora da lista não entra no endereço.
    expect(srcComQualidade(vimeo, "999p" as never)).toBe(vimeo);
  });
});
