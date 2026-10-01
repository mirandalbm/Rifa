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
