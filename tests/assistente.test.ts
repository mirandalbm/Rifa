import { describe, expect, it, vi } from "vitest";
import { assinarAssistente, assistenteAberto, definirAssistenteAberto } from "../client/src/lib/assistente";

describe("assistente: coluna aberta ou fechada", () => {
  it("nasce fechada e avisa quem assina ao mudar", () => {
    expect(assistenteAberto()).toBe(false);
    const ouvinte = vi.fn();
    const sair = assinarAssistente(ouvinte);
    definirAssistenteAberto(true);
    expect(assistenteAberto()).toBe(true);
    expect(ouvinte).toHaveBeenCalledTimes(1);
    sair();
    definirAssistenteAberto(false);
    expect(ouvinte).toHaveBeenCalledTimes(1);
    expect(assistenteAberto()).toBe(false);
  });

  it("sem armazenamento no aparelho, não quebra", () => {
    // O vitest roda sem `localStorage`: definir e ler seguem funcionando.
    expect(() => definirAssistenteAberto(true)).not.toThrow();
    expect(assistenteAberto()).toBe(true);
    definirAssistenteAberto(false);
  });
});
