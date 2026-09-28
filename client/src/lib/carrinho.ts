import { useSyncExternalStore } from "react";
import { CARRINHO_MAX_ITENS, juntarCartela, limparCarrinho, type ItemDoCarrinho } from "@shared/carrinho";

/**
 * O carrinho fica neste aparelho, como a região e o tema. Guarda rifa e
 * quantidade — nunca número, nunca preço: a cota só é tomada na compra e o
 * preço é sempre do servidor. Perder o armazenamento só esvazia o carrinho.
 */
const CHAVE = "rifa.carrinho";
const EVENTO = "rifa:carrinho";

let cache: ItemDoCarrinho[] | null = null;

export function lerCarrinho(): ItemDoCarrinho[] {
  if (cache) return cache;
  try {
    cache = limparCarrinho(JSON.parse(localStorage.getItem(CHAVE) ?? "[]"));
  } catch {
    cache = [];
  }
  return cache;
}

function gravar(itens: ItemDoCarrinho[]) {
  cache = limparCarrinho(itens);
  try {
    if (cache.length) localStorage.setItem(CHAVE, JSON.stringify(cache));
    else localStorage.removeItem(CHAVE);
  } catch {
    /* sem armazenamento, o carrinho vale só nesta visita */
  }
  window.dispatchEvent(new Event(EVENTO));
}

export function noCarrinho(slug: string) {
  return lerCarrinho().some((i) => i.slug === slug);
}

/**
 * Põe no carrinho (ou troca a quantidade). Com a cartela escolhida, guarda os
 * números (sugestão — a reserva é só na compra); mudar a quantidade depois
 * descarta a cartela. Devolve falso se o carrinho está cheio.
 */
export function porNoCarrinho(slug: string, quantidade: number, numeros?: number[]): boolean {
  const atual = lerCarrinho();
  const ja = atual.some((i) => i.slug === slug);
  if (!ja && atual.length >= CARRINHO_MAX_ITENS) return false;
  const item = numeros && numeros.length === quantidade ? { slug, quantidade, numeros } : { slug, quantidade };
  gravar(ja ? atual.map((i) => (i.slug === slug ? item : i)) : [...atual, item]);
  return true;
}

/**
 * Soma mais uma cartela à rifa no carrinho (`juntarCartela`): a pessoa pode
 * pôr quantas cartelas quiser da mesma rifa, até o máximo por pedido.
 */
export function juntarNoCarrinho(
  slug: string,
  numeros: number[],
  maximo?: number,
): { ok: true; novos: number; total: number } | { ok: false; motivo: "cheio" | "repetida" | "maximo" } {
  const itens = lerCarrinho();
  const atual = itens.find((i) => i.slug === slug);
  if (!atual && itens.length >= CARRINHO_MAX_ITENS) return { ok: false, motivo: "cheio" };
  const r = juntarCartela(atual, slug, numeros, maximo);
  if (!r.ok) return r;
  gravar(atual ? itens.map((i) => (i.slug === slug ? r.item : i)) : [...itens, r.item]);
  return { ok: true, novos: r.novos, total: r.item.quantidade };
}

/** O aviso de `juntarNoCarrinho`, o mesmo na página da rifa e na janela do "+". */
export function avisoDaJuntada(r: ReturnType<typeof juntarNoCarrinho>, maximo?: number): { ok: boolean; texto: string } {
  if (r.ok) {
    return {
      ok: true,
      texto:
        r.novos === r.total
          ? `Cartela no carrinho (${r.total} números).`
          : `Cartela somada: ${r.total} números desta rifa no carrinho.`,
    };
  }
  if (r.motivo === "cheio") return { ok: false, texto: "O carrinho já tem 20 rifas. Pague ou tire alguma antes." };
  if (r.motivo === "repetida") return { ok: false, texto: "Estes números já estão no carrinho." };
  return { ok: false, texto: `Passa do máximo de ${maximo ?? "cotas"} números por pedido desta rifa.` };
}

/** Alguém levou um número da cartela: o item fica, e o número passa a ser sorteado na compra. */
export function esquecerCartela(slug: string) {
  gravar(lerCarrinho().map((i) => (i.slug === slug ? { slug: i.slug, quantidade: i.quantidade } : i)));
}

export function tirarDoCarrinho(slug: string) {
  gravar(lerCarrinho().filter((i) => i.slug !== slug));
}

export function esvaziarCarrinho() {
  gravar([]);
}

function assinar(avisar: () => void) {
  const mudouEmOutraAba = (e: StorageEvent) => {
    if (e.key !== CHAVE) return;
    cache = null;
    avisar();
  };
  window.addEventListener(EVENTO, avisar);
  window.addEventListener("storage", mudouEmOutraAba);
  return () => {
    window.removeEventListener(EVENTO, avisar);
    window.removeEventListener("storage", mudouEmOutraAba);
  };
}

/** Os itens do carrinho, atualizados quando mudam (nesta aba ou em outra). */
export function useCarrinho(): ItemDoCarrinho[] {
  return useSyncExternalStore(assinar, lerCarrinho, () => []);
}
