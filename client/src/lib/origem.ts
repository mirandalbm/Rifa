import { validarOrigem, type Origem } from "@shared/resultados";

/**
 * De onde a pessoa chegou à rifa, para o painel de resultados. Fica na aba
 * (sessionStorage): o último toque vale — clicou no banner e depois no
 * story, a venda é do story. Chegou por anúncio (UTM, gclid, fbclid), fica
 * "anúncio" até a aba fechar, porque é isso que o organizador quer medir.
 * É estatística: perder não estraga nada, e nunca decide dinheiro.
 */
const CHAVE = "rifa.origem";

export function marcarOrigem(origem: Origem) {
  try {
    if (sessionStorage.getItem(CHAVE) === "anuncio") return;
    sessionStorage.setItem(CHAVE, origem);
  } catch {
    // armazenamento bloqueado: a venda sai como "direto"
  }
}

export function lerOrigem(): Origem | undefined {
  try {
    return validarOrigem(sessionStorage.getItem(CHAVE)) ?? undefined;
  } catch {
    return undefined;
  }
}

/** Na entrada do site: veio de anúncio? */
export function marcarAnuncioPelaUrl(busca = window.location.search) {
  const p = new URLSearchParams(busca);
  if (["utm_source", "utm_medium", "utm_campaign", "gclid", "fbclid", "ttclid"].some((k) => p.has(k))) {
    try {
      sessionStorage.setItem(CHAVE, "anuncio");
    } catch {
      // idem
    }
  }
}
