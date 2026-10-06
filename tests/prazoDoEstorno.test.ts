import { describe, expect, it } from "vitest";
import { DIAS_UTEIS_DEVOLUCAO_INTEGRAL, prazoDoEstorno, prazoDoEstornoDoTipo, somarDiasUteis } from "../shared/chamados";

// Sexta, 09/10/2026, 15:00 em São Paulo (18:00 UTC).
const sexta = new Date("2026-10-09T18:00:00Z");

describe("3.6 do advogado: prazo de devolução pelo tipo", () => {
  it("dias úteis pulam sábado e domingo (fuso de São Paulo)", () => {
    expect(somarDiasUteis(sexta, 1).toISOString()).toBe("2026-10-12T18:00:00.000Z");
    expect(somarDiasUteis(sexta, 3).toISOString()).toBe("2026-10-14T18:00:00.000Z");
    // Sexta às 22h em São Paulo já é sábado em UTC: conta pelo dia de São Paulo.
    expect(somarDiasUteis(new Date("2026-10-10T01:00:00Z"), 1).toISOString()).toBe("2026-10-13T01:00:00.000Z");
  });
  it("arrependimento e adiamento: devolução integral em dias úteis, nunca o prazo da organização", () => {
    expect(DIAS_UTEIS_DEVOLUCAO_INTEGRAL).toBe(3);
    expect(prazoDoEstornoDoTipo(sexta, "arrependimento", 30)).toEqual(somarDiasUteis(sexta, 3));
    expect(prazoDoEstornoDoTipo(sexta, "adiamento", 30)).toEqual(somarDiasUteis(sexta, 3));
  });
  it("com taxa (liberalidade) e chamado de antes: o prazo da organização", () => {
    expect(prazoDoEstornoDoTipo(sexta, "com_taxa", 30)).toEqual(prazoDoEstorno(sexta, 30));
    expect(prazoDoEstornoDoTipo(sexta, null, 10)).toEqual(prazoDoEstorno(sexta, 10));
  });
});
