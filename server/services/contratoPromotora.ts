/**
 * Contrato da plataforma com a promotora: versões publicadas pela plataforma
 * e o aceite de cada organização. Enquanto houver versão em vigor, a
 * organização só publica rifa depois de aceitá-la (`problemaDoContrato`, em
 * `publishBlockers` e de novo dentro da transação da publicação).
 */
import { createHash } from "node:crypto";
import { and, count, desc, eq, isNull, sql } from "drizzle-orm";
import { db } from "../db";
import { contratoPromotoraAceites, contratosPromotora, organizations, users } from "@shared/schema";
import {
  bloqueioDoContrato,
  ContratoError,
  preencherContrato,
  problemaNoPreenchimento,
  validarContrato,
  versaoLida,
} from "@shared/contratoPromotora";
import type { DadosDaEmpresa } from "@shared/legal";
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

/**
 * A impressão do texto: SHA-256 em hexadecimal sobre o UTF-8. Gravada na
 * versão e no aceite — é o "hash da versão lida" do contrato. O mesmo valor
 * sai no Postgres com `encode(sha256(convert_to(texto, 'UTF8')), 'hex')`.
 */
export function hashDoContrato(texto: string): string {
  return createHash("sha256").update(texto, "utf8").digest("hex");
}

/**
 * A versão em vigor e se a organização a aceitou. A publicação usa as duas
 * coisas: o problema barra, e a versão fica gravada na rifa (`contratoId`).
 */
export async function contratoDaPublicacao(orgId: string, banco: Banco = db): Promise<{ problema: string | null; contratoId: string | null }> {
  const c = await contratoEmVigor(banco);
  if (!c) return { problema: null, contratoId: null };
  const [a] = await banco
    .select({ id: contratoPromotoraAceites.id })
    .from(contratoPromotoraAceites)
    .where(and(eq(contratoPromotoraAceites.contratoId, c.id), eq(contratoPromotoraAceites.organizationId, orgId)));
  return { problema: a ? null : bloqueioDoContrato(c.versao), contratoId: c.id };
}

/** O que barra a publicação: versão em vigor sem o aceite desta organização. */
export async function problemaDoContrato(orgId: string, banco: Banco = db): Promise<string | null> {
  return (await contratoDaPublicacao(orgId, banco)).problema;
}

/** A tela da organização: o texto em vigor e se ela já aceitou. */
export async function contratoDaOrganizacao(orgId: string) {
  const c = await contratoEmVigor();
  const [ultimo] = await db
    .select({
      versao: contratoPromotoraAceites.versao,
      aceitoEm: contratoPromotoraAceites.aceitoEm,
      aceitoPor: users.name,
      textoSha256: contratoPromotoraAceites.textoSha256,
      texto: contratoPromotoraAceites.texto,
    })
    .from(contratoPromotoraAceites)
    .leftJoin(users, eq(users.id, contratoPromotoraAceites.userId))
    .where(eq(contratoPromotoraAceites.organizationId, orgId))
    .orderBy(desc(contratoPromotoraAceites.versao))
    .limit(1);
  return {
    contrato: c ? { versao: c.versao, texto: c.texto, publicadoEm: c.createdAt, hash: c.textoSha256 ?? hashDoContrato(c.texto) } : null,
    // O aceite de antes da coluna não tem a impressão gravada: é a do texto que ele guardou.
    ultimoAceite: ultimo
      ? { versao: ultimo.versao, aceitoEm: ultimo.aceitoEm, aceitoPor: ultimo.aceitoPor, hash: ultimo.textoSha256 ?? hashDoContrato(ultimo.texto) }
      : null,
    pendente: Boolean(c && (!ultimo || ultimo.versao !== c.versao)),
  };
}

/**
 * A tela da plataforma: as versões, quantas organizações aceitaram cada uma e
 * quantas faltam na de agora. `desatualizado`: os dados da empresa mudaram
 * desde a versão em vigor (o modelo preenchido hoje daria outro texto) — a
 * tela pede a versão seguinte, porque o aceite vale para o texto que foi lido.
 */
export async function contratoDaPlataforma(empresa: DadosDaEmpresa) {
  const versoes = await db
    .select({
      versao: contratosPromotora.versao,
      publicadoEm: contratosPromotora.createdAt,
      texto: contratosPromotora.texto,
      modelo: contratosPromotora.modelo,
      textoSha256: contratosPromotora.textoSha256,
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
  const hoje = atual?.modelo ? preencherContrato(atual.modelo, empresa) : null;
  return {
    contrato: atual
      ? {
          versao: atual.versao,
          texto: atual.texto,
          modelo: atual.modelo,
          publicadoEm: atual.publicadoEm,
          hash: atual.textoSha256 ?? hashDoContrato(atual.texto),
          desatualizado: Boolean(hoje && !problemaNoPreenchimento(hoje) && hoje.texto !== atual.texto),
        }
      : null,
    versoes: versoes.map((v) => ({
      versao: v.versao,
      publicadoEm: v.publicadoEm,
      aceites: Number(v.aceites),
      hash: v.textoSha256 ?? hashDoContrato(v.texto),
    })),
    organizacoesAtivas: Number(ativas?.n ?? 0),
  };
}

/**
 * Como o texto vai ficar, sem publicar: os campos preenchidos com os dados da
 * empresa de agora e o que ainda falta. A tela mostra antes do botão.
 */
export function previaDoContrato(entrada: unknown, empresa: DadosDaEmpresa) {
  const { texto: modelo } = validarContrato(entrada);
  const p = preencherContrato(modelo, empresa);
  return { ...p, problema: problemaNoPreenchimento(p), hash: hashDoContrato(p.texto) };
}

/**
 * Versão nova. Nunca edita a anterior: o aceite dela é prova daquele texto.
 * Os campos são preenchidos aqui, com os "Dados da empresa" publicados; campo
 * sem dado ou marcador desconhecido não publica (422).
 */
export async function publicarContrato(entrada: unknown, userId: string | null, empresa: DadosDaEmpresa) {
  const { texto: modelo } = validarContrato(entrada);
  const preenchido = preencherContrato(modelo, empresa);
  const problema = problemaNoPreenchimento(preenchido);
  if (problema) throw new ContratoError(problema, 422);
  const texto = preenchido.texto;
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(${TRAVA_CONTRATO})`);
    const anterior = await contratoEmVigor(tx);
    if (anterior && anterior.texto === texto) {
      throw new ContratoError(`Este texto já é a versão ${anterior.versao} em vigor.`, 409);
    }
    const [novo] = await tx
      .insert(contratosPromotora)
      .values({ versao: (anterior?.versao ?? 0) + 1, texto, modelo, textoSha256: hashDoContrato(texto), publicadoPor: userId })
      .returning();
    return { versao: novo.versao, publicadoEm: novo.createdAt, hash: novo.textoSha256 };
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
        // A impressão do texto que esta organização aceitou, calculada da cópia
        // gravada aqui (não da versão): a prova se confere sozinha.
        textoSha256: hashDoContrato(c.texto),
        ipHash: entrada.identidade.ipHash,
        deviceHash: entrada.identidade.deviceHash,
      })
      .onConflictDoNothing()
      .returning({ id: contratoPromotoraAceites.id });
    return { versao: c.versao, novo: Boolean(novo), hash: hashDoContrato(c.texto) };
  });
}
