/**
 * Sócios e diretores da organização (regras em `shared/socios.ts`). O CPF
 * nunca fica em claro: a impressão (HMAC do cofre) decide a recusa da compra
 * e o repetido (índice único por organização), e só o final vai à tela.
 * Mexer na lista apaga a declaração na mesma transação, com a linha da
 * organização atualizada — a publicação, que lê a organização `FOR SHARE`,
 * espera.
 */
import { ehUuid } from "@shared/uuid";
import { and, asc, eq, sql } from "drizzle-orm";
import { db } from "../db";
import { organizacaoSocios, organizations } from "@shared/schema";
import { PROBLEMA_SEM_SOCIOS, SOCIOS_MAX, SocioInvalido, cpfMascarado, validarSocio } from "@shared/socios";
import { cpfValido } from "@shared/format";
import { impressaoDoCpf } from "./cofre";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export class SociosError extends Error {
  constructor(
    message: string,
    readonly status = 422,
  ) {
    super(message);
  }
}

export async function listarSocios(organizationId: string) {
  const [org] = await db
    .select({ em: organizations.sociosDeclaradosEm })
    .from(organizations)
    .where(eq(organizations.id, organizationId));
  if (!org) throw new SociosError("Organização não encontrada.", 404);
  const linhas = await db
    .select({ id: organizacaoSocios.id, nome: organizacaoSocios.nome, cargo: organizacaoSocios.cargo, cpfFinal: organizacaoSocios.cpfFinal })
    .from(organizacaoSocios)
    .where(eq(organizacaoSocios.organizationId, organizationId))
    .orderBy(asc(organizacaoSocios.criadoEm), asc(organizacaoSocios.id));
  return {
    socios: linhas.map((s) => ({ id: s.id, nome: s.nome, cargo: s.cargo, cpf: cpfMascarado(s.cpfFinal) })),
    declaradaEm: org.em,
    maximo: SOCIOS_MAX,
  };
}

/** Trava a organização e apaga a declaração: a lista mudou, declare de novo. */
async function lockEApagarDeclaracao(tx: Tx, organizationId: string) {
  const [org] = await tx
    .update(organizations)
    .set({ sociosDeclaradosEm: null, sociosDeclaradosPor: null })
    .where(eq(organizations.id, organizationId))
    .returning({ id: organizations.id });
  if (!org) throw new SociosError("Organização não encontrada.", 404);
}

export async function adicionarSocio(organizationId: string, bruto: unknown, userId: string | null) {
  let s;
  try {
    s = validarSocio(bruto);
  } catch (e) {
    if (e instanceof SocioInvalido) throw new SociosError(e.message);
    throw e;
  }
  return db.transaction(async (tx) => {
    await lockEApagarDeclaracao(tx, organizationId);
    // Contado com a organização travada (o UPDATE acima): dois envios na
    // última vaga, um entra.
    const r = await tx.execute(sql`select count(*)::int as n from organizacao_socios where organization_id = ${organizationId}::uuid`);
    if (Number((r.rows[0] as { n: number }).n) >= SOCIOS_MAX) {
      throw new SociosError(`A lista vai até ${SOCIOS_MAX} pessoas.`, 409);
    }
    const [linha] = await tx
      .insert(organizacaoSocios)
      .values({ organizationId, nome: s.nome, cargo: s.cargo, cpfImpressao: impressaoDoCpf(s.cpf), cpfFinal: s.cpf.slice(-2), criadoPor: userId })
      .onConflictDoNothing()
      .returning({ id: organizacaoSocios.id, nome: organizacaoSocios.nome, cargo: organizacaoSocios.cargo, cpfFinal: organizacaoSocios.cpfFinal });
    // O índice decide o repetido (nunca um SELECT antes).
    if (!linha) throw new SociosError("Este CPF já está na lista.", 409);
    return { id: linha.id, nome: linha.nome, cargo: linha.cargo, cpf: cpfMascarado(linha.cpfFinal) };
  });
}

export async function removerSocio(organizationId: string, socioId: string) {
  if (!ehUuid(socioId)) throw new SociosError("Pessoa não encontrada.", 404);
  return db.transaction(async (tx) => {
    await lockEApagarDeclaracao(tx, organizationId);
    const [apagado] = await tx
      .delete(organizacaoSocios)
      .where(and(eq(organizacaoSocios.id, socioId), eq(organizacaoSocios.organizationId, organizationId)))
      .returning({ id: organizacaoSocios.id });
    if (!apagado) throw new SociosError("Pessoa não encontrada.", 404);
  });
}

/** Declara a lista completa. Lista vazia não se declara: toda organização tem quem a administre. */
export async function declararSocios(organizationId: string, userId: string | null) {
  const [feita] = await db
    .update(organizations)
    .set({ sociosDeclaradosEm: new Date(), sociosDeclaradosPor: userId })
    .where(
      and(
        eq(organizations.id, organizationId),
        sql`exists (select 1 from organizacao_socios s where s.organization_id = ${organizationId}::uuid)`,
      ),
    )
    .returning({ em: organizations.sociosDeclaradosEm });
  if (!feita) throw new SociosError("Cadastre pelo menos uma pessoa antes de declarar a lista completa.", 409);
  return feita.em;
}

/** Para a publicação da rifa autorizada: a lista declarada completa. */
export async function problemaDosSocios(organizationId: string, conexao: Pick<typeof db, "select"> = db): Promise<string | null> {
  const [org] = await conexao
    .select({ em: organizations.sociosDeclaradosEm })
    .from(organizations)
    .where(eq(organizations.id, organizationId));
  return org?.em ? null : PROBLEMA_SEM_SOCIOS;
}

/** O CPF é de sócio ou diretor da organização? (Sem CPF válido, não há o que comparar.) */
export async function cpfDeSocio(organizationId: string, cpf: string | null | undefined): Promise<boolean> {
  if (!cpf || !cpfValido(cpf)) return false;
  const [s] = await db
    .select({ id: organizacaoSocios.id })
    .from(organizacaoSocios)
    .where(and(eq(organizacaoSocios.organizationId, organizationId), eq(organizacaoSocios.cpfImpressao, impressaoDoCpf(cpf))))
    .limit(1);
  return Boolean(s);
}
