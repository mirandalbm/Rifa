/**
 * Gera a logo escrita "Loterias do Bem" (`npm run logo-escrita`).
 *
 * As letras são as da logo oficial da intro, vetorizadas uma vez
 * (`docs/marca/letras-loterias-do-bem.svg`, nas coordenadas da
 * `logo-oficial.png`). Lá a frase é em duas linhas; aqui ela vira uma linha
 * só, para o topo: "Loterias", "do" (no tamanho das outras letras, que na
 * logo é menor) e "Bem", na mesma linha de base.
 *
 * Grava:
 * - `client/src/lib/logoEscritaDesenho.ts` — os contornos que o topo desenha
 *   reduzidos (`LogoEscrita`), "Loterias do" no verde e "Bem" no vermelho;
 * - o trevo da abertura no `client/index.html` (`svgDoTrevo()`, entre as
 *   marcas `abertura:inicio` e `abertura:fim`);
 * - `docs/marca/logo-loterias-do-bem.svg` e `-escuro.svg`, e os PNG de 2048 de
 *   largura: o trevo do ícone à esquerda e a frase à direita.
 *
 * Mudou o desenho ou a cor, rode de novo: os arquivos gerados não se editam à mão.
 */
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { CORES_DA_LOGO } from "../client/src/lib/marca";
import { ABERTURA_TREVO_PX, svgDoTrevo } from "../client/src/lib/intro";

const raiz = path.resolve(import.meta.dirname, "..");
const fonte = readFileSync(path.join(raiz, "docs/marca/letras-loterias-do-bem.svg"), "utf8");

const arred = (n: number) => Math.round(n * 10) / 10;

function caminho(id: string): string {
  const m = fonte.match(new RegExp(`id="${id}"[^>]* d="([^"]+)"`));
  if (!m) throw new Error(`sem o contorno "${id}" em letras-loterias-do-bem.svg`);
  return m[1];
}

/** Os comandos do potrace (M, L, C) são absolutos e em pares x y: dá para mover número a número. */
function mover(d: string, f: (x: number, y: number) => [number, number]): string {
  let x: number | null = null;
  return d.replace(/-?\d+(?:\.\d+)?/g, (n) => {
    if (x === null) {
      x = Number(n);
      return "\u0000";
    }
    const [nx, ny] = f(x, Number(n));
    x = null;
    return `${arred(nx)} ${arred(ny)}`;
  }).replace(/\u0000\s*/g, "");
}

function caixa(d: string) {
  const nums = (d.match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number);
  const xs = nums.filter((_, i) => i % 2 === 0);
  const ys = nums.filter((_, i) => i % 2 === 1);
  return { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) };
}

// Medidas da logo oficial (pixels da imagem de 2048): a linha de base e a
// altura do "o" de cada palavra, para pôr "do" no tamanho de "Loterias".
const LOTERIAS = { base: 1112, alturaDoO: 215 };
const DO = { base: 1399, alturaDoO: 169 };
const BEM = { base: 1433 };
const ESPACO = 78; // o espaço entre as palavras, na escala de "Loterias"
const MARGEM = 12;

const loterias = caminho("loterias");
const k = LOTERIAS.alturaDoO / DO.alturaDoO;
let fimDaPalavra = caixa(loterias).x1;

const doCru = caminho("do");
const doCaixa = caixa(doCru);
const doX = fimDaPalavra + ESPACO - doCaixa.x0 * k;
const doD = mover(doCru, (x, y) => [doX + x * k, LOTERIAS.base + (y - DO.base) * k]);
fimDaPalavra = caixa(doD).x1;

const bemCru = caminho("bem");
const bemX = fimDaPalavra + ESPACO - caixa(bemCru).x0;
const bemD = mover(bemCru, (x, y) => [bemX + x, LOTERIAS.base + (y - BEM.base)]);

// Tudo para perto da origem, com margem.
const todas = [loterias, doD, bemD].map(caixa);
const x0 = Math.min(...todas.map((c) => c.x0)) - MARGEM;
const y0 = Math.min(...todas.map((c) => c.y0)) - MARGEM;
const largura = arred(Math.max(...todas.map((c) => c.x1)) - x0 + MARGEM);
const altura = arred(Math.max(...todas.map((c) => c.y1)) - y0 + MARGEM);
const naOrigem = (d: string) => mover(d, (x, y) => [x - x0, y - y0]);
const verde = `${naOrigem(loterias)} ${naOrigem(doD)}`;
const vermelho = naOrigem(bemD);

writeFileSync(
  path.join(raiz, "client/src/lib/logoEscritaDesenho.ts"),
  `// Gerado por \`npm run logo-escrita\` (scripts/logo-escrita.ts). Não edite à mão.\n` +
    `// Letras: as da logo oficial (docs/marca/letras-loterias-do-bem.svg), numa linha.\n` +
    `export const LOGO_ESCRITA = ${JSON.stringify({ largura, altura, verde, vermelho }, null, 2)} as const;\n`,
);

// O trevo da abertura no index.html.
const indexHtml = path.join(raiz, "client/index.html");
const html = readFileSync(indexHtml, "utf8");
const marcas = /<!-- abertura:inicio -->[\s\S]*?<!-- abertura:fim -->/;
if (!marcas.test(html)) throw new Error("index.html sem as marcas da abertura");
writeFileSync(
  indexHtml,
  html.replace(
    marcas,
    `<!-- abertura:inicio -->${svgDoTrevo("ab", `width="${ABERTURA_TREVO_PX}" height="${ABERTURA_TREVO_PX}"`)}<!-- abertura:fim -->`,
  ),
);

// A logo horizontal para fora do site: o trevo à esquerda, a frase à direita.
const LADO_DO_TREVO = arred(altura * 1.18);
const VAO = arred(altura * 0.16);
const larguraTotal = arred(LADO_DO_TREVO + VAO + largura);
const alturaTotal = LADO_DO_TREVO;
const yFrase = arred((alturaTotal - altura) / 2);

function svg(tema: keyof typeof CORES_DA_LOGO, fundo?: string): string {
  const c = CORES_DA_LOGO[tema];
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${larguraTotal} ${alturaTotal}" role="img" aria-label="Loterias do Bem">
  <title>Loterias do Bem</title>
  ${fundo ? `<rect width="100%" height="100%" fill="${fundo}"/>` : ""}
  ${svgDoTrevo("t", `x="0" y="0" width="${LADO_DO_TREVO}" height="${LADO_DO_TREVO}"`)}
  <g transform="translate(${arred(LADO_DO_TREVO + VAO)} ${yFrase})">
    <path d="${verde}" fill-rule="evenodd" fill="${c["--logo-verde"]}"/>
    <path d="${vermelho}" fill-rule="evenodd" fill="${c["--logo-vermelho"]}"/>
  </g>
</svg>
`;
}

const marca = path.join(raiz, "docs/marca");
writeFileSync(path.join(marca, "logo-loterias-do-bem.svg"), svg("claro"));
writeFileSync(path.join(marca, "logo-loterias-do-bem-escuro.svg"), svg("escuro"));
const LARGURA_PNG = 2048;
const densidade = Math.round((72 * LARGURA_PNG) / larguraTotal);
await sharp(Buffer.from(svg("claro")), { density: densidade }).png().toFile(path.join(marca, "logo-loterias-do-bem.png"));
await sharp(Buffer.from(svg("escuro", "#0e1712")), { density: densidade })
  .png()
  .toFile(path.join(marca, "logo-loterias-do-bem-escuro.png"));

console.log(`logo escrita: ${largura} × ${altura} (frase), ${larguraTotal} × ${alturaTotal} com o trevo; arquivos em docs/marca/`);
