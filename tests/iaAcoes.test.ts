import { describe, expect, it } from "vitest";
import {
  ACOES_DA_IA,
  NOMES_DAS_ACOES,
  ROTULO_DA_ACAO,
  acaoPeloNome,
  acoesDe,
  chamadasDasPartes,
  resultadoSemDadoPessoal,
  validarEntrada,
} from "../shared/iaAcoes";

describe("catálogo das ações do assistente", () => {
  it("cada nome aparece uma vez, tem rótulo e só usa letras, números e _", () => {
    const nomes = ACOES_DA_IA.map((a) => a.nome);
    expect(new Set(nomes).size).toBe(nomes.length);
    expect([...nomes].sort()).toEqual([...NOMES_DAS_ACOES].sort());
    for (const a of ACOES_DA_IA) {
      expect(a.nome).toMatch(/^[a-z_]+$/);
      expect(ROTULO_DA_ACAO[a.nome]).toBeTruthy();
      expect(a.descricao.length).toBeGreaterThan(20);
    }
  });

  it("o afiliado só consulta: nenhuma ação que grava é dele", () => {
    expect(acoesDe("afiliado").every((a) => !a.grava)).toBe(true);
    expect(acoesDe("afiliado").map((a) => a.nome)).toEqual(["minhas_comissoes"]);
  });

  it("dinheiro, estorno, publicação e exclusão gravam (pedem confirmação)", () => {
    for (const n of ["publicar_rifa", "atualizar_legenda", "excluir_rifa", "estornar_chamado"] as const) {
      expect(acaoPeloNome(n)?.grava).toBe(true);
    }
    for (const n of ["listar_rifas", "resumo_de_vendas", "consultar_pedido", "pendencias", "minhas_comissoes"] as const) {
      expect(acaoPeloNome(n)?.grava).toBe(false);
    }
    expect(acaoPeloNome("apagar_tudo")).toBeNull();
    expect(acaoPeloNome(undefined)).toBeNull();
  });
});

describe("a entrada que a IA manda é conferida como corpo de requisição", () => {
  it("listar_rifas: situação conhecida ou nenhuma", () => {
    expect(validarEntrada("listar_rifas", {})).toEqual({ ok: true, valor: { nome: "listar_rifas", situacao: null } });
    expect(validarEntrada("listar_rifas", { situacao: "no_ar" })).toEqual({ ok: true, valor: { nome: "listar_rifas", situacao: "no_ar" } });
    expect(validarEntrada("listar_rifas", { situacao: "'; drop table" }).ok).toBe(false);
  });

  it("resumo_de_vendas: de 1 a 90 dias, padrão 30", () => {
    expect(validarEntrada("resumo_de_vendas", null)).toEqual({ ok: true, valor: { nome: "resumo_de_vendas", dias: 30 } });
    expect(validarEntrada("resumo_de_vendas", { dias: "7" })).toEqual({ ok: true, valor: { nome: "resumo_de_vendas", dias: 7 } });
    expect(validarEntrada("resumo_de_vendas", { dias: 0 }).ok).toBe(false);
    expect(validarEntrada("resumo_de_vendas", { dias: 91 }).ok).toBe(false);
    expect(validarEntrada("resumo_de_vendas", { dias: 2.5 }).ok).toBe(false);
  });

  it("consultar_pedido: só o código de 8 dígitos", () => {
    expect(validarEntrada("consultar_pedido", { codigo: "1234-5678" })).toEqual({ ok: true, valor: { nome: "consultar_pedido", codigo: 12345678 } });
    expect(validarEntrada("consultar_pedido", { codigo: 1234567 }).ok).toBe(false);
    expect(validarEntrada("consultar_pedido", { codigo: "123456789" }).ok).toBe(false);
  });

  it("rifa pelo endereço: o caminho inteiro vira o slug, e lixo é recusado", () => {
    expect(validarEntrada("publicar_rifa", { rifa: "/r/Moto-Zero/" })).toEqual({ ok: true, valor: { nome: "publicar_rifa", rifa: "moto-zero" } });
    expect(validarEntrada("excluir_rifa", { rifa: "a b" }).ok).toBe(false);
    expect(validarEntrada("excluir_rifa", {}).ok).toBe(false);
    expect(validarEntrada("publicar_rifa", { rifa: "x".repeat(81) }).ok).toBe(false);
  });

  it("atualizar_legenda: o texto é obrigatório e tem teto", () => {
    expect(validarEntrada("atualizar_legenda", { rifa: "moto", legenda: "  nova  " })).toEqual({ ok: true, valor: { nome: "atualizar_legenda", rifa: "moto", legenda: "nova" } });
    expect(validarEntrada("atualizar_legenda", { rifa: "moto" }).ok).toBe(false);
    expect(validarEntrada("atualizar_legenda", { rifa: "moto", legenda: "a".repeat(2201) }).ok).toBe(false);
  });

  it("estornar_chamado: só o formato do protocolo de reembolso", () => {
    expect(validarEntrada("estornar_chamado", { protocolo: "rb-20261002-123456" })).toEqual({ ok: true, valor: { nome: "estornar_chamado", protocolo: "RB-20261002-123456" } });
    expect(validarEntrada("estornar_chamado", { protocolo: "RS-20261002-123456" }).ok).toBe(false);
    expect(validarEntrada("estornar_chamado", { protocolo: "RB-1" }).ok).toBe(false);
  });
});

describe("o resultado que sai para o Chatbase não leva dado pessoal", () => {
  it("passa: protocolo, datas ISO, dinheiro formatado e números", () => {
    expect(
      resultadoSemDadoPessoal({
        protocolo: "RB-20261002-123456",
        pagoEm: "2026-10-02T08:30:08.000Z",
        valor: "R$ 1.234,50",
        codigo: "12345678",
        lista: [1234, 56789012, 3],
      }),
    ).toBe(true);
  });

  it("retém: telefone, CPF e e-mail em qualquer texto, inclusive aninhado", () => {
    expect(resultadoSemDadoPessoal({ titulo: "Rifa — chama no 11 98765-4321" })).toBe(false);
    expect(resultadoSemDadoPessoal([{ x: { y: "123.456.789-09" } }])).toBe(false);
    expect(resultadoSemDadoPessoal({ contato: "fulano@exemplo.com" })).toBe(false);
  });
});

describe("as partes tool-call da resposta do Chatbase", () => {
  it("só as bem formadas, com a entrada como veio (conferida depois)", () => {
    expect(
      chamadasDasPartes([
        { type: "text", text: "oi" },
        { type: "tool-call", toolCallId: "c1", toolName: "pendencias" },
        { type: "tool-call", toolCallId: "c2", toolName: "listar_rifas", input: { situacao: "no_ar" } },
        { type: "tool-call", toolName: "sem_id" },
        { type: "tool-call", toolCallId: "", toolName: "vazio" },
        { type: "tool-call", toolCallId: "x".repeat(201), toolName: "longo" },
        null,
      ]),
    ).toEqual([
      { toolCallId: "c1", nome: "pendencias", entrada: {} },
      { toolCallId: "c2", nome: "listar_rifas", entrada: { situacao: "no_ar" } },
    ]);
    expect(chamadasDasPartes("nada")).toEqual([]);
  });
});
