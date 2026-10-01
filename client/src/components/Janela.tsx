import { useEffect, useRef, type CSSProperties, type ReactNode } from "react";

/**
 * A janela sobre a tela — uma só para o site inteiro (regra 14 de
 * `docs/VERSOES.md`): sobe de baixo no celular e fica centrada a partir de
 * `sm`; fecha no Esc e no toque no fundo; trava a rolagem de trás; é um
 * `role="dialog"` com `aria-modal`. Fundo e canto são os mesmos em todas, e
 * o foco vai para dentro ao abrir e volta para quem abriu ao fechar.
 *
 * Quem usa traz só o conteúdo; o nome da janela vai em `rotulo` (texto) ou
 * em `rotuloPor` (o `id` do título dela).
 */

/** Várias janelas abertas juntas (uma sobre a outra) travam a rolagem uma vez só. */
let abertas = 0;
let overflowAntes = "";

export function Janela({
  onFechar,
  rotulo,
  rotuloPor,
  largura = "sm:max-w-md",
  centralizarEm = "sm",
  rolar = true,
  className = "",
  style,
  children,
}: {
  onFechar: () => void;
  rotulo?: string;
  rotuloPor?: string;
  /** A largura a partir de `sm`, como classe do Tailwind. */
  largura?: string;
  /**
   * A partir de que largura a janela sai de baixo e fica no centro: `sm`
   * (padrão) ou `lg` — os comentários seguem colados embaixo no tablet,
   * como no Instagram, e ficam no centro só no computador.
   */
  centralizarEm?: "sm" | "lg";
  /** `false` quando o conteúdo tem a rolagem dele (cabeçalho fixo e lista). */
  rolar?: boolean;
  className?: string;
  style?: CSSProperties;
  children: ReactNode;
}) {
  // O Esc e o fechar do pai mudam a cada desenho: ficam numa referência para
  // o efeito não reabrir (e roubar o foco) toda vez que o pai desenha.
  const fechar = useRef(onFechar);
  fechar.current = onFechar;
  const painel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === "Escape" && fechar.current();
    window.addEventListener("keydown", esc);
    if (abertas === 0) overflowAntes = document.body.style.overflow;
    abertas += 1;
    document.body.style.overflow = "hidden";
    const quemAbriu = document.activeElement as HTMLElement | null;
    painel.current?.focus();
    return () => {
      window.removeEventListener("keydown", esc);
      abertas -= 1;
      if (abertas === 0) document.body.style.overflow = overflowAntes;
      quemAbriu?.focus?.();
    };
  }, []);

  return (
    <div
      className={`fixed inset-0 z-50 flex items-end justify-center bg-black/50 ${centralizarEm === "lg" ? "lg:items-center" : "sm:items-center"}`}
      onClick={() => fechar.current()}
    >
      <div
        ref={painel}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={rotulo}
        aria-labelledby={rotuloPor}
        onClick={(e) => e.stopPropagation()}
        style={style}
        className={`max-h-[90vh] w-full rounded-t-2xl bg-white shadow-card outline-none ${
          centralizarEm === "lg" ? `${largura} lg:rounded-2xl` : `${largura} sm:rounded-2xl`
        } ${rolar ? "overflow-y-auto" : ""} ${className}`}
      >
        {children}
      </div>
    </div>
  );
}
