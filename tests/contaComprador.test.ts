import { describe, it, expect } from "vitest";
import {
  tipoDoIdentificador,
  problemaNoCadastro,
  pedidoVisivel,
  podePedirReembolso,
} from "@shared/contaComprador";

const ok = {
  nome: "Maria da Silva",
  telefone: "(11) 98888-7777",
  cpf: "529.982.247-25",
  cep: "01310-100",
  senha: "segredo-forte-1",
};

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
    expect(problemaNoCadastro({ ...ok, cep: "0131" })).toMatch(/CEP/);
  });
  it("recusa e-mail malformado e senha fraca", () => {
    expect(problemaNoCadastro({ ...ok, email: "maria@" })).toMatch(/E-mail/);
    expect(problemaNoCadastro({ ...ok, senha: "curta" })).toMatch(/8 caracteres/);
    expect(problemaNoCadastro({ ...ok, senha: "12345678" })).toMatch(/conhecida/);
  });
});

describe("o que a conta enxerga e o que pode reembolsar", () => {
  const antes = new Date("2026-09-01T12:00:00Z");
  const vinculo = new Date("2026-09-10T12:00:00Z");
  const depois = new Date("2026-09-20T12:00:00Z");
  const nada = { telefoneConfirmado: false, comprasVinculadasEm: null };
  const peloCpf = { telefoneConfirmado: false, comprasVinculadasEm: vinculo };
  const peloTelefone = { telefoneConfirmado: true, comprasVinculadasEm: null };

  it("compra feita dentro da conta aparece sempre", () => {
    expect(pedidoVisivel({ viaConta: true, createdAt: depois }, nada)).toBe(true);
  });

  it("compra antiga aparece quando o CPF dela bateu no cadastro", () => {
    expect(pedidoVisivel({ viaConta: false, createdAt: antes }, peloCpf)).toBe(true);
    expect(pedidoVisivel({ viaConta: false, createdAt: antes }, nada)).toBe(false);
  });

  it("o vínculo pelo CPF não alcança compra feita sem entrar depois dele", () => {
    expect(pedidoVisivel({ viaConta: false, createdAt: depois }, peloCpf)).toBe(false);
  });

  it("telefone provado mostra tudo do telefone", () => {
    expect(pedidoVisivel({ viaConta: false, createdAt: depois }, peloTelefone)).toBe(true);
  });

  it("reembolso pelo vínculo do CPF só de Pix online (o dinheiro volta para quem pagou)", () => {
    expect(podePedirReembolso({ viaConta: false, createdAt: antes, method: "pix_online" }, peloCpf)).toBe(true);
    expect(podePedirReembolso({ viaConta: false, createdAt: antes, method: "dinheiro" }, peloCpf)).toBe(false);
    expect(podePedirReembolso({ viaConta: false, createdAt: antes, method: "dinheiro" }, peloTelefone)).toBe(true);
  });
});
