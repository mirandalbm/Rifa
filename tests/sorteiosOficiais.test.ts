import { describe, expect, it } from "vitest";
import {
  ANTECEDENCIA_PARA_INTEGRAR_MS,
  CORES_DA_CAIXA,
  COR_DO_GLOBO,
  ataGuardada,
  validarAtaDoGlobo,
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
    expect(LOTERIAS_QUE_RECEBEM_RIFA).toEqual(["federal", "globo"]);
    for (const loteria of Object.keys(LOTERIAS)) {
      const p = problemaParaIntegrar({ ...base, loteria, sorteioEm: daqui(48) }, agora);
      if (loteria === "federal" || loteria === "globo") expect(p, loteria).toBeNull();
      else expect(p, loteria).toMatch(/Loteria Federal/);
    }
    // Cada rifa só entra no sorteio do método dela (8.11).
    const federal = { ...base, sorteioEm: daqui(48) };
    const globo = { ...base, loteria: "globo", sorteioEm: daqui(48) };
    expect(problemaParaIntegrar(federal, agora, "federal_direta")).toBeNull();
    expect(problemaParaIntegrar(federal, agora, null)).toBeNull();
    expect(problemaParaIntegrar(federal, agora, "globo")).toMatch(/globo/);
    expect(problemaParaIntegrar(globo, agora, "globo")).toBeNull();
    expect(problemaParaIntegrar(globo, agora, "federal_direta")).toMatch(/Loteria Federal/);
    expect(problemaParaIntegrar(globo, agora, null)).toMatch(/Loteria Federal/);
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
      // O globo é da casa (não é cor da Caixa): só identidade, com o nome junto.
      expect(d.cor, l).toBe(l === "globo" ? COR_DO_GLOBO : CORES_DA_CAIXA[l as keyof typeof CORES_DA_CAIXA]);
      expect(d.cor).toMatch(/^#[0-9a-f]{6}$/i);
      expect(contraste(d.cor, "#ffffff"), l).toBeGreaterThanOrEqual(3);
    }
  });
});

describe("globo: resultado e ata notarial (8.10)", () => {
  const bolas = ["6", "7", "8", "1", "3", "9"];
  const relato = bolas.map((_, i) => ({ hora: `20:0${i}:15` }));
  const ok = { local: "Rua das Flores, 100, São Paulo/SP", tabelionato: "1º Tabelionato de Notas de São Paulo", testemunhas: ["Ana Souza", "Bruno Lima"], bolas: relato };
  it("o resultado são 6 bolas de 0 a 9", () => {
    expect(validarResultado("globo", bolas)).toEqual({ numeros: bolas });
    expect("problema" in validarResultado("globo", ["6", "7", "8", "1", "3"])).toBe(true);
    expect("problema" in validarResultado("globo", ["6", "7", "8", "1", "3", "10"])).toBe(true);
  });
  it("a ata pede local, tabelionato, auditor ou 2 testemunhas e a hora de cada bola", () => {
    const v = validarAtaDoGlobo(ok, bolas);
    expect("ata" in v && v.ata.bolas[5]).toEqual({ globo: 6, algarismo: "9", hora: "20:05:15" });
    expect(validarAtaDoGlobo({ ...ok, testemunhas: ["Ana Souza"] }, bolas)).toMatchObject({ problema: expect.stringMatching(/auditor/) });
    expect("ata" in validarAtaDoGlobo({ ...ok, testemunhas: [], auditor: { nome: "Carla Dias", registro: "CRC 123" } }, bolas)).toBe(true);
    expect(validarAtaDoGlobo({ ...ok, local: "" }, bolas)).toMatchObject({ problema: expect.stringMatching(/local/) });
    expect(validarAtaDoGlobo({ ...ok, tabelionato: "" }, bolas)).toMatchObject({ problema: expect.stringMatching(/tabelionato/) });
    expect(validarAtaDoGlobo({ ...ok, bolas: relato.slice(0, 5) }, bolas)).toMatchObject({ problema: expect.stringMatching(/uma linha por globo/) });
    expect(validarAtaDoGlobo({ ...ok, bolas: [{ hora: "25:00:00" }, ...relato.slice(1)] }, bolas)).toMatchObject({ problema: expect.stringMatching(/hora/) });
    // As bolas saem em sequência.
    expect(validarAtaDoGlobo({ ...ok, bolas: [...relato].reverse() }, bolas)).toMatchObject({ problema: expect.stringMatching(/sequência/) });
  });
  it("testemunha é nome, nunca número (CPF, telefone); sem repetir", () => {
    expect(validarAtaDoGlobo({ ...ok, testemunhas: ["Ana Souza", "11 99999-0000"] }, bolas)).toMatchObject({ problema: expect.stringMatching(/só letras/) });
    expect(validarAtaDoGlobo({ ...ok, testemunhas: ["Ana Souza", "ana souza"] }, bolas)).toMatchObject({ problema: expect.stringMatching(/repetida/) });
  });
  it("só as chaves conhecidas; a guardada estragada vira nula", () => {
    const v = validarAtaDoGlobo({ ...ok, html: "<script>" }, bolas);
    expect("ata" in v && Object.keys(v.ata).sort()).toEqual(["auditor", "bolas", "local", "observacoes", "registro", "tabelionato", "testemunhas"]);
    expect(ataGuardada("x")).toBeNull();
    expect(ataGuardada({ local: 1 })).toBeNull();
  });
});
