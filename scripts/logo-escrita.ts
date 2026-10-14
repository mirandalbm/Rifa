/**
 * Gera a logo escrita "Loterias do Bem" (`npm run logo-escrita`).
 *
 * A frase é desenhada na Google Sans Flex (OFL, `@fontsource-variable`) no
 * peso 400, reta, em contornos: o site não carrega a fonte por causa da logo,
 * e o desenho sai igual em qualquer aparelho. A fonte é variável em woff2, e o
 * fontkit só lê TTF: por isso o arquivo é descomprimido aqui (`wawoff2`).
 *
 * Grava:
 * - client/src/lib/logoEscritaDesenho.ts — os contornos que o topo desenha
 *   (LogoEscrita), "Loterias do" no verde e "Bem" no vermelho;
 * - o trevo da abertura no client/index.html (svgDoTrevo(), entre as marcas
 *   abertura:inicio e abertura:fim);
 * - docs/marca/logo-loterias-do-bem.svg e -escuro.svg, e os PNG de 2048 de
 *   largura: o trevo do ícone à esquerda e a frase à direita.
 *
 * Mudou o desenho ou a cor, rode de novo: os arquivos gerados não se editam à mão.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import * as fontkit from "fontkit";
import { decompress } from "wawoff2";
import sharp from "sharp";
import { CORES_DA_LOGO } from "../client/src/lib/marca";
import { ABERTURA_TREVO_PX, svgDoTrevo } from "../client/src/lib/intro";

const exigir = createRequire(import.meta.url);
const raiz = path.resolve(import.meta.dirname, "..");

/** Peso 400, reta: sem negrito e sem itálico. */
const EIXOS = { wght: 400 };
const TEXTO = "Loterias do Bem";
const DEPOIS_DE = TEXTO.indexOf("Bem"); // a partir daqui, a cor vermelha
const TAMANHO = 200; // desenhada a 200 unidades: arte grande, reduzida na tela
const MARGEM = 8;

const woff2 = readFileSync(
  exigir.resolve("@fontsource-variable/google-sans-flex/files/google-sans-flex-latin-full-normal.woff2"),
);
const base = fontkit.create(Buffer.from(await decompress(woff2))) as fontkit.Font;
const fonte = base.getVariation(EIXOS) as fontkit.Font;

const arred = (n: number) => Math.round(n * 10) / 10;
const escala = TAMANHO / fonte.unitsPerEm;

// Cada letra vira um contorno na escala final, com a linha de base em y = 0.
const partes: { path: fontkit.Path; vermelho: boolean }[] = [];
const disposicao = fonte.layout(TEXTO);
let x = 0;
disposicao.glyphs.forEach((glifo, i) => {
  const pos = disposicao.positions[i];
  if (TEXTO[i] !== " ") {
    partes.push({
      path: glifo.path.scale(escala, -escala).translate(x + pos.xOffset * escala, 0),
      vermelho: i >= DEPOIS_DE,
    });
  }
  x += pos.xAdvance * escala;
});

// Leva a frase para perto da origem, com a margem, e mede a caixa final.
const caixas = partes.map((p) => p.path.bbox);
const minX = Math.min(...caixas.map((c) => c.minX));
const minY = Math.min(...caixas.map((c) => c.minY));
const maxX = Math.max(...caixas.map((c) => c.maxX));
const maxY = Math.max(...caixas.map((c) => c.maxY));
const dx = MARGEM - minX;
const dy = MARGEM - minY;
const largura = arred(maxX - minX + 2 * MARGEM);
const altura = arred(maxY - minY + 2 * MARGEM);

const contorno = (p: fontkit.Path) =>
  p
    .translate(dx, dy)
    .toSVG()
    .replace(/-?\d+\.\d+/g, (n) => String(arred(Number(n))));
const verde = partes.filter((p) => !p.vermelho).map((p) => contorno(p.path)).join(" ");
const vermelho = partes.filter((p) => p.vermelho).map((p) => contorno(p.path)).join(" ");

writeFileSync(
  path.join(raiz, "client/src/lib/logoEscritaDesenho.ts"),
  `// Gerado por \`npm run logo-escrita\` (scripts/logo-escrita.ts). Não edite à mão.\n` +
    `// Letras: Google Sans Flex, peso 400, reta (@fontsource-variable, OFL), em contornos.\n` +
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
    <path d="${verde}" fill="${c["--logo-verde"]}"/>
    <path d="${vermelho}" fill="${c["--logo-vermelho"]}"/>
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
