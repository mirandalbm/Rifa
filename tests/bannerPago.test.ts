import { describe, it, expect } from "vitest";
import {
  CONFIG_BANNER_PAGO_PADRAO,
  DIA_MS,
  bannerPagoNoAr,
  diasQueFaltam,
  precoDoBanner,
  problemaNaRecusa,
  sobraDoBanner,
  validarConfigBannerPago,
  validarTituloDoBanner,
} from "../shared/bannerPago";

const cfg = { ...CONFIG_BANNER_PAGO_PADRAO, ligado: true };

describe("configuração do banner pago", () => {
  it("nasce desligada: sem a plataforma ligar, o produto não existe", () => {
    expect(CONFIG_BANNER_PAGO_PADRAO.ligado).toBe(false);
    expect(validarConfigBannerPago(undefined).ligado).toBe(false);
    expect(validarConfigBannerPago({}).ligado).toBe(false);
  });

  it("só guarda as chaves conhecidas e confere os limites", () => {
    const c = validarConfigBannerPago({ ligado: true, precoDiaCents: 1500, diasMin: 2, diasMax: 10, vagas: 4, segundos: 8, golpe: "x" });
    expect(Object.keys(c).sort()).toEqual(["diasMax", "diasMin", "ligado", "precoDiaCents", "segundos", "vagas"]);
    expect(c.precoDiaCents).toBe(1500);
    expect(() => validarConfigBannerPago({ precoDiaCents: 0 })).toThrow();
    expect(() => validarConfigBannerPago({ precoDiaCents: 12.5 })).toThrow();
    expect(() => validarConfigBannerPago({ diasMin: 10, diasMax: 5 })).toThrow(/máximo/);
    expect(() => validarConfigBannerPago({ vagas: 11 })).toThrow();
  });
});

describe("preço do banner", () => {
  it("é dias × preço do dia, em centavos inteiros", () => {
    expect(precoDoBanner(cfg, 7)).toEqual({ dias: 7, totalCents: 14_000 });
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
