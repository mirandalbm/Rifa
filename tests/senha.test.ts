import { describe, it, expect } from "vitest";
import { senhaInvalida, minimoSenha, MIN_SENHA, MIN_SENHA_ADMIN } from "../shared/senha";

describe("regra de senha", () => {
  it("administrador geral pede mais que os outros papéis", () => {
    expect(minimoSenha("admin")).toBe(MIN_SENHA_ADMIN);
    for (const papel of ["organizer", "affiliate", "cambista"]) {
      expect(minimoSenha(papel)).toBe(MIN_SENHA);
    }
    expect(MIN_SENHA_ADMIN).toBeGreaterThan(MIN_SENHA);
  });

  it("recusa curta, aceita no limite", () => {
    expect(senhaInvalida("a".repeat(MIN_SENHA - 1), "organizer")).toMatch(/pelo menos/);
    expect(senhaInvalida("xk2#pq9z", "organizer")).toBeNull();
    expect(senhaInvalida("xk2#pq9z", "admin")).toMatch(/12/);
    expect(senhaInvalida("xk2#pq9zmn4v", "admin")).toBeNull();
  });

  it("recusa as senhas mais vazadas, sem ligar para maiúscula", () => {
    expect(senhaInvalida("12345678", "organizer")).toMatch(/conhecida/);
    expect(senhaInvalida("SENHA123", "cambista")).toMatch(/conhecida/);
    expect(senhaInvalida("123456789012", "admin")).toMatch(/conhecida/);
  });

  it("recusa senha absurda de longa", () => {
    expect(senhaInvalida("a".repeat(201), "organizer")).toMatch(/longa/);
  });
});
