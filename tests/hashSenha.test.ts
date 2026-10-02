import { randomBytes, scryptSync } from "node:crypto";
import { describe, expect, it } from "vitest";
import { CUSTO_DA_SENHA, hashCodigo, hashPassword, senhaPedeNovoHash, verifyPassword } from "../server/services/hashSenha";

describe("hash da senha", () => {
  it("grava no formato novo, com o custo no próprio hash, e confere", async () => {
    const h = await hashPassword("senha-forte-123");
    expect(h.startsWith(`s2$${CUSTO_DA_SENHA.N}$${CUSTO_DA_SENHA.r}$${CUSTO_DA_SENHA.p}$`)).toBe(true);
    expect(await verifyPassword("senha-forte-123", h)).toBe(true);
    expect(await verifyPassword("senha-errada", h)).toBe(false);
    expect(senhaPedeNovoHash(h)).toBe(false);
  });

  it("o custo é maior que o padrão do Node", () => {
    expect(CUSTO_DA_SENHA.N * CUSTO_DA_SENHA.r * CUSTO_DA_SENHA.p).toBeGreaterThan(2 ** 14 * 8 * 1);
  });

  it("a senha antiga (salt:chave, custo padrão) continua entrando e pede hash novo", async () => {
    const salt = randomBytes(16).toString("hex");
    const antigo = `${salt}:${scryptSync("minha-senha", salt, 64).toString("hex")}`;
    expect(await verifyPassword("minha-senha", antigo)).toBe(true);
    expect(await verifyPassword("outra", antigo)).toBe(false);
    expect(senhaPedeNovoHash(antigo)).toBe(true);
  });

  it("custo fora da faixa no hash guardado é recusado, sem calcular", async () => {
    const h = await hashPassword("x-senha-1");
    const [, , , , salt, chave] = h.split("$");
    expect(await verifyPassword("x-senha-1", `s2$${2 ** 24}$8$2$${salt}$${chave}`)).toBe(false);
    expect(await verifyPassword("x-senha-1", `s2$abc$8$2$${salt}$${chave}`)).toBe(false);
    expect(await verifyPassword("x-senha-1", "s2$65536$8$2$")).toBe(false);
    expect(await verifyPassword("x-senha-1", "lixo")).toBe(false);
    expect(await verifyPassword("x-senha-1", "!google")).toBe(false);
  });

  it("código de uso único fica no custo leve e confere", async () => {
    const h = await hashCodigo("123456");
    expect(h.includes(":")).toBe(true);
    expect(await verifyPassword("123456", h)).toBe(true);
  });
});
