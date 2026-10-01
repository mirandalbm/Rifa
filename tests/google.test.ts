import { describe, expect, it } from "vitest";
import {
  SEM_SENHA,
  caminhoDeVolta,
  claimsDoToken,
  ehContaSoGoogle,
  ehTelefoneProvisorio,
  faltaNaContaGoogle,
  telefoneProvisorio,
} from "@shared/google";

const bom = (extra: Record<string, unknown> = {}) => ({
  iss: "https://accounts.google.com",
  aud: "cliente-1",
  exp: Math.floor(Date.now() / 1000) + 600,
  nonce: "n1",
  sub: "123",
  email: "Ana@Exemplo.com",
  email_verified: true,
  name: "Ana Souza",
  ...extra,
});
const esperado = { clientId: "cliente-1", nonce: "n1" };

describe("claimsDoToken", () => {
  it("aceita o token certo e normaliza o e-mail", () => {
    const r = claimsDoToken(bom(), esperado);
    expect(r.ok && r.claims).toEqual({ sub: "123", email: "ana@exemplo.com", nome: "Ana Souza" });
  });
  it.each([
    ["emissor", { iss: "https://outro.com" }],
    ["aplicativo", { aud: "outro-cliente" }],
    ["vencido", { exp: 1 }],
    ["nonce", { nonce: "outro" }],
    ["sub", { sub: "" }],
    ["e-mail", { email: undefined }],
    ["e-mail não confirmado", { email_verified: false }],
  ])("recusa %s", (_n, extra) => {
    expect(claimsDoToken(bom(extra as Record<string, unknown>), esperado).ok).toBe(false);
  });
  it("aceita aud em lista e emissor sem https", () => {
    expect(claimsDoToken(bom({ aud: ["x", "cliente-1"], iss: "accounts.google.com" }), esperado).ok).toBe(true);
  });
  it("sem nome, usa o começo do e-mail", () => {
    const r = claimsDoToken(bom({ name: undefined }), esperado);
    expect(r.ok && r.claims.nome).toBe("Ana");
  });
});

describe("caminhoDeVolta", () => {
  it("só aceita caminho do próprio site", () => {
    expect(caminhoDeVolta("/minhas-cotas?aba=conta")).toBe("/minhas-cotas?aba=conta");
    for (const ruim of ["//outro.com", "/\\outro.com", "https://outro.com", "outro", "/a\nb", undefined, 5]) {
      expect(caminhoDeVolta(ruim)).toBe("/perfil");
    }
  });
});

describe("conta que nasce pelo Google", () => {
  it("telefone provisório não é número", () => {
    const t = telefoneProvisorio("abc");
    expect(ehTelefoneProvisorio(t)).toBe(true);
    expect(ehTelefoneProvisorio("11999990000")).toBe(false);
    expect(ehTelefoneProvisorio(null)).toBe(false);
  });
  it("a marca de sem senha é reconhecida só por ela mesma", () => {
    expect(ehContaSoGoogle(SEM_SENHA)).toBe(true);
    expect(ehContaSoGoogle(null)).toBe(false);
    expect(ehContaSoGoogle("salt:chave")).toBe(false);
  });
  it("diz o que falta", () => {
    expect(faltaNaContaGoogle({ cpf: null, phone: telefoneProvisorio("x") })).toEqual(["CPF", "telefone"]);
    expect(faltaNaContaGoogle({ cpf: "1", phone: "11999990000" })).toEqual([]);
  });
});
