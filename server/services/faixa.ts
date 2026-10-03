import type { Request, Response } from "express";

/**
 * Envia um arquivo do banco respeitando `Range` quando é vídeo: o Safari não
 * toca vídeo sem a resposta 206. Imagem vai inteira. Faixa impossível é 416.
 */
export function enviarComFaixa(req: Request, res: Response, bytes: Buffer, mime: string) {
  res.type(mime);
  const faixa = mime.startsWith("video/") ? /^bytes=(\d*)-(\d*)$/.exec(String(req.headers.range ?? "")) : null;
  res.setHeader("Accept-Ranges", mime.startsWith("video/") ? "bytes" : "none");
  if (!faixa) return void res.send(bytes);
  const total = bytes.length;
  let ini = faixa[1] ? Number(faixa[1]) : total - Number(faixa[2] || 0);
  let fim = faixa[1] && faixa[2] ? Number(faixa[2]) : total - 1;
  ini = Math.max(0, ini);
  fim = Math.min(fim, total - 1);
  if (!(ini <= fim)) {
    res.setHeader("Content-Range", `bytes */${total}`);
    return void res.status(416).end();
  }
  res.status(206).setHeader("Content-Range", `bytes ${ini}-${fim}/${total}`);
  res.send(bytes.subarray(ini, fim + 1));
}
