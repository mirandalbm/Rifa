import { describe, expect, it } from "vitest";
import {
  PREFERENCIA_PADRAO,
  alfaDoFundo,
  lerPreferenciaGuardada,
  modoNaTela,
  ultimasMensagens,
} from "../client/src/lib/comentariosNaTelaCheia";
import {
  FUNDOS_DA_CONVERSA_PCT,
  FUNDO_DA_CONVERSA_PADRAO_PCT,
  validarConfigPlataforma,
  validarFundoDaConversa,
} from "../shared/plataforma";

describe("comentários na tela cheia do sorteio", () => {
  it("o automático fica ao lado com o celular deitado e por cima em pé", () => {
    expect(modoNaTela(PREFERENCIA_PADRAO, true)).toBe("lado");
    expect(modoNaTela(PREFERENCIA_PADRAO, false)).toBe("sobre");
    expect(modoNaTela({ ...PREFERENCIA_PADRAO, modo: "sobre" }, true)).toBe("sobre");
    expect(modoNaTela({ ...PREFERENCIA_PADRAO, modo: "oculto" }, false)).toBe("oculto");
  });

  it("só valores conhecidos saem do aparelho; o resto vira o padrão", () => {
    expect(lerPreferenciaGuardada(null)).toEqual(PREFERENCIA_PADRAO);
    expect(lerPreferenciaGuardada("{estragado")).toEqual(PREFERENCIA_PADRAO);
    expect(lerPreferenciaGuardada("[1,2]")).toEqual(PREFERENCIA_PADRAO);
    // O fundo antigo guardado no aparelho é ignorado: agora é escolha da plataforma.
    expect(lerPreferenciaGuardada(JSON.stringify({ modo: "sobre", fundo: "forte", lado: "esquerda", extra: "<b>" }))).toEqual({
      modo: "sobre",
      lado: "esquerda",
    });
    expect(lerPreferenciaGuardada(JSON.stringify({ modo: "flutuante", lado: "cima" }))).toEqual(PREFERENCIA_PADRAO);
  });

  it("por padrão não há fundo: só as mensagens por cima do vídeo", () => {
    expect(FUNDO_DA_CONVERSA_PADRAO_PCT).toBe(0);
    expect(alfaDoFundo(FUNDO_DA_CONVERSA_PADRAO_PCT)).toBe(0);
    expect(alfaDoFundo(70)).toBe(0.7);
    expect(alfaDoFundo(100)).toBe(1);
    expect(alfaDoFundo(-5)).toBe(0);
    expect(alfaDoFundo(Number.NaN)).toBe(0);
  });

  it("a plataforma escolhe de 0% (sem fundo) a 100% (sólido); o guardado estragado volta ao sem fundo", () => {
    for (const p of FUNDOS_DA_CONVERSA_PCT) expect(validarFundoDaConversa(p)).toBe(p);
    for (const ruim of [-1, 101, 75.5, "90", "90%", null, true]) expect(() => validarFundoDaConversa(ruim)).toThrow(/0% \(sem fundo\) a 100%/);
    expect(validarConfigPlataforma({}).fundoDaConversaPct).toBe(0);
    expect(validarConfigPlataforma({ fundoDaConversaPct: 80 }).fundoDaConversaPct).toBe(80);
    expect(validarConfigPlataforma({ fundoDaConversaPct: 500 }).fundoDaConversaPct).toBe(0);
  });

  it("as últimas mensagens juntam comentários e respostas, a mais nova no fim", () => {
    const c = (id: string, min: number, respostas: ReturnType<typeof c>[] = []) => ({
      id,
      nome: `@${id}`,
      texto: `texto ${id}`,
      createdAt: new Date(Date.UTC(2026, 9, 4, 12, min)).toISOString(),
      respostas,
    });
    const lista = [c("c", 30, [c("r2", 40)]), c("a", 10, [c("r1", 20)]), c("b", 50)];
    expect(ultimasMensagens(lista).map((m) => m.id)).toEqual(["a", "r1", "c", "r2", "b"]);
    expect(ultimasMensagens(lista, 2).map((m) => m.id)).toEqual(["r2", "b"]);
    expect(Object.keys(ultimasMensagens(lista)[0]).sort()).toEqual(["id", "nome", "texto"]);
  });
});
