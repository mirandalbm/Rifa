import { describe, expect, it } from "vitest";
import { bloqueioDosAnexos, MODALIDADES, modalidadesDaRifa, validarAnexo } from "@shared/contratoAnexos";

const base = { metodoApuracao: null, aceitaCotaBonus: false, temPremiadas: false, temEntidade: false };

describe("anexos do contrato por modalidade", () => {
  it("a modalidade sai dos dados da rifa, nunca de uma escolha", () => {
    expect(modalidadesDaRifa(base)).toEqual([]);
    expect(modalidadesDaRifa({ ...base, metodoApuracao: "federal_direta" })).toEqual(["federal"]);
    expect(modalidadesDaRifa({ ...base, metodoApuracao: "globo" })).toEqual(["globo"]);
    expect(
      modalidadesDaRifa({ metodoApuracao: "federal_direta", aceitaCotaBonus: true, temPremiadas: true, temEntidade: true }),
    ).toEqual(["federal", "vale_brinde", "bonus", "entidade"]);
  });

  it("toda modalidade do catálogo tem rótulo e regra de quando vale", () => {
    expect(MODALIDADES.length).toBeGreaterThan(0);
  });

  it("o corpo da publicação só leva modalidade conhecida, título e texto", () => {
    const texto = "Anexo de teste. ".repeat(5);
    expect(validarAnexo({ modalidade: "globo", titulo: "  Anexo   do globo ", texto, outro: 1 })).toEqual({
      modalidade: "globo",
      titulo: "Anexo do globo",
      texto: texto.trim(),
    });
    expect(() => validarAnexo({ modalidade: "filantropia", titulo: "Anexo", texto })).toThrow(/modalidade/);
    expect(() => validarAnexo({ modalidade: "globo", titulo: "x", texto })).toThrow(/título/);
    expect(() => validarAnexo({ modalidade: "globo", titulo: "Anexo", texto: "curto" })).toThrow(/pelo menos/);
  });

  it("o bloqueio diz quais anexos e onde aceitar", () => {
    expect(bloqueioDosAnexos([{ titulo: "Vale-brinde", versao: 2 }])).toMatch(/"Vale-brinde" \(versão 2\).*Configurações/);
    expect(bloqueioDosAnexos([{ titulo: "A", versao: 1 }, { titulo: "B", versao: 1 }])).toMatch(/os anexos/);
  });
});
