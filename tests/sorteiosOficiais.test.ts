import { describe, expect, it } from "vitest";
import {
  ANTECEDENCIA_PARA_INTEGRAR_MS,
  CORES_DA_CAIXA,
  LOTERIAS,
  LOTERIAS_QUE_RECEBEM_RIFA,
  problemaParaIntegrar,
  problemaParaLancarResultado,
  seloDoSorteioOficial,
  situacaoDoSorteio,
  validarResultado,
  validarSorteioOficial,
} from "@shared/sorteiosOficiais";

const agora = new Date("2026-10-02T12:00:00Z");
const daqui = (h: number) => new Date(agora.getTime() + h * 3_600_000);

describe("cadastro do sorteio oficial", () => {
  it("aceita só loteria conhecida, concurso e data futura", () => {
    expect(validarSorteioOficial({ loteria: "jogo-do-bicho", concurso: 1, sorteioEm: daqui(48).toISOString() }, agora)).toEqual({ problema: "Escolha a loteria." });
    expect("problema" in validarSorteioOficial({ loteria: "federal", concurso: 0, sorteioEm: daqui(48).toISOString() }, agora)).toBe(true);
    expect("problema" in validarSorteioOficial({ loteria: "federal", concurso: 6012, sorteioEm: daqui(-1).toISOString() }, agora)).toBe(true);
    const ok = validarSorteioOficial({ loteria: "federal", concurso: "6012", sorteioEm: daqui(48).toISOString(), titulo: "  Federal   de sábado ", extra: "x" }, agora);
    expect(ok).toEqual({ dados: { loteria: "federal", concurso: 6012, sorteioEm: daqui(48), titulo: "Federal de sábado", transmissaoUrl: null } });
  });

  it("transmissão só https, sem usuário na URL", () => {
    const base = { loteria: "federal", concurso: 1, sorteioEm: daqui(48).toISOString() };
    expect("problema" in validarSorteioOficial({ ...base, transmissaoUrl: "http://youtube.com/x" }, agora)).toBe(true);
    expect("problema" in validarSorteioOficial({ ...base, transmissaoUrl: "javascript:alert(1)" }, agora)).toBe(true);
    expect("problema" in validarSorteioOficial({ ...base, transmissaoUrl: "https://a:b@youtube.com/x" }, agora)).toBe(true);
    expect("dados" in validarSorteioOficial({ ...base, transmissaoUrl: "https://www.youtube.com/watch?v=abc" }, agora)).toBe(true);
  });
});

describe("resultado oficial pelo formato da loteria", () => {
  it("Federal: 5 prêmios de 5 algarismos, com o zero à esquerda", () => {
    expect(validarResultado("federal", ["01234", "56789", "00001", "99999", "12345"])).toEqual({ numeros: ["01234", "56789", "00001", "99999", "12345"] });
    expect("problema" in validarResultado("federal", ["1234", "56789", "00001", "99999", "12345"])).toBe(true);
    expect("problema" in validarResultado("federal", ["01234"])).toBe(true);
  });
  it("dezenas: na faixa, sem repetir, em ordem", () => {
    expect(validarResultado("mega_sena", ["60", "1", "33", "07", "15", "42"])).toEqual({ numeros: ["01", "07", "15", "33", "42", "60"] });
    expect("problema" in validarResultado("mega_sena", ["61", "1", "33", "07", "15", "42"])).toBe(true);
    expect("problema" in validarResultado("mega_sena", ["1", "1", "33", "07", "15", "42"])).toBe(true);
    expect("problema" in validarResultado("quina", ["0", "1", "2", "3", "4"])).toBe(true);
    expect(validarResultado("lotofacil", Array.from({ length: 15 }, (_, i) => String(25 - i)))).toHaveProperty("numeros");
  });
  it("cada loteria diz quantos números leva", () => {
    for (const l of Object.values(LOTERIAS)) expect(l.quantos).toBeGreaterThan(0);
  });
});

describe("quando dá para integrar e lançar", () => {
  const base = { loteria: "federal", canceladoEm: null, resultadoEm: null };
  it("integra com 24 h de folga; cancelado ou com resultado, nunca", () => {
    expect(problemaParaIntegrar({ ...base, sorteioEm: new Date(agora.getTime() + ANTECEDENCIA_PARA_INTEGRAR_MS + 1) }, agora)).toBeNull();
    expect(problemaParaIntegrar({ ...base, sorteioEm: daqui(23) }, agora)).not.toBeNull();
    expect(problemaParaIntegrar({ ...base, canceladoEm: agora, sorteioEm: daqui(48) }, agora)).toMatch(/cancelado/);
    expect(problemaParaIntegrar({ ...base, resultadoEm: agora, sorteioEm: daqui(48) }, agora)).toMatch(/resultado/);
    // Só a Federal recebe rifa (a apuração da autorização SPA/MF, confirmada
    // pelo advogado em 05/10/2026); as outras ficam só no calendário.
    expect(LOTERIAS_QUE_RECEBEM_RIFA).toEqual(["federal"]);
    for (const loteria of Object.keys(LOTERIAS)) {
      const p = problemaParaIntegrar({ ...base, loteria, sorteioEm: daqui(48) }, agora);
      if (loteria === "federal") expect(p, loteria).toBeNull();
      else expect(p, loteria).toMatch(/Loteria Federal/);
    }
    expect(problemaParaIntegrar({ ...base, loteria: "dupla_sena", sorteioEm: daqui(48) }, agora)).not.toBeNull();
  });
  it("o resultado só depois da hora, uma vez", () => {
    expect(problemaParaLancarResultado({ ...base, sorteioEm: daqui(1) }, agora)).toMatch(/ainda não/);
    expect(problemaParaLancarResultado({ ...base, sorteioEm: daqui(-1) }, agora)).toBeNull();
    expect(problemaParaLancarResultado({ ...base, resultadoEm: agora, sorteioEm: daqui(-1) }, agora)).toMatch(/já foi/);
  });
  it("situação e selo", () => {
    expect(situacaoDoSorteio(base)).toBe("agendado");
    expect(situacaoDoSorteio({ canceladoEm: agora, resultadoEm: agora })).toBe("cancelado");
    expect(seloDoSorteioOficial({ loteria: "federal", concurso: 6012, sorteioEm: "2026-12-02T22:00:00Z" })).toBe("Sorteio oficial · Federal 6012 · 02/12");
  });
});

describe("cores das loterias (identidade da Caixa)", () => {
  const lum = (h: string) => {
    const c = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  };
  const contraste = (a: string, b: string) => {
    const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
    return (x + 0.05) / (y + 0.05);
  };
  it("toda loteria tem cor, e o número do dia em branco por cima passa de 3:1", () => {
    for (const [l, d] of Object.entries(LOTERIAS)) {
      expect(d.cor, l).toBe(CORES_DA_CAIXA[l as keyof typeof CORES_DA_CAIXA]);
      expect(d.cor).toMatch(/^#[0-9a-f]{6}$/i);
      expect(contraste(d.cor, "#ffffff"), l).toBeGreaterThanOrEqual(3);
    }
  });
});
