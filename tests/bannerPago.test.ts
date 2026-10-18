import { describe, it, expect } from "vitest";
import {
  CONFIG_BANNER_CLIQUE_PADRAO,
  CONFIG_BANNER_PAGO_PADRAO,
  DIA_MS,
  avisoDoPrazo,
  bannerPagoNoAr,
  diasQueFaltam,
  gastoDoBannerPorClique,
  mesclarConfigBannerPago,
  precoDoBanner,
  precoDoBannerPorClique,
  previsaoDaFilaDoBanner,
  problemaNaRecusa,
  resumoDoPedido,
  sobraDoBanner,
  sobraDoBannerPorClique,
  validarConfigBannerPago,
  validarTituloDoBanner,
} from "../shared/bannerPago";
import { CLIQUES_MAX_POR_ANUNCIO, gastoAte, validarConfigPatrocinio, validarFaixas } from "../shared/patrocinio";

const cfg = { ...CONFIG_BANNER_PAGO_PADRAO, ligado: true };

describe("configuração do banner pago", () => {
  it("nasce desligada: sem a plataforma ligar, o produto não existe", () => {
    expect(CONFIG_BANNER_PAGO_PADRAO.ligado).toBe(false);
    expect(validarConfigBannerPago(undefined).ligado).toBe(false);
    expect(validarConfigBannerPago({}).ligado).toBe(false);
  });

  it("só guarda as chaves conhecidas e confere os limites", () => {
    const c = validarConfigBannerPago({ ligado: true, precoDiaCents: 1500, diasMin: 2, diasMax: 10, vagas: 4, segundos: 8, golpe: "x" });
    expect(Object.keys(c).sort()).toEqual(["clique", "diasMax", "diasMin", "faixasDia", "ligado", "precoDiaCents", "segundos", "vagas"]);
    expect(c.precoDiaCents).toBe(1500);
    expect(() => validarConfigBannerPago({ precoDiaCents: 0 })).toThrow();
    expect(() => validarConfigBannerPago({ precoDiaCents: 12.5 })).toThrow();
    expect(() => validarConfigBannerPago({ diasMin: 10, diasMax: 5 })).toThrow(/máximo/);
    expect(() => validarConfigBannerPago({ vagas: 11 })).toThrow();
  });
});

describe("preço do banner", () => {
  it("é dias × preço do dia, em centavos inteiros", () => {
    expect(precoDoBanner(cfg, 7)).toEqual({ dias: 7, descontoPct: 0, brutoCents: 14_000, totalCents: 14_000 });
    expect(precoDoBanner({ ...cfg, precoDiaCents: 1999 }, 3).totalCents).toBe(5997);
  });
  it("recusa dia fora da faixa e o que não é inteiro", () => {
    expect(() => precoDoBanner(cfg, 0)).toThrow();
    expect(() => precoDoBanner(cfg, cfg.diasMax + 1)).toThrow();
    expect(() => precoDoBanner(cfg, 1.5)).toThrow();
    expect(() => precoDoBanner(cfg, "abc")).toThrow();
  });
});

describe("título do banner", () => {
  it("limpa os espaços e exige texto (é o texto alternativo da arte)", () => {
    expect(validarTituloDoBanner("  Moto   0 km  ")).toBe("Moto 0 km");
    expect(() => validarTituloDoBanner("ab")).toThrow();
    expect(() => validarTituloDoBanner(undefined)).toThrow();
    expect(() => validarTituloDoBanner("x".repeat(81))).toThrow();
  });
});

describe("o que volta ao saldo", () => {
  const agora = new Date("2026-10-10T12:00:00Z");
  it("banner que nunca apareceu volta inteiro", () => {
    expect(sobraDoBanner({ valorPagoCents: 14_000, dias: 7, inicio: null, agora })).toBe(14_000);
  });
  it("o dia que começou conta inteiro; o resto volta", () => {
    const inicio = new Date(agora.getTime() - 2.5 * DIA_MS); // no terceiro dia
    expect(sobraDoBanner({ valorPagoCents: 14_000, dias: 7, inicio, agora })).toBe(14_000 - 6_000);
  });
  it("arredonda o gasto para baixo e nunca devolve mais do que pagou, nem menos que zero", () => {
    const inicio = new Date(agora.getTime() - 1000);
    // 1 de 3 dias de R$ 10,00: gasto = floor(1000/3) = 333 → sobra 667
    expect(sobraDoBanner({ valorPagoCents: 1000, dias: 3, inicio, agora })).toBe(667);
    const passou = new Date(agora.getTime() - 20 * DIA_MS);
    expect(sobraDoBanner({ valorPagoCents: 1000, dias: 3, inicio: passou, agora })).toBe(0);
  });
  it("gasto + sobra fecha exatamente o valor pago, em qualquer dia", () => {
    for (let dias = 1; dias <= 30; dias++) {
      for (let usados = 1; usados <= dias; usados++) {
        const inicio = new Date(agora.getTime() - (usados - 0.5) * DIA_MS);
        const valor = 1999 * dias;
        const sobra = sobraDoBanner({ valorPagoCents: valor, dias, inicio, agora });
        const gasto = Math.floor((valor * usados) / dias);
        expect(sobra + gasto).toBe(valor);
      }
    }
  });
});

describe("a janela no ar", () => {
  const inicio = new Date("2026-10-01T00:00:00Z");
  const fim = new Date("2026-10-08T00:00:00Z");
  it("só está no ar dentro da janela e com a situação no_ar", () => {
    expect(bannerPagoNoAr({ status: "no_ar", inicio, fim }, new Date("2026-10-03T00:00:00Z"))).toBe(true);
    expect(bannerPagoNoAr({ status: "no_ar", inicio, fim }, new Date("2026-10-08T00:00:00Z"))).toBe(false);
    expect(bannerPagoNoAr({ status: "no_ar", inicio, fim }, new Date("2026-09-30T00:00:00Z"))).toBe(false);
    expect(bannerPagoNoAr({ status: "aprovado", inicio: null, fim: null })).toBe(false);
    expect(bannerPagoNoAr({ status: "encerrado", inicio, fim }, new Date("2026-10-03T00:00:00Z"))).toBe(false);
  });
  it("conta os dias que faltam", () => {
    expect(diasQueFaltam(fim, new Date("2026-10-06T12:00:00Z"))).toBe(2);
    expect(diasQueFaltam(fim, new Date("2026-10-09T00:00:00Z"))).toBe(0);
    expect(diasQueFaltam(null)).toBe(0);
  });
});

describe("recusa", () => {
  it("exige explicação", () => {
    expect(problemaNaRecusa("curto")).toMatch(/motivo/);
    expect(problemaNaRecusa(undefined)).toMatch(/motivo/);
    expect(problemaNaRecusa("A arte promete prêmio que a rifa não tem.")).toBeNull();
  });
});

/* ------------------------------------------------------------------ *
 * Modo por clique (docs/PLANO-BANNER-POR-CLIQUE.md, passo 1)
 * ------------------------------------------------------------------ */

/** Os padrões de fábrica podem mudar; as contas abaixo usam valores próprios, não eles. */
const cfgC = validarConfigBannerPago({
  ligado: true,
  precoDiaCents: 3000,
  diasMin: 1,
  diasMax: 30,
  faixasDia: [
    { aPartirDe: 7, descontoPct: 10 },
    { aPartirDe: 30, descontoPct: 20 },
  ],
  clique: {
    ligado: true,
    precoCents: 150,
    minimoCliques: 100,
    maximoCliques: 5000,
    prazoMaxDias: 21,
    faixas: [
      { aPartirDe: 500, descontoPct: 5 },
      { aPartirDe: 2000, descontoPct: 12 },
    ],
  },
});

describe("configuração do modo por clique", () => {
  it("nasce desligado e o padrão de fábrica é o proposto", () => {
    expect(CONFIG_BANNER_PAGO_PADRAO.clique.ligado).toBe(false);
    expect(validarConfigBannerPago(undefined).clique.ligado).toBe(false);
    expect(validarConfigBannerPago({ ligado: true }).clique.ligado).toBe(false);
    expect(CONFIG_BANNER_CLIQUE_PADRAO).toEqual({
      ligado: false,
      precoCents: 100,
      minimoCliques: 100,
      maximoCliques: 10_000,
      prazoMaxDias: 30,
      faixas: [],
    });
    expect(CONFIG_BANNER_PAGO_PADRAO.faixasDia).toEqual([]);
  });

  it("configuração guardada antes do modo por clique ainda valida, com o padrão no que falta", () => {
    const antiga = { ligado: true, precoDiaCents: 1500, diasMin: 2, diasMax: 10, vagas: 4, segundos: 8 };
    const c = validarConfigBannerPago(antiga);
    expect(c.precoDiaCents).toBe(1500);
    expect(c.faixasDia).toEqual([]);
    expect(c.clique).toEqual(CONFIG_BANNER_CLIQUE_PADRAO);
  });

  it("guarda só as chaves conhecidas do bloco clique", () => {
    const c = validarConfigBannerPago({ clique: { ligado: true, precoCents: 90, golpe: "x", faixas: [] }, golpe: 1 });
    expect(Object.keys(c.clique).sort()).toEqual(["faixas", "ligado", "maximoCliques", "minimoCliques", "prazoMaxDias", "precoCents"]);
    expect(c.clique.precoCents).toBe(90);
    expect("golpe" in c).toBe(false);
  });

  it("confere inteiros, limites e a ordem mínimo/máximo", () => {
    expect(() => validarConfigBannerPago({ clique: { precoCents: 0 } })).toThrow();
    expect(() => validarConfigBannerPago({ clique: { precoCents: 99.5 } })).toThrow();
    expect(() => validarConfigBannerPago({ clique: { precoCents: "abc" } })).toThrow();
    expect(() => validarConfigBannerPago({ clique: { minimoCliques: 0 } })).toThrow();
    expect(() => validarConfigBannerPago({ clique: { maximoCliques: CLIQUES_MAX_POR_ANUNCIO + 1 } })).toThrow();
    expect(() => validarConfigBannerPago({ clique: { prazoMaxDias: 0 } })).toThrow();
    expect(() => validarConfigBannerPago({ clique: { prazoMaxDias: 91 } })).toThrow();
    expect(() => validarConfigBannerPago({ clique: { minimoCliques: 500, maximoCliques: 100 } })).toThrow(/máximo/);
    expect(() => validarConfigBannerPago({ clique: "ligado" })).toThrow();
    expect(() => validarConfigBannerPago({ clique: [] })).toThrow();
  });

  it("faixas: ordenadas, sem repetir, e o desconto só cresce", () => {
    const c = validarConfigBannerPago({
      clique: {
        faixas: [
          { aPartirDe: 2000, descontoPct: 12 },
          { aPartirDe: 500, descontoPct: 5 },
        ],
      },
    });
    expect(c.clique.faixas).toEqual([
      { aPartirDe: 500, descontoPct: 5 },
      { aPartirDe: 2000, descontoPct: 12 },
    ]);
    expect(() => validarConfigBannerPago({ clique: { faixas: [{ aPartirDe: 500, descontoPct: 5 }, { aPartirDe: 500, descontoPct: 9 }] } })).toThrow(/mesmo número de cliques/);
    expect(() => validarConfigBannerPago({ clique: { faixas: [{ aPartirDe: 500, descontoPct: 9 }, { aPartirDe: 900, descontoPct: 9 }] } })).toThrow(/crescer/);
    expect(() => validarConfigBannerPago({ clique: { faixas: [{ aPartirDe: 500, descontoPct: 9 }, { aPartirDe: 900, descontoPct: 4 }] } })).toThrow(/crescer/);
    expect(() => validarConfigBannerPago({ clique: { faixas: [{ aPartirDe: 500, descontoPct: 61 }] } })).toThrow();
    expect(() => validarConfigBannerPago({ clique: { faixas: [{ aPartirDe: 500, descontoPct: 5.5 }] } })).toThrow();
    expect(() => validarConfigBannerPago({ clique: { faixas: "x" } })).toThrow(/lista/);
    const sete = Array.from({ length: 7 }, (_, i) => ({ aPartirDe: 10 + i, descontoPct: 1 + i }));
    expect(() => validarConfigBannerPago({ clique: { faixas: sete } })).toThrow(/Até 6/);
  });

  it("faixa que começa acima do máximo é recusada (degrau que ninguém alcança)", () => {
    expect(() => validarConfigBannerPago({ clique: { maximoCliques: 1000, faixas: [{ aPartirDe: 1001, descontoPct: 5 }] } })).toThrow();
    expect(validarConfigBannerPago({ clique: { maximoCliques: 1000, faixas: [{ aPartirDe: 1000, descontoPct: 5 }] } }).clique.faixas).toHaveLength(1);
    expect(() => validarConfigBannerPago({ diasMax: 10, faixasDia: [{ aPartirDe: 11, descontoPct: 5 }] })).toThrow();
    expect(validarConfigBannerPago({ diasMax: 10, faixasDia: [{ aPartirDe: 10, descontoPct: 5 }] }).faixasDia).toHaveLength(1);
  });

  it("as faixas por período seguem a mesma régua", () => {
    expect(() => validarConfigBannerPago({ faixasDia: [{ aPartirDe: 7, descontoPct: 10 }, { aPartirDe: 30, descontoPct: 10 }] })).toThrow(/crescer/);
    expect(() => validarConfigBannerPago({ faixasDia: [{ aPartirDe: 7, descontoPct: 10 }, { aPartirDe: 7, descontoPct: 20 }] })).toThrow(/mesmo número de dias/);
    expect(() => validarConfigBannerPago({ faixasDia: "x" })).toThrow(/lista/);
  });
});

describe("validarFaixas, extraída do patrocínio", () => {
  it("o patrocínio segue com as mesmas mensagens e a mesma ordem", () => {
    expect(() => validarConfigPatrocinio({ faixas: [{ aPartirDe: 10, descontoPct: 5 }, { aPartirDe: 10, descontoPct: 9 }] })).toThrow("Duas faixas começam no mesmo número de cliques.");
    expect(() => validarConfigPatrocinio({ faixas: [{ aPartirDe: 10, descontoPct: 5 }, { aPartirDe: 20, descontoPct: 5 }] })).toThrow("O desconto precisa crescer junto com a faixa.");
    expect(() => validarConfigPatrocinio({ faixas: Array.from({ length: 7 }, (_, i) => ({ aPartirDe: 10 + i, descontoPct: 1 + i })) })).toThrow("Até 6 faixas de desconto.");
    expect(validarConfigPatrocinio({ faixas: [{ aPartirDe: 90, descontoPct: 9 }, { aPartirDe: 10, descontoPct: 5 }] }).faixas.map((f) => f.aPartirDe)).toEqual([10, 90]);
    expect(validarConfigPatrocinio(undefined).faixas).toHaveLength(3);
  });
  it("a função isolada ordena e confere o teto da primeira coluna", () => {
    expect(validarFaixas([{ aPartirDe: 8, descontoPct: 10 }, { aPartirDe: 3, descontoPct: 2 }], { aPartirDeMax: 8, unidade: "dias" }).map((f) => f.aPartirDe)).toEqual([3, 8]);
    expect(() => validarFaixas([{ aPartirDe: 9, descontoPct: 10 }], { aPartirDeMax: 8, unidade: "dias" })).toThrow(/dias/);
    expect(() => validarFaixas([{ aPartirDe: 1, descontoPct: 10 }], { aPartirDeMax: 8, unidade: "dias" })).toThrow();
  });
});

describe("o PUT parte da configuração atual", () => {
  const atual = cfgC;
  it("uma chave só não zera o resto (nem desliga o produto)", () => {
    const c = mesclarConfigBannerPago(atual, { precoDiaCents: 4500 });
    expect(c).toEqual({ ...atual, precoDiaCents: 4500 });
    expect(c.ligado).toBe(true);
    expect(c.clique).toEqual(atual.clique);
    expect(c.faixasDia).toEqual(atual.faixasDia);
  });
  it("uma chave só dentro de clique troca só ela", () => {
    const c = mesclarConfigBannerPago(atual, { clique: { precoCents: 200 } });
    expect(c.clique).toEqual({ ...atual.clique, precoCents: 200 });
    expect({ ...c, clique: atual.clique }).toEqual(atual);
    const lig = mesclarConfigBannerPago(atual, { clique: { ligado: false } });
    expect(lig.clique.ligado).toBe(false);
    expect(lig.clique.faixas).toEqual(atual.clique.faixas);
  });
  it("corpo vazio não muda nada", () => {
    expect(mesclarConfigBannerPago(atual, {})).toEqual(atual);
    expect(mesclarConfigBannerPago(atual, { clique: {} })).toEqual(atual);
  });
  it("null não volta ao padrão de fábrica nem desliga: é como não mandar", () => {
    expect(mesclarConfigBannerPago(atual, { precoDiaCents: null, vagas: null, ligado: null })).toEqual(atual);
    expect(mesclarConfigBannerPago(atual, { clique: { precoCents: null, ligado: null } })).toEqual(atual);
    // só a lista de faixas entende null como "limpar"
    expect(mesclarConfigBannerPago(atual, { clique: { faixas: null } }).clique.faixas).toEqual([]);
  });
  it("a lista de faixas troca inteira, e a lista vazia tira todas", () => {
    expect(mesclarConfigBannerPago(atual, { clique: { faixas: [{ aPartirDe: 1000, descontoPct: 7 }] } }).clique.faixas).toEqual([{ aPartirDe: 1000, descontoPct: 7 }]);
    expect(mesclarConfigBannerPago(atual, { clique: { faixas: [] } }).clique.faixas).toEqual([]);
    expect(mesclarConfigBannerPago(atual, { faixasDia: [] }).faixasDia).toEqual([]);
  });
  it("chave desconhecida é descartada, em qualquer nível", () => {
    const c = mesclarConfigBannerPago(atual, { golpe: 1, clique: { golpe: 2 } });
    expect(c).toEqual(atual);
    expect("golpe" in c).toBe(false);
    expect("golpe" in c.clique).toBe(false);
  });
  it("o resultado passa pela régua: valor inválido ou incoerente com o resto é 400", () => {
    expect(() => mesclarConfigBannerPago(atual, { clique: { minimoCliques: 6000 } })).toThrow(/máximo/);
    expect(() => mesclarConfigBannerPago(atual, { diasMax: 5 })).toThrow(); // a faixa de 7 dias ficaria sem alcance
    expect(() => mesclarConfigBannerPago(atual, { precoDiaCents: 0 })).toThrow();
    for (const ruim of [null, undefined, "x", 3, []]) expect(() => mesclarConfigBannerPago(atual, ruim)).toThrow();
    expect(() => mesclarConfigBannerPago(atual, { clique: null })).toThrow();
    expect(() => mesclarConfigBannerPago(atual, { clique: [] })).toThrow();
  });
  it("não altera a configuração de onde partiu", () => {
    const copia = JSON.parse(JSON.stringify(atual));
    mesclarConfigBannerPago(atual, { clique: { precoCents: 1, faixas: [] }, faixasDia: [] });
    expect(atual).toEqual(copia);
  });
});

describe("preço do banner por dia, com desconto por período", () => {
  it("sem faixa alcançada, é dias × preço; com ela, para baixo", () => {
    expect(precoDoBanner(cfgC, 6)).toEqual({ dias: 6, descontoPct: 0, brutoCents: 18_000, totalCents: 18_000 });
    expect(precoDoBanner(cfgC, 7)).toEqual({ dias: 7, descontoPct: 10, brutoCents: 21_000, totalCents: 18_900 });
    expect(precoDoBanner(cfgC, 29).descontoPct).toBe(10);
    expect(precoDoBanner(cfgC, 30)).toEqual({ dias: 30, descontoPct: 20, brutoCents: 90_000, totalCents: 72_000 });
    // 7 dias a R$ 19,99 com 10%: 13993 × 0,9 = 12593,7 → 12593
    const c = { ...cfgC, precoDiaCents: 1999 };
    expect(precoDoBanner(c, 7).totalCents).toBe(12_593);
  });
  it("o total nunca passa do bruto nem fica fracionado, em qualquer dia", () => {
    for (let d = cfgC.diasMin; d <= cfgC.diasMax; d++) {
      const p = precoDoBanner(cfgC, d);
      expect(Number.isInteger(p.totalCents)).toBe(true);
      expect(p.totalCents).toBeLessThanOrEqual(p.brutoCents);
      expect(p.totalCents).toBe(Math.floor((p.brutoCents * (100 - p.descontoPct)) / 100));
    }
  });
});

describe("preço do banner por clique", () => {
  it("é cliques × preço do clique, menos a faixa, para baixo, em centavos inteiros", () => {
    expect(precoDoBannerPorClique(cfgC, 100)).toEqual({ cliques: 100, precoCliqueCents: 150, descontoPct: 0, brutoCents: 15_000, totalCents: 15_000 });
    expect(precoDoBannerPorClique(cfgC, 499).descontoPct).toBe(0);
    expect(precoDoBannerPorClique(cfgC, 500)).toMatchObject({ descontoPct: 5, brutoCents: 75_000, totalCents: 71_250 });
    expect(precoDoBannerPorClique(cfgC, 1999).descontoPct).toBe(5);
    expect(precoDoBannerPorClique(cfgC, 2000)).toMatchObject({ descontoPct: 12, brutoCents: 300_000, totalCents: 264_000 });
    // 505 × 7 = 3535; com 5%: 3358,25 → 3358 (para baixo)
    const c = validarConfigBannerPago({ clique: { precoCents: 7, minimoCliques: 1, maximoCliques: 2000, faixas: [{ aPartirDe: 500, descontoPct: 5 }] } });
    expect(precoDoBannerPorClique(c, 505).totalCents).toBe(3358);
  });
  it("recusa abaixo do mínimo, acima do máximo e o que não é inteiro", () => {
    expect(() => precoDoBannerPorClique(cfgC, 99)).toThrow("O pacote mínimo é de 100 cliques.");
    expect(() => precoDoBannerPorClique(cfgC, 5001)).toThrow("O pacote máximo é de 5000 cliques.");
    expect(precoDoBannerPorClique(cfgC, 5000).cliques).toBe(5000);
    for (const ruim of [1.5, "abc", NaN, undefined, -3, Infinity]) expect(() => precoDoBannerPorClique(cfgC, ruim)).toThrow();
  });
  it("as mensagens e o preço seguem a configuração, nada fixo no código", () => {
    const outra = validarConfigBannerPago({ clique: { precoCents: 333, minimoCliques: 7, maximoCliques: 70 } });
    expect(() => precoDoBannerPorClique(outra, 6)).toThrow("O pacote mínimo é de 7 cliques.");
    expect(() => precoDoBannerPorClique(outra, 71)).toThrow("O pacote máximo é de 70 cliques.");
    expect(precoDoBannerPorClique(outra, 7)).toMatchObject({ precoCliqueCents: 333, totalCents: 2331 });
  });
  it("o total nunca passa do bruto, e pacote maior nunca custa mais por clique que o menor", () => {
    for (let n = cfgC.clique.minimoCliques; n <= cfgC.clique.maximoCliques; n += 7) {
      const p = precoDoBannerPorClique(cfgC, n);
      expect(p.totalCents).toBeLessThanOrEqual(p.brutoCents);
      expect(Number.isInteger(p.totalCents)).toBe(true);
    }
    const porClique = (n: number) => precoDoBannerPorClique(cfgC, n).totalCents / n;
    expect(porClique(499)).toBeGreaterThanOrEqual(porClique(500));
    expect(porClique(1999)).toBeGreaterThanOrEqual(porClique(2000));
  });
});

describe("o que volta ao saldo no modo por clique", () => {
  const inicio = new Date("2026-10-01T00:00:00Z");
  it("banner que nunca foi ao ar volta inteiro", () => {
    expect(sobraDoBannerPorClique({ valorPagoCents: 15_000, comprados: 100, usados: 0, inicio: null })).toBe(15_000);
  });
  it("valor − o gasto dos cliques usados (a conta do patrocínio)", () => {
    expect(sobraDoBannerPorClique({ valorPagoCents: 15_000, comprados: 100, usados: 37, inicio })).toBe(15_000 - 5_550);
    expect(sobraDoBannerPorClique({ valorPagoCents: 15_000, comprados: 100, usados: 100, inicio })).toBe(0);
    expect(sobraDoBannerPorClique({ valorPagoCents: 15_000, comprados: 100, usados: 0, inicio })).toBe(15_000);
    expect(gastoDoBannerPorClique(15_000, 100, 37)).toBe(gastoAte(15_000, 100, 37));
  });
  it("usado além do comprado (defeito) nunca devolve menos que zero nem gasta mais que o pago", () => {
    expect(sobraDoBannerPorClique({ valorPagoCents: 1000, comprados: 7, usados: 99, inicio })).toBe(0);
    expect(gastoDoBannerPorClique(1000, 7, 99)).toBe(1000);
    expect(gastoDoBannerPorClique(1000, 7, -5)).toBe(0);
  });
  it("a soma de cada clique é exatamente o valor pago, e gasto + sobra fecha o valor", () => {
    // Varredura: valor de 0 a R$ 30,00 × pacotes de 1 a 200.
    const valores = [0, 1, 99, 100, 101, 999, 1000, 1565, 1999, 2999, 3000];
    for (let v = 0; v <= 3000; v += 97) valores.push(v);
    for (const valor of valores) {
      for (let comprados = 1; comprados <= 200; comprados += comprados < 20 ? 1 : 13) {
        let soma = 0;
        for (let u = 1; u <= comprados; u++) soma += gastoDoBannerPorClique(valor, comprados, u) - gastoDoBannerPorClique(valor, comprados, u - 1);
        expect(soma).toBe(valor);
        for (const usados of [0, 1, Math.floor(comprados / 2), comprados]) {
          const gasto = gastoDoBannerPorClique(valor, comprados, usados);
          const sobra = sobraDoBannerPorClique({ valorPagoCents: valor, comprados, usados, inicio });
          expect(gasto + sobra).toBe(valor);
          expect(sobra).toBeGreaterThanOrEqual(0);
        }
      }
    }
  });
  it("no modo dia, gasto + sobra também fecha o valor com desconto (o valor pago é o já descontado)", () => {
    const agora = new Date("2026-10-10T12:00:00Z");
    const pago = precoDoBanner(cfgC, 7).totalCents; // 18.900
    for (let usados = 1; usados <= 7; usados++) {
      const ini = new Date(agora.getTime() - (usados - 0.5) * DIA_MS);
      const sobra = sobraDoBanner({ valorPagoCents: pago, dias: 7, inicio: ini, agora });
      expect(sobra + Math.floor((pago * usados) / 7)).toBe(pago);
    }
  });
});

describe("a conta do pedido em texto", () => {
  it("por dia, sem e com desconto", () => {
    expect(resumoDoPedido(cfgC, { modo: "dia", dias: 3 })).toBe("3 dias × R$ 30,00 = R$ 90,00");
    expect(resumoDoPedido(cfgC, { modo: "dia", dias: 7 })).toBe("7 dias × R$ 30,00 = R$ 210,00, menos 10% (R$ 21,00) = R$ 189,00");
    expect(resumoDoPedido(cfgC, { modo: "dia", dias: 1 })).toBe("1 dia × R$ 30,00 = R$ 30,00");
  });
  it("por clique, sem e com desconto", () => {
    expect(resumoDoPedido(cfgC, { modo: "clique", cliques: 100 })).toBe("100 cliques × R$ 1,50 = R$ 150,00");
    expect(resumoDoPedido(cfgC, { modo: "clique", cliques: 500 })).toBe("500 cliques × R$ 1,50 = R$ 750,00, menos 5% (R$ 37,50) = R$ 712,50");
    const um = validarConfigBannerPago({ clique: { minimoCliques: 1, precoCents: 100 } });
    expect(resumoDoPedido(um, { modo: "clique", cliques: 1 })).toBe("1 clique × R$ 1,00 = R$ 1,00");
  });
  it("a quantidade ruim lança o mesmo erro do preço", () => {
    expect(() => resumoDoPedido(cfgC, { modo: "clique", cliques: 5 })).toThrow(/mínimo/);
    expect(() => resumoDoPedido(cfgC, { modo: "dia", dias: 99 })).toThrow();
  });
  it("o aviso do prazo máximo sai da configuração", () => {
    expect(avisoDoPrazo(cfgC, "clique")).toContain("em 21 dias");
    expect(avisoDoPrazo(cfgC, "clique")).toMatch(/o que vier primeiro/);
    expect(avisoDoPrazo(cfgC, "clique")).toMatch(/crédito/);
    expect(avisoDoPrazo({ ...cfgC, clique: { ...cfgC.clique, prazoMaxDias: 1 } }, "clique")).toContain("em 1 dia,");
    expect(avisoDoPrazo(cfgC, "dia")).toMatch(/entra no ar/);
  });
});

describe("a previsão da fila: no mais tardar", () => {
  const agora = Date.UTC(2026, 9, 18, 12, 0, 0);
  const em = (dias: number) => agora + dias * DIA_MS;
  it("com vaga livre, entra agora", () => {
    expect(previsaoDaFilaDoBanner([em(5)], [3], 3, agora)).toEqual([agora]);
    expect(previsaoDaFilaDoBanner([], [3, 2], 3, agora)).toEqual([agora, agora]);
  });
  it("sem vaga, entra quando a primeira a acabar termina", () => {
    expect(previsaoDaFilaDoBanner([em(5), em(2), em(9)], [3], 3, agora)).toEqual([em(2)]);
  });
  it("a fila maior que as vagas encadeia pelas janelas de quem está na frente", () => {
    // 2 vagas, no ar: acaba em 4 e em 10. Fila: A (janela 3), B (janela 2), C (janela 5).
    // A entra em 4 (acaba em 7); B entra em 7 (acaba em 9); C entra em 9.
    expect(previsaoDaFilaDoBanner([em(4), em(10)], [3, 2, 5], 2, agora)).toEqual([em(4), em(7), em(9)]);
  });
  it("janelas diferentes: o pedido curto libera a vaga antes do longo", () => {
    expect(previsaoDaFilaDoBanner([em(1)], [30, 1, 1], 1, agora)).toEqual([em(1), em(31), em(32)]);
    expect(previsaoDaFilaDoBanner([em(10), em(10)], [1, 20], 2, agora)).toEqual([em(10), em(10)]);
  });
  it("banner já vencido não segura vaga; sem vaga nenhuma na plataforma, nunca entra", () => {
    expect(previsaoDaFilaDoBanner([agora - 5000], [2], 1, agora)).toEqual([agora]);
    expect(previsaoDaFilaDoBanner([], [2, 2], 0, agora)).toEqual([Infinity, Infinity]);
  });
  it("vagas reduzidas abaixo dos banners no ar: espera as que sobram acabarem", () => {
    // 3 no ar, a plataforma reduziu para 2 vagas: o próximo só entra quando 2 tiverem acabado.
    expect(previsaoDaFilaDoBanner([em(1), em(2), em(3)], [1], 2, agora)).toEqual([em(2)]);
  });
  it("não muda as listas de entrada", () => {
    const fins = [em(3), em(1)];
    previsaoDaFilaDoBanner(fins, [2], 2, agora);
    expect(fins).toEqual([em(3), em(1)]);
  });
});
