import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  TEMPLATE_PADRAO,
  FUNDO,
  CONTRASTE_MIN,
  contraste,
  validarTemplate,
  completarTemplate,
  TemplateInvalido,
} from "../shared/template";

const copia = () => JSON.parse(JSON.stringify(TEMPLATE_PADRAO));

describe("template da plataforma", () => {
  it("o padrão passa na própria validação", () => {
    expect(validarTemplate(TEMPLATE_PADRAO)).toEqual(TEMPLATE_PADRAO);
  });

  it("o fundo usado no contraste é o mesmo do index.css", () => {
    const css = readFileSync(path.resolve(import.meta.dirname, "../client/src/index.css"), "utf8");
    expect(css).toContain(`--white: ${FUNDO.claro}`);
    expect(css).toContain(`--white: ${FUNDO.escuro}`);
  });

  it("contraste WCAG conhecido", () => {
    expect(contraste("#000000", "#ffffff")).toBeCloseTo(21, 0);
    expect(contraste("#ffffff", "#ffffff")).toBeCloseTo(1, 5);
  });

  it("recusa cor que some no fundo de cada tema", () => {
    const t = copia();
    t.identidade.cor.claro = "#ffe680"; // amarelo claro no branco
    expect(() => validarTemplate(t)).toThrow(/tema claro.*contraste/);
    const e = copia();
    e.identidade.cor.escuro = "#123020"; // verde escuro no fundo escuro
    expect(() => validarTemplate(e)).toThrow(/tema escuro/);
    expect(contraste(TEMPLATE_PADRAO.identidade.cor.claro, FUNDO.claro)).toBeGreaterThanOrEqual(CONTRASTE_MIN);
  });

  it("só aceita fonte e cantos da lista, e cor #rrggbb", () => {
    expect(() => validarTemplate({ ...copia(), identidade: { ...copia().identidade, fonte: "comic-sans" } })).toThrow(/fonte/);
    expect(() => validarTemplate({ ...copia(), identidade: { ...copia().identidade, raio: "x" } })).toThrow(/cantos/);
    expect(() => validarTemplate({ ...copia(), identidade: { ...copia().identidade, cor: { claro: "red", escuro: "#5dd394" } } })).toThrow(/#rrggbb/);
  });

  it("não guarda chave que não existe, nem HTML como logo", () => {
    const t = { ...copia(), script: "<script>", identidade: { ...copia().identidade, logo: "javascript:alert(1)", extra: 1 } };
    const v = validarTemplate(t) as any;
    expect(v.script).toBeUndefined();
    expect(v.identidade.extra).toBeUndefined();
    expect(v.identidade.logo).toBeNull();
  });

  it("o feed de rifas não pode sair da vitrine", () => {
    const t = copia();
    t.blocos = t.blocos.map((b: any) => (b.tipo === "rifas" ? { ...b, ligado: false } : b));
    expect(() => validarTemplate(t)).toThrow(TemplateInvalido);
    expect(() => validarTemplate(t)).toThrow(/Rifas no ar/);
  });

  it("blocos: tipo conhecido, id único, texto obrigatório no bloco de texto", () => {
    expect(() => validarTemplate({ ...copia(), blocos: [...copia().blocos, { id: "x", tipo: "iframe", ligado: true }] })).toThrow(/tipo/);
    expect(() => validarTemplate({ ...copia(), blocos: [...copia().blocos, { id: "rifas", tipo: "texto", ligado: true, corpo: "a" }] })).toThrow(/repetido/);
    expect(() => validarTemplate({ ...copia(), blocos: [...copia().blocos, { id: "aviso", tipo: "texto", ligado: true }] })).toThrow(/escreva/);
    expect(() => validarTemplate({ ...copia(), blocos: Array.from({ length: 13 }, (_, i) => ({ id: `b${i}`, tipo: "rifas", ligado: true })) })).toThrow(/12/);
  });

  it("versão guardada estragada volta ao padrão em vez de derrubar a vitrine", () => {
    expect(completarTemplate({ lixo: true })).toEqual(TEMPLATE_PADRAO);
  });
});
