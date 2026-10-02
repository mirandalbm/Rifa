/**
 * Onde o segredo do segundo fator mora: selado no cofre (`users.totp_secret`
 * vira `cofre:v1:…`). Quem lê o banco vazado não gera o código do
 * administrador sem a `COFRE_CHAVE`, que fica fora dele.
 *
 * O segredo de antes desta regra, em claro, continua valendo (senão o
 * administrador ficaria trancado fora) até a migração selá-lo, ao subir o
 * servidor. Sem a chave do cofre (produção mal configurada), o segredo novo
 * é guardado em claro, com aviso no log: trancar o segundo fator por falta
 * da chave tiraria a proteção mais importante da conta mais sensível.
 */
import { and, eq, isNotNull, not, like } from "drizzle-orm";
import { db } from "../db";
import { users } from "@shared/schema";
import { abrirTexto, cofreDisponivel, estaSelado, selarTexto } from "./cofre";
import { verifyTotp } from "./totp";

export function guardarSegredo(segredo: string): string {
  if (cofreDisponivel()) return selarTexto(segredo);
  console.warn("[segundo fator] COFRE_CHAVE ausente: o segredo foi guardado em claro. Configure a chave e reinicie.");
  return segredo;
}

/** O segredo para conferir o código. Nulo, nulo. Selado e adulterado: lança (o login recusa). */
export function abrirSegredo(guardado: string | null | undefined): string | null {
  if (!guardado) return null;
  return estaSelado(guardado) ? abrirTexto(guardado) : guardado;
}

/**
 * Sela o que ainda está em claro. `UPDATE` condicional ao valor lido: se o
 * administrador trocou ou desligou no meio, a linha fica como ele deixou.
 */
export async function cifrarSegredosDoSegundoFator(): Promise<number> {
  if (!cofreDisponivel()) return 0;
  const emClaro = await db
    .select({ id: users.id, segredo: users.totpSecret })
    .from(users)
    .where(and(isNotNull(users.totpSecret), not(like(users.totpSecret, "cofre:%"))));
  let n = 0;
  for (const u of emClaro) {
    if (!u.segredo) continue;
    const r = await db
      .update(users)
      .set({ totpSecret: selarTexto(u.segredo) })
      .where(and(eq(users.id, u.id), eq(users.totpSecret, u.segredo)))
      .returning({ id: users.id });
    n += r.length;
  }
  return n;
}

/**
 * O código confere com o segredo guardado? Segredo que não abre (adulterado,
 * chave trocada) é "não confere", com o motivo no log — nunca um 500 no login.
 */
export function codigoConfere(guardado: string | null | undefined, codigo: string): boolean {
  let segredo: string | null;
  try {
    segredo = abrirSegredo(guardado);
  } catch (e) {
    console.error("[segundo fator] segredo guardado não abre:", (e as Error).message);
    return false;
  }
  return segredo ? verifyTotp(segredo, codigo) : false;
}
