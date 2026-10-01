import { describe, expect, it } from "vitest";
import { CONFIG_BUSCA_PADRAO, algumTipoLigado, escaparCuringa, interpretarTermo, semAcento, validarConfigBusca } from "@shared/buscar";

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
});
