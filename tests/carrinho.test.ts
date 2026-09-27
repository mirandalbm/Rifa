import { describe, expect, it } from "vitest";
import {
  CARRINHO_MAX_ITENS,
  agruparPorOrganizacao,
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
