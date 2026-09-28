import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

/**
 * O guia das versões (docs/VERSOES.md) é também o registro das mudanças do
 * celular. Este teste é o que impede a leva de ficar esquecida e o mapa de
 * ficar velho: passou do limite de mudanças aguardando, falha — e o próximo
 * PR é a leva; rota nova sem linha no mapa, falha.
 */
const raiz = path.resolve(import.meta.dirname, "..");
const guia = fs.readFileSync(path.join(raiz, "docs/VERSOES.md"), "utf8");
const app = fs.readFileSync(path.join(raiz, "client/src/App.tsx"), "utf8");
const claude = fs.readFileSync(path.join(raiz, "CLAUDE.md"), "utf8");

/** O texto de uma seção `## Título`, até a próxima seção do mesmo nível. */
function secao(titulo: string): string {
  const inicio = guia.indexOf(`\n## ${titulo}\n`);
  if (inicio < 0) throw new Error(`seção "${titulo}" não está no guia`);
  const resto = guia.slice(inicio + titulo.length + 5);
  const fim = resto.search(/\n## /);
  return fim < 0 ? resto : resto.slice(0, fim);
}

/** Linhas de tabela da seção: cabeçalho primeiro, sem a linha de traços. */
function tabela(texto: string): string[][] {
  return texto
    .split("\n")
    .filter((l) => l.startsWith("|") && !/^\|[-|\s]+\|$/.test(l))
    .map((l) => l.slice(1, -1).split("|").map((c) => c.trim()));
}

const limite = Number(guia.match(/Limite da leva: \*\*(\d+)\*\*/)?.[1]);
const [cabecalho, ...registro] = tabela(secao("Registro das mudanças do celular"));
const [, ...levas] = tabela(secao("Levas"));

describe("guia das versões", () => {
  it("diz o limite da leva, de 1 a 10, e usa o mesmo número no texto todo", () => {
    expect(limite).toBeGreaterThanOrEqual(1);
    expect(limite).toBeLessThanOrEqual(10);
    // "A cada **10** mudanças", "chega a **10** linhas": trocar o limite num
    // lugar só deixaria o guia dizendo duas coisas.
    const citados = [...guia.matchAll(/\*\*(\d+)\*\* (?:mudanças|linhas)/g)].map((m) => Number(m[1]));
    expect(citados.length).toBeGreaterThan(0);
    for (const n of citados) expect(n).toBe(limite);
    // O CLAUDE.md repete o limite na seção das versões.
    const noClaude = claude.match(/A cada \*\*(\d+)\*\* aguardando/)?.[1];
    expect(Number(noClaude)).toBe(limite);
  });

  it("o registro tem as colunas combinadas", () => {
    expect(cabecalho).toEqual([
      "Nº",
      "Data",
      "PR",
      "Tela",
      "O que mudou no celular",
      "Tablet e computador",
      "Situação",
    ]);
  });

  it("cada mudança tem número em sequência, data, PR, tela e situação válidos", () => {
    registro.forEach((linha, i) => {
      const [n, data, pr, tela, mudou, outras, situacao] = linha;
      expect(linha, `linha ${i + 1} do registro`).toHaveLength(7);
      expect(Number(n), `numeração do registro na linha ${i + 1}`).toBe(i + 1);
      expect(data).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(Number.isNaN(Date.parse(data))).toBe(false);
      expect(pr).toMatch(/^#\d+$/);
      expect(tela.length).toBeGreaterThan(0);
      expect(mudou.length).toBeGreaterThan(0);
      expect(outras.length).toBeGreaterThan(0);
      expect(situacao).toMatch(/^(aguardando leva|leva \d+)$/);
    });
  });

  it("não passa do limite de mudanças aguardando a leva", () => {
    const aguardando = registro.filter((l) => l[6] === "aguardando leva").length;
    expect(
      aguardando,
      `${aguardando} mudanças aguardando (limite ${limite}): o próximo PR é a leva — docs/VERSOES.md`,
    ).toBeLessThanOrEqual(limite);
  });

  it("toda mudança levada está no intervalo da sua leva, e as levas vêm em ordem", () => {
    const faixa = new Map<number, [number, number]>();
    levas.forEach(([numero, data, pr, mudancas], i) => {
      expect(Number(numero)).toBe(i);
      expect(data).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(pr).toMatch(/^#\d+$/);
      const m = mudancas.match(/^(\d+)(?: a (\d+))?$/);
      if (m) faixa.set(i, [Number(m[1]), Number(m[2] ?? m[1])]);
      else expect(mudancas).toBe("—");
    });
    for (const [n, , , , , , situacao] of registro) {
      const leva = situacao.match(/^leva (\d+)$/)?.[1];
      if (leva === undefined) continue;
      const [de, ate] = faixa.get(Number(leva)) ?? [NaN, NaN];
      expect(Number(n) >= de && Number(n) <= ate, `mudança ${n} marcada na leva ${leva}`).toBe(true);
    }
  });

  it("o mapa das telas tem toda rota do App.tsx, e só elas", () => {
    // O nome do parâmetro não importa: `/r/:slug` e `/r/:rifa` são a mesma rota.
    const normal = (r: string) => r.replace(/:\w+/g, ":x");
    const doApp = new Set([...app.matchAll(/<Route path="([^"]+)"/g)].map((m) => normal(m[1])));
    const doMapa = new Set(
      tabela(secao("Mapa das telas"))
        .flatMap(([rotas]) => [...(rotas ?? "").matchAll(/`(\/[^`]*)`/g)].map((m) => normal(m[1]))),
    );
    expect(doApp.size).toBeGreaterThan(40);
    expect([...doApp].filter((r) => !doMapa.has(r)), "rota sem linha no mapa").toEqual([]);
    expect([...doMapa].filter((r) => !doApp.has(r)), "linha do mapa sem rota").toEqual([]);
  });
});
