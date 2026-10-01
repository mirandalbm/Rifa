/**
 * Entrar com o Google (regras puras). O Google prova **nome e e-mail**, não
 * CPF nem telefone — por isso a conta nasce incompleta e o quadro "Complete
 * sua conta" pede o resto antes de comprar (ver `pendenciasDaConta`).
 *
 * Duas marcas guardam isso sem mexer no resto do sistema:
 * - `SEM_SENHA` no lugar do hash da senha: não é um hash válido, então
 *   nenhuma senha confere; mas a conta continua sendo "conta" (CPF e e-mail
 *   únicos entre contas, comentar, mensagens, bônus — tudo que olha
 *   `password_hash is not null`);
 * - telefone provisório (`pendente:<id>`) até a pessoa provar um número real
 *   pelo código do WhatsApp. O `phone` é chave única e obrigatória, e o
 *   marcador não é número: nada é enviado para ele (`notify` recusa).
 */

export const SEM_SENHA = "!google";
const PREFIXO_PROVISORIO = "pendente:";

export const telefoneProvisorio = (id: string) => `${PREFIXO_PROVISORIO}${id}`;
export const ehTelefoneProvisorio = (phone: string | null | undefined) =>
  typeof phone === "string" && phone.startsWith(PREFIXO_PROVISORIO);
export const ehContaSoGoogle = (hash: string | null | undefined) => hash === SEM_SENHA;

/** Só caminho do próprio site: `//outro-site` e `/\outro-site` abrem para fora. */
export function caminhoDeVolta(bruto: unknown, padrao = "/perfil"): string {
  if (typeof bruto !== "string") return padrao;
  if (!bruto.startsWith("/") || bruto.startsWith("//") || bruto.startsWith("/\\")) return padrao;
  if (/[\r\n\u0000]/.test(bruto) || bruto.length > 300) return padrao;
  return bruto;
}

export interface ClaimsDoGoogle {
  sub: string;
  email: string;
  nome: string;
}

const EMISSORES = ["https://accounts.google.com", "accounts.google.com"];

/**
 * Confere o que o id_token diz (a assinatura é conferida antes, com as
 * chaves do Google): quem emitiu, para quem (nosso cliente), validade, o
 * `nonce` desta tentativa e e-mail **confirmado** pelo Google. Devolve o
 * problema ou, se serve, os claims.
 */
export function claimsDoToken(
  payload: Record<string, unknown>,
  esperado: { clientId: string; nonce: string; agora?: Date },
): { ok: true; claims: ClaimsDoGoogle } | { ok: false; motivo: string } {
  const agora = (esperado.agora ?? new Date()).getTime() / 1000;
  if (!EMISSORES.includes(String(payload.iss))) return { ok: false, motivo: "emissor desconhecido" };
  const aud = payload.aud;
  const para = Array.isArray(aud) ? aud : [aud];
  if (!para.includes(esperado.clientId)) return { ok: false, motivo: "token de outro aplicativo" };
  if (typeof payload.exp !== "number" || payload.exp <= agora) return { ok: false, motivo: "token vencido" };
  if (typeof payload.nonce !== "string" || payload.nonce !== esperado.nonce) return { ok: false, motivo: "tentativa diferente" };
  if (typeof payload.sub !== "string" || !payload.sub) return { ok: false, motivo: "sem identificador" };
  if (typeof payload.email !== "string" || !payload.email.includes("@")) return { ok: false, motivo: "sem e-mail" };
  if (payload.email_verified !== true && payload.email_verified !== "true") return { ok: false, motivo: "e-mail não confirmado pelo Google" };
  const nome = typeof payload.name === "string" && payload.name.trim() ? payload.name.trim().slice(0, 80) : payload.email.split("@")[0];
  return { ok: true, claims: { sub: payload.sub, email: payload.email.trim().toLowerCase(), nome } };
}

/** O que falta para a conta Google poder comprar, comentar e pedir reembolso. */
export function faltaNaContaGoogle(c: { cpf?: string | null; phone?: string | null }): string[] {
  const falta: string[] = [];
  if (!c.cpf) falta.push("CPF");
  if (ehTelefoneProvisorio(c.phone)) falta.push("telefone");
  return falta;
}

export const MSG_COMPLETE = "Complete sua conta (CPF e telefone) em Minha conta antes de comprar.";
