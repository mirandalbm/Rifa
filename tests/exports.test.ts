import { describe, it, expect } from "vitest";
import {
  csvCell,
  csvRow,
  csvMoney,
  csvDate,
  neutralizarFormula,
  exportFilename,
  exportInfo,
  EXPORTS,
  CSV_SEP,
} from "../shared/exports";

describe("injeção de fórmula na planilha", () => {
  it("neutraliza a célula que começa com =", () => {
    // O comprador se cadastra com este nome; o organizador exporta e abre.
    // Sem separador nem aspas, a célula não precisa de envelope: basta o
    // apóstrofo à esquerda, que o Excel lê como "isto é texto".
    expect(csvCell("=cmd|'/c calc'!A1")).toBe("'=cmd|'/c calc'!A1");
  });

  it("neutraliza +, @ e tabulação", () => {
    expect(neutralizarFormula("+1+1")).toBe("'+1+1");
    expect(neutralizarFormula("@SUM(A1:A9)")).toBe("'@SUM(A1:A9)");
    expect(neutralizarFormula("\tmalvado")).toBe("'\tmalvado");
  });

  it("neutraliza o HYPERLINK, que é o ataque que engana melhor", () => {
    const nome = '=HYPERLINK("http://malvado.example","Clique para ver a nota")';
    expect(csvCell(nome).startsWith(`"'=HYPERLINK`)).toBe(true);
  });

  it("deixa dinheiro negativo continuar sendo número", () => {
    // Aqui está o cuidado: neutralizar todo "-" quebraria a soma da coluna
    // de estorno, que é justamente o que a contabilidade confere.
    expect(neutralizarFormula("-14,70")).toBe("-14,70");
    expect(csvCell(csvMoney(-1470))).toBe("-14,70");
  });

  it("mas neutraliza o - que não é número", () => {
    expect(neutralizarFormula("-2+3+cmd|'/c calc'!A1")).toBe("'-2+3+cmd|'/c calc'!A1");
  });

  it("não mexe em nome comum", () => {
    expect(csvCell("João da Silva")).toBe("João da Silva");
    expect(csvCell("Maria D'Ávila")).toBe("Maria D'Ávila");
  });
});

describe("escape do CSV", () => {
  it("envolve em aspas quando tem o separador", () => {
    expect(csvCell("Silva; Souza")).toBe('"Silva; Souza"');
  });

  it("dobra as aspas internas", () => {
    expect(csvCell('Ele disse "oi"')).toBe('"Ele disse ""oi"""');
  });

  it("envolve quando tem quebra de linha", () => {
    expect(csvCell("linha1\nlinha2")).toBe('"linha1\nlinha2"');
  });

  it("célula vazia para nulo — nunca a palavra null", () => {
    expect(csvCell(null)).toBe("");
    expect(csvCell(undefined)).toBe("");
    // Zero é valor, não ausência.
    expect(csvCell(0)).toBe("0");
  });

  it("a linha termina em CRLF e separa por ponto e vírgula", () => {
    expect(csvRow(["a", "b"])).toBe(`a${CSV_SEP}b\r\n`);
  });
});

describe("formato que o Excel brasileiro soma", () => {
  it("centavos viram vírgula decimal, sem R$ e sem milhar", () => {
    // Com "R$" ou com ponto de milhar a célula vira texto e a soma da
    // coluna devolve zero.
    expect(csvMoney(1470)).toBe("14,70");
    expect(csvMoney(100)).toBe("1,00");
    expect(csvMoney(5)).toBe("0,05");
    expect(csvMoney(0)).toBe("0,00");
    expect(csvMoney(123456789)).toBe("1234567,89");
  });

  it("negativo mantém o sinal antes do número", () => {
    expect(csvMoney(-1470)).toBe("-14,70");
    expect(csvMoney(-5)).toBe("-0,05");
  });

  it("data em dd/mm/aaaa hh:mm", () => {
    expect(csvDate(new Date(2026, 8, 14, 9, 5))).toBe("14/09/2026 09:05");
  });

  it("data ausente ou inválida vira célula vazia", () => {
    expect(csvDate(null)).toBe("");
    expect(csvDate("não é data")).toBe("");
  });
});

describe("catálogo", () => {
  it("cota e sorteio exigem campanha", () => {
    // Exportar cota de todas as rifas junto não quer dizer nada: o número
    // 42 existe em cada uma delas.
    expect(exportInfo("cotas")?.campanhaObrigatoria).toBe(true);
    expect(exportInfo("sorteio")?.campanhaObrigatoria).toBe(true);
    expect(exportInfo("pedidos")?.campanhaObrigatoria).toBe(false);
  });

  it("todo relatório com nome ou telefone está marcado como dado pessoal", () => {
    for (const chave of ["pedidos", "cotas", "compradores", "sorteio"]) {
      expect(exportInfo(chave)?.dadoPessoal).toBe(true);
    }
  });

  it("chave desconhecida não devolve relatório", () => {
    expect(exportInfo("../../etc/passwd")).toBeUndefined();
    expect(exportInfo("")).toBeUndefined();
  });

  it("o nome do arquivo leva a data, senão um mês de relatório vira um só", () => {
    const nome = exportFilename("pedidos", "fiat-mobi", new Date(2026, 8, 14));
    expect(nome).toBe("pedidos-fiat-mobi-2026-09-14.csv");
    expect(exportFilename("comissoes", null, new Date(2026, 8, 14))).toBe(
      "comissoes-2026-09-14.csv",
    );
  });

  it("toda chave do catálogo é única", () => {
    const chaves = EXPORTS.map((e) => e.key);
    expect(new Set(chaves).size).toBe(chaves.length);
  });
});
