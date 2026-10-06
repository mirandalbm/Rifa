import { describe, expect, it } from "vitest";
import {
  bloqueioDoContrato,
  CONTRATO_MAX,
  CONTRATO_MIN,
  preencherContrato,
  problemaNoPreenchimento,
  validarContrato,
  versaoLida,
} from "@shared/contratoPromotora";
import { EMPRESA_VAZIA } from "@shared/legal";

const EMPRESA = {
  ...EMPRESA_VAZIA,
  razaoSocial: "Rifas Brasil Tecnologia Ltda.",
  cnpj: "11222333000181",
  endereco: "Rua A, 1 — Recife/PE",
  contato: "contato@exemplo.com.br",
};

describe("contrato da promotora", () => {
  it("guarda só o texto, sem espaço nas pontas e com quebra de linha única", () => {
    const corpo = "a".repeat(CONTRATO_MIN - 1);
    expect(validarContrato({ texto: `  ${corpo}\r\nb  `, outro: "x" })).toEqual({ texto: `${corpo}\nb` });
  });

  it("recusa texto curto, longo ou que não é texto", () => {
    expect(() => validarContrato({ texto: "curto" })).toThrow(/pelo menos/);
    expect(() => validarContrato({ texto: "a".repeat(CONTRATO_MAX + 1) })).toThrow(/passa de/);
    expect(() => validarContrato({ texto: 12 })).toThrow(/Cole o texto/);
    expect(() => validarContrato(null)).toThrow(/Cole o texto/);
  });

  it("a versão lida é inteiro positivo", () => {
    expect(versaoLida("3")).toBe(3);
    for (const v of [0, -1, 1.5, "abc", undefined, null]) expect(() => versaoLida(v)).toThrow(/versão/);
  });

  it("o bloqueio diz a versão e onde aceitar", () => {
    expect(bloqueioDoContrato(2)).toMatch(/versão 2.*Configurações/);
  });

  it("preenche os campos com os dados da empresa, no marcador e nos colchetes do advogado", () => {
    const modelo =
      "Entre a Plataforma [RAZÃO SOCIAL DA PLATAFORMA], inscrita no CNPJ sob o nº [00.000.000/0001-00], " +
      "com sede em {{ENDERECO}} e contato {{ email }}, e {{RAZAO_SOCIAL}}.";
    const p = preencherContrato(modelo, EMPRESA);
    expect(p.texto).toBe(
      "Entre a Plataforma Rifas Brasil Tecnologia Ltda., inscrita no CNPJ sob o nº 11.222.333/0001-81, " +
        "com sede em Rua A, 1 — Recife/PE e contato contato@exemplo.com.br, e Rifas Brasil Tecnologia Ltda..",
    );
    expect(problemaNoPreenchimento(p)).toBeNull();
  });

  it("sem o dado na empresa, o campo fica e a publicação diz o que falta", () => {
    const p = preencherContrato("Plataforma {{RAZAO_SOCIAL}}, CNPJ [CNPJ DA PLATAFORMA].", EMPRESA_VAZIA);
    expect(p.faltando.sort()).toEqual(["CNPJ", "RAZAO_SOCIAL"]);
    expect(p.texto).toContain("{{RAZAO_SOCIAL}}");
    expect(problemaNoPreenchimento(p)).toMatch(/Dados da empresa.*Razão social/);
  });

  it("campo que a plataforma não conhece barra; colchete de texto comum fica", () => {
    const p = preencherContrato("Sócio [NOME DO SÓCIO] e {{TELEFONE}}; o texto [sic] continua.", EMPRESA);
    expect(p.desconhecidos.sort()).toEqual(["[NOME DO SÓCIO]", "{{TELEFONE}}"]);
    expect(p.texto).toContain("[sic]");
    expect(problemaNoPreenchimento(p)).toMatch(/não sabe preencher/);
  });

  it("texto sem campo nenhum passa como está", () => {
    const p = preencherContrato("Contrato (ex: Pix direto) sem campos.", EMPRESA_VAZIA);
    expect(p).toEqual({ texto: "Contrato (ex: Pix direto) sem campos.", faltando: [], desconhecidos: [] });
  });
});
