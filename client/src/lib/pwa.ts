import { useEffect, useState } from "react";

/**
 * O app instalável (PWA). Um app só para todo mundo: o comprador abre a
 * vitrine, e quem tem conta entra no painel pelo mesmo ícone.
 *
 * O `beforeinstallprompt` dispara uma vez, cedo, e só para quem estiver
 * ouvindo — por isso é capturado aqui, no carregamento do módulo, e não
 * dentro de um componente que talvez ainda não exista.
 */

interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

let pedido: InstallPromptEvent | null = null;
const ouvintes = new Set<() => void>();
const avisar = () => ouvintes.forEach((f) => f());

export function registrarPwa() {
  if (typeof window === "undefined") return;

  window.addEventListener("beforeinstallprompt", (e) => {
    // Sem isto o navegador mostra a faixa dele; a nossa fica na base da vitrine.
    e.preventDefault();
    pedido = e as InstallPromptEvent;
    avisar();
  });
  window.addEventListener("appinstalled", () => {
    pedido = null;
    avisar();
  });

  // Em desenvolvimento o service worker só atrapalha: guarda arquivo velho
  // enquanto o Vite troca módulo a quente.
  if (import.meta.env.PROD && "serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        // Sem service worker o site funciona igual; só não instala.
      });
    });
  }
}

export function jaInstalado(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia?.("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

export function ehIos(): boolean {
  if (typeof navigator === "undefined") return false;
  return /iphone|ipad|ipod/i.test(navigator.userAgent) ||
    // iPad novo se apresenta como Mac com tela de toque.
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

/** Estado da instalação, para a faixa da vitrine. */
export function useInstalacao() {
  const [, forcar] = useState(0);
  useEffect(() => {
    const f = () => forcar((n) => n + 1);
    ouvintes.add(f);
    return () => {
      ouvintes.delete(f);
    };
  }, []);

  return {
    instalado: jaInstalado(),
    podePedir: pedido !== null,
    ios: ehIos(),
    async instalar(): Promise<boolean> {
      if (!pedido) return false;
      const atual = pedido;
      await atual.prompt();
      const { outcome } = await atual.userChoice;
      pedido = null;
      avisar();
      return outcome === "accepted";
    },
  };
}
