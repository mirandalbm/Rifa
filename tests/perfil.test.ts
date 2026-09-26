import { describe, it, expect } from "vitest";
import {
  validarBio,
  bioAutomatica,
  seguidoPor,
  contador,
  linkDeCompartilhar,
  whatsappDoContato,
  BIO_MAX,
  validarDestaque,
  validarLinks,
  redeDoLink,
  LINKS_MAX,
} from "../shared/perfil";
import { formatBRL } from "../shared/format";

describe("bio do organizador", () => {
  it("limpa espaço e linhas em branco demais", () => {
    expect(validarBio("  Rifas   do bairro \n\n\n\n desde 2020  ")).toBe("Rifas do bairro\n\ndesde 2020");
    expect(validarBio("   ")).toBeNull();
    expect(validarBio(undefined)).toBeNull();
  });

  it("recusa o que passa do limite ou não é texto", () => {
    expect(() => validarBio("a".repeat(BIO_MAX + 1))).toThrow(/300/);
    expect(() => validarBio(42)).toThrow(/texto/);
  });
});

describe("bio automática", () => {
  it("monta prêmio, sorteio no horário de Brasília, cota e autorização", () => {
    expect(
      bioAutomatica({
        prizeTitle: "Fiat Mobi 0 km",
        drawAt: "2026-10-17T22:00:00Z",
        authorizationCode: "03.021234/2026",
        priceCents: 990,
      }),
    ).toEqual([
      "🏆 Fiat Mobi 0 km",
      "📅 Sorteio 17/10/2026 às 19:00 · Loteria Federal",
      `🎟️ Cota ${formatBRL(990)}`,
      "✅ Autorização SPA/MF 03.021234/2026",
    ]);
  });

  it("sem rifa no ar, não inventa nada", () => {
    expect(bioAutomatica(null)).toEqual([]);
  });
});

describe("seguido por", () => {
  it("só nomeia quem é público, e só o primeiro nome", () => {
    expect(seguidoPor(["Ana Souza", "Bruno Lima", "Carla"], 15)).toBe(
      "Seguido por Ana, Bruno e outras 13 pessoas",
    );
    expect(seguidoPor(["Ana Souza"], 2)).toBe("Seguido por Ana e outra pessoa");
    expect(seguidoPor(["Ana Souza", "Bruno Lima"], 2)).toBe("Seguido por Ana e Bruno");
  });

  it("ninguém público: não diz nada", () => {
    expect(seguidoPor([], 500)).toBeNull();
  });
});

describe("contador e compartilhar", () => {
  it("abrevia como o Instagram", () => {
    expect(contador(1234)).toBe("1.234");
    expect(contador(15_390)).toBe("15,3 mil");
    expect(contador(2_450_000)).toBe("2,4 mi");
  });

  it("gera link onde a rede aceita e devolve nulo onde não aceita", () => {
    const url = "https://rifa.br/o/rifas-sao-jose";
    expect(linkDeCompartilhar("whatsapp", url, "Olha")).toBe(
      "https://wa.me/?text=Olha%20https%3A%2F%2Frifa.br%2Fo%2Frifas-sao-jose",
    );
    expect(linkDeCompartilhar("telegram", url, "Olha")).toContain("t.me/share/url?url=https%3A");
    expect(linkDeCompartilhar("facebook", url, "Olha")).toContain("sharer.php?u=https%3A");
    expect(linkDeCompartilhar("instagram", url, "Olha")).toBeNull();
    expect(linkDeCompartilhar("tiktok", url, "Olha")).toBeNull();
  });

  it("WhatsApp da organização só quando o contato é telefone", () => {
    expect(whatsappDoContato("(11) 3333-4444")).toBe("551133334444");
    expect(whatsappDoContato("+55 11 98888-7777")).toBe("5511988887777");
    expect(whatsappDoContato("contato@rifa.br")).toBeNull();
  });
});

describe("cor de destaque do organizador", () => {
  it("sem cor, vale a da plataforma", () => {
    expect(validarDestaque(null)).toBeNull();
    expect(validarDestaque(undefined)).toBeNull();
  });

  it("aceita cor com contraste nos dois temas e normaliza para minúscula", () => {
    expect(validarDestaque({ claro: "#6D28D9", escuro: "#C4B5FD" })).toEqual({ claro: "#6d28d9", escuro: "#c4b5fd" });
  });

  it("recusa cor que some no fundo claro ou no escuro", () => {
    expect(() => validarDestaque({ claro: "#fff59d", escuro: "#c4b5fd" })).toThrow(/tema claro.*contraste/);
    expect(() => validarDestaque({ claro: "#6d28d9", escuro: "#1a1a2e" })).toThrow(/tema escuro.*contraste/);
  });

  it("recusa o que não é #rrggbb (nem nome de cor, nem CSS)", () => {
    expect(() => validarDestaque({ claro: "red", escuro: "#c4b5fd" })).toThrow(/inválida/);
    expect(() => validarDestaque({ claro: "#6d28d9;background:url(x)", escuro: "#c4b5fd" })).toThrow(/inválida/);
    expect(() => validarDestaque("#6d28d9")).toThrow();
  });
});

describe("links da bio", () => {
  it("só https: javascript:, http: e data: são recusados", () => {
    expect(() => validarLinks([{ url: "javascript:alert(1)" }])).toThrow(/https/);
    expect(() => validarLinks([{ url: "http://exemplo.com.br" }])).toThrow(/https/);
    expect(() => validarLinks([{ url: "data:text/html,<script>" }])).toThrow(/https/);
  });

  it("endereço sem esquema ganha https; usuário e senha na URL são recusados", () => {
    expect(validarLinks([{ url: "instagram.com/rifas" }])[0].url).toBe("https://instagram.com/rifas");
    expect(() => validarLinks([{ url: "https://banco.com@golpe.com" }])).toThrow(/inválido/);
    expect(() => validarLinks([{ url: "https://localhost" }])).toThrow(/inválido/);
  });

  it("rótulo vazio vira o nome da rede; link repetido sai", () => {
    const l = validarLinks([
      { url: "https://www.instagram.com/rifas" },
      { url: "https://www.instagram.com/rifas", rotulo: "de novo" },
      { url: "https://loja.exemplo.com.br", rotulo: "  Nossa   loja " },
    ]);
    expect(l).toEqual([
      { rotulo: "Instagram", url: "https://www.instagram.com/rifas" },
      { rotulo: "Nossa loja", url: "https://loja.exemplo.com.br/" },
    ]);
  });

  it(`no máximo ${LINKS_MAX}, e só as chaves conhecidas saem`, () => {
    const seis = Array.from({ length: LINKS_MAX + 1 }, (_, i) => ({ url: `https://s${i}.com.br` }));
    expect(() => validarLinks(seis)).toThrow(/No máximo/);
    const [l] = validarLinks([{ url: "https://a.com.br", rotulo: "A", extra: "<script>" }]);
    expect(Object.keys(l).sort()).toEqual(["rotulo", "url"]);
  });

  it("reconhece as redes pelo domínio, não pelo texto", () => {
    expect(redeDoLink("https://wa.me/5511999999999").rede).toBe("whatsapp");
    expect(redeDoLink("https://youtu.be/x").rede).toBe("youtube");
    expect(redeDoLink("https://m.facebook.com/x").rede).toBe("facebook");
    expect(redeDoLink("https://instagram.com.golpe.io/x").rede).toBe("site");
  });
});
