import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  ABERTURA_ID,
  ABERTURA_PRAZO_MS,
  ABERTURA_TREVO_PX,
  FOLHA,
  FOLHA_VERMELHA,
  INTRO_CHAVE,
  INTRO_LARGURA_MAX,
  PECAS_DA_INTRO,
  ROTAS_SEM_INTRO,
  contornoDaFolha,
  deveMostrarIntro,
  folhasDoTrevo,
  svgDoTrevo,
} from "../client/src/lib/intro";

const indexHtml = readFileSync(path.resolve(import.meta.dirname, "../client/index.html"), "utf8");

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

describe("intro da marca: o trevo do ícone e a abertura", () => {
  it("a folha da direita é a vermelha, como no ícone", () => {
    const direita = folhasDoTrevo()[FOLHA_VERMELHA];
    for (const c of direita.circulos) expect(c.cx).toBeGreaterThan(0);
    expect(svgDoTrevo("x")).toContain(`url(#x${"vc"})`);
  });

  it("cada folha é um contorno só, polígono e lóbulos no mesmo sentido", () => {
    for (const f of folhasDoTrevo()) {
      const d = contornoDaFolha(f);
      expect(d.match(/M/g)).toHaveLength(3);
      const giros = [...d.matchAll(/A[\d. -]+ 0 1 ([01])/g)].map((m) => m[1]);
      expect(new Set(giros).size).toBe(1);
    }
  });

  it("o index.html desenha o mesmo trevo (gerado por npm run logo-escrita)", () => {
    expect(indexHtml).toContain(svgDoTrevo("ab", `width="${ABERTURA_TREVO_PX}" height="${ABERTURA_TREVO_PX}"`));
    expect(indexHtml).toContain(`id="${ABERTURA_ID}"`);
  });

  it("o index.html repete a regra de quando a intro aparece", () => {
    const script = indexHtml.slice(indexHtml.indexOf("// A abertura:"), indexHtml.indexOf("</script>", indexHtml.indexOf("// A abertura:")));
    expect(script).toContain(`"${INTRO_CHAVE}"`);
    expect(script).toContain(`window.innerWidth > ${INTRO_LARGURA_MAX}`);
    expect(script).toContain(JSON.stringify(ROTAS_SEM_INTRO).replace(/,/g, ", "));
    expect(script).toContain("navigator.webdriver");
    expect(script).toContain("window.top");
    expect(script).toContain(`}, ${ABERTURA_PRAZO_MS});`);
    // e já pede as peças da intro, para ela não esperar a rede
    const { proporcao: _p, trevo: _t, ...imagens } = PECAS_DA_INTRO;
    for (const p of Object.values(imagens)) expect(script).toContain(`"${p.src}"`);
  });
});
