/**
 * O gesto que abre a tela do sorteio no Início (só no celular): deslizar o
 * dedo para a direita. Regras puras — o componente só mede o toque.
 *
 * - **É um deslizar, não uma rolagem**: o movimento é sobretudo de lado
 *   (`|dy| ≤ dx × 0,5`) e passa de `DISTANCIA_PARA_ABRIR`.
 * - **Não rouba o gesto de quem desliza de lado**: carrossel, faixa de banners
 *   ou de stories que ainda pode voltar (rolado para a direita) fica com o
 *   toque; na primeira peça, voltar não faz nada lá, e aí o gesto abre o
 *   sorteio — como no Instagram. Campo de digitar e janela aberta também
 *   ficam fora.
 */
export const DISTANCIA_PARA_ABRIR = 70;
/** Antes disto o arrasto ainda não decidiu se é de lado ou rolagem. */
export const DISTANCIA_PARA_DECIDIR = 12;

export type Direcao = "lado" | "rolagem" | "indefinido";

/** Depois dos primeiros pixels, o toque é de lado (o painel acompanha o dedo) ou é rolagem. */
export function direcaoDoArrasto(dx: number, dy: number): Direcao {
  if (
    Math.abs(dx) < DISTANCIA_PARA_DECIDIR &&
    Math.abs(dy) < DISTANCIA_PARA_DECIDIR
  )
    return "indefinido";
  return Math.abs(dy) <= Math.abs(dx) * 0.5 ? "lado" : "rolagem";
}

/** Soltou o dedo: abre (para a direita), fecha (para a esquerda) ou nada. */
export function resultadoDoGesto(
  dx: number,
  dy: number,
  aberto: boolean,
): "abrir" | "fechar" | null {
  if (direcaoDoArrasto(dx, dy) !== "lado") return null;
  if (!aberto && dx >= DISTANCIA_PARA_ABRIR) return "abrir";
  if (aberto && dx <= -DISTANCIA_PARA_ABRIR) return "fechar";
  return null;
}

/** O pedaço do DOM que importa para decidir se o toque é do gesto. */
export interface ElementoDoToque {
  tagName: string;
  isContentEditable?: boolean;
  scrollLeft: number;
  scrollWidth: number;
  clientWidth: number;
  getAttribute(nome: string): string | null;
  parentElement: ElementoDoToque | null;
}

const CAMPOS = new Set(["INPUT", "TEXTAREA", "SELECT"]);

/**
 * O toque que começou neste elemento pode abrir o sorteio? Não, se começou
 * num campo, numa janela aberta (`aria-modal`) ou dentro de algo que rola de
 * lado e ainda pode voltar para a esquerda.
 */
export function toquePodeAbrir(
  el: ElementoDoToque | null,
  /** O `overflow-x` calculado (o componente passa o de `getComputedStyle`). */
  overflowX: (e: ElementoDoToque) => string,
): boolean {
  for (let e = el; e; e = e.parentElement) {
    if (CAMPOS.has(e.tagName) || e.isContentEditable) return false;
    if (
      e.getAttribute("aria-modal") === "true" ||
      e.getAttribute("data-sem-gesto") !== null
    )
      return false;
    const ox = overflowX(e);
    const rolaDeLado =
      (ox === "auto" || ox === "scroll") && e.scrollWidth > e.clientWidth + 1;
    if (rolaDeLado && e.scrollLeft > 1) return false;
  }
  return true;
}
