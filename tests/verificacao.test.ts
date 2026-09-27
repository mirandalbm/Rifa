import { describe, expect, it } from "vitest";
import {
  CORES_DO_SELO_PADRAO,
  LIMIAR_ROSTO,
  PALETA_DO_SELO,
  decisaoDoRosto,
  faltaNaVerificacao,
  validarCoresDoSelo,
  validarDadosDaVerificacao,
  validarPix,
} from "@shared/verificacao";
import { CONTRASTE_MIN, FUNDO, contraste } from "@shared/template";
import { cnpjValido } from "@shared/format";
import { temEmoji } from "@shared/comentarios";
import { CONFIG_PADRAO, validarConfigPlataforma } from "@shared/plataforma";

const pessoa = {
  nomeCompleto: "Ana Paula Souza",
  cpf: "529.982.247-25",
  rg: "12.345.678-9",
  nascimento: "1990-05-10",
  conta: { banco: "260", agencia: "0001", conta: "1234567-8", tipo: "corrente" },
  pix: { tipo: "email", chave: "Ana@Exemplo.com.br" },
};

describe("paleta do selo", () => {
  it("tem 12 cores, todas com contraste nos dois temas e com o sinal branco", () => {
    const cores = Object.values(PALETA_DO_SELO);
    expect(cores).toHaveLength(12);
    for (const c of cores) {
      expect(contraste(c.hex, FUNDO.claro), c.nome).toBeGreaterThanOrEqual(CONTRASTE_MIN);
      expect(contraste(c.hex, FUNDO.escuro), c.nome).toBeGreaterThanOrEqual(CONTRASTE_MIN);
      expect(contraste(c.hex, "#ffffff"), c.nome).toBeGreaterThanOrEqual(CONTRASTE_MIN);
    }
  });

  it("padrão: apostador verde, afiliado roxo, organização azul", () => {
    expect(CORES_DO_SELO_PADRAO).toEqual({ apostador: "verde", afiliado: "roxo", organizacao: "azul" });
    expect(CONFIG_PADRAO.coresDoSelo).toEqual(CORES_DO_SELO_PADRAO);
  });

  it("só cor da paleta, e três cores diferentes", () => {
    expect(validarCoresDoSelo({ apostador: "laranja" })).toEqual({ ...CORES_DO_SELO_PADRAO, apostador: "laranja" });
    expect(() => validarCoresDoSelo({ apostador: "#ff0000" })).toThrow(/paleta/);
    expect(() => validarCoresDoSelo({ apostador: "azul" })).toThrow(/diferente/);
    expect(() => validarConfigPlataforma({ coresDoSelo: { afiliado: "verde" } as never })).toThrow(/diferente/);
  });
});

describe("Pix", () => {
  it("normaliza cada tipo", () => {
    expect(validarPix({ tipo: "cpf", chave: "529.982.247-25" })).toEqual({ tipo: "cpf", chave: "52998224725" });
    expect(validarPix({ tipo: "cnpj", chave: "11.222.333/0001-81" }).chave).toBe("11222333000181");
    expect(validarPix({ tipo: "email", chave: " Ana@Exemplo.com " }).chave).toBe("ana@exemplo.com");
    expect(validarPix({ tipo: "telefone", chave: "(11) 98765-4321" }).chave).toBe("+5511987654321");
    expect(validarPix({ tipo: "aleatoria", chave: "123E4567-E89B-12D3-A456-426614174000" }).chave).toBe("123e4567-e89b-12d3-a456-426614174000");
  });
  it("recusa o que não tem o formato", () => {
    expect(() => validarPix({ tipo: "cpf", chave: "111.111.111-11" })).toThrow();
    expect(() => validarPix({ tipo: "telefone", chave: "1133334444" })).toThrow();
    expect(() => validarPix({ tipo: "email", chave: "ana@" })).toThrow();
    expect(() => validarPix({ tipo: "aleatoria", chave: "abc" })).toThrow();
    expect(() => validarPix({ tipo: "boleto", chave: "x" })).toThrow();
  });
});

describe("CNPJ", () => {
  it("confere os dígitos", () => {
    expect(cnpjValido("11.222.333/0001-81")).toBe(true);
    expect(cnpjValido("11.222.333/0001-82")).toBe(false);
    expect(cnpjValido("00000000000000")).toBe(false);
  });
});

describe("dados da verificação", () => {
  it("pessoa: identificação, conta e Pix; só chaves conhecidas", () => {
    const d = validarDadosDaVerificacao("apostador", { ...pessoa, extra: "x" });
    expect(d).toEqual({
      nomeCompleto: "Ana Paula Souza",
      cpf: "52998224725",
      rg: "12.345.678-9",
      nascimento: "1990-05-10",
      conta: { banco: "260", agencia: "0001", conta: "12345678", tipo: "corrente" },
      pix: { tipo: "email", chave: "ana@exemplo.com.br" },
    });
    expect(() => validarDadosDaVerificacao("apostador", { ...pessoa, nascimento: "2015-01-01" })).toThrow(/18 anos/);
    expect(() => validarDadosDaVerificacao("afiliado", { ...pessoa, pix: undefined })).toThrow(/Pix/);
  });
  it("organização: razão social, CNPJ e o responsável", () => {
    const { conta, pix, ...ident } = pessoa;
    const d = validarDadosDaVerificacao("organizacao", { razaoSocial: "Rifas São José Ltda", cnpj: "11.222.333/0001-81", responsavel: ident, conta, pix });
    expect("responsavel" in d && d.responsavel.cpf).toBe("52998224725");
    expect(() => validarDadosDaVerificacao("organizacao", { razaoSocial: "X Ltda", cnpj: "1", responsavel: ident, conta, pix })).toThrow(/CNPJ/);
  });
  it("o que falta: pessoa precisa de foto; o CPF em documento é opcional", () => {
    const docs = ["identidade_frente", "identidade_verso"];
    expect(faltaNaVerificacao("apostador", { temDados: true, documentos: docs, temFoto: true })).toEqual([]);
    expect(faltaNaVerificacao("apostador", { temDados: true, documentos: docs, temFoto: false })[0]).toMatch(/foto/);
    expect(faltaNaVerificacao("organizacao", { temDados: true, documentos: docs, temFoto: false })).toHaveLength(2);
    expect(faltaNaVerificacao("organizacao", { temDados: true, documentos: [...docs, "cartao_cnpj", "comprovante_endereco"], temFoto: false })).toEqual([]);
  });
});

describe("comparador de rosto", () => {
  it("verifica sozinho só acima do limiar; o resto vai para uma pessoa", () => {
    expect(decisaoDoRosto(LIMIAR_ROSTO)).toBe("verificado");
    expect(decisaoDoRosto(LIMIAR_ROSTO - 1)).toBe("manual");
    expect(decisaoDoRosto(null)).toBe("manual");
  });
});

describe("emoji é de perfil verificado", () => {
  it("reconhece emoji, não texto nem número", () => {
    expect(temEmoji("que prêmio 🔥")).toBe(true);
    expect(temEmoji("❤️")).toBe(true);
    expect(temEmoji("Boa sorte a todos! :) 100%")).toBe(false);
  });
});
