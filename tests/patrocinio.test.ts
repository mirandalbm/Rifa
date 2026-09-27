import { describe, expect, it } from "vitest";
import {
  CONFIG_PATROCINIO_PADRAO as CFG,
  descontoPara,
  ehRobo,
  gastoAte,
  indicadores,
  normalizarCidade,
  precoDoPacote,
  previsaoDaFila,
  problemaNaRecarga,
  segmentoDe,
  segmentosDeQuemOlha,
  validarConfigPatrocinio,
} from "@shared/patrocinio";

describe("robô não conta", () => {
  it("reconhece buscador, pré-visualização e automação", () => {
    for (const ua of ["Googlebot/2.1", "facebookexternalhit/1.1", "WhatsApp/2.23", "curl/8.0", "HeadlessChrome/120", "python-requests/2.31", "", null]) {
      expect(ehRobo(ua)).toBe(true);
    }
  });
  it("deixa passar navegador de gente", () => {
    expect(ehRobo("Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/124 Mobile Safari/537.36")).toBe(false);
  });
});

describe("configuração", () => {
  it("padrão sem nada, e só chaves conhecidas", () => {
    expect(validarConfigPatrocinio(undefined)).toEqual(CFG);
    const c = validarConfigPatrocinio({ ...CFG, extra: 1 } as never);
    expect(Object.keys(c).sort()).toEqual(["faixas", "minimoCliques", "precos", "recargaMinimaCents", "vagas"]);
  });
  it("faixas ordenadas e com desconto crescente", () => {
    const c = validarConfigPatrocinio({ ...CFG, faixas: [{ aPartirDe: 1000, descontoPct: 10 }, { aPartirDe: 100, descontoPct: 5 }] });
    expect(c.faixas.map((f) => f.aPartirDe)).toEqual([100, 1000]);
    expect(() => validarConfigPatrocinio({ ...CFG, faixas: [{ aPartirDe: 100, descontoPct: 10 }, { aPartirDe: 1000, descontoPct: 5 }] })).toThrow(/crescer/);
    expect(() => validarConfigPatrocinio({ ...CFG, faixas: [{ aPartirDe: 100, descontoPct: 5 }, { aPartirDe: 100, descontoPct: 8 }] })).toThrow(/mesmo/);
  });
  it("recusa preço e vagas fora do limite", () => {
    expect(() => validarConfigPatrocinio({ ...CFG, precos: { ...CFG.precos, cidade: 0 } })).toThrow(/cidade/);
    expect(() => validarConfigPatrocinio({ ...CFG, vagas: { ...CFG.vagas, nacional: 9 } })).toThrow(/Brasil/);
  });
});

describe("preço do pacote", () => {
  it("tabela por alcance e desconto da maior faixa alcançada", () => {
    expect(descontoPara(CFG.faixas, 499)).toBe(0);
    expect(descontoPara(CFG.faixas, 1000)).toBe(10);
    expect(precoDoPacote(CFG, "nacional", 100)).toEqual({ precoCliqueCents: 60, descontoPct: 0, brutoCents: 6000, totalCents: 6000 });
    expect(precoDoPacote(CFG, "cidade", 1000).totalCents).toBe(22500);
  });
  it("arredonda para baixo", () => {
    const cfg = { ...CFG, precos: { ...CFG.precos, estado: 33 }, faixas: [{ aPartirDe: 50, descontoPct: 7 }] };
    // 33 × 51 = 1683; 93% = 1565,19 → 1565
    expect(precoDoPacote(cfg, "estado", 51).totalCents).toBe(1565);
  });
  it("respeita o mínimo", () => {
    expect(() => precoDoPacote(CFG, "nacional", 10)).toThrow(/mínimo/);
  });
  it("o gasto clique a clique soma exatamente o que foi pago", () => {
    const pago = 1565;
    const comprados = 51;
    let soma = 0;
    for (let u = 1; u <= comprados; u++) soma += gastoAte(pago, comprados, u) - gastoAte(pago, comprados, u - 1);
    expect(soma).toBe(pago);
    expect(gastoAte(pago, comprados, 999)).toBe(pago);
  });
});

describe("segmentos", () => {
  it("cidade sem acento e sem caixa", () => {
    expect(normalizarCidade("  São   José ")).toBe("sao jose");
    expect(segmentoDe("cidade", "SP", "São José dos Campos")).toBe("cidade:SP:sao jose dos campos");
    expect(segmentoDe("estado", "RN")).toBe("estado:RN");
    expect(segmentoDe("nacional")).toBe("nacional");
    expect(() => segmentoDe("estado", null)).toThrow(/estado/);
    expect(() => segmentoDe("cidade", "SP", "")).toThrow(/cidade/);
  });
  it("quem olha vê cidade, estado e Brasil, nessa ordem", () => {
    expect(segmentosDeQuemOlha("SP", "Campinas").map((s) => s.segmento)).toEqual(["cidade:SP:campinas", "estado:SP", "nacional"]);
    expect(segmentosDeQuemOlha(null, null).map((s) => s.segmento)).toEqual(["nacional"]);
  });
});

describe("previsaoDaFila", () => {
  it("uma vaga: cada um entra quando o da frente acaba", () => {
    expect(previsaoDaFila([30], [100, 50], 1)).toEqual([30, 130]);
  });
  it("vaga livre: entra já", () => {
    expect(previsaoDaFila([10], [100], 2)).toEqual([0]);
  });
  it("duas vagas no mesmo ritmo: o primeiro a acabar abre a vaga", () => {
    // vagas terminam em 10 e 40 cliques cada → o 1º da fila entra em 10×2 = 20 cliques do segmento
    expect(previsaoDaFila([40, 10], [5, 100], 2)).toEqual([20, 30]);
  });
});

describe("indicadores e recarga", () => {
  it("taxa, custo e retorno, sem dividir por zero", () => {
    const i = indicadores({ exibicoes: 1000, cliques: 50, gastoCents: 2000, pedidos: 6, vendas: 4, receitaCents: 9000 });
    expect(i.taxaDeCliquePct).toBe(5);
    expect(i.conversaoPct).toBe(8);
    expect(i.custoPorCliqueCents).toBe(40);
    expect(i.custoPorVendaCents).toBe(500);
    expect(i.retorno).toBe(4.5);
    const z = indicadores({ exibicoes: 0, cliques: 0, gastoCents: 0, pedidos: 0, vendas: 0, receitaCents: 0 });
    expect([z.taxaDeCliquePct, z.custoPorVendaCents, z.retorno]).toEqual([null, null, null]);
  });
  it("recarga respeita o mínimo", () => {
    expect(problemaNaRecarga(1000, 2000)).toMatch(/mínima/);
    expect(problemaNaRecarga(2000, 2000)).toBeNull();
    expect(problemaNaRecarga(2_000_000, 2000)).toMatch(/máxima/);
  });
});
