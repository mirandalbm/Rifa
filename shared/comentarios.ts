/**
 * Comentários na publicação da rifa — regras puras (a tela e o servidor
 * usam as mesmas).
 *
 * O golpe que isto barra: comentário com link ou telefone ("chama no zap
 * que eu vendo mais barato", "Pix aqui") na rifa de um promotor de verdade,
 * com a cara dele. Por isso comentário não leva link nem número de
 * telefone — de ninguém, nem da própria organização: o contato dela já
 * está no perfil, pelos links conferidos.
 */

export const COMENTARIO_MAX = 500;
/** Por pessoa, na janela: comentar é conversa, não panfleto. */
export const COMENTARIOS_POR_JANELA = 10;
export const JANELA_DE_COMENTARIOS_MIN = 10;

const LINK = /(https?:\/\/|www\.|\b[a-z0-9-]+\.(com|net|org|br|io|me|app|link|site|xyz|shop|online)\b)/i;
/** 8 dígitos ou mais, com ou sem separadores: telefone, conta, chave. */
const MUITOS_DIGITOS = /(\d[\s.()-]*){8,}/;

export function problemaNoComentario(texto: unknown): string | null {
  const t = typeof texto === "string" ? texto.trim() : "";
  if (!t) return "Escreva o comentário.";
  if (t.length > COMENTARIO_MAX) return `O comentário passa de ${COMENTARIO_MAX} caracteres.`;
  if (LINK.test(t)) return "Comentário não pode ter link — é assim que golpista tenta levar gente para fora da rifa.";
  if (MUITOS_DIGITOS.test(t)) return "Comentário não pode ter telefone nem número longo. O contato da organização está no perfil.";
  return null;
}

/** Espaços repetidos viram um; quebras de linha ficam (até duas seguidas). */
export function limparComentario(texto: string) {
  return texto
    .trim()
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n");
}

/** "Ana Paula Souza" → "Ana P." — o apostador aparece pelo primeiro nome (LGPD). */
export function nomeNoComentario(nome: string | null | undefined) {
  const partes = (nome ?? "").trim().split(/\s+/).filter(Boolean);
  if (partes.length === 0) return "Apostador";
  return partes.length > 1 ? `${partes[0]} ${partes[1].charAt(0).toUpperCase()}.` : partes[0];
}
