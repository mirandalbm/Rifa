/**
 * Reels: a tela cheia vertical que passa de um vídeo de rifa ao outro. As
 * regras ficam aqui, puras, porque quem escolhe a lista é o servidor e quem
 * desenha é a tela — e os dois precisam concordar sobre o que é um reels.
 *
 * Reels é vídeo **de uma rifa** (até 3 minutos, em pé), nunca vídeo avulso:
 * a rifa que o vídeo mostra é a rifa que se compra ali. Vem de dois lugares:
 * o vídeo do carrossel da rifa que é reels e em pé, e o vídeo que a
 * organização publica **só no Reels** (papel `reels`, fora do carrossel).
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

/** Quantos vídeos só do Reels cada rifa pode ter no ar. */
export const REELS_POR_RIFA = 10;

/** Papéis de mídia que são vídeo (pôster, HLS e medida de vídeo valem para os dois). */
export function ehVideo(role: string): boolean {
  return role === "video" || role === "reels";
}

/**
 * Os vídeos de uma rifa no Reels: os publicados só no Reels e o do carrossel
 * que é reels e em pé, **do mais antigo ao mais novo**. A ordem é fixa de
 * propósito: o vídeo novo só entra no fim, e quem está rolando não perde nem
 * revê o que já estava na fila (`loteDoReels`).
 */
export function videosDoReels<T extends PecaParaReels & { id: string; criadaEm?: string | Date | null }>(pecas: T[]): T[] {
  const soReels = pecas.filter((p) => p.role === "reels" && p.url && videoEmPe(p));
  const doCarrossel = videoDoReels(pecas.filter((p) => p.role !== "reels"));
  return [...soReels, ...(doCarrossel ? [doCarrossel] : [])].sort(
    (a, b) => new Date(a.criadaEm ?? 0).getTime() - new Date(b.criadaEm ?? 0).getTime() || a.id.localeCompare(b.id),
  );
}

export interface ItemDoReels<R, V> {
  id: string;
  /** A rifa (a chave do cursor) e a posição dela na fila do dia. */
  chave: string;
  posicao: number;
  /** A volta da fila: o 1º vídeo de cada rifa, depois o 2º… */
  rodada: number;
  rifa: R;
  video: V;
}

/**
 * A fila da tela: um vídeo de cada rifa por rodada, na ordem das rifas (a da
 * região de quem olha primeiro). Sem isso, a rifa com dez reels ocuparia dez
 * telas seguidas antes da próxima rifa aparecer.
 */
export function itensDoReels<R, V extends { id: string }>(rifas: { chave: string; rifa: R; videos: V[] }[]): ItemDoReels<R, V>[] {
  const itens: ItemDoReels<R, V>[] = [];
  const rodadas = Math.max(0, ...rifas.map((r) => r.videos.length));
  for (let rodada = 0; rodada < rodadas; rodada++) {
    rifas.forEach((r, posicao) => {
      const v = r.videos[rodada];
      if (v) itens.push({ id: v.id, chave: r.chave, posicao, rodada, rifa: r.rifa, video: v });
    });
  }
  return itens;
}

/** O cursor do Reels: `<rodada>:<rifa>:<vídeo>` do último item visto. */
const CURSOR_DO_REELS = /^(\d{1,4}):([0-9a-f-]{36}):([0-9a-f-]{36})$/i;

export interface CursorDoReels {
  rodada: number;
  chave: string;
  video: string;
}

export function cursorDoReels(v: unknown): CursorDoReels | null {
  const m = typeof v === "string" ? CURSOR_DO_REELS.exec(v) : null;
  return m ? { rodada: Number(m[1]), chave: m[2].toLowerCase(), video: m[3].toLowerCase() } : null;
}

/**
 * O lote depois do cursor, pela **posição** (rodada e rifa), nunca pelo
 * índice do vídeo numa lista recalculada: o vídeo apagado ou a rifa que saiu
 * do ar não fazem a fila recomeçar do começo (repetiria tudo). Nunca repete:
 * os vídeos de uma rifa só andam para rodadas anteriores quando um sai, e o
 * novo entra no fim. Se outro vídeo ocupa agora o lugar do cursor (o visto
 * foi apagado), ele ainda não foi visto e entra. Rifa que sumiu: segue da
 * rodada seguinte (pode pular um item, nunca repetir).
 */
export function loteDoReels<R, V>(
  itens: ItemDoReels<R, V>[],
  cursor: CursorDoReels | null,
  limite: number,
): { itens: ItemDoReels<R, V>[]; proximo: string | null } {
  let inicio = 0;
  if (cursor) {
    const daRifa = itens.find((i) => i.chave === cursor.chave);
    inicio = itens.findIndex((i) => {
      if (!daRifa) return i.rodada > cursor.rodada;
      if (i.rodada !== cursor.rodada) return i.rodada > cursor.rodada;
      return i.posicao > daRifa.posicao || (i.posicao === daRifa.posicao && i.id.toLowerCase() !== cursor.video);
    });
    if (inicio < 0) inicio = itens.length;
  }
  const lote = itens.slice(inicio, inicio + limite);
  const ultimo = lote[lote.length - 1];
  return {
    itens: lote,
    proximo: inicio + limite < itens.length && ultimo ? `${ultimo.rodada}:${ultimo.chave}:${ultimo.id}` : null,
  };
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
