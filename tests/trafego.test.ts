import { describe, expect, it } from "vitest";
import {
  CONFIG_TRAFEGO_PADRAO,
  codigoDaCampanha,
  custoPorVenda,
  linkDoAnuncio,
  problemaNaRecusa,
  reservaDoPedido,
  sobraDaCampanha,
  taxaSobre,
  utmCampanhaDe,
  validarConfigTrafego,
  validarGasto,
  validarPedidoDeTrafego,
  type ConfigTrafegoPago,
} from "../shared/trafego";

const cfg: ConfigTrafegoPago = { ...CONFIG_TRAFEGO_PADRAO, ligado: true, redes: ["google", "meta"] };
const pedido = { redes: ["google"], investimentoCents: 50_000, verbaDiaCents: 5_000 };

describe("configuração do tráfego pago", () => {
  it("nasce desligada e sem rede", () => {
    expect(validarConfigTrafego(undefined)).toEqual(CONFIG_TRAFEGO_PADRAO);
    expect(CONFIG_TRAFEGO_PADRAO.ligado).toBe(false);
    expect(CONFIG_TRAFEGO_PADRAO.redes).toEqual([]);
  });

  it("só guarda as chaves conhecidas e as redes da lista", () => {
    const c = validarConfigTrafego({ ligado: true, redes: ["google", "orkut", "google"], taxaPct: 15, extra: "<script>" });
    expect(c).toEqual({ ...CONFIG_TRAFEGO_PADRAO, ligado: true, redes: ["google"], taxaPct: 15 });
    expect(Object.keys(c)).not.toContain("extra");
  });

  it("ligar exige pelo menos uma rede", () => {
    expect(() => validarConfigTrafego({ ligado: true, redes: [] })).toThrow(/pelo menos uma rede/);
  });

  it("taxa de 0 a 100 e o mínimo por dia nunca acima do investimento mínimo", () => {
    expect(() => validarConfigTrafego({ taxaPct: 101 })).toThrow();
    expect(() => validarConfigTrafego({ taxaPct: 12.5 })).toThrow();
    expect(() => validarConfigTrafego({ investimentoMinCents: 10_000, verbaDiaMinCents: 20_000 })).toThrow(/mínimo por dia/);
  });
});

describe("pedido de campanha", () => {
  it("aceita o pedido dentro da tabela", () => {
    expect(validarPedidoDeTrafego(cfg, pedido)).toEqual({ ...pedido, uf: null, cidade: null, observacao: null });
  });

  it("recusa rede que a plataforma não oferece e pedido sem rede", () => {
    expect(() => validarPedidoDeTrafego(cfg, { ...pedido, redes: ["tiktok"] })).toThrow(/TikTok/);
    expect(() => validarPedidoDeTrafego(cfg, { ...pedido, redes: [] })).toThrow(/pelo menos uma rede/);
  });

  it("investimento e verba do dia nos limites, em centavos inteiros", () => {
    expect(() => validarPedidoDeTrafego(cfg, { ...pedido, investimentoCents: cfg.investimentoMinCents - 1 })).toThrow();
    expect(() => validarPedidoDeTrafego(cfg, { ...pedido, investimentoCents: 50_000.5 })).toThrow();
    expect(() => validarPedidoDeTrafego(cfg, { ...pedido, verbaDiaCents: cfg.verbaDiaMinCents - 1 })).toThrow();
    expect(() => validarPedidoDeTrafego(cfg, { ...pedido, verbaDiaCents: 60_000 })).toThrow();
    expect(() => validarPedidoDeTrafego(cfg, { ...pedido, investimentoCents: 10_000_001 })).toThrow();
  });

  it("cidade só com estado; estado desconhecido não entra", () => {
    expect(() => validarPedidoDeTrafego(cfg, { ...pedido, cidade: "Recife" })).toThrow(/estado/);
    expect(() => validarPedidoDeTrafego(cfg, { ...pedido, uf: "XX" })).toThrow(/Estado/);
    expect(validarPedidoDeTrafego(cfg, { ...pedido, uf: "PE", cidade: "  Recife " })).toMatchObject({ uf: "PE", cidade: "Recife" });
    expect(() => validarPedidoDeTrafego(cfg, { ...pedido, uf: "PE", cidade: "<b>x</b>" })).toThrow(/cidade/);
  });

  it("observação sem link e sem telefone", () => {
    expect(() => validarPedidoDeTrafego(cfg, { ...pedido, observacao: "chama no 81 99999-8888" })).toThrow();
    expect(() => validarPedidoDeTrafego(cfg, { ...pedido, observacao: "veja www.site.com" })).toThrow();
    expect(validarPedidoDeTrafego(cfg, { ...pedido, observacao: "Público de 25 a 45 anos" }).observacao).toBe("Público de 25 a 45 anos");
  });
});

describe("dinheiro da campanha", () => {
  it("a taxa arredonda para baixo e a reserva é mídia + taxa", () => {
    expect(taxaSobre(999, 20)).toBe(199);
    expect(reservaDoPedido(30_000, 20)).toBe(36_000);
  });

  it("a soma das taxas de cada dia nunca passa da reserva", () => {
    for (const pct of [0, 7, 15, 20, 33, 100]) {
      for (const investimento of [100, 999, 30_001, 77_777]) {
        let gasto = 0;
        let taxa = 0;
        let dia = 1;
        while (gasto < investimento) {
          const g = Math.min(investimento - gasto, (dia * 37) % 1_000 + 1);
          gasto += g;
          taxa += taxaSobre(g, pct);
          dia++;
        }
        expect(gasto + taxa).toBeLessThanOrEqual(reservaDoPedido(investimento, pct));
        expect(sobraDaCampanha({ reservaCents: reservaDoPedido(investimento, pct), gastoCents: gasto, taxaCents: taxa })).toBe(
          reservaDoPedido(investimento, pct) - gasto - taxa,
        );
      }
    }
  });

  it("custo por venda para baixo; sem venda, nulo", () => {
    expect(custoPorVenda(1_000, 3)).toBe(333);
    expect(custoPorVenda(1_000, 0)).toBeNull();
  });
});

describe("gasto do dia", () => {
  const c = { redes: ["google"], investimentoCents: 10_000, gastoCents: 9_000, diaDaAprovacao: "2026-10-01" };
  it("aceita o dia dentro da campanha", () => {
    expect(validarGasto({ dia: "2026-10-05", rede: "google", gastoCents: 1_000 }, c, "2026-10-09")).toEqual({
      dia: "2026-10-05",
      rede: "google",
      gastoCents: 1_000,
    });
  });
  it("recusa dia no futuro, antes da aprovação, rede fora da campanha e gasto acima da verba", () => {
    expect(() => validarGasto({ dia: "2026-10-10", rede: "google", gastoCents: 1 }, c, "2026-10-09")).toThrow(/ainda não chegou/);
    expect(() => validarGasto({ dia: "2026-09-30", rede: "google", gastoCents: 1 }, c, "2026-10-09")).toThrow(/anterior/);
    expect(() => validarGasto({ dia: "2026-10-05", rede: "meta", gastoCents: 1 }, c, "2026-10-09")).toThrow(/rede/);
    expect(() => validarGasto({ dia: "2026-10-05", rede: "constructor", gastoCents: 1 }, c, "2026-10-09")).toThrow(/rede/);
    expect(() => validarGasto({ dia: "2026-10-05", rede: "google", gastoCents: 1_001 }, c, "2026-10-09")).toThrow(
      expect.objectContaining({ status: 409 }),
    );
    expect(() => validarGasto({ dia: "05/10/2026", rede: "google", gastoCents: 1 }, c, "2026-10-09")).toThrow(/Data/);
  });
});

describe("atribuição", () => {
  const id = "3f2a9c1b-0d4e-4f5a-8b6c-7d8e9f0a1b2c";
  it("o código é o começo do id, sem hífen", () => {
    expect(codigoDaCampanha(id)).toBe("3f2a9c1b");
    expect(utmCampanhaDe(id)).toBe("trafego-3f2a9c1b");
  });
  it("o link do anúncio leva à rifa dentro do perfil, com a UTM", () => {
    const l = new URL(linkDoAnuncio("https://rifa.app/", { id, orgSlug: "org", rifaSlug: "moto" }, "meta"));
    expect(l.pathname).toBe("/o/org/r/moto");
    expect(l.searchParams.get("utm_source")).toBe("meta");
    expect(l.searchParams.get("utm_medium")).toBe("cpc");
    expect(l.searchParams.get("utm_campaign")).toBe("trafego-3f2a9c1b");
  });
  it("recusa sem motivo", () => {
    expect(problemaNaRecusa("curto")).not.toBeNull();
    expect(problemaNaRecusa("A arte promete prêmio em dinheiro.")).toBeNull();
  });
});
