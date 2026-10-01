import { describe, expect, it } from "vitest";
import { abaDoTeclado, abaInicial } from "../shared/abas";

const ids = ["conta", "organizacao", "vendas"];
const ancoras = { verificacao: "organizacao" };

describe("abas do painel", () => {
  it("a aba do endereço vence", () => {
    expect(abaInicial(ids, { search: "?aba=vendas", hash: "" }, ancoras)).toBe("vendas");
    expect(abaInicial(ids, { search: "?aba=vendas", hash: "#verificacao" }, ancoras)).toBe("vendas");
  });

  it("sem endereço, a âncora de um link antigo abre a aba do cartão dela", () => {
    expect(abaInicial(ids, { search: "", hash: "#verificacao" }, ancoras)).toBe("organizacao");
  });

  it("sem nada, ou com lixo, a primeira — nunca tela vazia", () => {
    expect(abaInicial(ids, { search: "", hash: "" }, ancoras)).toBe("conta");
    expect(abaInicial(ids, { search: "?aba=sumiu", hash: "#nada" }, ancoras)).toBe("conta");
    expect(abaInicial(ids, { search: "?aba=", hash: "" }, ancoras)).toBe("conta");
    // âncora que aponta para uma aba que não existe mais
    expect(abaInicial(ids, { search: "", hash: "#verificacao" }, { verificacao: "removida" })).toBe("conta");
  });

  it("o teclado anda com as setas, dá a volta e salta com Home e End", () => {
    expect(abaDoTeclado("ArrowRight", 0, 3)).toBe(1);
    expect(abaDoTeclado("ArrowRight", 2, 3)).toBe(0);
    expect(abaDoTeclado("ArrowLeft", 0, 3)).toBe(2);
    expect(abaDoTeclado("Home", 2, 3)).toBe(0);
    expect(abaDoTeclado("End", 0, 3)).toBe(2);
    expect(abaDoTeclado("Enter", 0, 3)).toBeNull();
  });
});
