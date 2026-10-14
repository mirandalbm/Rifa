/**
 * A nota de 24 horas do apostador (sobre a foto). Regras em
 * `shared/perfilApostador.ts` (`validarNota`, `notaVigente`).
 *
 * - Só conta com senha e apelido escreve: a nota aparece no perfil público,
 *   que é do apelido.
 * - A nota é de quem segue a pessoa e da própria pessoa (`perfilPublicoDoApostador`).
 *   Quem não segue não lê, e a lista de quem segue quem nunca sai.
 * - Passadas 24 h, a leitura não devolve mais nada; o texto só sai da linha
 *   quando a pessoa escreve outra ou apaga. Não há relógio para isso.
 * - Erro de preenchimento sai antes do limite (`hit`); só uma nota de verdade
 *   conta. Apagar nunca conta.
 */
import { and, eq, isNull } from "drizzle-orm";
import { db } from "../db";
import { buyers } from "@shared/schema";
import { validarNota } from "@shared/perfilApostador";
import { PerfilApostadorError, meuPerfilPublico } from "./perfilApostador";
import { hit } from "./antifraude";

/** Quantas notas por pessoa em uma hora. Bloqueia quem reescreve a nota sem parar. */
export const NOTAS_POR_HORA = 10;

async function contaComApelido(buyerId: string) {
  const [eu] = await db
    .select({ id: buyers.id, apelido: buyers.apelido, conta: buyers.passwordHash })
    .from(buyers)
    .where(and(eq(buyers.id, buyerId), isNull(buyers.excluidoEm)));
  if (!eu?.conta) throw new PerfilApostadorError("Entre na sua conta.", 401);
  if (!eu.apelido) throw new PerfilApostadorError("Escolha um apelido antes de pôr uma nota.", 409);
  return eu;
}

/** Escreve a nota (ou apaga, com `null`/vazio) e devolve o perfil próprio já atualizado. */
export async function salvarNota(buyerId: string, entrada: unknown) {
  const eu = await contaComApelido(buyerId);
  const v = validarNota(entrada);
  if (!v.ok) throw new PerfilApostadorError(v.erro);
  if (v.nota && (await hit(`nota:${eu.id}`, 60, NOTAS_POR_HORA)).excedeu) {
    throw new PerfilApostadorError("Muitas notas seguidas. Espere um pouco.", 429);
  }
  await db
    .update(buyers)
    .set({ nota: v.nota, notaEm: v.nota ? new Date() : null })
    .where(eq(buyers.id, eu.id));
  return meuPerfilPublico(buyerId);
}
