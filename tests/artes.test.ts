import { describe, expect, it } from "vitest";
import {
  artesDisponiveis,
  dataDoSorteio,
  interpretarFormatoDaArte,
  interpretarTipoDeArte,
  nomeDoArquivoDaArte,
  rodapeDaArte,
  textosDaArte,
  type DadosDaArte,
} from "../shared/artes";
import { camadaDaArte, larguraDoTexto, qrEmContorno, quebrarTexto, type RifaDaArte } from "../server/services/arteDesenho";

const agora = Date.parse("2026-10-08T12:00:00Z");
const base: DadosDaArte = {
  premio: "Moto Honda CG 160 0 km",
  precoCents: 1990,
  totalQuotas: 100000,
  vendidas: 63421,
  drawAt: "2026-10-17T22:00:00Z",
  metodoApuracao: "federal_direta",
  autorizacao: "05.012345/2026",
  status: "published",
  demonstracao: false,
  travada: false,
  vende: true,
  resultado: null,
  premiadas: [],
};

describe("quais artes a rifa tem", () => {
  it("rifa no ar e vendendo: rifa, faltam e data", () => {
    expect(artesDisponiveis(base, agora)).toEqual(["rifa", "faltam", "contagem"]);
  });
  it("demonstração, travada e rascunho não têm arte", () => {
    expect(artesDisponiveis({ ...base, demonstracao: true }, agora)).toEqual([]);
    expect(artesDisponiveis({ ...base, travada: true, resultado: { numero: 1, nome: null } }, agora)).toEqual([]);
    expect(artesDisponiveis({ ...base, status: "draft" }, agora)).toEqual([]);
  });
  it("esgotada ou sem venda: sem 'faltam'; sorteio passado: sem data", () => {
    expect(artesDisponiveis({ ...base, vendidas: 100000, vende: false }, agora)).toEqual(["rifa", "contagem"]);
    expect(artesDisponiveis({ ...base, vende: false }, agora)).toEqual(["rifa", "contagem"]);
    expect(artesDisponiveis({ ...base, drawAt: "2026-10-01T22:00:00Z" }, agora)).toEqual(["rifa", "faltam"]);
  });
  it("sorteada: resultado; com cota premiada reclamada: premiada", () => {
    const sorteada = { ...base, status: "drawn", vende: false, resultado: { numero: 78140, nome: "Ana S." } };
    expect(artesDisponiveis(sorteada, agora)).toEqual(["resultado"]);
    const comPremiada = { ...base, premiadas: [{ numero: 12, premio: "iPhone", nome: "João P." }] };
    expect(artesDisponiveis(comPremiada, agora)).toContain("premiada");
  });
});

describe("textos da arte", () => {
  it("faltam: o número de agora, no singular quando é uma", () => {
    expect(textosDaArte("faltam", base).destaque).toBe("36.579 cotas");
    expect(textosDaArte("faltam", { ...base, vendidas: 99999 }).destaque).toBe("1 cota");
  });
  it("a data no fuso de São Paulo, com o método da apuração", () => {
    expect(dataDoSorteio("2026-10-17T22:00:00Z")).toBe("sábado, 17/10 às 19h");
    expect(dataDoSorteio("2026-10-17T22:30:00Z")).toBe("sábado, 17/10 às 19h30");
    expect(textosDaArte("contagem", base).linhas[0]).toBe("Apuração pela Loteria Federal");
    expect(textosDaArte("contagem", { ...base, metodoApuracao: "globo" }).linhas[0]).toBe("Apuração no globo da plataforma");
  });
  it("o número sai como a tela mostra (de zero na leitura direta da Federal)", () => {
    const r = textosDaArte("resultado", { ...base, resultado: { numero: 78140, nome: "Ana S." } });
    expect(r.destaque).toBe("Nº 78139");
    expect(r.linhas[0]).toBe("Contemplado: Ana S.");
    const antiga = textosDaArte("resultado", { ...base, metodoApuracao: null, totalQuotas: 1000, resultado: { numero: 7, nome: null } });
    expect(antiga.destaque).toBe("Nº 0007");
    expect(antiga.linhas[0]).toBe("Sorteio realizado");
  });
  it("a autorização aparece na arte da rifa", () => {
    expect(textosDaArte("rifa", base).linhas).toContain("Autorizada SPA/MF nº 05.012345/2026");
  });
  it("'Compre' só enquanto vende; o resultado manda conferir", () => {
    expect(rodapeDaArte("rifa", true)[0]).toBe("Compre pelo site");
    expect(rodapeDaArte("rifa", false)[0]).toBe("Veja a rifa no site");
    expect(rodapeDaArte("resultado", false)[0]).toBe("Confira o resultado");
  });
});

describe("o que vem da URL", () => {
  it("só tipo e formato conhecidos", () => {
    expect(interpretarTipoDeArte("rifa")).toBe("rifa");
    expect(interpretarTipoDeArte("../etc")).toBeNull();
    expect(interpretarTipoDeArte(["rifa"])).toBeNull();
    expect(interpretarFormatoDaArte(undefined)).toBe("retrato");
    expect(interpretarFormatoDaArte("vertical")).toBe("vertical");
    expect(interpretarFormatoDaArte("constructor")).toBeNull();
    expect(interpretarFormatoDaArte("gigante")).toBeNull();
  });
  it("nome do arquivo", () => {
    expect(nomeDoArquivoDaArte("moto-cg", "faltam", "quadrado")).toBe("arte-moto-cg-faltam-quadrado.jpg");
  });
});

describe("desenho", () => {
  const rifa: RifaDaArte = {
    id: "r",
    slug: "moto-cg",
    organizationId: "o",
    orgNome: "Ação <Solidária> & Cia",
    destaque: "#1d4ed8",
    capaKey: null,
    dados: { ...base, premio: 'Moto "0 km" <script>alert(1)</script> com um prêmio de nome bem comprido que não cabe em três linhas de jeito nenhum mesmo' },
  };

  it("quebra em linhas que cabem e põe reticências no que sobra", () => {
    const linhas = quebrarTexto("premio", rifa.dados.premio, 60, 952, 3);
    expect(linhas).toHaveLength(3);
    expect(linhas[2].endsWith("…")).toBe(true);
    for (const l of linhas) expect(larguraDoTexto("premio", l, 60)).toBeLessThanOrEqual(952);
  });

  it("o texto vira contorno: nada do prêmio ou do nome entra como texto no SVG", () => {
    for (const formato of ["retrato", "quadrado", "vertical"] as const) {
      const { svg } = camadaDaArte({ rifa, tipo: "rifa", formato, url: "https://x.com.br/r/moto-cg?ref=AF1" }, true);
      expect(svg).not.toContain("<script");
      expect(svg).not.toContain("<text");
      expect(svg).not.toContain("Solidária");
      expect(svg.startsWith("<svg")).toBe(true);
    }
  });

  it("no 9:16 nada fica nas faixas que o story cobre", () => {
    const { svg } = camadaDaArte({ rifa, tipo: "faltam", formato: "vertical", url: "https://x.com.br/r/moto-cg" }, false);
    const ys = [...svg.matchAll(/translate\(([\d.]+) ([\d.]+)\)/g)].map((m) => Number(m[2]));
    expect(Math.min(...ys)).toBeGreaterThanOrEqual(220);
    expect(Math.max(...ys)).toBeLessThanOrEqual(1920 - 450);
  });

  it("o QR é um caminho só sobre fundo branco", () => {
    const qr = qrEmContorno("https://x.com.br/r/moto-cg?ref=AF1", 10, 20, 200);
    expect(qr).toContain('fill="#ffffff"');
    expect((qr.match(/<path/g) ?? []).length).toBe(1);
  });
});
