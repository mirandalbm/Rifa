import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function arquivos(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? arquivos(p) : p.endsWith(".tsx") ? [p] : [];
  });
}

describe("janela sobre a tela (regra 14 de docs/VERSOES.md)", () => {
  it("nenhuma tela monta o fundo escuro da janela à mão: todas usam <Janela>", () => {
    const feitasAMao = arquivos("client/src")
      .filter((p) => !p.endsWith("components/Janela.tsx"))
      .filter((p) => /fixed inset-0 z-50 flex items-end justify-center bg-black\/\d+/.test(readFileSync(p, "utf8")));
    expect(feitasAMao).toEqual([]);
  });

  it("a Janela fecha no Esc e no fundo, trava a rolagem e é um diálogo modal", () => {
    const fonte = readFileSync("client/src/components/Janela.tsx", "utf8");
    expect(fonte).toContain('e.key === "Escape"');
    expect(fonte).toContain('document.body.style.overflow = "hidden"');
    expect(fonte).toContain('role="dialog"');
    expect(fonte).toContain('aria-modal="true"');
    expect(fonte).toContain("e.stopPropagation()");
  });
});

describe("campo de digitar (P4 de docs/VERSOES.md)", () => {
  it("a lista de classes do campo mora só na classe .campo", () => {
    const repetida = /mt-1 w-full rounded-md border border-line-2 (bg-white )?px-3 py-2/;
    const comCopia = arquivos("client/src").filter((p) => repetida.test(readFileSync(p, "utf8")));
    expect(comCopia).toEqual([]);
    expect(readFileSync("client/src/index.css", "utf8")).toMatch(/\.campo \{\s*@apply mt-1 w-full rounded-md border border-line-2 px-3 py-2;/);
  });
});

describe("grade começa em grid-cols-1 (regra 4 de docs/VERSOES.md)", () => {
  it("toda grade com coluna por largura declara a coluna do celular", () => {
    const semBase: string[] = [];
    for (const p of arquivos("client/src")) {
      for (const m of readFileSync(p, "utf8").matchAll(/className=(?:"([^"]*)"|\{`([^`$]*))/g)) {
        const toks = (m[1] ?? m[2]).split(/\s+/);
        if (!toks.includes("grid")) continue;
        const porLargura = toks.some((t) => /^[a-z0-9]+:grid-cols-/.test(t));
        const base = toks.some((t) => /^grid-cols-/.test(t));
        if (porLargura && !base) semBase.push(`${p}: ${toks.join(" ")}`);
      }
    }
    expect(semBase).toEqual([]);
  });

  it("o degradê de quem não tem foto mora só na classe .sem-foto", () => {
    const copias = arquivos("client/src").filter((p) => /linear-gradient\([^)]*#0B1F14/i.test(readFileSync(p, "utf8")));
    expect(copias).toEqual([]);
  });
});
