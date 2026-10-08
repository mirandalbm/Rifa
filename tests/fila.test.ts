import { describe, expect, it } from "vitest";
import {
  PRAZO_DO_TRABALHO_MS,
  SITUACOES_DO_TRABALHO,
  SITUACOES_EM_ABERTO,
  TENTATIVAS_DO_TRABALHO,
  TRABALHADOR_NO_AR_MS,
  erroParaATela,
  esperaDaTentativa,
  tentaDeNovo,
  trabalhadorNoAr,
} from "../shared/fila";
import { readFileSync } from "node:fs";

describe("fila de trabalho", () => {
  it("a espera cresce a cada falha e para em 30 min", () => {
    expect(esperaDaTentativa(1)).toBe(30_000);
    expect(esperaDaTentativa(2)).toBe(120_000);
    expect(esperaDaTentativa(3)).toBe(480_000);
    expect(esperaDaTentativa(20)).toBe(30 * 60_000);
    expect(esperaDaTentativa(0)).toBe(30_000);
  });

  it(`tenta de novo até ${TENTATIVAS_DO_TRABALHO} vezes`, () => {
    expect(tentaDeNovo(1)).toBe(true);
    expect(tentaDeNovo(TENTATIVAS_DO_TRABALHO - 1)).toBe(true);
    expect(tentaDeNovo(TENTATIVAS_DO_TRABALHO)).toBe(false);
  });

  it("o trabalhador está no ar só com aviso recente", () => {
    const agora = Date.parse("2026-10-08T12:00:00Z");
    expect(trabalhadorNoAr(null, agora)).toBe(false);
    expect(trabalhadorNoAr(new Date(agora - 10_000), agora)).toBe(true);
    expect(trabalhadorNoAr(new Date(agora - TRABALHADOR_NO_AR_MS - 1), agora)).toBe(false);
    expect(trabalhadorNoAr("lixo", agora)).toBe(false);
  });

  it("o erro da tela é uma linha curta e sem caminho de arquivo", () => {
    expect(erroParaATela(new Error("falhou em /tmp/rifa-reels-abc/f0.jpg\nlinha 2"))).toBe("falhou em … linha 2");
    expect(erroParaATela("Autorizada SPA/MF nº 1")).toBe("Autorizada SPA/MF nº 1");
    expect(erroParaATela(42)).toBe("Erro desconhecido.");
    expect(erroParaATela("x".repeat(500))).toHaveLength(300);
  });

  it("o prazo de um trabalho preso é maior que o do ffmpeg do reels", async () => {
    const { PRAZO_DO_REELS_GERADO_MS } = await import("../server/trabalhos/reelsGerado");
    expect(PRAZO_DO_TRABALHO_MS).toBeGreaterThan(PRAZO_DO_REELS_GERADO_MS);
  });

  it("o índice único da chave vale nas mesmas situações em aberto do código", () => {
    const schema = readFileSync(new URL("../shared/schema.ts", import.meta.url), "utf8");
    const fila = readFileSync(new URL("../server/services/fila.ts", import.meta.url), "utf8");
    const lista = SITUACOES_EM_ABERTO.map((s) => `'${s}'`).join(", ");
    expect(schema).toContain(`situacao in (${lista})`);
    expect(fila).toContain(`situacao in (${lista})`);
    for (const s of SITUACOES_EM_ABERTO) expect(SITUACOES_DO_TRABALHO).toContain(s);
  });
});
