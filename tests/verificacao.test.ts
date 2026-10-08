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
  CONSENTIMENTO_BIOMETRICO_VERSAO,
  chaveDoConsentimento,
  textoDoConsentimentoBiometrico,
  consentimentoVigente,
  precisaRenovarConsentimento,
  prazoParaRenovarConsentimento,
  CONSENTIMENTO_BIOMETRICO_DESDE,
  PRAZO_PARA_RENOVAR_CONSENTIMENTO_DIAS,
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
    // Pessoa sem a autorização da comparação: falta; organização não compara foto.
    expect(faltaNaVerificacao("apostador", { temDados: true, documentos: docs, temFoto: true, temConsentimento: false })[0]).toMatch(/autorização/);
    expect(faltaNaVerificacao("apostador", { temDados: true, documentos: docs, temFoto: true, temConsentimento: true })).toEqual([]);
    expect(faltaNaVerificacao("organizacao", { temDados: true, documentos: [...docs, "cartao_cnpj", "comprovante_endereco"], temFoto: false, temConsentimento: false })).toEqual([]);
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

describe("consentimento biométrico", () => {
  it("o texto diz finalidade, compartilhamento e retenção (resposta 7.1), que é opcional e como revogar", () => {
    const t = textoDoConsentimentoBiometrico({ automatico: false }).join(" ");
    expect(t).toMatch(/Finalidade: .*verificação de identidade e prevenção a fraudes/);
    expect(t).toMatch(/LGPD, arts\. 8º e 11, I/);
    // Revisão formal do advogado (08/10/2026): o que dá para sustentar.
    expect(t).toMatch(/Compartilhamento: .*uma pessoa da plataforma.*não são compartilhadas com terceiros para a finalidade de comparação/);
    expect(t).not.toMatch(/ninguém de fora/);
    expect(t).toMatch(/Retenção: a plataforma não guarda nenhum modelo ou medida do rosto .*só o resultado \(verificado ou não\), enquanto a conta existir/);
    expect(t).toMatch(/ao excluir a conta, a verificação, o resultado e os documentos são apagados/);
    // O encarregado (LGPD, art. 41, § 1º): sem ele publicado, aponta a Privacidade.
    expect(t).toMatch(/encarregado .*Política de privacidade/);
    const comEncarregado = textoDoConsentimentoBiometrico({ automatico: false, encarregado: { nome: "Ana", contato: "dpo@exemplo.com.br" } }).join(" ");
    expect(comEncarregado).toContain("O encarregado pelo tratamento de dados é Ana e pode ser contatado em dpo@exemplo.com.br");
    expect(t).not.toMatch(/grau de semelhança/);
    expect(t).toMatch(/documentos ficam cifrados/);
    expect(t).toMatch(/opcional/);
    expect(t).toMatch(/revogar/);
    expect(t).not.toMatch(/transferência internacional/);
  });
  it("com o comparador automático, a AWS e a transferência internacional com a frase do advogado (7.2)", () => {
    const t = textoDoConsentimentoBiometrico({ automatico: true }).join(" ");
    expect(t).toMatch(/Amazon Web Services \(Amazon Rekognition\)/);
    // "Não as guarda" só volta depois de confirmado o contrato da AWS (o
    // opt-out de uso dos dados pelo Rekognition): até lá, operadora nos termos do contrato.
    expect(t).not.toMatch(/não as guarda/);
    expect(t).toMatch(/atua como operadora: .*nos termos do contrato dela com a plataforma/);
    expect(t).toContain(
      "consinto expressamente com a transferência internacional das imagens para processamento nos servidores da Amazon Web Services (AWS) localizados no exterior, exclusivamente para a finalidade de verificação automatizada (LGPD, art. 33, VIII).",
    );
  });
  it("só vale o consentimento da versão em vigor; verificado com o antigo precisa renovar (7.3)", () => {
    expect(CONSENTIMENTO_BIOMETRICO_VERSAO).toBe(5);
    expect(consentimentoVigente(`${CONSENTIMENTO_BIOMETRICO_VERSAO}:manual`)).toBe(true);
    expect(consentimentoVigente(`${CONSENTIMENTO_BIOMETRICO_VERSAO}:automatico`)).toBe(true);
    expect(consentimentoVigente("2:manual")).toBe(false);
    expect(consentimentoVigente(null)).toBe(false);
    expect(consentimentoVigente("30:manual")).toBe(false);
    expect(precisaRenovarConsentimento("verificado", "2:automatico")).toBe(true);
    expect(precisaRenovarConsentimento("verificado", null)).toBe(true);
    expect(precisaRenovarConsentimento("verificado", `${CONSENTIMENTO_BIOMETRICO_VERSAO}:manual`)).toBe(false);
    expect(precisaRenovarConsentimento("em_analise", "2:manual")).toBe(false);
    expect(prazoParaRenovarConsentimento().getTime() - Date.parse(CONSENTIMENTO_BIOMETRICO_DESDE)).toBe(PRAZO_PARA_RENOVAR_CONSENTIMENTO_DIAS * 86_400_000);
  });
  it("a chave muda com a versão e o modo: o servidor recusa texto diferente do lido", () => {
    expect(chaveDoConsentimento({ automatico: false })).toBe(`${CONSENTIMENTO_BIOMETRICO_VERSAO}:manual`);
    expect(chaveDoConsentimento({ automatico: true })).not.toBe(chaveDoConsentimento({ automatico: false }));
  });
});
