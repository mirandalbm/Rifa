import { describe, expect, it } from "vitest";
import { CONFIG_BUSCA_PADRAO, algumTipoLigado, escaparCuringa, fazerCursorDeCurtidas, interpretarEstado, interpretarOrdem, interpretarTermo, lerCursorDeCurtidas, semAcento, validarConfigBusca } from "@shared/buscar";

describe("buscar — regras puras", () => {
  it("apostador nasce desligado e só as chaves conhecidas entram", () => {
    expect(CONFIG_BUSCA_PADRAO).toEqual({ rifas: true, organizacoes: true, apostadores: false });
    expect(validarConfigBusca(undefined)).toEqual(CONFIG_BUSCA_PADRAO);
    expect(validarConfigBusca({ apostadores: true, hackeado: true })).toEqual({ rifas: true, organizacoes: true, apostadores: true });
    expect(validarConfigBusca({ rifas: "sim" })).toEqual({ rifas: false, organizacoes: true, apostadores: false });
  });

  it("o texto sai limpo: sem acento, minúsculo, curto demais não busca", () => {
    expect(interpretarTermo("  MOTO  Zero Km ")).toEqual({ texto: "moto zero km", apelido: null });
    expect(interpretarTermo("Promoção de São José")?.texto).toBe("promocao de sao jose");
    expect(interpretarTermo("a")).toBeNull();
    expect(interpretarTermo("@a")).toBeNull();
    expect(interpretarTermo(42)).toBeNull();
    expect(interpretarTermo("x".repeat(500))?.texto.length).toBe(60);
  });

  it("@ pede o apelido exato", () => {
    expect(interpretarTermo("@Ana.Souza")).toEqual({ texto: "ana.souza", apelido: "ana.souza" });
  });

  it("% e _ viram letras, não curinga", () => {
    expect(escaparCuringa("100%_certo")).toBe("100\\%\\_certo");
    expect(semAcento("Ação")).toBe("acao");
  });

  it("sem nenhum tipo ligado, não há o que mostrar", () => {
    expect(algumTipoLigado({ rifas: false, organizacoes: false, apostadores: false })).toBe(false);
    expect(algumTipoLigado(CONFIG_BUSCA_PADRAO)).toBe(true);
  });

  it("a ordem só aceita valor conhecido: o resto é as mais novas", () => {
    expect(interpretarOrdem("curtidas")).toBe("curtidas");
    expect(interpretarOrdem("novas")).toBe("novas");
    for (const x of ["popularidade", "", undefined, 3, "CURTIDAS", "curtidas; drop table"]) expect(interpretarOrdem(x)).toBe("novas");
  });

  it("o estado é uma UF da lista, em maiúscula; fora dela não filtra", () => {
    expect(interpretarEstado("sp")).toBe("SP");
    expect(interpretarEstado(" ba ")).toBe("BA");
    for (const x of ["XX", "", "S", "SPP", undefined, 5, "SP' or 1=1"]) expect(interpretarEstado(x)).toBeNull();
  });

  it("o cursor de curtidas é <curtidas>|<id>: ida e volta, e o resto é primeira página", () => {
    const id = "8e0f4f0a-1a2b-4c3d-9e4f-5a6b7c8d9e0f";
    expect(lerCursorDeCurtidas(fazerCursorDeCurtidas(42, id))).toEqual({ curtidas: 42, id });
    expect(lerCursorDeCurtidas(fazerCursorDeCurtidas(0, id))).toEqual({ curtidas: 0, id });
    for (const x of ["lixo", `-1|${id}`, `1.5|${id}`, `1|nao-e-id`, `1|${id}|extra`, `2026-10-01T00:00:00.000Z|${id}`, `1234567890|${id}`, undefined, 7]) {
      expect(lerCursorDeCurtidas(x)).toBeNull();
    }
  });
});
