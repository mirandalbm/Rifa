import { describe, expect, it } from "vitest";
import { NOTA_MAX, NOTA_MS, notaAte, notaVigente, validarNota } from "../shared/perfilApostador";

describe("nota de 24 horas: validação", () => {
  it("aceita texto curto e devolve sem espaços sobrando", () => {
    expect(validarNota("  Viajando   amanhã  ")).toEqual({ ok: true, nota: "Viajando amanhã" });
  });

  it("vazio ou nulo apaga a nota", () => {
    expect(validarNota(null)).toEqual({ ok: true, nota: null });
    expect(validarNota(undefined)).toEqual({ ok: true, nota: null });
    expect(validarNota("   ")).toEqual({ ok: true, nota: null });
  });

  it(`recusa mais de ${NOTA_MAX} letras`, () => {
    const r = validarNota("a".repeat(NOTA_MAX + 1));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.erro).toContain(`${NOTA_MAX} caracteres`);
  });

  it("aceita exatamente o limite", () => {
    expect(validarNota("a".repeat(NOTA_MAX))).toEqual({ ok: true, nota: "a".repeat(NOTA_MAX) });
  });

  it("recusa link e telefone (a régua do comentário)", () => {
    expect(validarNota("veja em https://exemplo.com.br").ok).toBe(false);
    expect(validarNota("me chama 11 99876 5432").ok).toBe(false);
  });

  it("recusa pedido de Pix por fora, mas deixa passar Pix pelo site", () => {
    const fora = validarNota("faz um pix pra mim");
    expect(fora.ok).toBe(false);
    if (!fora.ok) expect(fora.erro).toContain("pagamento por fora");
    expect(validarNota("paguei com Pix pelo site").ok).toBe(true);
  });

  it("recusa o que não é texto", () => {
    expect(validarNota(42).ok).toBe(false);
  });
});

describe("nota de 24 horas: prazo", () => {
  const escrita = new Date("2026-10-14T12:00:00Z");

  it("vale 24 horas a partir de quando foi escrita", () => {
    expect(notaAte(escrita)?.getTime()).toBe(escrita.getTime() + NOTA_MS);
  });

  it("vale até o último instante antes de completar as 24 horas", () => {
    expect(notaVigente(escrita, escrita.getTime() + NOTA_MS - 1)).toBe(true);
  });

  it("deixa de valer no instante em que completa as 24 horas", () => {
    expect(notaVigente(escrita, escrita.getTime() + NOTA_MS)).toBe(false);
  });

  it("sem data, nunca vale e não tem prazo", () => {
    expect(notaVigente(null)).toBe(false);
    expect(notaAte(null)).toBeNull();
    expect(notaAte("data que não existe")).toBeNull();
  });

  it("aceita a data em texto, como vem do banco pela API", () => {
    expect(notaVigente(escrita.toISOString(), escrita.getTime() + 60_000)).toBe(true);
  });
});
