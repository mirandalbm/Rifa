import { describe, expect, it } from "vitest";
import { COMENTARIO_MAX, limparComentario, nomeNoComentario, problemaNoComentario } from "@shared/comentarios";

describe("problemaNoComentario", () => {
  it("aceita conversa normal, com números curtos", () => {
    expect(problemaNoComentario("Quando é o sorteio? Comprei 10 cotas!")).toBeNull();
    expect(problemaNoComentario("Boa sorte a todos 🍀 sorteio dia 20/10")).toBeNull();
  });

  it("recusa link, em qualquer forma", () => {
    for (const t of ["veja https://golpe.com", "www.pixfacil.net", "entra em rifabarata.com.br", "promo.xyz"]) {
      expect(problemaNoComentario(t)).toMatch(/link/);
    }
  });

  it("recusa telefone e número longo", () => {
    for (const t of ["chama no zap 11 98765-4321", "(11) 9 8765 4321", "pix 12345678900"]) {
      expect(problemaNoComentario(t)).toMatch(/telefone/);
    }
  });

  it("vazio e comprido demais", () => {
    expect(problemaNoComentario("   ")).not.toBeNull();
    expect(problemaNoComentario("a".repeat(COMENTARIO_MAX + 1))).not.toBeNull();
    expect(problemaNoComentario(123)).not.toBeNull();
  });
});

it("limpa espaços e quebras demais", () => {
  expect(limparComentario("  oi    tudo\n\n\n\nbem  ")).toBe("oi tudo\n\nbem");
});

it("o apostador aparece pelo primeiro nome e a inicial", () => {
  expect(nomeNoComentario("ana paula souza")).toBe("ana P.");
  expect(nomeNoComentario("Carlos")).toBe("Carlos");
  expect(nomeNoComentario("")).toBe("Apostador");
});
