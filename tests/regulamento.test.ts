import { describe, it, expect } from "vitest";
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
  cotasPremiadas: ["R$ 100 no Pix", "R$ 100 no Pix", "R$ 50 no Pix"],
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
    expect(t).toContain("2 × R$ 100 no Pix; R$ 50 no Pix");
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
});
