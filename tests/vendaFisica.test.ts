import { describe, it, expect } from "vitest";
import {
  AUTORIZACAO_MAX,
  TERMINAL_MAX,
  VENDAS_DO_CAMBISTA_POR_JANELA,
  codigoDaVenda,
  lerComprovanteDaMaquininha,
  lerMeioFisico,
} from "../shared/vendaFisica";

describe("código da venda na URL", () => {
  it("aceita o inteiro positivo em dígitos", () => {
    expect(codigoDaVenda("56269106")).toBe(56269106);
    expect(codigoDaVenda("1")).toBe(1);
    expect(codigoDaVenda("2147483647")).toBe(2_147_483_647);
  });

  it("o que não é isso não existe (nunca vira NaN, Infinity ou número fora do int4 no SQL)", () => {
    for (const texto of ["abc", "12.5", "1e3", "-1", "0", "00", "0x10", "Infinity", "NaN", "2147483648", "99999999999999", "", " 12", "1,2", "undefined", "１２"]) {
      expect(codigoDaVenda(texto), texto).toBeNull();
    }
  });

  it("só texto: o que não é texto não passa", () => {
    expect(codigoDaVenda(12)).toBeNull();
    expect(codigoDaVenda(undefined)).toBeNull();
    expect(codigoDaVenda(["12"])).toBeNull();
  });
});

describe("meio da venda na mão", () => {
  it("aceita dinheiro e Pix da maquininha, pelo texto exato", () => {
    expect(lerMeioFisico("dinheiro")).toBe("dinheiro");
    expect(lerMeioFisico("pix_maquininha")).toBe("pix_maquininha");
  });

  it("cartão, Pix online, lista e objeto não são meio da mão", () => {
    for (const v of ["cartao", "cartao_maquininha", "pix_online", "bonus", ["dinheiro"], { toString: () => "dinheiro" }, null, undefined, 1, "constructor", "__proto__"]) {
      expect(lerMeioFisico(v), String(v)).toBeNull();
    }
  });
});

describe("comprovante da maquininha", () => {
  it("ausente é permitido: o cambista sem maquininha não tem comprovante", () => {
    expect(lerComprovanteDaMaquininha(undefined, undefined)).toEqual({ ok: true });
    expect(lerComprovanteDaMaquininha(null, "")).toEqual({ ok: true });
  });

  it("o NSU e o nome do aparelho passam", () => {
    expect(lerComprovanteDaMaquininha("A1B2-C3.4/5", "Ton POS Android")).toEqual({
      ok: true,
      posAuthCode: "A1B2-C3.4/5",
      posTerminal: "Ton POS Android",
    });
  });

  it("o código vai impresso no bilhete público: texto livre não passa", () => {
    for (const v of ["Pague no Pix 11999998888", "x y", "<b>", "a\nb", "cód", { a: 1 }, ["x"], 123456]) {
      const r = lerComprovanteDaMaquininha(v, undefined);
      expect(r.ok, JSON.stringify(v)).toBe(false);
    }
  });

  it("tem teto de tamanho", () => {
    expect(lerComprovanteDaMaquininha("A".repeat(AUTORIZACAO_MAX), undefined).ok).toBe(true);
    expect(lerComprovanteDaMaquininha("A".repeat(AUTORIZACAO_MAX + 1), undefined).ok).toBe(false);
    expect(lerComprovanteDaMaquininha(undefined, "T".repeat(TERMINAL_MAX)).ok).toBe(true);
    expect(lerComprovanteDaMaquininha(undefined, "T".repeat(TERMINAL_MAX + 1)).ok).toBe(false);
  });

  it("o nome do terminal é uma linha, sem caractere de controle", () => {
    expect(lerComprovanteDaMaquininha(undefined, "T\n1").ok).toBe(false);
    expect(lerComprovanteDaMaquininha(undefined, "T\u0000").ok).toBe(false);
    expect(lerComprovanteDaMaquininha(undefined, ["x"]).ok).toBe(false);
    expect(lerComprovanteDaMaquininha(undefined, "Cielo LIO (v2)").ok).toBe(true);
  });
});

describe("teto de vendas por cambista", () => {
  it("é folgado para o balcão (uma venda a cada 5 s no máximo, metade do tempo) e finito", () => {
    const { minutos, limite } = VENDAS_DO_CAMBISTA_POR_JANELA;
    expect(limite).toBeGreaterThanOrEqual((minutos * 60) / 5 / 2);
    expect(limite).toBeLessThanOrEqual(1000);
  });
});
