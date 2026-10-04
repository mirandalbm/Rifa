import { describe, expect, it } from "vitest";
import { abaDoReels, cursorDoReels, ehVideo, itensDoReels, loteDoReels, limiteDoLote, loteDepoisDe, REELS_LOTE, REELS_LOTE_MAX, videoDoReels, videoEmPe, videosDoReels } from "../shared/reels";

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

  it("os vídeos de uma rifa vão do mais antigo ao mais novo, e só em pé", () => {
    const pe = { largura: 1080, altura: 1920, durationS: 30, url: "u" };
    const lista = videosDoReels([
      { id: "c", role: "video", ...pe, criadaEm: "2026-09-01T00:00:00Z" },
      { id: "r2", role: "reels", ...pe, criadaEm: "2026-10-03T00:00:00Z" },
      { id: "r1", role: "reels", ...pe, criadaEm: "2026-10-01T00:00:00Z" },
      { id: "deitado", role: "reels", ...pe, largura: 1920, altura: 1080, criadaEm: "2026-10-04T00:00:00Z" },
      { id: "foto", role: "photo", ...pe },
    ]);
    expect(lista.map((v) => v.id)).toEqual(["c", "r1", "r2"]);
    expect(videosDoReels([{ id: "f", role: "photo", ...pe }])).toEqual([]);
  });

  const A = "aaaaaaaa-0000-0000-0000-000000000000";
  const B = "bbbbbbbb-0000-0000-0000-000000000000";
  const C = "cccccccc-0000-0000-0000-000000000000";
  const fila = (rifas: [string, string[]][]) =>
    itensDoReels(rifas.map(([chave, ids]) => ({ chave, rifa: chave, videos: ids.map((id) => ({ id })) })));
  const ids = (l: { id: string }[]) => l.map((i) => i.id);

  it("a fila põe um vídeo de cada rifa por rodada", () => {
    const itens = fila([[A, ["a1", "a2", "a3"]], [B, ["b1"]], [C, ["c1", "c2"]]]);
    expect(ids(itens)).toEqual(["a1", "b1", "c1", "a2", "c2", "a3"]);
    expect(itensDoReels([])).toEqual([]);
  });

  const U = (n: number) => `0000000${n}-0000-0000-0000-000000000000`;

  it("o lote anda pela posição: vídeo novo não faz pular, apagado não faz repetir", () => {
    const [a1, a2, b1, b2, b3] = [U(1), U(2), U(3), U(4), U(5)];
    const antes = fila([[A, [a1, a2]], [B, [b1, b2]]]);
    const primeiro = loteDoReels(antes, null, 2);
    expect(ids(primeiro.itens)).toEqual([a1, b1]);
    const cursor = cursorDoReels(primeiro.proximo);
    expect(cursor).toEqual({ rodada: 0, chave: B, video: b1 });
    // B publica outro: entra no fim da rifa, e o a2 não é pulado.
    expect(ids(loteDoReels(fila([[A, [a1, a2]], [B, [b1, b2, b3]]]), cursor, 10).itens)).toEqual([a2, b2, b3]);
    // O b1 (o último visto) foi apagado: o b2 subiu para o lugar dele e não é pulado; nada recomeça.
    expect(ids(loteDoReels(fila([[A, [a1, a2]], [B, [b2]]]), cursor, 10).itens)).toEqual([b2, a2]);
    // A rifa do cursor saiu do ar: segue da rodada seguinte.
    expect(ids(loteDoReels(fila([[A, [a1, a2]]]), cursor, 10).itens)).toEqual([a2]);
    // Passou do fim: vazio, nunca o começo.
    expect(loteDoReels(antes, { rodada: 5, chave: A, video: a1 }, 10).itens).toEqual([]);
  });

  it("cursor fora do formato é o começo", () => {
    expect(cursorDoReels("x")).toBeNull();
    expect(cursorDoReels(`1:${A}`)).toBeNull();
    expect(cursorDoReels(`1:${A}:${B}`)).toEqual({ rodada: 1, chave: A, video: B });
  });

  it("vídeo do carrossel e do Reels são vídeo; foto e banner não", () => {
    expect(ehVideo("video") && ehVideo("reels")).toBe(true);
    expect(ehVideo("photo") || ehVideo("banner")).toBe(false);
  });
});
