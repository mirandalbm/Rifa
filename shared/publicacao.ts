/**
 * A publicação da rifa, como no Instagram: carrossel de até 10 peças
 * (imagens e vídeos), a legenda da organização e a barra de ações —
 * curtir (o trevo), comentar, republicar, compartilhar e salvar — com os
 * contadores. Regras puras: a tela e o servidor usam as mesmas.
 */
import { temLinkOuTelefone } from "./comentarios";

/** Peças no carrossel, contando o banner (a capa). */
export const MAX_CARROSSEL = 10;
/** Até 3 minutos o vídeo entra como reels (em pé, tocando no próprio carrossel)… */
export const REELS_MAX_S = 180;
/** …e até 15 minutos, como vídeo do feed. Mais que isso não entra. */
export const VIDEO_MAX_S = 900;

export type FormatoDoVideo = "reels" | "feed";

/** O formato pela duração **medida no servidor** (nunca a informada pelo navegador). */
export function formatoDoVideo(segundos: number): FormatoDoVideo | null {
  if (!(segundos > 0)) return null;
  if (segundos <= REELS_MAX_S) return "reels";
  if (segundos <= VIDEO_MAX_S) return "feed";
  return null;
}

export function duracao(segundos: number): string {
  const s = Math.round(segundos);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${ss}` : `${m}:${ss}`;
}

/** "Ainda cabe?": o banner, as fotos e os vídeos, juntos, até `MAX_CARROSSEL`. */
export function cabeNoCarrossel(pecasAtuais: number) {
  return pecasAtuais < MAX_CARROSSEL;
}

/* ------------------------------------------------------------------ *
 * Legenda
 * ------------------------------------------------------------------ */

export const LEGENDA_MAX = 2200;

/**
 * A legenda que a organização escreve embaixo da publicação. A mesma régua
 * do comentário: sem link e sem telefone — o contato dela está no perfil,
 * pelos links conferidos, e "chama no zap" na legenda é o começo do Pix por
 * fora. Vazia é permitida (apaga a legenda).
 */
export function problemaNaLegenda(texto: unknown): string | null {
  const t = typeof texto === "string" ? texto.trim() : "";
  if (t.length > LEGENDA_MAX) return `A legenda passa de ${LEGENDA_MAX} caracteres.`;
  const p = temLinkOuTelefone(t);
  return p ? `A legenda ${p.charAt(0).toLowerCase()}${p.slice(1)}` : null;
}

export function limparLegenda(texto: string) {
  return texto.trim().replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n");
}

/* ------------------------------------------------------------------ *
 * Barra de ações
 * ------------------------------------------------------------------ */

export const ACOES = ["curtida", "republicacao", "salvo"] as const;
export type Acao = (typeof ACOES)[number];

/** 999 → "999"; 1.234 → "1.234"; 12.345 → "12,3 mil"; 1.234.567 → "1,2 mi". */
export function contadorCurto(n: number): string {
  if (n < 10_000) return n.toLocaleString("pt-BR");
  const um = (v: number) => (Math.floor(v * 10) / 10).toLocaleString("pt-BR", { maximumFractionDigits: 1 });
  if (n < 1_000_000) return `${um(n / 1000)} mil`;
  return `${um(n / 1_000_000)} mi`;
}

/**
 * "Há 3 dias", como embaixo da publicação no Instagram. Até uma semana é
 * relativo; depois, a data ("16 de setembro", com o ano se for outro).
 */
export function quandoPublicou(iso: string | Date | null | undefined, agora = new Date()): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  const min = Math.max(0, Math.floor((agora.getTime() - d.getTime()) / 60_000));
  if (min < 1) return "Agora";
  if (min < 60) return `Há ${min} ${min === 1 ? "minuto" : "minutos"}`;
  const h = Math.floor(min / 60);
  if (h < 24) return `Há ${h} ${h === 1 ? "hora" : "horas"}`;
  const dias = Math.floor(h / 24);
  if (dias < 7) return `Há ${dias} ${dias === 1 ? "dia" : "dias"}`;
  return d.toLocaleDateString("pt-BR", {
    day: "numeric",
    month: "long",
    ...(d.getFullYear() !== agora.getFullYear() ? { year: "numeric" } : {}),
    timeZone: "America/Sao_Paulo",
  });
}
