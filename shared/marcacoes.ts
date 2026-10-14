/**
 * Marcar pessoas numa publicação de apostador (como marcar amigos no
 * Instagram). Regras puras, iguais na tela e no servidor.
 *
 * - Até `MARCADOS_MAX` pessoas, pelo apelido (`@fulano`), sem repetir.
 * - Quem marca não se marca. A conferência de conta e de apelido existente
 *   fica no serviço (`server/services/divulgacao.ts`).
 * - A marcação só aparece no perfil da pessoa depois do aceite dela
 *   (`divulgacao_marcacoes.situacao = 'aceita'`).
 */
import { validarApelido } from "./perfilApostador";

export const MARCADOS_MAX = 5;

/** A lista de apelidos que vem do formulário: sem @, minúsculas, sem repetir, até o máximo. */
export function validarMarcados(entrada: unknown): { ok: true; apelidos: string[] } | { ok: false; erro: string } {
  if (entrada === undefined || entrada === null) return { ok: true, apelidos: [] };
  if (!Array.isArray(entrada)) return { ok: false, erro: "Marque as pessoas numa lista de apelidos." };
  if (entrada.length > MARCADOS_MAX) return { ok: false, erro: `Marque até ${MARCADOS_MAX} pessoas.` };
  const apelidos: string[] = [];
  for (const e of entrada) {
    const v = validarApelido(e);
    if (!v.ok) return { ok: false, erro: v.erro };
    if (!apelidos.includes(v.apelido)) apelidos.push(v.apelido);
  }
  return { ok: true, apelidos };
}

/** O texto do aviso para quem foi marcado. Nunca traz telefone, CPF nem legenda inteira. */
export function avisoDaMarcacao(autor: string, rifa: string) {
  return {
    title: "Marcaram você numa publicação",
    body: `@${autor} marcou você numa publicação da rifa ${rifa}. Ela só aparece no seu perfil depois que você aceitar.`,
  };
}
