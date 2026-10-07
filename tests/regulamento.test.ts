import { describe, it, expect } from "vitest";
import { REGRA_DA_APROXIMACAO, contempladoPorAproximacao } from "../shared/sorteio";
import { cotasMinimasParaSortear, minimoAtingido, minimoDoModo, modoValido, problemaNoMinimoVendido, proximaExtracaoFederal } from "../shared/campanhaLegal";
import { montarRegulamento, validarRegulamentoExtra, REGULAMENTO_EXTRA_MAX, type DadosDoRegulamento } from "../shared/regulamento";

const base: DadosDoRegulamento = {
  rifa: {
    title: "Moto",
    prizeTitle: "Moto 0 km",
    totalQuotas: 10_000,
    priceCents: 250,
    minPerOrder: 1,
    maxPerOrder: 500,
    reservationTtlMin: 15,
    drawAt: "2026-10-17T22:00:00Z",
    authorizationCode: "03.021234/2026",
    drawSeedHash: "ab".repeat(32),
    regulamentoExtra: null,
  },
  promotora: { nome: "Rifas SJ", cnpj: "12.345.678/0001-90", endereco: "Av. Paulista, 1000 — São Paulo/SP", contato: "(11) 3333-4444" },
  cotasPremiadas: ["Fone bluetooth", "Fone bluetooth", "Caixa de som"],
  taxaReembolsoPct: 10,
  aceitaReembolso: true,
};

const texto = (d: DadosDoRegulamento) => montarRegulamento(d).flatMap((s) => [s.titulo, ...s.itens]).join("\n");

describe("regulamento da rifa", () => {
  it("sai dos mesmos dados da rifa: promotora, autorização, numeração, preço e sorteio", () => {
    const t = texto(base);
    expect(t).toContain("Rifas SJ, CNPJ 12.345.678/0001-90, com sede em Av. Paulista, 1000");
    expect(t).toContain("certificado nº 03.021234/2026");
    expect(t).toContain("numeradas de 00001 a 10000");
    expect(t).toMatch(/R\$\s2,50 cada/);
    expect(t).toContain("17/10/2026 às 19:00 (horário de Brasília)");
    expect(t).toContain("ab".repeat(32));
  });

  it("cotas premiadas aparecem pela descrição, agrupadas — nunca pelo número", () => {
    const t = texto(base);
    expect(t).toContain("2 × Fone bluetooth; Caixa de som");
  });

  it("o presente ligado entra no regulamento; desligado, não (resposta 6.2)", () => {
    expect(texto(base)).not.toContain("Desconto de primeira compra");
    expect(texto({ ...base, presente: { ligado: false, pct: 10, tetoCents: 1000 } })).not.toContain("Desconto de primeira compra");
    const t = texto({ ...base, presente: { ligado: true, pct: 15, tetoCents: 2500 } });
    expect(t).toContain("Desconto de primeira compra");
    expect(t).toContain("15% de desconto");
    expect(t).toMatch(/até R\$\s25,00/);
  });

  it("a regra de reembolso é a mesma da tela de compra", () => {
    expect(texto(base)).toContain("taxa administrativa de 10%");
    expect(texto({ ...base, aceitaReembolso: false })).toContain("não aceita pedidos de reembolso");
  });

  it("o texto da promotora vira a última seção, um item por parágrafo", () => {
    const s = montarRegulamento({ ...base, rifa: { ...base.rifa, regulamentoExtra: "Entrega em SP.\n\nFoto do ganhador divulgada." } });
    expect(s.at(-1)).toEqual({ titulo: "9. Disposições da promotora", itens: ["Entrega em SP.", "Foto do ganhador divulgada."] });
    expect(montarRegulamento(base).some((x) => x.titulo.includes("Disposições"))).toBe(false);
  });

  it("número não vendido segue a regra da aproximação, e o prêmio prescrito vai ao Tesouro", () => {
    const t = texto(base);
    expect(t).toContain(REGRA_DA_APROXIMACAO);
    expect(t).not.toContain("a promotora informa o procedimento");
    expect(t).toContain("prescreve em 180 dias");
    expect(t).toContain("recolhido ao Tesouro Nacional");
    expect(t).toContain("em até 30 dias após o sorteio");
  });

  it("texto da promotora tem limite e vira nulo quando vazio", () => {
    expect(validarRegulamentoExtra("  \n\n  ")).toBeNull();
    expect(() => validarRegulamentoExtra("a".repeat(REGULAMENTO_EXTRA_MAX + 1))).toThrow(/3000/);
    expect(() => validarRegulamentoExtra(5)).toThrow();
  });
});

import { perguntasDaAjuda, buscarNaAjuda } from "../shared/ajuda";

describe("central de ajuda", () => {
  it("a resposta de reembolso segue a regra configurada", () => {
    const com = perguntasDaAjuda({ taxaReembolsoPct: 7, aceitaReembolso: true });
    expect(com.find((p) => p.id === "reembolso")!.resposta[0]).toContain("7%");
    const sem = perguntasDaAjuda({ taxaReembolsoPct: 7, aceitaReembolso: false });
    expect(sem.find((p) => p.id === "reembolso")!.resposta[0]).toContain("não recebe");
  });

  it("busca sem acento", () => {
    const todas = perguntasDaAjuda({ taxaReembolsoPct: 10, aceitaReembolso: true });
    expect(buscarNaAjuda(todas, "SORTEADO").map((p) => p.id)).toContain("como-sorteia");
    expect(buscarNaAjuda(todas, "  ")).toHaveLength(todas.length);
    expect(new Set(todas.map((p) => p.id)).size).toBe(todas.length);
  });

  it("cota de bônus só entra no regulamento da rifa que a aceita", () => {
    expect(texto(base)).not.toMatch(/cotas de bônus/);
    expect(texto({ ...base, rifa: { ...base.rifa, aceitaCotaBonus: true } })).toMatch(/cotas de bônus/);
    expect(texto({ ...base, rifa: { ...base.rifa, aceitaCotaBonus: true, bonusMaxCotas: 10 } })).toMatch(/DISTRIBUIÇÃO PROMOCIONAL/);
  });

  it("a cláusula do bônus diz a quantidade autorizada", () => {
    const t = texto({ ...base, rifa: { ...base.rifa, aceitaCotaBonus: true, bonusMaxCotas: 120 } });
    expect(t).toMatch(/até 120 Números da Sorte/);
    expect(t).toMatch(/não contabilizam para o cômputo da viabilidade financeira/);
  });
});

describe("regra da aproximação", () => {
  it("o sorteado vendido leva", () => {
    expect(contempladoPorAproximacao({ sorteado: 50, sorteadoVendido: true, acima: 51, abaixo: 49 })).toBe(50);
  });
  it("não vendido: o imediatamente acima, antes do abaixo", () => {
    expect(contempladoPorAproximacao({ sorteado: 50, sorteadoVendido: false, acima: 57, abaixo: 49 })).toBe(57);
  });
  it("sem nenhum acima, o imediatamente abaixo", () => {
    expect(contempladoPorAproximacao({ sorteado: 1000, sorteadoVendido: false, acima: null, abaixo: 998 })).toBe(998);
  });
  it("nenhuma cota paga: sem contemplado", () => {
    expect(contempladoPorAproximacao({ sorteado: 7, sorteadoVendido: false, acima: null, abaixo: null })).toBeNull();
  });
  it("número do lado errado não vale (defesa contra consulta trocada)", () => {
    expect(contempladoPorAproximacao({ sorteado: 50, sorteadoVendido: false, acima: 40, abaixo: 60 })).toBeNull();
  });
});

describe("mínimo de cotas vendidas para sortear", () => {
  it("arredonda para cima e 0 é sem mínimo", () => {
    expect(cotasMinimasParaSortear(1000, 0)).toBe(0);
    expect(cotasMinimasParaSortear(1000, 50)).toBe(500);
    expect(cotasMinimasParaSortear(10, 33)).toBe(4);
    expect(cotasMinimasParaSortear(1_000_000, 100)).toBe(1_000_000);
  });
  it("atingido só com as cotas exigidas", () => {
    expect(minimoAtingido(499, 1000, 50)).toBe(false);
    expect(minimoAtingido(500, 1000, 50)).toBe(true);
    expect(minimoAtingido(0, 1000, 0)).toBe(true);
  });
  it("só inteiro de 0 a 100", () => {
    expect(problemaNoMinimoVendido(0)).toBeNull();
    expect(problemaNoMinimoVendido(100)).toBeNull();
    for (const ruim of [-1, 101, 12.5, "50", null, Number.NaN]) expect(problemaNoMinimoVendido(ruim)).not.toBeNull();
  });
  it("entra no regulamento com o número de cotas; sem mínimo, não aparece", () => {
    const t = montarRegulamento({ ...base, rifa: { ...base.rifa, minimoVendidoPct: 40 } }).flatMap((x) => x.itens).join("\n");
    expect(t).toContain("pelo menos 40% das cotas vendidas e pagas (4.000 cotas)");
    expect(t).toContain("adiado");
    expect(texto(base)).not.toContain("pelo menos");
  });
});

describe("modos do sorteio (rifa cheia)", () => {
  it("só os quatro modos conhecidos", () => {
    for (const m of ["data", "cheia_com_data", "quando_completar", "promotora_completa"]) expect(modoValido(m)).toBe(true);
    for (const m of ["", "cheia", null, 1]) expect(modoValido(m)).toBe(false);
  });
  it("rifa cheia exige 100%, a promotora completando não tem mínimo, na data vale o escolhido", () => {
    expect(minimoDoModo("cheia_com_data", 10)).toBe(100);
    expect(minimoDoModo("quando_completar", 0)).toBe(100);
    expect(minimoDoModo("promotora_completa", 40)).toBe(0);
    expect(minimoDoModo("data", 40)).toBe(40);
  });
  it("a próxima extração da Federal é quarta ou sábado às 19h de Brasília, com 24 h de folga", () => {
    // segunda 2026-10-05 10:00 UTC → quarta 07/10 22:00 UTC
    expect(proximaExtracaoFederal(new Date("2026-10-05T10:00:00Z")).toISOString()).toBe("2026-10-07T22:00:00.000Z");
    // quarta 07/10 às 21:00 UTC (falta 1 h): pula para sábado 10/10
    expect(proximaExtracaoFederal(new Date("2026-10-07T21:00:00Z")).toISOString()).toBe("2026-10-10T22:00:00.000Z");
    // sábado 10/10 23:00 UTC → quarta 14/10
    expect(proximaExtracaoFederal(new Date("2026-10-10T23:00:00Z")).toISOString()).toBe("2026-10-14T22:00:00.000Z");
  });
  it("regulamento de cada modo", () => {
    const de = (modo: string, drawAt: string | null = base.rifa.drawAt as string) =>
      montarRegulamento({ ...base, rifa: { ...base.rifa, modoSorteio: modo, drawAt } }).flatMap((x) => x.itens).join("\n");
    expect(de("cheia_com_data")).toContain("todas as cotas vendidas e pagas (rifa cheia)");
    const completar = de("quando_completar", null);
    expect(completar).toContain("não tem data marcada");
    expect(completar).toContain("quartas e sábados");
    const promotora = de("promotora_completa");
    expect(promotora).toContain("ficam com a promotora");
    expect(promotora).not.toContain(REGRA_DA_APROXIMACAO);
    expect(de("data")).toContain(REGRA_DA_APROXIMACAO);
  });
  it("item 9: a rifa autorizada traz a busca alternada (Federal) ou o ressorteio (globo) e os impedidos", () => {
    const de = (metodoApuracao: string) =>
      montarRegulamento({ ...base, rifa: { ...base.rifa, totalQuotas: 1_000, metodoApuracao } }).flatMap((x) => x.itens).join("\n");
    const federal = de("federal_direta");
    expect(federal).toContain("e assim alternadamente até que seja identificado um contemplado");
    expect(federal).not.toContain(REGRA_DA_APROXIMACAO);
    expect(federal).toMatch(/não podem participar desta promoção a promotora/i);
    const globo = de("globo");
    expect(globo).toContain("proceder-se-á, no mesmo ato e imediatamente, ao sorteio de novos Números da Sorte");
    expect(globo).toContain("Sorteio inválido – cota não vendida");
    expect(globo).not.toContain("alternadamente");
  });
});

describe("quando completar com data máxima (8.7) e cotas premiadas como vale-brinde (8.8)", () => {
  const rifa = { ...base.rifa, totalQuotas: 1_000, metodoApuracao: "federal_direta", modoSorteio: "quando_completar" };
  const texto = (d: DadosDoRegulamento) => montarRegulamento(d).flatMap((s) => s.itens).join("\n");
  it("a data registrada é a máxima, e a antecipação é anunciada", () => {
    const t = texto({ ...base, rifa: { ...rifa, drawAt: "2027-01-06T22:00:00Z", drawAtMaximo: "2027-01-06T22:00:00Z" } });
    expect(t).toContain("O sorteio será realizado até 06/01/2027");
    expect(t).toContain("antecipado para a extração da Loteria Federal imediatamente subsequente");
    expect(t).toContain("mediante comunicado na plataforma");
    expect(t).not.toContain("foi antecipado para");
  });
  it("antecipada, diz a data nova", () => {
    const t = texto({ ...base, rifa: { ...rifa, drawAt: "2026-11-04T22:00:00Z", drawAtMaximo: "2027-01-06T22:00:00Z" } });
    expect(t).toContain("A rifa completou: o sorteio foi antecipado para 04/11/2026");
  });
  it("cota premiada na rifa autorizada é vale-brinde: promoção mista", () => {
    const t = texto({ ...base, rifa: { ...rifa, drawAt: "2027-01-06T22:00:00Z" }, cotasPremiadas: ["Fone bluetooth"] });
    expect(t).toContain("modalidade vale-brinde");
    expect(t).toContain("promoção mista");
    expect(texto({ ...base, rifa: { ...rifa, drawAt: "2027-01-06T22:00:00Z" }, cotasPremiadas: [] })).not.toContain("vale-brinde");
  });
  it("o globo leva a cláusula do globo e a sessão", () => {
    const t = texto({
      ...base,
      rifa: { ...base.rifa, totalQuotas: 1_000, metodoApuracao: "globo", drawAt: "2026-12-05T22:00:00Z", sorteioOficial: { loteria: "globo", concurso: 12 } },
    });
    expect(t).toContain("6 (seis) globos independentes");
    expect(t).toContain("ata notarial lavrada por tabelião");
    expect(t).toContain("sessão nº 12 do globo da plataforma");
    expect(t).toContain("o ganhador será o detentor do número 139");
    expect(t).not.toMatch(/semente|hash/i);
  });
});
