import { describe, expect, it } from "vitest";
import {
  CARRINHO_MAX_ITENS,
  agruparPorOrganizacao,
  juntarCartela,
  splitDoCarrinho,
  situacaoDoCarrinho,
  limparCarrinho,
  quantidadeInicial,
  quantidadeNaFaixa,
  rifaAVenda,
  totalDoItem,
} from "@shared/carrinho";
import { priceOrder } from "@shared/pricing";

describe("limparCarrinho", () => {
  it("guarda só rifa e quantidade, e recusa o resto", () => {
    expect(limparCarrinho(null)).toEqual([]);
    expect(limparCarrinho({ slug: "a" })).toEqual([]);
    expect(
      limparCarrinho([
        { slug: "pix-10-mil", quantidade: 10, precoCents: 1 },
        { slug: "../admin", quantidade: 1 },
        { slug: "Maiuscula", quantidade: 1 },
        { slug: "ok", quantidade: -1 },
        { slug: "ok", quantidade: 1.5 },
        { slug: "ok", quantidade: "3" },
        "texto",
      ]),
    ).toEqual([{ slug: "pix-10-mil", quantidade: 10 }]);
  });

  it("guarda a cartela escolhida só se tiver a quantidade do item, sem repetir", () => {
    expect(limparCarrinho([{ slug: "a", quantidade: 3, numeros: [7, 2, 9] }])).toEqual([{ slug: "a", quantidade: 3, numeros: [7, 2, 9] }]);
    expect(limparCarrinho([{ slug: "a", quantidade: 4, numeros: [7, 2, 9] }])).toEqual([{ slug: "a", quantidade: 4 }]);
    expect(limparCarrinho([{ slug: "a", quantidade: 3, numeros: [7, 7, 9] }])).toEqual([{ slug: "a", quantidade: 3 }]);
    expect(limparCarrinho([{ slug: "a", quantidade: 2, numeros: [0, 1] }])).toEqual([{ slug: "a", quantidade: 2 }]);
    expect(limparCarrinho([{ slug: "a", quantidade: 2, numeros: ["1", "2"] }])).toEqual([{ slug: "a", quantidade: 2 }]);
  });

  it("zero quer dizer a quantidade sugerida pela rifa", () => {
    expect(limparCarrinho([{ slug: "a", quantidade: 0 }])).toEqual([{ slug: "a", quantidade: 0 }]);
  });

  it("não repete rifa: a última vence e vai para o fim", () => {
    expect(
      limparCarrinho([
        { slug: "a", quantidade: 1 },
        { slug: "b", quantidade: 2 },
        { slug: "a", quantidade: 5 },
      ]),
    ).toEqual([
      { slug: "b", quantidade: 2 },
      { slug: "a", quantidade: 5 },
    ]);
  });

  it(`no máximo ${CARRINHO_MAX_ITENS} rifas`, () => {
    const muitos = Array.from({ length: 30 }, (_, i) => ({ slug: `r${i}`, quantidade: 1 }));
    const r = limparCarrinho(muitos);
    expect(r).toHaveLength(CARRINHO_MAX_ITENS);
    expect(r[r.length - 1].slug).toBe("r29");
  });
});

describe("juntarCartela", () => {
  it("a primeira cartela vira o item, com a quantidade dos números", () => {
    const r = juntarCartela(undefined, "a", [1, 2, 3]);
    expect(r).toEqual({ ok: true, item: { slug: "a", quantidade: 3, numeros: [1, 2, 3] }, novos: 3 });
  });

  it("a segunda cartela soma os números, sem repetir — e o item continua válido para o carrinho", () => {
    const r = juntarCartela({ slug: "a", quantidade: 3, numeros: [1, 2, 3] }, "a", [3, 4, 5]);
    expect(r).toEqual({ ok: true, item: { slug: "a", quantidade: 5, numeros: [1, 2, 3, 4, 5] }, novos: 2 });
    if (r.ok) expect(limparCarrinho([r.item])).toEqual([r.item]);
  });

  it("cartela toda repetida não muda nada", () => {
    expect(juntarCartela({ slug: "a", quantidade: 2, numeros: [1, 2] }, "a", [2, 1])).toEqual({ ok: false, motivo: "repetida" });
  });

  it("passar do máximo da rifa recusa, sem cortar a cartela", () => {
    expect(juntarCartela({ slug: "a", quantidade: 8, numeros: [1, 2, 3, 4, 5, 6, 7, 8] }, "a", [9, 10, 11], 10)).toEqual({
      ok: false,
      motivo: "maximo",
    });
    expect(juntarCartela(undefined, "a", [1, 2, 3], 2)).toEqual({ ok: false, motivo: "maximo" });
  });

  it("item só com quantidade soma a quantidade, e os números passam a ser sorteados", () => {
    expect(juntarCartela({ slug: "a", quantidade: 7 }, "a", [1, 2, 3])).toEqual({ ok: true, item: { slug: "a", quantidade: 10 }, novos: 3 });
  });

  it("item com a quantidade sugerida (0) é trocado pela cartela", () => {
    expect(juntarCartela({ slug: "a", quantidade: 0 }, "a", [4, 5])).toEqual({
      ok: true,
      item: { slug: "a", quantidade: 2, numeros: [4, 5] },
      novos: 2,
    });
  });
});

describe("rifaAVenda", () => {
  const base = { status: "published", soldCount: 10, totalQuotas: 100 };
  it("só rifa no ar, de verdade, destravada, com cota e Pix online", () => {
    expect(rifaAVenda(base)).toBe(true);
    expect(rifaAVenda({ ...base, status: "closed" })).toBe(false);
    expect(rifaAVenda({ ...base, status: "drawn" })).toBe(false);
    expect(rifaAVenda({ ...base, demonstracao: true })).toBe(false);
    expect(rifaAVenda({ ...base, travada: true })).toBe(false);
    expect(rifaAVenda({ ...base, soldCount: 100 })).toBe(false);
    expect(rifaAVenda({ ...base, pixOnline: false })).toBe(false);
  });
});

describe("quantidade", () => {
  it("fica entre o mínimo e o máximo por pedido", () => {
    expect(quantidadeNaFaixa(0, 5, 50)).toBe(5);
    expect(quantidadeNaFaixa(3, 5, 50)).toBe(5);
    expect(quantidadeNaFaixa(80, 5, 50)).toBe(50);
    expect(quantidadeNaFaixa(12.7, 5, 50)).toBe(12);
    expect(quantidadeNaFaixa(Number.NaN, 5, 50)).toBe(5);
  });

  it("a sugerida é o pacote em destaque, senão o menor, senão o mínimo", () => {
    const pacotes = [
      { quantity: 25, discountPct: 5, highlight: false },
      { quantity: 10, discountPct: 0, highlight: true },
    ];
    expect(quantidadeInicial(pacotes, 1, 100)).toBe(10);
    expect(quantidadeInicial(pacotes.map((p) => ({ ...p, highlight: false })), 1, 100)).toBe(10);
    expect(quantidadeInicial([], 3, 100)).toBe(3);
    expect(quantidadeInicial(pacotes, 1, 8)).toBe(8);
  });

  it("o total é o da compra, com o pacote aplicado", () => {
    const pacotes = [{ quantity: 10, discountPct: 10 }];
    expect(totalDoItem(10, 199, pacotes)).toBe(priceOrder({ quantity: 10, unitCents: 199, packages: pacotes }).totalCents);
    expect(totalDoItem(10, 199, pacotes)).toBe(1791);
  });
});

describe("agruparPorOrganizacao", () => {
  it("separa por promotora, na ordem em que entraram", () => {
    const g = agruparPorOrganizacao([
      { id: 1, organizacao: { slug: "b" } },
      { id: 2, organizacao: { slug: "a" } },
      { id: 3, organizacao: { slug: "b" } },
    ]);
    expect(g.map((x) => [x.slug, x.itens.map((i) => i.id)])).toEqual([
      ["b", [1, 3]],
      ["a", [2]],
    ]);
  });
});

describe("splitDoCarrinho", () => {
  it("uma promotora só: o mesmo percentual do pedido avulso", () => {
    expect(
      splitDoCarrinho([
        { walletId: "w1", amountCents: 1000, percentualDoPromotor: 95 },
        { walletId: "w1", amountCents: 3000, percentualDoPromotor: 95 },
      ]),
    ).toEqual([{ walletId: "w1", percentual: 95 }]);
  });

  it("duas promotoras: cada uma pesada pelo valor dos pedidos dela", () => {
    // 1000 a 95% e 3000 a 90%: 950/4000 = 23,75% e 2700/4000 = 67,5%.
    expect(
      splitDoCarrinho([
        { walletId: "a", amountCents: 1000, percentualDoPromotor: 95 },
        { walletId: "b", amountCents: 3000, percentualDoPromotor: 90 },
      ]),
    ).toEqual([
      { walletId: "a", percentual: 23.75 },
      { walletId: "b", percentual: 67.5 },
    ]);
  });

  it("sem carteira, a parte fica na plataforma (não entra no split)", () => {
    expect(
      splitDoCarrinho([
        { walletId: null, amountCents: 1000, percentualDoPromotor: 100 },
        { walletId: "b", amountCents: 1000, percentualDoPromotor: 100 },
      ]),
    ).toEqual([{ walletId: "b", percentual: 50 }]);
  });

  it("arredonda para baixo em 4 casas e a soma nunca passa de 100%", () => {
    for (let a = 1; a <= 997; a += 37) {
      for (const pct of [100, 95, 92.5, 87.3333]) {
        const partes = splitDoCarrinho([
          { walletId: "a", amountCents: a, percentualDoPromotor: pct },
          { walletId: "b", amountCents: 1000 - a + 3, percentualDoPromotor: pct },
          { walletId: "c", amountCents: 7, percentualDoPromotor: 100 },
        ]);
        const soma = partes.reduce((s, p) => s + p.percentual, 0);
        expect(soma).toBeLessThanOrEqual(100 + 1e-9);
        for (const p of partes) expect(Math.round(p.percentual * 10_000)).toBeCloseTo(p.percentual * 10_000, 6);
      }
    }
  });

  it("nunca dá à promotora mais do que ela teria pedido a pedido", () => {
    const pedidos = [
      { walletId: "a", amountCents: 333, percentualDoPromotor: 95 },
      { walletId: "a", amountCents: 667, percentualDoPromotor: 90 },
      { walletId: "b", amountCents: 1, percentualDoPromotor: 95 },
    ];
    const total = 1001;
    const [a] = splitDoCarrinho(pedidos);
    expect((a.percentual / 100) * total).toBeLessThanOrEqual(333 * 0.95 + 667 * 0.9 + 1e-9);
  });
});

describe("situacaoDoCarrinho", () => {
  it("esperando enquanto algum espera; pago se algum pagou; senão vencido", () => {
    expect(situacaoDoCarrinho(["pending", "pending"])).toBe("pending");
    expect(situacaoDoCarrinho(["paid", "paid"])).toBe("paid");
    expect(situacaoDoCarrinho(["paid", "refunded"])).toBe("paid");
    expect(situacaoDoCarrinho(["expired", "expired"])).toBe("expired");
  });
});
