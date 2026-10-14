import { describe, expect, it } from "vitest";
import { FOLHA, INTRO_LARGURA_MAX, PECAS_DA_INTRO, deveMostrarIntro, folhasDoTrevo } from "../client/src/lib/intro";

const base = { largura: 390, caminho: "/", jaViuNaSessao: false, automatizado: false, emMoldura: false };

describe("intro da marca: quando aparece", () => {
  it("no celular e no tablet, ao abrir o app", () => {
    expect(deveMostrarIntro(base)).toBe(true);
    expect(deveMostrarIntro({ ...base, largura: 820 })).toBe(true);
    expect(deveMostrarIntro({ ...base, largura: INTRO_LARGURA_MAX })).toBe(true);
  });

  it("nunca no computador (a partir de 1024 px)", () => {
    expect(deveMostrarIntro({ ...base, largura: INTRO_LARGURA_MAX + 1 })).toBe(false);
    expect(deveMostrarIntro({ ...base, largura: 1440 })).toBe(false);
  });

  it("uma vez por sessão: recarregar não repete", () => {
    expect(deveMostrarIntro({ ...base, jaViuNaSessao: true })).toBe(false);
  });

  it("nem na auditoria de telas, nem na pré-visualização em moldura", () => {
    expect(deveMostrarIntro({ ...base, automatizado: true })).toBe(false);
    expect(deveMostrarIntro({ ...base, emMoldura: true })).toBe(false);
  });

  it("nem nos painéis, que são ferramenta de trabalho", () => {
    for (const caminho of ["/admin", "/admin/pedidos", "/afiliado", "/afiliado/links", "/cambista/venda"]) {
      expect(deveMostrarIntro({ ...base, caminho }), caminho).toBe(false);
    }
    for (const caminho of ["/", "/r/carro", "/perfil", "/administrador-de-rifas"]) {
      expect(deveMostrarIntro({ ...base, caminho }), caminho).toBe(true);
    }
  });
});

describe("intro da marca: o trevo", () => {
  it("cada lóbulo encosta na fresta diagonal (tangente) e a folha mede 700 × 640", () => {
    const { c, r, d, h } = FOLHA;
    // distância do centro do lóbulo à reta u = v + c, igual ao raio
    expect((h - d - c) / Math.SQRT2).toBeCloseTo(r, 6);
    expect(2 * (d + r)).toBeCloseTo(700, 6);
    expect(h + r).toBeCloseTo(640, 6);
  });

  it("quatro folhas iguais, giradas de 90 em 90 graus", () => {
    const folhas = folhasDoTrevo();
    expect(folhas).toHaveLength(4);
    const cima = folhas[0].circulos.map((c) => [c.cx, c.cy]);
    const direita = folhas[1].circulos.map((c) => [c.cx, c.cy]);
    // girar (x, y) 90 graus no sentido do relógio na tela: (-y, x)
    expect(direita).toEqual(cima.map(([x, y]) => [-y, x]));
    // a folha de cima aponta para cima (y negativo no SVG)
    for (const [, y] of cima) expect(y).toBeLessThan(0);
  });

  it("as peças ficam dentro da caixa da logo", () => {
    const { proporcao, ...pecas } = PECAS_DA_INTRO;
    expect(proporcao).toBeGreaterThan(1);
    for (const [nome, p] of Object.entries(pecas)) {
      expect(p.left, nome).toBeGreaterThanOrEqual(0);
      expect(p.top, nome).toBeGreaterThanOrEqual(0);
      expect(p.left + p.width, nome).toBeLessThanOrEqual(100);
    }
  });
});
