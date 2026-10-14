/**
 * O perfil público do apostador, como o do Instagram: apelido escolhido por
 * ele, foto, e sempre o nome real — primeiro e último — para ninguém se
 * esconder atrás do apelido. Telefone, CPF e e-mail nunca aparecem.
 */

import { temLinkOuTelefone } from "./comentarios";
import { validarLinks } from "./perfil";
import { pedePagamentoPorFora } from "./seguranca";

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

/* ------------------------------------------------------------------ *
 * Bio e link do perfil público (Instagram: a bio e o chip de link)
 * ------------------------------------------------------------------ */

export const BIO_MAX = 150;

/**
 * A bio é texto puro: sem link e sem telefone (a régua do comentário, porque
 * a bio aparece para qualquer um). `null`/vazio apaga a bio.
 */
export function validarBio(entrada: unknown): { ok: true; bio: string | null } | { ok: false; erro: string } {
  if (entrada === null || entrada === undefined) return { ok: true, bio: null };
  if (typeof entrada !== "string") return { ok: false, erro: "A bio precisa ser texto." };
  const t = entrada.replace(/[ \t]+/g, " ").replace(/\n{2,}/g, "\n").trim();
  if (!t) return { ok: true, bio: null };
  if (t.length > BIO_MAX) return { ok: false, erro: `A bio passa de ${BIO_MAX} caracteres.` };
  const problema = temLinkOuTelefone(t);
  if (problema) return { ok: false, erro: `Bio: ${problema.charAt(0).toLowerCase()}${problema.slice(1)}` };
  return { ok: true, bio: t };
}

/**
 * O link do perfil: um só, pela régua dos links da organização (`https:`,
 * sem usuário e senha, com domínio de verdade). Vazio apaga o link.
 */
export function validarLinkDoApostador(entrada: unknown): { ok: true; link: string | null } | { ok: false; erro: string } {
  if (entrada === null || entrada === undefined || (typeof entrada === "string" && !entrada.trim())) {
    return { ok: true, link: null };
  }
  if (typeof entrada !== "string") return { ok: false, erro: "O link precisa ser um endereço." };
  try {
    const [l] = validarLinks([{ url: entrada }]);
    return { ok: true, link: l.url };
  } catch (err) {
    return { ok: false, erro: (err as Error).message.replace(/^Link 1: /, "Link: ") };
  }
}

/* ------------------------------------------------------------------ *
 * Nota de 24 horas, sobre a foto (como no Instagram)
 * ------------------------------------------------------------------ */

export const NOTA_MAX = 60;
export const NOTA_HORAS = 24;
export const NOTA_MS = NOTA_HORAS * 60 * 60 * 1000;

/**
 * A nota é uma linha de texto puro: sem link, sem telefone e sem pedido de
 * Pix por fora (a mesma varredura das mensagens). `null`/vazio apaga a nota.
 */
export function validarNota(entrada: unknown): { ok: true; nota: string | null } | { ok: false; erro: string } {
  if (entrada === null || entrada === undefined) return { ok: true, nota: null };
  if (typeof entrada !== "string") return { ok: false, erro: "A nota precisa ser texto." };
  const t = entrada.replace(/\s+/g, " ").trim();
  if (!t) return { ok: true, nota: null };
  if (t.length > NOTA_MAX) return { ok: false, erro: `A nota passa de ${NOTA_MAX} caracteres.` };
  const problema = temLinkOuTelefone(t);
  if (problema) return { ok: false, erro: `Nota: ${problema.charAt(0).toLowerCase()}${problema.slice(1)}` };
  if (pedePagamentoPorFora(t)) return { ok: false, erro: "Nota: não pode pedir pagamento por fora da plataforma." };
  return { ok: true, nota: t };
}

/** Até quando a nota vale: 24 h depois de escrita. Nulo se nunca foi escrita. */
export function notaAte(notaEm: Date | string | null | undefined): Date | null {
  if (!notaEm) return null;
  const t = new Date(notaEm).getTime();
  return Number.isFinite(t) ? new Date(t + NOTA_MS) : null;
}

/** A nota ainda aparece? Passado o prazo, nenhuma leitura a devolve. */
export function notaVigente(notaEm: Date | string | null | undefined, agora = Date.now()): boolean {
  const ate = notaAte(notaEm);
  return ate !== null && agora < ate.getTime();
}

/**
 * Seguir uma pessoa: a única regra de quem segue é não seguir a si mesmo. A
 * conferência de conta e apelido fica no serviço (`server/services/seguirPessoas.ts`).
 */
export function problemaNoSeguirPessoa(seguidorId: string, seguidoId: string): string | null {
  return seguidorId === seguidoId ? "Você não pode seguir o próprio perfil." : null;
}
