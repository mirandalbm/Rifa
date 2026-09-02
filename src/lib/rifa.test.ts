import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  digitosDaRifa,
  formatarNumero,
  gerarCodigoCompra,
  numeroVencedorPelaFederal,
  premiosNecessarios,
} from "@/lib/rifa";

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

describe("numeroVencedorPelaFederal — rifas grandes", () => {
  test("diz quantos prêmios cada tamanho exige", () => {
    assert.equal(premiosNecessarios(1_000), 1);
    assert.equal(premiosNecessarios(100_000), 1);
    assert.equal(premiosNecessarios(1_000_000), 2);
    assert.equal(premiosNecessarios(10_000_000), 2);
  });

  test("recusa apurar rifa grande com um prêmio só", () => {
    // O erro é proposital: com 5 dígitos, 90% dos números de uma rifa de 1
    // milhão jamais sairiam, e ninguém perceberia a injustiça.
    assert.throws(
      () => numeroVencedorPelaFederal("47382", 1_000_000),
      /precisa de 2 prêmios/,
    );
  });

  test("combina os prêmios com o 1º nas casas finais", () => {
    // 2º prêmio 12 + 1º prêmio 47382 → 1247382 numa rifa de 10 milhões.
    assert.equal(numeroVencedorPelaFederal(["47382", "00012"], 10_000_000), 1_247_382);
    assert.equal(numeroVencedorPelaFederal(["00001", "00000"], 10_000_000), 1);
  });

  test("todo número da faixa passa a ser alcançável", () => {
    // Era o bug: antes, o maior sorteável numa rifa de 10 milhões era 99.999.
    const maximo = numeroVencedorPelaFederal(["99999", "99999"], 10_000_000);
    assert.ok(maximo > 9_000_000, `maior número sorteável foi ${maximo}`);
  });

  test("prêmios sobrando são ignorados sem alterar o resultado", () => {
    const comDois = numeroVencedorPelaFederal(["47382", "00012"], 10_000_000);
    const comQuatro = numeroVencedorPelaFederal(["47382", "00012", "55555", "77777"], 10_000_000);
    assert.equal(comQuatro, comDois);
  });

  test("segue aceitando um prêmio avulso em rifa pequena", () => {
    assert.equal(numeroVencedorPelaFederal("47382", 1000), 382);
    assert.equal(numeroVencedorPelaFederal(["47382"], 1000), 382);
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
