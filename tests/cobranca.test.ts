import { describe, it, expect } from "vitest";
import {
  validarConfigCobranca,
  validarFaixasPix,
  validarModo,
  faixaPixPara,
  taxaDoPedido,
  taxasEmCentavos,
  pctEquivalente,
  problemaNaCobranca,
  problemaNoTotalDoPedido,
  cobrancaNaPublicacao,
  mesEmSaoPaulo,
  configCobrancaGuardada,
  CONFIG_COBRANCA_PADRAO,
  TAXA_ZERO,
  aumentaAlgumaTaxa,
  primeiroDiaComAviso,
  problemaNaVigencia,
  tabelaVigente,
  tabelasDeCobranca,
  tabelaAgendadaGuardada,
  hojeEmSaoPaulo,
  dataDaVigencia,
  type CobrancaDaRifa,
  type ConfigCobranca,
} from "../shared/cobranca";
import { splitOrder } from "../shared/pricing";
import { percentualDoPromotor } from "../shared/plataforma";
import { creditoDoPresente } from "../shared/presente";

const FAIXAS = [
  { ate: 100, pct: 2 },
  { ate: 1000, pct: 1.5 },
  { ate: null, pct: 1 },
];

const rifa = (modo: CobrancaDaRifa["modo"]): CobrancaDaRifa => ({
  modo,
  percentualPct: 5,
  porCotaCents: 30,
  faixasPix: FAIXAS,
});

describe("tabela de cobrança da plataforma", () => {
  it("nasce sem cobrar nada", () => {
    expect(validarConfigCobranca(undefined)).toEqual(CONFIG_COBRANCA_PADRAO);
    expect(CONFIG_COBRANCA_PADRAO.percentualPct).toBe(0);
    expect(CONFIG_COBRANCA_PADRAO.porCotaCents).toBe(0);
  });

  it("aceita percentual com duas casas e recusa acima do teto ou com três casas", () => {
    expect(validarConfigCobranca({ percentualPct: 4.9 }).percentualPct).toBe(4.9);
    expect(() => validarConfigCobranca({ percentualPct: 31 })).toThrow();
    expect(() => validarConfigCobranca({ percentualPct: 1.234 })).toThrow();
    expect(() => validarConfigCobranca({ percentualPct: -1 })).toThrow();
  });

  it("valor por cota é inteiro em centavos, com teto", () => {
    expect(validarConfigCobranca({ porCotaCents: 25 }).porCotaCents).toBe(25);
    expect(() => validarConfigCobranca({ porCotaCents: 2.5 })).toThrow();
    expect(() => validarConfigCobranca({ porCotaCents: 10_001 })).toThrow();
  });

  it("só guarda as chaves conhecidas", () => {
    const c = validarConfigCobranca({ percentualPct: 3, extra: "<script>" } as never);
    expect(Object.keys(c).sort()).toEqual(["faixasPix", "percentualPct", "porCotaCents"]);
  });

  it("guardado estragado volta ao padrão sem derrubar nada", () => {
    expect(configCobrancaGuardada({ percentualPct: 99 })).toEqual(CONFIG_COBRANCA_PADRAO);
  });
});

describe("faixas da taxa Pix", () => {
  it("tetos sobem, taxa nunca sobe, última sem teto", () => {
    expect(validarFaixasPix(FAIXAS)).toEqual(FAIXAS);
    expect(() => validarFaixasPix([{ ate: 100, pct: 1 }, { ate: null, pct: 2 }])).toThrow(/não pode subir/);
    expect(() => validarFaixasPix([{ ate: 100, pct: 2 }, { ate: 50, pct: 1 }, { ate: null, pct: 1 }])).toThrow(/subir/);
    expect(() => validarFaixasPix([{ ate: 100, pct: 2 }])).toThrow(/última/);
    expect(() => validarFaixasPix([])).toThrow();
  });

  it("a transação de número N cai na faixa certa", () => {
    expect(faixaPixPara(0, FAIXAS).pct).toBe(2); // 1ª transação
    expect(faixaPixPara(99, FAIXAS).pct).toBe(2); // 100ª
    expect(faixaPixPara(100, FAIXAS).pct).toBe(1.5); // 101ª
    expect(faixaPixPara(999, FAIXAS).pct).toBe(1.5); // 1.000ª
    expect(faixaPixPara(1000, FAIXAS).pct).toBe(1); // 1.001ª
    expect(faixaPixPara(1_000_000, FAIXAS).pct).toBe(1);
  });
});

describe("taxa fotografada no pedido", () => {
  it("rifa sem cobrança (demonstração, publicada antes) não cobra nada", () => {
    expect(taxaDoPedido({ cobranca: null, pixOnline: true, transacoesPixNoMes: 0 })).toEqual(TAXA_ZERO);
  });

  it("percentual: guarda o percentual; por cota: guarda o valor", () => {
    expect(taxaDoPedido({ cobranca: rifa("percentual"), pixOnline: true, transacoesPixNoMes: 0 })).toEqual({
      modo: "percentual",
      vendaBp: 500,
      porCotaCents: 0,
      pixBp: 200,
    });
    expect(taxaDoPedido({ cobranca: rifa("por_cota"), pixOnline: true, transacoesPixNoMes: 500 })).toEqual({
      modo: "por_cota",
      vendaBp: 0,
      porCotaCents: 30,
      pixBp: 150,
    });
  });

  it("dinheiro e Pix na maquininha não pagam a taxa Pix", () => {
    expect(taxaDoPedido({ cobranca: rifa("percentual"), pixOnline: false, transacoesPixNoMes: 0 }).pixBp).toBe(0);
  });
});

describe("taxas em centavos e rateio", () => {
  it("percentual de 5% e Pix de 2% em R$ 100,00", () => {
    const t = taxasEmCentavos(
      { modo: "percentual", vendaBp: 500, porCotaCents: 0, pixBp: 200 },
      { totalCents: 10_000, pixCents: 10_000, quantidade: 10 },
    );
    expect(t).toEqual({ vendaCents: 500, pixCents: 200 });
  });

  it("por cota: R$ 0,30 × 10 cotas, mais o Pix", () => {
    const t = taxasEmCentavos(
      { modo: "por_cota", vendaBp: 0, porCotaCents: 30, pixBp: 150 },
      { totalCents: 10_000, pixCents: 10_000, quantidade: 10 },
    );
    expect(t).toEqual({ vendaCents: 300, pixCents: 150 });
  });

  it("as taxas juntas nunca passam do total", () => {
    const t = taxasEmCentavos(
      { modo: "por_cota", vendaBp: 0, porCotaCents: 500, pixBp: 1000 },
      { totalCents: 1_000, pixCents: 1_000, quantidade: 3 },
    );
    expect(t.vendaCents + t.pixCents).toBeLessThanOrEqual(1_000);
    expect(t.vendaCents).toBe(1_000);
    expect(t.pixCents).toBe(0);
  });

  it("a soma do rateio é EXATA com as taxas novas", () => {
    for (let pago = 0; pago <= 3_000; pago += 7) {
      for (const qtd of [1, 3, 10]) {
        for (const modo of ["percentual", "por_cota"] as const) {
          const t = taxasEmCentavos(
            { modo, vendaBp: 490, porCotaCents: 37, pixBp: 150 },
            { totalCents: pago, pixCents: pago, quantidade: qtd },
          );
          for (const com of [0, 10, 33]) {
            const r = splitOrder({ paidCents: pago, platformPct: 0, commissionPct: com, taxas: t });
            expect(r.platformFeeCents + r.commissionCents + r.organizerCents).toBe(pago);
            expect(r.platformFeeCents).toBe(r.saleFeeCents + r.pixFeeCents);
            expect(r.organizerCents).toBeGreaterThanOrEqual(0);
          }
        }
      }
    }
  });

  it("a comissão incide sobre o que sobrou das duas taxas", () => {
    const r = splitOrder({
      paidCents: 10_000,
      platformPct: 0,
      commissionPct: 10,
      taxas: { vendaCents: 300, pixCents: 150 },
    });
    expect(r.netAfterPlatformCents).toBe(9_550);
    expect(r.commissionCents).toBe(955);
    expect(r.organizerCents).toBe(8_595);
  });

  it("sem `taxas`, o rateio de antes não muda", () => {
    const r = splitOrder({ paidCents: 10_000, platformPct: 5, commissionPct: 10 });
    expect(r.platformFeeCents).toBe(500);
    expect(r.saleFeeCents).toBe(500);
    expect(r.pixFeeCents).toBe(0);
  });
});

describe("split do provedor", () => {
  it("o percentual equivalente nunca deixa a organização com a parte da taxa", () => {
    for (const [taxa, pix] of [[450, 10_000], [1, 333], [37, 1_000], [999, 1_000]]) {
      const pct = pctEquivalente(taxa, pix);
      const promotor = percentualDoPromotor(pct);
      // O que o split manda à organização, em centavos, sem passar da parte dela.
      expect(Math.floor((pix * promotor) / 100)).toBeLessThanOrEqual(pix - taxa);
    }
    expect(pctEquivalente(0, 10_000)).toBe(0);
    expect(pctEquivalente(100, 0)).toBe(0);
  });
});

describe("publicação", () => {
  it("por cota acima do preço da cota barra a publicação", () => {
    const cfg = { ...CONFIG_COBRANCA_PADRAO, porCotaCents: 100 };
    expect(problemaNaCobranca("por_cota", cfg, 100)).toMatch(/preço da cota/);
    expect(problemaNaCobranca("por_cota", cfg, 101)).toBeNull();
    expect(problemaNaCobranca("percentual", cfg, 50)).toBeNull();
  });

  it("a fotografia leva o modo e a tabela do dia", () => {
    const cfg = validarConfigCobranca({ percentualPct: 4, porCotaCents: 20, faixasPix: FAIXAS });
    expect(cobrancaNaPublicacao("por_cota", cfg)).toEqual({ modo: "por_cota", ...cfg });
  });

  it("modo desconhecido é recusado", () => {
    expect(validarModo("percentual")).toBe("percentual");
    expect(() => validarModo("mensalidade")).toThrow();
  });
});

describe("mês do volume", () => {
  it("o mês vira em São Paulo, não em UTC", () => {
    // 1º de novembro às 02:00 UTC ainda é 31 de outubro às 23:00 em Brasília.
    expect(mesEmSaoPaulo(new Date("2026-11-01T02:00:00Z"))).toBe("2026-10");
    expect(mesEmSaoPaulo(new Date("2026-11-01T04:00:00Z"))).toBe("2026-11");
  });
});

describe("pacote e cupom no modo por cota", () => {
  it("pacote que deixa a cota abaixo da taxa por cota barra", () => {
    // Cota de R$ 1,00, taxa R$ 0,80: o pacote de 10 com 30% sai R$ 0,70 a cota.
    expect(problemaNaCobranca("por_cota", { porCotaCents: 80 }, 100, [{ quantity: 10, discountPct: 30 }])).toMatch(/pacote de 10/);
    expect(problemaNaCobranca("por_cota", { porCotaCents: 80 }, 100, [{ quantity: 10, discountPct: 10 }])).toBeNull();
    expect(problemaNaCobranca("percentual", { porCotaCents: 80 }, 100, [{ quantity: 10, discountPct: 90 }])).toBeNull();
  });

  it("o pedido em que o cupom leva o total abaixo da taxa é recusado", () => {
    const t = { modo: "por_cota" as const, vendaBp: 0, porCotaCents: 80, pixBp: 0 };
    expect(problemaNoTotalDoPedido(t, 700, 10)).toMatch(/abaixo da taxa/);
    expect(problemaNoTotalDoPedido(t, 801, 10)).toBeNull();
    expect(problemaNoTotalDoPedido({ ...t, modo: "percentual" }, 1, 10)).toBeNull();
  });
});

describe("crédito do presente", () => {
  it("a parte da taxa no desconto é a proporção exata, para baixo", () => {
    // Taxa de 333 sobre 10.000; presente de 1.000: a taxa nele é 33 (33,3 para baixo).
    const c = creditoDoPresente({ presenteCents: 1_000, platformPct: 0, commissionPct: 0, comissaoGuardada: false, taxa: { cents: 333, totalCents: 10_000 } });
    expect(c).toBe(967);
  });
});

describe("estorno (cláusula X.10)", () => {
  it("o motivo sai do chamado; sem chamado, é o provedor", async () => {
    const { motivoDoEstorno } = await import("../shared/cobranca");
    expect(motivoDoEstorno(null)).toBe("provedor");
    expect(motivoDoEstorno({ tipoReembolso: "arrependimento", falhaPlataforma: false })).toBe("arrependimento");
    expect(motivoDoEstorno({ tipoReembolso: null, falhaPlataforma: false })).toBe("arrependimento");
    expect(motivoDoEstorno({ tipoReembolso: "com_taxa", falhaPlataforma: false })).toBe("com_taxa");
    expect(motivoDoEstorno({ tipoReembolso: "adiamento", falhaPlataforma: false })).toBe("adiamento");
    expect(motivoDoEstorno({ tipoReembolso: "com_taxa", falhaPlataforma: true })).toBe("falha_plataforma");
  });

  it("a taxa Pix só volta no arrependimento e na falha da plataforma", async () => {
    const { taxaPixFicaNoEstorno } = await import("../shared/cobranca");
    expect(taxaPixFicaNoEstorno("arrependimento")).toBe(false);
    expect(taxaPixFicaNoEstorno("falha_plataforma")).toBe(false);
    expect(taxaPixFicaNoEstorno("com_taxa")).toBe(true);
    expect(taxaPixFicaNoEstorno("adiamento")).toBe(true);
    expect(taxaPixFicaNoEstorno("provedor")).toBe(true);
  });
});

describe("tabela agendada (cláusula X.3, parágrafo único)", () => {
  const atual: ConfigCobranca = { percentualPct: 5, porCotaCents: 30, faixasPix: FAIXAS };
  // 10/10/2026, 15h em Brasília.
  const agora = new Date("2026-10-10T18:00:00Z");

  it("o dia é o de Brasília, e 30 dias de aviso são 30 dias inteiros", () => {
    expect(hojeEmSaoPaulo(new Date("2026-10-11T02:30:00Z"))).toBe("2026-10-10");
    expect(primeiroDiaComAviso(agora)).toBe("2026-11-10");
    // À meia-noite e um de Brasília, o próprio dia + 30 ainda tem 30 dias inteiros.
    expect(primeiroDiaComAviso(new Date("2026-10-10T03:00:00Z"))).toBe("2026-11-09");
    expect(dataDaVigencia("2026-11-10")).toBe("10/11/2026");
  });

  it("aumento é qualquer valor que sobe, inclusive a taxa Pix numa faixa só", () => {
    expect(aumentaAlgumaTaxa(atual, atual)).toBe(false);
    expect(aumentaAlgumaTaxa(atual, { ...atual, percentualPct: 4 })).toBe(false);
    expect(aumentaAlgumaTaxa(atual, { ...atual, percentualPct: 5.01 })).toBe(true);
    expect(aumentaAlgumaTaxa(atual, { ...atual, porCotaCents: 31 })).toBe(true);
    // Baixar o teto da primeira faixa empurra as transações 51 a 100 para 1,5%: redução.
    expect(aumentaAlgumaTaxa(atual, { ...atual, faixasPix: [{ ate: 50, pct: 2 }, { ate: 1000, pct: 1.5 }, { ate: null, pct: 1 }] })).toBe(false);
    // Subir o teto da primeira faixa deixa as transações 101 a 200 em 2%: aumento.
    expect(aumentaAlgumaTaxa(atual, { ...atual, faixasPix: [{ ate: 200, pct: 2 }, { ate: 1000, pct: 1.5 }, { ate: null, pct: 1 }] })).toBe(true);
    // Uma faixa só, mais alta que a última de antes.
    expect(aumentaAlgumaTaxa(atual, { ...atual, faixasPix: [{ ate: null, pct: 1.2 }] })).toBe(true);
  });

  it("redução vale na hora; aumento exige 30 dias, salvo sem promotora com contrato", () => {
    const menor = { ...atual, percentualPct: 4 };
    const maior = { ...atual, percentualPct: 6 };
    const base = { antes: atual, agora, comPromotoras: true };
    expect(problemaNaVigencia({ ...base, depois: menor, vigenteEm: null })).toBeNull();
    expect(problemaNaVigencia({ ...base, depois: maior, vigenteEm: null })).toMatch(/30 dias de aviso.*10\/11\/2026/);
    expect(problemaNaVigencia({ ...base, depois: maior, vigenteEm: "2026-11-09" })).toMatch(/30 dias/);
    expect(problemaNaVigencia({ ...base, depois: maior, vigenteEm: "2026-11-10" })).toBeNull();
    expect(problemaNaVigencia({ ...base, comPromotoras: false, depois: maior, vigenteEm: null })).toBeNull();
  });

  it("a data é conferida: formato, dia que existe, futuro e até um ano", () => {
    const base = { antes: atual, depois: atual, agora, comPromotoras: true };
    expect(problemaNaVigencia({ ...base, vigenteEm: "10/11/2026" })).toMatch(/inválida/);
    expect(problemaNaVigencia({ ...base, vigenteEm: "2026-02-30" })).toMatch(/inválida/);
    expect(problemaNaVigencia({ ...base, vigenteEm: "2026-10-10" })).toMatch(/futuro/);
    expect(problemaNaVigencia({ ...base, vigenteEm: "2027-12-01" })).toMatch(/365 dias/);
    expect(problemaNaVigencia({ ...base, vigenteEm: "2026-10-11" })).toBeNull();
  });

  it("a agendada passa a valer à meia-noite de Brasília do dia marcado", () => {
    const nova = { ...atual, percentualPct: 6 };
    const proxima = { vigenteEm: "2026-11-10", tabela: nova };
    expect(tabelaVigente(atual, proxima, new Date("2026-11-10T02:59:59Z"))).toBe(atual);
    expect(tabelaVigente(atual, proxima, new Date("2026-11-10T03:00:00Z"))).toBe(nova);
    expect(tabelaVigente(atual, null, agora)).toBe(atual);
    expect(tabelasDeCobranca(atual, proxima, agora)).toEqual({ vigente: atual, proxima });
    // Já valendo, não é mais "a próxima".
    expect(tabelasDeCobranca(atual, proxima, new Date("2026-11-11T12:00:00Z"))).toEqual({ vigente: nova, proxima: null });
  });

  it("a agendada guardada fora da régua some, sem derrubar a configuração", () => {
    expect(tabelaAgendadaGuardada(null)).toBeNull();
    expect(tabelaAgendadaGuardada({ vigenteEm: "amanhã", tabela: atual })).toBeNull();
    expect(tabelaAgendadaGuardada({ vigenteEm: "2026-11-10", tabela: { percentualPct: 500 } })).toBeNull();
    expect(tabelaAgendadaGuardada({ vigenteEm: "2026-11-10", tabela: atual, extra: 1 })).toEqual({ vigenteEm: "2026-11-10", tabela: atual });
  });
});
