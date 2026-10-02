import fs from "node:fs";
import { describe, expect, it } from "vitest";
import { hashesDosScriptsEmLinha, montarCsp, resumoDoRelatorioCsp } from "../shared/csp";
import { videoDaTransmissao } from "../shared/aoVivo";

const diretiva = (csp: string, nome: string) => (csp.split("; ").find((d) => d.startsWith(`${nome} `)) ?? "").split(" ").slice(1);

describe("política de conteúdo (modo relatório)", () => {
  const csp = montarCsp({ hashesDeScript: hashesDosScriptsEmLinha(fs.readFileSync("client/index.html", "utf8")), midiaPublica: "https://midia.exemplo.com.br/x" });

  it("o script do tema do index.html entra pelo hash, nunca por 'unsafe-inline'", () => {
    const scripts = diretiva(csp, "script-src");
    expect(scripts.some((s) => s.startsWith("'sha256-"))).toBe(true);
    expect(scripts).not.toContain("'unsafe-inline'");
    expect(scripts).not.toContain("'unsafe-eval'");
  });

  it("os pixels de marketing que o código carrega estão na lista", () => {
    const fonte = fs.readFileSync("client/src/lib/marketing.ts", "utf8");
    const origens = [...fonte.matchAll(/script\(`?"?(https:\/\/[^/"`]+)/g)].map((m) => m[1]);
    expect(origens.length).toBeGreaterThanOrEqual(3);
    for (const o of origens) expect(diretiva(csp, "script-src")).toContain(o);
  });

  it("os players da transmissão estão em frame-src", () => {
    let embutidos = 0;
    for (const url of ["https://www.youtube.com/watch?v=dQw4w9WgXcQ", "https://vimeo.com/76979871", "https://www.facebook.com/pagina/videos/123"]) {
      const v = videoDaTransmissao(url);
      if (!v || v.tipo !== "embutido") continue;
      embutidos++;
      expect(diretiva(csp, "frame-src")).toContain(new URL(v.src).origin);
    }
    expect(embutidos).toBeGreaterThanOrEqual(2);
    // A Twitch monta o endereço com o domínio do site (`srcDaTwitch`).
    expect(diretiva(csp, "frame-src")).toContain("https://player.twitch.tv");
  });

  it("a mídia pública entra pela origem; endereço sem https fica de fora", () => {
    expect(diretiva(csp, "media-src")).toContain("https://midia.exemplo.com.br");
    expect(montarCsp({ midiaPublica: "http://inseguro.com" })).not.toContain("inseguro");
    expect(montarCsp({ midiaPublica: "lixo" })).not.toContain("lixo");
  });

  it("trava o básico: object-src none, base-uri e frame-ancestors do próprio site, e o relatório", () => {
    expect(diretiva(csp, "object-src")).toEqual(["'none'"]);
    expect(diretiva(csp, "base-uri")).toEqual(["'self'"]);
    expect(diretiva(csp, "frame-ancestors")).toEqual(["'self'"]);
    expect(diretiva(csp, "report-uri")).toEqual(["/api/csp-relatorio"]);
  });

  it("o relatório guarda só a diretiva e a origem — nunca a URL com consulta", () => {
    expect(
      resumoDoRelatorioCsp({ "csp-report": { "violated-directive": "script-src-elem", "blocked-uri": "https://mal.exemplo/x.js?pedido=12345678", "document-uri": "https://rifa/pedido/12345678" } }),
    ).toEqual({ diretiva: "script-src-elem", origem: "https://mal.exemplo" });
    expect(resumoDoRelatorioCsp({ effectiveDirective: "x" })).toBeNull();
    expect(resumoDoRelatorioCsp({ "effective-directive": "script-src", "blocked-uri": "inline" })).toEqual({ diretiva: "script-src", origem: "inline" });
    expect(resumoDoRelatorioCsp(null)).toBeNull();
  });
});
