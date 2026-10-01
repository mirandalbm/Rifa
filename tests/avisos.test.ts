import { describe, expect, it } from "vitest";
import { TRECHO_MAX, caminhoDoAviso, naoLidos, rotuloDoSino, trechoDoAviso } from "../shared/avisos";

describe("avisos do painel", () => {
  it("o trecho vira uma linha e corta com reticências", () => {
    expect(trechoDoAviso("  oi\n\n  tudo   bem? ")).toBe("oi tudo bem?");
    const longo = "a".repeat(TRECHO_MAX + 20);
    const t = trechoDoAviso(longo);
    expect(t.length).toBe(TRECHO_MAX);
    expect(t.endsWith("…")).toBe(true);
    expect(trechoDoAviso("x".repeat(TRECHO_MAX))).toBe("x".repeat(TRECHO_MAX));
  });

  it("conta os não lidos e põe o número no rótulo", () => {
    expect(naoLidos([{ lido: true }, { lido: false }, { lido: false }])).toBe(2);
    expect(rotuloDoSino(0, 0)).toBe("Avisos: nada novo");
    expect(rotuloDoSino(1, 0)).toBe("Avisos: 1 comentário novo");
    expect(rotuloDoSino(3, 2)).toBe("Avisos: 3 comentários novos, 2 pendentes no atendimento");
    expect(rotuloDoSino(0, 1)).toBe("Avisos: 1 pendente no atendimento");
  });

  it("o aviso abre a publicação já nos comentários", () => {
    expect(caminhoDoAviso({ rifa: { titulo: "x", slug: "carro", orgSlug: "acme" } })).toBe("/o/acme/r/carro#comentarios");
  });
});
