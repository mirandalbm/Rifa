import { describe, expect, it } from "vitest";
import { abaDoReels, limiteDoLote, loteDepoisDe, REELS_LOTE, REELS_LOTE_MAX, videoDoReels, videoEmPe } from "../shared/reels";

const v = (o: Record<string, unknown> = {}) => ({ role: "video", url: "/v.mp4", durationS: 30, largura: 1080, altura: 1920, ...o });

describe("reels", () => {
  it("só vídeo em pé entra, pelo que o servidor mediu", () => {
    expect(videoEmPe({ largura: 1080, altura: 1920 })).toBe(true);
    expect(videoEmPe({ largura: 1080, altura: 1350 })).toBe(true); // 4:5
    expect(videoEmPe({ largura: 1080, altura: 1080 })).toBe(false);
    expect(videoEmPe({ largura: 1920, altura: 1080 })).toBe(false);
    expect(videoEmPe({ largura: null, altura: null })).toBe(false); // sem medida, não entra
  });

  it("a rifa mostra o primeiro vídeo em pé de até 3 minutos", () => {
    expect(videoDoReels([{ role: "photo", url: "/f.jpg" }, v()])?.url).toBe("/v.mp4");
    expect(videoDoReels([v({ durationS: 181 })])).toBeNull(); // vídeo de feed
    expect(videoDoReels([v({ largura: 1920, altura: 1080 })])).toBeNull(); // deitado
    expect(videoDoReels([{ role: "photo", url: "/f.jpg" }])).toBeNull();
    expect(videoDoReels([v({ url: "/a.mp4" }), v({ url: "/b.mp4" })])?.url).toBe("/a.mp4");
  });

  it("o lote vem depois do último id visto, sem repetir nem pular", () => {
    const lista = ["a", "b", "c", "d", "e"].map((id) => ({ id }));
    const um = loteDepoisDe(lista, null, 2);
    expect(um.itens.map((x) => x.id)).toEqual(["a", "b"]);
    expect(um.proximo).toBe("b");
    const dois = loteDepoisDe(lista, um.proximo, 2);
    expect(dois.itens.map((x) => x.id)).toEqual(["c", "d"]);
    const tres = loteDepoisDe(lista, dois.proximo, 2);
    expect(tres.itens.map((x) => x.id)).toEqual(["e"]);
    expect(tres.proximo).toBeNull();
  });

  it("entrar rifa nova no topo não repete o que a pessoa já viu", () => {
    const antes = ["a", "b", "c", "d"].map((id) => ({ id }));
    const visto = loteDepoisDe(antes, null, 2).proximo; // "b"
    const depois = [{ id: "novo" }, ...antes];
    expect(loteDepoisDe(depois, visto, 2).itens.map((x) => x.id)).toEqual(["c", "d"]);
  });

  it("id que saiu do ar recomeça do começo; lista vazia não quebra", () => {
    const lista = [{ id: "a" }, { id: "b" }];
    expect(loteDepoisDe(lista, "sumiu", 5).itens.map((x) => x.id)).toEqual(["a", "b"]);
    expect(loteDepoisDe([], null, 5)).toEqual({ itens: [], proximo: null });
  });

  it("o limite do lote é um inteiro entre 1 e o máximo", () => {
    expect(limiteDoLote(undefined)).toBe(REELS_LOTE);
    expect(limiteDoLote("abc")).toBe(REELS_LOTE);
    expect(limiteDoLote(0)).toBe(REELS_LOTE);
    expect(limiteDoLote(3)).toBe(3);
    expect(limiteDoLote(500)).toBe(REELS_LOTE_MAX);
  });

  it("aba desconhecida é a de todos", () => {
    expect(abaDoReels("seguindo")).toBe("seguindo");
    expect(abaDoReels("x")).toBe("reels");
    expect(abaDoReels(undefined)).toBe("reels");
  });
});
