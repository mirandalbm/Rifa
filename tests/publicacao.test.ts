import { describe, expect, it } from "vitest";
import {
  LEGENDA_MAX,
  MAX_CARROSSEL,
  REELS_MAX_S,
  VIDEO_MAX_S,
  cabeNoCarrossel,
  contadorCurto,
  duracao,
  formatoDoVideo,
  problemaNaLegenda,
} from "@shared/publicacao";
import { problemaNoComentario } from "@shared/comentarios";

describe("vídeo da publicação", () => {
  it("até 3 min é reels, até 15 min é feed, mais que isso não entra", () => {
    expect(REELS_MAX_S).toBe(180);
    expect(VIDEO_MAX_S).toBe(900);
    expect(formatoDoVideo(30)).toBe("reels");
    expect(formatoDoVideo(180)).toBe("reels");
    expect(formatoDoVideo(181)).toBe("feed");
    expect(formatoDoVideo(900)).toBe("feed");
    expect(formatoDoVideo(901)).toBeNull();
    expect(formatoDoVideo(0)).toBeNull();
  });
  it("mostra a duração em m:ss (e h:mm:ss)", () => {
    expect(duracao(45)).toBe("0:45");
    expect(duracao(180)).toBe("3:00");
    expect(duracao(3725)).toBe("1:02:05");
  });
});

describe("carrossel", () => {
  it("até 10 peças, contando o banner", () => {
    expect(MAX_CARROSSEL).toBe(10);
    expect(cabeNoCarrossel(9)).toBe(true);
    expect(cabeNoCarrossel(10)).toBe(false);
  });
});

describe("legenda", () => {
  it("a régua do comentário: sem link e sem telefone; vazia apaga", () => {
    expect(problemaNaLegenda("")).toBeNull();
    expect(problemaNaLegenda("Moto 0 km, sorteio pela Loteria Federal! #rifa")).toBeNull();
    expect(problemaNaLegenda("compre em www.outrosite.com")).toMatch(/^A legenda não pode ter link/);
    expect(problemaNaLegenda("chama no 11 98765-4321")).toMatch(/^A legenda não pode ter telefone/);
    expect(problemaNaLegenda("x".repeat(LEGENDA_MAX + 1))).toMatch(/passa de/);
  });
  it("o comentário segue com as mesmas mensagens de antes", () => {
    expect(problemaNoComentario("veja www.golpe.com")).toMatch(/^Comentário não pode ter link/);
    expect(problemaNoComentario("11 98765-4321")).toMatch(/^Comentário não pode ter telefone/);
  });
});

describe("contadores", () => {
  it("como no Instagram: número inteiro até 9.999, depois mil e mi", () => {
    expect(contadorCurto(337)).toBe("337");
    expect(contadorCurto(9999)).toBe("9.999");
    expect(contadorCurto(12_345)).toBe("12,3 mil");
    expect(contadorCurto(1_234_567)).toBe("1,2 mi");
  });
});
