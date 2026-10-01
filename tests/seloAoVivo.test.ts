import { describe, expect, it } from "vitest";
import { DURACAO_DA_TRANSMISSAO_MS, transmissaoNoAr } from "@shared/aoVivo";

const LINK = "https://www.youtube.com/watch?v=dQw4w9WgXcQ";
const agora = Date.parse("2026-10-01T20:00:00Z");
const em = (ms: number) => new Date(agora + ms);

describe("transmissaoNoAr (selo ao vivo do story)", () => {
  it("acende na hora do sorteio, com link e sem sorteio feito", () => {
    expect(transmissaoNoAr({ drawAt: em(0), sorteada: false, transmissaoUrl: LINK }, agora)).toBe(true);
    expect(transmissaoNoAr({ drawAt: em(-60_000), sorteada: false, transmissaoUrl: LINK }, agora)).toBe(true);
  });
  it("não acende antes da hora", () => {
    expect(transmissaoNoAr({ drawAt: em(1), sorteada: false, transmissaoUrl: LINK }, agora)).toBe(false);
  });
  it("apaga quando a janela de 3 h fecha", () => {
    expect(transmissaoNoAr({ drawAt: em(-DURACAO_DA_TRANSMISSAO_MS + 1), sorteada: false, transmissaoUrl: LINK }, agora)).toBe(true);
    expect(transmissaoNoAr({ drawAt: em(-DURACAO_DA_TRANSMISSAO_MS), sorteada: false, transmissaoUrl: LINK }, agora)).toBe(false);
  });
  it("não acende sem link de transmissão ou com link inválido", () => {
    for (const url of [null, undefined, "", "http://x.com/a", "javascript:alert(1)", "https://u:p@x.com/", 42]) {
      expect(transmissaoNoAr({ drawAt: em(-60_000), sorteada: false, transmissaoUrl: url }, agora)).toBe(false);
    }
  });
  it("sorteio feito apaga o selo", () => {
    expect(transmissaoNoAr({ drawAt: em(-60_000), sorteada: true, transmissaoUrl: LINK }, agora)).toBe(false);
  });
  it("data ausente ou inválida não acende", () => {
    expect(transmissaoNoAr({ drawAt: null, sorteada: false, transmissaoUrl: LINK }, agora)).toBe(false);
    expect(transmissaoNoAr({ drawAt: "lixo", sorteada: false, transmissaoUrl: LINK }, agora)).toBe(false);
  });
});
