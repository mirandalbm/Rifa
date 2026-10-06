import { describe, expect, it } from "vitest";
import { MENSAGEM_DINHEIRO, problemaNoPremio } from "../shared/premio";

describe("prêmio da rifa autorizada (resposta 5 do advogado)", () => {
  it("recusa dinheiro: Pix, espécie, transferência e a quantia sozinha", () => {
    for (const t of ["R$ 1.000 no Pix", "PIX de 500", "Dinheiro na conta", "R$ 50", "R$ 1.000,00", "500 reais", "Transferência de R$ 2 mil", "Prêmio em espécie", "Depósito em conta"]) {
      expect(problemaNoPremio(t, true), t).toBe(MENSAGEM_DINHEIRO);
    }
  });

  it("aceita bem e serviço, inclusive com o valor do bem", () => {
    for (const t of ["Moto Honda CG 160 0 km", "Moto avaliada em R$ 15.000", "iPhone 16 Pro", "Viagem para Gramado", "Vale-compras de R$ 500 na loja X", "Armário de cozinha", "Smart TV 55\"", "Fumódromo"]) {
      expect(problemaNoPremio(t, true), t).toBeNull();
    }
  });

  it("recusa item proibido pelo Decreto 70.951/72, como palavra inteira e sem acento", () => {
    expect(problemaNoPremio("Kit churrasco com cerveja", true)).toMatch(/bebida alcoólica/);
    expect(problemaNoPremio("Cesta com VINHOS", true)).toMatch(/bebida alcoólica/);
    expect(problemaNoPremio("Remédio", true)).toMatch(/medicamento/);
    expect(problemaNoPremio("Pistola", true)).toMatch(/arma/);
    expect(problemaNoPremio("Fogos de artifício", true)).toMatch(/explosivo/);
    expect(problemaNoPremio("Vape descartável", true)).toMatch(/fumo/);
  });

  it("rifa de antes, sem método, segue como era", () => {
    expect(problemaNoPremio("R$ 1.000 no Pix", false)).toBeNull();
  });
});
