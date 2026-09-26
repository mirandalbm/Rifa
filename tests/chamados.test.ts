import { describe, it, expect } from "vitest";
import {
  gerarCodigoCliente,
  gerarProtocolo,
  bloqueioDoReembolso,
  problemaNoPedido,
  prazoDoEstorno,
  PRAZO_ESTORNO_MAX,
  destinatariosDoAviso,
  telefoneDeAvisoValido,
} from "@shared/chamados";

const CPF = "529.982.247-25";

describe("ID do cliente", () => {
  it("tem prefixo, oito caracteres e nenhum caractere ambíguo", () => {
    for (let i = 0; i < 200; i++) {
      const c = gerarCodigoCliente((max) => Math.floor(Math.random() * max));
      expect(c).toMatch(/^C-[2-9A-HJKMNP-Z]{8}$/);
      expect(c.slice(2)).not.toMatch(/[01OIL]/);
    }
  });

  it("usa o sorteio injetado (determinístico em teste)", () => {
    expect(gerarCodigoCliente(() => 0)).toBe("C-22222222");
  });
});

describe("protocolo", () => {
  it("traz a data de Brasília e seis dígitos", () => {
    // 02:00 UTC do dia 27 ainda é dia 26 em Brasília.
    const p = gerarProtocolo(new Date("2026-09-27T02:00:00Z"), () => 42);
    expect(p).toBe("RB-20260926-000042");
  });
});

describe("quem pode pedir reembolso", () => {
  const base = { estornoLigado: true, statusPedido: "paid", statusRifa: "active" };

  it("pedido pago de rifa no ar pode", () => {
    expect(bloqueioDoReembolso(base)).toBeNull();
  });

  it("chave desligada barra tudo", () => {
    expect(bloqueioDoReembolso({ ...base, estornoLigado: false })).toMatch(/não está aceitando/);
  });

  it("pedido não pago não tem o que devolver", () => {
    expect(bloqueioDoReembolso({ ...base, statusPedido: "pending" })).toMatch(/pago/);
  });

  it("depois do sorteio, nunca — quem perdeu pediria o dinheiro de volta", () => {
    expect(bloqueioDoReembolso({ ...base, statusRifa: "drawn" })).toMatch(/sorteio/);
  });
});

describe("o que o comprador manda", () => {
  it("aceita o pedido completo", () => {
    expect(problemaNoPedido({ motivo: "Comprei duas vezes sem querer", cpf: CPF })).toBeNull();
  });

  it("exige motivo de verdade", () => {
    expect(problemaNoPedido({ motivo: "quero", cpf: CPF })).toMatch(/10 caracteres/);
  });

  it("exige CPF válido", () => {
    expect(problemaNoPedido({ motivo: "Comprei duas vezes sem querer", cpf: "111.111.111-11" })).toMatch(
      /CPF/,
    );
  });

  it("limita a chave Pix", () => {
    expect(
      problemaNoPedido({ motivo: "Comprei duas vezes sem querer", cpf: CPF, pixChave: "x".repeat(141) }),
    ).toMatch(/Pix/);
  });
});

describe("prazo de devolução", () => {
  const concluido = new Date("2026-09-26T12:00:00Z");

  it("conta os dias da organização a partir da conclusão", () => {
    expect(prazoDoEstorno(concluido, 7).toISOString()).toBe("2026-10-03T12:00:00.000Z");
  });

  it("não passa do teto nem fica abaixo de um dia", () => {
    const dias = (d: Date) => (d.getTime() - concluido.getTime()) / 86_400_000;
    expect(dias(prazoDoEstorno(concluido, 365))).toBe(PRAZO_ESTORNO_MAX);
    expect(dias(prazoDoEstorno(concluido, 0))).toBe(1);
  });
});

describe("aviso de chamado novo", () => {
  it("aceita DDD + número, com ou sem 55", () => {
    expect(telefoneDeAvisoValido("(11) 98888-7777")).toBe(true);
    expect(telefoneDeAvisoValido("5511988887777")).toBe(true);
    expect(telefoneDeAvisoValido("98888-7777")).toBe(false);
    expect(telefoneDeAvisoValido("contato@rifa.br")).toBe(false);
  });

  it("o número da organização vale sozinho", () => {
    expect(destinatariosDoAviso("(11) 3333-4444", ["11988887777"])).toEqual(["1133334444"]);
  });

  it("sem ele, avisa cada organizador com WhatsApp, uma vez só", () => {
    expect(
      destinatariosDoAviso(null, ["11988887777", "(11) 98888-7777", null, "123", "21977776666"]),
    ).toEqual(["11988887777", "21977776666"]);
  });

  it("número inválido da organização cai nos organizadores", () => {
    expect(destinatariosDoAviso("123", ["11988887777"])).toEqual(["11988887777"]);
  });

  it("ninguém com WhatsApp: lista vazia (o contador do menu segue avisando)", () => {
    expect(destinatariosDoAviso(undefined, [null, ""])).toEqual([]);
  });
});
