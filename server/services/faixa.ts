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

/** Um arquivo do banco lido aos pedaços: o tipo, o tamanho e como ler uma faixa. */
export interface ArquivoEmFaixas {
  mime: string;
  total: number;
  ler(ini: number, tamanho: number): Promise<Buffer>;
}

/**
 * Como `enviarComFaixa`, mas lê do banco **só a faixa pedida**: o Safari pede
 * o vídeo em vários pedaços por play, e trazer o arquivo inteiro do Postgres a
 * cada pedaço multiplicaria a memória pelo número de visitas.
 */
export async function enviarFaixaDoBanco(req: Request, res: Response, a: ArquivoEmFaixas) {
  res.type(a.mime);
  const video = a.mime.startsWith("video/");
  res.setHeader("Accept-Ranges", video ? "bytes" : "none");
  const faixa = video ? /^bytes=(\d*)-(\d*)$/.exec(String(req.headers.range ?? "")) : null;
  if (!faixa) return void res.send(await a.ler(0, a.total));
  const total = a.total;
  let ini = faixa[1] ? Number(faixa[1]) : total - Number(faixa[2] || 0);
  let fim = faixa[1] && faixa[2] ? Number(faixa[2]) : total - 1;
  ini = Math.max(0, ini);
  fim = Math.min(fim, total - 1);
  if (!(ini <= fim)) {
    res.setHeader("Content-Range", `bytes */${total}`);
    return void res.status(416).end();
  }
  const pedaco = await a.ler(ini, fim - ini + 1);
  res.status(206).setHeader("Content-Range", `bytes ${ini}-${fim}/${total}`);
  res.send(pedaco);
}
