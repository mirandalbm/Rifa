import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * O kit dos painéis é o kit congelado da reformulação (Figma, página
 * "00 · Fundamentos", e a base "14 · Especificação por tela" no Notion;
 * `docs/PLANO-REFORMULACAO.md`, fase 4). As medidas moram num lugar só
 * (`bits.tsx`, `painel.tsx`, `.campo` no `index.css`): tela nova usa a peça,
 * não monta uma cópia. Este teste segura as medidas e a regra.
 */
const bits = readFileSync("client/src/components/bits.tsx", "utf8");
const painel = readFileSync("client/src/components/painel.tsx", "utf8");

function arquivos(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? arquivos(p) : p.endsWith(".tsx") ? [p] : [];
  });
}

describe("kit congelado (onda 1 da reformulação)", () => {
  it("o botão tem os tons do Figma, 40 px, cantos de 8 e Inter 13, e os nomes de antes seguem como apelidos", () => {
    for (const tom of ["primario", "branco", "claro", "contorno", "cinza", "azul"]) expect(bits).toMatch(new RegExp(`^  ${tom}: "`, "m"));
    expect(bits).toContain('{ primary: "primario", ghost: "contorno", yellow: "azul" }');
    expect(bits).toMatch(/inline-flex h-10 items-center justify-center gap-2 rounded-lg px-4 text-\[13px\] font-semibold/);
  });

  it("a pílula tem o ponto de 6 px e o respiro 9 × 3, em DM Mono 11", () => {
    expect(bits).toMatch(/gap-1\.5 rounded-full px-\[9px\] py-\[3px\] font-mono text-\[11px\] font-medium/);
    expect(bits).toContain('<span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden />');
  });

  it("as fichas de filtro e a caixa de marcar são peças do kit, com o estado no ARIA", () => {
    expect(bits).toMatch(/export function Filtros</);
    expect(bits).toContain('role={exclusivo ? "radiogroup" : "group"}');
    expect(bits).toContain("aria-pressed={exclusivo ? undefined : aceso}");
    expect(bits).toMatch(/export function Caixa\(/);
    expect(bits).toContain('type="checkbox"');
  });

  it("nenhuma tela monta a ficha de filtro à mão: a acesa em verde cheio é só a do kit", () => {
    const aMao = arquivos("client/src/pages").filter((p) => /aria-pressed=\{aceso\}[\s\S]{0,400}bg-green font-semibold text-on-green/.test(readFileSync(p, "utf8")));
    expect(aMao).toEqual([]);
  });

  it("a estatística tem o quadrado do ícone de 44 px e o rótulo de 13; o cartão, o título de 16 Semi Bold", () => {
    expect(painel).toContain("flex h-11 w-11 shrink-0 items-center justify-center rounded-[10px]");
    expect(painel).toContain('className="block text-[13px] leading-4 text-ink-2">{rotulo}');
    expect(painel).toContain('<h2 className="text-base font-semibold leading-6">{titulo}</h2>');
  });

  it("o cabeçalho da tabela é a faixa cinza com letra de 10 em maiúsculas; a aba acesa é Semi Bold com o traço verde", () => {
    expect(painel).toContain("text-[10px] font-semibold uppercase tracking-[0.1em] text-muted");
    expect(painel).toContain('"border-green font-semibold text-green-deep"');
  });

  it("o campo de digitar tem 40 px e cantos de 8, e o rótulo é o label-xs em ink-2", () => {
    expect(readFileSync("client/src/index.css", "utf8")).toMatch(/\.campo \{\s*@apply mt-1 min-h-10 w-full rounded-lg border border-line-2 px-3 py-2;/);
    expect(bits).toContain('className="label-xs text-ink-2"');
  });
});
