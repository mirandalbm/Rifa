import { describe, expect, it } from "vitest";
import {
  bloqueioDoResgate,
  codigoDeIndicacaoValido,
  gerarCodigoDeIndicacao,
  progressoDasMetas,
  validarMeta,
  RESGATE_MAX,
  TIPOS_DE_META,
  type Meta,
} from "@shared/bonus";

describe("código de indicação", () => {
  it("oito caracteres sem ambíguos", () => {
    let i = 0;
    const c = gerarCodigoDeIndicacao(() => i++ % 31);
    expect(codigoDeIndicacaoValido(c)).toBe(true);
    expect(codigoDeIndicacaoValido("ABCD0O1I")).toBe(false);
    expect(codigoDeIndicacaoValido("C-ABCDEFGH")).toBe(false);
    expect(codigoDeIndicacaoValido(null)).toBe(false);
  });
});

describe("validarMeta", () => {
  it("só guarda o que conhece", () => {
    const m = validarMeta({ titulo: "  Três rifas ", tipo: "rifas_compradas", alvo: 3, recompensa: 1, extra: 1 });
    expect(m).toEqual({ titulo: "Três rifas", tipo: "rifas_compradas", alvo: 3, recompensa: 1, ativa: true });
  });
  it("recusa o que não fecha", () => {
    expect(() => validarMeta({ titulo: "x", tipo: "indicacoes", alvo: 1, recompensa: 1 })).toThrow(/título/);
    expect(() => validarMeta({ titulo: "Meta", tipo: "likes", alvo: 1, recompensa: 1 })).toThrow(/Tipo/);
    expect(() => validarMeta({ titulo: "Meta", tipo: "visitas", alvo: 0, recompensa: 1 })).toThrow(/alvo/);
    expect(() => validarMeta({ titulo: "Meta", tipo: "visitas", alvo: 5, recompensa: RESGATE_MAX + 1 })).toThrow(/recompensa/);
  });
});

describe("progressoDasMetas", () => {
  const metas: Meta[] = [
    { id: "a", titulo: "A", tipo: "indicacoes", alvo: 5, recompensa: 2, ativa: true },
    { id: "b", titulo: "B", tipo: "rifas_compradas", alvo: 3, recompensa: 1, ativa: true },
    { id: "c", titulo: "C", tipo: "visitas", alvo: 10, recompensa: 1, ativa: false },
  ];
  it("conta até o alvo e esconde a desligada", () => {
    const p = progressoDasMetas(metas, { indicacoes: 7, rifas_compradas: 1, visitas: 50, organizacoes_seguidas: 0 });
    expect(p.map((m) => [m.id, m.feito, m.alcancada])).toEqual([
      ["a", 5, true],
      ["b", 1, false],
    ]);
  });
});

describe("meta de seguir organizações", () => {
  it("é um tipo conhecido, com texto no singular e no plural", () => {
    expect(validarMeta({ titulo: "Siga", tipo: "organizacoes_seguidas", alvo: 3, recompensa: 1 }).tipo).toBe("organizacoes_seguidas");
    expect(TIPOS_DE_META.organizacoes_seguidas.descreve(1)).toBe("Siga 1 organização que faz rifa");
    expect(TIPOS_DE_META.organizacoes_seguidas.descreve(3)).toBe("Siga 3 organizações que fazem rifa");
  });
  it("conta até o alvo, como as outras", () => {
    const metas: Meta[] = [{ id: "s", titulo: "S", tipo: "organizacoes_seguidas", alvo: 3, recompensa: 1, ativa: true }];
    const base = { indicacoes: 0, rifas_compradas: 0, visitas: 0 };
    expect(progressoDasMetas(metas, { ...base, organizacoes_seguidas: 2 })[0]).toMatchObject({ feito: 2, alcancada: false });
    expect(progressoDasMetas(metas, { ...base, organizacoes_seguidas: 9 })[0]).toMatchObject({ feito: 3, alcancada: true });
  });
});

describe("bloqueioDoResgate", () => {
  const agora = new Date("2026-09-20T12:00:00Z");
  const base = {
    bonusLigado: true,
    aceitaCotaBonus: true,
    statusRifa: "published",
    sorteioEm: new Date("2026-09-30T12:00:00Z"),
    saldo: 3,
    quantidade: 2,
    agora,
  };
  it("pode", () => expect(bloqueioDoResgate(base)).toBeNull());
  it("programa desligado", () => expect(bloqueioDoResgate({ ...base, bonusLigado: false })).toMatch(/não está ativo/));
  it("rifa que o regulamento não prevê", () => expect(bloqueioDoResgate({ ...base, aceitaCotaBonus: false })).toMatch(/regulamento/));
  it("fecha 2 horas antes", () =>
    expect(bloqueioDoResgate({ ...base, sorteioEm: new Date(agora.getTime() + 3_600_000) })).toMatch(/2 horas/));
  it("saldo e quantidade", () => {
    expect(bloqueioDoResgate({ ...base, quantidade: 4 })).toMatch(/insuficiente/);
    expect(bloqueioDoResgate({ ...base, quantidade: 0 })).toMatch(/1 a/);
  });
  it("rifa fora do ar", () => expect(bloqueioDoResgate({ ...base, statusRifa: "drawn" })).toMatch(/não está vendendo/));
});
