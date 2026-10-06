/**
 * Anexos do contrato por modalidade (regras em `shared/contratoAnexos.ts`).
 *
 * Cada modalidade tem versões; a em vigor é a mais nova. A rifa exige o
 * aceite da versão em vigor de cada anexo cuja modalidade ela usa — lida dos
 * dados dela, nunca escolhida pela promotora — e grava, ao publicar, as
 * versões que valiam (`campaigns.contrato_anexo_ids`). A mesma trava do
 * contrato (`TRAVA_CONTRATO`): publicar anexo pega a exclusiva; aceitar e
 * publicar rifa, a compartilhada.
 */
import { and, count, desc, eq, sql } from "drizzle-orm";
import { db } from "../db";
import { campaigns, contratoAnexoAceites, contratoAnexos } from "@shared/schema";
import { ContratoError, preencherContrato, problemaNoPreenchimento, versaoLida } from "@shared/contratoPromotora";
import {
  bloqueioDosAnexos,
  ehModalidade,
  MODALIDADES,
  MODALIDADES_DE_ANEXO,
  modalidadesDaRifa,
  validarAnexo,
  type ModalidadeDeAnexo,
} from "@shared/contratoAnexos";
import type { DadosDaEmpresa } from "@shared/legal";
import type { RequestIdentity } from "./antifraude";
import { hashDoContrato, TRAVA_CONTRATO } from "./contratoPromotora";

type Banco = Pick<typeof db, "select" | "execute">;
type Anexo = typeof contratoAnexos.$inferSelect;

/** A versão em vigor de cada modalidade que tem anexo publicado. */
export async function anexosEmVigor(banco: Banco = db): Promise<Map<ModalidadeDeAnexo, Anexo>> {
  const r = await banco.execute(sql`
    select distinct on (modalidade) id from contrato_anexos order by modalidade, versao desc`);
  const ids = (r.rows as { id: string }[]).map((l) => l.id);
  const m = new Map<ModalidadeDeAnexo, Anexo>();
  if (!ids.length) return m;
  const linhas = await banco
    .select()
    .from(contratoAnexos)
    .where(sql`${contratoAnexos.id} in (${sql.join(ids.map((i) => sql`${i}::uuid`), sql`, `)})`);
  for (const l of linhas) if (ehModalidade(l.modalidade)) m.set(l.modalidade, l);
  return m;
}

/** O que a rifa usa, lido do banco: método, bônus, cota premiada e entidade beneficiada. */
export async function modalidadesDaCampanha(campaignId: string, banco: Banco = db): Promise<ModalidadeDeAnexo[]> {
  const r = await banco.execute(sql`
    select c.metodo_apuracao, c.aceita_cota_bonus,
           exists (select 1 from prized_quotas p where p.campaign_id = c.id) as premiadas,
           exists (select 1 from campaign_banners_divulgacao b where b.campaign_id = c.id) as entidade
      from campaigns c where c.id = ${campaignId}::uuid`);
  const l = r.rows[0] as { metodo_apuracao: string | null; aceita_cota_bonus: boolean; premiadas: boolean; entidade: boolean } | undefined;
  if (!l) return [];
  return modalidadesDaRifa({
    metodoApuracao: l.metodo_apuracao,
    aceitaCotaBonus: Boolean(l.aceita_cota_bonus),
    temPremiadas: Boolean(l.premiadas),
    temEntidade: Boolean(l.entidade),
  });
}

/**
 * Para as modalidades dadas: os anexos em vigor e quais a organização ainda
 * não aceitou. `ids` são os anexos (aceitos) que a rifa passa a seguir.
 */
export async function anexosParaModalidades(
  orgId: string,
  modalidades: ModalidadeDeAnexo[],
  banco: Banco = db,
): Promise<{ problema: string | null; ids: string[] }> {
  if (!modalidades.length) return { problema: null, ids: [] };
  const vigor = await anexosEmVigor(banco);
  const exigidos = modalidades.map((m) => vigor.get(m)).filter((a): a is Anexo => Boolean(a));
  if (!exigidos.length) return { problema: null, ids: [] };
  const aceitos = await banco
    .select({ anexoId: contratoAnexoAceites.anexoId })
    .from(contratoAnexoAceites)
    .where(
      and(
        eq(contratoAnexoAceites.organizationId, orgId),
        sql`${contratoAnexoAceites.anexoId} in (${sql.join(exigidos.map((a) => sql`${a.id}::uuid`), sql`, `)})`,
      ),
    );
  const ok = new Set(aceitos.map((a) => a.anexoId));
  const faltando = exigidos.filter((a) => !ok.has(a.id));
  return {
    problema: faltando.length ? bloqueioDosAnexos(faltando.map((a) => ({ titulo: a.titulo, versao: a.versao }))) : null,
    ids: exigidos.map((a) => a.id),
  };
}

/** A rifa inteira: o que barra a publicação e as versões que ela grava. */
export async function anexosDaPublicacao(campaignId: string, orgId: string, banco: Banco = db) {
  return anexosParaModalidades(orgId, await modalidadesDaCampanha(campaignId, banco), banco);
}

/**
 * A modalidade entrando numa rifa já publicada (entidade beneficiada, cota
 * premiada): exige o aceite do anexo dela e, aceito, liga a versão à rifa.
 * Rascunho não precisa — a publicação confere tudo de uma vez.
 */
export async function exigirAnexoNaRifa(campaignId: string, orgId: string, modalidade: ModalidadeDeAnexo) {
  const [c] = await db.select({ status: campaigns.status }).from(campaigns).where(eq(campaigns.id, campaignId));
  if (!c || c.status === "draft") return;
  await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock_shared(${TRAVA_CONTRATO})`);
    const { problema, ids } = await anexosParaModalidades(orgId, [modalidade], tx);
    if (problema) throw new ContratoError(problema, 409);
    for (const id of ids) {
      await tx.execute(sql`
        update campaigns set contrato_anexo_ids = array_append(contrato_anexo_ids, ${id}::uuid)
         where id = ${campaignId}::uuid and not (${id}::uuid = any(contrato_anexo_ids))`);
    }
  });
}

/** Prévia do anexo: o texto com os campos da empresa e o que falta. */
export function previaDoAnexo(entrada: unknown, empresa: DadosDaEmpresa) {
  const { texto: modelo } = validarAnexo(entrada);
  const p = preencherContrato(modelo, empresa);
  return { ...p, problema: problemaNoPreenchimento(p), hash: hashDoContrato(p.texto) };
}

/** Versão nova do anexo de uma modalidade. Nunca edita a anterior. */
export async function publicarAnexo(entrada: unknown, userId: string | null, empresa: DadosDaEmpresa) {
  const { modalidade, titulo, texto: modelo } = validarAnexo(entrada);
  const preenchido = preencherContrato(modelo, empresa);
  const problema = problemaNoPreenchimento(preenchido);
  if (problema) throw new ContratoError(problema, 422);
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(${TRAVA_CONTRATO})`);
    const [anterior] = await tx
      .select()
      .from(contratoAnexos)
      .where(eq(contratoAnexos.modalidade, modalidade))
      .orderBy(desc(contratoAnexos.versao))
      .limit(1);
    if (anterior && anterior.texto === preenchido.texto && anterior.titulo === titulo) {
      throw new ContratoError(`Este texto já é a versão ${anterior.versao} em vigor deste anexo.`, 409);
    }
    const [novo] = await tx
      .insert(contratoAnexos)
      .values({
        modalidade,
        versao: (anterior?.versao ?? 0) + 1,
        titulo,
        texto: preenchido.texto,
        modelo,
        textoSha256: hashDoContrato(preenchido.texto),
        publicadoPor: userId,
      })
      .returning();
    return { modalidade, versao: novo.versao, hash: novo.textoSha256 };
  });
}

/** Aceite da organização, da versão que a pessoa leu (409 se outra saiu no meio). */
export async function aceitarAnexo(
  orgId: string,
  userId: string,
  entrada: { modalidade: unknown; versao: unknown; identidade: RequestIdentity },
) {
  if (!ehModalidade(entrada.modalidade)) throw new ContratoError("Anexo não encontrado.", 404);
  const modalidade = entrada.modalidade;
  const lida = versaoLida(entrada.versao);
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock_shared(${TRAVA_CONTRATO})`);
    const a = (await anexosEmVigor(tx)).get(modalidade);
    if (!a) throw new ContratoError("Não há anexo publicado desta modalidade.", 404);
    if (a.versao !== lida) throw new ContratoError(`O anexo mudou (versão ${a.versao}). Leia de novo antes de aceitar.`, 409);
    const [novo] = await tx
      .insert(contratoAnexoAceites)
      .values({
        anexoId: a.id,
        organizationId: orgId,
        userId,
        modalidade,
        versao: a.versao,
        texto: a.texto,
        textoSha256: hashDoContrato(a.texto),
        ipHash: entrada.identidade.ipHash,
        deviceHash: entrada.identidade.deviceHash,
      })
      .onConflictDoNothing()
      .returning({ id: contratoAnexoAceites.id });
    return { modalidade, versao: a.versao, novo: Boolean(novo), hash: hashDoContrato(a.texto) };
  });
}

/** A tela da organização: cada anexo em vigor, quando ele vale e se ela já aceitou. */
export async function anexosDaOrganizacao(orgId: string) {
  const vigor = await anexosEmVigor();
  if (!vigor.size) return [];
  const aceitos = await db
    .select({ anexoId: contratoAnexoAceites.anexoId, aceitoEm: contratoAnexoAceites.aceitoEm })
    .from(contratoAnexoAceites)
    .where(eq(contratoAnexoAceites.organizationId, orgId));
  const quando = new Map(aceitos.map((a) => [a.anexoId, a.aceitoEm]));
  return MODALIDADES.filter((m) => vigor.has(m)).map((m) => {
    const a = vigor.get(m)!;
    return {
      modalidade: m,
      quando: MODALIDADES_DE_ANEXO[m].quando,
      titulo: a.titulo,
      versao: a.versao,
      texto: a.texto,
      hash: a.textoSha256 ?? hashDoContrato(a.texto),
      aceitoEm: quando.get(a.id) ?? null,
    };
  });
}

/** A tela da plataforma: por modalidade, a versão em vigor, quantas aceitaram e se os dados da empresa mudaram. */
export async function anexosDaPlataforma(empresa: DadosDaEmpresa) {
  const vigor = await anexosEmVigor();
  const contagem = await db
    .select({ anexoId: contratoAnexoAceites.anexoId, n: count() })
    .from(contratoAnexoAceites)
    .groupBy(contratoAnexoAceites.anexoId);
  const n = new Map(contagem.map((c) => [c.anexoId, Number(c.n)]));
  return MODALIDADES.map((m) => {
    const a = vigor.get(m);
    const hoje = a?.modelo ? preencherContrato(a.modelo, empresa) : null;
    return {
      modalidade: m,
      rotulo: MODALIDADES_DE_ANEXO[m].rotulo,
      quando: MODALIDADES_DE_ANEXO[m].quando,
      anexo: a
        ? {
            titulo: a.titulo,
            versao: a.versao,
            texto: a.texto,
            modelo: a.modelo,
            publicadoEm: a.createdAt,
            hash: a.textoSha256 ?? hashDoContrato(a.texto),
            aceites: n.get(a.id) ?? 0,
            desatualizado: Boolean(hoje && !problemaNoPreenchimento(hoje) && hoje.texto !== a.texto),
          }
        : null,
    };
  });
}
