import { describe, it, expect } from "vitest";
import { calcularReembolso, fechadoPeloSorteio, regraDoReembolso } from "@shared/reembolso";
import { bloqueioDoReembolso } from "@shared/chamados";
import { validarConfigPlataforma } from "@shared/plataforma";

const dia = 86_400_000;
const compra = new Date("2026-09-01T12:00:00Z");
const base = { pagoCents: 10_000, vendaOnline: true, compradoEm: compra, taxaPct: 10 };

describe("quanto volta no reembolso (CDC)", () => {
  it("compra online em até 7 dias: 100%, sem taxa (arrependimento)", () => {
    const r = calcularReembolso({ ...base, pedidoEm: new Date(compra.getTime() + 7 * dia) });
    expect(r).toEqual({ tipo: "arrependimento", taxaPct: 0, taxaCents: 0, devolverCents: 10_000 });
  });

  it("depois de 7 dias: taxa administrativa", () => {
    const r = calcularReembolso({ ...base, pedidoEm: new Date(compra.getTime() + 7 * dia + 1) });
    expect(r).toEqual({ tipo: "com_taxa", taxaPct: 10, taxaCents: 1_000, devolverCents: 9_000 });
  });

  it("compra presencial (cambista) não tem arrependimento", () => {
    const r = calcularReembolso({ ...base, vendaOnline: false, pedidoEm: new Date(compra.getTime() + dia) });
    expect(r.tipo).toBe("com_taxa");
    expect(r.devolverCents).toBe(9_000);
  });

  it("a taxa nunca passa de 10% e o centavo fica com o consumidor", () => {
    const tarde = new Date(compra.getTime() + 30 * dia);
    expect(calcularReembolso({ ...base, taxaPct: 50, pedidoEm: tarde }).taxaCents).toBe(1_000);
    expect(calcularReembolso({ ...base, pagoCents: 999, pedidoEm: tarde })).toMatchObject({ taxaCents: 99, devolverCents: 900 });
    expect(calcularReembolso({ ...base, taxaPct: 0, pedidoEm: tarde }).devolverCents).toBe(10_000);
  });
});

describe("corte antes do sorteio", () => {
  const sorteio = new Date("2026-10-10T20:00:00Z");
  it("fecha 2 horas antes", () => {
    expect(fechadoPeloSorteio(sorteio, new Date("2026-10-10T17:59:59Z"))).toBe(false);
    expect(fechadoPeloSorteio(sorteio, new Date("2026-10-10T18:00:00Z"))).toBe(true);
    expect(fechadoPeloSorteio(null, new Date())).toBe(false);
  });
  it("o bloqueio do chamado usa o corte", () => {
    expect(
      bloqueioDoReembolso({
        estornoLigado: true,
        statusPedido: "paid",
        statusRifa: "published",
        sorteioEm: sorteio,
        agora: new Date("2026-10-10T19:00:00Z"),
      }),
    ).toMatch(/2 horas antes/);
  });
});

describe("configuração da taxa", () => {
  it("padrão 10%, aceita 0 a 10, recusa acima", () => {
    expect(validarConfigPlataforma({}).taxaReembolsoPct).toBe(10);
    expect(validarConfigPlataforma({ taxaReembolsoPct: 0 }).taxaReembolsoPct).toBe(0);
    expect(() => validarConfigPlataforma({ taxaReembolsoPct: 11 })).toThrow(/0 a 10/);
    expect(() => validarConfigPlataforma({ taxaReembolsoPct: 30 })).toThrow();
  });
  it("o texto antes da compra diz a taxa", () => {
    expect(regraDoReembolso(10)).toMatch(/7 dias.*10%.*2 horas/);
  });
});
