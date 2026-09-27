import { useSyncExternalStore } from "react";
import { CARRINHO_MAX_ITENS, limparCarrinho, type ItemDoCarrinho } from "@shared/carrinho";

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

/** Põe no carrinho (ou troca a quantidade). Devolve falso se o carrinho está cheio. */
export function porNoCarrinho(slug: string, quantidade: number): boolean {
  const atual = lerCarrinho();
  const ja = atual.some((i) => i.slug === slug);
  if (!ja && atual.length >= CARRINHO_MAX_ITENS) return false;
  gravar(ja ? atual.map((i) => (i.slug === slug ? { slug, quantidade } : i)) : [...atual, { slug, quantidade }]);
  return true;
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
