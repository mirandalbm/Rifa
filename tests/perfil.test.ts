import { describe, it, expect } from "vitest";
import {
  validarBio,
  bioAutomatica,
  seguidoPor,
  contador,
  linkDeCompartilhar,
  whatsappDoContato,
  BIO_MAX,
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
