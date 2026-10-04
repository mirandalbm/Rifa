import { describe, expect, it } from "vitest";
import { FIGURINHAS_MAX, POSICAO_MAX, POSICAO_MIN, nomeDoEmoji, textoDaContagem, validarFigurinhas } from "../shared/figurinhasStory";

const comRifa = { temRifa: true };

describe("figurinhas do story", () => {
  it("sem figurinha é lista vazia; com elas, só as chaves de cada tipo", () => {
    expect(validarFigurinhas(undefined, comRifa)).toEqual([]);
    expect(validarFigurinhas(null, comRifa)).toEqual([]);
    expect(
      validarFigurinhas(
        [
          { tipo: "contagem", x: 0.5, y: 0.2, html: "<b>" },
          { tipo: "comprar", x: 0.5, y: 0.8, slug: "outra-rifa" },
          { tipo: "texto", x: 0.25, y: 0.5, texto: "  Última   chance ", emoji: "🔥" },
          { tipo: "emoji", x: 0.75, y: 0.35, emoji: "🍀" },
        ],
        comRifa,
      ),
    ).toEqual([
      { tipo: "contagem", x: 0.5, y: 0.2 },
      { tipo: "comprar", x: 0.5, y: 0.8 },
      { tipo: "texto", x: 0.25, y: 0.5, texto: "Última chance" },
      { tipo: "emoji", x: 0.75, y: 0.35, emoji: "🍀" },
    ]);
  });

  it("a posição fica dentro da tela e recusa o que não é número entre 0 e 1", () => {
    const [f] = validarFigurinhas([{ tipo: "emoji", x: 0, y: 1, emoji: "🍀" }], comRifa);
    expect(f.x).toBe(POSICAO_MIN);
    expect(f.y).toBe(POSICAO_MAX);
    expect(() => validarFigurinhas([{ tipo: "emoji", x: 2, y: 0.5, emoji: "🍀" }], comRifa)).toThrow(/fora da tela/);
    expect(() => validarFigurinhas([{ tipo: "emoji", x: "0.5", y: 0.5, emoji: "🍀" }], comRifa)).toThrow(/fora da tela/);
    expect(() => validarFigurinhas([{ tipo: "emoji", x: Number.NaN, y: 0.5, emoji: "🍀" }], comRifa)).toThrow(/fora da tela/);
  });

  it("contagem e Comprar só com rifa e uma vez cada", () => {
    expect(() => validarFigurinhas([{ tipo: "contagem", x: 0.5, y: 0.5 }], { temRifa: false })).toThrow(/rifa no story/);
    expect(() => validarFigurinhas([{ tipo: "comprar", x: 0.5, y: 0.5 }], { temRifa: false })).toThrow(/rifa no story/);
    expect(() =>
      validarFigurinhas(
        [
          { tipo: "comprar", x: 0.5, y: 0.5 },
          { tipo: "comprar", x: 0.5, y: 0.8 },
        ],
        comRifa,
      ),
    ).toThrow(/Um botão Comprar/);
  });

  it("no máximo quatro, tipo conhecido, formato de lista", () => {
    const cinco = Array.from({ length: FIGURINHAS_MAX + 1 }, () => ({ tipo: "emoji", x: 0.5, y: 0.5, emoji: "🍀" }));
    expect(() => validarFigurinhas(cinco, comRifa)).toThrow(/No máximo/);
    expect(() => validarFigurinhas([{ tipo: "link", x: 0.5, y: 0.5 }], comRifa)).toThrow(/não existe/);
    expect(() => validarFigurinhas({ tipo: "texto" }, comRifa)).toThrow(/formato/);
    expect(() => validarFigurinhas(["texto"], comRifa)).toThrow(/formato/);
  });

  it("texto sem link e sem telefone; emoji só da lista", () => {
    expect(() => validarFigurinhas([{ tipo: "texto", x: 0.5, y: 0.5, texto: "  " }], comRifa)).toThrow(/Escreva/);
    expect(() => validarFigurinhas([{ tipo: "texto", x: 0.5, y: 0.5, texto: "chama em golpe.com" }], comRifa)).toThrow(/link/);
    expect(() => validarFigurinhas([{ tipo: "texto", x: 0.5, y: 0.5, texto: "Zap 11 98888-7777" }], comRifa)).toThrow(/telefone/);
    expect(() => validarFigurinhas([{ tipo: "texto", x: 0.5, y: 0.5, texto: "a".repeat(61) }], comRifa)).toThrow(/até 60/);
    expect(() => validarFigurinhas([{ tipo: "emoji", x: 0.5, y: 0.5, emoji: "💣" }], comRifa)).toThrow(/lista/);
    expect(nomeDoEmoji("🍀")).toBe("trevo");
  });

  it("a contagem diz o tempo até o sorteio e para depois dele", () => {
    const agora = new Date("2026-10-04T12:00:00Z");
    const c = textoDaContagem("2026-10-06T15:30:05Z", false, agora);
    expect(c.partes?.map((p) => p.valor)).toEqual([2, 3, 30, 5]);
    expect(c.texto).toBe("Sorteio em 2 dias, 3 horas, 30 minutos");
    expect(textoDaContagem("2026-10-04T12:00:09Z", false, agora).texto).toBe("Sorteio em 9 segundos");
    expect(textoDaContagem("2026-10-04T11:00:00Z", false, agora)).toEqual({ partes: null, texto: "Sorteio agora" });
    expect(textoDaContagem(null, false, agora).texto).toBe("Sorteio quando a rifa completar");
    expect(textoDaContagem("2026-10-06T15:30:05Z", true, agora).texto).toBe("Sorteio realizado");
  });
});
