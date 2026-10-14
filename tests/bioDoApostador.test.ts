import { describe, expect, it } from "vitest";
import { BIO_MAX, validarBio, validarLinkDoApostador } from "../shared/perfilApostador";

describe("bio do perfil do apostador", () => {
  it("aceita texto curto e apaga com vazio ou nulo", () => {
    expect(validarBio("Criador de jogos")).toEqual({ ok: true, bio: "Criador de jogos" });
    expect(validarBio("   ")).toEqual({ ok: true, bio: null });
    expect(validarBio(null)).toEqual({ ok: true, bio: null });
  });

  it("recusa mais de 150 caracteres", () => {
    const r = validarBio("a".repeat(BIO_MAX + 1));
    expect(r.ok).toBe(false);
  });

  it("recusa link e telefone, a mesma régua do comentário", () => {
    expect(validarBio("veja em https://golpe.com").ok).toBe(false);
    expect(validarBio("chama 11 91234-5678").ok).toBe(false);
  });

  it("recusa o que não é texto", () => {
    expect(validarBio(42).ok).toBe(false);
  });
});

describe("link do perfil do apostador", () => {
  it("aceita https e normaliza", () => {
    const r = validarLinkDoApostador("https://www.exemplo.com.br");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.link).toContain("exemplo.com.br");
  });

  it("vazio apaga o link", () => {
    expect(validarLinkDoApostador("")).toEqual({ ok: true, link: null });
    expect(validarLinkDoApostador(null)).toEqual({ ok: true, link: null });
  });

  it("recusa http, javascript e endereço sem domínio", () => {
    expect(validarLinkDoApostador("http://exemplo.com.br").ok).toBe(false);
    expect(validarLinkDoApostador("javascript:alert(1)").ok).toBe(false);
    expect(validarLinkDoApostador("https://localhost").ok).toBe(false);
  });

  it("recusa usuário e senha no endereço", () => {
    expect(validarLinkDoApostador("https://user:senha@exemplo.com.br").ok).toBe(false);
  });
});
