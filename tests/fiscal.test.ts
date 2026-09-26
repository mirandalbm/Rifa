import { describe, expect, it } from "vitest";
import {
  canonico,
  codigoDeRecibo,
  faltaNoCadastro,
  maiorDeIdade,
  reciboFecha,
  validarCadastroFiscal,
  type ReciboSnapshot,
} from "@shared/fiscal";
import { assinar, assinaturaConfere, cifrar, cifrarJson, decifrar, decifrarJson, impressaoDoCpf, sha256 } from "../server/services/cofre";

const BASE = {
  nomeCompleto: "  Maria   da Silva ",
  cpf: "529.982.247-25",
  rg: "12.345.678-9",
  nascimento: "1990-05-10",
  endereco: { cep: "13015-904", logradouro: "Rua Barão de Jaguara", numero: "1481", complemento: "", bairro: "Centro", cidade: "Campinas", uf: "SP" },
  conta: { banco: "260", agencia: "0001", conta: "1234567-8", tipo: "corrente" },
};

describe("validarCadastroFiscal", () => {
  it("normaliza e guarda só chaves conhecidas", () => {
    const d = validarCadastroFiscal({ ...BASE, extra: "x" });
    expect(d.nomeCompleto).toBe("Maria da Silva");
    expect(d.cpf).toBe("52998224725");
    expect(d.conta).toEqual({ banco: "260", agencia: "0001", conta: "12345678", tipo: "corrente" });
    expect(Object.keys(d).sort()).toEqual(["conta", "cpf", "endereco", "nascimento", "nomeCompleto", "rg"]);
  });
  it("recusa o que não fecha", () => {
    expect(() => validarCadastroFiscal({ ...BASE, nomeCompleto: "Maria" })).toThrow(/nome completo/);
    expect(() => validarCadastroFiscal({ ...BASE, cpf: "111.111.111-11" })).toThrow(/CPF/);
    expect(() => validarCadastroFiscal({ ...BASE, nascimento: "2015-01-01" })).toThrow(/18 anos/);
    expect(() => validarCadastroFiscal({ ...BASE, conta: { ...BASE.conta, banco: "26" } })).toThrow(/banco/);
    expect(() => validarCadastroFiscal({ ...BASE, conta: { ...BASE.conta, tipo: "salario" } })).toThrow(/corrente ou poupança/);
    expect(() => validarCadastroFiscal({ ...BASE, endereco: { ...BASE.endereco, uf: "XX" } })).toThrow();
  });
});

describe("maiorDeIdade", () => {
  const hoje = new Date(Date.UTC(2026, 8, 26));
  it("conta o aniversário no dia", () => {
    expect(maiorDeIdade("2008-09-26", hoje)).toBe(true);
    expect(maiorDeIdade("2008-09-27", hoje)).toBe(false);
  });
  it("recusa data que não existe", () => {
    expect(maiorDeIdade("1990-02-30", hoje)).toBe(false);
    expect(maiorDeIdade("10/05/1990", hoje)).toBe(false);
  });
});

describe("faltaNoCadastro", () => {
  it("lista dados e documentos que faltam", () => {
    expect(faltaNoCadastro(false, [])).toHaveLength(4);
    expect(faltaNoCadastro(true, ["identidade_frente", "identidade_verso", "comprovante_residencia"])).toEqual([]);
  });
});

const RECIBO: ReciboSnapshot = {
  codigo: "R-ABCDEFGH23",
  emitidoEm: "2026-09-26T12:00:00.000Z",
  pagador: { nome: "Rifas São José", cnpj: null },
  beneficiario: { nome: "Maria da Silva", cpf: "52998224725", codigoAfiliado: "MARIA" },
  valorCents: 1500,
  pagamento: { forma: "pix", destino: "maria@pix" },
  origem: [
    { rifa: "Moto", pedidos: 2, comissaoCents: 1000 },
    { rifa: "Carro", pedidos: 1, comissaoCents: 500 },
  ],
};

describe("recibo", () => {
  it("o texto canônico não depende da ordem das chaves", () => {
    const embaralhado = JSON.parse(JSON.stringify({ valorCents: 1500, ...RECIBO })) as ReciboSnapshot;
    expect(canonico(embaralhado)).toBe(canonico(RECIBO));
  });
  it("fecha só quando a origem soma o valor", () => {
    expect(reciboFecha(RECIBO)).toBe(true);
    expect(reciboFecha({ ...RECIBO, valorCents: 1501 })).toBe(false);
  });
  it("código sem caractere ambíguo", () => {
    let i = 0;
    const c = codigoDeRecibo(() => i++ % 32);
    expect(c).toMatch(/^R-[2-9A-HJ-NP-Z]{10}$/);
  });
  it("assinatura pega um centavo mexido", () => {
    const texto = canonico(RECIBO);
    const a = assinar(texto);
    expect(assinaturaConfere(texto, a)).toBe(true);
    expect(assinaturaConfere(canonico({ ...RECIBO, valorCents: 1600 }), a)).toBe(false);
    expect(assinaturaConfere(texto, "lixo")).toBe(false);
    expect(sha256(texto)).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("cofre", () => {
  it("volta o que entrou e não guarda o claro", () => {
    const c = cifrarJson({ cpf: "52998224725" });
    expect(c.dados.toString("latin1")).not.toContain("52998224725");
    expect(decifrarJson<{ cpf: string }>(c).cpf).toBe("52998224725");
  });
  it("byte mexido dá erro, não lixo", () => {
    const c = cifrar(Buffer.from("documento"));
    const dados = Buffer.from(c.dados);
    dados[0] ^= 1;
    expect(() => decifrar({ ...c, dados })).toThrow();
  });
  it("mesmo texto, IV diferente", () => {
    expect(cifrar(Buffer.from("a")).iv.equals(cifrar(Buffer.from("a")).iv)).toBe(false);
  });
  it("impressão do CPF é estável e não é o CPF", () => {
    expect(impressaoDoCpf("52998224725")).toBe(impressaoDoCpf("529.982.247-25".replace(/\D/g, "")));
    expect(impressaoDoCpf("52998224725")).not.toContain("52998224725");
  });
});
