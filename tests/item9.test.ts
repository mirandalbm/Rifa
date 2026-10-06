import { describe, expect, it } from "vitest";
import {
  IMPEDIDOS_DE_PARTICIPAR,
  REGRA_DA_APROXIMACAO,
  REGRA_DA_APROXIMACAO_ALTERNADA,
  REGRA_DO_RESSORTEIO,
  contempladoNaFita,
  contempladoPassoAPasso,
  regraDoNumeroSemDono,
} from "../shared/sorteio";
import { validarNovaExtracao } from "../shared/sorteiosOficiais";
import { telefoneComparavel } from "../shared/format";

/** O que o banco devolveria: o pago seguinte na fita (dá a volta) e o anterior. */
function naFita(sorteado: number, total: number, pagos: number[]) {
  const ord = [...pagos].sort((a, b) => a - b);
  const vendido = ord.includes(sorteado);
  const seguinte = ord.find((n) => n > sorteado) ?? ord[0] ?? null;
  const anterior = [...ord].reverse().find((n) => n < sorteado) ?? ord[ord.length - 1] ?? null;
  return contempladoNaFita({ sorteado, total, sorteadoVendido: vendido, seguinte, anterior });
}

describe("9.1 e 9.3: busca alternada na fita circular", () => {
  it("o sorteado distribuído leva", () => {
    expect(naFita(50, 100, [50, 51])).toBe(50);
  });
  it("+1 antes de −1, e alterna", () => {
    expect(naFita(50, 100, [49, 51])).toBe(51);
    expect(naFita(50, 100, [49, 53])).toBe(49);
    expect(naFita(50, 100, [47, 53])).toBe(53);
  });
  it("no topo, dá a volta: depois do último vem o primeiro", () => {
    // Numeração da tela 0 a 99 = cota interna 1 a 100: 99 → 00 é 100 → 1.
    expect(naFita(100, 100, [1, 97])).toBe(1);
    expect(naFita(1, 100, [100, 4])).toBe(100);
  });
  it("na rifa de 1.000.000 a busca passa de uma Série à outra", () => {
    // Tela 099.999 (cota 100.000) sem dono; 100.000 (cota 100.001) é da Série seguinte.
    expect(naFita(100_000, 1_000_000, [100_001, 99_990])).toBe(100_001);
    expect(naFita(1_000_000, 1_000_000, [1])).toBe(1);
  });
  it("nenhuma cota paga: ninguém", () => {
    expect(naFita(7, 100, [])).toBeNull();
  });
  it("igual ao passo a passo do advogado em 400 casos", () => {
    let semente = 9;
    const rnd = (n: number) => ((semente = (semente * 1103515245 + 12345) % 2 ** 31) % n) + 1;
    for (let caso = 0; caso < 400; caso++) {
      const total = [10, 100, 1000][caso % 3];
      const pagos = [...new Set(Array.from({ length: rnd(6) - 1 }, () => rnd(total)))];
      const sorteado = rnd(total);
      expect(naFita(sorteado, total, pagos)).toBe(contempladoPassoAPasso(sorteado, total, (n) => pagos.includes(n)));
    }
  });
});

describe("o texto do número sem dono, por método", () => {
  it("Federal: o texto exato do advogado, a fita circular e o que é distribuído", () => {
    const t = regraDoNumeroSemDono("federal_direta");
    expect(t).toContain(REGRA_DA_APROXIMACAO_ALTERNADA);
    expect(t).toMatch(/circular/);
    expect(t).toMatch(/bônus/);
    expect(t).toMatch(/reservado e não pago não conta/);
  });
  it("globo: o ressorteio, nunca a aproximação", () => {
    expect(regraDoNumeroSemDono("globo")).toBe(REGRA_DO_RESSORTEIO);
  });
  it("rifa de antes: a regra com que foi vendida", () => {
    expect(regraDoNumeroSemDono(null)).toBe(REGRA_DA_APROXIMACAO);
    expect(regraDoNumeroSemDono(null, "promotora_completa")).toMatch(/ficam com a promotora/);
  });
  it("9.4: os impedidos", () => {
    expect(IMPEDIDOS_DE_PARTICIPAR).toMatch(/promotora, seus sócios e diretores/);
    expect(IMPEDIDOS_DE_PARTICIPAR).toMatch(/plataforma/);
  });
});

describe("9.5: nova extração do globo", () => {
  const horas = ["19:10:00", "19:10:20", "19:10:40", "19:11:00", "19:11:20", "19:11:40"];
  it("aceita 6 bolas e as horas depois da última registrada", () => {
    const r = validarNovaExtracao({ bolas: ["1", "2", "3", "4", "5", "6"], horas, outra: "x" }, "19:05:00");
    expect(r).toEqual({ bolas: ["1", "2", "3", "4", "5", "6"], horas });
  });
  it("recusa hora antes da última bola, fora de sequência ou faltando", () => {
    expect(validarNovaExtracao({ bolas: ["1", "2", "3", "4", "5", "6"], horas }, "19:12:00")).toHaveProperty("problema");
    expect(validarNovaExtracao({ bolas: ["1", "2", "3", "4", "5", "6"], horas: [...horas].reverse() }, null)).toHaveProperty("problema");
    expect(validarNovaExtracao({ bolas: ["1", "2", "3", "4", "5", "6"], horas: horas.slice(1) }, null)).toHaveProperty("problema");
  });
  it("recusa bola fora de 0 a 9", () => {
    expect(validarNovaExtracao({ bolas: ["1", "2", "3", "4", "5", "10"], horas }, null)).toHaveProperty("problema");
  });
});

describe("9.4: telefone comparável", () => {
  it("o 55 do país e a máscara não mudam o número", () => {
    expect(telefoneComparavel("+55 (11) 98888-7777")).toBe("11988887777");
    expect(telefoneComparavel("11988887777")).toBe("11988887777");
    expect(telefoneComparavel("(11) 3333-4444")).toBe("1133334444");
  });
});
