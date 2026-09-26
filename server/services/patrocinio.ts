/**
 * Rifas patrocinadas por clique (etapa 15). As regras puras estão em
 * `shared/patrocinio.ts`.
 *
 * Dinheiro que anda aqui: a recarga (Pix para a conta da plataforma, sem
 * split) credita o saldo da organização pelo livro (`patrocinio_lancamentos`,
 * chave única — o webhook repetido não credita duas vezes); cada clique
 * cobrado desconta num `UPDATE` condicional (saldo ≥ preço), na mesma
 * transação que grava o clique. Saldo nunca fica negativo.
 */
import { randomInt, randomUUID } from "node:crypto";
import type { Request } from "express";
import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "../db";
import {
  campaigns,
  organizations,
  patrocinioCliques,
  patrocinioLancamentos,
  patrocinioRecargas,
  patrocinios,
  users,
} from "@shared/schema";
import {
  JANELA_DO_CLIQUE_HORAS,
  PATROCINIOS_POR_ORGANIZACAO,
  custoPorVenda,
  ehRobo,
  escolherPatrocinadas,
  problemaNaRecarga,
} from "@shared/patrocinio";
import { EXIGE_CPF, type ProvedorPix } from "@shared/plataforma";
import { activePaymentProvider } from "../payments";
import { isUniqueViolation } from "../pgError";
import { assertCampaignInScope, orgOf } from "./orgs";
import { getPlataforma } from "./settings";

export class PatrocinioError extends Error {
  constructor(message: string, readonly status = 400) {
    super(message);
    this.name = "PatrocinioError";
  }
}

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

async function exigirLigado() {
  const cfg = await getPlataforma();
  if (!cfg.patrocinioLigado) throw new PatrocinioError("As rifas patrocinadas não estão ativas na plataforma.", 409);
  return cfg;
}

/** Credita (ou debita) o saldo pelo livro. Só mexe no saldo se a chave for nova. */
async function lancar(
  tx: Tx,
  p: { organizationId: string; valorCents: number; motivo: string; chave: string; descricao?: string; userId?: string | null },
) {
  const [linha] = await tx
    .insert(patrocinioLancamentos)
    .values({
      organizationId: p.organizationId,
      valorCents: p.valorCents,
      motivo: p.motivo,
      chave: p.chave,
      descricao: p.descricao ?? null,
      userId: p.userId ?? null,
    })
    .onConflictDoNothing()
    .returning({ id: patrocinioLancamentos.id });
  if (!linha) return false;
  // Débito condicional: o saldo nunca fica negativo (o ajuste que tentaria
  // passar do zero desfaz a transação inteira).
  const [ok] = await tx
    .update(organizations)
    .set({ patrocinioSaldoCents: sql`${organizations.patrocinioSaldoCents} + ${p.valorCents}` })
    .where(and(eq(organizations.id, p.organizationId), sql`${organizations.patrocinioSaldoCents} + ${p.valorCents} >= 0`))
    .returning({ id: organizations.id });
  if (!ok) throw new PatrocinioError("O saldo não pode ficar negativo.", 409);
  return true;
}

/* ------------------------------------------------------------------ *
 * Patrocínios (organizador)
 * ------------------------------------------------------------------ */

export async function criarPatrocinio(req: Request, campaignId: string) {
  await exigirLigado();
  const campanha = await assertCampaignInScope(req, campaignId);
  if (campanha.status !== "published") throw new PatrocinioError("Só rifa no ar pode ser patrocinada.", 409);
  try {
    return await db.transaction(async (tx) => {
      // Contar e inserir sob a trava da organização: dois pedidos ao mesmo
      // tempo não passam do limite.
      await tx.execute(sql`select pg_advisory_xact_lock(811401, hashtext(${campanha.organizationId}))`);
      const [{ n }] = (
        await tx.execute(sql`select count(*)::int as n from patrocinios where organization_id = ${campanha.organizationId}::uuid and ativo`)
      ).rows as { n: number }[];
      if (Number(n) >= PATROCINIOS_POR_ORGANIZACAO) {
        throw new PatrocinioError(`Até ${PATROCINIOS_POR_ORGANIZACAO} rifas patrocinadas ao mesmo tempo.`, 409);
      }
      const [p] = await tx.insert(patrocinios).values({ organizationId: campanha.organizationId, campaignId: campanha.id }).returning();
      return p;
    });
  } catch (err) {
    if (isUniqueViolation(err, "uq_patrocinio_rifa_ativa")) throw new PatrocinioError("Esta rifa já está patrocinada.", 409);
    throw err;
  }
}

/** Pausa o patrocínio. O do vizinho é 404, e a conferência vem antes do UPDATE. */
export async function pausarPatrocinio(req: Request, id: string) {
  const [p] = await db.select().from(patrocinios).where(eq(patrocinios.id, id));
  const org = orgOf(req);
  if (!p || (org && p.organizationId !== org)) throw new PatrocinioError("Patrocínio não encontrado.", 404);
  const [feito] = await db.update(patrocinios).set({ ativo: false }).where(eq(patrocinios.id, id)).returning();
  return feito;
}

/* ------------------------------------------------------------------ *
 * Recarga por Pix e ajuste da plataforma
 * ------------------------------------------------------------------ */

export async function pedirRecarga(req: Request, valorCents: number) {
  const cfg = await exigirLigado();
  const orgId = orgOf(req);
  if (!orgId) throw new PatrocinioError("A plataforma lança crédito pelo ajuste, não por recarga.", 400);
  const problema = problemaNaRecarga(valorCents, cfg.recargaMinimaCents);
  if (problema) throw new PatrocinioError(problema);

  const [org] = await db
    .select({ nome: organizations.name, cnpj: organizations.cnpj })
    .from(organizations)
    .where(eq(organizations.id, orgId));
  const provider = await activePaymentProvider();
  const documento = (org?.cnpj ?? "").replace(/\D/g, "");
  if (EXIGE_CPF[provider.name as ProvedorPix] && documento.length !== 14 && documento.length !== 11) {
    throw new PatrocinioError("Cadastre o CNPJ da organização para gerar o Pix da recarga.", 400);
  }
  const [u] = await db.select({ phone: users.phone }).from(users).where(eq(users.id, req.user!.id));
  const expiresAt = new Date(Date.now() + 30 * 60_000);

  // Faixa própria (9 dígitos): não colide com os códigos de pedido (8 dígitos).
  for (let i = 0; i < 5; i++) {
    const codigo = randomInt(900_000_000, 1_000_000_000);
    let recarga;
    try {
      [recarga] = await db.insert(patrocinioRecargas).values({ organizationId: orgId, codigo, valorCents, expiresAt }).returning();
    } catch (err) {
      if (isUniqueViolation(err, "uq_patrocinio_recarga_codigo")) continue;
      throw err;
    }
    // Chamada externa fora de transação; sem split: o dinheiro é da plataforma.
    const charge = await provider.createPixCharge({
      orderCode: codigo,
      amountCents: valorCents,
      description: `Recarga de rifas patrocinadas — ${org?.nome ?? "organização"}`,
      payer: { name: org?.nome ?? "Organização", phone: u?.phone ?? "", cpf: documento || undefined },
      expiresAt,
    });
    const [comPix] = await db
      .update(patrocinioRecargas)
      .set({ provider: charge.provider, chargeId: charge.chargeId, pixQr: charge.qr, pixCopyPaste: charge.copyPaste })
      .where(eq(patrocinioRecargas.id, recarga.id))
      .returning();
    return comPix;
  }
  throw new PatrocinioError("Não foi possível gerar a recarga. Tente de novo.", 500);
}

/**
 * Webhook "pago": se a cobrança é de uma recarga, credita (uma vez só) e
 * devolve `true` — o webhook não procura pedido. Recarga já paga também é
 * `true`: é o mesmo evento chegando de novo.
 */
export async function confirmarRecarga(chargeId: string): Promise<boolean> {
  const [r] = await db.select().from(patrocinioRecargas).where(eq(patrocinioRecargas.chargeId, chargeId));
  if (!r) return false;
  await db.transaction(async (tx) => {
    const [paga] = await tx
      .update(patrocinioRecargas)
      .set({ status: "paga", pagaEm: new Date() })
      .where(and(eq(patrocinioRecargas.id, r.id), eq(patrocinioRecargas.status, "pendente")))
      .returning();
    if (!paga) return;
    await lancar(tx, {
      organizationId: r.organizationId,
      valorCents: r.valorCents,
      motivo: "recarga",
      chave: `recarga:${r.id}`,
      descricao: `Recarga por Pix (${r.codigo})`,
    });
  });
  return true;
}

/** Crédito ou débito lançado pela plataforma (só ela; auditado na rota). */
export async function ajustarSaldo(req: Request, organizationId: string, valorCents: number, descricao: string) {
  if (orgOf(req)) throw new PatrocinioError("Ajuste de saldo é da plataforma.", 403);
  if (!Number.isInteger(valorCents) || valorCents === 0 || Math.abs(valorCents) > 1_000_000) {
    throw new PatrocinioError("Informe o valor do ajuste em centavos (até R$ 10.000,00).");
  }
  const motivo = descricao?.trim() ?? "";
  if (motivo.length < 5) throw new PatrocinioError("Diga o motivo do ajuste.");
  const [org] = await db.select({ id: organizations.id }).from(organizations).where(eq(organizations.id, organizationId));
  if (!org) throw new PatrocinioError("Organização não encontrada.", 404);
  await db.transaction((tx) =>
    lancar(tx, { organizationId, valorCents, motivo: "ajuste", chave: `ajuste:${randomUUID()}`, descricao: motivo.slice(0, 200), userId: req.user!.id }),
  );
  const [s] = await db.select({ saldo: organizations.patrocinioSaldoCents }).from(organizations).where(eq(organizations.id, organizationId));
  return { saldoCents: s.saldo };
}

/* ------------------------------------------------------------------ *
 * Vitrine e clique
 * ------------------------------------------------------------------ */

/** As patrocinadas desta visita (sorteadas entre as que pagam um clique). */
export async function patrocinadasNoAr() {
  const cfg = await getPlataforma();
  if (!cfg.patrocinioLigado) return [];
  const candidatos = await db
    .select({ id: patrocinios.id, campaignId: patrocinios.campaignId, saldoCents: organizations.patrocinioSaldoCents })
    .from(patrocinios)
    .innerJoin(campaigns, eq(campaigns.id, patrocinios.campaignId))
    .innerJoin(organizations, eq(organizations.id, patrocinios.organizationId))
    .where(and(eq(patrocinios.ativo, true), eq(campaigns.status, "published"), sql`${organizations.archivedAt} is null`));
  return escolherPatrocinadas(candidatos, cfg.precoCliqueCents, (n) => randomInt(0, n)).map(({ id, campaignId }) => ({ id, campaignId }));
}

/**
 * Clique na patrocinada. Cobra só se: o programa está ligado, não é robô, há
 * aparelho identificado, o patrocínio está ativo com a rifa no ar, este
 * visitante não clicou nas últimas 24 h, e há saldo. Tudo sob a trava do par
 * (patrocínio, visitante) — dois cliques ao mesmo tempo contam um.
 */
export async function registrarClique(patrocinioId: string, visitanteHash: string | null, userAgent: string | undefined) {
  const cfg = await getPlataforma();
  if (!cfg.patrocinioLigado || !visitanteHash || ehRobo(userAgent)) return false;
  if (!/^[0-9a-f-]{36}$/i.test(patrocinioId)) return false;
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(811402, hashtext(${patrocinioId} || ${visitanteHash}))`);
    const [p] = await tx
      .select({ id: patrocinios.id, organizationId: patrocinios.organizationId, campaignId: patrocinios.campaignId })
      .from(patrocinios)
      .innerJoin(campaigns, eq(campaigns.id, patrocinios.campaignId))
      .where(and(eq(patrocinios.id, patrocinioId), eq(patrocinios.ativo, true), eq(campaigns.status, "published")));
    if (!p) return false;
    const recente = await tx.execute(sql`
      select 1 from patrocinio_cliques
       where patrocinio_id = ${patrocinioId}::uuid and visitante_hash = ${visitanteHash}
         and created_at > now() - make_interval(hours => ${JANELA_DO_CLIQUE_HORAS})
       limit 1`);
    if (recente.rows.length) return false;
    const [pago] = await tx
      .update(organizations)
      .set({ patrocinioSaldoCents: sql`${organizations.patrocinioSaldoCents} - ${cfg.precoCliqueCents}` })
      .where(and(eq(organizations.id, p.organizationId), sql`${organizations.patrocinioSaldoCents} >= ${cfg.precoCliqueCents}`))
      .returning({ id: organizations.id });
    if (!pago) return false;
    await tx.insert(patrocinioCliques).values({
      patrocinioId,
      organizationId: p.organizationId,
      campaignId: p.campaignId,
      visitanteHash,
      valorCents: cfg.precoCliqueCents,
    });
    return true;
  });
}

/* ------------------------------------------------------------------ *
 * Painel (a mesma tela, dois recortes)
 * ------------------------------------------------------------------ */

/** O retorno de cada patrocínio: cliques, gasto e vendas que vieram do bloco. */
async function retornoPorRifa(orgId: string | null, desdeDias = 30) {
  const r = await db.execute(sql`
    select c.id as campaign_id, c.title,
           coalesce(k.cliques, 0)::int as cliques, coalesce(k.gasto, 0)::int as gasto,
           coalesce(v.vendas, 0)::int as vendas, coalesce(v.receita, 0)::int as receita
      from campaigns c
      left join (select campaign_id, count(*) as cliques, sum(valor_cents) as gasto
                   from patrocinio_cliques where created_at > now() - make_interval(days => ${desdeDias})
                  group by campaign_id) k on k.campaign_id = c.id
      left join (select campaign_id, count(*) as vendas, sum(amount_cents) as receita
                   from orders where origem = 'patrocinada' and status = 'paid'
                    and paid_at > now() - make_interval(days => ${desdeDias})
                  group by campaign_id) v on v.campaign_id = c.id
     where (k.cliques is not null or v.vendas is not null)
       ${orgId ? sql`and c.organization_id = ${orgId}::uuid` : sql``}
     order by gasto desc nulls last
     limit 50`);
  return (r.rows as { campaign_id: string; title: string; cliques: number; gasto: number; vendas: number; receita: number }[]).map((x) => ({
    campaignId: x.campaign_id,
    titulo: x.title,
    cliques: Number(x.cliques),
    gastoCents: Number(x.gasto),
    vendas: Number(x.vendas),
    receitaCents: Number(x.receita),
    custoPorVendaCents: custoPorVenda(Number(x.gasto), Number(x.vendas)),
  }));
}

export async function painelDoPatrocinio(req: Request) {
  const cfg = await getPlataforma();
  const org = orgOf(req);
  const config = { ligado: cfg.patrocinioLigado, precoCliqueCents: cfg.precoCliqueCents, recargaMinimaCents: cfg.recargaMinimaCents };
  const retorno = await retornoPorRifa(org);
  if (!org) {
    const organizacoes = await db
      .select({ id: organizations.id, nome: organizations.name, saldoCents: organizations.patrocinioSaldoCents })
      .from(organizations)
      .where(sql`${organizations.archivedAt} is null`)
      .orderBy(desc(organizations.patrocinioSaldoCents));
    return { plataforma: true as const, config, organizacoes, retorno };
  }
  const [o] = await db.select({ saldo: organizations.patrocinioSaldoCents }).from(organizations).where(eq(organizations.id, org));
  const ativos = await db
    .select({ id: patrocinios.id, campaignId: patrocinios.campaignId, titulo: campaigns.title, status: campaigns.status, desde: patrocinios.createdAt })
    .from(patrocinios)
    .innerJoin(campaigns, eq(campaigns.id, patrocinios.campaignId))
    .where(and(eq(patrocinios.organizationId, org), eq(patrocinios.ativo, true)));
  const rifas = await db
    .select({ id: campaigns.id, titulo: campaigns.title })
    .from(campaigns)
    .where(and(eq(campaigns.organizationId, org), eq(campaigns.status, "published")));
  const extrato = await db
    .select({ valorCents: patrocinioLancamentos.valorCents, motivo: patrocinioLancamentos.motivo, descricao: patrocinioLancamentos.descricao, createdAt: patrocinioLancamentos.createdAt })
    .from(patrocinioLancamentos)
    .where(eq(patrocinioLancamentos.organizationId, org))
    .orderBy(desc(patrocinioLancamentos.createdAt))
    .limit(20);
  const recargaPendente = await db
    .select()
    .from(patrocinioRecargas)
    .where(and(eq(patrocinioRecargas.organizationId, org), eq(patrocinioRecargas.status, "pendente"), sql`${patrocinioRecargas.expiresAt} > now()`))
    .orderBy(desc(patrocinioRecargas.createdAt))
    .limit(1);
  return {
    plataforma: false as const,
    config,
    saldoCents: o?.saldo ?? 0,
    ativos,
    rifas,
    extrato,
    recargaPendente: recargaPendente[0] ?? null,
    retorno,
  };
}
