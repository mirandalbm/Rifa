import { useEffect, useState } from "react";

/**
 * Tema claro e escuro. O padrão segue o celular ("automático"); a escolha da
 * pessoa fica no aparelho — é conveniência, e sumir só devolve o automático.
 *
 * As cores são variáveis (`client/src/index.css`): o escuro troca os tons,
 * nunca o significado. Verde continua sendo dinheiro que entrou; amarelo,
 * espera e prêmio; vermelho, erro.
 *
 * O `index.html` aplica a escolha guardada antes do primeiro desenho, com a
 * mesma chave — senão a tela piscaria clara antes de ficar escura.
 */
export type Tema = "automatico" | "claro" | "escuro";

export const CHAVE_TEMA = "rifa.tema";

export const NOME_TEMA: Record<Tema, string> = {
  automatico: "Automático",
  claro: "Claro",
  escuro: "Escuro",
};

const ORDEM: Tema[] = ["automatico", "claro", "escuro"];

/** Cor da barra do celular em cada tema — a mesma do fundo do cabeçalho. */
export const COR_DA_BARRA = { claro: "#ffffff", escuro: "#0e1712" } as const;

export function lerTema(): Tema {
  try {
    const t = localStorage.getItem(CHAVE_TEMA);
    return t === "claro" || t === "escuro" ? t : "automatico";
  } catch {
    return "automatico";
  }
}

function sistemaEscuro(): boolean {
  return typeof window !== "undefined" && Boolean(window.matchMedia?.("(prefers-color-scheme: dark)").matches);
}

/** O tema que está de fato na tela. */
export function temaEfetivo(t: Tema): "claro" | "escuro" {
  if (t === "automatico") return sistemaEscuro() ? "escuro" : "claro";
  return t;
}

export function aplicarTema(t: Tema) {
  const raiz = document.documentElement;
  if (t === "automatico") raiz.removeAttribute("data-tema");
  else raiz.setAttribute("data-tema", t);
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute("content", COR_DA_BARRA[temaEfetivo(t)]);
}

export function gravarTema(t: Tema) {
  try {
    if (t === "automatico") localStorage.removeItem(CHAVE_TEMA);
    else localStorage.setItem(CHAVE_TEMA, t);
  } catch {
    /* sem armazenamento, vale só nesta visita */
  }
  aplicarTema(t);
  window.dispatchEvent(new CustomEvent("rifa:tema", { detail: t }));
}

export function proximoTema(t: Tema): Tema {
  return ORDEM[(ORDEM.indexOf(t) + 1) % ORDEM.length];
}

/**
 * O tema escolhido, sincronizado entre os botões da tela e com o celular: no
 * automático, trocar o tema do sistema troca a tela na hora.
 */
export function useTema(): [Tema, (t: Tema) => void] {
  const [tema, setTema] = useState<Tema>(lerTema);

  useEffect(() => {
    const aoTrocar = (e: Event) => setTema((e as CustomEvent<Tema>).detail);
    window.addEventListener("rifa:tema", aoTrocar);
    const mq = window.matchMedia?.("(prefers-color-scheme: dark)");
    const aoMudarSistema = () => {
      if (lerTema() === "automatico") aplicarTema("automatico");
    };
    mq?.addEventListener?.("change", aoMudarSistema);
    return () => {
      window.removeEventListener("rifa:tema", aoTrocar);
      mq?.removeEventListener?.("change", aoMudarSistema);
    };
  }, []);

  return [tema, gravarTema];
}
