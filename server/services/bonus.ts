/**
 * Programa de bônus (etapa 13): indicação, visitas, metas e o saldo de cotas
 * grátis. As regras puras estão em `shared/bonus.ts`; o resgate (que cria o
 * pedido de R$ 0,00 e reserva as cotas) mora em `orders.ts`, junto do resto
 * do caminho da cota.
 *
 * Tudo que credita passa por `creditar()`: o lançamento tem chave única e o
 * saldo só anda quando a linha entrou, na mesma transação. Chamar duas vezes
 * (webhook repetido, duas réplicas) não credita duas vezes.
 */
import { randomInt } from "node:crypto";
import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "../db";
import { bonusLancamentos, bonusMetas, bonusVisitas, buyers, campaigns, indicacoes, organizations } from "@shared/schema";
import {
  VISITAS_POR_DIA,
  codigoDeIndicacaoValido,
  gerarCodigoDeIndicacao,
  progressoDasMetas,
  validarMeta,
  type Meta,
  type TipoDeMeta,
} from "@shared/bonus";
import { normalizePhone } from "@shared/format";
import { isUniqueViolation } from "../pgError";
import { getPlataforma } from "./settings";
import { publicUrl } from "./urls";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type Executor = Tx | typeof db;

export class BonusError extends Error {
  constructor(message: string, readonly status = 400) {
    super(message);
    this.name = "BonusError";
  }
}

/**
 * Lança no livro-razão e mexe no saldo — só se a chave for nova. Devolve se
 * lançou. O saldo pode ficar negativo no estorno de uma indicação já
 * resgatada: é dívida, e o resgate (condicional em saldo ≥ pedido) trava.
 */
export async function creditar(
  tx: Executor,
  p: { buyerId: string; quantidade: number; motivo: string; chave: string; descricao?: string; orderId?: string },
): Promise<boolean> {
  const [linha] = await tx
    .insert(bonusLancamentos)
    .values({
      buyerId: p.buyerId,
      quantidade: p.quantidade,
      motivo: p.motivo,
      chave: p.chave,
      descricao: p.descricao ?? null,
      orderId: p.orderId ?? null,
    })
    .onConflictDoNothing()
    .returning({ id: bonusLancamentos.id });
  if (!linha) return false;
  await tx
    .update(buyers)
    .set({ bonusSaldo: sql`${buyers.bonusSaldo} + ${p.quantidade}` })
    .where(eq(buyers.id, p.buyerId));
  return true;
}

/** O código do link de indicação da pessoa, criado na primeira vez. */
export async function garantirCodigoDeIndicacao(buyerId: string): Promise<string> {
  for (let i = 0; i < 5; i++) {
    const [b] = await db.select({ c: buyers.codigoIndicacao }).from(buyers).where(eq(buyers.id, buyerId));
    if (!b) throw new BonusError("Comprador não encontrado.", 404);
    if (b.c) return b.c;
    try {
      // Condicional: duas abas ao mesmo tempo, um código só.
      await db
        .update(buyers)
        .set({ codigoIndicacao: gerarCodigoDeIndicacao((n) => randomInt(0, n)) })
        .where(and(eq(buyers.id, buyerId), sql`${buyers.codigoIndicacao} is null`));
    } catch (err) {
      if (!isUniqueViolation(err, "uq_buyers_codigo_indicacao")) throw err;
    }
  }
  throw new BonusError("Não foi possível criar o link de indicação. Tente de novo.", 500);
}

async function indicadorPorCodigo(codigo: string) {
  if (!codigoDeIndicacaoValido(codigo)) return null;
  const [b] = await db
    .select({ id: buyers.id, phone: buyers.phone, cpf: buyers.cpf, excluidoEm: buyers.excluidoEm })
    .from(buyers)
    .where(eq(buyers.codigoIndicacao, codigo));
  return b && !b.excluidoEm ? b : null;
}

/**
 * Anota quem indicou o comprador deste pedido. Só vale para quem compra pela
 * primeira vez: o `INSERT … SELECT` confere "sem compra paga antes" na mesma
 * instrução, e o índice único do indicado deixa uma indicação por pessoa.
 * Enquanto pendente, o pedido novo toma o lugar do anterior (reserva que
 * venceu não prende a indicação); confirmada, não muda mais.
 * Autoindicação (mesmo comprador, telefone ou CPF) não conta.
 */
export async function registrarIndicacao(p: { codigo?: string | null; indicadoId: string; orderId: string }) {
  if (!p.codigo) return false;
  if (!(await getPlataforma()).bonusLigado) return false;
  const indicador = await indicadorPorCodigo(p.codigo);
  if (!indicador || indicador.id === p.indicadoId) return false;
  const [indicado] = await db.select({ phone: buyers.phone, cpf: buyers.cpf }).from(buyers).where(eq(buyers.id, p.indicadoId));
  if (!indicado) return false;
  if (normalizePhone(indicado.phone) === normalizePhone(indicador.phone)) return false;
  const cpf = (v: string | null) => (v ?? "").replace(/\D/g, "");
  if (cpf(indicado.cpf) && cpf(indicado.cpf) === cpf(indicador.cpf)) return false;

  const r = await db.execute(sql`
    insert into indicacoes (indicador_id, indicado_id, order_id)
    select ${indicador.id}::uuid, ${p.indicadoId}::uuid, ${p.orderId}::uuid
     where not exists (
       select 1 from orders o
        where o.buyer_id = ${p.indicadoId}::uuid
          and o.status in ('paid', 'refunded')
          and o.method <> 'bonus')
    on conflict (indicado_id) do update
       set order_id = excluded.order_id, indicador_id = excluded.indicador_id, created_at = now()
     where indicacoes.status = 'pendente'`);
  return (r.rowCount ?? 0) > 0;
}

/**
 * Dentro da transação que confirma o pagamento: se este é o pedido que o
 * indicado fez pelo link, a indicação vira confirmada e quem indicou ganha
 * as cotas. Devolve quem indicou (para as metas, depois da transação).
 */
export async function confirmarIndicacao(tx: Tx, order: { id: string; buyerId: string }, cotas: number) {
  const [ind] = await tx
    .update(indicacoes)
    .set({ status: "confirmada", confirmadaEm: new Date() })
    .where(and(eq(indicacoes.orderId, order.id), eq(indicacoes.status, "pendente")))
    .returning({ indicadorId: indicacoes.indicadorId, indicadoId: indicacoes.indicadoId });
  if (!ind) return null;
  await creditar(tx, {
    buyerId: ind.indicadorId,
    quantidade: cotas,
    motivo: "indicacao",
    chave: `indicacao:${ind.indicadoId}`,
    descricao: "Indicação confirmada",
    orderId: order.id,
  });
  return ind.indicadorId;
}

/**
 * Estorno do pedido que confirmou a indicação: a indicação cai e o bônus sai
 * (na mesma transação do estorno). Sem isso, comprar pelo próprio link com
 * outro telefone e pedir o dinheiro de volta renderia cota grátis.
 */
export async function estornarIndicacao(tx: Tx, orderId: string) {
  const [ind] = await tx
    .update(indicacoes)
    .set({ status: "estornada" })
    .where(and(eq(indicacoes.orderId, orderId), eq(indicacoes.status, "confirmada")))
    .returning({ indicadorId: indicacoes.indicadorId, indicadoId: indicacoes.indicadoId });
  if (!ind) return;
  const [credito] = await tx
    .select({ quantidade: bonusLancamentos.quantidade })
    .from(bonusLancamentos)
    .where(eq(bonusLancamentos.chave, `indicacao:${ind.indicadoId}`));
  if (!credito) return;
  await creditar(tx, {
    buyerId: ind.indicadorId,
    quantidade: -credito.quantidade,
    motivo: "estorno_indicacao",
    chave: `estorno-indicacao:${ind.indicadoId}`,
    descricao: "Indicação estornada",
    orderId,
  });
}

/**
 * Visita nova pelo link. Um aparelho conta uma vez por quem indica, e no
 * máximo `VISITAS_POR_DIA` por dia — contar e gravar sob a trava da pessoa,
 * para duas visitas ao mesmo tempo não passarem do teto.
 */
export async function registrarVisita(codigo: unknown, aparelhoHash: string | null) {
  if (!aparelhoHash || typeof codigo !== "string") return false;
  if (!(await getPlataforma()).bonusLigado) return false;
  const indicador = await indicadorPorCodigo(codigo);
  if (!indicador) return false;
  const entrou = await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(811301, hashtext(${indicador.id}))`);
    const [hoje] = (
      await tx.execute(sql`
        select count(*)::int as n from bonus_visitas
         where indicador_id = ${indicador.id}::uuid and created_at > now() - interval '1 day'`)
    ).rows as { n: number }[];
    if (Number(hoje?.n ?? 0) >= VISITAS_POR_DIA) return false;
    const [v] = await tx
      .insert(bonusVisitas)
      .values({ indicadorId: indicador.id, aparelhoHash })
      .onConflictDoNothing()
      .returning({ id: bonusVisitas.indicadorId });
    return Boolean(v);
  });
  if (entrou) await avaliarMetas(indicador.id);
  return entrou;
}

/** Quanto a pessoa já fez de cada tipo de meta. */
async function progressoDe(buyerId: string) {
  const r = await db.execute(sql`
    select
      (select count(distinct o.campaign_id)::int from orders o
        where o.buyer_id = ${buyerId}::uuid and o.status = 'paid' and o.method <> 'bonus') as rifas_compradas,
      (select count(*)::int from indicacoes i
        where i.indicador_id = ${buyerId}::uuid and i.status = 'confirmada') as indicacoes,
      (select count(*)::int from bonus_visitas v where v.indicador_id = ${buyerId}::uuid) as visitas`);
  const p = r.rows[0] as Record<TipoDeMeta, number>;
  return { rifas_compradas: Number(p.rifas_compradas), indicacoes: Number(p.indicacoes), visitas: Number(p.visitas) };
}

async function metasAtivas(): Promise<Meta[]> {
  const linhas = await db.select().from(bonusMetas).where(eq(bonusMetas.ativa, true)).orderBy(bonusMetas.createdAt);
  return linhas as Meta[];
}

/**
 * Credita as metas alcançadas. Idempotente pela chave (`meta:<id>:<pessoa>`):
 * roda depois de cada compra, indicação e visita, sem medo de repetir.
 */
export async function avaliarMetas(buyerId: string) {
  if (!(await getPlataforma()).bonusLigado) return 0;
  const metas = await metasAtivas();
  if (!metas.length) return 0;
  const alcancadas = progressoDasMetas(metas, await progressoDe(buyerId)).filter((m) => m.alcancada);
  let creditadas = 0;
  for (const m of alcancadas) {
    const ok = await db.transaction((tx) =>
      creditar(tx, {
        buyerId,
        quantidade: m.recompensa,
        motivo: "meta",
        chave: `meta:${m.id}:${buyerId}`,
        descricao: `Meta alcançada: ${m.titulo}`,
      }),
    );
    if (ok) creditadas++;
  }
  return creditadas;
}

/** A tela "Bônus" do comprador. */
export async function estadoDoBonus(buyerId: string) {
  const cfg = await getPlataforma();
  if (!cfg.bonusLigado) return { ligado: false as const };
  const codigo = await garantirCodigoDeIndicacao(buyerId);
  const [b] = await db.select({ saldo: buyers.bonusSaldo }).from(buyers).where(eq(buyers.id, buyerId));
  const progresso = await progressoDe(buyerId);
  const extrato = await db
    .select({
      quantidade: bonusLancamentos.quantidade,
      motivo: bonusLancamentos.motivo,
      descricao: bonusLancamentos.descricao,
      createdAt: bonusLancamentos.createdAt,
    })
    .from(bonusLancamentos)
    .where(eq(bonusLancamentos.buyerId, buyerId))
    .orderBy(desc(bonusLancamentos.createdAt))
    .limit(30);
  const rifas = await db
    .select({ id: campaigns.id, titulo: campaigns.title, slug: campaigns.slug, drawAt: campaigns.drawAt, organizacao: organizations.name })
    .from(campaigns)
    .innerJoin(organizations, eq(organizations.id, campaigns.organizationId))
    .where(and(eq(campaigns.status, "published"), eq(campaigns.aceitaCotaBonus, true), sql`${organizations.archivedAt} is null`))
    .orderBy(campaigns.drawAt)
    .limit(50);
  return {
    ligado: true as const,
    saldo: b?.saldo ?? 0,
    codigo,
    link: publicUrl(`/?ind=${codigo}`),
    porIndicacao: cfg.bonusPorIndicacao,
    progresso,
    metas: progressoDasMetas(await metasAtivas(), progresso),
    rifas,
    extrato,
  };
}

/* ------------------------------------------------------------------ *
 * Painel da plataforma
 * ------------------------------------------------------------------ */

export async function painelDoBonus() {
  const cfg = await getPlataforma();
  const metas = await db.select().from(bonusMetas).orderBy(bonusMetas.createdAt);
  const [resumo] = (
    await db.execute(sql`
      select
        (select count(*)::int from indicacoes where status = 'confirmada') as indicacoes,
        (select coalesce(sum(quantidade), 0)::int from bonus_lancamentos where quantidade > 0) as creditadas,
        (select coalesce(-sum(quantidade), 0)::int from bonus_lancamentos where motivo = 'resgate') as resgatadas,
        (select count(*)::int from campaigns where aceita_cota_bonus and status = 'published') as rifas`)
  ).rows as { indicacoes: number; creditadas: number; resgatadas: number; rifas: number }[];
  return {
    config: { bonusLigado: cfg.bonusLigado, bonusPorIndicacao: cfg.bonusPorIndicacao },
    metas,
    resumo,
  };
}

export async function criarMeta(bruto: unknown) {
  let m;
  try {
    m = validarMeta(bruto);
  } catch (e) {
    throw new BonusError((e as Error).message);
  }
  const [nova] = await db.insert(bonusMetas).values(m).returning();
  return nova;
}

export async function alterarMeta(id: string, bruto: unknown) {
  let m;
  try {
    m = validarMeta(bruto);
  } catch (e) {
    throw new BonusError((e as Error).message);
  }
  const [alterada] = await db.update(bonusMetas).set(m).where(eq(bonusMetas.id, id)).returning();
  if (!alterada) throw new BonusError("Meta não encontrada.", 404);
  return alterada;
}

