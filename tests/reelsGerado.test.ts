import { describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import {
  FIGURINHAS_DO_REELS_GERADO,
  QUADRO_DO_REELS_GERADO,
  REELS_GERADO_FOTOS_MAX,
  TRANSICAO_S,
  argsDoReelsGerado,
  duracaoDoReelsGerado,
  problemaParaGerarReels,
  segundosPorFoto,
  textosDoReelsGerado,
} from "../shared/reelsGerado";
import { validarFigurinhas } from "../shared/figurinhasStory";
import { formatoDoVideo } from "../shared/publicacao";
import { videoEmPe } from "../shared/reels";
import { faixaDoReelsGerado } from "../server/services/arteDesenho";
import { fazerReelsGerado } from "../server/trabalhos/reelsGerado";
import { ErroDefinitivo } from "../server/trabalhos/tipos";

const RIFA = { status: "published", demonstracao: false, travada: false, sorteada: false };

describe("reels gerado: regras", () => {
  it("só a rifa publicada, de verdade, no ar e ainda não sorteada", () => {
    expect(problemaParaGerarReels(RIFA)).toBeNull();
    expect(problemaParaGerarReels({ ...RIFA, status: "draft" })).toMatch(/publicada/);
    expect(problemaParaGerarReels({ ...RIFA, demonstracao: true })).toMatch(/demonstração/);
    expect(problemaParaGerarReels({ ...RIFA, travada: true })).toMatch(/travada/);
    expect(problemaParaGerarReels({ ...RIFA, sorteada: true })).toMatch(/sorteada/);
  });

  it("a duração fica dentro do Reels, com as transições sobrepostas", () => {
    expect(duracaoDoReelsGerado(1)).toBe(6);
    expect(duracaoDoReelsGerado(2)).toBe(2 * 4.5 - TRANSICAO_S);
    expect(duracaoDoReelsGerado(REELS_GERADO_FOTOS_MAX)).toBe(REELS_GERADO_FOTOS_MAX * 3.5 - (REELS_GERADO_FOTOS_MAX - 1) * TRANSICAO_S);
    for (let n = 1; n <= REELS_GERADO_FOTOS_MAX; n++) {
      expect(formatoDoVideo(duracaoDoReelsGerado(n))).toBe("reels");
      expect(segundosPorFoto(n)).toBeGreaterThan(TRANSICAO_S * 2);
    }
    expect(videoEmPe({ largura: QUADRO_DO_REELS_GERADO.largura, altura: QUADRO_DO_REELS_GERADO.altura })).toBe(true);
  });

  it("o texto gravado nunca leva a data (ela muda no adiamento)", () => {
    const t = textosDoReelsGerado({ premio: "Moto 0 km", precoCents: 1000, metodoApuracao: "federal_direta", autorizacao: "SEI 123" });
    expect(t.titulo).toBe("Moto 0 km");
    expect(t.destaque).toMatch(/^R\$\s?10,00 a cota$/);
    expect(t.linhas).toEqual(["Sorteio pela Loteria Federal", "Autorizada SPA/MF nº SEI 123"]);
    expect(JSON.stringify(t)).not.toMatch(/\d{2}\/\d{2}|às \d/);
    expect(textosDoReelsGerado({ premio: "X", precoCents: 500, metodoApuracao: "globo", autorizacao: null }).linhas).toEqual(["Sorteio no globo da plataforma"]);
  });

  it("as figurinhas que o vídeo leva passam na régua das figurinhas", () => {
    const f = validarFigurinhas(FIGURINHAS_DO_REELS_GERADO.map((x) => ({ ...x })), { temRifa: true });
    expect(f.map((x) => x.tipo)).toEqual(["contagem", "comprar"]);
  });

  it("a faixa é contorno, nunca <text> com o texto da rifa", () => {
    const svg = faixaDoReelsGerado({ titulo: "<script>alert(1)</script> & Moto", destaque: "R$ 10,00 a cota", linhas: ["Sorteio pela Loteria Federal"] }, "#00873e");
    expect(svg).not.toContain("<text");
    expect(svg).not.toContain("<script");
    expect(svg).toContain(`width="${QUADRO_DO_REELS_GERADO.largura}"`);
    expect(svg).toContain('fill="#00873e"');
  });

  it("os argumentos: uma entrada por foto e a faixa, as transições e sem som", () => {
    const a = argsDoReelsGerado(["a.jpg", "b.jpg", "c.jpg"], "faixa.png", "saida.mp4");
    expect(a.filter((x) => x === "-i")).toHaveLength(4);
    const filtro = a[a.indexOf("-filter_complex") + 1];
    expect(filtro.match(/xfade/g)).toHaveLength(2);
    expect(filtro).toContain("[3:v]overlay");
    expect(a).toContain("-an");
    expect(a).toContain("+faststart");
    expect(a.at(-1)).toBe("saida.mp4");
    expect(() => argsDoReelsGerado([], "f.png", "s.mp4")).toThrow();
  });
});

const temFfmpeg = spawnSync("ffmpeg", ["-version"]).status === 0;

async function foto(cor: string): Promise<Buffer> {
  const { largura, altura } = QUADRO_DO_REELS_GERADO;
  return sharp({ create: { width: largura, height: altura, channels: 3, background: cor } }).jpeg().toBuffer();
}

describe("reels gerado: o trabalho", () => {
  it("sem faixa ou sem foto, o erro é definitivo (repetir não adianta)", async () => {
    await expect(fazerReelsGerado({ id: "x", tipo: "reels_gerado", dados: {}, campaignId: null, tentativas: 1 }, [{ nome: "foto-0.jpg", bytes: Buffer.from("x") }])).rejects.toBeInstanceOf(ErroDefinitivo);
    await expect(fazerReelsGerado({ id: "x", tipo: "reels_gerado", dados: {}, campaignId: null, tentativas: 1 }, [{ nome: "faixa.png", bytes: Buffer.from("x") }])).rejects.toBeInstanceOf(ErroDefinitivo);
    // Nome fora do formato não vira caminho nem foto.
    await expect(fazerReelsGerado({ id: "x", tipo: "reels_gerado", dados: {}, campaignId: null, tentativas: 1 }, [{ nome: "../foto-0.jpg", bytes: Buffer.from("x") }, { nome: "faixa.png", bytes: Buffer.from("x") }])).rejects.toBeInstanceOf(ErroDefinitivo);
  });

  it.skipIf(!temFfmpeg)("com o ffmpeg de verdade: três fotos viram um vídeo em pé, sem som, da duração certa", async () => {
    const faixa = await sharp(Buffer.from(faixaDoReelsGerado({ titulo: "Moto 0 km", destaque: "R$ 10,00 a cota", linhas: ["Sorteio pela Loteria Federal"] }, "#00873e"))).png().toBuffer();
    const entradas = [
      { nome: "foto-1.jpg", bytes: await foto("#2255aa") },
      { nome: "foto-0.jpg", bytes: await foto("#aa3322") },
      { nome: "foto-2.jpg", bytes: await foto("#22aa55") },
      { nome: "faixa.png", bytes: faixa },
    ];
    const r = await fazerReelsGerado({ id: "x", tipo: "reels_gerado", dados: {}, campaignId: null, tentativas: 1 }, entradas);
    expect(r.saidas).toHaveLength(1);
    expect(r.resultado?.fotos).toBe(3);
    const pasta = await fs.mkdtemp(path.join(os.tmpdir(), "teste-reels-"));
    try {
      const mp4 = path.join(pasta, "r.mp4");
      await fs.writeFile(mp4, r.saidas[0].bytes);
      const p = spawnSync("ffprobe", ["-v", "error", "-show_entries", "stream=codec_type,width,height:format=duration", "-of", "json", mp4], { encoding: "utf8" });
      const j = JSON.parse(p.stdout) as { streams: { codec_type: string; width?: number; height?: number }[]; format: { duration: string } };
      expect(j.streams.map((s) => s.codec_type)).toEqual(["video"]);
      expect(j.streams[0].width).toBe(1080);
      expect(j.streams[0].height).toBe(1920);
      expect(Number(j.format.duration)).toBeCloseTo(duracaoDoReelsGerado(3), 1);
    } finally {
      await fs.rm(pasta, { recursive: true, force: true });
    }
  }, 120_000);
});
