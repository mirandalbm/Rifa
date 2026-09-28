import { useEffect, useState } from "react";

/**
 * O quadriculado dos números (mapa, cartela, janela do "+" e carrinho): casas
 * quadradas alternando duas cores, como no tabuleiro de xadrez. A alternância
 * depende de quantas colunas a grade tem — com número par de colunas, alternar
 * pelo índice daria listras, não xadrez.
 */

/**
 * Colunas do mapa: 10 no tablet (sobra largura) e quando o número é curto
 * (até 3 dígitos cabe na casa de um décimo do celular); 5 no resto — no
 * celular e na coluna da compra do computador, onde o número inteiro
 * (até 7 dígitos, na rifa de 1 milhão) precisa caber sem cortar.
 */
export function colunasDoMapa(digitos: number, tablet: boolean): 5 | 10 {
  return tablet || digitos <= 3 ? 10 : 5;
}

/** A casa `i` (da esquerda para a direita, de cima para baixo) é a cheia? */
export function casaCheia(i: number, colunas: number): boolean {
  return (Math.floor(i / colunas) + (i % colunas)) % 2 === 0;
}

/** Tamanho da letra pela quantidade de dígitos: o número nunca é cortado. */
export function letraDoQuadro(digitos: number): string {
  return digitos <= 5 ? "text-[13px]" : "text-[11px]";
}

/** Largura de tablet (640 a 1023 px), a mesma faixa de `docs/VERSOES.md`. */
export function useTablet(): boolean {
  const consulta = "(min-width: 640px) and (max-width: 1023px)";
  const [tablet, setTablet] = useState(() => typeof window !== "undefined" && window.matchMedia?.(consulta).matches === true);
  useEffect(() => {
    const m = window.matchMedia?.(consulta);
    if (!m) return;
    const mudou = () => setTablet(m.matches);
    mudou();
    m.addEventListener("change", mudou);
    return () => m.removeEventListener("change", mudou);
  }, []);
  return tablet;
}
