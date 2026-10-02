import { describe, expect, it, vi } from "vitest";
import { criarCiclo } from "../client/src/lib/assistente";
import { papelTemIA } from "../shared/ia";

describe("assistente: vive entre as telas do painel", () => {
  it("trocar de tela (desmonta e monta na hora) não remove o assistente", () => {
    vi.useFakeTimers();
    const remover = vi.fn();
    const ciclo = criarCiclo(remover, 400);
    ciclo.montou(); // tela 1
    ciclo.desmontou(); // sai da tela 1…
    ciclo.montou(); // …e a tela 2 monta no mesmo instante
    vi.advanceTimersByTime(2_000);
    expect(remover).not.toHaveBeenCalled();
    expect(ciclo.montados).toBe(1);
    vi.useRealTimers();
  });

  it("sair do painel (ninguém monta de novo) remove, uma vez só, depois da espera", () => {
    vi.useFakeTimers();
    const remover = vi.fn();
    const ciclo = criarCiclo(remover, 400);
    ciclo.montou();
    ciclo.desmontou();
    vi.advanceTimersByTime(399);
    expect(remover).not.toHaveBeenCalled();
    vi.advanceTimersByTime(2);
    expect(remover).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(5_000);
    expect(remover).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });

  it("voltar ao painel depois de remover monta de novo sem erro, e remove de novo ao sair", () => {
    vi.useFakeTimers();
    const remover = vi.fn();
    const ciclo = criarCiclo(remover, 400);
    ciclo.montou();
    ciclo.desmontou();
    vi.advanceTimersByTime(1_000);
    ciclo.montou();
    ciclo.desmontou();
    vi.advanceTimersByTime(1_000);
    expect(remover).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });

  it("duas cascas ao mesmo tempo: só remove quando a última sai", () => {
    vi.useFakeTimers();
    const remover = vi.fn();
    const ciclo = criarCiclo(remover, 400);
    ciclo.montou();
    ciclo.montou();
    ciclo.desmontou();
    vi.advanceTimersByTime(1_000);
    expect(remover).not.toHaveBeenCalled();
    ciclo.desmontou();
    vi.advanceTimersByTime(1_000);
    expect(remover).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });

  it("desmontar a mais não deixa o contador negativo", () => {
    vi.useFakeTimers();
    const ciclo = criarCiclo(() => {}, 10);
    ciclo.desmontou();
    ciclo.desmontou();
    expect(ciclo.montados).toBe(0);
    ciclo.montou();
    expect(ciclo.montados).toBe(1);
    vi.useRealTimers();
  });
});

describe("assistente: papéis", () => {
  it("só o master e o organizador; afiliado, cambista e apostador nunca", () => {
    expect(papelTemIA("admin")).toBe(true);
    expect(papelTemIA("organizer")).toBe(true);
    for (const r of ["affiliate", "cambista", "buyer", "guest", undefined] as const) expect(papelTemIA(r)).toBe(false);
  });
});
