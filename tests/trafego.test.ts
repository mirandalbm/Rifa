import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  ACEITE_DA_TAXA_VERSAO,
  CONFIG_TRAFEGO_PADRAO,
  centavosDoGasto,
  codigoDaCampanha,
  codigoNoNome,
  janelaDaImportacao,
  lerLinhasDoGasto,
  custoPorVenda,
  linhaDoPacote,
  linkDoAnuncio,
  pacotesDoTexto,
  pacotesValidos,
  textoDosPacotes,
  problemaNaRecusa,
  problemaNoAceiteDaTaxa,
  reaisDoAceite,
  reservaDoPedido,
  sobraDaCampanha,
  taxaDoLancamento,
  taxaSobre,
  textoDoAceiteDaTaxa,
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

describe("pacotes de investimento", () => {
  it("de fábrica: 50, 100, 250 e 500 reais, com o mínimo no menor", () => {
    expect(CONFIG_TRAFEGO_PADRAO.pacotesCents).toEqual([5_000, 10_000, 25_000, 50_000]);
    expect(CONFIG_TRAFEGO_PADRAO.investimentoMinCents).toBe(CONFIG_TRAFEGO_PADRAO.pacotesCents[0]);
  });

  it("a taxa vem por cima do pacote, e a soma é a reserva do pedido", () => {
    expect(linhaDoPacote(5_000, 20)).toEqual({ midiaCents: 5_000, taxaCents: 1_000, totalCents: 6_000 });
    expect(linhaDoPacote(50_000, 20).totalCents).toBe(reservaDoPedido(50_000, 20));
    // taxa arredonda para baixo, igual ao lançamento do gasto
    expect(linhaDoPacote(5_001, 20)).toEqual({ midiaCents: 5_001, taxaCents: 1_000, totalCents: 6_001 });
    expect(linhaDoPacote(5_000, 0).taxaCents).toBe(0);
  });

  it("guarda em ordem crescente e confere a lista a sério", () => {
    expect(pacotesValidos([25_000, 5_000, 10_000], 5_000)).toEqual([5_000, 10_000, 25_000]);
    expect(pacotesValidos([], 5_000)).toEqual([]);
    expect(() => pacotesValidos([4_999], 5_000)).toThrow(/Cada pacote/);
    expect(() => pacotesValidos([5_000, 5_000], 5_000)).toThrow(/repetido/);
    expect(() => pacotesValidos([5_000.5], 5_000)).toThrow();
    expect(() => pacotesValidos([true], 5_000)).toThrow();
    expect(() => pacotesValidos([null], 5_000)).toThrow();
    expect(() => pacotesValidos(["", 6_000], 5_000)).toThrow();
    expect(() => pacotesValidos("5000", 5_000)).toThrow(/lista/);
    expect(() => pacotesValidos(Array.from({ length: 9 }, (_, i) => 5_000 + i * 100), 5_000)).toThrow(/No máximo/);
  });

  it("o campo da plataforma volta igual ao salvar (a vírgula é a decimal, o ; separa)", () => {
    const texto = textoDosPacotes(CONFIG_TRAFEGO_PADRAO.pacotesCents);
    expect(texto).toBe("50,00; 100,00; 250,00; 500,00");
    expect(pacotesDoTexto(texto)).toEqual(CONFIG_TRAFEGO_PADRAO.pacotesCents);
    expect(pacotesDoTexto("50; 100,50\n1.000")).toEqual([5_000, 10_050, 100_000]);
    expect(pacotesDoTexto("")).toEqual([]);
    expect(pacotesDoTexto("abc; 50")).toEqual([0, 5_000]);
  });

  it("configuração guardada antes dos pacotes (mínimo maior) continua carregando", () => {
    const c = validarConfigTrafego({ investimentoMinCents: 30_000 });
    expect(c.pacotesCents).toEqual([50_000]);
    expect(validarConfigTrafego({ investimentoMinCents: 60_000 }).pacotesCents).toEqual([]);
  });

  it("o pacote não é obrigatório: outro valor vale a partir do mínimo", () => {
    const c = validarConfigTrafego({ ligado: true, redes: ["google"] });
    expect(validarPedidoDeTrafego(c, { redes: ["google"], investimentoCents: 17_300, verbaDiaCents: 3_000 }).investimentoCents).toBe(17_300);
    expect(() => validarPedidoDeTrafego(c, { redes: ["google"], investimentoCents: 4_999, verbaDiaCents: 2_000 })).toThrow();
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

describe("taxa de gestão cobrada inteira na aprovação", () => {
  const sha = (t: string) => createHash("sha256").update(t, "utf8").digest("hex");

  it("o texto do aceite traz a taxa e o valor em reais do pedido, e não promete devolução", () => {
    const t = textoDoAceiteDaTaxa(20, 4_000);
    expect(t).toBe(
      "A taxa de gestão de 20% (R$ 40,00 neste pedido) é cobrada quando a plataforma aprova a campanha e não é devolvida, " +
        "mesmo que a campanha termine antes de gastar tudo. O valor em anúncios que não for usado volta ao seu saldo como crédito, " +
        "não em dinheiro, e pode ser usado em outra campanha.",
    );
    expect(textoDoAceiteDaTaxa(15, 123_456)).toContain("15% (R$ 1.234,56 neste pedido)");
    expect(textoDoAceiteDaTaxa(0, 0)).toContain("0% (R$ 0,00 neste pedido)");
  });

  it("os reais do aceite são manuais (sem Intl) e com centavos de dois algarismos", () => {
    expect(reaisDoAceite(5)).toBe("0,05");
    expect(reaisDoAceite(100)).toBe("1,00");
    expect(reaisDoAceite(99_999_999)).toBe("999.999,99");
    expect(reaisDoAceite(-1)).toBe("0,00");
  });

  it("a impressão do texto é estável: o mesmo pedido dá o mesmo hash, outro valor ou outra taxa dá outro", () => {
    const base = sha(textoDoAceiteDaTaxa(20, 4_000));
    expect(sha(textoDoAceiteDaTaxa(20, taxaSobre(20_000, 20)))).toBe(base);
    expect(base).toMatch(/^[0-9a-f]{64}$/);
    expect(sha(textoDoAceiteDaTaxa(20, 4_001))).not.toBe(base);
    expect(sha(textoDoAceiteDaTaxa(21, 4_000))).not.toBe(base);
    // Trava a impressão do texto da versão 1: mudou o texto, suba ACEITE_DA_TAXA_VERSAO e troque este valor.
    expect(ACEITE_DA_TAXA_VERSAO).toBe(1);
    expect(base).toBe("aff955055dd8994a6a6d5fdea896e1ad8d04d085663704e57ccdee8de40eddf3");
  });

  it("o aceite é um true de verdade: ausente, false, 'true' e 1 não valem", () => {
    expect(problemaNoAceiteDaTaxa(true)).toBeNull();
    for (const v of [undefined, null, false, "true", 1, "on", {}]) expect(problemaNoAceiteDaTaxa(v)).toMatch(/aceite a taxa/);
  });

  it("taxa do lançamento: nenhuma se a taxa já foi cobrada na aprovação; a diária, para baixo, só no legado", () => {
    const nova = { taxaCobradaEm: new Date("2026-10-09T12:00:00Z"), taxaPct: 20 };
    const legado = { taxaCobradaEm: null, taxaPct: 20 };
    expect(taxaDoLancamento(nova, 5_001)).toBe(0);
    expect(taxaDoLancamento(nova, 1)).toBe(0);
    expect(taxaDoLancamento(legado, 5_001)).toBe(1_000);
    expect(taxaDoLancamento(legado, 4)).toBe(0);
    expect(taxaDoLancamento({ taxaCobradaEm: "2026-10-09T12:00:00.000Z", taxaPct: 20 }, 5_001)).toBe(0);
  });

  it("a taxa inteira + qualquer gasto até a verba nunca passa da reserva; a sobra é só a mídia não gasta", () => {
    for (const pct of [0, 7, 20, 33, 100]) {
      for (const investimento of [100, 999, 30_001, 77_777]) {
        const reserva = reservaDoPedido(investimento, pct);
        const taxa = taxaSobre(investimento, pct);
        expect(investimento + taxa).toBe(reserva);
        for (const gasto of [0, 1, Math.floor(investimento / 3), investimento]) {
          const sobra = sobraDaCampanha({ reservaCents: reserva, gastoCents: gasto, taxaCents: taxa });
          expect(sobra).toBe(investimento - gasto);
          expect(gasto + taxa + sobra).toBe(reserva);
        }
      }
    }
  });

  it("encerrar sem gastar nada devolve só a mídia; recusar ou cancelar em análise (taxa ainda zero) devolve tudo", () => {
    const reserva = reservaDoPedido(10_000, 20);
    expect(sobraDaCampanha({ reservaCents: reserva, gastoCents: 0, taxaCents: taxaSobre(10_000, 20) })).toBe(10_000);
    expect(sobraDaCampanha({ reservaCents: reserva, gastoCents: 0, taxaCents: 0 })).toBe(reserva);
  });

  it("legado (taxa diária): a sobra continua sendo a reserva menos mídia e taxas dos dias", () => {
    const reserva = reservaDoPedido(10_000, 20);
    const gasto = 4_333;
    const legado = { taxaCobradaEm: null, taxaPct: 20 };
    const taxa = taxaDoLancamento(legado, 3_333) + taxaDoLancamento(legado, 1_000);
    expect(taxa).toBe(666 + 200);
    expect(sobraDaCampanha({ reservaCents: reserva, gastoCents: gasto, taxaCents: taxa })).toBe(6_801);
  });

  it("o custo por venda usa mídia + a taxa inteira quando ela já foi cobrada", () => {
    expect(custoPorVenda(5_001 + taxaSobre(20_000, 20), 2)).toBe(Math.floor((5_001 + 4_000) / 2));
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
