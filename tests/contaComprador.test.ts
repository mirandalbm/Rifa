import { describe, it, expect } from "vitest";
import { tipoDoIdentificador, problemaNoCadastro, pedidoVisivel } from "@shared/contaComprador";

const ok = { nome: "Maria da Silva", telefone: "(11) 98888-7777", cpf: "529.982.247-25", senha: "segredo-forte-1" };

describe("identificador de login", () => {
  it("e-mail, telefone e CPF", () => {
    expect(tipoDoIdentificador("maria@exemplo.com")).toBe("email");
    expect(tipoDoIdentificador("(11) 98888-7777")).toBe("digitos");
    expect(tipoDoIdentificador("529.982.247-25")).toBe("digitos");
  });
  it("recusa o que não é nenhum dos três", () => {
    expect(tipoDoIdentificador("maria@")).toBeNull();
    expect(tipoDoIdentificador("123")).toBeNull();
    expect(tipoDoIdentificador("")).toBeNull();
  });
});

describe("cadastro do apostador", () => {
  it("aceita o cadastro completo, com ou sem e-mail", () => {
    expect(problemaNoCadastro(ok)).toBeNull();
    expect(problemaNoCadastro({ ...ok, email: "maria@exemplo.com" })).toBeNull();
  });
  it("exige nome, WhatsApp com DDD e CPF válido", () => {
    expect(problemaNoCadastro({ ...ok, nome: "Ma" })).toMatch(/nome/);
    expect(problemaNoCadastro({ ...ok, telefone: "98888-7777" })).toMatch(/DDD/);
    expect(problemaNoCadastro({ ...ok, cpf: "111.111.111-11" })).toMatch(/CPF/);
  });
  it("recusa e-mail malformado e senha fraca", () => {
    expect(problemaNoCadastro({ ...ok, email: "maria@" })).toMatch(/E-mail/);
    expect(problemaNoCadastro({ ...ok, senha: "curta" })).toMatch(/8 caracteres/);
    expect(problemaNoCadastro({ ...ok, senha: "12345678" })).toMatch(/conhecida/);
  });
});

describe("o que a conta enxerga", () => {
  it("compra feita dentro da conta aparece sempre", () => {
    expect(pedidoVisivel({ viaConta: true }, false)).toBe(true);
  });
  it("compra só pelo telefone exige o telefone confirmado", () => {
    expect(pedidoVisivel({ viaConta: false }, false)).toBe(false);
    expect(pedidoVisivel({ viaConta: false }, true)).toBe(true);
  });
});
