import { describe, it, expect } from "vitest";
import {
  validarConfigPlataforma,
  comissaoInicial,
  percentualDoPromotor,
  carteiraAsaasValida,
  CONFIG_PADRAO,
} from "../shared/plataforma";
import { cpfValido, maskCpf } from "../shared/format";

describe("configuração da plataforma", () => {
  it("estorno pelo painel nasce desligado", () => {
    expect(CONFIG_PADRAO.estornoManual).toBe(false);
    expect(validarConfigPlataforma({}).estornoManual).toBe(false);
  });

  it("só liga o estorno com true de verdade", () => {
    expect(validarConfigPlataforma({ estornoManual: "sim" as never }).estornoManual).toBe(false);
    expect(validarConfigPlataforma({ estornoManual: true }).estornoManual).toBe(true);
  });

  it("recusa provedor desconhecido e aceita os dois", () => {
    expect(() => validarConfigPlataforma({ provedorPix: "pagseguro" as never })).toThrow();
    expect(validarConfigPlataforma({ provedorPix: "asaas" }).provedorPix).toBe("asaas");
    expect(validarConfigPlataforma({ provedorPix: "mercadopago" }).provedorPix).toBe("mercadopago");
    expect(validarConfigPlataforma({ provedorPix: null }).provedorPix).toBeNull();
  });

  it("não guarda chave que não existe", () => {
    const c = validarConfigPlataforma({ estornoManual: true, extra: 1 } as never);
    expect(Object.keys(c).sort()).toEqual(["estornoManual", "exigirCadastroFiscal", "provedorPix", "taxaReembolsoPct"]);
  });
});

describe("liberação da comissão", () => {
  const pago = new Date("2026-10-01T12:00:00Z");
  const carencia = new Date("2026-10-20T00:00:00Z");

  it("depois do sorteio: pendente até a carência", () => {
    expect(comissaoInicial("apos_sorteio", pago, carencia)).toEqual({
      status: "pending",
      availableAt: carencia,
    });
  });

  it("imediata: disponível na hora do pagamento", () => {
    expect(comissaoInicial("imediata", pago, carencia)).toEqual({
      status: "available",
      availableAt: pago,
    });
  });
});

describe("split do Asaas", () => {
  it("promotor recebe tudo menos a taxa da plataforma, em percentual do líquido", () => {
    expect(percentualDoPromotor(0)).toBe(100);
    expect(percentualDoPromotor(5)).toBe(95);
    expect(percentualDoPromotor(12.5)).toBe(87.5);
  });

  it("nunca sai da faixa de 0 a 100", () => {
    expect(percentualDoPromotor(-10)).toBe(100);
    expect(percentualDoPromotor(150)).toBe(0);
  });

  it("carteira é um UUID", () => {
    expect(carteiraAsaasValida("7bafd95a-e783-4a62-9be1-23999af742c6")).toBe(true);
    expect(carteiraAsaasValida(" 7bafd95a-e783-4a62-9be1-23999af742c6 ")).toBe(true);
    expect(carteiraAsaasValida("minha-carteira")).toBe(false);
    expect(carteiraAsaasValida("")).toBe(false);
  });
});

describe("CPF", () => {
  it("confere os dígitos verificadores", () => {
    expect(cpfValido("529.982.247-25")).toBe(true);
    expect(cpfValido("52998224725")).toBe(true);
    expect(cpfValido("529.982.247-26")).toBe(false);
    expect(cpfValido("111.111.111-11")).toBe(false);
    expect(cpfValido("123")).toBe(false);
  });

  it("formata enquanto digita", () => {
    expect(maskCpf("529")).toBe("529");
    expect(maskCpf("5299822")).toBe("529.982.2");
    expect(maskCpf("52998224725")).toBe("529.982.247-25");
    expect(maskCpf("529.982.247-2599")).toBe("529.982.247-25");
  });
});
