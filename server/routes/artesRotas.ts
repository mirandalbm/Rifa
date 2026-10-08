/**
 * As duas portas das artes prontas: o painel (`/api/admin/campaigns/:id/artes`,
 * no recorte de `assertCampaignInScope`) e o kit do afiliado
 * (`/api/affiliate/artes/:slug`, só onde ele recebe comissão). A regra de
 * cada porta fica no router dela; aqui mora o que as duas fazem igual.
 */
import type { Response } from "express";
import {
  FORMATOS_DA_ARTE,
  FORMATOS_DA_ARTE_LISTA,
  ROTULO_DA_ARTE,
  interpretarFormatoDaArte,
  interpretarTipoDeArte,
  nomeDoArquivoDaArte,
} from "@shared/artes";
import { hit } from "../services/antifraude";
import { artesDaRifa, desenharArte, type RifaDaArte } from "../services/artes";

/** Desenhar custa CPU: 60 artes a cada 10 min por pessoa. */
export const ARTES_POR_JANELA = { minutos: 10, limite: 60 } as const;

/**
 * A lista que a tela mostra: as artes que a rifa tem agora, os formatos e o
 * link que vai no QR (o mesmo que a tela copia).
 */
export function listaDeArtes(r: RifaDaArte, link: string) {
  return {
    slug: r.slug,
    link,
    artes: artesDaRifa(r).map((tipo) => ({ tipo, rotulo: ROTULO_DA_ARTE[tipo] })),
    formatos: FORMATOS_DA_ARTE_LISTA.map((f) => ({ formato: f, rotulo: FORMATOS_DA_ARTE[f].rotulo })),
  };
}

/**
 * Responde a arte em JPEG. Tipo ou formato fora da lista, ou arte que a
 * rifa não tem agora (demonstração, travada, resultado antes do sorteio),
 * é 404 — o mesmo de rifa inexistente.
 */
export async function enviarArte(
  res: Response,
  r: RifaDaArte,
  tipoBruto: unknown,
  formatoBruto: unknown,
  url: string,
  quem: string,
) {
  const tipo = interpretarTipoDeArte(tipoBruto);
  const formato = interpretarFormatoDaArte(formatoBruto);
  if (!tipo || !formato || !artesDaRifa(r).includes(tipo)) return res.status(404).json({ message: "Arte não encontrada." });
  if ((await hit(`arte:${quem}`, ARTES_POR_JANELA.minutos, ARTES_POR_JANELA.limite)).excedeu) {
    return res.status(429).json({ message: "Muitas artes em pouco tempo. Espere alguns minutos." });
  }
  const jpeg = await desenharArte({ rifa: r, tipo, formato, url });
  // Só o navegador de quem pediu guarda, pelo mesmo minuto da guarda do servidor.
  res.setHeader("Cache-Control", "private, max-age=60");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Content-Disposition", `inline; filename="${nomeDoArquivoDaArte(r.slug, tipo, formato)}"`);
  res.type("image/jpeg").send(jpeg);
}
