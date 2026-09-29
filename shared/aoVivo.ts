/**
 * A coluna "ao vivo" da vitrine no tablet e no computador: a tela do próximo
 * sorteio, os últimos ganhadores e quem está jogando agora.
 *
 * - **Só dado real.** Ganhador é sorteio feito ou cota premiada paga; "jogando
 *   agora" é compra paga. Nada simulado, e nenhum contador de "online".
 * - **Nome curto** ("Ana S."): reconhecível para quem é, anônimo para os
 *   outros. Telefone, CPF e código do pedido nunca saem.
 * - **Vídeo dentro da tela só de serviço conhecido** (`videoDaTransmissao`):
 *   emoldurar qualquer endereço seria pôr página alheia dentro do site. O
 *   resto abre numa aba nova.
 */

import { transmissaoValida } from "./sorteio";

/** No máximo tantos ganhadores e tantas compras na coluna. */
export const GANHADORES_NA_COLUNA = 5;
export const JOGANDO_NA_COLUNA = 12;

/** "Marina S." — o primeiro nome e a inicial do último. */
export function nomeCurto(nome: string | null | undefined): string {
  const partes = String(nome ?? "").trim().split(/\s+/).filter(Boolean);
  if (partes.length === 0) return "Alguém";
  const ultima = partes[partes.length - 1][0];
  // Só inicial de letra: "Comprador 4" fica "Comprador", não "Comprador 4.".
  if (partes.length === 1 || !/\p{L}/u.test(ultima)) return partes[0];
  return `${partes[0]} ${ultima.toUpperCase()}.`;
}

export type VideoDaTransmissao =
  | { tipo: "embutido"; servico: "youtube" | "vimeo" | "facebook"; src: string }
  | { tipo: "twitch"; canal: string }
  | { tipo: "link"; href: string };

/**
 * Como tocar o link da transmissão: dentro da tela (YouTube, Vimeo,
 * Facebook; Twitch precisa do endereço do site, montado no navegador) ou,
 * qualquer outro, como link que abre numa aba nova. Link inválido: nulo.
 */
export function videoDaTransmissao(url: unknown): VideoDaTransmissao | null {
  if (!transmissaoValida(url)) return null;
  const u = new URL(url);
  const host = u.hostname.toLowerCase().replace(/^www\.|^m\./, "");
  const idYoutube = /^[\w-]{11}$/;

  if (host === "youtube.com" || host === "youtu.be" || host === "youtube-nocookie.com") {
    let id: string | null = null;
    if (host === "youtu.be") id = u.pathname.slice(1).split("/")[0];
    else if (u.pathname === "/watch") id = u.searchParams.get("v");
    else {
      const m = /^\/(?:live|embed|shorts)\/([^/]+)/.exec(u.pathname);
      id = m ? m[1] : null;
    }
    if (id && idYoutube.test(id)) {
      return { tipo: "embutido", servico: "youtube", src: `https://www.youtube-nocookie.com/embed/${id}?autoplay=1&mute=1&playsinline=1` };
    }
  }
  if (host === "vimeo.com") {
    const m = /^\/(\d{1,12})(?:\/|$)/.exec(u.pathname);
    if (m) return { tipo: "embutido", servico: "vimeo", src: `https://player.vimeo.com/video/${m[1]}?autoplay=1&muted=1` };
  }
  if (host === "twitch.tv") {
    const m = /^\/([a-z0-9_]{3,25})\/?$/i.exec(u.pathname);
    if (m) return { tipo: "twitch", canal: m[1].toLowerCase() };
  }
  if ((host === "facebook.com" || host === "fb.watch") && (host === "fb.watch" || /\/videos?\/|\/watch/.test(u.pathname + u.search))) {
    return {
      tipo: "embutido",
      servico: "facebook",
      src: `https://www.facebook.com/plugins/video.php?href=${encodeURIComponent(u.toString())}&autoplay=true&mute=true`,
    };
  }
  return { tipo: "link", href: u.toString() };
}

/** O endereço do player da Twitch, que exige o domínio de quem emoldura. */
export function srcDaTwitch(canal: string, dominio: string): string {
  return `https://player.twitch.tv/?channel=${encodeURIComponent(canal)}&parent=${encodeURIComponent(dominio)}&muted=true`;
}

/**
 * O relógio da tela: quanto falta, ou se já é a hora (a partir do horário do
 * sorteio, a tela mostra a transmissão).
 */
export function faltaParaOSorteio(drawAt: string | Date, agora: number = Date.now()) {
  const ms = new Date(drawAt).getTime() - agora;
  if (!Number.isFinite(ms) || ms <= 0) return { aoVivo: true as const, dias: 0, horas: 0, minutos: 0, segundos: 0 };
  const s = Math.floor(ms / 1000);
  return {
    aoVivo: false as const,
    dias: Math.floor(s / 86_400),
    horas: Math.floor((s % 86_400) / 3_600),
    minutos: Math.floor((s % 3_600) / 60),
    segundos: s % 60,
  };
}
