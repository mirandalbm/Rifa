import { describe, it, expect } from "vitest";
import {
  avisoDePrazoCurto,
  calcularReembolso,
  fechadoPeloSorteio,
  prazoDoArrependimento,
  regraDoReembolso,
} from "@shared/reembolso";
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
  it("o texto antes da compra diz a taxa, o que vier primeiro e o adiamento", () => {
    const t = regraDoReembolso(10);
    expect(t).toMatch(/7 dias.*2 horas antes do sorteio.*o que vier primeiro.*10%/);
    expect(t).toMatch(/aprovar o adiamento do sorteio depois da sua compra.*integral/);
    expect(t).toMatch(/Feito o sorteio.*não há reembolso/);
  });
});

describe("arrependimento: 7 dias ou o fechamento, o que vier primeiro", () => {
  const sorteio = new Date("2026-10-10T20:00:00Z");
  it("longe do sorteio valem os 7 dias, e não há aviso", () => {
    const agora = new Date("2026-09-20T12:00:00Z");
    expect(prazoDoArrependimento(agora, sorteio).getTime()).toBe(agora.getTime() + 7 * dia);
    expect(avisoDePrazoCurto(agora, sorteio)).toBeNull();
    expect(avisoDePrazoCurto(agora, null)).toBeNull();
    expect(prazoDoArrependimento(agora, null).getTime()).toBe(agora.getTime() + 7 * dia);
  });
  it("perto do sorteio o prazo acaba no fechamento, com data e hora de São Paulo", () => {
    const agora = new Date("2026-10-08T12:00:00Z");
    expect(prazoDoArrependimento(agora, sorteio).toISOString()).toBe("2026-10-10T18:00:00.000Z");
    const aviso = avisoDePrazoCurto(agora, sorteio)!;
    expect(aviso).toContain("10/10/2026 às 17:00"); // sorteio, 20h UTC = 17h em São Paulo
    expect(aviso).toContain("10/10/2026 às 15:00"); // fechamento
    expect(aviso).toMatch(/antes dos 7 dias/);
  });
  it("na fronteira dos 7 dias exatos, sem aviso", () => {
    const agora = new Date(sorteio.getTime() - 2 * 3_600_000 - 7 * dia);
    expect(avisoDePrazoCurto(agora, sorteio)).toBeNull();
    expect(avisoDePrazoCurto(new Date(agora.getTime() + 1), sorteio)).not.toBeNull();
  });
  it("rifa sorteada quando completar, ainda sem data: avisa que o prazo pode encurtar", () => {
    const agora = new Date("2026-10-01T12:00:00Z");
    expect(avisoDePrazoCurto(agora, null, "quando_completar")).toMatch(/quando completar.*menor que 7 dias/);
    expect(avisoDePrazoCurto(agora, null, "data")).toBeNull();
  });
  it("já fechado: diz que a compra não poderá ser desfeita", () => {
    expect(avisoDePrazoCurto(new Date("2026-10-10T19:00:00Z"), sorteio)).toMatch(/já fecharam/);
  });
});

describe("sorteio adiado depois da compra", () => {
  const adiadoEm = new Date(compra.getTime() + 10 * dia);
  const tarde = new Date(compra.getTime() + 20 * dia);
  it("quem pagou antes do adiamento recebe tudo, mesmo depois de 7 dias", () => {
    expect(calcularReembolso({ ...base, pedidoEm: tarde, adiadoEm })).toEqual({
      tipo: "adiamento",
      taxaPct: 0,
      taxaCents: 0,
      devolverCents: 10_000,
    });
  });
  it("vale também para a compra com cambista", () => {
    expect(calcularReembolso({ ...base, vendaOnline: false, pedidoEm: tarde, adiadoEm }).tipo).toBe("adiamento");
  });
  it("quem comprou depois do adiamento segue a regra comum", () => {
    const depois = { ...base, compradoEm: new Date(adiadoEm.getTime() + 1) };
    expect(calcularReembolso({ ...depois, pedidoEm: new Date(adiadoEm.getTime() + 2 * dia), adiadoEm }).tipo).toBe(
      "arrependimento",
    );
    expect(calcularReembolso({ ...depois, pedidoEm: new Date(tarde.getTime() + 10 * dia), adiadoEm }).tipo).toBe(
      "com_taxa",
    );
  });
});
