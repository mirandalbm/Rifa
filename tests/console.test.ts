import { describe, expect, it } from "vitest";
import {
  AVISO_DO_TREVO_PADRAO,
  BOTOES_DO_CONSOLE,
  CORES_DO_AVISO,
  botaoAtivo,
  quemPublica,
  validarAvisoDoTrevo,
} from "@shared/console";
import { CONFIG_PADRAO, validarConfigPlataforma } from "@shared/plataforma";
import { contraste, FUNDO } from "@shared/template";

describe("console do app", () => {
  it("seis botões, na ordem combinada, com o perfil no canto direito", () => {
    expect(BOTOES_DO_CONSOLE.map((b) => b.chave)).toEqual(["inicio", "reels", "mensagens", "buscar", "carrinho", "perfil"]);
  });

  it("acende o botão certo para cada endereço", () => {
    expect(botaoAtivo("/")).toBe("inicio");
    expect(botaoAtivo("/o/rifas-sao-jose/r/iphone")).toBe("inicio");
    expect(botaoAtivo("/estado/SP")).toBe("inicio");
    expect(botaoAtivo("/carrinho/pix/123")).toBe("carrinho");
    expect(botaoAtivo("/minhas-compras?aba=conta")).toBe("perfil");
    expect(botaoAtivo("/perfil")).toBe("perfil");
    expect(botaoAtivo("/reels")).toBe("reels");
    expect(botaoAtivo("/pedido/12345678")).toBeNull();
  });
});

describe("aviso no trevo", () => {
  it("nasce com o ponto no verde do sistema", () => {
    expect(AVISO_DO_TREVO_PADRAO).toEqual({ estilo: "ponto", cor: "sistema" });
    expect(CONFIG_PADRAO.avisoDoTrevo).toEqual(AVISO_DO_TREVO_PADRAO);
  });

  it("só guarda estilo e cor conhecidos", () => {
    expect(validarAvisoDoTrevo({ estilo: "cheio", cor: "rosa", script: "x" })).toEqual({ estilo: "cheio", cor: "rosa" });
    expect(validarAvisoDoTrevo({ estilo: "piscando", cor: "#ff0000" })).toEqual(AVISO_DO_TREVO_PADRAO);
    expect(validarAvisoDoTrevo(null)).toEqual(AVISO_DO_TREVO_PADRAO);
  });

  it("sem roxo: só cores da família do sistema", () => {
    for (const k of ["roxo", "violeta", "magenta", "indigo"]) expect(k in CORES_DO_AVISO).toBe(false);
    expect(validarAvisoDoTrevo({ estilo: "cheio", cor: "roxo" }).cor).toBe("sistema");
  });

  it("toda cor fixa aparece nos dois temas (contraste ≥ 3:1)", () => {
    for (const c of Object.values(CORES_DO_AVISO)) {
      if (!c.hex) continue;
      expect(contraste(c.hex, FUNDO.claro)).toBeGreaterThanOrEqual(3);
      expect(contraste(c.hex, FUNDO.escuro)).toBeGreaterThanOrEqual(3);
    }
  });

  it("a configuração da plataforma guarda o aviso e o interruptor, que nasce desligado", () => {
    expect(CONFIG_PADRAO.publicarApostador).toBe(false);
    const v = validarConfigPlataforma({ ...CONFIG_PADRAO, avisoDoTrevo: { estilo: "cheio", cor: "laranja" }, publicarApostador: true });
    expect(v.avisoDoTrevo).toEqual({ estilo: "cheio", cor: "laranja" });
    expect(v.publicarApostador).toBe(true);
  });
});

describe("quem vê o ícone de publicação", () => {
  it("organização e plataforma criam; afiliado é influenciador", () => {
    expect(quemPublica({ role: "organizer" }, false)).toBe("organizador");
    expect(quemPublica({ role: "admin" }, false)).toBe("organizador");
    expect(quemPublica({ role: "affiliate" }, false)).toBe("influenciador");
  });

  it("apostador só com o interruptor; sem conta, nunca", () => {
    expect(quemPublica({ role: null, apostador: true }, false)).toBeNull();
    expect(quemPublica({ role: null, apostador: true }, true)).toBe("apostador");
    expect(quemPublica(null, true)).toBeNull();
    expect(quemPublica({ role: "cambista" }, true)).toBeNull();
  });
});
