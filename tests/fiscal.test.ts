import { describe, expect, it } from "vitest";
import {
  canonico,
  codigoDeRecibo,
  faltaNoCadastro,
  IRRF_DISPENSA_ATE_CENTS,
  irrfDoSaque,
  maiorDeIdade,
  regimeDaEmpresa,
  mimeDaNotaFiscal,
  NOTA_FISCAL_MAX_BYTES,
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
  empresa: { tipo: "mei", cnpj: "11.222.333/0001-81", razaoSocial: " Maria da Silva  Divulgação " },
};

describe("validarCadastroFiscal", () => {
  it("normaliza e guarda só chaves conhecidas", () => {
    const d = validarCadastroFiscal({ ...BASE, extra: "x" });
    expect(d.nomeCompleto).toBe("Maria da Silva");
    expect(d.cpf).toBe("52998224725");
    expect(d.conta).toEqual({ banco: "260", agencia: "0001", conta: "12345678", tipo: "corrente" });
    expect(d.empresa).toEqual({ tipo: "mei", cnpj: "11222333000181", razaoSocial: "Maria da Silva Divulgação", regime: "mei" });
    expect(Object.keys(d).sort()).toEqual(["conta", "cpf", "empresa", "endereco", "nascimento", "nomeCompleto", "rg"]);
  });
  it("recusa o que não fecha", () => {
    expect(() => validarCadastroFiscal({ ...BASE, nomeCompleto: "Maria" })).toThrow(/nome completo/);
    expect(() => validarCadastroFiscal({ ...BASE, cpf: "111.111.111-11" })).toThrow(/CPF/);
    expect(() => validarCadastroFiscal({ ...BASE, nascimento: "2015-01-01" })).toThrow(/18 anos/);
    expect(() => validarCadastroFiscal({ ...BASE, conta: { ...BASE.conta, banco: "26" } })).toThrow(/banco/);
    expect(() => validarCadastroFiscal({ ...BASE, conta: { ...BASE.conta, tipo: "salario" } })).toThrow(/corrente ou poupança/);
    expect(() => validarCadastroFiscal({ ...BASE, endereco: { ...BASE.endereco, uf: "XX" } })).toThrow();
  });
  it("o saque é pago a MEI ou empresa: sem CNPJ válido, o cadastro não fecha (6.4)", () => {
    const { empresa: _, ...semEmpresa } = BASE;
    expect(() => validarCadastroFiscal(semEmpresa)).toThrow(/MEI ou empresa/);
    expect(() => validarCadastroFiscal({ ...BASE, empresa: { ...BASE.empresa, tipo: "pf" } })).toThrow(/MEI ou empresa/);
    expect(() => validarCadastroFiscal({ ...BASE, empresa: { ...BASE.empresa, cnpj: "11.222.333/0001-80" } })).toThrow(/CNPJ inválido/);
    expect(() => validarCadastroFiscal({ ...BASE, empresa: { ...BASE.empresa, razaoSocial: "x" } })).toThrow(/razão social/);
    expect(validarCadastroFiscal({ ...BASE, empresa: { ...BASE.empresa, tipo: "empresa", regime: "simples", extra: 1 } }).empresa).toEqual({
      tipo: "empresa",
      cnpj: "11222333000181",
      razaoSocial: "Maria da Silva Divulgação",
      regime: "simples",
    });
  });
  it("a empresa diz o regime; o MEI é sempre MEI (contador, 07/10/2026)", () => {
    expect(() => validarCadastroFiscal({ ...BASE, empresa: { ...BASE.empresa, tipo: "empresa" } })).toThrow(/regime tributário/);
    expect(() => validarCadastroFiscal({ ...BASE, empresa: { ...BASE.empresa, tipo: "empresa", regime: "mei" } })).toThrow(/regime tributário/);
    expect(validarCadastroFiscal({ ...BASE, empresa: { ...BASE.empresa, tipo: "empresa", regime: "presumido_real" } }).empresa?.regime).toBe("presumido_real");
    // O MEI que manda outro regime continua MEI: não se declara retenção que não existe.
    expect(validarCadastroFiscal({ ...BASE, empresa: { ...BASE.empresa, regime: "presumido_real" } }).empresa?.regime).toBe("mei");
  });
});

describe("regimeDaEmpresa e irrfDoSaque", () => {
  it("lê o regime do cadastro, inclusive o de antes", () => {
    expect(regimeDaEmpresa(null)).toBeNull();
    expect(regimeDaEmpresa({ tipo: "mei", cnpj: "x", razaoSocial: "x" })).toBe("mei");
    expect(regimeDaEmpresa({ tipo: "empresa", cnpj: "x", razaoSocial: "x" })).toBeNull();
    expect(regimeDaEmpresa({ tipo: "empresa", cnpj: "x", razaoSocial: "x", regime: "simples" })).toBe("simples");
  });
  it("só o Lucro Presumido ou Real retém, 1,5% para baixo", () => {
    expect(irrfDoSaque(1_000_000, "mei")).toBe(0);
    expect(irrfDoSaque(1_000_000, "simples")).toBe(0);
    expect(irrfDoSaque(1_000_000, null)).toBe(0);
    expect(irrfDoSaque(1_000_000, "presumido_real")).toBe(15_000);
    expect(irrfDoSaque(123_457, "presumido_real")).toBe(1_851); // 1.851,855 → 1.851: nunca reter a mais
  });
  it("a retenção de até R$ 10,00 é dispensada", () => {
    expect(IRRF_DISPENSA_ATE_CENTS).toBe(1_000);
    expect(irrfDoSaque(66_666, "presumido_real")).toBe(0); // R$ 9,99 de IRRF
    expect(irrfDoSaque(66_667, "presumido_real")).toBe(0); // R$ 10,00 exatos: dispensado
    expect(irrfDoSaque(66_734, "presumido_real")).toBe(1_001); // R$ 10,01: retém
  });
  it("valor estranho não retém", () => {
    expect(irrfDoSaque(0, "presumido_real")).toBe(0);
    expect(irrfDoSaque(-500, "presumido_real")).toBe(0);
    expect(irrfDoSaque(1.5, "presumido_real")).toBe(0);
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
    const todos = ["identidade_frente", "identidade_verso", "comprovante_residencia", "comprovante_cnpj"];
    expect(faltaNoCadastro(false, [])).toHaveLength(5);
    expect(faltaNoCadastro(true, todos)).toEqual([]);
    expect(faltaNoCadastro(true, todos.slice(0, 3))).toEqual(["comprovante do CNPJ (CCMEI ou cartão CNPJ)"]);
  });
  it("o cadastro de antes da regra, sem CNPJ, não fecha", () => {
    const todos = ["identidade_frente", "identidade_verso", "comprovante_residencia", "comprovante_cnpj"];
    expect(faltaNoCadastro(true, todos, false)).toEqual(["o CNPJ do seu MEI ou da sua empresa"]);
  });
  it("a empresa de antes do regime não fecha", () => {
    const todos = ["identidade_frente", "identidade_verso", "comprovante_residencia", "comprovante_cnpj"];
    expect(faltaNoCadastro(true, todos, true, false)).toEqual(["o regime tributário da empresa"]);
  });
});

describe("nota fiscal do saque", () => {
  const b = (s: string) => new TextEncoder().encode(s);
  it("reconhece PDF, XML de nota, JPG e PNG pelo conteúdo", () => {
    expect(mimeDaNotaFiscal(b("%PDF-1.7 ..."))).toBe("application/pdf");
    expect(mimeDaNotaFiscal(b('<?xml version="1.0"?><nfeProc xmlns="http://www.portalfiscal.inf.br/nfe">'))).toBe("application/xml");
    expect(mimeDaNotaFiscal(b("\uFEFF<CompNfse><Nfse>"))).toBe("application/xml");
    expect(mimeDaNotaFiscal(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toBe("image/jpeg");
    expect(mimeDaNotaFiscal(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a]))).toBe("image/png");
  });
  it("recusa o que não é nota: XML qualquer, HTML, texto", () => {
    expect(mimeDaNotaFiscal(b('<?xml version="1.0"?><svg onload="x">'))).toBeNull();
    expect(mimeDaNotaFiscal(b("<html><script>"))).toBeNull();
    expect(mimeDaNotaFiscal(b("nota"))).toBeNull();
    expect(NOTA_FISCAL_MAX_BYTES).toBe(3 * 1024 * 1024);
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
  it("com IRRF: fecha pelo bruto, e a retenção entra na assinatura", () => {
    const comIrrf: ReciboSnapshot = { ...RECIBO, irrfCents: 22 };
    expect(reciboFecha(comIrrf)).toBe(true);
    const a = assinar(canonico(comIrrf));
    expect(assinaturaConfere(canonico({ ...comIrrf, irrfCents: 0 }), a)).toBe(false);
    // O recibo sem retenção não ganha o campo: o texto canônico dos de antes não muda.
    expect(canonico(RECIBO)).not.toContain("irrfCents");
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
  it("tag curta é recusada, mesmo sendo o começo da tag certa", () => {
    // O GCM aceitaria uma tag de 4 bytes: forjar ficaria bem mais barato.
    const c = cifrar(Buffer.from("documento"));
    expect(() => decifrar({ ...c, tag: c.tag.subarray(0, 4) })).toThrow();
    expect(decifrar(c).toString()).toBe("documento");
  });
  it("mesmo texto, IV diferente", () => {
    expect(cifrar(Buffer.from("a")).iv.equals(cifrar(Buffer.from("a")).iv)).toBe(false);
  });
  it("impressão do CPF é estável e não é o CPF", () => {
    expect(impressaoDoCpf("52998224725")).toBe(impressaoDoCpf("529.982.247-25".replace(/\D/g, "")));
    expect(impressaoDoCpf("52998224725")).not.toContain("52998224725");
  });
});
