// O fontkit não traz tipos: só o que o desenho das artes usa (`server/services/artes.ts`).
declare module "fontkit" {
  export interface Glyph {
    path: { toSVG(): string };
  }
  export interface GlyphPosition {
    xAdvance: number;
    xOffset: number;
    yOffset: number;
  }
  export interface GlyphRun {
    glyphs: Glyph[];
    positions: GlyphPosition[];
    advanceWidth: number;
  }
  export interface Font {
    unitsPerEm: number;
    ascent: number;
    descent: number;
    layout(texto: string): GlyphRun;
  }
  export function openSync(caminho: string): Font;
  export function create(dados: Buffer): Font;
}
