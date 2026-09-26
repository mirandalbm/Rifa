import { describe, it, expect } from "vitest";
import { clienteNoPainel, clienteVisivel, rotuloDoCliente } from "@shared/titularidade";

const maria = { nome: "Maria da Silva", telefone: "11988887777", cpf: "529.982.247-25", email: "m@x.com", codigo: "C-7K2M9QXR" };
const org = { daPlataforma: false, vendaDeCambista: false, ganhador: false };

describe("de quem é o cliente no painel", () => {
  it("cliente da plataforma aparece para o organizador só pelo ID", () => {
    const c = clienteNoPainel(maria, org);
    expect(c).toMatchObject({ nome: "Cliente C-7K2M9QXR", telefone: null, cpf: null, email: null, completo: false });
    expect(JSON.stringify(c)).not.toMatch(/Maria|88887777|529/);
  });

  it("cliente do cambista aparece completo", () => {
    expect(clienteNoPainel(maria, { ...org, vendaDeCambista: true })).toMatchObject({ nome: "Maria da Silva", completo: true });
  });

  it("o ganhador aparece completo: o promotor entrega o prêmio", () => {
    expect(clienteVisivel({ ...org, ganhador: true })).toBe(true);
  });

  it("a plataforma vê todos", () => {
    expect(clienteNoPainel(maria, { ...org, daPlataforma: true }).completo).toBe(true);
  });

  it("sem ID ainda, o rótulo não fica vazio", () => {
    expect(rotuloDoCliente(null)).toBe("Cliente da plataforma");
  });
});
