import { describe, expect, it } from "vitest";
import { CADASTRO_DE_EXEMPLO, erroDoCampoDoCadastro } from "@/lib/cadastro";
import { problemaNoCadastro } from "@shared/contaComprador";

describe("erro de cada campo do Criar conta (tela 24)", () => {
  it("o cadastro de exemplo passa na régua: sem isso a tela não sabe de que campo é o erro", () => {
    expect(problemaNoCadastro(CADASTRO_DE_EXEMPLO)).toBeNull();
  });

  it("cada campo leva a mensagem da própria régua, embaixo dele", () => {
    expect(erroDoCampoDoCadastro("nome", "A")).toBe("Informe seu nome completo.");
    expect(erroDoCampoDoCadastro("telefone", "123")).toBe("Informe o WhatsApp com DDD.");
    expect(erroDoCampoDoCadastro("cpf", "111.111.111-11")).toBe("Informe um CPF válido.");
    expect(erroDoCampoDoCadastro("cep", "123")).toBe("Informe o CEP (8 números).");
    expect(erroDoCampoDoCadastro("email", "sem-arroba")).toBe("E-mail inválido.");
    expect(erroDoCampoDoCadastro("senha", "curta")).toMatch(/pelo menos/);
    expect(erroDoCampoDoCadastro("apelido", "_ana")).toMatch(/^Apelido:/);
  });

  it("campo certo não tem erro, e o e-mail vazio passa (é opcional)", () => {
    expect(erroDoCampoDoCadastro("nome", "Bruno Lima")).toBeNull();
    expect(erroDoCampoDoCadastro("email", "")).toBeNull();
    expect(erroDoCampoDoCadastro("cpf", "52998224725")).toBeNull();
  });
});
