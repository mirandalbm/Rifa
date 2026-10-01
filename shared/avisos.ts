/**
 * Os avisos do painel (o sino da barra de cima): hoje, o comentário novo de
 * apostador nas rifas de quem está logado. Puro, porque a tela monta o
 * rótulo e o servidor monta a lista — e o trecho que sai no sino é o mesmo
 * que a prova confere.
 *
 * Nenhum dado pessoal entra aqui além do que já é público na publicação: o
 * apelido (ou o primeiro nome e a inicial, como no comentário) e o trecho.
 */

/** Quantos comentários o sino lista, do mais novo ao mais velho. */
export const AVISOS_MAX = 20;
/** O trecho do comentário no sino. */
export const TRECHO_MAX = 90;

export interface AvisoDoPainel {
  id: string;
  tipo: "comentario";
  /** Quem comentou, como aparece na publicação. */
  quem: string;
  trecho: string;
  rifa: { titulo: string; slug: string; orgSlug: string };
  createdAt: string;
  /** Já visto por quem está logado (abriu o sino depois dele). */
  lido: boolean;
}

/** O começo do comentário, numa linha, com reticências se cortou. */
export function trechoDoAviso(texto: string, max = TRECHO_MAX): string {
  const limpo = texto.replace(/\s+/g, " ").trim();
  if (limpo.length <= max) return limpo;
  return `${limpo.slice(0, max - 1).trimEnd()}…`;
}

export function naoLidos(avisos: { lido: boolean }[]): number {
  return avisos.filter((a) => !a.lido).length;
}

/** O rótulo do sino: o número vai em texto, nunca só na bolinha. */
export function rotuloDoSino(novos: number, pendencias: number): string {
  const partes: string[] = [];
  if (novos) partes.push(`${novos} comentário${novos > 1 ? "s" : ""} novo${novos > 1 ? "s" : ""}`);
  if (pendencias) partes.push(`${pendencias} pendente${pendencias > 1 ? "s" : ""} no atendimento`);
  return partes.length ? `Avisos: ${partes.join(", ")}` : "Avisos: nada novo";
}

/** A publicação da rifa, já nos comentários. */
export function caminhoDoAviso(a: Pick<AvisoDoPainel, "rifa">): string {
  return `/o/${a.rifa.orgSlug}/r/${a.rifa.slug}#comentarios`;
}
