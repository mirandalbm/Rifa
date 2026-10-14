import { describe, expect, it } from "vitest";
import { MARCADOS_MAX, avisoDaMarcacao, validarMarcados } from "../shared/marcacoes";

describe("marcar pessoas: validação da lista", () => {
  it("sem lista, não marca ninguém", () => {
    expect(validarMarcados(undefined)).toEqual({ ok: true, apelidos: [] });
    expect(validarMarcados(null)).toEqual({ ok: true, apelidos: [] });
    expect(validarMarcados([])).toEqual({ ok: true, apelidos: [] });
  });

  it("tira o @, põe em minúsculas e não repete", () => {
    expect(validarMarcados(["@Ana.Souza", "ana.souza", "@joao"])).toEqual({ ok: true, apelidos: ["ana.souza", "joao"] });
  });

  it(`aceita até ${MARCADOS_MAX} pessoas e recusa mais`, () => {
    const cinco = ["a1", "b2", "c3", "d4", "e5"].map((x) => `pessoa${x}`);
    expect(validarMarcados(cinco).ok).toBe(true);
    const seis = [...cinco, "pessoaf6"];
    const r = validarMarcados(seis);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.erro).toContain(`até ${MARCADOS_MAX}`);
  });

  it("recusa apelido inválido com a mesma régua do apelido", () => {
    const r = validarMarcados(["x"]);
    expect(r.ok).toBe(false);
  });

  it("recusa o que não é lista", () => {
    expect(validarMarcados("@ana").ok).toBe(false);
    expect(validarMarcados({ a: 1 }).ok).toBe(false);
  });
});

describe("aviso de marcação", () => {
  it("diz quem marcou e a rifa, sem legenda, telefone nem CPF", () => {
    const a = avisoDaMarcacao("ana.souza", "Carro 0 km");
    expect(a.body).toContain("@ana.souza");
    expect(a.body).toContain("Carro 0 km");
    expect(a.body).toContain("só aparece no seu perfil depois que você aceitar");
    expect(a.body).not.toMatch(/\d{8,}/);
  });
});
