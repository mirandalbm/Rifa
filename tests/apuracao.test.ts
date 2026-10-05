import { describe, expect, it } from "vitest";
import {
  casasDaRifa,
  clausulaDaApuracao,
  lerFederal,
  metodosLiberadosGuardados,
  numeracaoZero,
  PREMIOS_DE_EXEMPLO,
  problemaNoMetodo,
  TOTAIS_DA_APURACAO,
  totalDaApuracao,
  validarMetodosLiberados,
} from "@shared/apuracao";
import { formatQuota, numeroInterno, numeroNaTela, quotaDigits } from "@shared/format";
import { montarRegulamento, type DadosDoRegulamento } from "@shared/regulamento";

describe("leitura direta da Loteria Federal (respostas 8.1 e 8.2 do advogado)", () => {
  const ex = [...PREMIOS_DE_EXEMPLO];

  it("os exemplos do advogado: 78.139, 139 e 678.139", () => {
    expect(lerFederal(ex, 100_000)).toMatchObject({ base: "78139", serie: null, numeroTexto: "78139", numero: 78139 });
    expect(lerFederal(ex, 1_000)).toMatchObject({ numeroTexto: "139", numero: 139 });
    expect(lerFederal(ex, 1_000_000)).toMatchObject({ serie: "6", numeroTexto: "678139", numero: 678139 });
  });

  it("100 e 10.000 usam os 2 e os 4 últimos algarismos", () => {
    expect(lerFederal(ex, 100).numeroTexto).toBe("39");
    expect(lerFederal(ex, 10_000).numeroTexto).toBe("8139");
  });

  it("zeros contam: 0-0-0-0-0 é o bilhete 000 (numeração a partir de zero)", () => {
    const zeros = ["12340", "55550", "00000", "98760", "11110"];
    expect(lerFederal(zeros, 1_000)).toMatchObject({ numeroTexto: "000", numero: 0 });
    // A série também pode ser 0.
    expect(lerFederal(["12305", "00001", "00002", "00003", "00004"], 1_000_000).numeroTexto).toBe("051234");
  });

  it("o passo a passo diz cada unidade e o resultado", () => {
    const passos = lerFederal(ex, 1_000_000).passos;
    expect(passos[0]).toBe("1º prêmio 34.567 → unidade 7");
    expect(passos.join(" ")).toContain("Série: a dezena do 1º prêmio (34.567) → 6");
    expect(passos.at(-1)).toContain("678.139");
  });

  it("recusa prêmio fora do formato e total que não é potência de 10", () => {
    expect(() => lerFederal(["1234", "12348", "90211", "55603", "77129"], 1_000)).toThrow();
    expect(() => lerFederal(ex.slice(0, 4), 1_000)).toThrow();
    expect(() => lerFederal(ex, 5_000)).toThrow();
  });

  it("todo número lido existe na rifa (sem número fantasma)", () => {
    for (const total of TOTAIS_DA_APURACAO) {
      const n = lerFederal(["99999", "99999", "99999", "99999", "99999"], total).numero;
      expect(n).toBe(total - 1);
      expect(numeroInterno(n, true)).toBe(total);
    }
  });
});

describe("totais e casas", () => {
  it("só potência de 10, de 100 a 1.000.000", () => {
    expect(TOTAIS_DA_APURACAO.map(casasDaRifa)).toEqual([2, 3, 4, 5, 6]);
    for (const t of [10, 500, 5_000, 250_000, 10_000_000, 1_001]) expect(totalDaApuracao(t)).toBe(false);
  });
});

describe("numeração a partir de zero", () => {
  it("a tela lê de 000 a 999; por dentro segue de 1 a 1000", () => {
    expect(formatQuota(1, 1_000, true)).toBe("000");
    expect(formatQuota(1_000, 1_000, true)).toBe("999");
    expect(formatQuota(140, 1_000, true)).toBe("139");
    expect(formatQuota(1, 1_000_000, true)).toBe("000000");
    expect(quotaDigits(1_000_000, true)).toBe(6);
    expect(numeroNaTela(140, true)).toBe(139);
    expect(numeroInterno(139, true)).toBe(140);
  });

  it("a rifa de antes, sem método, segue de 1 ao total", () => {
    expect(formatQuota(1, 1_000, false)).toBe("0001");
    expect(formatQuota(1_000, 1_000, false)).toBe("1000");
    expect(numeracaoZero(null)).toBe(false);
    expect(numeracaoZero("federal_direta")).toBe(true);
    expect(numeracaoZero("qualquer")).toBe(false);
  });
});

describe("métodos liberados pela plataforma", () => {
  it("a promotora só escolhe o que está liberado", () => {
    expect(problemaNoMetodo("federal_direta", ["federal_direta"])).toBeNull();
    expect(problemaNoMetodo("federal_direta", [])).toMatch(/não está liberado/);
    expect(problemaNoMetodo(null, ["federal_direta"])).toMatch(/Escolha/);
    expect(problemaNoMetodo("hash", ["federal_direta"])).toMatch(/Escolha/);
    // O globo não liga antes da homologação.
    expect(problemaNoMetodo("globo", ["federal_direta", "globo"])).toMatch(/homologação/);
  });

  it("o painel só liga método conhecido e disponível", () => {
    expect(validarMetodosLiberados(["federal_direta", "federal_direta"])).toEqual(["federal_direta"]);
    expect(validarMetodosLiberados([])).toEqual([]);
    expect(() => validarMetodosLiberados(["globo"])).toThrow(/homologação/);
    expect(() => validarMetodosLiberados(["outro"])).toThrow();
    expect(() => validarMetodosLiberados("federal_direta")).toThrow();
  });

  it("o guardado estragado perde só o que não vale; ausente é a Federal", () => {
    expect(metodosLiberadosGuardados(undefined)).toEqual(["federal_direta"]);
    expect(metodosLiberadosGuardados(["globo", "federal_direta", "x"])).toEqual(["federal_direta"]);
    expect(metodosLiberadosGuardados([])).toEqual([]);
  });
});

describe("cláusula do regulamento", () => {
  it("é a do advogado, com o exemplo calculado pela mesma conta", () => {
    expect(clausulaDaApuracao(100_000)).toContain("O Número da Sorte ganhador será 78.139.");
    expect(clausulaDaApuracao(1_000_000)).toContain("A Série vencedora será a 6, e o Número da Sorte vencedor será o 78.139, formando o bilhete contemplado 678.139.");
    expect(clausulaDaApuracao(1_000)).toContain("composta por 1.000 números (de 000 a 999)");
    expect(clausulaDaApuracao(1_000)).toContain("3 (três) últimos algarismos (centena, dezena e unidade)");
    expect(clausulaDaApuracao(1_000)).toContain("o ganhador será o detentor do número 139.");
    expect(clausulaDaApuracao(100)).toContain("2 (dois) últimos algarismos");
    expect(clausulaDaApuracao(10_000)).toContain("4 (quatro) últimos algarismos");
  });

  it("entra no regulamento da rifa com método, sem semente nem hash", () => {
    const dados: DadosDoRegulamento = {
      rifa: {
        title: "Rifa",
        prizeTitle: "Moto",
        totalQuotas: 1_000,
        priceCents: 500,
        minPerOrder: 1,
        maxPerOrder: 100,
        reservationTtlMin: 15,
        drawAt: "2026-12-02T22:00:00Z",
        authorizationCode: "03.000001/2026",
        drawSeedHash: "a".repeat(64),
        metodoApuracao: "federal_direta",
        regulamentoExtra: null,
      },
      promotora: { nome: "Promotora", cnpj: null, endereco: null, contato: null },
      cotasPremiadas: [],
      taxaReembolsoPct: 10,
      aceitaReembolso: true,
    };
    const texto = montarRegulamento(dados).flatMap((s) => s.itens).join("\n");
    expect(texto).toContain("numeradas de 000 a 999");
    expect(texto).toContain("unidades simples do 1º ao 5º prêmio");
    expect(texto).not.toMatch(/semente|hash/i);
    // A rifa de antes segue com a semente.
    const antes = montarRegulamento({ ...dados, rifa: { ...dados.rifa, metodoApuracao: null } }).flatMap((s) => s.itens).join("\n");
    expect(antes).toContain("numeradas de 0001 a 1000");
    expect(antes).toMatch(/semente/);
  });
});
