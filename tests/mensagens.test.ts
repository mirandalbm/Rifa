import { describe, expect, it } from "vitest";
import {
  MENSAGEM_MAX,
  ordenarPar,
  previaDoTexto,
  problemaNaMensagem,
  problemaParaEnviar,
  rotuloDasMensagens,
  situacaoDepoisDeEnviar,
  situacaoInicial,
  outroLado,
  type EstadoDaConversa,
} from "@shared/mensagens";

const base: EstadoDaConversa = { situacao: "pedido", iniciadaPor: "a", bloqueadaPor: null, encerrada: false };

describe("mensagens — regras puras", () => {
  it("o mesmo par, em qualquer ordem, dá a mesma linha", () => {
    const x = { tipo: "comprador" as const, id: "11111111-1111-1111-1111-111111111111" };
    const y = { tipo: "organizacao" as const, id: "22222222-2222-2222-2222-222222222222" };
    const p1 = ordenarPar(x, y);
    const p2 = ordenarPar(y, x);
    expect(p1.a).toEqual(p2.a);
    expect(p1.b).toEqual(p2.b);
    expect(p1.ladoDeX).not.toBe(p2.ladoDeX);
  });

  it("a régua do texto é a dos comentários: sem link e sem telefone, com emoji", () => {
    expect(problemaNaMensagem("")).toMatch(/Escreva/);
    expect(problemaNaMensagem("x".repeat(MENSAGEM_MAX + 1))).toMatch(/passa de/);
    expect(problemaNaMensagem("entra em www.golpe.com")).toMatch(/link/i);
    expect(problemaNaMensagem("me liga 11 98765-4321")).toMatch(/telefone/i);
    expect(problemaNaMensagem("Oi! Tudo bem? 😀")).toBeNull();
  });

  it("prévia é a primeira linha, cortada", () => {
    expect(previaDoTexto("  oi\nsegunda linha ")).toBe("oi");
    expect(previaDoTexto("a".repeat(200)).length).toBeLessThanOrEqual(90);
  });

  it("quem segue a organização conversa direto; o resto é pedido", () => {
    expect(situacaoInicial({ apostadorSegueAOrganizacao: true })).toBe("aceita");
    expect(situacaoInicial({ apostadorSegueAOrganizacao: false })).toBe("pedido");
  });

  it("pedido: quem iniciou espera; quem recebeu pode responder e isso aceita", () => {
    expect(problemaParaEnviar(base, "a")).toMatch(/Aguarde/);
    expect(problemaParaEnviar(base, "b")).toBeNull();
    expect(situacaoDepoisDeEnviar(base, "b")).toBe("aceita");
    expect(situacaoDepoisDeEnviar(base, "a")).toBe("pedido");
  });

  it("recusada: quem iniciou não escreve, quem recebeu pode voltar atrás", () => {
    const r: EstadoDaConversa = { ...base, situacao: "recusada" };
    expect(problemaParaEnviar(r, "a")).toMatch(/recusado/);
    expect(problemaParaEnviar(r, "b")).toBeNull();
    expect(situacaoDepoisDeEnviar(r, "b")).toBe("aceita");
  });

  it("bloqueio e encerramento barram os dois lados", () => {
    const acc: EstadoDaConversa = { ...base, situacao: "aceita" };
    expect(problemaParaEnviar({ ...acc, bloqueadaPor: "a" }, "a")).toMatch(/Desbloqueie/);
    expect(problemaParaEnviar({ ...acc, bloqueadaPor: "a" }, "b")).toMatch(/Não é possível/);
    expect(problemaParaEnviar({ ...acc, encerrada: true }, "a")).toMatch(/encerrada/);
    expect(problemaParaEnviar(acc, "a")).toBeNull();
    expect(outroLado("a")).toBe("b");
  });

  it("o número vai no rótulo", () => {
    expect(rotuloDasMensagens(0)).toBe("Mensagens");
    expect(rotuloDasMensagens(1)).toBe("Mensagens, 1 não lida");
    expect(rotuloDasMensagens(3)).toBe("Mensagens, 3 não lidas");
    expect(rotuloDasMensagens(500)).toBe("Mensagens, mais de 99 não lidas");
  });
});
