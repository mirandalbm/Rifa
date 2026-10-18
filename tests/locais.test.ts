import { describe, expect, it } from "vitest";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { UFS, ordenarPorProximidade } from "../shared/endereco";
import {
  LOCAIS,
  LOCAL_NACIONAL,
  ROTULO_DOS_LOCAIS,
  caminhoDaBandeira,
  escolhaDoLocal,
  rotuloDoLocalEmVigor,
  rotuloDoLocalEscolhido,
} from "../shared/locais";

const PASTA = new URL("../client/public/bandeiras/", import.meta.url);
const lerFonte = (caminho: string) => readFileSync(new URL(caminho, import.meta.url), "utf8");

describe("Locais — os 27 estados e as bandeiras", () => {
  it("são os 27 estados de UFS, cada um com nome e bandeira", () => {
    expect(LOCAIS).toHaveLength(27);
    expect(LOCAIS.map((l) => l.uf)).toEqual(Object.keys(UFS));
    for (const l of LOCAIS) {
      expect(l.nome, l.uf).toBe(UFS[l.uf]);
      expect(l.bandeira).toBe(caminhoDaBandeira(l.uf));
    }
  });

  it("o caminho da bandeira é do próprio site, em minúsculas", () => {
    expect(caminhoDaBandeira("SP")).toBe("/bandeiras/sp.svg");
    for (const l of LOCAIS) expect(l.bandeira).toMatch(/^\/bandeiras\/[a-z]{2}\.svg$/);
  });

  it("existe um arquivo por estado, mais o do Brasil (Nacional), e nenhum a mais", () => {
    const arquivos = readdirSync(PASTA).sort();
    expect(arquivos).toEqual([...LOCAIS.map((l) => `${l.uf.toLowerCase()}.svg`), "br.svg"].sort());
    expect(LOCAL_NACIONAL.bandeira).toBe("/bandeiras/br.svg");
  });

  it("cada arquivo é um SVG quadrado, pequeno e sem script nem imagem de fora", () => {
    for (const l of [...LOCAIS, { uf: "BR" }]) {
      const caminho = new URL(`${l.uf.toLowerCase()}.svg`, PASTA);
      expect(existsSync(caminho), l.uf).toBe(true);
      const svg = readFileSync(caminho, "utf8");
      expect(svg.startsWith("<svg "), l.uf).toBe(true);
      expect(svg, l.uf).toContain('viewBox="0 0 200 200"');
      expect(svg.length, l.uf).toBeLessThan(10_000);
      // Servido como imagem do próprio site (CSP: nada de fora, nada de script).
      expect(svg, l.uf).not.toMatch(/<script|<image|<foreignObject|href=|https?:\/\/(?!www\.w3\.org)/i);
    }
  });
});

describe("Locais — o painel", () => {
  const painel = lerFonte("../client/src/components/LocaisDaVitrine.tsx");
  const seletor = lerFonte("../client/src/components/SeletorDeRegiao.tsx");

  it("o painel é diálogo (Janela) e cada bandeira tem o nome do estado escrito ao lado", () => {
    expect(painel).toContain("<Janela");
    expect(painel).toContain("rotuloPor={titulo}");
    // O nome do estado é texto no botão; a imagem é enfeite e nunca a única informação.
    expect(painel).toContain("{l.nome}");
    expect(painel).toContain('alt=""');
    expect(painel).toContain("aria-pressed={escolhido}");
    expect(painel).toContain("Escolhido");
  });

  it("o alvo de toque tem pelo menos 24 px (52 px de altura)", () => {
    expect(painel).toContain("min-h-[52px]");
    expect(painel).toContain("h-10 w-10");
  });

  it("a grade começa em uma coluna", () => {
    expect(painel).toContain("grid grid-cols-1");
  });

  it("escolher muda o mesmo estado do seletor de antes (regiao.ts) e só ordena", () => {
    expect(seletor).toContain("aoEscolherUf");
    expect(seletor).toContain("gravarRegiao");
    expect(seletor).toContain("ouvirRegiao");
    // Nada de filtro: o painel só escolhe o estado.
    expect(painel).not.toMatch(/\.filter\(|esconder|ocultar/);
  });

  it("Nacional é o primeiro item da lista, antes dos 27 estados, com o nome escrito", () => {
    const iNacional = painel.indexOf("LOCAL_NACIONAL.nome");
    const iEstados = painel.indexOf("LOCAIS.map");
    expect(iNacional).toBeGreaterThan(-1);
    expect(iNacional).toBeLessThan(iEstados);
    expect(painel).toContain("LOCAL_NACIONAL.descricao");
    expect(LOCAL_NACIONAL.nome).toBe("Nacional");
  });

  it("nenhuma bandeira entra no rodapé: é só do painel Locais", () => {
    const rodape = lerFonte("../client/src/components/RodapeDaPlataforma.tsx");
    expect(rodape).not.toMatch(/bandeira|locais/i);
  });

  it("o texto do botão e do rótulo é Locais, não Rifas perto de", () => {
    expect(ROTULO_DOS_LOCAIS).toBe("Locais");
    expect(rotuloDoLocalEscolhido("São Paulo")).toBe("Locais: São Paulo");
    expect(seletor).toContain("aria-label={rotulo}");
    expect(seletor).toContain("title={rotulo}");
    expect(seletor).not.toContain("Rifas perto de");
    expect(seletor).not.toContain("<select");
  });
});

describe("Locais — escolher só ordena, nunca esconde", () => {
  const rifas = [
    { id: 1, uf: "RJ", cidade: "Niterói" },
    { id: 2, uf: "SP", cidade: "São Paulo" },
    { id: 3, uf: "SP", cidade: "Campinas" },
    { id: 4, uf: "MG", cidade: "Uberlândia" },
    { id: 5, uf: null, cidade: null },
    { id: 6, uf: "BA", cidade: "Salvador" },
  ];
  const ids = (l: typeof rifas) => l.map((r) => r.id).sort();

  it("escolher qualquer estado, ou Nacional, nunca reduz a lista — só muda a ordem", () => {
    const escolhas = [...Object.keys(UFS).map((uf) => escolhaDoLocal(uf, null)), escolhaDoLocal("", null)];
    expect(escolhas).toHaveLength(28);
    for (const e of escolhas) {
      const lista = e ? ordenarPorProximidade(rifas, e) : [...rifas];
      expect(lista, JSON.stringify(e)).toHaveLength(rifas.length);
      expect(ids(lista)).toEqual(ids(rifas));
    }
  });

  it("o estado escolhido vai na frente, e a ordem das outras segue como vinha", () => {
    const lista = ordenarPorProximidade(rifas, escolhaDoLocal("SP", null)!);
    expect(lista.slice(0, 2).map((r) => r.id)).toEqual([2, 3]);
    expect(lista.slice(2).map((r) => r.id)).toEqual([1, 4, 5, 6]);
  });

  it("Nacional limpa a escolha manual (null): a ordem automática da conta segue valendo", () => {
    expect(escolhaDoLocal("", { uf: "RJ", cidade: "Niterói" })).toBeNull();
    expect(escolhaDoLocal("BR", null)).toBeNull();
    expect(escolhaDoLocal("xx", null)).toBeNull();
  });

  it("escolher o estado da própria conta guarda a cidade dela; outro estado, sem cidade", () => {
    expect(escolhaDoLocal("RJ", { uf: "RJ", cidade: "Niterói" })).toEqual({ uf: "RJ", cidade: "Niterói" });
    expect(escolhaDoLocal("SP", { uf: "RJ", cidade: "Niterói" })).toEqual({ uf: "SP", cidade: null });
  });

  it("o rótulo diz o que está valendo", () => {
    expect(rotuloDoLocalEmVigor({ uf: "SP", manual: true })).toBe("Locais: São Paulo");
    expect(rotuloDoLocalEmVigor({ uf: null, manual: false })).toBe("Locais: Nacional");
    expect(rotuloDoLocalEmVigor({ uf: "RJ", manual: false })).toBe("Locais: Nacional (automático: RJ)");
  });

  it("o painel não filtra nada, e quem ordena segue sendo ordenarPorProximidade", () => {
    const hook = lerFonte("../client/src/components/SeletorDeRegiao.tsx");
    const painel = lerFonte("../client/src/components/LocaisDaVitrine.tsx");
    expect(hook).toContain("escolhaDoLocal(uf, conta)");
    expect(hook).not.toMatch(/\.filter\(/);
    expect(painel).not.toMatch(/\.filter\(/);
    const vitrine = lerFonte("../client/src/pages/Vitrine.tsx");
    // A vitrine só passa a região ao servidor como ordem (`uf`, `cidade`); o filtro é de /estado/UF.
    expect(vitrine).not.toMatch(/estado:\s*regiao|\?estado=/);
  });
});
