import { useEffect, useState } from "react";

/**
 * O quadriculado dos números (mapa, cartela, janela do "+" e carrinho): casas
 * quadradas, azuis e verdes misturadas ao acaso, nos dois temas.
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

/**
 * A cor da casa, azul ou verde, sorteada pelo próprio número (como na
 * imagem de referência, sem padrão à vista). É determinística: o mesmo
 * número tem a mesma cor no mapa, na cartela e no carrinho, e a tela não
 * troca de cor a cada toque. Só apresentação — não diz nada do número.
 */
export function corDaCasa(n: number): "quadro-azul" | "quadro-verde" {
  // Mistura de bits (a finalização do murmur3): números vizinhos caem em
  // cores sem relação entre si.
  let h = Math.imul(n ^ (n >>> 16), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  h ^= h >>> 16;
  return (h & 1) === 0 ? "quadro-azul" : "quadro-verde";
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
