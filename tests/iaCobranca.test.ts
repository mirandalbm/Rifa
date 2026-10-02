import { describe, expect, it } from "vitest";
import {
  CONFIG_COBRANCA_IA_PADRAO,
  CONTA_IA_VAZIA,
  IA_CODIGO_MAX,
  IA_CODIGO_MIN,
  MS_DO_CICLO,
  cicloAtivo,
  cicloDepoisDaAssinatura,
  cobrancaPronta,
  creditosParaTela,
  debitar,
  documentoDoPagador,
  emMilicreditos,
  franquiaValida,
  problemaNoSaldo,
  validarConfigCobrancaIA,
} from "../shared/iaCobranca";
import { CARRINHO_CODIGO_MAX, CARRINHO_CODIGO_MIN } from "../shared/carrinho";

const agora = new Date("2026-10-02T12:00:00Z");
const depois = (ms: number) => new Date(agora.getTime() + ms);

describe("cobrança da IA: configuração", () => {
  it("nasce sem preço, e sem preço não está pronta", () => {
    expect(validarConfigCobrancaIA(undefined)).toEqual(
      CONFIG_COBRANCA_IA_PADRAO,
    );
    expect(cobrancaPronta(CONFIG_COBRANCA_IA_PADRAO)).toBe(false);
    expect(
      cobrancaPronta({
        assinaturaCents: 4990,
        franquiaCreditos: 500,
        pacotes: [],
      }),
    ).toBe(true);
  });

  it("preço e franquia andam juntos", () => {
    expect(() => validarConfigCobrancaIA({ assinaturaCents: 4990 })).toThrow(
      /andam juntos/,
    );
    expect(() => validarConfigCobrancaIA({ franquiaCreditos: 500 })).toThrow(
      /andam juntos/,
    );
  });

  it("só inteiros dentro dos limites, e só as chaves conhecidas", () => {
    for (const ruim of [
      { assinaturaCents: 49.9, franquiaCreditos: 1 },
      { assinaturaCents: -1, franquiaCreditos: 1 },
      { assinaturaCents: 100, franquiaCreditos: 100_001 },
    ]) {
      expect(() => validarConfigCobrancaIA(ruim)).toThrow();
    }
    const c = validarConfigCobrancaIA({
      assinaturaCents: 4990,
      franquiaCreditos: 500,
      extra: 1,
    });
    expect(Object.keys(c).sort()).toEqual([
      "assinaturaCents",
      "franquiaCreditos",
      "pacotes",
    ]);
  });

  it("pacotes: até 4, ordenados, sem repetir quantidade e o crédito nunca mais caro no maior", () => {
    const base = { assinaturaCents: 4990, franquiaCreditos: 500 };
    const c = validarConfigCobrancaIA({
      ...base,
      pacotes: [
        { creditos: 1000, precoCents: 8000 },
        { creditos: 100, precoCents: 1000 },
      ],
    });
    expect(c.pacotes.map((p) => p.creditos)).toEqual([100, 1000]);
    expect(() =>
      validarConfigCobrancaIA({
        ...base,
        pacotes: [
          { creditos: 100, precoCents: 1000 },
          { creditos: 200, precoCents: 2001 },
        ],
      }),
    ).toThrow(/mais caro/);
    // Mesmo preço por crédito vale.
    expect(
      validarConfigCobrancaIA({
        ...base,
        pacotes: [
          { creditos: 100, precoCents: 1000 },
          { creditos: 200, precoCents: 2000 },
        ],
      }).pacotes,
    ).toHaveLength(2);
    expect(() =>
      validarConfigCobrancaIA({
        ...base,
        pacotes: [
          { creditos: 100, precoCents: 1000 },
          { creditos: 100, precoCents: 900 },
        ],
      }),
    ).toThrow(/mesma quantidade/);
    expect(() =>
      validarConfigCobrancaIA({
        ...base,
        pacotes: Array.from({ length: 5 }, (_, i) => ({
          creditos: i + 1,
          precoCents: 100,
        })),
      }),
    ).toThrow(/até 4/);
    expect(() =>
      validarConfigCobrancaIA({
        ...base,
        pacotes: [{ creditos: 10, precoCents: 99 }],
      }),
    ).toThrow();
  });

  it("o código do Pix tem faixa própria, fora do pedido (8 dígitos), do carrinho e da recarga, e cabe num integer", () => {
    expect(IA_CODIGO_MIN).toBeGreaterThanOrEqual(1_000_000_000);
    expect(IA_CODIGO_MIN).toBeGreaterThanOrEqual(CARRINHO_CODIGO_MAX);
    expect(CARRINHO_CODIGO_MIN).toBeLessThan(IA_CODIGO_MIN);
    expect(IA_CODIGO_MAX).toBeLessThan(2 ** 31);
  });
});

describe("cobrança da IA: ciclo, saldo e débito", () => {
  it("sem assinatura, ou com ela vencida, não conversa", () => {
    expect(problemaNoSaldo(CONTA_IA_VAZIA, agora)).toMatch(/Assine/);
    expect(
      problemaNoSaldo({ franquia: 5000, avulso: 9000, cicloAte: agora }, agora),
    ).toMatch(/Assine/);
    expect(
      franquiaValida(
        { franquia: 5000, avulso: 0, cicloAte: depois(-1) },
        agora,
      ),
    ).toBe(0);
  });

  it("com o ciclo ativo, precisa de saldo positivo (franquia + avulso)", () => {
    const ate = depois(1000);
    expect(
      problemaNoSaldo({ franquia: 1, avulso: 0, cicloAte: ate }, agora),
    ).toBeNull();
    expect(
      problemaNoSaldo({ franquia: 0, avulso: 1, cicloAte: ate }, agora),
    ).toBeNull();
    expect(
      problemaNoSaldo({ franquia: 0, avulso: 0, cicloAte: ate }, agora),
    ).toMatch(/acabaram/);
    expect(
      problemaNoSaldo({ franquia: 500, avulso: -1000, cicloAte: ate }, agora),
    ).toMatch(/acabaram/);
  });

  it("a assinatura começa agora, ou estende o ciclo em curso somando a franquia", () => {
    const nova = cicloDepoisDaAssinatura(
      CONTA_IA_VAZIA,
      emMilicreditos(5),
      agora,
    );
    expect(nova).toEqual({
      franquia: 5000,
      avulso: 0,
      cicloAte: depois(MS_DO_CICLO),
    });
    const renovada = cicloDepoisDaAssinatura(
      { ...nova, franquia: 1200 },
      5000,
      depois(1000),
    );
    expect(renovada.franquia).toBe(6200);
    expect(renovada.cicloAte).toEqual(depois(2 * MS_DO_CICLO));
    // Vencida: começa do zero, sem a franquia velha.
    const vencida = cicloDepoisDaAssinatura(
      { franquia: 3000, avulso: 700, cicloAte: depois(-1) },
      5000,
      agora,
    );
    expect(vencida).toEqual({
      franquia: 5000,
      avulso: 700,
      cicloAte: depois(MS_DO_CICLO),
    });
    expect(cicloAtivo(vencida, agora)).toBe(true);
  });

  it("debita a franquia primeiro, o resto do avulso, e a soma é exatamente o custo", () => {
    const conta = { franquia: 1000, avulso: 500, cicloAte: depois(1000) };
    for (const custo of [0, 1, 999, 1000, 1001, 1500, 2000, 7333]) {
      const d = debitar(conta, custo, agora);
      expect(d.daFranquia + d.doAvulso).toBe(custo);
      expect(d.daFranquia).toBeLessThanOrEqual(1000);
      expect(d.conta.franquia).toBeGreaterThanOrEqual(0);
      expect(d.conta.franquia + d.conta.avulso).toBe(1500 - custo);
    }
    // O avulso pode ficar devendo uma mensagem.
    expect(debitar(conta, 2000, agora).conta).toMatchObject({
      franquia: 0,
      avulso: -500,
    });
    // Franquia vencida não paga nada: tudo sai do avulso.
    expect(
      debitar(
        { franquia: 1000, avulso: 500, cicloAte: depois(-1) },
        300,
        agora,
      ),
    ).toMatchObject({ daFranquia: 0, doAvulso: 300 });
  });

  it("créditos na tela: para baixo no positivo, a dívida para cima", () => {
    expect(creditosParaTela(5999)).toBe(5);
    expect(creditosParaTela(0)).toBe(0);
    expect(creditosParaTela(-1)).toBe(-1);
    expect(creditosParaTela(-1500)).toBe(-2);
  });

  it("o documento do pagador é CPF (11) ou CNPJ (14), só dígitos", () => {
    expect(documentoDoPagador("123.456.789-09")).toBe("12345678909");
    expect(documentoDoPagador("12.345.678/0001-90")).toBe("12345678000190");
    expect(documentoDoPagador("123")).toBeNull();
    expect(documentoDoPagador(12345678909)).toBeNull();
  });
});
