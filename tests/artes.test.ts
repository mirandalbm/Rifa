import { describe, expect, it } from "vitest";
import {
  artesDisponiveis,
  dataDoSorteio,
  interpretarFormatoDaArte,
  interpretarTipoDeArte,
  legendaSugerida,
  nomeDoArquivoDaArte,
  nomeDoPacote,
  rodapeDaArte,
  textosDaArte,
  type DadosDaArte,
} from "../shared/artes";
import { camadaDaArte, larguraDoTexto, qrEmContorno, quebrarTexto, type RifaDaArte } from "../server/services/arteDesenho";
import { crc32, montarZip } from "../server/services/zip";
import { textosDoKit } from "../shared/afiliados";
import { formatBRL } from "../shared/format";

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

describe("pacote pronto para postar (Fase G)", () => {
  const link = "https://x.com.br/c/ABC123";
  it("a legenda leva os dados, o link e o aviso; sem 'últimas cotas'", () => {
    for (const tipo of ["rifa", "faltam", "contagem"] as const) {
      const l = legendaSugerida(tipo, base, link);
      expect(l).toContain(link);
      expect(l).toContain(`${formatBRL(1990)} a cota`);
      expect(l).toContain("Autorizada SPA/MF nº 05.012345/2026".replace("Autorizada", "Rifa autorizada"));
      expect(l).toContain("Só vale bilhete pago pela plataforma.");
      expect(l.toLowerCase()).not.toContain("últimas");
      expect(l).not.toContain("#publi");
    }
    expect(legendaSugerida("faltam", base, link)).toContain("Faltam 36.579 cotas");
  });
  it("a do afiliado é identificada como publicidade (termo, cláusula 7)", () => {
    expect(legendaSugerida("rifa", base, link, true).endsWith("#publi")).toBe(true);
  });
  it("o resultado sai como a tela mostra e manda conferir", () => {
    const l = legendaSugerida("resultado", { ...base, status: "drawn", vende: false, resultado: { numero: 78140, nome: "Ana S." } }, link);
    expect(l).toContain("Número contemplado: 78139 — parabéns, Ana S.!");
    expect(l).toContain(`A conferência é pública: ${link}`);
    expect(l).not.toContain("Só vale bilhete");
  });
  it("nome do pacote", () => {
    expect(nomeDoPacote("moto-cg", "rifa")).toBe("pacote-moto-cg-rifa.zip");
  });
  it("CRC-32 da especificação", () => {
    expect(crc32(Buffer.from("123456789"))).toBe(0xcbf43926);
  });
  it("o ZIP lista cada arquivo com o tamanho, o CRC e o nome em UTF-8", () => {
    const arquivos = [
      { nome: "arte.jpg", dados: Buffer.from([0xff, 0xd8, 0xff, 0xd9]) },
      { nome: "legenda.txt", dados: Buffer.from("Ação\n", "utf8") },
    ];
    const zip = montarZip(arquivos, new Date(2026, 9, 8, 12, 0, 0));
    const fim = zip.length - 22;
    expect(zip.readUInt32LE(fim)).toBe(0x06054b50);
    expect(zip.readUInt16LE(fim + 10)).toBe(2);
    let p = zip.readUInt32LE(fim + 16);
    for (const a of arquivos) {
      expect(zip.readUInt32LE(p)).toBe(0x02014b50);
      expect(zip.readUInt16LE(p + 8) & 0x0800).toBe(0x0800);
      expect(zip.readUInt32LE(p + 16)).toBe(crc32(a.dados));
      expect(zip.readUInt32LE(p + 24)).toBe(a.dados.length);
      const n = zip.readUInt16LE(p + 28);
      expect(zip.subarray(p + 46, p + 46 + n).toString("utf8")).toBe(a.nome);
      const local = zip.readUInt32LE(p + 42);
      expect(zip.readUInt32LE(local)).toBe(0x04034b50);
      const dados = zip.subarray(local + 30 + n, local + 30 + n + a.dados.length);
      expect(Buffer.compare(dados, a.dados)).toBe(0);
      p += 46 + n;
    }
  });
});

describe("textos prontos do kit do afiliado (termo, cláusula 7)", () => {
  const kit = {
    premio: "Moto 0 km",
    precoCents: 1500,
    drawAt: "2026-10-17T22:00:00Z",
    metodoApuracao: "federal_direta",
    autorizacao: "SPA-1",
    totalQuotas: 1000,
    vendidas: 400,
    cupom: null,
  };
  it("todo texto leva #publi, preço, data, autorização e o link", () => {
    for (const t of textosDoKit(kit, "https://x/r/moto?ref=AF1")) {
      expect(t).toContain("#publi");
      expect(t).toContain(formatBRL(1500));
      expect(t).toContain("17/10");
      expect(t).toContain("SPA/MF nº SPA-1");
      expect(t).toContain("https://x/r/moto?ref=AF1");
      expect(t.toLowerCase()).not.toContain("últimas");
    }
  });
  it("sem cupom, o número de agora; esgotada, sem 'faltam'", () => {
    expect(textosDoKit(kit, "u")[2]).toContain("Faltam 600 cotas");
    expect(textosDoKit({ ...kit, vendidas: 1000 }, "u")[2]).toContain("esgotou");
    expect(textosDoKit({ ...kit, cupom: { code: "ANA10", discountPct: 10 } }, "u")[2]).toContain("cupom ANA10");
  });
});
