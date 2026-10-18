import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { ACOES_DA_IA, NOMES_DAS_ACOES, acoesDe } from "../shared/iaAcoes";
import { CONTEXTO_DO_PAPEL, FIM_DO_CONTEXTO, MARCA_DO_CONTEXTO } from "../shared/ia";
import { esquemaDaAcao, instrucoesDoAgente, montarPacote } from "../shared/pacoteLucky";

const ARQUIVO = path.join(__dirname, "..", "docs", "PACOTE-LUCKY.md");

/**
 * O pacote do Lucky é gerado do código (`npm run pacote-lucky`): o que o
 * responsável cola no Chatbase não pode divergir do que o sistema faz.
 */
describe("pacote do Lucky", () => {
  it("docs/PACOTE-LUCKY.md é o que o código gera (rode `npm run pacote-lucky`)", () => {
    expect(fs.readFileSync(ARQUIVO, "utf8")).toBe(montarPacote());
  });

  it("todas as ações do catálogo estão no documento, com nome, descrição e parâmetros", () => {
    const doc = montarPacote();
    expect(ACOES_DA_IA.map((a) => a.nome).sort()).toEqual([...NOMES_DAS_ACOES].sort());
    for (const a of ACOES_DA_IA) {
      expect(doc).toContain(`\`${a.nome}\``);
      expect(doc).toContain(a.descricao);
      for (const p of a.parametros) {
        expect(doc).toContain(p.descricao);
        expect(doc).toContain(`\`${p.nome}\``);
      }
    }
  });

  it("o esquema JSON de cada ação é válido e traz os obrigatórios", () => {
    for (const a of ACOES_DA_IA) {
      const e = JSON.parse(esquemaDaAcao(a));
      expect(Object.keys(e.properties)).toEqual(a.parametros.map((p) => p.nome));
      expect(e.required).toEqual(a.parametros.filter((p) => p.obrigatorio).map((p) => p.nome));
    }
  });

  it("as instruções citam o contexto do papel, as ações de cada papel e as recusas", () => {
    const t = instrucoesDoAgente();
    expect(t).toContain(MARCA_DO_CONTEXTO);
    expect(t).toContain(FIM_DO_CONTEXTO);
    expect(t).toContain("Lucky");
    for (const q of ["plataforma", "afiliado"] as const) {
      for (const a of acoesDe(q)) expect(t).toContain(a.nome);
    }
    for (const trecho of ["Pix por fora", "parecer jurídico", "outra organização", "telefone, CPF, e-mail", "confirmação"]) {
      expect(t.toLowerCase()).toContain(trecho.toLowerCase());
    }
    // O texto diz que o afiliado não grava: o catálogo tem de concordar.
    expect(acoesDe("afiliado").some((a) => a.grava)).toBe(false);
    expect(Object.keys(CONTEXTO_DO_PAPEL)).toEqual(["plataforma", "organizacao", "afiliado"]);
  });

  it("não traz chave de API no documento", () => {
    const doc = montarPacote();
    expect(doc).not.toMatch(/sk-[A-Za-z0-9]{10,}/);
    expect(doc).not.toMatch(/CHATBASE_API_KEY\s*=\s*\S/);
  });
});
