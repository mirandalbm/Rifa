/**
 * O trabalho `reels_gerado` (Fase F, regras em `shared/reelsGerado.ts`): as
 * fotos já cortadas no 9:16 e a faixa de texto chegam pelo banco; aqui o
 * `ffmpeg` monta o vídeo num diretório temporário, e o MP4 volta pelo banco.
 * Roda **só no trabalhador**, nunca no processo web.
 *
 * Os nomes dos arquivos não viram caminho: cada entrada é gravada com um nome
 * nosso (`f0.jpg`, `faixa.png`), na ordem das fotos.
 */
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { REELS_GERADO_FOTOS_MAX, argsDoReelsGerado } from "@shared/reelsGerado";
import { SAIDA_DO_TRABALHO_MAX_BYTES } from "@shared/fila";
import { rodarAteOFim } from "../services/videoProcessor";
import { ErroDefinitivo, type FazerTrabalho } from "./tipos";

/** Quanto o `ffmpeg` pode levar com um vídeo (6 fotos levam menos de 1 min numa CPU). */
export const PRAZO_DO_REELS_GERADO_MS = 5 * 60_000;

const FOTO = /^foto-(\d{1,2})\.jpg$/;

export const fazerReelsGerado: FazerTrabalho = async (_t, entradas) => {
  const fotos = entradas
    .map((a) => ({ a, n: FOTO.exec(a.nome)?.[1] }))
    .filter((x): x is { a: (typeof entradas)[number]; n: string } => x.n !== undefined)
    .sort((x, y) => Number(x.n) - Number(y.n))
    .slice(0, REELS_GERADO_FOTOS_MAX)
    .map((x) => x.a);
  const faixa = entradas.find((a) => a.nome === "faixa.png");
  if (!fotos.length || !faixa) throw new ErroDefinitivo("O trabalho chegou sem as fotos ou sem a faixa.");

  const pasta = await fs.mkdtemp(path.join(os.tmpdir(), "rifa-reels-"));
  try {
    const caminhos: string[] = [];
    for (let i = 0; i < fotos.length; i++) {
      const c = path.join(pasta, `f${i}.jpg`);
      await fs.writeFile(c, fotos[i].bytes);
      caminhos.push(c);
    }
    const caminhoDaFaixa = path.join(pasta, "faixa.png");
    await fs.writeFile(caminhoDaFaixa, faixa.bytes);
    const saida = path.join(pasta, "reels.mp4");
    const bin = process.env.FFMPEG_PATH || "ffmpeg";
    if (!(await rodarAteOFim(bin, argsDoReelsGerado(caminhos, caminhoDaFaixa, saida), PRAZO_DO_REELS_GERADO_MS))) {
      throw new Error("O ffmpeg não conseguiu montar o vídeo.");
    }
    const { size } = await fs.stat(saida);
    if (size === 0) throw new Error("O vídeo saiu vazio.");
    if (size > SAIDA_DO_TRABALHO_MAX_BYTES) throw new ErroDefinitivo("O vídeo saiu grande demais.");
    return { saidas: [{ nome: "reels.mp4", bytes: await fs.readFile(saida) }], resultado: { bytes: size, fotos: fotos.length } };
  } finally {
    await fs.rm(pasta, { recursive: true, force: true }).catch(() => {});
  }
};
