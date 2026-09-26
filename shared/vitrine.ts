/**
 * Vitrine (tela inicial): banners da plataforma, stories dos organizadores e
 * os estados com rifa no ar. Puro, sem banco: o servidor valida com isto e a
 * tela decide o que mostrar com isto — a regra não pode ter duas cópias.
 */
import { UFS, ufValida } from "./endereco";

/* ------------------------------------------------------------------ *
 * Banners da plataforma
 * ------------------------------------------------------------------ */

export const BANNERS_MAX = 5;
export const BANNER_SEGUNDOS = { min: 3, max: 15, padrao: 6 } as const;
/** 2:1 — cabe no celular sem empurrar as rifas para fora da tela. */
export const BANNER_TAMANHO = { largura: 1200, altura: 600 } as const;

export interface DadosDoBanner {
  titulo: string;
  link: string | null;
  segundos: number;
  ativo: boolean;
  inicio: Date | null;
  fim: Date | null;
}

/**
 * Para onde o banner leva: um caminho do próprio site (`/r/rifa`, `/ajuda`)
 * ou um endereço `https:`. Nunca `//outro-site` (que o navegador trata como
 * endereço externo), nunca `javascript:`: o banner aparece para todo mundo
 * com a cara da plataforma.
 */
export function validarLinkDoBanner(bruto: unknown): string | null {
  if (bruto === null || bruto === undefined) return null;
  if (typeof bruto !== "string") throw new Error("Link inválido.");
  const l = bruto.trim();
  if (!l) return null;
  if (l.length > 300) throw new Error("Link longo demais.");
  if (l.startsWith("/")) {
    if (l.startsWith("//") || l.includes("\\")) throw new Error("Link inválido.");
    if (/[\s<>"']/.test(l)) throw new Error("Link inválido.");
    return l;
  }
  let u: URL;
  try {
    u = new URL(l);
  } catch {
    throw new Error("Use um caminho do site (/r/…) ou um endereço https.");
  }
  if (u.protocol !== "https:") throw new Error("Só endereços https.");
  if (u.username || u.password || !u.hostname.includes(".")) throw new Error("Link inválido.");
  return u.toString();
}

function data(bruta: unknown, campo: string): Date | null {
  if (bruta === null || bruta === undefined || bruta === "") return null;
  const d = new Date(String(bruta));
  if (Number.isNaN(d.getTime())) throw new Error(`${campo}: data inválida.`);
  return d;
}

/** Confere e normaliza os campos do banner. Só chaves conhecidas saem. */
export function validarBanner(bruto: unknown): DadosDoBanner {
  const b = (bruto ?? {}) as Record<string, unknown>;
  const titulo = typeof b.titulo === "string" ? b.titulo.replace(/\s+/g, " ").trim() : "";
  if (titulo.length < 2) throw new Error("Dê um título ao banner (ele é o texto alternativo da imagem).");
  if (titulo.length > 80) throw new Error("O título passa de 80 caracteres.");
  const segundos = b.segundos === undefined ? BANNER_SEGUNDOS.padrao : Number(b.segundos);
  if (!Number.isInteger(segundos) || segundos < BANNER_SEGUNDOS.min || segundos > BANNER_SEGUNDOS.max) {
    throw new Error(`Tempo na tela de ${BANNER_SEGUNDOS.min} a ${BANNER_SEGUNDOS.max} segundos.`);
  }
  const inicio = data(b.inicio, "Início");
  const fim = data(b.fim, "Fim");
  if (inicio && fim && fim <= inicio) throw new Error("O fim precisa ser depois do início.");
  return { titulo, link: validarLinkDoBanner(b.link), segundos, ativo: b.ativo !== false, inicio, fim };
}

/** Banner no ar: ligado e dentro da janela (sem janela = sempre). */
export function bannerNoAr(
  b: { ativo: boolean; inicio: Date | string | null; fim: Date | string | null },
  agora = new Date(),
): boolean {
  if (!b.ativo) return false;
  if (b.inicio && new Date(b.inicio) > agora) return false;
  if (b.fim && new Date(b.fim) <= agora) return false;
  return true;
}

/* ------------------------------------------------------------------ *
 * Stories
 * ------------------------------------------------------------------ */

export const STORY_HORAS = 24;
/** Stories no ar ao mesmo tempo por organização. */
export const STORIES_MAX = 10;
export const LEGENDA_MAX = 150;
/** 9:16, a tela do celular em pé. */
export const STORY_TAMANHO = { largura: 1080, altura: 1920 } as const;
/** Quanto tempo cada story fica na tela antes de passar sozinho. */
export const STORY_SEGUNDOS = 6;

export function validarLegenda(bruta: unknown): string | null {
  if (bruta === null || bruta === undefined) return null;
  if (typeof bruta !== "string") throw new Error("A legenda precisa ser texto.");
  const l = bruta.replace(/\s+/g, " ").trim();
  if (l.length > LEGENDA_MAX) throw new Error(`A legenda passa de ${LEGENDA_MAX} caracteres.`);
  return l || null;
}

export function expiraEm(criadoEm: Date): Date {
  return new Date(criadoEm.getTime() + STORY_HORAS * 3_600_000);
}

/**
 * Tem story que a pessoa ainda não viu? O "visto" fica no aparelho (o
 * instante do último story aberto de cada perfil), como a região e o tema:
 * perder só acende o anel de novo.
 */
export function temStoryNovo(ultimoStory: string | Date | null | undefined, vistoAte: string | null | undefined): boolean {
  if (!ultimoStory) return false;
  if (!vistoAte) return true;
  return new Date(ultimoStory).getTime() > new Date(vistoAte).getTime();
}

/* ------------------------------------------------------------------ *
 * Estados
 * ------------------------------------------------------------------ */

export interface EstadoComRifa {
  uf: string;
  nome: string;
  rifas: number;
}

/**
 * Os estados com rifa no ar, em ordem alfabética do nome — o estado de quem
 * olha vai na frente (ordena, nunca esconde: é a regra da vitrine).
 */
export function estadosComRifa(contagem: { uf: string | null; rifas: number }[], ufDeQuemOlha?: string | null): EstadoComRifa[] {
  const lista = contagem
    .filter((c): c is { uf: string; rifas: number } => Boolean(c.uf && ufValida(c.uf) && c.rifas > 0))
    .map((c) => ({ uf: c.uf, nome: UFS[c.uf as keyof typeof UFS], rifas: c.rifas }))
    .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
  const i = ufDeQuemOlha ? lista.findIndex((e) => e.uf === ufDeQuemOlha) : -1;
  if (i > 0) lista.unshift(...lista.splice(i, 1));
  return lista;
}
