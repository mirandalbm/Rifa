import { describe, expect, it } from "vitest";
import {
  FUNDOS_NA_TELA_CHEIA,
  PREFERENCIA_PADRAO,
  alfaDoFundo,
  lerPreferenciaGuardada,
  modoNaTela,
  ultimasMensagens,
} from "../client/src/lib/comentariosNaTelaCheia";

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
    expect(lerPreferenciaGuardada(JSON.stringify({ modo: "sobre", fundo: "forte", lado: "esquerda", extra: "<b>" }))).toEqual({
      modo: "sobre",
      fundo: "forte",
      lado: "esquerda",
    });
    expect(lerPreferenciaGuardada(JSON.stringify({ modo: "flutuante", fundo: 3, lado: "cima" }))).toEqual(PREFERENCIA_PADRAO);
  });

  it("o fundo mais leve ainda é escuro o bastante para o texto branco", () => {
    for (const f of FUNDOS_NA_TELA_CHEIA) expect(alfaDoFundo(f.valor)).toBeGreaterThanOrEqual(0.45);
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
