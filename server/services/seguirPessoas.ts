/**
 * Seguir outro apostador (pessoa com conta e apelido). Regras puras em
 * `shared/perfilApostador.ts` (`problemaNoSeguirPessoa`).
 *
 * - A chave `(seguidor, seguido)` decide: seguir duas vezes é uma linha só
 *   (`ON CONFLICT DO NOTHING`), e o contador de `buyers` só anda quando a
 *   linha entrou ou saiu, na mesma transação. Nunca `COUNT(*)`.
 * - As duas pessoas são travadas em ordem de id antes de mexer nos contadores:
 *   dois seguir cruzados (A segue B e B segue A ao mesmo tempo) se esperariam
 *   para sempre se travassem em ordem diferente.
 * - Só conta com apelido segue e é seguida: o perfil público é do apelido.
 * - Nunca sai a lista de quem segue quem: a página mostra os números.
 */
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { db } from "../db";
import { buyers, seguidoresPessoas } from "@shared/schema";
import { problemaNoSeguirPessoa } from "@shared/perfilApostador";
import { PerfilApostadorError } from "./perfilApostador";
import { hit } from "./antifraude";

/** Quantos seguir ou deixar de seguir por pessoa, em 10 minutos. Bloqueia robô de seguidor. */
export const SEGUIR_POR_JANELA = 30;

async function apelidoDoAlvo(apelido: string) {
  const [alvo] = await db
    .select({ id: buyers.id })
    .from(buyers)
    .where(and(eq(buyers.apelido, apelido.toLowerCase()), isNull(buyers.excluidoEm)));
  if (!alvo) throw new PerfilApostadorError("Perfil não encontrado.", 404);
  return alvo;
}

async function contaComApelido(buyerId: string) {
  const [eu] = await db
    .select({ id: buyers.id, apelido: buyers.apelido, conta: buyers.passwordHash })
    .from(buyers)
    .where(and(eq(buyers.id, buyerId), isNull(buyers.excluidoEm)));
  if (!eu?.conta) throw new PerfilApostadorError("Entre na sua conta.", 401);
  if (!eu.apelido) throw new PerfilApostadorError("Escolha um apelido antes de seguir alguém.", 409);
  return eu;
}

/** Trava as duas contas em ordem de id. Chamar dentro de transação. */
async function travarPar(tx: Parameters<Parameters<typeof db.transaction>[0]>[0], a: string, b: string) {
  const ids = [a, b].sort();
  await tx.select({ id: buyers.id }).from(buyers).where(inArray(buyers.id, ids)).orderBy(buyers.id).for("update");
}

export async function seguirPessoa(seguidorId: string, apelido: string) {
  const eu = await contaComApelido(seguidorId);
  const alvo = await apelidoDoAlvo(apelido);
  const problema = problemaNoSeguirPessoa(eu.id, alvo.id);
  if (problema) throw new PerfilApostadorError(problema, 422);
  if ((await hit(`seguir-pessoa:${eu.id}`, 10, SEGUIR_POR_JANELA)).excedeu) {
    throw new PerfilApostadorError("Muitas ações de seguir seguidas. Espere um pouco.", 429);
  }
  await db.transaction(async (tx) => {
    await travarPar(tx, eu.id, alvo.id);
    const entrou = await tx
      .insert(seguidoresPessoas)
      .values({ seguidorId: eu.id, seguidoId: alvo.id })
      .onConflictDoNothing()
      .returning({ seguidorId: seguidoresPessoas.seguidorId });
    if (entrou.length > 0) {
      await tx.update(buyers).set({ seguidoresCount: sql`${buyers.seguidoresCount} + 1` }).where(eq(buyers.id, alvo.id));
      await tx.update(buyers).set({ seguindoPessoasCount: sql`${buyers.seguindoPessoasCount} + 1` }).where(eq(buyers.id, eu.id));
    }
  });
  return { seguindo: true };
}

export async function deixarDeSeguirPessoa(seguidorId: string, apelido: string) {
  const eu = await contaComApelido(seguidorId);
  const alvo = await apelidoDoAlvo(apelido);
  if ((await hit(`seguir-pessoa:${eu.id}`, 10, SEGUIR_POR_JANELA)).excedeu) {
    throw new PerfilApostadorError("Muitas ações de seguir seguidas. Espere um pouco.", 429);
  }
  await db.transaction(async (tx) => {
    await travarPar(tx, eu.id, alvo.id);
    const saiu = await tx
      .delete(seguidoresPessoas)
      .where(and(eq(seguidoresPessoas.seguidorId, eu.id), eq(seguidoresPessoas.seguidoId, alvo.id)))
      .returning({ seguidorId: seguidoresPessoas.seguidorId });
    if (saiu.length > 0) {
      await tx.update(buyers).set({ seguidoresCount: sql`greatest(${buyers.seguidoresCount} - 1, 0)` }).where(eq(buyers.id, alvo.id));
      await tx.update(buyers).set({ seguindoPessoasCount: sql`greatest(${buyers.seguindoPessoasCount} - 1, 0)` }).where(eq(buyers.id, eu.id));
    }
  });
  return { seguindo: false };
}
