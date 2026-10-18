import { describe, it, expect } from "vitest";
import {
  arrecadacaoDaRifa,
  atingeOMinimo,
  avaliarMinimo,
  problemaNoMinimo,
  ordenarVitrine,
  ehNacionalAprovada,
  validarConfigRifaNacional,
  mesclarConfigRifaNacional,
  configRifaNacionalGuardada,
  CONFIG_RIFA_NACIONAL_PADRAO,
  RIFA_NACIONAL_MINIMO_PADRAO_CENTS,
  RIFA_NACIONAL_MINIMO_MAX_CENTS,
} from "../shared/rifaNacional";
import { ordenarPorProximidade, type Regiao } from "../shared/endereco";
import { CONFIG_PADRAO, validarConfigPlataforma } from "../shared/plataforma";
import { formatBRL } from "../shared/format";

const MINIMO = 10_000_000;

describe("arrecadação: cotas × preço, em centavos inteiros", () => {
  it("é o produto de dois inteiros", () => {
    expect(arrecadacaoDaRifa(50_000, 200)).toBe(10_000_000);
    expect(arrecadacaoDaRifa(100, 100_000)).toBe(10_000_000); // 100 cotas × R$ 1.000,00
    expect(arrecadacaoDaRifa(1_000_000, 10)).toBe(10_000_000); // 1.000.000 de cotas × R$ 0,10
    expect(arrecadacaoDaRifa(0, 500)).toBe(0);
    expect(arrecadacaoDaRifa(500, 0)).toBe(0);
  });

  it("preço × total grandes não estouram nem perdem centavo", () => {
    const maiorPreco = 2_147_483_647; // maior inteiro de 32 bits (price_cents)
    const total = 1_000_000;
    const a = arrecadacaoDaRifa(total, maiorPreco);
    expect(Number.isSafeInteger(a)).toBe(true);
    // A mesma conta em inteiro grande, sem ponto flutuante no meio.
    expect(BigInt(a)).toBe(BigInt(total) * BigInt(maiorPreco));
    expect(a).toBe(2_147_483_647_000_000);
  });

  it("recusa o que não é inteiro, é negativo ou não cabe em inteiro seguro", () => {
    expect(() => arrecadacaoDaRifa(1.5, 100)).toThrow();
    expect(() => arrecadacaoDaRifa(100, 0.1)).toThrow();
    expect(() => arrecadacaoDaRifa(-1, 100)).toThrow();
    expect(() => arrecadacaoDaRifa(100, -1)).toThrow();
    expect(() => arrecadacaoDaRifa(Number.NaN, 100)).toThrow();
    expect(() => arrecadacaoDaRifa(100, Number.POSITIVE_INFINITY)).toThrow();
    expect(() => arrecadacaoDaRifa("100" as never, 100)).toThrow();
    expect(() => arrecadacaoDaRifa(undefined as never, 100)).toThrow();
    // 1e9 × 1e9 = 1e18, acima do inteiro seguro: erro, nunca um número arredondado.
    expect(() => arrecadacaoDaRifa(1_000_000_000, 1_000_000_000)).toThrow(/exatid/);
  });
});

describe("o mínimo é inclusivo", () => {
  it("a borda exata: igual ao mínimo vale, um centavo a menos não", () => {
    expect(atingeOMinimo(9_999_999, MINIMO)).toBe(false);
    expect(atingeOMinimo(10_000_000, MINIMO)).toBe(true);
    expect(atingeOMinimo(10_000_001, MINIMO)).toBe(true);
  });

  it("R$ 99.999,99 recusa; R$ 100.000,00 aceita", () => {
    expect(problemaNoMinimo(9_999_999, 1, MINIMO)).toMatch(/Faltam/);
    expect(problemaNoMinimo(50_000, 200, MINIMO)).toBeNull();
    // 49.999 cotas × R$ 2,00 = R$ 99.998,00
    expect(avaliarMinimo(49_999, 200, MINIMO)).toEqual({
      arrecadacaoCents: 9_999_800,
      minimoCents: MINIMO,
      atinge: false,
      faltaCents: 200,
    });
  });

  it("a falta é dita em reais e é exata", () => {
    const msg = problemaNoMinimo(1_000, 1_000, MINIMO) as string; // R$ 10.000,00
    expect(msg).toContain(formatBRL(9_000_000));
    expect(msg).toContain(formatBRL(MINIMO));
  });

  it("atingido: falta zero, sem problema", () => {
    expect(avaliarMinimo(100, 100_000, MINIMO)).toEqual({
      arrecadacaoCents: 10_000_000,
      minimoCents: MINIMO,
      atinge: true,
      faltaCents: 0,
    });
    expect(problemaNoMinimo(1_000_000, 10, MINIMO)).toBeNull();
  });

  it("segue o mínimo que a plataforma configurar", () => {
    expect(atingeOMinimo(5_000_000, 5_000_000)).toBe(true);
    expect(atingeOMinimo(5_000_000, 5_000_001)).toBe(false);
  });

  it("recusa valor que não é centavo inteiro", () => {
    expect(() => atingeOMinimo(1.5, MINIMO)).toThrow();
    expect(() => atingeOMinimo(100, Number.NaN)).toThrow();
    expect(() => atingeOMinimo(-1, MINIMO)).toThrow();
  });
});

/* ------------------------------------------------------------------ */

interface R extends Regiao {
  id: string;
  nacionalStatus?: string | null;
  nacionalAprovadaEm?: Date | string | number | null;
}

const comum = (id: string, uf: string | null, cidade: string | null = null): R => ({ id, uf, cidade });
const nac = (id: string, aprovadaEm: R["nacionalAprovadaEm"], uf: string | null = null, cidade: string | null = null): R => ({
  id,
  uf,
  cidade,
  nacionalStatus: "aprovada",
  nacionalAprovadaEm: aprovadaEm,
});
const ids = (l: readonly R[]) => l.map((r) => r.id);
const LIGADA = { ligado: true, teto: 3 };

describe("ordenarVitrine", () => {
  const comuns = [
    comum("rj", "RJ", "Niterói"),
    comum("sp-capital", "SP", "São Paulo"),
    comum("sem-endereco", null),
    comum("campinas", "SP", "Campinas"),
    comum("sp-capital-2", "SP", "sao  paulo"),
  ];
  const SP = { uf: "SP", cidade: "São Paulo" };

  it("sem nenhuma nacional o resultado é idêntico ao de ordenarPorProximidade", () => {
    for (const perto of [SP, { uf: "sp" }, {}, { uf: "RJ" }]) {
      expect(ordenarVitrine(comuns, perto, LIGADA)).toEqual(ordenarPorProximidade(comuns, perto));
    }
  });

  it("pedido em análise não é nacional: continua sendo rifa comum", () => {
    const lista = [...comuns, { ...comum("pedida", "MG"), nacionalStatus: "em_analise" }];
    expect(ehNacionalAprovada(lista[lista.length - 1])).toBe(false);
    expect(ordenarVitrine(lista, SP, LIGADA)).toEqual(ordenarPorProximidade(lista, SP));
  });

  it("desligada, ignora as nacionais (a vitrine volta à de antes)", () => {
    const lista = [...comuns, nac("n1", "2026-10-01T00:00:00Z", "AM")];
    expect(ordenarVitrine(lista, SP, { ligado: false, teto: 3 })).toEqual(ordenarPorProximidade(lista, SP));
    // Só o `true` liga.
    expect(ordenarVitrine(lista, SP, { ligado: "sim" as never, teto: 3 })).toEqual(ordenarPorProximidade(lista, SP));
  });

  it("teto inválido nunca esconde: cai na ordem de antes", () => {
    const lista = [...comuns, nac("n1", "2026-10-01T00:00:00Z", "AM")];
    for (const teto of [0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(ordenarVitrine(lista, SP, { ligado: true, teto })).toEqual(ordenarPorProximidade(lista, SP));
    }
  });

  it("uma nacional abre a lista, para quem olha de qualquer UF, com ou sem região", () => {
    const lista = [...comuns, nac("n-am", "2026-10-01T00:00:00Z", "AM", "Manaus")];
    for (const perto of [SP, { uf: "sp" }, {}, { uf: "RS" }, { uf: "AM", cidade: "Manaus" }]) {
      expect(ordenarVitrine(lista, perto, LIGADA)[0].id).toBe("n-am");
    }
    // O resto segue a proximidade de quem olha.
    expect(ids(ordenarVitrine(lista, SP, LIGADA))).toEqual([
      "n-am",
      "sp-capital",
      "sp-capital-2",
      "campinas",
      "rj",
      "sem-endereco",
    ]);
  });

  it("a nacional da mesma UF de quem olha também fica no topo, não no meio do estado", () => {
    const lista = [comum("campinas", "SP", "Campinas"), nac("n-sp", "2026-10-01T00:00:00Z", "SP", "Santos"), comum("sp-capital", "SP", "São Paulo")];
    expect(ids(ordenarVitrine(lista, SP, LIGADA))).toEqual(["n-sp", "sp-capital", "campinas"]);
  });

  it("várias nacionais: a aprovada há mais tempo primeiro; o id desempata", () => {
    const lista = [
      comum("c1", "SP"),
      nac("n-nova", "2026-10-10T00:00:00Z"),
      nac("n-velha", "2026-09-01T00:00:00Z"),
      nac("n-b", "2026-10-05T00:00:00Z"),
      nac("n-a", "2026-10-05T00:00:00Z"),
    ];
    expect(ids(ordenarVitrine(lista, {}, { ligado: true, teto: 10 }))).toEqual([
      "n-velha",
      "n-a",
      "n-b",
      "n-nova",
      "c1",
    ]);
  });

  it("aceita a data como Date, texto ISO ou milissegundos; sem data legível vai por último", () => {
    const lista = [
      nac("sem-data", null),
      nac("lixo", "não é data"),
      nac("em-ms", Date.UTC(2026, 9, 3)),
      nac("em-date", new Date("2026-10-02T00:00:00Z")),
      nac("em-iso", "2026-10-01T00:00:00Z"),
    ];
    expect(ids(ordenarVitrine(lista, {}, { ligado: true, teto: 10 }))).toEqual([
      "em-iso",
      "em-date",
      "em-ms",
      "lixo", // sem data legível: empatam e o id desempata
      "sem-data",
    ]);
  });

  it("o teto: as que passam dele não somem, caem no resto ordenadas por proximidade", () => {
    const lista = [
      comum("sp-capital", "SP", "São Paulo"),
      nac("n1", "2026-09-01T00:00:00Z", "AM"),
      comum("rj", "RJ"),
      nac("n2", "2026-09-02T00:00:00Z", "PA"),
      nac("n3", "2026-09-03T00:00:00Z", "RS"),
      nac("n4-sp", "2026-09-04T00:00:00Z", "SP", "São Paulo"),
      nac("n5", "2026-09-05T00:00:00Z", "BA"),
    ];
    const r = ordenarVitrine(lista, SP, { ligado: true, teto: 3 });
    // Topo: as 3 mais antigas. Resto, na ordem de entrada e por proximidade:
    // n4-sp e sp-capital (cidade), depois o resto como veio.
    expect(ids(r)).toEqual(["n1", "n2", "n3", "sp-capital", "n4-sp", "rj", "n5"]);
    expect(r).toHaveLength(lista.length);

    const teto1 = ordenarVitrine(lista, SP, { ligado: true, teto: 1 });
    expect(teto1[0].id).toBe("n1");
    expect(teto1).toHaveLength(lista.length);
  });

  it("a mesma rifa aparece uma vez só e nada some", () => {
    const lista = [
      comum("a", "SP"),
      nac("n1", "2026-09-01T00:00:00Z"),
      comum("b", "RJ"),
      nac("n2", "2026-09-02T00:00:00Z"),
      nac("n3", "2026-09-03T00:00:00Z"),
      nac("n4", "2026-09-04T00:00:00Z"),
    ];
    const r = ordenarVitrine(lista, { uf: "SP" }, LIGADA);
    expect(r).toHaveLength(lista.length);
    expect(new Set(r).size).toBe(lista.length);
    expect(ids(r).sort()).toEqual(ids(lista).sort());
    for (const x of lista) expect(r).toContain(x); // os mesmos objetos
  });

  it("é estável: o resto mantém a ordem de entrada dentro de cada faixa", () => {
    const lista = [
      comum("d1", "RJ"),
      nac("n1", "2026-09-01T00:00:00Z"),
      comum("d2", "RJ"),
      comum("d3", "RJ"),
      comum("e1", "SP"),
      comum("e2", "SP"),
    ];
    expect(ids(ordenarVitrine(lista, { uf: "SP" }, LIGADA))).toEqual(["n1", "e1", "e2", "d1", "d2", "d3"]);
    // E sem região: o resto fica exatamente como veio.
    expect(ids(ordenarVitrine(lista, {}, LIGADA))).toEqual(["n1", "d1", "d2", "d3", "e1", "e2"]);
  });

  it("repetir a chamada dá a mesma lista, e a entrada não é alterada", () => {
    const lista = [comum("a", "SP"), nac("n2", "2026-09-02T00:00:00Z"), nac("n1", "2026-09-01T00:00:00Z"), comum("b", "RJ")];
    const copia = [...lista];
    const um = ordenarVitrine(lista, { uf: "RJ" }, LIGADA);
    const dois = ordenarVitrine(lista, { uf: "RJ" }, LIGADA);
    expect(ids(um)).toEqual(ids(dois));
    expect(lista).toEqual(copia);
  });

  it("lista vazia", () => {
    expect(ordenarVitrine([], { uf: "SP" }, LIGADA)).toEqual([]);
  });

  it("propriedade: com ou sem nacional, nada some e o resto é a ordem de proximidade", () => {
    // Gerador determinístico (LCG): o teste não muda de uma rodada para outra.
    let seed = 20261018;
    const rnd = (n: number) => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed % n;
    };
    const UFS = ["SP", "RJ", "MG", "AM", null];
    for (let rodada = 0; rodada < 300; rodada++) {
      const tamanho = rnd(14);
      const lista: R[] = Array.from({ length: tamanho }, (_, i) => {
        const uf = UFS[rnd(UFS.length)];
        const cidade = uf ? ["São Paulo", "Campinas", "Niterói"][rnd(3)] : null;
        return rnd(3) === 0
          ? nac(`r${i}`, new Date(Date.UTC(2026, 8, 1 + rnd(20))), uf, cidade)
          : comum(`r${i}`, uf, cidade);
      });
      const perto = rnd(2) ? { uf: UFS[rnd(4)] as string, cidade: "São Paulo" } : {};
      const teto = 1 + rnd(5);
      const r = ordenarVitrine(lista, perto, { ligado: true, teto });

      expect(r).toHaveLength(lista.length);
      expect(ids(r).sort()).toEqual(ids(lista).sort());

      const nacionais = lista.filter(ehNacionalAprovada);
      const noTopo = Math.min(teto, nacionais.length);
      // O topo só tem nacionais, na ordem aprovada-há-mais-tempo.
      const topo = r.slice(0, noTopo);
      expect(topo.every(ehNacionalAprovada)).toBe(true);
      const tempos = topo.map((x) => new Date(x.nacionalAprovadaEm as Date).getTime());
      expect([...tempos].sort((a, b) => a - b)).toEqual(tempos);
      // Nenhuma nacional que ficou de fora é mais antiga que a última do topo.
      for (const fora of r.slice(noTopo).filter(ehNacionalAprovada)) {
        expect(new Date(fora.nacionalAprovadaEm as Date).getTime()).toBeGreaterThanOrEqual(tempos[tempos.length - 1]);
      }
      // Depois do topo: exatamente a proximidade do que sobrou.
      const sobrou = lista.filter((x) => !topo.includes(x));
      expect(ids(r.slice(noTopo))).toEqual(ids(ordenarPorProximidade(sobrou, perto)));
      // Sem nacional: idêntico ao de hoje.
      if (nacionais.length === 0) expect(r).toEqual(ordenarPorProximidade(lista, perto));
    }
  });
});

describe("a ordem de antes continua intacta", () => {
  it("ordenarPorProximidade segue sem conhecer rifa nacional", () => {
    const lista = [nac("n1", "2026-09-01T00:00:00Z", "AM"), comum("sp", "SP", "São Paulo")];
    // A função antiga ignora a nacional: quem decide o topo é ordenarVitrine.
    expect(ids(ordenarPorProximidade(lista, { uf: "SP", cidade: "São Paulo" }))).toEqual(["sp", "n1"]);
    expect(ids(ordenarPorProximidade(lista, {}))).toEqual(["n1", "sp"]);
  });
});

describe("configuração da rifa nacional", () => {
  it("nasce desligada, com R$ 100.000 e o teto de 3", () => {
    expect(CONFIG_RIFA_NACIONAL_PADRAO).toEqual({ ligado: false, minimoCents: 10_000_000, teto: 3 });
    expect(RIFA_NACIONAL_MINIMO_PADRAO_CENTS).toBe(10_000_000);
    expect(CONFIG_PADRAO.rifaNacional).toEqual(CONFIG_RIFA_NACIONAL_PADRAO);
    expect(validarConfigPlataforma({}).rifaNacional).toEqual(CONFIG_RIFA_NACIONAL_PADRAO);
    expect(validarConfigRifaNacional(undefined)).toEqual(CONFIG_RIFA_NACIONAL_PADRAO);
    expect(validarConfigRifaNacional(null)).toEqual(CONFIG_RIFA_NACIONAL_PADRAO);
  });

  it("só liga com true de verdade", () => {
    expect(validarConfigRifaNacional({ ligado: true }).ligado).toBe(true);
    expect(validarConfigRifaNacional({ ligado: "sim" }).ligado).toBe(false);
    expect(validarConfigRifaNacional({ ligado: 1 }).ligado).toBe(false);
  });

  it("só guarda as chaves conhecidas", () => {
    const c = validarConfigRifaNacional({ ligado: true, extra: 1, minimoCents: 5_000_000, teto: 2, __proto__: { x: 1 } });
    expect(Object.keys(c).sort()).toEqual(["ligado", "minimoCents", "teto"]);
    expect(c).toEqual({ ligado: true, minimoCents: 5_000_000, teto: 2 });
  });

  it("o mínimo é centavo inteiro positivo, com teto de sanidade", () => {
    expect(validarConfigRifaNacional({ minimoCents: 1 }).minimoCents).toBe(1);
    expect(validarConfigRifaNacional({ minimoCents: RIFA_NACIONAL_MINIMO_MAX_CENTS }).minimoCents).toBe(
      RIFA_NACIONAL_MINIMO_MAX_CENTS,
    );
    for (const ruim of [0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, RIFA_NACIONAL_MINIMO_MAX_CENTS + 1, "10000000", null, true]) {
      expect(() => validarConfigRifaNacional({ minimoCents: ruim })).toThrow();
    }
  });

  it("o teto vai de 1 a 10", () => {
    expect(validarConfigRifaNacional({ teto: 1 }).teto).toBe(1);
    expect(validarConfigRifaNacional({ teto: 10 }).teto).toBe(10);
    for (const ruim of [0, 11, 2.5, -3, Number.NaN, "3", null]) {
      expect(() => validarConfigRifaNacional({ teto: ruim })).toThrow();
    }
  });

  it("recusa o que não é objeto, com status 400", () => {
    for (const ruim of ["ligado", 3, true, [1, 2]]) {
      try {
        validarConfigRifaNacional(ruim);
        throw new Error("devia recusar");
      } catch (e) {
        expect((e as { status?: number }).status).toBe(400);
      }
    }
  });

  it("ao salvar, parte da configuração atual: o pedaço enviado não apaga o resto", () => {
    const atual = { ligado: false, minimoCents: 20_000_000, teto: 5 };
    expect(mesclarConfigRifaNacional(atual, { ligado: true })).toEqual({ ligado: true, minimoCents: 20_000_000, teto: 5 });
    expect(mesclarConfigRifaNacional(atual, { minimoCents: 30_000_000 })).toEqual({
      ligado: false,
      minimoCents: 30_000_000,
      teto: 5,
    });
    expect(mesclarConfigRifaNacional(atual, { teto: undefined, extra: 9 })).toEqual(atual);
    expect(mesclarConfigRifaNacional(atual, undefined)).toEqual(atual);
    expect(() => mesclarConfigRifaNacional(atual, { teto: 99 })).toThrow();
    expect(() => mesclarConfigRifaNacional(atual, "x")).toThrow();
  });

  it("ao ler o que está gravado, o que não passa mais na régua volta ao padrão sem derrubar a plataforma", () => {
    expect(configRifaNacionalGuardada({ ligado: true, minimoCents: -5 })).toEqual(CONFIG_RIFA_NACIONAL_PADRAO);
    expect(configRifaNacionalGuardada("lixo")).toEqual(CONFIG_RIFA_NACIONAL_PADRAO);
    expect(configRifaNacionalGuardada({ ligado: true, minimoCents: 6_000_000, teto: 4 })).toEqual({
      ligado: true,
      minimoCents: 6_000_000,
      teto: 4,
    });
    // Dentro da configuração da plataforma: o resto fica de pé.
    const p = validarConfigPlataforma({ estornoManual: true, rifaNacional: { minimoCents: -5 } as never });
    expect(p.estornoManual).toBe(true);
    expect(p.rifaNacional).toEqual(CONFIG_RIFA_NACIONAL_PADRAO);
  });

  it("o padrão não é partilhado: mexer no resultado não muda o padrão", () => {
    const c = validarConfigRifaNacional(undefined);
    c.teto = 9;
    expect(CONFIG_RIFA_NACIONAL_PADRAO.teto).toBe(3);
  });
});
