import { describe, expect, it } from "vitest";
import { RIFA_AGENDA_MAX_DIAS, instanteAgendado, problemaNaAgendaDaRifa } from "../shared/agenda";

const agora = new Date("2026-10-03T12:00:00Z");
const daqui = (h: number) => new Date(agora.getTime() + h * 3_600_000);

describe("publicação agendada da rifa", () => {
  it("vai ao ar pelo menos 1 hora antes do sorteio", () => {
    expect(problemaNaAgendaDaRifa(daqui(1), daqui(3))).toBeNull();
    expect(problemaNaAgendaDaRifa(daqui(2), daqui(3))).toBeNull();
    expect(problemaNaAgendaDaRifa(daqui(2.5), daqui(3))).toMatch(/1 hora antes/);
    expect(problemaNaAgendaDaRifa(daqui(4), daqui(3).toISOString())).toMatch(/1 hora antes/);
  });

  it("rifa sem data (quando completar) não tem limite de sorteio", () => {
    expect(problemaNaAgendaDaRifa(daqui(24 * 29), null)).toBeNull();
  });

  it("até 30 dias à frente, nunca no passado", () => {
    expect(instanteAgendado(daqui(24 * RIFA_AGENDA_MAX_DIAS - 1).toISOString(), RIFA_AGENDA_MAX_DIAS, agora)).toEqual(daqui(24 * RIFA_AGENDA_MAX_DIAS - 1));
    expect(() => instanteAgendado(daqui(24 * RIFA_AGENDA_MAX_DIAS + 1).toISOString(), RIFA_AGENDA_MAX_DIAS, agora)).toThrow(/30 dias/);
    expect(() => instanteAgendado(daqui(-1).toISOString(), RIFA_AGENDA_MAX_DIAS, agora)).toThrow(/passou/);
  });
});
