/**
 * Afiliado de todas as organizações: vínculos, termo de adesão (por versão),
 * aceites, elegibilidade da comissão e o "Seja um colaborador".
 *
 * As regras puras moram em `shared/afiliados.ts`. Aqui: banco, recorte e as
 * travas. Consultar e depois gravar é sempre bug — aderir é `ON CONFLICT` no
 * par (afiliado, organização), e o número da versão do termo sai de dentro
 * da transação com trava de aplicação por organização.
 */
import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { db } from "../db";
import {
  affiliates,
  afiliadoVinculos,
  buyers,
  organizacaoTermos,
  organizations,
  pedidosColaborador,
  termoAceites,
  users,
} from "@shared/schema";
import {
  montarTermo,
  pctDaComissao,
  podeReceberComissao,
  validarPedidoDeColaborador,
  validarTermo,
  type StatusDoVinculo,
} from "@shared/afiliados";
import type { LiberacaoComissao } from "@shared/plataforma";

export class AfiliadoError extends Error {
  constructor(message: string, readonly status = 400) {
    super(message);
    this.name = "AfiliadoError";
  }
}

const TRAVA_TERMO = 811_201;

function regra<T>(f: () => T): T {
  try {
    return f();
  } catch (e) {
    throw new AfiliadoError((e as Error).message);
  }
}

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type Banco = typeof db | Tx;

/* ------------------------------------------------------------------ *
 * Termo de adesão
 * ------------------------------------------------------------------ */

export async function termoAtual(orgId: string, banco: Banco = db) {
  const [t] = await banco
    .select()
    .from(organizacaoTermos)
    .where(eq(organizacaoTermos.organizationId, orgId))
    .orderBy(desc(organizacaoTermos.versao))
    .limit(1);
  return t ?? null;
}

/**
 * Publica uma versão nova. Nunca edita a anterior: rifa publicada com a v1
 * segue com a v1 até o sorteio, e o afiliado precisa aceitar a v2 para as
 * rifas novas.
 */
export async function publicarTermo(orgId: string, entrada: unknown, userId: string | null) {
  const dados = regra(() => validarTermo(entrada));
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(${TRAVA_TERMO}, hashtext(${orgId}))`);
    const [org] = await tx
      .select({ nome: organizations.name, cnpj: organizations.cnpj, liberacao: organizations.liberacaoComissao, arquivada: organizations.archivedAt })
      .from(organizations)
      .where(eq(organizations.id, orgId));
    if (!org || org.arquivada) throw new AfiliadoError("Organização não encontrada.", 404);
    const anterior = await termoAtual(orgId, tx);
    const versao = (anterior?.versao ?? 0) + 1;
    const texto = montarTermo({
      organizacao: { nome: org.nome, cnpj: org.cnpj },
      versao,
      comissaoPct: dados.comissaoPct,
      liberacao: org.liberacao as LiberacaoComissao,
      textoExtra: dados.textoExtra,
    });
    const [novo] = await tx
      .insert(organizacaoTermos)
      .values({ organizationId: orgId, versao, comissaoPct: dados.comissaoPct, textoExtra: dados.textoExtra, texto, criadoPor: userId })
      .returning();
    return novo;
  });
}

/* ------------------------------------------------------------------ *
 * Vínculos
 * ------------------------------------------------------------------ */

/** Organização ativa, pelo endereço — arquivada ou suspensa não recebe adesão. */
async function organizacaoParaAderir(slug: string) {
  const [org] = await db
    .select({ id: organizations.id, nome: organizations.name, slug: organizations.slug })
    .from(organizations)
    .where(and(eq(organizations.slug, slug), isNull(organizations.archivedAt), eq(organizations.active, true)));
  if (!org) throw new AfiliadoError("Organização não encontrada.", 404);
  return org;
}

/**
 * Aderir a uma organização (ou aceitar a versão nova do termo dela). Se a
 * organização tem termo, o aceite tem de ser da versão **em vigor** — quem
 * aceitou olhando a v1 enquanto a v2 saía recebe 409 e lê de novo.
 */
export async function aderir(
  affiliateId: string,
  slug: string,
  entrada: { versao?: unknown; identidade: { ipHash: string | null; deviceHash: string | null } },
) {
  const org = await organizacaoParaAderir(slug);
  return db.transaction(async (tx) => {
    const [aff] = await tx.select({ kind: affiliates.kind }).from(affiliates).where(eq(affiliates.id, affiliateId));
    if (!aff || aff.kind !== "online") throw new AfiliadoError("Só afiliado adere a organizações.", 403);

    const termo = await termoAtual(org.id, tx);
    if (termo && Number(entrada.versao) !== termo.versao) {
      throw new AfiliadoError(`O termo de ${org.nome} mudou (versão ${termo.versao}). Leia de novo antes de aceitar.`, 409);
    }

    // Pedido novo, ou de volta depois de sair/ser recusado: volta a pendente.
    // Aprovado continua aprovado (aceitar a versão nova não reabre a análise).
    const [vinculo] = await tx
      .insert(afiliadoVinculos)
      .values({ affiliateId, organizationId: org.id, status: "pendente" })
      .onConflictDoUpdate({
        target: [afiliadoVinculos.affiliateId, afiliadoVinculos.organizationId],
        set: {
          status: sql`case when ${afiliadoVinculos.status} = 'aprovado' then 'aprovado' else 'pendente' end`,
          decididoEm: sql`case when ${afiliadoVinculos.status} = 'aprovado' then ${afiliadoVinculos.decididoEm} else null end`,
        },
      })
      .returning();

    if (termo) {
      await tx
        .insert(termoAceites)
        .values({
          vinculoId: vinculo.id,
          termoId: termo.id,
          versao: termo.versao,
          texto: termo.texto,
          ipHash: entrada.identidade.ipHash,
          deviceHash: entrada.identidade.deviceHash,
        })
        .onConflictDoNothing();
    }
    return { status: vinculo.status as StatusDoVinculo, versao: termo?.versao ?? null };
  });
}

/** Sair: o vínculo vira "desfeito". O que já ganhou continua dele. */
export async function sair(affiliateId: string, slug: string) {
  const [org] = await db.select({ id: organizations.id }).from(organizations).where(eq(organizations.slug, slug));
  if (!org) throw new AfiliadoError("Organização não encontrada.", 404);
  const r = await db
    .update(afiliadoVinculos)
    .set({ status: "desfeito", decididoEm: new Date() })
    .where(and(eq(afiliadoVinculos.affiliateId, affiliateId), eq(afiliadoVinculos.organizationId, org.id)))
    .returning({ id: afiliadoVinculos.id });
  if (r.length === 0) throw new AfiliadoError("Você não tem vínculo com esta organização.", 404);
}

/**
 * A organização decide o pedido (ou muda depois): aprovar, recusar, desfazer
 * e o percentual combinado. Recorte: o vínculo é da organização da sessão —
 * o do vizinho é 404, conferido no próprio `UPDATE`.
 */
export async function decidirVinculo(
  orgId: string | null,
  vinculoId: string,
  entrada: { status?: unknown; commissionPct?: unknown },
) {
  const mudar: Partial<typeof afiliadoVinculos.$inferInsert> = {};
  if (entrada.status !== undefined) {
    if (!["aprovado", "recusado", "desfeito"].includes(String(entrada.status))) {
      throw new AfiliadoError("Status inválido.");
    }
    mudar.status = String(entrada.status);
    mudar.decididoEm = new Date();
  }
  if (entrada.commissionPct !== undefined) {
    const pct = entrada.commissionPct === null ? null : Number(entrada.commissionPct);
    if (pct !== null && (!Number.isInteger(pct) || pct < 0 || pct > 50)) throw new AfiliadoError("Comissão de 0 a 50%.");
    mudar.commissionPct = pct;
  }
  if (Object.keys(mudar).length === 0) throw new AfiliadoError("Nada para mudar.");
  const [feito] = await db
    .update(afiliadoVinculos)
    .set(mudar)
    .where(and(eq(afiliadoVinculos.id, vinculoId), orgId ? eq(afiliadoVinculos.organizationId, orgId) : undefined))
    .returning();
  if (!feito) throw new AfiliadoError("Vínculo não encontrado.", 404);
  // Cadastro antigo nascia "pendente" até a organização aprovar; a
  // aprovação do vínculo é essa aprovação — sem isso ele não entraria.
  if (feito.status === "aprovado") {
    await db
      .update(affiliates)
      .set({ status: "active", approvedAt: new Date() })
      .where(and(eq(affiliates.id, feito.affiliateId), eq(affiliates.status, "pending")));
  }
  return feito;
}

/** Os vínculos de uma organização (ou de todas, para a plataforma). */
export async function vinculosDaOrganizacao(orgId: string | null) {
  const termos = orgId ? await termoAtual(orgId) : null;
  const linhas = await db
    .select({
      vinculo: afiliadoVinculos,
      affiliate: { id: affiliates.id, code: affiliates.code, status: affiliates.status, commissionPct: affiliates.commissionPct },
      user: { name: users.name, email: users.email, phone: users.phone },
      organizacao: organizations.name,
      aceiteVersao: sql<number | null>`(
        select max(ta.versao) from termo_aceites ta where ta.vinculo_id = "afiliado_vinculos"."id"
      )`,
      salesCents: sql<number>`coalesce((
        select sum(o.amount_cents) from orders o join campaigns c on c.id = o.campaign_id
         where o.affiliate_id = "affiliates"."id" and o.status = 'paid'
           and c.organization_id = "afiliado_vinculos"."organization_id"
      ), 0)::int`,
    })
    .from(afiliadoVinculos)
    .innerJoin(affiliates, eq(affiliates.id, afiliadoVinculos.affiliateId))
    .innerJoin(users, eq(users.id, affiliates.userId))
    .innerJoin(organizations, eq(organizations.id, afiliadoVinculos.organizationId))
    .where(orgId ? eq(afiliadoVinculos.organizationId, orgId) : undefined)
    .orderBy(sql`case ${afiliadoVinculos.status} when 'pendente' then 0 else 1 end`, desc(afiliadoVinculos.createdAt));
  return linhas.map((l) => ({
    ...l,
    aceiteVersao: l.aceiteVersao === null ? null : Number(l.aceiteVersao),
    termoVersaoAtual: termos?.versao ?? null,
  }));
}

/** As organizações que o afiliado pode escolher, com o termo e o vínculo dele. */
export async function organizacoesDoAfiliado(affiliateId: string) {
  const orgs = await db
    .select({ id: organizations.id, slug: organizations.slug, nome: organizations.name, cidade: organizations.cidade, uf: organizations.uf })
    .from(organizations)
    .where(and(isNull(organizations.archivedAt), eq(organizations.active, true)))
    .orderBy(organizations.name);
  const vinculos = await db.select().from(afiliadoVinculos).where(eq(afiliadoVinculos.affiliateId, affiliateId));
  const aceites = vinculos.length
    ? await db
        .select({ vinculoId: termoAceites.vinculoId, versao: termoAceites.versao })
        .from(termoAceites)
        .where(inArray(termoAceites.vinculoId, vinculos.map((v) => v.id)))
    : [];
  const termos = await db
    .select()
    .from(organizacaoTermos)
    .where(inArray(organizacaoTermos.organizationId, orgs.length ? orgs.map((o) => o.id) : ["00000000-0000-0000-0000-000000000000"]))
    .orderBy(desc(organizacaoTermos.versao));
  return orgs.map((o) => {
    const v = vinculos.find((x) => x.organizationId === o.id);
    const termo = termos.find((t) => t.organizationId === o.id) ?? null;
    const aceitas = v ? aceites.filter((a) => a.vinculoId === v.id).map((a) => a.versao) : [];
    return {
      slug: o.slug,
      nome: o.nome,
      local: o.cidade && o.uf ? `${o.cidade}/${o.uf}` : o.cidade ?? o.uf ?? null,
      vinculo: v ? { status: v.status as StatusDoVinculo, commissionPct: v.commissionPct } : null,
      termo: termo ? { versao: termo.versao, comissaoPct: termo.comissaoPct, texto: termo.texto } : null,
      aceitouVersaoAtual: termo ? aceitas.includes(termo.versao) : true,
    };
  });
}

/** O termo em vigor de uma organização, pelo endereço (cadastro e painel). */
export async function termoPublico(slug: string) {
  const [org] = await db
    .select({ id: organizations.id, nome: organizations.name })
    .from(organizations)
    .where(and(eq(organizations.slug, slug), isNull(organizations.archivedAt)));
  if (!org) throw new AfiliadoError("Organização não encontrada.", 404);
  const t = await termoAtual(org.id);
  return { organizacao: org.nome, termo: t ? { versao: t.versao, comissaoPct: t.comissaoPct, texto: t.texto } : null };
}

/* ------------------------------------------------------------------ *
 * Elegibilidade e percentual (usados no pedido e no pagamento)
 * ------------------------------------------------------------------ */

/**
 * Este afiliado recebe comissão nesta rifa, e quanto? Cambista (venda
 * física) não passa por aqui: ele é da organização e o percentual é o dele.
 *
 * O vínculo "de casa" (afiliado antigo, com a organização no usuário) conta
 * como aprovado — é o que existia antes dos vínculos, e o relógio cria o
 * vínculo dele de qualquer jeito (`migrarAfiliadosAntigos`).
 */
export async function comissaoNaRifa(
  banco: Banco,
  affiliateId: string,
  campaign: { id: string; organizationId: string; termoId: string | null; commissionPctDefault: number | null },
): Promise<{ recebe: boolean; pct: number }> {
  const [a] = await banco
    .select({ status: affiliates.status, kind: affiliates.kind, pct: affiliates.commissionPct, orgDoUsuario: users.organizationId })
    .from(affiliates)
    .innerJoin(users, eq(users.id, affiliates.userId))
    .where(eq(affiliates.id, affiliateId));
  if (!a) return { recebe: false, pct: 0 };
  if (a.kind !== "online") {
    return { recebe: a.status === "active" && a.orgDoUsuario === campaign.organizationId, pct: a.pct ?? campaign.commissionPctDefault ?? 0 };
  }
  const [v] = await banco
    .select()
    .from(afiliadoVinculos)
    .where(and(eq(afiliadoVinculos.affiliateId, affiliateId), eq(afiliadoVinculos.organizationId, campaign.organizationId)));
  const vinculoAprovado = v ? v.status === "aprovado" : a.orgDoUsuario === campaign.organizationId;

  let termoPct: number | null = null;
  let aceitou = false;
  if (campaign.termoId) {
    const [t] = await banco.select({ pct: organizacaoTermos.comissaoPct }).from(organizacaoTermos).where(eq(organizacaoTermos.id, campaign.termoId));
    termoPct = t?.pct ?? null;
    if (v) {
      const [ac] = await banco
        .select({ id: termoAceites.id })
        .from(termoAceites)
        .where(and(eq(termoAceites.vinculoId, v.id), eq(termoAceites.termoId, campaign.termoId)));
      aceitou = Boolean(ac);
    }
  }
  const recebe = podeReceberComissao({
    afiliadoAtivo: a.status === "active",
    vinculoAprovado,
    termoDaRifa: campaign.termoId,
    aceitouTermoDaRifa: aceitou,
  });
  return {
    recebe,
    pct: pctDaComissao({ termoPct, vinculoPct: v?.commissionPct ?? null, afiliadoPct: a.pct, rifaPct: campaign.commissionPctDefault }),
  };
}

/* ------------------------------------------------------------------ *
 * "Seja um colaborador"
 * ------------------------------------------------------------------ */

export async function pedirColaboracao(buyerId: string, slug: string, entrada: unknown) {
  const dados = regra(() => validarPedidoDeColaborador(entrada));
  const org = await organizacaoParaAderir(slug);
  const [novo] = await db
    .insert(pedidosColaborador)
    .values({ organizationId: org.id, buyerId, cidade: dados.cidade, mensagem: dados.mensagem })
    .onConflictDoNothing()
    .returning({ id: pedidosColaborador.id });
  if (!novo) throw new AfiliadoError(`Você já tem um pedido em análise com ${org.nome}.`, 409);
  return novo;
}

/**
 * Pedidos para ser colaborador. Quem pediu é cliente que se apresentou à
 * organização (quer vender para ela): por isso ela vê nome e telefone.
 */
export async function pedidosDeColaborador(orgId: string | null) {
  return db
    .select({
      id: pedidosColaborador.id,
      status: pedidosColaborador.status,
      cidade: pedidosColaborador.cidade,
      mensagem: pedidosColaborador.mensagem,
      createdAt: pedidosColaborador.createdAt,
      nome: buyers.name,
      telefone: buyers.phone,
      organizacao: organizations.name,
    })
    .from(pedidosColaborador)
    .innerJoin(buyers, eq(buyers.id, pedidosColaborador.buyerId))
    .innerJoin(organizations, eq(organizations.id, pedidosColaborador.organizationId))
    .where(orgId ? eq(pedidosColaborador.organizationId, orgId) : undefined)
    .orderBy(sql`case ${pedidosColaborador.status} when 'pendente' then 0 else 1 end`, desc(pedidosColaborador.createdAt))
    .limit(200);
}

export async function decidirPedidoDeColaborador(orgId: string | null, id: string, status: unknown) {
  if (!["atendido", "recusado"].includes(String(status))) throw new AfiliadoError("Status inválido.");
  const [feito] = await db
    .update(pedidosColaborador)
    .set({ status: String(status), decididoEm: new Date() })
    .where(
      and(
        eq(pedidosColaborador.id, id),
        eq(pedidosColaborador.status, "pendente"),
        orgId ? eq(pedidosColaborador.organizationId, orgId) : undefined,
      ),
    )
    .returning({ id: pedidosColaborador.id });
  if (!feito) throw new AfiliadoError("Pedido não encontrado.", 404);
}

/* ------------------------------------------------------------------ *
 * Migração dos afiliados de antes (relógio, idempotente)
 * ------------------------------------------------------------------ */

/**
 * Afiliado criado antes dos vínculos tem a organização no usuário. Cria o
 * vínculo dele (com o status e o percentual que tinha), e preenche a
 * organização dos cupons e dos saques antigos. Idempotente: `ON CONFLICT` e
 * `WHERE ... IS NULL`.
 */
export async function migrarAfiliadosAntigos() {
  const r = await db.execute(sql`
    insert into afiliado_vinculos (affiliate_id, organization_id, status, commission_pct, decidido_em)
    select a.id, u.organization_id,
           case a.status when 'active' then 'aprovado' when 'blocked' then 'recusado' else 'pendente' end,
           a.commission_pct, a.approved_at
      from affiliates a
      join users u on u.id = a.user_id
     where a.kind = 'online' and u.organization_id is not null
    on conflict (affiliate_id, organization_id) do nothing`);
  await db.execute(sql`
    update coupons k set organization_id = coalesce(
      (select c.organization_id from campaigns c where c.id = k.campaign_id),
      (select u.organization_id from affiliates a join users u on u.id = a.user_id where a.id = k.affiliate_id))
     where k.organization_id is null`);
  await db.execute(sql`
    update payouts p set organization_id = (
      select u.organization_id from affiliates a join users u on u.id = a.user_id where a.id = p.affiliate_id)
     where p.organization_id is null`);
  return r.rowCount ?? 0;
}

/** Cupom de uma organização não vale na rifa de outra. */
export function cupomValeNaRifa(cupom: { organizationId: string | null }, campaign: { organizationId: string }) {
  return !cupom.organizationId || cupom.organizationId === campaign.organizationId;
}
