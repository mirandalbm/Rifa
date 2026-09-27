import { describe, expect, it } from "vitest";
import { pedePagamentoPorFora } from "@shared/seguranca";
import { nomeRealPublico, validarApelido } from "@shared/perfilApostador";

describe("pedePagamentoPorFora", () => {
  it("acende no pedido de pagamento por fora", () => {
    for (const t of [
      "Me manda um pix que eu garanto seu número",
      "Chave Pix no privado",
      "faz o pix direto pra mim",
      "Paga direto comigo que sai mais barato",
      "Pode depositar na minha conta",
      "chama no zap pra pagar",
      "compra direto comigo",
      "Transfere que eu separo as cotas",
    ]) {
      expect(pedePagamentoPorFora(t), t).not.toBeNull();
    }
  });

  it("não acende no caminho certo nem em conversa comum", () => {
    for (const t of [
      "Paguei com Pix pelo site, já chegou o bilhete",
      "O pagamento é por Pix aqui na plataforma",
      "Boa sorte a todos!",
      "Quando é o sorteio?",
    ]) {
      expect(pedePagamentoPorFora(t), t).toBeNull();
    }
  });
});

describe("validarApelido", () => {
  it("normaliza e aceita o formato do Instagram", () => {
    expect(validarApelido(" @Leandro.Miranda ")).toEqual({ ok: true, apelido: "leandro.miranda" });
    expect(validarApelido("ana_2026")).toEqual({ ok: true, apelido: "ana_2026" });
  });
  it("recusa curto, acento, ponto na ponta, só números, telefone e reservado", () => {
    for (const a of ["ab", "joão", ".ana", "ana.", "a..b", "123456", "ana11987654321", "admin", "rifaoficial"]) {
      expect(validarApelido(a).ok, a).toBe(false);
    }
  });
});

it("nome real: primeiro e último, capitalizados", () => {
  expect(nomeRealPublico("ana paula de souza")).toBe("Ana Souza");
  expect(nomeRealPublico("LEANDRO")).toBe("Leandro");
  expect(nomeRealPublico("")).toBe("Apostador");
});
