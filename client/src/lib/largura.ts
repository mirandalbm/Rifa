import { useEffect, useState } from "react";

/** O computador começa em 1024 px (`lg`); abaixo disso é celular ou tablet (`docs/VERSOES.md`). */
export const NO_COMPUTADOR = "(min-width: 1024px)";

/** Se a tela está na largura do computador agora — acompanha o giro do tablet e a janela que muda. */
export function useNoComputador(): boolean {
  const [larga, setLarga] = useState(() => typeof window !== "undefined" && window.matchMedia?.(NO_COMPUTADOR).matches === true);
  useEffect(() => {
    const m = window.matchMedia?.(NO_COMPUTADOR);
    if (!m) return;
    const mudou = () => setLarga(m.matches);
    mudou();
    m.addEventListener("change", mudou);
    return () => m.removeEventListener("change", mudou);
  }, []);
  return larga;
}
