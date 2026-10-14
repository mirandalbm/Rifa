/**
 * Gera a logo escrita "Loterias do Bem" em contornos (`npm run logo-escrita`).
 *
 * O desenho é feito grande, como arte: as letras saem da Bricolage Grotesque
 * 800 (a fonte de título do site, `@fontsource`, OFL) com o espaçamento da
 * própria fonte, e o B dá lugar à folha vermelha do ícone deitada (os dois
 * lobos em coração à direita, a metade de cima clara e a de baixo escura).
 *
 * Grava:
 * - `client/src/lib/logoEscritaDesenho.ts` — os contornos que o topo desenha
 *   reduzidos (`LogoEscrita`), com as cores dos tokens do tema;
 * - `docs/marca/logo-loterias-do-bem.svg` e `-escuro.svg`, e os PNG de 2048 de
 *   largura, para usar fora do site.
 *
 * Mudou o desenho aqui, rode de novo: o arquivo gerado não se edita à mão.
 */
import { createRequire } from "node:module";
import { writeFileSync } from "node:fs";
import path from "node:path";
import * as fontkit from "fontkit";
import sharp from "sharp";
import { CORES_DA_LOGO } from "../client/src/lib/marca";

const exigir = createRequire(import.meta.url);
const raiz = path.resolve(import.meta.dirname, "..");
const fonte = fontkit.openSync(
  exigir.resolve("@fontsource/bricolage-grotesque/files/bricolage-grotesque-latin-800-normal.woff"),
) as fontkit.Font;

const TEXTO = "Loterias do Bem";
const TAMANHO = 200; // a fonte desenhada a 200 unidades: arte grande, reduzida na tela
const escala = TAMANHO / fonte.unitsPerEm;
const altoDaMaiuscula = fonte.capHeight * escala;
const sobe = fonte.ascent * escala;
const desce = -fonte.descent * escala;
const margem = 8;
const base = margem + sobe;

const arred = (n: number) => Math.round(n * 100) / 100;

/** O contorno de um glifo em `x`, já virado para o SVG (y para baixo). */
function contorno(glifo: fontkit.Glyph, x: number): string {
  return glifo.path
    .scale(escala, -escala)
    .translate(x, base)
    .toSVG()
    .replace(/-?\d+\.\d+/g, (n) => String(arred(Number(n))));
}

const disposicao = fonte.layout(TEXTO);
let x = margem;
let verde = "";
let vermelho = "";
let folha = { x0: 0, x1: 0 };
for (let i = 0; i < disposicao.glyphs.length; i++) {
  const glifo = disposicao.glyphs[i];
  const pos = disposicao.positions[i];
  const gx = x + pos.xOffset * escala;
  const letra = TEXTO[i];
  if (letra === "B") {
    // A folha ocupa a caixa do B da fonte: o espaçamento fica o da fonte.
    const caixa = glifo.bbox;
    folha = { x0: gx + caixa.minX * escala, x1: gx + caixa.maxX * escala };
  } else if (i > TEXTO.indexOf("B")) {
    vermelho += contorno(glifo, gx);
  } else if (letra !== " ") {
    verde += contorno(glifo, gx);
  }
  x += pos.xAdvance * escala;
}
const largura = arred(x + margem);
const altura = arred(base + desce + margem);
const topo = base - altoDaMaiuscula;

/**
 * A folha deitada, desenhada numa caixa de 0 a 100 e levada à caixa do B:
 * lado esquerdo reto (para ler como B), os dois lobos redondos à direita e o
 * recorte em coração entre eles, na altura do meio.
 */
const FOLHA_0_100 =
  "M14 0H52C80 0 98 12 98 28C98 40 88 47 64 50C90 53 100 63 100 74C100 90 82 100 54 100H14C6 100 0 94 0 86V14C0 6 6 0 14 0Z";
function naCaixaDoB(d: string): string {
  const sx = (folha.x1 - folha.x0) / 100;
  const sy = altoDaMaiuscula / 100;
  // Os comandos usados (M, H, V, C, Z) alternam x e y, salvo H (só x) e V (só y).
  return d.replace(/([MHVCZ])([^MHVCZ]*)/g, (_, cmd: string, args: string) => {
    const nums = args.trim() ? args.trim().split(/[\s,]+/).map(Number) : [];
    const fora = nums.map((v, k) => {
      const ehX = cmd === "H" ? true : cmd === "V" ? false : k % 2 === 0;
      return arred(ehX ? folha.x0 + v * sx : topo + v * sy);
    });
    return cmd + fora.join(" ");
  });
}
const folhaD = naCaixaDoB(FOLHA_0_100);
const meio = arred(topo + altoDaMaiuscula / 2);

const desenho = {
  largura,
  altura,
  verde,
  vermelho,
  folha: folhaD,
  topo: arred(topo),
  meio,
  base: arred(base),
  folhaX0: arred(folha.x0),
  folhaX1: arred(folha.x1),
};

writeFileSync(
  path.join(raiz, "client/src/lib/logoEscritaDesenho.ts"),
  `// Gerado por \`npm run logo-escrita\` (scripts/logo-escrita.ts). Não edite à mão.\n` +
    `// Letras: Bricolage Grotesque 800 (@fontsource, OFL), em contornos.\n` +
    `export const LOGO_ESCRITA = ${JSON.stringify(desenho, null, 2)} as const;\n`,
);

function svg(tema: keyof typeof CORES_DA_LOGO, fundo?: string): string {
  const t = CORES_DA_LOGO[tema];
  const c = {
    verdeLuz: t["--logo-verde-luz"],
    verde: t["--logo-verde"],
    vermelhoLuz: t["--logo-vermelho-luz"],
    vermelho: t["--logo-vermelho"],
    vermelhoEscuro: t["--logo-vermelho-escuro"],
    vermelhoFundo: t["--logo-vermelho-fundo"],
  };
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${largura} ${altura}" role="img" aria-label="${TEXTO}">
  <title>${TEXTO}</title>
  <defs>
    <linearGradient id="verde" gradientUnits="userSpaceOnUse" x1="0" y1="${arred(topo)}" x2="0" y2="${arred(base)}">
      <stop offset="0" stop-color="${c.verdeLuz}"/><stop offset="1" stop-color="${c.verde}"/>
    </linearGradient>
    <linearGradient id="vermelho" gradientUnits="userSpaceOnUse" x1="0" y1="${arred(topo)}" x2="0" y2="${arred(base)}">
      <stop offset="0" stop-color="${c.vermelhoLuz}"/><stop offset="1" stop-color="${c.vermelhoEscuro}"/>
    </linearGradient>
    <linearGradient id="folhaCima" gradientUnits="userSpaceOnUse" x1="${arred(folha.x0)}" y1="${arred(topo)}" x2="${arred(folha.x1)}" y2="${meio}">
      <stop offset="0" stop-color="${c.vermelhoLuz}"/><stop offset="1" stop-color="${c.vermelho}"/>
    </linearGradient>
    <linearGradient id="folhaBaixo" gradientUnits="userSpaceOnUse" x1="${arred(folha.x0)}" y1="${meio}" x2="${arred(folha.x1)}" y2="${arred(base)}">
      <stop offset="0" stop-color="${c.vermelhoEscuro}"/><stop offset="1" stop-color="${c.vermelhoFundo}"/>
    </linearGradient>
    <clipPath id="cima"><rect x="0" y="0" width="${largura}" height="${meio}"/></clipPath>
    <clipPath id="baixo"><rect x="0" y="${meio}" width="${largura}" height="${arred(altura - meio)}"/></clipPath>
  </defs>
  ${fundo ? `<rect width="100%" height="100%" fill="${fundo}"/>` : ""}
  <path d="${verde}" fill="url(#verde)"/>
  <path d="${folhaD}" fill="url(#folhaCima)" clip-path="url(#cima)"/>
  <path d="${folhaD}" fill="url(#folhaBaixo)" clip-path="url(#baixo)"/>
  <path d="${vermelho}" fill="url(#vermelho)"/>
</svg>
`;
}

const marca = path.join(raiz, "docs/marca");
writeFileSync(path.join(marca, "logo-loterias-do-bem.svg"), svg("claro"));
writeFileSync(path.join(marca, "logo-loterias-do-bem-escuro.svg"), svg("escuro"));
const LARGURA_PNG = 2048;
const densidade = Math.round((72 * LARGURA_PNG) / largura);
await sharp(Buffer.from(svg("claro")), { density: densidade }).png().toFile(path.join(marca, "logo-loterias-do-bem.png"));
await sharp(Buffer.from(svg("escuro", "#0e1712")), { density: densidade })
  .png()
  .toFile(path.join(marca, "logo-loterias-do-bem-escuro.png"));

console.log(`logo escrita: ${largura} × ${altura}, B em ${arred(folha.x0)}–${arred(folha.x1)}; arquivos em docs/marca/`);
