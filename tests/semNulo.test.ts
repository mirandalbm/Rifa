import { describe, expect, it } from "vitest";
import { enderecoTemByteNulo, erroDeByteNulo, temByteNulo } from "@shared/semNulo";
import { chaveDoBalde } from "../server/services/balde";

/**
 * Auditoria do acesso público: o byte nulo e o texto enorme chegavam ao
 * Postgres por rota aberta e, numa rota `async` sem `try`, derrubavam o
 * processo (`POST /api/auth/login`). A porta recusa; o balde do antifraude
 * nunca estoura a linha do índice.
 */
describe("byte nulo", () => {
  it("acha no endereço, cru ou como %00", () => {
    expect(enderecoTemByteNulo("/api/public/o/%00")).toBe(true);
    expect(enderecoTemByteNulo("/api/public/o/%00/foto")).toBe(true);
    expect(enderecoTemByteNulo("/api/public/presente?codigo=a%00b")).toBe(true);
    expect(enderecoTemByteNulo("/api/public/o/a\0b")).toBe(true);
    expect(enderecoTemByteNulo("/api/public/o/rifas-sao-jose?x=1")).toBe(false);
    // %0 e %000 não são byte nulo: só o %00 inteiro.
    expect(enderecoTemByteNulo("/api/public/o/100%")).toBe(false);
  });

  it("acha dentro de JSON, em texto, lista, objeto e chave", () => {
    expect(temByteNulo("a\0b")).toBe(true);
    expect(temByteNulo({ email: "a\u0000b" })).toBe(true);
    expect(temByteNulo({ buyer: { name: ["ok", "x\0"] } })).toBe(true);
    expect(temByteNulo({ ["chave\0"]: 1 })).toBe(true);
  });

  it("não vê o que não tem: número, nulo, texto normal, corpo vazio", () => {
    expect(temByteNulo(undefined)).toBe(false);
    expect(temByteNulo(null)).toBe(false);
    expect(temByteNulo({})).toBe(false);
    expect(temByteNulo({ a: 1, b: true, c: null, d: ["texto", { e: "ã é ü 😀" }] })).toBe(false);
    expect(temByteNulo(Buffer.from([0, 0, 0]))).toBe(false); // corpo cru não é texto de formulário
  });

  it("não vira conta cara: profundidade e tamanho têm teto", () => {
    let fundo: unknown = "x\0";
    for (let i = 0; i < 100; i++) fundo = { a: fundo };
    expect(temByteNulo(fundo)).toBe(false); // além da profundidade, deixa para a rede de segurança
    const largo = Array.from({ length: 50_000 }, () => ({ a: 1 }));
    expect(() => temByteNulo(largo)).not.toThrow();
  });

  it("reconhece o erro do Postgres, mesmo embrulhado pelo Drizzle", () => {
    expect(erroDeByteNulo({ code: "22021" })).toBe(true);
    expect(erroDeByteNulo({ message: "Failed query", cause: { code: "22021" } })).toBe(true);
    expect(erroDeByteNulo({ code: "23505" })).toBe(false);
    expect(erroDeByteNulo(null)).toBe(false);
    expect(erroDeByteNulo(new Error("outro"))).toBe(false);
  });
});

describe("balde do antifraude", () => {
  it("o balde curto segue exatamente como era", () => {
    expect(chaveDoBalde("login:ana@exemplo.com")).toBe("login:ana@exemplo.com");
    expect(chaveDoBalde("otp:11999990000")).toBe("otp:11999990000");
    expect(chaveDoBalde("order:ip:" + "a".repeat(32))).toBe("order:ip:" + "a".repeat(32));
  });

  it("o texto enorme vira um balde curto, sempre o mesmo para o mesmo texto", () => {
    const enorme = "login:" + "x".repeat(6000);
    const a = chaveDoBalde(enorme);
    expect(a.length).toBeLessThan(120);
    expect(chaveDoBalde(enorme)).toBe(a);
    expect(a.startsWith("login:xxx")).toBe(true);
    // Dois textos que só diferem no fim caem em baldes diferentes.
    expect(chaveDoBalde(enorme + "1")).not.toBe(chaveDoBalde(enorme + "2"));
  });

  it("o byte nulo sai do balde, mas não confunde textos diferentes", () => {
    const a = chaveDoBalde("login:a\0b");
    expect(a.includes("\0")).toBe(false);
    expect(a).not.toBe(chaveDoBalde("login:ab"));
    expect(chaveDoBalde("login:a\0b")).toBe(a);
  });
});
