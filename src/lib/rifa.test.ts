import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { digitosDaRifa, formatarNumero, gerarCodigoCompra, numeroVencedorPelaFederal } from "@/lib/rifa";

describe("digitosDaRifa", () => {
  test("usa o maior número da rifa para definir as casas", () => {
    // 100 números vão de 0 a 99 — duas casas, não três.
    assert.equal(digitosDaRifa(100), 2);
    assert.equal(digitosDaRifa(1000), 3);
    assert.equal(digitosDaRifa(10000), 4);
  });

  test("arredonda para cima em tamanhos que não são potência de 10", () => {
    assert.equal(digitosDaRifa(500), 3);
    assert.equal(digitosDaRifa(50), 2);
  });
});

describe("formatarNumero", () => {
  test("preenche com zeros à esquerda conforme o tamanho da rifa", () => {
    assert.equal(formatarNumero(7, 1000), "007");
    assert.equal(formatarNumero(42, 1000), "042");
    assert.equal(formatarNumero(999, 1000), "999");
  });

  test("o zero é um número válido e aparece como tal", () => {
    assert.equal(formatarNumero(0, 1000), "000");
    assert.equal(formatarNumero(0, 100), "00");
  });
});

describe("numeroVencedorPelaFederal", () => {
  test("usa os últimos dígitos do 1º prêmio", () => {
    // Rifa de 1000 números lê as 3 últimas casas do prêmio.
    assert.equal(numeroVencedorPelaFederal("47382", 1000), 382);
    assert.equal(numeroVencedorPelaFederal("12345", 100), 45);
  });

  test("ignora pontuação que costuma vir no resultado divulgado", () => {
    assert.equal(numeroVencedorPelaFederal("47.382", 1000), 382);
    assert.equal(numeroVencedorPelaFederal("4 7 3 8 2", 1000), 382);
  });

  test("completa com zeros quando o prêmio tem menos dígitos que a rifa", () => {
    assert.equal(numeroVencedorPelaFederal("42", 1000), 42);
  });

  test("mantém o sorteio dentro da faixa em rifas que não são potência de 10", () => {
    // Rifa de 500 números: o sufixo 742 não existe, e volta ao início.
    assert.equal(numeroVencedorPelaFederal("99742", 500), 242);
    // O resultado nunca pode cair fora dos números vendidos.
    for (const premio of ["00000", "12345", "99999", "50000"]) {
      const vencedor = numeroVencedorPelaFederal(premio, 500);
      assert.ok(vencedor >= 0 && vencedor < 500, `${premio} gerou ${vencedor}, fora da faixa`);
    }
  });

  test("o prêmio terminado em zeros sorteia o número zero", () => {
    assert.equal(numeroVencedorPelaFederal("47000", 1000), 0);
  });

  test("recusa prêmio sem nenhum dígito", () => {
    assert.throws(() => numeroVencedorPelaFederal("", 1000));
    assert.throws(() => numeroVencedorPelaFederal("abc", 1000));
  });
});

describe("gerarCodigoCompra", () => {
  test("não repete em uso normal", () => {
    const codigos = new Set(Array.from({ length: 2000 }, gerarCodigoCompra));
    assert.equal(codigos.size, 2000);
  });

  test("evita os pares que mais confundem quem digita o código: I/1 e O/0", () => {
    for (let i = 0; i < 200; i++) {
      assert.doesNotMatch(gerarCodigoCompra(), /[IO01]/);
    }
  });

  test("começa com RF e tem tamanho fixo", () => {
    assert.match(gerarCodigoCompra(), /^RF[A-Z2-9]{10}$/);
  });
});
