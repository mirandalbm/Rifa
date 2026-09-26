import { describe, it, expect } from "vitest";
import {
  montarTermo,
  pctDaComissao,
  podeReceberComissao,
  validarPedidoDeColaborador,
  validarTermo,
  COMISSAO_MAX_PCT,
} from "../shared/afiliados";

describe("termo de adesão", () => {
  it("percentual inteiro de 0 ao máximo; só as chaves conhecidas", () => {
    expect(validarTermo({ comissaoPct: 12, textoExtra: "  Sem spam.  ", extra: 1 })).toEqual({ comissaoPct: 12, textoExtra: "Sem spam." });
    expect(() => validarTermo({ comissaoPct: COMISSAO_MAX_PCT + 1 })).toThrow();
    expect(() => validarTermo({ comissaoPct: 7.5 })).toThrow();
    expect(() => validarTermo({ comissaoPct: -1 })).toThrow();
  });

  it("o texto diz quem paga, quanto, quando, a versão e as regras da organização", () => {
    const t = montarTermo({
      organizacao: { nome: "Rifas X", cnpj: "00.000.000/0001-00" },
      versao: 3,
      comissaoPct: 12,
      liberacao: "apos_sorteio",
      textoExtra: "Proibido divulgar em grupo de apostas.",
    });
    expect(t).toContain("Rifas X (CNPJ 00.000.000/0001-00)");
    expect(t).toContain("versão 3");
    expect(t).toContain("12% sobre o valor pago");
    expect(t).toContain("depois do sorteio");
    expect(t).toContain("Autoindicação é proibida");
    expect(t).toContain("Proibido divulgar em grupo de apostas.");
  });

  it("liberação imediata avisa do risco de estorno depois do saque", () => {
    const t = montarTermo({ organizacao: { nome: "Y", cnpj: null }, versao: 1, comissaoPct: 5, liberacao: "imediata", textoExtra: "" });
    expect(t).toContain("confirmação do pagamento");
    expect(t).toContain("cobrado do afiliado");
    expect(t).not.toContain("Regras da organização");
  });
});

describe("quem recebe e quanto", () => {
  const base = { afiliadoAtivo: true, vinculoAprovado: true, termoDaRifa: null, aceitouTermoDaRifa: false };

  it("precisa de conta ativa e vínculo aprovado com a dona da rifa", () => {
    expect(podeReceberComissao(base)).toBe(true);
    expect(podeReceberComissao({ ...base, vinculoAprovado: false })).toBe(false);
    expect(podeReceberComissao({ ...base, afiliadoAtivo: false })).toBe(false);
  });

  it("rifa publicada com termo: só com o aceite daquela versão", () => {
    expect(podeReceberComissao({ ...base, termoDaRifa: "t1" })).toBe(false);
    expect(podeReceberComissao({ ...base, termoDaRifa: "t1", aceitouTermoDaRifa: true })).toBe(true);
  });

  it("com termo vale o termo; sem termo, o combinado de antes", () => {
    expect(pctDaComissao({ termoPct: 12, vinculoPct: 20, afiliadoPct: 30, rifaPct: 10 })).toBe(12);
    expect(pctDaComissao({ termoPct: 0, vinculoPct: 20, afiliadoPct: null, rifaPct: 10 })).toBe(0);
    expect(pctDaComissao({ termoPct: null, vinculoPct: 20, afiliadoPct: 30, rifaPct: 10 })).toBe(20);
    expect(pctDaComissao({ termoPct: null, vinculoPct: null, afiliadoPct: 30, rifaPct: 10 })).toBe(30);
    expect(pctDaComissao({ termoPct: null, vinculoPct: null, afiliadoPct: null, rifaPct: 10 })).toBe(10);
  });
});

describe("pedido de colaborador", () => {
  it("cidade obrigatória, mensagem curta", () => {
    expect(validarPedidoDeColaborador({ cidade: " Recife ", mensagem: " vendo na feira " })).toEqual({ cidade: "Recife", mensagem: "vendo na feira" });
    expect(() => validarPedidoDeColaborador({ cidade: "" })).toThrow(/cidade/);
    expect(() => validarPedidoDeColaborador({ cidade: "Recife", mensagem: "x".repeat(501) })).toThrow();
  });
});
