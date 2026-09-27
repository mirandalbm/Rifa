/**
 * O perfil público do apostador, como o do Instagram: apelido escolhido por
 * ele, foto, e sempre o nome real — primeiro e último — para ninguém se
 * esconder atrás do apelido. Telefone, CPF e e-mail nunca aparecem.
 */

export const APELIDO_MIN = 3;
export const APELIDO_MAX = 30;

/** Apelidos que confundiriam com a plataforma ou com a organização. */
const RESERVADOS = new Set([
  "admin", "administrador", "suporte", "atendimento", "plataforma", "rifa", "rifabr", "rifa.br",
  "oficial", "organizacao", "organização", "moderador", "sistema",
]);

/** `" @Leandro.Miranda "` → `"leandro.miranda"`, ou o motivo da recusa. */
export function validarApelido(entrada: unknown): { ok: true; apelido: string } | { ok: false; erro: string } {
  const a = (typeof entrada === "string" ? entrada : "").trim().replace(/^@/, "").toLowerCase();
  if (a.length < APELIDO_MIN || a.length > APELIDO_MAX) {
    return { ok: false, erro: `O apelido tem de ${APELIDO_MIN} a ${APELIDO_MAX} caracteres.` };
  }
  if (!/^[a-z0-9._]+$/.test(a)) return { ok: false, erro: "Use só letras sem acento, números, ponto e sublinhado." };
  if (/^[._]|[._]$|\.\./.test(a)) return { ok: false, erro: "O apelido não começa nem termina com ponto ou sublinhado." };
  if (/^\d+$/.test(a)) return { ok: false, erro: "O apelido não pode ser só números." };
  // Oito dígitos seguidos no apelido é telefone — a mesma régua do comentário.
  if (/\d{8,}/.test(a)) return { ok: false, erro: "O apelido não pode ter telefone." };
  if (RESERVADOS.has(a) || a.startsWith("rifa")) return { ok: false, erro: "Esse apelido é reservado. Escolha outro." };
  return { ok: true, apelido: a };
}

/** "ana paula de souza" → "Ana Souza": primeiro e último nome, capitalizados. */
export function nomeRealPublico(nome: string | null | undefined) {
  const partes = (nome ?? "").trim().split(/\s+/).filter(Boolean);
  const cap = (p: string) => p.charAt(0).toLocaleUpperCase("pt-BR") + p.slice(1).toLocaleLowerCase("pt-BR");
  if (partes.length === 0) return "Apostador";
  return partes.length === 1 ? cap(partes[0]) : `${cap(partes[0])} ${cap(partes[partes.length - 1])}`;
}

/** As reações rápidas da barra de comentários, na ordem do Instagram. */
export const REACOES = ["❤️", "🙌", "🔥", "👏", "😢", "😍", "😮", "😂"] as const;
