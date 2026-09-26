import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { CHAVE_TEMA, COR_DA_BARRA, lerTema, proximoTema, temaEfetivo } from "../client/src/lib/tema";

const raiz = path.resolve(import.meta.dirname, "..");
const css = readFileSync(path.join(raiz, "client/src/index.css"), "utf8");
const html = readFileSync(path.join(raiz, "client/index.html"), "utf8");

/** As variáveis `--nome: valor` de um trecho de CSS. */
function variaveis(trecho: string): Record<string, string> {
  return Object.fromEntries([...trecho.matchAll(/(--[\w-]+):\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()]));
}
function bloco(inicio: string): string {
  const i = css.indexOf(inicio);
  expect(i, `bloco "${inicio}" no index.css`).toBeGreaterThan(-1);
  return css.slice(i, css.indexOf("}", i));
}

describe("tokens do tema", () => {
  const claro = variaveis(bloco(":root {"));
  const escuroSistema = variaveis(bloco(':root:not([data-tema="claro"])'));
  const escuroEscolhido = variaveis(bloco(':root[data-tema="escuro"]'));

  it("o escuro redefine todas as cores do claro — nenhuma fica clara por esquecimento", () => {
    expect(Object.keys(escuroSistema).sort()).toEqual(Object.keys(claro).sort());
  });

  it("as duas entradas do escuro (celular e escolha) têm os mesmos valores", () => {
    expect(escuroEscolhido).toEqual(escuroSistema);
  });

  it("o texto sobre o amarelo e sobre o verde não muda: o fundo deles também não escurece", () => {
    expect(escuroSistema["--on-yellow"]).toBe(claro["--on-yellow"]);
    expect(escuroSistema["--on-green"]).toBe(claro["--on-green"]);
  });

  it("a barra do celular usa o fundo de cada tema", () => {
    expect(COR_DA_BARRA.claro).toBe(claro["--white"]);
    expect(COR_DA_BARRA.escuro).toBe(escuroSistema["--white"]);
  });

  it("o index.html aplica o tema antes do primeiro desenho, com a mesma chave e as mesmas cores", () => {
    expect(html).toContain(`localStorage.getItem("${CHAVE_TEMA}")`);
    expect(html).toContain(COR_DA_BARRA.escuro);
    expect(html).toContain(COR_DA_BARRA.claro);
  });
});

describe("escolha do tema", () => {
  let guardado: Record<string, string>;
  let sistemaEscuro: boolean;

  beforeEach(() => {
    guardado = {};
    sistemaEscuro = false;
    vi.stubGlobal("localStorage", {
      getItem: (k: string) => guardado[k] ?? null,
      setItem: (k: string, v: string) => (guardado[k] = v),
      removeItem: (k: string) => delete guardado[k],
    });
    vi.stubGlobal("window", { matchMedia: () => ({ matches: sistemaEscuro }) });
  });
  afterEach(() => vi.unstubAllGlobals());

  it("sem escolha, é automático e segue o celular", () => {
    expect(lerTema()).toBe("automatico");
    expect(temaEfetivo("automatico")).toBe("claro");
    sistemaEscuro = true;
    expect(temaEfetivo("automatico")).toBe("escuro");
  });

  it("a escolha vale mais que o celular", () => {
    sistemaEscuro = true;
    guardado[CHAVE_TEMA] = "claro";
    expect(lerTema()).toBe("claro");
    expect(temaEfetivo(lerTema())).toBe("claro");
  });

  it("valor estranho guardado volta para automático", () => {
    guardado[CHAVE_TEMA] = "roxo";
    expect(lerTema()).toBe("automatico");
  });

  it("sem armazenamento (aba anônima), não quebra", () => {
    vi.stubGlobal("localStorage", {
      getItem: () => {
        throw new Error("SecurityError");
      },
    });
    expect(lerTema()).toBe("automatico");
  });

  it("o botão passa pelos três e volta", () => {
    expect(proximoTema("automatico")).toBe("claro");
    expect(proximoTema("claro")).toBe("escuro");
    expect(proximoTema("escuro")).toBe("automatico");
  });
});
