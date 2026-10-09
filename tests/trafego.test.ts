import { describe, expect, it } from "vitest";
import {
  CONFIG_TRAFEGO_PADRAO,
  centavosDoGasto,
  codigoDaCampanha,
  codigoNoNome,
  janelaDaImportacao,
  lerLinhasDoGasto,
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
      cliques: null,
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

describe("gasto importado das redes (fase 2)", () => {
  it("acha o código no nome da campanha da rede, só com 8 hex inteiros", () => {
    expect(codigoNoNome("Rifa Moto · trafego-3F2A9C1B · BR")).toBe("3f2a9c1b");
    expect(codigoNoNome("trafego-3f2a9c1b")).toBe("3f2a9c1b");
    expect(codigoNoNome("trafego-3f2a9c1bz")).toBe("3f2a9c1b");
    expect(codigoNoNome("trafego-3f2a9c1b0")).toBeNull();
    expect(codigoNoNome("xtrafego-3f2a9c1b")).toBeNull();
    expect(codigoNoNome("trafego-3f2a9c")).toBeNull();
    expect(codigoNoNome(42)).toBeNull();
  });

  it("reais da rede em centavos inteiros, nada negativo nem estragado", () => {
    expect(centavosDoGasto("12.34")).toBe(1234);
    expect(centavosDoGasto(0.1 + 0.2)).toBe(30);
    expect(centavosDoGasto(0)).toBe(0);
    expect(centavosDoGasto("-1")).toBeNull();
    expect(centavosDoGasto("abc")).toBeNull();
    expect(centavosDoGasto("")).toBeNull();
    expect(centavosDoGasto(Infinity)).toBeNull();
    expect(centavosDoGasto(1e12)).toBeNull();
    // Para baixo, nunca a mais — e o erro do ponto flutuante não vira centavo perdido.
    expect(centavosDoGasto("12.345")).toBe(1234);
    expect(centavosDoGasto(1.005)).toBe(100);
    expect(centavosDoGasto("0.29")).toBe(29);
  });

  it("soma em frações de centavo e arredonda uma vez só, para baixo", () => {
    const janela = { desde: "2026-10-06", ate: "2026-10-08" };
    const meio = { campaign: "trafego-3f2a9c1b", datasource: "google_ads", date: "2026-10-07", spend: "0.005", clicks: 1 };
    expect(lerLinhasDoGasto([meio, meio], janela).gastos).toEqual([{ codigo: "3f2a9c1b", dia: "2026-10-07", rede: "google", gastoCents: 1, cliques: 2 }]);
    expect(lerLinhasDoGasto([meio], janela).gastos).toEqual([]);
  });

  it("a janela são os dias fechados: de 3 dias atrás até ontem", () => {
    expect(janelaDaImportacao("2026-10-09")).toEqual({ desde: "2026-10-06", ate: "2026-10-08" });
    expect(janelaDaImportacao("2026-03-01")).toEqual({ desde: "2026-02-26", ate: "2026-02-28" });
  });

  it("soma por campanha, dia e rede e conta o que ficou de fora", () => {
    const janela = { desde: "2026-10-06", ate: "2026-10-08" };
    const { gastos, ignoradas } = lerLinhasDoGasto(
      [
        { campaign: "Moto trafego-3f2a9c1b", datasource: "google_ads", date: "2026-10-07", spend: "10.50", clicks: 30 },
        { campaign: "Moto trafego-3f2a9c1b (2)", datasource: "google_ads", date: "2026-10-07", spend: 4.5, clicks: "10" },
        { campaign: "Moto trafego-3f2a9c1b", source: "facebook", date: "2026-10-07", spend: "3", clicks: 0 },
        { campaign: "Sem código", datasource: "google_ads", date: "2026-10-07", spend: "1" },
        { campaign: "trafego-3f2a9c1b", datasource: "linkedin", date: "2026-10-07", spend: "1" },
        { campaign: "trafego-3f2a9c1b", datasource: "tiktok", date: "2026-10-09", spend: "1" },
        { campaign: "trafego-3f2a9c1b", datasource: "tiktok", date: "2026-10-07", spend: "-1" },
        { campaign: "trafego-3f2a9c1b", datasource: "tiktok", date: "2026-10-07", spend: "1", clicks: 1.5 },
        { campaign: "trafego-3f2a9c1b", datasource: "constructor", date: "2026-10-07", spend: "1" },
        { campaign: "trafego-3f2a9c1b", datasource: "tiktok", date: "2026-10-08", spend: "0", clicks: 5 },
        null,
        "texto",
      ],
      janela,
    );
    expect(gastos).toEqual([
      { codigo: "3f2a9c1b", dia: "2026-10-07", rede: "google", gastoCents: 1500, cliques: 40 },
      { codigo: "3f2a9c1b", dia: "2026-10-07", rede: "meta", gastoCents: 300, cliques: 0 },
    ]);
    expect(ignoradas).toEqual({ sem_codigo: 1, rede: 2, data: 1, valor: 2 });
    expect(lerLinhasDoGasto({ data: [] }, janela)).toEqual({ gastos: [], ignoradas: {} });
  });

  it("o lançamento à mão aceita os cliques opcionais", () => {
    const c = { redes: ["google"], investimentoCents: 1_000, gastoCents: 0, diaDaAprovacao: "2026-10-01" };
    expect(validarGasto({ dia: "2026-10-05", rede: "google", gastoCents: 10 }, c, "2026-10-09").cliques).toBeNull();
    expect(validarGasto({ dia: "2026-10-05", rede: "google", gastoCents: 10, cliques: 7 }, c, "2026-10-09").cliques).toBe(7);
    expect(() => validarGasto({ dia: "2026-10-05", rede: "google", gastoCents: 10, cliques: -1 }, c, "2026-10-09")).toThrow(/Cliques/);
    expect(() => validarGasto({ dia: "2026-10-05", rede: "google", gastoCents: 10, cliques: 1.5 }, c, "2026-10-09")).toThrow(/Cliques/);
  });
});
