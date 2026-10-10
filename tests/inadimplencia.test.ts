import { describe, expect, it } from "vitest";
import {
  InadimplenciaError,
  PRAZO_PARA_REGULARIZAR_DIAS,
  avisoDaNotificacao,
  bloqueioDaNotificacao,
  diaEmBrasilia,
  problemaDaInadimplencia,
  problemaParaNotificar,
  situacaoDaNotificacao,
  ultimoDiaParaRegularizar,
  validarMotivoDoCancelamento,
} from "@shared/inadimplencia";

/** Cláusula X.13 (a): notificar pelo painel e, decorridos 10 dias sem a regularização, bloquear rifa nova. */
describe("falta de pagamento (cláusula X.13 (a))", () => {
  it("o prazo é de 10 dias, contados do dia seguinte, em Brasília (CC, art. 132)", () => {
    expect(PRAZO_PARA_REGULARIZAR_DIAS).toBe(10);
    // Notificada às 15h de 10/10 em Brasília: regulariza até o fim de 20/10; bloqueia a partir de 21/10, 0h.
    const bloqueio = bloqueioDaNotificacao(new Date("2026-10-10T18:00:00Z"));
    expect(bloqueio.toISOString()).toBe("2026-10-21T03:00:00.000Z");
    expect(ultimoDiaParaRegularizar(bloqueio)).toBe("20/10/2026");
    // 23h de Brasília ainda é o dia 10 (2h UTC do dia 11).
    expect(bloqueioDaNotificacao(new Date("2026-10-11T02:00:00Z")).toISOString()).toBe("2026-10-21T03:00:00.000Z");
    // 0h30 de Brasília já é o dia 11.
    expect(bloqueioDaNotificacao(new Date("2026-10-11T03:30:00Z")).toISOString()).toBe("2026-10-22T03:00:00.000Z");
    // Virada de mês.
    expect(ultimoDiaParaRegularizar(bloqueioDaNotificacao(new Date("2026-10-25T12:00:00Z")))).toBe("04/11/2026");
    expect(diaEmBrasilia("2026-10-11T02:00:00.000Z")).toBe("10/10/2026");
  });

  const notificacao = {
    id: "n1",
    valorCents: 12_345,
    abertoCents: 12_345,
    notificadaEm: "2026-10-10T18:00:00.000Z",
    bloqueiaEm: "2026-10-21T03:00:00.000Z",
  };

  it("bloqueia só depois do prazo e só com taxa notificada ainda em aberto", () => {
    const antes = new Date("2026-10-21T02:59:59Z");
    const depois = new Date("2026-10-21T03:00:00Z");
    expect(situacaoDaNotificacao(notificacao, antes)).toBe("no_prazo");
    expect(problemaDaInadimplencia(notificacao, antes)).toBeNull();
    expect(situacaoDaNotificacao(notificacao, depois)).toBe("bloqueando");
    const problema = problemaDaInadimplencia(notificacao, depois);
    expect(problema).toContain("bloqueada por falta de pagamento");
    expect(problema).toContain("123,45");
    expect(problema).toContain("10/10/2026");
    expect(problema).toContain("rifas no ar seguem vendendo");
    // Pago (ou estornado) tudo o que foi notificado: nada bloqueia, mesmo depois do prazo.
    expect(situacaoDaNotificacao({ ...notificacao, abertoCents: 0 }, depois)).toBe("regularizada");
    expect(problemaDaInadimplencia({ ...notificacao, abertoCents: 0 }, depois)).toBeNull();
    expect(problemaDaInadimplencia(null, depois)).toBeNull();
  });

  it("o aviso diz até quando e o que acontece depois", () => {
    const aviso = avisoDaNotificacao(notificacao, new Date("2026-10-15T12:00:00Z"));
    expect(aviso).toContain("Regularize até 20/10/2026");
    expect(aviso).toContain("nenhuma rifa nova pode ser publicada");
    expect(avisoDaNotificacao({ ...notificacao, abertoCents: 0 }, new Date("2026-10-15T12:00:00Z"))).toBeNull();
    expect(avisoDaNotificacao(notificacao, new Date("2026-10-22T12:00:00Z"))).toContain("bloqueada");
  });

  it("só notifica com taxa em aberto que o crédito da organização não cobre (X.13 (b))", () => {
    expect(problemaParaNotificar(0, 0)).toContain("não tem taxa em aberto");
    expect(problemaParaNotificar(1000, 1000)).toContain("dar baixa");
    expect(problemaParaNotificar(1000, 2000)).toContain("dar baixa");
    expect(problemaParaNotificar(1000, 999)).toBeNull();
    expect(problemaParaNotificar(1000, 0)).toBeNull();
  });

  it("cancelar exige motivo", () => {
    expect(() => validarMotivoDoCancelamento("")).toThrow(InadimplenciaError);
    expect(() => validarMotivoDoCancelamento("  ok  ")).toThrow(InadimplenciaError);
    expect(() => validarMotivoDoCancelamento("x".repeat(501))).toThrow(InadimplenciaError);
    expect(validarMotivoDoCancelamento("  acordo   de pagamento  ")).toBe("acordo de pagamento");
  });
});
