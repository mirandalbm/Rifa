/**
 * Reels: a tela cheia vertical que passa de um vídeo de rifa ao outro. As
 * regras ficam aqui, puras, porque quem escolhe a lista é o servidor e quem
 * desenha é a tela — e os dois precisam concordar sobre o que é um reels.
 *
 * Reels é **vídeo da publicação da rifa** (até 3 minutos, em pé), nunca
 * vídeo avulso: a rifa que o vídeo mostra é a rifa que se compra ali.
 */
import { formatoDoVideo } from "./publicacao";

/** Quantos vão por vez; a tela pede o próximo ao chegar perto do fim. */
export const REELS_LOTE = 6;
export const REELS_LOTE_MAX = 12;

export interface PecaParaReels {
  role: string;
  url: string;
  durationS?: number | null;
  formato?: string | null;
  largura?: number | null;
  altura?: number | null;
}

/**
 * Vídeo "em pé": mais alto que largo (retrato 4:5 ou vertical 9:16). A razão
 * vem do que o servidor mediu — nunca do navegador. Sem medida, não entra:
 * esticar um vídeo deitado numa tela em pé cortaria o assunto.
 */
export function videoEmPe(p: Pick<PecaParaReels, "largura" | "altura">): boolean {
  const { largura, altura } = p;
  if (!largura || !altura || largura <= 0 || altura <= 0) return false;
  return largura / altura <= 0.85;
}

/**
 * O vídeo que a rifa mostra no Reels: o primeiro da publicação que é reels
 * (até 3 min) e está em pé. Rifa sem um assim não entra na tela.
 */
export function videoDoReels<T extends PecaParaReels>(pecas: T[]): T | null {
  for (const p of pecas) {
    if (p.role !== "video" || !p.url) continue;
    const formato = p.formato ?? (p.durationS ? formatoDoVideo(p.durationS) : null);
    if (formato !== "reels") continue;
    if (videoEmPe(p)) return p;
  }
  return null;
}

export function limiteDoLote(pedido: unknown): number {
  const n = Number(pedido);
  if (!Number.isInteger(n) || n < 1) return REELS_LOTE;
  return Math.min(n, REELS_LOTE_MAX);
}

/**
 * O lote que vem **depois** de um item: a lista já está na ordem do dia
 * (região e destaque) e a posição é achada pelo id do último item visto —
 * nunca por número de página, que repetiria item quando entra rifa nova.
 * Id que sumiu da lista (a rifa saiu do ar) recomeça do começo.
 */
export function loteDepoisDe<T extends { id: string }>(
  lista: T[],
  depois: string | null | undefined,
  limite: number,
): { itens: T[]; proximo: string | null } {
  const inicio = depois ? lista.findIndex((x) => x.id === depois) + 1 : 0;
  const itens = lista.slice(inicio, inicio + limite);
  const temMais = inicio + limite < lista.length;
  return { itens, proximo: temMais && itens.length ? itens[itens.length - 1].id : null };
}

/** As duas abas do alto da tela: todos ou só quem a pessoa segue. */
export const ABAS_DO_REELS = { reels: "Reels", seguindo: "Seguindo" } as const;
export type AbaDoReels = keyof typeof ABAS_DO_REELS;

export function abaDoReels(v: unknown): AbaDoReels {
  return v === "seguindo" ? "seguindo" : "reels";
}
