import { describe, expect, it } from "vitest";
import {
  MOTIVOS_DA_DENUNCIA_DE_COMENTARIO_DO_SORTEIO,
  decisaoDoSorteioValida,
  motivoDoSorteioValido,
  problemaNaDecisao,
  problemaParaDenunciar,
} from "@shared/sorteioDenuncias";
import { TIPOS_DA_CAIXA, destinoDaPendencia, ordenarCaixa } from "@shared/caixa";

describe("denúncia de comentário do sorteio oficial", () => {
  it("só aceita motivo da lista (nem chave herdada do objeto)", () => {
    for (const m of Object.keys(MOTIVOS_DA_DENUNCIA_DE_COMENTARIO_DO_SORTEIO)) expect(motivoDoSorteioValido(m)).toBe(true);
    for (const m of ["", "toString", "constructor", "__proto__", 1, null, undefined]) expect(motivoDoSorteioValido(m)).toBe(false);
  });

  it("sem conta não denuncia; o próprio comentário também não", () => {
    expect(problemaParaDenunciar({ temConta: false, meu: false })).toMatch(/Entre/);
    expect(problemaParaDenunciar({ temConta: true, meu: true })).toMatch(/seu/);
    expect(problemaParaDenunciar({ temConta: true, meu: false })).toBeNull();
  });

  it("procedente pede explicação; improcedente não; decisão desconhecida é recusada", () => {
    expect(decisaoDoSorteioValida("procedente")).toBe(true);
    expect(decisaoDoSorteioValida("travar")).toBe(false);
    expect(problemaNaDecisao("procedente", "  ")).toMatch(/Explique/);
    expect(problemaNaDecisao("procedente", "Golpe")).toBeNull();
    expect(problemaNaDecisao("improcedente", "")).toBeNull();
    expect(problemaNaDecisao("apagar", "x")).toMatch(/procedente/);
  });

  it("na Caixa: vai para as denúncias do Atendimento e vem com as denúncias, antes do resto", () => {
    expect(TIPOS_DA_CAIXA.comentario_sorteio.tom).toBe("red");
    expect(destinoDaPendencia({ tipo: "comentario_sorteio" })).toBe("/admin/atendimento?aba=denuncias");
    const ordem = ordenarCaixa([
      { tipo: "verificacao" as const, desde: "2026-01-01" },
      { tipo: "comentario_sorteio" as const, desde: "2026-02-01" },
    ]);
    expect(ordem[0].tipo).toBe("comentario_sorteio");
  });
});
