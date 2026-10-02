import { describe, expect, it } from "vitest";
import { promises as fs } from "node:fs";
import { PEDACO_BYTES, Vagas, comArquivoTemporarioEmPedacos, limiteDeFfmpeg } from "../server/services/videoProcessor";

describe("ffmpeg: limite de execuções simultâneas", () => {
  it("o padrão é 2 e o valor do ambiente só vale se for razoável", () => {
    expect(limiteDeFfmpeg("")).toBe(2);
    expect(limiteDeFfmpeg("4")).toBe(4);
    expect(limiteDeFfmpeg("0")).toBe(2);
    expect(limiteDeFfmpeg("999")).toBe(2);
    expect(limiteDeFfmpeg("abc")).toBe(2);
  });

  it("nunca passa do máximo e o resto espera a vez, na ordem", async () => {
    const vagas = new Vagas(2);
    let ao_mesmo_tempo = 0;
    let pico = 0;
    const ordem: number[] = [];
    const tarefa = (n: number) =>
      vagas.rodar(async () => {
        ao_mesmo_tempo++;
        pico = Math.max(pico, ao_mesmo_tempo);
        ordem.push(n);
        await new Promise((r) => setTimeout(r, 10));
        ao_mesmo_tempo--;
        return n;
      });
    const r = await Promise.all([1, 2, 3, 4, 5].map(tarefa));
    expect(r).toEqual([1, 2, 3, 4, 5]);
    expect(pico).toBe(2);
    expect(ordem).toEqual([1, 2, 3, 4, 5]);
    expect(vagas.usando).toBe(0);
    expect(vagas.esperando).toBe(0);
  });

  it("tarefa que falha devolve a vaga", async () => {
    const vagas = new Vagas(1);
    await expect(vagas.rodar(async () => Promise.reject(new Error("falhou")))).rejects.toThrow("falhou");
    expect(await vagas.rodar(async () => "ok")).toBe("ok");
    expect(vagas.usando).toBe(0);
  });
});

describe("vídeo do bucket vem em pedaços", () => {
  it("monta o arquivo igual ao original, sem pedir mais que um pedaço por vez, e apaga no fim", async () => {
    const total = PEDACO_BYTES * 2 + 123;
    const origem = Buffer.alloc(total);
    for (let i = 0; i < total; i += 997) origem[i] = i % 251;
    const pedidos: number[] = [];
    let caminho = "";
    const bytes = await comArquivoTemporarioEmPedacos(
      total,
      async (offset, length) => {
        pedidos.push(length);
        return origem.subarray(offset, offset + length);
      },
      ".mp4",
      async (arquivo) => {
        caminho = arquivo;
        return fs.readFile(arquivo);
      },
    );
    expect(bytes.equals(origem)).toBe(true);
    expect(Math.max(...pedidos)).toBeLessThanOrEqual(PEDACO_BYTES);
    expect(pedidos.length).toBe(3);
    await expect(fs.access(caminho)).rejects.toThrow();
  });
});
