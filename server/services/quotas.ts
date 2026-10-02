/**
 * Motor de cotas — armazenamento esparso (docs/PLANO-RIFA.md §4.1).
 *
 * Regra que governa tudo: SÓ EXISTE LINHA PARA COTA TOMADA.
 * Disponível é a ausência de linha. Publicar uma campanha de 1.000.000 de
 * cotas não cria nenhuma linha aqui — as linhas nascem conforme vende.
 *
 * A exclusividade da cota é a chave primária (campaign_id, number). Nunca
 * consultamos disponibilidade em uma query e gravamos em outra: a escrita é
 * a própria verificação, via INSERT ... ON CONFLICT DO NOTHING.
 */
import { randomInt } from "node:crypto";
import { sql, and, eq, lt, inArray } from "drizzle-orm";
import { db } from "../db";
import { quotaAlloc, campaignStats, freePool, orders, buyers, bonusLancamentos } from "@shared/schema";

/** Acima disto a amostragem aleatória colide demais e o pool assume. */
export const ENDGAME_THRESHOLD = 0.85;

/** Tentativas de sorteio antes de desistir e responder "tente de novo". */
const MAX_SAMPLING_ROUNDS = 6;

export class NoQuotasAvailableError extends Error {
  constructor(public readonly requested: number, public readonly got: number) {
    super(
      got === 0
        ? "Não há cotas disponíveis nesta campanha."
        : `Só restam ${got} cotas disponíveis.`,
    );
    this.name = "NoQuotasAvailableError";
  }
}

export class NumbersTakenError extends Error {
  constructor(public readonly taken: number[]) {
    super("Alguns números que você escolheu acabaram de ser levados.");
    this.name = "NumbersTakenError";
  }
}

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * Literal de array do Postgres como parâmetro ligado. Passar um array JS
 * direto no template do drizzle vira `record`, não `int[]` — daí o literal.
 * Só aceita inteiros, então não há como injetar nada aqui.
 */
export function intArray(numbers: number[]): string {
  for (const n of numbers) {
    if (!Number.isInteger(n)) throw Object.assign(new Error(`Número de cota inválido: ${n}`), { status: 400 });
  }
  return `{${numbers.join(",")}}`;
}

/* ------------------------------------------------------------------ *
 * Inserção — a única forma de tomar uma cota
 * ------------------------------------------------------------------ */

async function insertNumbers(
  tx: Tx,
  campaignId: string,
  numbers: number[],
  orderId: string,
  reservedUntil: Date,
): Promise<number[]> {
  if (numbers.length === 0) return [];

  const rows = await tx.execute(sql`
    INSERT INTO quota_alloc (campaign_id, number, status, order_id, reserved_until)
    SELECT ${campaignId}::uuid, n, 'reserved', ${orderId}::uuid, ${reservedUntil}
    FROM unnest(${intArray(numbers)}::int[]) AS n
    ON CONFLICT (campaign_id, number) DO NOTHING
    RETURNING number
  `);

  return (rows.rows as { number: number }[]).map((r) => Number(r.number));
}

/* ------------------------------------------------------------------ *
 * Compra rápida — sorteio de candidatos, sem trava
 * ------------------------------------------------------------------ */

/** Candidatos únicos em 1..total, com folga para absorver colisões. */
function sampleCandidates(total: number, count: number, exclude: Set<number>): number[] {
  const wanted = Math.min(total, Math.ceil(count * 1.3) + 8);
  const picked = new Set<number>();
  // O teto de voltas evita laço infinito quando a campanha está quase cheia.
  const maxSpins = wanted * 12 + 50;
  for (let spin = 0; spin < maxSpins && picked.size < wanted; spin++) {
    const n = randomInt(1, total + 1);
    if (!exclude.has(n)) picked.add(n);
  }
  return [...picked];
}

async function allocateFromPool(
  tx: Tx,
  campaignId: string,
  count: number,
  orderId: string,
  reservedUntil: Date,
): Promise<number[]> {
  const allocated: number[] = [];

  /**
   * O pool pode conter número que já saiu por outro caminho — escolha manual
   * no mapa, correção manual no banco, uma migração. Uma entrada velha não
   * pode derrubar a compra inteira: o que colidir é descartado do pool (já
   * está vendido mesmo) e a rodada seguinte pega outro.
   */
  for (let round = 0; round < MAX_SAMPLING_ROUNDS && allocated.length < count; round++) {
    const faltam = count - allocated.length;

    const popped = await tx.execute(sql`
      DELETE FROM free_pool
      WHERE ctid IN (
        SELECT ctid FROM free_pool
        WHERE campaign_id = ${campaignId}::uuid
        LIMIT ${faltam}
        FOR UPDATE SKIP LOCKED
      )
      RETURNING number
    `);

    const numbers = (popped.rows as { number: number }[]).map((r) => Number(r.number));
    // Pool vazio de verdade: acabaram as cotas.
    if (numbers.length === 0) break;

    // O pool é a fonte, mas a PK continua sendo a autoridade.
    const won = await insertNumbers(tx, campaignId, numbers, orderId, reservedUntil);
    allocated.push(...won.slice(0, faltam));
  }

  return allocated;
}

/* ------------------------------------------------------------------ *
 * API pública do motor
 * ------------------------------------------------------------------ */

export interface ReserveResult {
  numbers: number[];
}

/** Reserva `count` cotas aleatórias. Caminho de 95% das vendas. */
export async function reserveRandom(
  tx: Tx,
  params: {
    campaignId: string;
    totalQuotas: number;
    count: number;
    orderId: string;
    reservedUntil: Date;
    endgame: boolean;
  },
): Promise<ReserveResult> {
  const { campaignId, totalQuotas, count, orderId, reservedUntil, endgame } = params;
  const allocated: number[] = [];

  if (endgame) {
    const fromPool = await allocateFromPool(
      tx,
      campaignId,
      count,
      orderId,
      reservedUntil,
    );
    allocated.push(...fromPool);
    if (allocated.length < count) {
      throw new NoQuotasAvailableError(count, allocated.length);
    }
    return { numbers: allocated.sort((a, b) => a - b) };
  }

  const tried = new Set<number>();
  for (let round = 0; round < MAX_SAMPLING_ROUNDS && allocated.length < count; round++) {
    const missing = count - allocated.length;
    const candidates = sampleCandidates(totalQuotas, missing, tried);
    if (candidates.length === 0) break;
    candidates.forEach((n) => tried.add(n));

    const won = await insertNumbers(
      tx,
      campaignId,
      candidates.slice(0, Math.max(missing, candidates.length)),
      orderId,
      reservedUntil,
    );
    // Pode vir mais do que o pedido (sorteamos com folga): fica só o necessário.
    const keep = won.slice(0, missing);
    const giveBack = won.slice(missing);
    if (giveBack.length > 0) {
      await tx
        .delete(quotaAlloc)
        .where(
          and(
            eq(quotaAlloc.campaignId, campaignId),
            inArray(quotaAlloc.number, giveBack),
            eq(quotaAlloc.orderId, orderId),
          ),
        );
    }
    allocated.push(...keep);
  }

  if (allocated.length < count) {
    throw new NoQuotasAvailableError(count, allocated.length);
  }
  return { numbers: allocated.sort((a, b) => a - b) };
}

/** Reserva os números que o comprador escolheu no mapa. Tudo ou nada. */
export async function reserveSpecific(
  tx: Tx,
  params: {
    campaignId: string;
    totalQuotas: number;
    numbers: number[];
    orderId: string;
    reservedUntil: Date;
  },
): Promise<ReserveResult> {
  const { campaignId, totalQuotas, numbers, orderId, reservedUntil } = params;

  const unique = [...new Set(numbers)];
  const outOfRange = unique.filter((n) => n < 1 || n > totalQuotas);
  if (outOfRange.length > 0) {
    throw Object.assign(new Error(`Número fora da faixa desta campanha: ${outOfRange[0]}.`), { status: 400 });
  }

  const won = await insertNumbers(tx, campaignId, unique, orderId, reservedUntil);

  // Número escolhido no mapa também sai do pool. Sem isto, na reta final o
  // pool passa a oferecer cota já vendida e a compra rápida começa a falhar
  // com a rifa ainda cheia de número livre.
  if (won.length > 0) {
    await tx.execute(sql`
      DELETE FROM free_pool
      WHERE campaign_id = ${campaignId}::uuid
        AND number = ANY(${intArray(won)}::int[])
    `);
  }

  if (won.length !== unique.length) {
    const wonSet = new Set(won);
    // Rollback explícito do parcial: quem escolhe no mapa leva tudo ou nada.
    if (won.length > 0) {
      await tx
        .delete(quotaAlloc)
        .where(
          and(eq(quotaAlloc.campaignId, campaignId), eq(quotaAlloc.orderId, orderId)),
        );
    }
    throw new NumbersTakenError(unique.filter((n) => !wonSet.has(n)));
  }

  return { numbers: won.sort((a, b) => a - b) };
}

/** Contadores incrementais — a barra de progresso nunca agrega 1M de linhas. */
export async function bumpReserved(tx: Tx, campaignId: string, delta: number) {
  await tx
    .update(campaignStats)
    .set({
      reservedCount: sql`${campaignStats.reservedCount} + ${delta}`,
      updatedAt: new Date(),
    })
    .where(eq(campaignStats.campaignId, campaignId));
}

/** Reserva vira venda: move o contador e grava a receita. */
export async function confirmPaid(
  tx: Tx,
  params: { campaignId: string; orderId: string; amountCents: number },
) {
  const { campaignId, orderId, amountCents } = params;

  const updated = await tx
    .update(quotaAlloc)
    .set({ status: "paid", reservedUntil: null })
    .where(and(eq(quotaAlloc.orderId, orderId), eq(quotaAlloc.status, "reserved")))
    .returning({ number: quotaAlloc.number });

  await tx
    .update(campaignStats)
    .set({
      soldCount: sql`${campaignStats.soldCount} + ${updated.length}`,
      reservedCount: sql`greatest(0, ${campaignStats.reservedCount} - ${updated.length})`,
      revenueCents: sql`${campaignStats.revenueCents} + ${amountCents}`,
      updatedAt: new Date(),
    })
    .where(eq(campaignStats.campaignId, campaignId));

  return updated.map((r) => r.number);
}

/**
 * Devolve ao estoque as cotas de um pedido **pago** — o caminho do estorno.
 *
 * É o inverso exato de `confirmPaid()`: apaga a linha (é a ausência dela que
 * torna o número disponível), desconta o que aquela venda somou em
 * `campaign_stats` e, se a campanha já estiver em endgame, devolve o número
 * ao pool. Sem essa última parte o número sumiria do estoque: livre em
 * `quota_alloc`, invisível para quem aloca pelo pool — é a invariante 3 ao
 * contrário.
 *
 * Devolve os números liberados, para quem chamou registrar o que saiu.
 */
export async function releasePaidQuotas(
  tx: Tx,
  params: { campaignId: string; orderId: string; amountCents: number },
): Promise<number[]> {
  const { campaignId, orderId, amountCents } = params;

  const soltas = await tx
    .delete(quotaAlloc)
    .where(and(eq(quotaAlloc.orderId, orderId), eq(quotaAlloc.status, "paid")))
    .returning({ number: quotaAlloc.number });

  if (soltas.length === 0) return [];

  const numbers = soltas.map((r) => r.number);

  await tx
    .update(campaignStats)
    .set({
      // `greatest(0, …)` porque contador negativo é pior que contador
      // impreciso: a barra de progresso quebra e ninguém entende por quê.
      soldCount: sql`greatest(0, ${campaignStats.soldCount} - ${numbers.length})`,
      revenueCents: sql`greatest(0, ${campaignStats.revenueCents} - ${amountCents})`,
      updatedAt: new Date(),
    })
    .where(eq(campaignStats.campaignId, campaignId));

  const [stats] = await tx
    .select()
    .from(campaignStats)
    .where(eq(campaignStats.campaignId, campaignId));

  if (stats?.endgame) {
    await tx.execute(sql`
      INSERT INTO free_pool (campaign_id, number)
      SELECT ${campaignId}::uuid, n FROM unnest(${intArray(numbers)}::int[]) AS n
      ON CONFLICT DO NOTHING
    `);
  }

  return numbers;
}

/**
 * Devolve ao estoque as reservas vencidas. Apagar a linha é o que torna o
 * número disponível de novo — não existe status "available".
 */
export interface Expiradas {
  /** Cotas devolvidas ao estoque. */
  liberadas: number;
  /** Cobranças dos pedidos que expiraram, para cancelar no provedor. */
  cobrancas: { provider: string; chargeId: string }[];
}

export async function releaseExpired(now = new Date()): Promise<Expiradas> {
  return db.transaction(async (tx) => {
    const expired = await tx
      .delete(quotaAlloc)
      .where(and(eq(quotaAlloc.status, "reserved"), lt(quotaAlloc.reservedUntil, now)))
      .returning({
        campaignId: quotaAlloc.campaignId,
        number: quotaAlloc.number,
        orderId: quotaAlloc.orderId,
      });

    if (expired.length === 0) return { liberadas: 0, cobrancas: [] };

    const byCampaign = new Map<string, number[]>();
    for (const row of expired) {
      const list = byCampaign.get(row.campaignId) ?? [];
      list.push(row.number);
      byCampaign.set(row.campaignId, list);
    }

    for (const [campaignId, numbers] of byCampaign) {
      await tx
        .update(campaignStats)
        .set({
          reservedCount: sql`greatest(0, ${campaignStats.reservedCount} - ${numbers.length})`,
          updatedAt: new Date(),
        })
        .where(eq(campaignStats.campaignId, campaignId));

      // Em endgame o número precisa voltar para o pool, senão some do estoque.
      const [stats] = await tx
        .select()
        .from(campaignStats)
        .where(eq(campaignStats.campaignId, campaignId));
      if (stats?.endgame) {
        await tx.execute(sql`
          INSERT INTO free_pool (campaign_id, number)
          SELECT ${campaignId}::uuid, n FROM unnest(${intArray(numbers)}::int[]) AS n
          ON CONFLICT DO NOTHING
        `);
      }
    }

    const orderIds = [...new Set(expired.map((e) => e.orderId))];
    const vencidos = await tx
      .update(orders)
      .set({ status: "expired" })
      .where(and(inArray(orders.id, orderIds), eq(orders.status, "pending")))
      .returning({
        id: orders.id,
        provider: orders.pspProvider,
        chargeId: orders.pspChargeId,
        method: orders.method,
        buyerId: orders.buyerId,
        campaignId: orders.campaignId,
        quantity: orders.quantity,
      });

    // Resgate de bônus que venceu sem confirmar (o sorteio veio no meio): a
    // cota grátis volta para o teto da rifa e o saldo para a pessoa, uma vez
    // só (chave do lançamento). Senão o bônus sumiria dos dois lados.
    for (const v of vencidos) {
      if (v.method !== "bonus") continue;
      const [devolvido] = await tx
        .insert(bonusLancamentos)
        .values({
          buyerId: v.buyerId,
          quantidade: v.quantity,
          motivo: "resgate_vencido",
          chave: `resgate-vencido:${v.id}`,
          descricao: "Resgate não confirmado: as cotas de bônus voltaram ao saldo",
          orderId: v.id,
        })
        .onConflictDoNothing()
        .returning({ id: bonusLancamentos.id });
      if (!devolvido) continue;
      await tx
        .update(buyers)
        .set({ bonusSaldo: sql`${buyers.bonusSaldo} + ${v.quantity}` })
        .where(eq(buyers.id, v.buyerId));
      await tx
        .update(campaignStats)
        .set({ bonusCount: sql`greatest(0, ${campaignStats.bonusCount} - ${v.quantity})` })
        .where(eq(campaignStats.campaignId, v.campaignId));
    }

    // O carrinho num Pix só tem uma cobrança para vários pedidos: cancela uma vez.
    const cobrancas = new Map<string, { provider: string; chargeId: string }>();
    for (const v of vencidos) {
      if (v.provider && v.chargeId) cobrancas.set(v.chargeId, { provider: v.provider, chargeId: v.chargeId });
    }
    return { liberadas: expired.length, cobrancas: [...cobrancas.values()] };
  });
}

/**
 * Materializa o pool com os números que sobraram. Roda uma vez, quando a
 * campanha cruza o limiar — a partir daí a alocação sai do pool.
 */
export async function enterEndgame(campaignId: string, totalQuotas: number) {
  await db.transaction(async (tx) => {
    const [stats] = await tx
      .select()
      .from(campaignStats)
      .where(eq(campaignStats.campaignId, campaignId));
    if (!stats || stats.endgame) return;

    await tx.execute(sql`
      INSERT INTO free_pool (campaign_id, number)
      SELECT ${campaignId}::uuid, g
      FROM generate_series(1, ${totalQuotas}) AS g
      WHERE NOT EXISTS (
        SELECT 1 FROM quota_alloc a
        WHERE a.campaign_id = ${campaignId}::uuid AND a.number = g
      )
      ON CONFLICT DO NOTHING
    `);

    await tx
      .update(campaignStats)
      .set({ endgame: true, updatedAt: new Date() })
      .where(eq(campaignStats.campaignId, campaignId));
  });
}

export function shouldEnterEndgame(
  stats: { soldCount: number; reservedCount: number; endgame: boolean },
  totalQuotas: number,
): boolean {
  if (stats.endgame) return false;
  return (stats.soldCount + stats.reservedCount) / totalQuotas >= ENDGAME_THRESHOLD;
}

/* ------------------------------------------------------------------ *
 * Mapa de números — bitmap por bloco
 * ------------------------------------------------------------------ */

export const BLOCK_SIZE = 1000;

/**
 * Ocupação de um bloco como bitmap: 1.000 bits = 125 bytes em base64.
 * Bloco cheio e bloco vazio custam exatamente o mesmo na rede.
 */
export async function blockBitmap(
  campaignId: string,
  block: number,
  totalQuotas: number,
): Promise<{ from: number; to: number; taken: string; takenCount: number }> {
  const from = block * BLOCK_SIZE + 1;
  const to = Math.min(from + BLOCK_SIZE - 1, totalQuotas);

  const rows = await db.execute(sql`
    SELECT number FROM quota_alloc
    WHERE campaign_id = ${campaignId}::uuid
      AND number BETWEEN ${from} AND ${to}
  `);

  const bytes = Buffer.alloc(Math.ceil((to - from + 1) / 8));
  let takenCount = 0;
  for (const row of rows.rows as { number: number }[]) {
    const offset = Number(row.number) - from;
    bytes[offset >> 3] |= 1 << (offset & 7);
    takenCount++;
  }

  return { from, to, taken: bytes.toString("base64"), takenCount };
}

/** Um número só — para a busca direta, que pula o mapa inteiro. */
export async function isTaken(campaignId: string, number: number): Promise<boolean> {
  const [row] = await db
    .select({ number: quotaAlloc.number })
    .from(quotaAlloc)
    .where(and(eq(quotaAlloc.campaignId, campaignId), eq(quotaAlloc.number, number)));
  return Boolean(row);
}

/* ------------------------------------------------------------------ *
 * Cartelas — sugestão de números livres, sem reservar
 * ------------------------------------------------------------------ */

/** Quantas cartelas a tela mostra de uma vez, e o teto que a rota aceita. */
export const CARTELAS_MAX = 6;

/**
 * Sugere `cartelas` grupos de `quantidade` números livres, sem repetir número
 * entre elas. É só sugestão: não grava nada. Quem decide é a compra, que vai
 * pelo caminho de sempre (`reserveSpecific`, `INSERT … ON CONFLICT`, tudo ou
 * nada) — se alguém levar um número no meio, a compra recusa e a tela troca
 * a cartela. Nunca "consultar e gravar": aqui só se consulta.
 */
export async function sugerirCartelas(params: {
  campaignId: string;
  totalQuotas: number;
  quantidade: number;
  cartelas: number;
  endgame: boolean;
}): Promise<number[][]> {
  const { campaignId, totalQuotas, quantidade, cartelas, endgame } = params;
  const precisa = quantidade * cartelas;
  const livres: number[] = [];

  if (endgame) {
    // Na reta final o pool é a lista dos livres: sorteia direto dele.
    const r = await db.execute(sql`
      SELECT number FROM free_pool
      WHERE campaign_id = ${campaignId}::uuid
      ORDER BY random()
      LIMIT ${precisa}
    `);
    livres.push(...(r.rows as { number: number }[]).map((x) => Number(x.number)));
  } else {
    const tentados = new Set<number>();
    for (let round = 0; round < MAX_SAMPLING_ROUNDS && livres.length < precisa; round++) {
      const candidatos = sampleCandidates(totalQuotas, precisa - livres.length, tentados);
      if (candidatos.length === 0) break;
      candidatos.forEach((n) => tentados.add(n));
      const r = await db.execute(sql`
        SELECT number FROM quota_alloc
        WHERE campaign_id = ${campaignId}::uuid
          AND number = ANY(${intArray(candidatos)}::int[])
      `);
      const tomados = new Set((r.rows as { number: number }[]).map((x) => Number(x.number)));
      for (const n of candidatos) {
        if (!tomados.has(n) && livres.length < precisa) livres.push(n);
      }
    }
  }

  const grupos: number[][] = [];
  for (let i = 0; i + quantidade <= livres.length && grupos.length < cartelas; i += quantidade) {
    grupos.push(livres.slice(i, i + quantidade).sort((a, b) => a - b));
  }
  return grupos;
}
