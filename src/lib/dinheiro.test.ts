import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { decimal, multiplicar, paraCentavos, percentualDe } from "@/lib/dinheiro";

describe("multiplicar", () => {
  test("mantém a precisão que o float perderia", () => {
    // 0.1 * 3 em float dá 0.30000000000000004.
    assert.equal(multiplicar("0.10", 3).toString(), "0.3");
    assert.equal(multiplicar("10.10", 3).toString(), "30.3");
  });

  test("calcula o total de uma compra comum", () => {
    assert.equal(multiplicar("25.00", 7).toString(), "175");
  });
});

describe("percentualDe", () => {
  test("calcula a comissão do afiliado", () => {
    assert.equal(percentualDe("100.00", "10").toString(), "10");
    assert.equal(percentualDe("250.00", "15").toString(), "37.5");
  });

  test("arredonda para centavos, sem sobrar fração de centavo", () => {
    // 10% de 33.33 = 3.333 -> a casa extra não pode ir para o banco.
    assert.equal(percentualDe("33.33", "10").toString(), "3.33");
    assert.equal(percentualDe("0.05", "50").toString(), "0.03");
  });

  test("comissão zero não vira valor negativo nem NaN", () => {
    assert.equal(percentualDe("100.00", "0").toString(), "0");
  });

  test("a soma das comissões confere com o total, sem desvio acumulado", () => {
    const compras = ["19.90", "19.90", "19.90", "19.90", "19.90"];
    const soma = compras.reduce((total, valor) => total.add(percentualDe(valor, "10")), decimal(0));
    // 10% de 19.90 = 1.99 exatos; cinco compras = 9.95.
    assert.equal(soma.toString(), "9.95");
  });
});

describe("paraCentavos", () => {
  test("converte para inteiro sem erro de arredondamento", () => {
    assert.equal(paraCentavos("19.90"), 1990);
    assert.equal(paraCentavos("0.07"), 7);
    // 1.005 em float vira 100.49999...; o Decimal preserva o valor exato.
    assert.equal(paraCentavos("1.005"), 100.5);
  });
});
