import { describe, it, expect } from "vitest";
import {
  validarEndereco,
  cepValido,
  maskCep,
  cidadeUf,
  enderecoEmUmaLinha,
  distancia,
  ordenarPorProximidade,
  ufValida,
  UFS,
  separarCidadeUf,
} from "../shared/endereco";

const BASE = {
  cep: "13015-904",
  logradouro: "  Rua   Barão de Jaguara ",
  numero: "1481",
  complemento: "",
  bairro: "Centro",
  cidade: "Campinas",
  uf: "sp",
};

describe("endereço do organizador", () => {
  it("normaliza espaço, UF e CEP", () => {
    expect(validarEndereco(BASE)).toEqual({
      cep: "13015904",
      logradouro: "Rua Barão de Jaguara",
      numero: "1481",
      complemento: null,
      bairro: "Centro",
      cidade: "Campinas",
      uf: "SP",
    });
  });

  it("não guarda chave que não existe", () => {
    const e = validarEndereco({ ...BASE, extra: "x" } as never);
    expect(Object.keys(e).sort()).toEqual(
      ["bairro", "cep", "cidade", "complemento", "logradouro", "numero", "uf"],
    );
  });

  it("recusa o que falta, com motivo em português", () => {
    expect(() => validarEndereco({ ...BASE, cep: "1234" })).toThrow(/CEP/);
    expect(() => validarEndereco({ ...BASE, uf: "XX" })).toThrow(/estado/);
    expect(() => validarEndereco({ ...BASE, cidade: "" })).toThrow(/cidade/);
    expect(() => validarEndereco({ ...BASE, bairro: " " })).toThrow(/bairro/);
    expect(() => validarEndereco({ ...BASE, logradouro: "" })).toThrow(/rua/);
    expect(() => validarEndereco({ ...BASE, numero: "" })).toThrow(/número/);
    expect(() => validarEndereco({ ...BASE, cidade: "a".repeat(121) })).toThrow(/120/);
    expect(() => validarEndereco({ ...BASE, cidade: 42 as never })).toThrow(/cidade/);
  });

  it("CEP tem 8 números e não é repetido", () => {
    expect(cepValido("01310-100")).toBe(true);
    expect(cepValido("00000000")).toBe(false);
    expect(cepValido("0131010")).toBe(false);
    expect(maskCep("01310")).toBe("01310");
    expect(maskCep("0131010099")).toBe("01310-100");
  });

  it("tem as 27 unidades da federação", () => {
    expect(Object.keys(UFS)).toHaveLength(27);
    expect(ufValida("DF")).toBe(true);
    expect(ufValida("toString")).toBe(false);
  });

  it("formata para o bilhete e para o painel", () => {
    expect(cidadeUf("Campinas", "SP")).toBe("Campinas/SP");
    expect(cidadeUf("Campinas", null)).toBe("Campinas");
    expect(cidadeUf(null, null)).toBeNull();
    expect(enderecoEmUmaLinha(validarEndereco({ ...BASE, complemento: "sala 2" }))).toBe(
      "Rua Barão de Jaguara, 1481, sala 2 — Centro, Campinas/SP — CEP 13015-904",
    );
  });
});

describe("ordem da vitrine", () => {
  const rifas = [
    { id: "rj", uf: "RJ", cidade: "Niterói" },
    { id: "sp-capital", uf: "SP", cidade: "São Paulo" },
    { id: "sem-endereco", uf: null, cidade: null },
    { id: "campinas", uf: "SP", cidade: "Campinas" },
    { id: "sp-capital-2", uf: "SP", cidade: "sao  paulo" },
  ];

  it("cidade, depois estado, depois o resto — sem esconder nenhuma", () => {
    const r = ordenarPorProximidade(rifas, { uf: "SP", cidade: "São Paulo" });
    expect(r.map((x) => x.id)).toEqual([
      "sp-capital",
      "sp-capital-2",
      "campinas",
      "rj",
      "sem-endereco",
    ]);
  });

  it("só o estado: o estado primeiro, a ordem de antes dentro dele", () => {
    const r = ordenarPorProximidade(rifas, { uf: "sp" });
    expect(r.map((x) => x.id)).toEqual([
      "sp-capital",
      "campinas",
      "sp-capital-2",
      "rj",
      "sem-endereco",
    ]);
  });

  it("sem região, a ordem não muda", () => {
    expect(ordenarPorProximidade(rifas, {})).toEqual(rifas);
  });

  it("mesma cidade em outro estado não conta como perto", () => {
    expect(distancia({ uf: "MG", cidade: "Campinas" }, { uf: "SP", cidade: "Campinas" })).toBe(2);
  });
});

describe("cadastro antigo em texto livre", () => {
  it("separa cidade e UF nos formatos que apareciam", () => {
    expect(separarCidadeUf("São Paulo/SP")).toEqual({ cidade: "São Paulo", uf: "SP" });
    expect(separarCidadeUf("Campinas - sp")).toEqual({ cidade: "Campinas", uf: "SP" });
    expect(separarCidadeUf("Niterói, RJ")).toEqual({ cidade: "Niterói", uf: "RJ" });
    expect(separarCidadeUf("Mogi-Guaçu/SP")).toEqual({ cidade: "Mogi-Guaçu", uf: "SP" });
  });

  it("não inventa estado", () => {
    expect(separarCidadeUf("Teste/TE")).toBeNull();
    expect(separarCidadeUf("Campinas")).toBeNull();
    expect(separarCidadeUf(null)).toBeNull();
  });
});
