/**
 * Contrato da plataforma com a promotora: versões publicadas pela plataforma
 * e o aceite de cada organização. Enquanto houver versão em vigor, a
 * organização só publica rifa depois de aceitá-la (`problemaDoContrato`, em
 * `publishBlockers` e de novo dentro da transação da publicação).
 */
import { and, count, desc, eq, isNull, sql } from "drizzle-orm";
import { db } from "../db";
import { contratoPromotoraAceites, contratosPromotora, organizations, users } from "@shared/schema";
import { bloqueioDoContrato, ContratoError, validarContrato, versaoLida } from "@shared/contratoPromotora";
import type { RequestIdentity } from "./antifraude";

type Banco = Pick<typeof db, "select" | "execute">;

/**
 * Trava de aplicação do contrato. Publicar versão nova pega a exclusiva;
 * aceitar e publicar rifa pegam a compartilhada — a rifa nunca vai ao ar com
 * o aceite de uma versão que deixou de valer no meio do caminho.
 */
export const TRAVA_CONTRATO = 811_202;

export async function contratoEmVigor(banco: Banco = db) {
  const [c] = await banco.select().from(contratosPromotora).orderBy(desc(contratosPromotora.versao)).limit(1);
  return c ?? null;
}

/** O que barra a publicação: versão em vigor sem o aceite desta organização. */
export async function problemaDoContrato(orgId: string, banco: Banco = db): Promise<string | null> {
  const c = await contratoEmVigor(banco);
  if (!c) return null;
  const [a] = await banco
    .select({ id: contratoPromotoraAceites.id })
    .from(contratoPromotoraAceites)
    .where(and(eq(contratoPromotoraAceites.contratoId, c.id), eq(contratoPromotoraAceites.organizationId, orgId)));
  return a ? null : bloqueioDoContrato(c.versao);
}

/** A tela da organização: o texto em vigor e se ela já aceitou. */
export async function contratoDaOrganizacao(orgId: string) {
  const c = await contratoEmVigor();
  const [ultimo] = await db
    .select({
      versao: contratoPromotoraAceites.versao,
      aceitoEm: contratoPromotoraAceites.aceitoEm,
      aceitoPor: users.name,
    })
    .from(contratoPromotoraAceites)
    .leftJoin(users, eq(users.id, contratoPromotoraAceites.userId))
    .where(eq(contratoPromotoraAceites.organizationId, orgId))
    .orderBy(desc(contratoPromotoraAceites.versao))
    .limit(1);
  return {
    contrato: c ? { versao: c.versao, texto: c.texto, publicadoEm: c.createdAt } : null,
    ultimoAceite: ultimo ?? null,
    pendente: Boolean(c && (!ultimo || ultimo.versao !== c.versao)),
  };
}

/** A tela da plataforma: as versões, quantas organizações aceitaram cada uma e quantas faltam na de agora. */
export async function contratoDaPlataforma() {
  const versoes = await db
    .select({
      versao: contratosPromotora.versao,
      publicadoEm: contratosPromotora.createdAt,
      texto: contratosPromotora.texto,
      aceites: count(contratoPromotoraAceites.id),
    })
    .from(contratosPromotora)
    .leftJoin(contratoPromotoraAceites, eq(contratoPromotoraAceites.contratoId, contratosPromotora.id))
    .groupBy(contratosPromotora.id)
    .orderBy(desc(contratosPromotora.versao));
  const [ativas] = await db
    .select({ n: count() })
    .from(organizations)
    .where(and(isNull(organizations.archivedAt), isNull(organizations.banidaEm)));
  const atual = versoes[0] ?? null;
  return {
    contrato: atual ? { versao: atual.versao, texto: atual.texto, publicadoEm: atual.publicadoEm } : null,
    versoes: versoes.map((v) => ({ versao: v.versao, publicadoEm: v.publicadoEm, aceites: Number(v.aceites) })),
    organizacoesAtivas: Number(ativas?.n ?? 0),
  };
}

/** Versão nova. Nunca edita a anterior: o aceite dela é prova daquele texto. */
export async function publicarContrato(entrada: unknown, userId: string | null) {
  const { texto } = validarContrato(entrada);
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(${TRAVA_CONTRATO})`);
    const anterior = await contratoEmVigor(tx);
    if (anterior && anterior.texto === texto) {
      throw new ContratoError(`Este texto já é a versão ${anterior.versao} em vigor.`, 409);
    }
    const [novo] = await tx
      .insert(contratosPromotora)
      .values({ versao: (anterior?.versao ?? 0) + 1, texto, publicadoPor: userId })
      .returning();
    return { versao: novo.versao, publicadoEm: novo.createdAt };
  });
}

/**
 * Aceite da organização, da versão que a pessoa leu. Se outra versão saiu no
 * meio, 409: lê de novo. Aceitar duas vezes é um aceite só (índice único).
 */
export async function aceitarContrato(
  orgId: string,
  userId: string,
  entrada: { versao: unknown; identidade: RequestIdentity },
) {
  const lida = versaoLida(entrada.versao);
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock_shared(${TRAVA_CONTRATO})`);
    const c = await contratoEmVigor(tx);
    if (!c) throw new ContratoError("Não há contrato publicado para aceitar.", 404);
    if (c.versao !== lida) {
      throw new ContratoError(`O contrato mudou (versão ${c.versao}). Leia de novo antes de aceitar.`, 409);
    }
    const [org] = await tx
      .select({ arquivada: organizations.archivedAt })
      .from(organizations)
      .where(eq(organizations.id, orgId));
    if (!org || org.arquivada) throw new ContratoError("Organização não encontrada.", 404);
    const [novo] = await tx
      .insert(contratoPromotoraAceites)
      .values({
        contratoId: c.id,
        organizationId: orgId,
        userId,
        versao: c.versao,
        texto: c.texto,
        ipHash: entrada.identidade.ipHash,
        deviceHash: entrada.identidade.deviceHash,
      })
      .onConflictDoNothing()
      .returning({ id: contratoPromotoraAceites.id });
    return { versao: c.versao, novo: Boolean(novo) };
  });
}
