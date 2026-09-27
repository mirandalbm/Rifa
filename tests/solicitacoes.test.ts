import { describe, expect, it } from "vitest";
import {
  ADIAMENTO_MAX_DIAS,
  podeExcluir,
  problemaNoAdiamento,
  protocoloDaSolicitacao,
  validarEdicao,
} from "@shared/solicitacoes";

const ATUAL = {
  title: "Rifa do carro",
  description: null,
  minPerOrder: 1,
  maxPerOrder: 1000,
  reservationTtlMin: 15,
  commissionPctDefault: 10,
};

describe("validarEdicao", () => {
  it("devolve só o que muda, com o antes", () => {
    const r = validarEdicao({ title: "Rifa do carro novo", maxPerOrder: "300", minPerOrder: 1 }, ATUAL);
    expect(r).toEqual({
      ok: true,
      alteracoes: {
        title: { de: "Rifa do carro", para: "Rifa do carro novo" },
        maxPerOrder: { de: 1000, para: 300 },
      },
    });
  });

  it("o prêmio, o preço e o total nunca mudam depois de publicar", () => {
    for (const campo of ["prizeTitle", "priceCents", "totalQuotas", "slug"]) {
      const r = validarEdicao({ [campo]: "x" }, ATUAL);
      expect(r.ok).toBe(false);
    }
  });

  it("recusa máximo menor que o mínimo, reserva fora da faixa e nada mudando", () => {
    expect(validarEdicao({ minPerOrder: 10, maxPerOrder: 5 }, ATUAL).ok).toBe(false);
    expect(validarEdicao({ reservationTtlMin: 2 }, ATUAL).ok).toBe(false);
    expect(validarEdicao({ commissionPctDefault: 51 }, ATUAL).ok).toBe(false);
    expect(validarEdicao({ minPerOrder: 1.5 }, ATUAL).ok).toBe(false);
    expect(validarEdicao({ title: "Rifa do carro" }, ATUAL).ok).toBe(false);
  });

  it("ignora campo desconhecido", () => {
    const r = validarEdicao({ title: "Outro título", featured: true, status: "published" }, ATUAL);
    expect(r.ok && Object.keys(r.alteracoes)).toEqual(["title"]);
  });
});

describe("problemaNoAdiamento", () => {
  const agora = new Date("2026-09-27T12:00:00Z");
  const drawAt = new Date("2026-10-04T12:00:00Z");
  const base = {
    status: "published",
    sorteada: false,
    drawAt,
    vendidas: 10,
    total: 100,
    novaData: new Date("2026-11-04T12:00:00Z"),
    motivo: "Vendemos só 10% até agora",
    agora,
  };

  it("aceita adiamento dentro das regras", () => {
    expect(problemaNoAdiamento(base)).toBeNull();
  });

  it("meta atingida, rascunho ou já sorteada não adia", () => {
    expect(problemaNoAdiamento({ ...base, vendidas: 100 })).toMatch(/meta/);
    expect(problemaNoAdiamento({ ...base, status: "draft" })).not.toBeNull();
    expect(problemaNoAdiamento({ ...base, sorteada: true })).not.toBeNull();
  });

  it("a data nova vem depois da atual, com 24 h e até o limite", () => {
    expect(problemaNoAdiamento({ ...base, novaData: drawAt })).toMatch(/depois/);
    const ontemDoSorteio = new Date(agora.getTime() - 86_400_000);
    expect(
      problemaNoAdiamento({ ...base, drawAt: ontemDoSorteio, novaData: new Date(agora.getTime() + 3600_000) }),
    ).toMatch(/24 horas/);
    expect(
      problemaNoAdiamento({ ...base, novaData: new Date(drawAt.getTime() + (ADIAMENTO_MAX_DIAS + 1) * 86_400_000) }),
    ).toMatch(/dias/);
  });

  it("exige motivo", () => {
    expect(problemaNoAdiamento({ ...base, motivo: "curto" })).toMatch(/motivo/);
  });
});

describe("podeExcluir", () => {
  it("rascunho, no ar sem venda e teste; com venda, não", () => {
    expect(podeExcluir({ status: "draft", vendidas: 0 })).toBe(true);
    expect(podeExcluir({ status: "published", vendidas: 0 })).toBe(true);
    expect(podeExcluir({ status: "published", vendidas: 1 })).toBe(false);
    expect(podeExcluir({ status: "closed", vendidas: 0 })).toBe(false);
    expect(podeExcluir({ status: "published", vendidas: 5, demonstracao: true })).toBe(true);
  });
});

it("protocolo RS no dia de São Paulo", () => {
  expect(protocoloDaSolicitacao(new Date("2026-09-28T02:00:00Z"), () => 42)).toBe("RS-20260927-000042");
});
