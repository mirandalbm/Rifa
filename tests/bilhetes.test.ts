import { describe, expect, it } from "vitest";
import { BILHETES_PAGINA, NUMEROS_NO_CARTAO, bilheteEntra, dataEHora, numerosDoCartao, rotuloDosNumeros, situacaoDaRifa } from "@shared/bilhetes";
import type { Titularidade } from "@shared/contaComprador";

const sem: Titularidade = { telefoneConfirmado: false, comprasVinculadasEm: null };
const provado: Titularidade = { telefoneConfirmado: true, comprasVinculadasEm: null };
const hoje = new Date("2026-09-28T12:00:00Z");

describe("o que vira bilhete", () => {
  it("só pedido pago", () => {
    for (const status of ["pending", "expired", "refunded"]) {
      expect(bilheteEntra({ status, viaConta: true, createdAt: hoje }, provado)).toBe(false);
    }
    expect(bilheteEntra({ status: "paid", viaConta: true, createdAt: hoje }, sem)).toBe(true);
  });

  it("compra de fora da conta só com a prova (telefone ou CPF vinculado)", () => {
    const fora = { status: "paid", viaConta: false, createdAt: hoje };
    expect(bilheteEntra(fora, sem)).toBe(false);
    expect(bilheteEntra(fora, provado)).toBe(true);
    // O CPF prova só o que já existia quando bateu.
    const vinc = new Date("2026-09-28T13:00:00Z");
    expect(bilheteEntra(fora, { telefoneConfirmado: false, comprasVinculadasEm: vinc })).toBe(true);
    expect(bilheteEntra({ ...fora, createdAt: new Date("2026-09-28T14:00:00Z") }, { telefoneConfirmado: false, comprasVinculadasEm: vinc })).toBe(false);
  });
});

describe("data e hora", () => {
  it("usa o fuso de São Paulo, não o do servidor", () => {
    // 02:30 UTC é 23:30 do dia anterior em São Paulo (UTC-3).
    expect(dataEHora("2026-09-29T02:30:00Z")).toBe("28/09/2026 às 23:30");
    expect(dataEHora(new Date("2026-01-05T15:05:00Z"))).toBe("05/01/2026 às 12:05");
  });
  it("meia-noite é 00:00, nunca 24:00", () => {
    expect(dataEHora("2026-09-29T03:00:00Z")).toBe("29/09/2026 às 00:00");
  });
  it("sem data ou data inválida, texto vazio", () => {
    expect(dataEHora(null)).toBe("");
    expect(dataEHora("amanhã")).toBe("");
  });
});

describe("situação da rifa", () => {
  it("diz onde está o sorteio", () => {
    expect(situacaoDaRifa({ status: "drawn", drawAt: null })).toBe("Sorteio realizado");
    expect(situacaoDaRifa({ status: "closed", drawAt: "2026-10-10T15:00:00Z" })).toBe("Vendas encerradas");
    expect(situacaoDaRifa({ status: "published", drawAt: "2026-10-10T15:00:00Z" })).toBe("Sorteio em 10/10/2026 às 12:00");
    expect(situacaoDaRifa({ status: "published", drawAt: null })).toBe("Sorteio a definir");
  });
});

describe("números do cartão", () => {
  it("com o zero à esquerda da rifa, em ordem", () => {
    const { visiveis, restantes } = numerosDoCartao([12, 3, 1], 1000, false);
    expect(visiveis).toEqual(["0001", "0003", "0012"]);
    expect(restantes).toBe(0);
  });
  it("corta no teto e conta o que ficou de fora", () => {
    const todos = Array.from({ length: NUMEROS_NO_CARTAO + 5 }, (_, i) => i);
    const { visiveis, restantes } = numerosDoCartao(todos, 1000, false);
    expect(visiveis).toHaveLength(NUMEROS_NO_CARTAO);
    expect(restantes).toBe(5);
  });
  it("o rótulo para leitor de tela", () => {
    expect(rotuloDosNumeros(["001", "002", "003"], 0)).toBe("3 números: 001, 002 e 003");
    expect(rotuloDosNumeros(["001"], 0)).toBe("1 número: 001");
    expect(rotuloDosNumeros(["001", "002"], 8)).toBe("10 números: 001 e 002 e mais 8");
    expect(rotuloDosNumeros([], 0)).toBe("Nenhum número");
  });
  it("a página não passa do limite da paginação", () => {
    expect(BILHETES_PAGINA).toBeGreaterThan(0);
    expect(BILHETES_PAGINA).toBeLessThanOrEqual(100);
  });
});
