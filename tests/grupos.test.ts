import { describe, expect, it } from "vitest";
import {
  GRUPO_MAX_MEMBROS,
  GRUPO_NOME_MAX,
  grupoCheio,
  motivoDoGrupoValido,
  problemaNoNomeDoGrupo,
  problemaParaEscreverNoGrupo,
  rotuloDosGrupos,
} from "@shared/grupos";
import { destinoDaPendencia, ordenarCaixa } from "@shared/caixa";

describe("grupos da rifa — regras puras", () => {
  it("o nome tem tamanho, e não carrega link nem telefone", () => {
    expect(problemaNoNomeDoGrupo("ab")).toMatch(/nome/i);
    expect(problemaNoNomeDoGrupo("x".repeat(GRUPO_NOME_MAX + 1))).toMatch(/passa de/);
    expect(problemaNoNomeDoGrupo("Chama no 11 98888-7777")).toMatch(/Nome do grupo/);
    expect(problemaNoNomeDoGrupo("entra em https://golpe.example")).toMatch(/Nome do grupo/);
    expect(problemaNoNomeDoGrupo("Torcida da rifa 🍀")).toBeNull();
  });

  it("o teto é de 50 e o cheio começa nele", () => {
    expect(GRUPO_MAX_MEMBROS).toBe(50);
    expect(grupoCheio(49)).toBe(false);
    expect(grupoCheio(50)).toBe(true);
  });

  it("escrever: membro, grupo aberto e compra paga", () => {
    const ok = { encerrado: false, souMembro: true, compraPaga: true };
    expect(problemaParaEscreverNoGrupo(ok)).toBeNull();
    expect(problemaParaEscreverNoGrupo({ ...ok, souMembro: false })).toMatch(/Entre/);
    expect(problemaParaEscreverNoGrupo({ ...ok, encerrado: true })).toMatch(/encerrado/);
    expect(problemaParaEscreverNoGrupo({ ...ok, compraPaga: false })).toMatch(/não está mais paga/);
  });

  it("só motivo conhecido denuncia", () => {
    expect(motivoDoGrupoValido("golpe")).toBe(true);
    expect(motivoDoGrupoValido("inventado")).toBe(false);
  });

  it("o número vai no rótulo", () => {
    expect(rotuloDosGrupos(0)).toBe("Grupos");
    expect(rotuloDosGrupos(1)).toBe("Grupos, 1 não lida");
    expect(rotuloDosGrupos(250)).toBe("Grupos, mais de 99 não lidas");
  });

  it("o grupo denunciado entra na Caixa junto com a conversa, na frente do resto", () => {
    const l = (tipo: "grupo" | "fiscal", desde: string) => ({ tipo, desde });
    expect(ordenarCaixa([l("fiscal", "2026-10-01T10:00:00Z"), l("grupo", "2026-10-01T11:00:00Z")]).map((x) => x.tipo)).toEqual(["grupo", "fiscal"]);
    expect(destinoDaPendencia({ tipo: "grupo" })).toBe("/admin/atendimento?aba=denuncias");
  });
});
