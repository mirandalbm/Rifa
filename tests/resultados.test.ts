import { describe, it, expect } from "vitest";
import {
  canalDaVenda,
  diaNoFuso,
  participacao,
  serieDiaria,
  ticketMedio,
  validarOrigem,
  validarPeriodo,
} from "../shared/resultados";

describe("origem e canal da venda", () => {
  it("origem fora da lista vira nula (vem do navegador)", () => {
    expect(validarOrigem("story")).toBe("story");
    expect(validarOrigem("hacker")).toBeNull();
    expect(validarOrigem("__proto__")).toBeNull();
    expect(validarOrigem(undefined)).toBeNull();
  });

  it("quem vendeu manda: cambista, depois afiliado, depois a origem do site", () => {
    expect(canalDaVenda({ sellerId: "s", affiliateId: "a", origem: "story" })).toBe("cambista");
    expect(canalDaVenda({ sellerId: null, affiliateId: "a", origem: "story" })).toBe("afiliado");
    expect(canalDaVenda({ sellerId: null, affiliateId: null, origem: "banner" })).toBe("banner");
    expect(canalDaVenda({ sellerId: null, affiliateId: null, origem: null })).toBe("direto");
    expect(canalDaVenda({ sellerId: null, affiliateId: null, origem: "inventada" })).toBe("direto");
  });
});

describe("contas do painel", () => {
  it("ticket médio é inteiro e arredonda para baixo", () => {
    expect(ticketMedio(1000, 3)).toBe(333);
    expect(ticketMedio(0, 0)).toBe(0);
  });

  it("participação com uma casa", () => {
    expect(participacao(1, 3)).toBe(33.3);
    expect(participacao(5, 0)).toBe(0);
  });

  it("período só da lista", () => {
    expect(validarPeriodo("7")).toBe(7);
    expect(validarPeriodo(90)).toBe(90);
    expect(validarPeriodo("365")).toBe(30);
  });
});

describe("dias no fuso de São Paulo", () => {
  it("23h em São Paulo ainda é o mesmo dia (em UTC já é o seguinte)", () => {
    expect(diaNoFuso(new Date("2026-10-02T02:00:00Z"))).toBe("2026-10-01");
    expect(diaNoFuso(new Date("2026-10-02T03:00:00Z"))).toBe("2026-10-02");
  });

  it("a série preenche com zero os dias sem venda e termina hoje", () => {
    const hoje = new Date("2026-10-05T15:00:00Z");
    const s = serieDiaria([{ dia: "2026-10-03", v: 7 }], 5, hoje, (dia) => ({ dia, v: 0 }));
    expect(s.map((d) => d.dia)).toEqual(["2026-10-01", "2026-10-02", "2026-10-03", "2026-10-04", "2026-10-05"]);
    expect(s.map((d) => d.v)).toEqual([0, 0, 7, 0, 0]);
  });
});
