import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { COR_PADRAO, corDoApp, montarManifest, nomeCurtoDoApp, nomeDoApp } from "../shared/manifest";

describe("manifesto do app instalado", () => {
  it("o nome e a cor vêm do template; sem logo, valem os ícones de fábrica", () => {
    const m = montarManifest({ nome: "Rifas do Zé", cor: "#0A6CFF", logoVersao: null });
    expect(m.name).toBe("Rifas do Zé");
    expect(m.theme_color).toBe("#0a6cff");
    expect(m.icons.map((i) => i.src)).toEqual(["/icons/icon-192.png", "/icons/icon-512.png", "/icons/icon-maskable-512.png"]);
  });

  it("com logo, os três ícones saem dela, com a versão no endereço", () => {
    const m = montarManifest({ nome: "Zé", cor: "#00873e", logoVersao: "1759330000000" });
    expect(m.icons.map((i) => i.src)).toEqual([
      "/api/public/marca/icone/192?v=1759330000000",
      "/api/public/marca/icone/512?v=1759330000000",
      "/api/public/marca/icone/maskable?v=1759330000000",
    ]);
    expect(m.icons[2].purpose).toBe("maskable");
  });

  it("versão estranha não entra no endereço", () => {
    const m = montarManifest({ nome: "Zé", cor: "#00873e", logoVersao: "1&x=<script>" });
    expect(m.icons[0].src).toBe("/icons/icon-192.png");
  });

  it("nome vazio ou só com espaço cai no padrão; nome longo é cortado", () => {
    expect(nomeDoApp("   \n ")).toBe("rifa.br");
    expect(nomeDoApp("A".repeat(80))).toHaveLength(40);
    expect(nomeDoApp("  Rifas   do\nZé ")).toBe("Rifas do Zé");
  });

  it("o nome curto cabe em 12 letras, de preferência no fim de uma palavra", () => {
    expect(nomeCurtoDoApp("Rifas do Zé")).toBe("Rifas do Zé");
    expect(nomeCurtoDoApp("Rifas Solidárias do Norte")).toBe("Rifas");
    expect(nomeCurtoDoApp("Rifas do Norte Brasil")).toBe("Rifas do");
    expect(nomeCurtoDoApp("Superlongonomesemespaco")).toBe("Superlongono");
    for (const n of ["Rifas Solidárias do Norte", "X".repeat(30), "a b c d e f g h i j k l"]) {
      expect(nomeCurtoDoApp(n).length).toBeLessThanOrEqual(12);
    }
  });

  it("cor fora do formato #rrggbb cai na cor da marca", () => {
    expect(corDoApp("red")).toBe(COR_PADRAO);
    expect(corDoApp("#fff")).toBe(COR_PADRAO);
    expect(corDoApp("url(javascript:x)")).toBe(COR_PADRAO);
  });

  it("o arquivo de fábrica (usado se o banco falhar) concorda com o padrão", () => {
    const f = JSON.parse(readFileSync("client/public/manifest.webmanifest", "utf8"));
    const m = montarManifest({ nome: "rifa.br", cor: COR_PADRAO, logoVersao: null });
    expect(f.name).toBe(m.name);
    expect(f.theme_color).toBe(m.theme_color);
    expect(f.icons).toEqual(m.icons);
  });
});
