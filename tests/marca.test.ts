import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { CORES_DA_LOGO, NOME_DA_LOGO_ESCRITA, usaLogoEscrita } from "../client/src/lib/marca";
import { LOGO_ESCRITA } from "../client/src/lib/logoEscritaDesenho";
import { CONTRASTE_MIN, FUNDO, TEMPLATE_PADRAO, contraste } from "../shared/template";

const css = readFileSync(path.resolve(import.meta.dirname, "../client/src/index.css"), "utf8");

function variaveis(inicio: string): Record<string, string> {
  const i = css.indexOf(inicio);
  expect(i, `bloco "${inicio}" no index.css`).toBeGreaterThan(-1);
  const trecho = css.slice(i, css.indexOf("}", i));
  return Object.fromEntries([...trecho.matchAll(/(--[\w-]+):\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()]));
}

describe("logo escrita Loterias do Bem", () => {
  it("vale para o nome padrão do template, sem diferença de acento, maiúscula ou espaço", () => {
    expect(usaLogoEscrita(TEMPLATE_PADRAO.identidade.nome)).toBe(true);
    expect(usaLogoEscrita(NOME_DA_LOGO_ESCRITA)).toBe(true);
    expect(usaLogoEscrita("  loterias   DO bem ")).toBe(true);
  });

  it("nunca diz um nome que a plataforma não publicou", () => {
    expect(usaLogoEscrita("Nacional prêmios")).toBe(false);
    expect(usaLogoEscrita("Loterias do Bem Brasil")).toBe(false);
    expect(usaLogoEscrita("")).toBe(false);
  });

  it("os tokens --logo-* do index.css são as cores da logo, nos dois temas", () => {
    const claro = variaveis(":root {");
    const escuro = variaveis(':root:not([data-tema="claro"])');
    for (const [nome, valor] of Object.entries(CORES_DA_LOGO.claro)) expect(claro[nome], nome).toBe(valor);
    for (const [nome, valor] of Object.entries(CORES_DA_LOGO.escuro)) expect(escuro[nome], nome).toBe(valor);
  });

  it("cada cor da logo tem contraste ≥ 3:1 com o fundo do tema dela", () => {
    for (const [nome, valor] of Object.entries(CORES_DA_LOGO.claro)) {
      expect(contraste(valor, FUNDO.claro), `${nome} no claro`).toBeGreaterThanOrEqual(CONTRASTE_MIN);
    }
    for (const [nome, valor] of Object.entries(CORES_DA_LOGO.escuro)) {
      expect(contraste(valor, FUNDO.escuro), `${nome} no escuro`).toBeGreaterThanOrEqual(CONTRASTE_MIN);
    }
  });

  it("o desenho gerado tem as duas partes da frase, numa linha só", () => {
    expect(LOGO_ESCRITA.verde.length).toBeGreaterThan(0);
    expect(LOGO_ESCRITA.vermelho.length).toBeGreaterThan(0);
    // uma linha: bem mais larga que alta
    expect(LOGO_ESCRITA.largura / LOGO_ESCRITA.altura).toBeGreaterThan(6);
  });
});
