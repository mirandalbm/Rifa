import { describe, expect, it } from "vitest";
import { PROBLEMA_SEM_DECLARACAO_VALE_BRINDE, problemaDoValeBrinde } from "../shared/premiadas";
import { SocioInvalido, cpfMascarado, validarSocio } from "../shared/socios";
import {
  EntidadeInvalida,
  documentosQueFaltam,
  situacaoDepoisDoEnvio,
  validarDecisaoDaEntidade,
  validarEntidade,
} from "../shared/bannerDivulgacao";

describe("2.3: declaração do vale-brinde", () => {
  it("rifa autorizada com cota premiada pede a declaração", () => {
    expect(problemaDoValeBrinde({ metodoApuracao: "federal_direta", declaraValeBrinde: false }, true)).toBe(PROBLEMA_SEM_DECLARACAO_VALE_BRINDE);
    expect(problemaDoValeBrinde({ metodoApuracao: "federal_direta", declaraValeBrinde: true }, true)).toBeNull();
  });
  it("sem cota premiada, ou rifa de antes (sem método), não pede", () => {
    expect(problemaDoValeBrinde({ metodoApuracao: "federal_direta", declaraValeBrinde: false }, false)).toBeNull();
    expect(problemaDoValeBrinde({ metodoApuracao: null, declaraValeBrinde: false }, true)).toBeNull();
  });
});

describe("5.6: sócios e diretores", () => {
  it("aceita nome, cargo e CPF válido; guarda só os dígitos", () => {
    expect(validarSocio({ nome: "  Maria   da Silva ", cargo: "socio", cpf: "529.982.247-25", extra: 1 })).toEqual({
      nome: "Maria da Silva",
      cargo: "socio",
      cpf: "52998224725",
    });
  });
  it("recusa CPF inválido, cargo desconhecido e nome curto ou com número", () => {
    expect(() => validarSocio({ nome: "Maria", cargo: "socio", cpf: "111.111.111-11" })).toThrow(SocioInvalido);
    expect(() => validarSocio({ nome: "Maria", cargo: "dono", cpf: "52998224725" })).toThrow(SocioInvalido);
    expect(() => validarSocio({ nome: "Ma", cargo: "socio", cpf: "52998224725" })).toThrow(SocioInvalido);
    expect(() => validarSocio({ nome: "Maria 2", cargo: "socio", cpf: "52998224725" })).toThrow(SocioInvalido);
  });
  it("a tela vê só o final do CPF", () => {
    expect(cpfMascarado("25")).toBe("•••.•••.•••-25");
  });
});

describe("2.5: entidade beneficiada com documentos", () => {
  const base = { nome: "Instituto Esperança", texto: "Atende crianças desde 2001.", cnpj: "11.222.333/0001-81" };
  it("exige CNPJ válido e guarda só os dígitos", () => {
    expect(validarEntidade(base).cnpj).toBe("11222333000181");
    expect(() => validarEntidade({ ...base, cnpj: "11.222.333/0001-80" })).toThrow(EntidadeInvalida);
    expect(() => validarEntidade({ ...base, cnpj: undefined })).toThrow(EntidadeInvalida);
  });
  it("CNPJ, ata e certidão são obrigatórios; o CEBAS não", () => {
    expect(documentosQueFaltam(["cebas"])).toEqual(["cnpj", "ata", "certidao"]);
    expect(situacaoDepoisDoEnvio(["cnpj", "ata"])).toBe("pendente");
    expect(situacaoDepoisDoEnvio(["cnpj", "ata", "certidao"])).toBe("em_analise");
  });
  it("a decisão pede a versão e, para recusar, o motivo", () => {
    const versao = new Date().toISOString();
    expect(validarDecisaoDaEntidade({ status: "aprovado", versao, motivo: "x" })).toEqual({ status: "aprovado", motivo: null, versao });
    expect(() => validarDecisaoDaEntidade({ status: "recusado", versao })).toThrow(EntidadeInvalida);
    expect(() => validarDecisaoDaEntidade({ status: "aprovado" })).toThrow(EntidadeInvalida);
    expect(() => validarDecisaoDaEntidade({ status: "talvez", versao })).toThrow(EntidadeInvalida);
  });
});
