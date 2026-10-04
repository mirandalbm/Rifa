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

/**
 * Até 3 h depois do horário a rifa segue como "o próximo sorteio": é o tempo
 * da transmissão. Sorteada, sai (o resultado vai para os ganhadores).
 */
export const DURACAO_DA_TRANSMISSAO_MS = 3 * 3_600_000;

/**
 * O selo "ao vivo" do story e do perfil: a transmissão está no ar quando a
 * rifa tem **link de transmissão cadastrado**, a hora do sorteio já chegou, a
 * janela da transmissão não fechou e o sorteio ainda não foi feito. Só dado
 * real: sem link, o selo não acende (não há o que assistir) — e nada de
 * contador de espectadores.
 */
export function transmissaoNoAr(
  r: { drawAt: string | Date | null | undefined; sorteada: boolean; transmissaoUrl: unknown },
  agora: number = Date.now(),
): boolean {
  if (r.sorteada || !r.drawAt || !transmissaoValida(r.transmissaoUrl)) return false;
  const quando = new Date(r.drawAt).getTime();
  if (!Number.isFinite(quando)) return false;
  return quando <= agora && agora < quando + DURACAO_DA_TRANSMISSAO_MS;
}

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

/**
 * Qualidade do vídeo, como o menu do YouTube. Só o Vimeo aceita que o site
 * escolha (`quality=` no endereço do player); o YouTube ignora o pedido desde
 * 2019 e a Twitch e o Facebook não têm o parâmetro — neles a qualidade fica
 * na engrenagem do próprio player. Por isso o seletor só aparece onde muda
 * alguma coisa (`aceitaQualidade`): botão sem efeito seria mentira na tela.
 * Os valores são os do Vimeo; o rótulo, o de sempre.
 */
export const QUALIDADES_DO_VIDEO = [
  { valor: "auto", rotulo: "Automática" },
  { valor: "4k", rotulo: "2160p" },
  { valor: "2k", rotulo: "1440p" },
  { valor: "1080p", rotulo: "1080p" },
  { valor: "720p", rotulo: "720p" },
  { valor: "540p", rotulo: "540p" },
  { valor: "360p", rotulo: "360p" },
  { valor: "240p", rotulo: "240p" },
] as const;
export type QualidadeDoVideo = (typeof QUALIDADES_DO_VIDEO)[number]["valor"];

export function aceitaQualidade(video: VideoDaTransmissao | null | undefined): boolean {
  return video?.tipo === "embutido" && video.servico === "vimeo";
}

/** O endereço do player com a qualidade escolhida (automática: como veio). */
export function srcComQualidade(src: string, qualidade: QualidadeDoVideo): string {
  if (qualidade === "auto" || !QUALIDADES_DO_VIDEO.some((q) => q.valor === qualidade)) return src;
  const u = new URL(src);
  if (u.hostname !== "player.vimeo.com") return src;
  u.searchParams.set("quality", qualidade);
  return u.toString();
}

/** O que o painel diz sobre o link colado no campo da transmissão. */
export interface LeituraDoLink {
  situacao: "vazio" | "invalido" | "toca" | "aba";
  texto: string;
}

const NOME_DO_SERVICO = { youtube: "YouTube", vimeo: "Vimeo", facebook: "Facebook" } as const;

/**
 * A leitura do link da transmissão para quem cadastra (o painel do sorteio
 * oficial): diz, antes de salvar, se o vídeo vai tocar dentro da tela do
 * sorteio ou só abrir em outra aba, e o que copiar no lugar. A regra é a
 * mesma da tela (`videoDaTransmissao()`): nada aqui decide sozinho.
 */
export function leituraDoLink(bruto: string): LeituraDoLink {
  const url = bruto.trim();
  if (!url) return { situacao: "vazio", texto: "" };
  if (!transmissaoValida(url)) {
    return { situacao: "invalido", texto: "Link inválido: cole o endereço inteiro, começando com https://." };
  }
  const video = videoDaTransmissao(url);
  if (video?.tipo === "embutido") {
    return { situacao: "toca", texto: `Certo: o vídeo do ${NOME_DO_SERVICO[video.servico]} vai tocar dentro da tela do sorteio.` };
  }
  if (video?.tipo === "twitch") {
    return { situacao: "toca", texto: `Certo: o canal ${video.canal} da Twitch vai tocar dentro da tela do sorteio.` };
  }
  const host = new URL(url).hostname.toLowerCase().replace(/^www\.|^m\./, "");
  if (host === "youtube.com" || host === "youtu.be") {
    return {
      situacao: "aba",
      texto:
        "Este é o link do canal ou de uma página do YouTube, não da live: ele só abre o YouTube em outra aba. Abra a live do sorteio, toque em Compartilhar → Copiar link e cole aqui.",
    };
  }
  return { situacao: "aba", texto: "Este link não toca dentro da tela: vai abrir em outra aba." };
}

/**
 * A transmissão entra na tela antes da hora do sorteio: a live da Caixa (e a
 * de quem transmite) começa antes da extração, e quem abre a tela já vê o
 * aquecimento. Até lá, a contagem. A hora do sorteio continua sendo a hora do
 * sorteio — "Sorteio agora", o selo "ao vivo" do story e a janela de 3 h
 * contam dela.
 */
export const ANTECEDENCIA_DA_TRANSMISSAO_MS = 30 * 60_000;

/** A tela já mostra a transmissão (a partir de 30 min antes da hora do sorteio). */
export function transmissaoAberta(drawAt: string | Date, agora: number = Date.now()): boolean {
  const quando = new Date(drawAt).getTime();
  return Number.isFinite(quando) && agora >= quando - ANTECEDENCIA_DA_TRANSMISSAO_MS;
}

/** O id de canal do YouTube: "UC" e 22 letras, números, "-" ou "_". */
const ID_DE_CANAL = /^UC[\w-]{22}$/;

/**
 * O canal oficial de uma loteria, cadastrado uma vez pela plataforma: o
 * próprio id (`UC…`) ou o endereço `youtube.com/channel/UC…`. O endereço com
 * `@` (`youtube.com/@caixa`) não serve — ele não diz o id, e o player da live
 * do canal só aceita o id. Vazio é "sem canal" (`null`); o resto é 400.
 */
export function idDoCanal(bruto: unknown): string | null {
  if (bruto === null || bruto === undefined) return null;
  if (typeof bruto !== "string") throw erroDoCanal();
  const texto = bruto.trim();
  if (!texto) return null;
  if (ID_DE_CANAL.test(texto)) return texto;
  try {
    const u = new URL(texto);
    const host = u.hostname.toLowerCase().replace(/^www\.|^m\./, "");
    const m = /^\/channel\/(UC[\w-]{22})\/?(?:live\/?)?$/.exec(u.pathname);
    if (u.protocol === "https:" && host === "youtube.com" && m) return m[1];
  } catch {
    // Não é endereço: cai na recusa.
  }
  throw erroDoCanal();
}

function erroDoCanal() {
  return Object.assign(
    new Error(
      "O canal precisa ser o id do YouTube (começa com UC, 24 caracteres) ou o endereço youtube.com/channel/UC…. O endereço com @ não serve: no canal, Compartilhar canal → Copiar ID do canal.",
    ),
    { status: 400 },
  );
}

/** O player da live que o canal estiver transmitindo agora (sem cookie, sem som). */
export function videoDoCanal(id: string): VideoDaTransmissao {
  return {
    tipo: "embutido",
    servico: "youtube",
    src: `https://www.youtube-nocookie.com/embed/live_stream?channel=${encodeURIComponent(id)}&autoplay=1&mute=1&playsinline=1`,
  };
}

/**
 * O vídeo do sorteio oficial: o link colado no sorteio vale primeiro (a
 * plataforma pode transmitir a própria live); sem ele, a live do canal da
 * loteria, cadastrado uma vez.
 */
export function videoDoSorteioOficial(transmissaoUrl: unknown, canalDaLoteria: string | null | undefined): VideoDaTransmissao | null {
  return videoDaTransmissao(transmissaoUrl) ?? (canalDaLoteria ? videoDoCanal(canalDaLoteria) : null);
}
