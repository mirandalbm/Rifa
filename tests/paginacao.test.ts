import { describe, expect, it } from "vitest";
import { PAGINA_MAX, PAGINA_PADRAO, cortarPagina, fazerCursor, lerCursor, limiteDaPagina } from "../shared/paginacao";

const ID = "3f2b8f0e-5c1a-4a53-9a43-0d6a8e1f7c11";

describe("paginação por chave", () => {
  it("o cursor vai e volta, com o milissegundo", () => {
    const t = new Date("2026-10-01T14:22:08.123Z");
    expect(lerCursor(fazerCursor(t, ID))).toEqual({ criadoEm: t, id: ID });
  });

  it("o que não é o formato exato vira primeira página", () => {
    for (const ruim of [undefined, 42, "", "x", `2026-10-01|${ID}`, `2026-10-01T14:22:08Z|nao-e-uuid`, `2026-10-01T14:22:08Z|${ID}|extra`, `'; drop table orders; --|${ID}`, `2026-13-45T99:99:99Z|${ID}`]) {
      expect(lerCursor(ruim)).toBeNull();
    }
  });

  it("o tamanho da página fica entre 1 e o máximo", () => {
    expect(limiteDaPagina(undefined)).toBe(PAGINA_PADRAO);
    expect(limiteDaPagina("abc")).toBe(PAGINA_PADRAO);
    expect(limiteDaPagina("0")).toBe(PAGINA_PADRAO);
    expect(limiteDaPagina("-5")).toBe(PAGINA_PADRAO);
    expect(limiteDaPagina("2.5")).toBe(PAGINA_PADRAO);
    expect(limiteDaPagina("10")).toBe(10);
    expect(limiteDaPagina("100000")).toBe(PAGINA_MAX);
  });

  it("uma linha a mais diz que há próxima, e o cursor é o da última mostrada", () => {
    const l = (n: number) => ({ criadoEm: new Date(Date.UTC(2026, 9, 1, 12, 0, n)), id: `${n}` });
    const tres = [l(3), l(2), l(1)];
    expect(cortarPagina(tres, 3)).toEqual({ itens: tres, proximo: null });
    const r = cortarPagina(tres, 2);
    expect(r.itens).toEqual([l(3), l(2)]);
    expect(r.proximo).toBe(fazerCursor(l(2).criadoEm, "2"));
    expect(cortarPagina([], 5)).toEqual({ itens: [], proximo: null });
  });
});
