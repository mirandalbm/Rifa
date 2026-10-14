import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { NOME_DA_LOGO_ESCRITA, usaLogoEscrita } from "../client/src/lib/marca";
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

  it("as cores da logo têm contraste ≥ 3:1 com o fundo dos dois temas", () => {
    const claro = variaveis(":root {");
    const escuro = variaveis(':root:not([data-tema="claro"])');
    for (const nome of ["--logo-verde", "--logo-vermelho", "--logo-vermelho-escuro"]) {
      expect(contraste(claro[nome], FUNDO.claro), `${nome} no claro`).toBeGreaterThanOrEqual(CONTRASTE_MIN);
      expect(contraste(escuro[nome], FUNDO.escuro), `${nome} no escuro`).toBeGreaterThanOrEqual(CONTRASTE_MIN);
    }
  });
});
