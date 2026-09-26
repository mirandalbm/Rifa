import { describe, it, expect } from "vitest";
import {
  BANNER_SEGUNDOS,
  bannerNoAr,
  estadosComRifa,
  expiraEm,
  temStoryNovo,
  validarBanner,
  validarLegenda,
  validarLinkDoBanner,
  LEGENDA_MAX,
} from "../shared/vitrine";
import { TEMPLATE_PADRAO, validarTemplate } from "../shared/template";

describe("link do banner", () => {
  it("aceita caminho do site e https", () => {
    expect(validarLinkDoBanner("/r/moto")).toBe("/r/moto");
    expect(validarLinkDoBanner("https://exemplo.com.br/x")).toBe("https://exemplo.com.br/x");
    expect(validarLinkDoBanner("")).toBeNull();
    expect(validarLinkDoBanner(null)).toBeNull();
  });

  it("recusa o que sairia do site disfarçado ou executaria código", () => {
    for (const ruim of ["//golpe.com", "/\\golpe.com", "javascript:alert(1)", "http://exemplo.com.br", "data:text/html,x", "https://banco@golpe.com", "/r/a b", '/r/"x'])
      expect(() => validarLinkDoBanner(ruim), ruim).toThrow();
  });
});

describe("banner", () => {
  it("exige título (é o texto alternativo) e tempo dentro da faixa", () => {
    expect(() => validarBanner({ titulo: "" })).toThrow(/título/);
    expect(() => validarBanner({ titulo: "Promo", segundos: BANNER_SEGUNDOS.max + 1 })).toThrow(/segundos/);
    expect(validarBanner({ titulo: "  Promo   de   verão " }).titulo).toBe("Promo de verão");
    expect(validarBanner({ titulo: "Promo" }).segundos).toBe(BANNER_SEGUNDOS.padrao);
  });

  it("janela: fim depois do início", () => {
    expect(() => validarBanner({ titulo: "Promo", inicio: "2026-10-02", fim: "2026-10-01" })).toThrow(/fim/);
  });

  it("só as chaves conhecidas saem", () => {
    const b = validarBanner({ titulo: "Promo", extra: "<script>" }) as unknown as Record<string, unknown>;
    expect(Object.keys(b).sort()).toEqual(["ativo", "fim", "inicio", "link", "segundos", "titulo"]);
  });

  it("no ar: ligado e dentro da janela", () => {
    const agora = new Date("2026-10-01T12:00:00Z");
    expect(bannerNoAr({ ativo: true, inicio: null, fim: null }, agora)).toBe(true);
    expect(bannerNoAr({ ativo: false, inicio: null, fim: null }, agora)).toBe(false);
    expect(bannerNoAr({ ativo: true, inicio: "2026-10-02T00:00:00Z", fim: null }, agora)).toBe(false);
    expect(bannerNoAr({ ativo: true, inicio: null, fim: "2026-10-01T12:00:00Z" }, agora)).toBe(false);
    expect(bannerNoAr({ ativo: true, inicio: "2026-09-30T00:00:00Z", fim: "2026-10-05T00:00:00Z" }, agora)).toBe(true);
  });
});

describe("stories", () => {
  it("vence em 24 h", () => {
    const d = new Date("2026-10-01T10:00:00Z");
    expect(expiraEm(d).toISOString()).toBe("2026-10-02T10:00:00.000Z");
  });

  it("anel aceso só com story mais novo que o último visto", () => {
    expect(temStoryNovo(null, null)).toBe(false);
    expect(temStoryNovo("2026-10-01T10:00:00Z", null)).toBe(true);
    expect(temStoryNovo("2026-10-01T10:00:00Z", "2026-10-01T10:00:00Z")).toBe(false);
    expect(temStoryNovo("2026-10-01T11:00:00Z", "2026-10-01T10:00:00Z")).toBe(true);
  });

  it("legenda curta e sem espaço sobrando", () => {
    expect(validarLegenda("  oi   gente ")).toBe("oi gente");
    expect(validarLegenda("   ")).toBeNull();
    expect(() => validarLegenda("x".repeat(LEGENDA_MAX + 1))).toThrow();
  });
});

describe("estados com rifa", () => {
  const contagem = [
    { uf: "SP", rifas: 3 },
    { uf: "BA", rifas: 1 },
    { uf: "MG", rifas: 0 },
    { uf: null, rifas: 2 },
    { uf: "XX", rifas: 1 },
  ];

  it("só estados válidos com rifa, em ordem de nome", () => {
    expect(estadosComRifa(contagem).map((e) => e.uf)).toEqual(["BA", "SP"]);
    expect(estadosComRifa(contagem)[0].nome).toBe("Bahia");
  });

  it("o estado de quem olha vem primeiro — ordena, nunca esconde", () => {
    const l = estadosComRifa(contagem, "SP");
    expect(l.map((e) => e.uf)).toEqual(["SP", "BA"]);
    expect(estadosComRifa(contagem, "RJ").map((e) => e.uf)).toEqual(["BA", "SP"]);
  });
});

describe("blocos novos no template", () => {
  it("o padrão tem banners, stories, estados, seletor e feed, e valida", () => {
    expect(validarTemplate(TEMPLATE_PADRAO).blocos.map((b) => b.tipo)).toEqual([
      "banners",
      "seguidos",
      "estados",
      "regiao",
      "rifas",
      "ajuda",
    ]);
  });

  it("bloco que não é texto entra uma vez só", () => {
    const dobrado = { ...TEMPLATE_PADRAO, blocos: [...TEMPLATE_PADRAO.blocos, { id: "banners-2", tipo: "banners", ligado: true }] };
    expect(() => validarTemplate(dobrado)).toThrow(/uma vez/);
  });
});
