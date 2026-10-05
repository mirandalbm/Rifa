/**
 * O sorteio de uma rifa: um só caminho para o botão do painel e para o
 * sorteio automático da rifa integrada a um sorteio oficial
 * (`sortearRifasDoSorteioOficial`, chamado ao lançar o resultado e pelo
 * relógio). A conta é `drawNumber()`; aqui moram as travas e as recusas.
 *
 * - **A linha do sorteio fica travada (`FOR UPDATE`)**: dois cliques — ou o
 *   botão e o relógio — dão um sorteio e um 409. O Pix confirmado e o
 *   estorno travam a mesma linha com `FOR SHARE` e esperam.
 * - **Rifa integrada**: o sorteio oficial é travado antes (`FOR SHARE`, a
 *   ordem de sempre: sorteio oficial → rifa) e o `UPDATE` exige que a rifa
 *   siga nele. O resultado é o oficial, nunca o que veio do formulário.
 */
import { and, asc, eq, isNotNull, isNull, sql } from "drizzle-orm";
import { db } from "../db";
import { auditLog, buyers, campaigns, draws, orders, sorteiosOficiais, type Campaign } from "@shared/schema";
import { drawNumber } from "./draw";
import { notify } from "../notifications";
import { publicUrl } from "./urls";
import { formatQuota, numeroInterno } from "@shared/format";
import { lerFederal, lerGlobo, numeracaoZero } from "@shared/apuracao";
import { contempladoPorAproximacao } from "@shared/sorteio";
import { cotasMinimasParaSortear, minimoAtingido } from "@shared/campanhaLegal";
import { vendidasParaOMinimo } from "@shared/bonus";
import { LOTERIAS, loteriaValida, type Loteria } from "@shared/sorteiosOficiais";
import { avisarResultado, emSegundoPlano } from "./push";

/** Recusa do sorteio (dentro ou fora da transação): vira 409, nada muda. */
export class SorteioRecusado extends Error {}

export interface Resultado {
  loteria: Loteria;
  concurso: number;
  numeros: string[];
}

/** Quem pediu: a pessoa do painel ou o relógio (o sistema). */
export interface AtorDoSorteio {
  id?: string | null;
  role?: string | null;
  ip?: string | null;
}

/**
 * O resultado que vale para a rifa: o oficial, se ela está integrada; senão,
 * o da Federal que veio do formulário. Rifa integrada sem resultado lançado
 * ainda não sorteia — o formulário não substitui a Caixa.
 */
export async function resultadoParaARifa(
  c: Pick<Campaign, "sorteioOficialId"> & { metodoApuracao?: string | null },
  formulario: { federalContest?: unknown; federalPrizes?: unknown },
): Promise<Resultado & { sorteioOficialId: string | null }> {
  if (c.sorteioOficialId) {
    const [s] = await db.select().from(sorteiosOficiais).where(eq(sorteiosOficiais.id, c.sorteioOficialId));
    if (!s || s.canceladoEm) throw new SorteioRecusado("O sorteio oficial desta rifa foi cancelado.");
    if (!s.resultado || !s.resultadoEm) {
      throw new SorteioRecusado(
        "Esta rifa está num sorteio oficial: ela sorteia sozinha quando a plataforma lançar o resultado da Caixa.",
      );
    }
    if (!loteriaValida(s.loteria)) throw new SorteioRecusado("Loteria desconhecida.");
    return { loteria: s.loteria, concurso: s.concurso, numeros: s.resultado, sorteioOficialId: s.id };
  }
  // O globo é da plataforma: a rifa sorteia pela sessão do calendário, nunca por formulário.
  if (c.metodoApuracao === "globo") {
    throw new SorteioRecusado("Esta rifa é apurada pelo globo: ela sorteia sozinha quando a plataforma lançar o resultado da sessão do globo.");
  }
  const numeros = Array.isArray(formulario.federalPrizes) ? formulario.federalPrizes.map((p) => String(p ?? "")) : [];
  const concurso = Number(formulario.federalContest);
  if (numeros.length !== 5 || !Number.isInteger(concurso) || concurso < 1) {
    throw Object.assign(new SorteioRecusado("Informe o concurso e os 5 prêmios da Loteria Federal."), { status: 400 });
  }
  return { loteria: "federal", concurso, numeros, sorteioOficialId: null };
}

/**
 * O número sorteado (interno, 1 ao total). Rifa com método de apuração é a
 * leitura direta dos 5 prêmios da Federal (`lerFederal`, numeração a partir
 * de zero: o número lido 139 é a cota interna 140) ou das 6 bolas do globo
 * (`lerGlobo`). Rifa de antes, sem
 * método, segue a semente (`drawNumber`) — a conferência dela continua igual.
 */
export function numeroSorteado(
  campaign: Pick<Campaign, "metodoApuracao" | "totalQuotas">,
  seed: string,
  r: Pick<Resultado, "loteria" | "numeros">,
): number {
  if (campaign.metodoApuracao === "federal_direta") {
    if (r.loteria !== "federal") {
      throw new SorteioRecusado("Esta rifa é apurada pela Loteria Federal: o resultado precisa ser o da Federal.");
    }
    return numeroInterno(lerFederal(r.numeros, campaign.totalQuotas).numero, true);
  }
  // O globo da plataforma (8.10 a 8.12): os 6 algarismos, na ordem dos globos;
  // a rifa menor fica com os N últimos. Só pela sessão do globo do calendário.
  if (campaign.metodoApuracao === "globo") {
    if (r.loteria !== "globo") {
      throw new SorteioRecusado("Esta rifa é apurada pelo globo: o resultado precisa ser o da sessão do globo.");
    }
    return numeroInterno(lerGlobo(r.numeros, campaign.totalQuotas).numero, true);
  }
  if (campaign.metodoApuracao) {
    throw new SorteioRecusado("O método de apuração desta rifa ainda não sorteia pelo sistema.");
  }
  return drawNumber({ seed, federalPrizes: r.numeros, totalQuotas: campaign.totalQuotas, loteria: r.loteria });
}

/**
 * Sorteia a rifa. Devolve o que foi gravado; recusa com `SorteioRecusado`
 * (já sorteada, não publicada, mínimo não atingido, reserva esperando Pix,
 * saiu do sorteio oficial). Avisos (ganhador e push) saem depois, fora da
 * transação.
 */
export async function executarSorteio(
  campaignId: string,
  r: Resultado & { sorteioOficialId: string | null },
  ator: AtorDoSorteio,
  evidenceUrl: string | null = null,
) {
  const [campaign] = await db.select().from(campaigns).where(eq(campaigns.id, campaignId));
  if (!campaign) throw Object.assign(new SorteioRecusado("Campanha não encontrada."), { status: 404 });
  if (campaign.status === "drawn") throw new SorteioRecusado("Esta campanha já foi sorteada.");
  const [draw] = await db.select().from(draws).where(eq(draws.campaignId, campaign.id));
  if (!draw) throw new SorteioRecusado("Campanha sem semente comprometida.");

  // Federal sem loteria gravada: a conta de sempre (sorteio antigo confere igual).
  const loteriaGravada = r.loteria === "federal" ? null : r.loteria;
  let resultNumber: number;
  try {
    resultNumber = numeroSorteado(campaign, draw.seed, r);
  } catch (e) {
    if (e instanceof SorteioRecusado) throw e;
    throw Object.assign(new SorteioRecusado((e as Error).message), { status: 400 });
  }

  const feito = await db.transaction(async (tx) => {
    if (r.sorteioOficialId) {
      // A ordem de sempre: o sorteio oficial antes da rifa.
      await tx.execute(sql`SELECT id FROM sorteios_oficiais WHERE id = ${r.sorteioOficialId}::uuid FOR SHARE`);
    }
    const linha = (await tx.execute(sql`SELECT executed_at FROM draws WHERE id = ${draw.id} FOR UPDATE`)).rows[0];
    if (linha?.executed_at) throw new SorteioRecusado("Esta campanha já foi sorteada.");
    const publicada = (
      await tx.execute(sql`
        UPDATE campaigns SET status = 'drawn', sorteio_auto_motivo = NULL, sorteio_auto_em = NULL
         WHERE id = ${campaign.id} AND status = 'published'
           AND ${r.sorteioOficialId ? sql`sorteio_oficial_id = ${r.sorteioOficialId}::uuid` : sql`sorteio_oficial_id IS NULL`}
        RETURNING id
      `)
    ).rows;
    if (!publicada.length) {
      throw new SorteioRecusado(
        r.sorteioOficialId
          ? "A rifa não está mais publicada neste sorteio oficial."
          : "Só rifa publicada é sorteada (rifa num sorteio oficial sorteia pelo resultado da Caixa).",
      );
    }
    // Mínimo de cotas vendidas da autorização: abaixo dele o sorteio não roda.
    const minimo = cotasMinimasParaSortear(campaign.totalQuotas, campaign.minimoVendidoPct);
    if (minimo > 0) {
      // Cota de bônus não conta para o mínimo (salvo na rifa cheia): shared/bonus.ts.
      const st = (
        await tx.execute(sql`SELECT sold_count, bonus_count FROM campaign_stats WHERE campaign_id = ${campaign.id}`)
      ).rows[0];
      const vendidas = vendidasParaOMinimo(Number(st?.sold_count ?? 0), Number(st?.bonus_count ?? 0), campaign.modoSorteio);
      if (!minimoAtingido(vendidas, campaign.totalQuotas, campaign.minimoVendidoPct)) {
        throw new SorteioRecusado(
          `O mínimo para sortear não foi atingido: ${vendidas} de ${minimo} cotas vendidas (${campaign.minimoVendidoPct}%). Peça o adiamento da data do sorteio.`,
        );
      }
    }
    // Reserva esperando pagamento ainda pode virar cota paga: sortear agora
    // deixaria o Pix pago depois fora do quadro. Espera pagar ou vencer.
    const reserva = (
      await tx.execute(sql`SELECT 1 FROM quota_alloc WHERE campaign_id = ${campaign.id} AND status = 'reserved' LIMIT 1`)
    ).rows;
    if (reserva.length) {
      throw new SorteioRecusado(
        "Há cotas reservadas esperando pagamento. O sorteio espera elas serem pagas ou vencerem (o prazo da reserva da rifa).",
      );
    }
    const pago = async (filtro: ReturnType<typeof sql>, ordem: "asc" | "desc") =>
      (
        await tx.execute(sql`
          SELECT q.number, q.order_id AS "orderId"
            FROM quota_alloc q
            JOIN orders o ON o.id = q.order_id AND o.status = 'paid'
           WHERE q.campaign_id = ${campaign.id} AND q.status = 'paid' AND ${filtro}
           ORDER BY q.number ${ordem === "asc" ? sql`ASC` : sql`DESC`}
           LIMIT 1
             FOR SHARE OF q, o
        `)
      ).rows[0] as { number: number; orderId: string } | undefined;
    const exato = await pago(sql`q.number = ${resultNumber}`, "asc");
    // "A promotora completa": as cotas não vendidas são dela, então o número
    // sorteado sempre tem dono — não vendido, o prêmio fica com a promotora.
    const promotoraCompleta = campaign.modoSorteio === "promotora_completa";
    const acima = exato || promotoraCompleta ? undefined : await pago(sql`q.number > ${resultNumber}`, "asc");
    const abaixo = exato || acima || promotoraCompleta ? undefined : await pago(sql`q.number < ${resultNumber}`, "desc");
    const winnerNumber = promotoraCompleta
      ? resultNumber
      : contempladoPorAproximacao({
          sorteado: resultNumber,
          sorteadoVendido: Boolean(exato),
          acima: acima?.number ?? null,
          abaixo: abaixo?.number ?? null,
        });
    const vencedor = exato ?? acima ?? abaixo ?? null;
    const [gravado] = await tx
      .update(draws)
      .set({
        federalContest: r.concurso,
        federalPrizes: r.numeros,
        loteria: loteriaGravada,
        resultNumber,
        winnerNumber,
        winnerOrderId: vencedor?.orderId ?? null,
        evidenceUrl,
        executedAt: new Date(),
      })
      .where(eq(draws.id, draw.id))
      .returning();
    await tx.insert(auditLog).values({
      actorId: ator.id ?? null,
      actorRole: ator.role ?? "sistema",
      action: "campaign.draw",
      entity: "campaign",
      entityId: campaign.id,
      diff: {
        resultNumber,
        winnerNumber,
        loteria: r.loteria,
        concurso: r.concurso,
        ...(r.sorteioOficialId ? { sorteioOficialId: r.sorteioOficialId, automatico: !ator.id } : {}),
      } as never,
      ip: ator.ip ?? null,
    });
    return { gravado, vencedor };
  });

  const updated = feito.gravado;
  // O ganhador é avisado na hora; os demais veem o resultado na página.
  if (feito.vencedor) {
    const [row] = await db
      .select({ phone: buyers.phone })
      .from(orders)
      .innerJoin(buyers, eq(buyers.id, orders.buyerId))
      .where(eq(orders.id, feito.vencedor.orderId));
    if (row?.phone) {
      // O sorteio já está gravado: falha do aviso não vira erro (vai ao log).
      await notify({
        to: row.phone,
        template: "sorteio_realizado",
        params: {
          rifa: campaign.title,
          numero: formatQuota(updated.winnerNumber ?? resultNumber, campaign.totalQuotas, numeracaoZero(campaign.metodoApuracao)),
          link: publicUrl(`/r/${campaign.slug}`),
        },
        dedupeKey: `draw:${draw.id}:ganhador`,
      }).catch((e) => console.error("[sorteio] aviso ao ganhador:", e));
    }
  }
  emSegundoPlano(avisarResultado(campaign.id), "resultado");

  return {
    ...updated,
    // A semente é publicada agora, na rifa de antes (sem método): qualquer
    // pessoa refaz a conta. Na leitura direta ela não entra na conta e não sai.
    seed: campaign.metodoApuracao ? null : draw.seed,
    loteriaNome: LOTERIAS[r.loteria].nome,
    soldToWinner: Boolean(feito.vencedor),
    // Contemplado pela regra da aproximação (o sorteado não estava vendido).
    aproximacao: updated.winnerNumber !== null && updated.winnerNumber !== resultNumber,
    ficouComPromotora: campaign.modoSorteio === "promotora_completa" && !updated.winnerOrderId,
  };
}

/**
 * O resultado oficial lançado sorteia cada rifa publicada integrada a ele.
 * A que não pode sortear agora (mínimo não atingido, reserva esperando Pix)
 * guarda o motivo, que o painel mostra, e o relógio tenta de novo. Uma rifa
 * que falha não segura as outras. Devolve quantas sortearam.
 */
export async function sortearRifasDoSorteioOficial(sorteioId: string): Promise<{ sorteadas: number; esperando: number }> {
  const [s] = await db.select().from(sorteiosOficiais).where(eq(sorteiosOficiais.id, sorteioId));
  if (!s?.resultado || !s.resultadoEm || s.canceladoEm || !loteriaValida(s.loteria)) return { sorteadas: 0, esperando: 0 };
  const rifas = await db
    .select({ id: campaigns.id })
    .from(campaigns)
    .where(and(eq(campaigns.sorteioOficialId, s.id), eq(campaigns.status, "published")))
    .orderBy(asc(campaigns.publishedAt));
  let sorteadas = 0;
  let esperando = 0;
  for (const r of rifas) {
    try {
      await executarSorteio(r.id, { loteria: s.loteria, concurso: s.concurso, numeros: s.resultado, sorteioOficialId: s.id }, {});
      sorteadas++;
    } catch (e) {
      esperando++;
      const motivo = e instanceof SorteioRecusado ? e.message : "Erro ao sortear: a plataforma vai tentar de novo.";
      if (!(e instanceof SorteioRecusado)) console.error(`[sorteio oficial] rifa ${r.id}:`, e);
      await db
        .update(campaigns)
        .set({ sorteioAutoMotivo: motivo.slice(0, 300), sorteioAutoEm: new Date() })
        .where(and(eq(campaigns.id, r.id), eq(campaigns.status, "published")));
    }
  }
  return { sorteadas, esperando };
}

/**
 * O relógio: sorteios oficiais com resultado que ainda têm rifa publicada
 * esperando (a reserva venceu, o Pix foi pago, o adiamento saiu). Cada um
 * passa por `sortearRifasDoSorteioOficial`, que é idempotente.
 */
export async function sortearRifasPendentesDosSorteiosOficiais() {
  const pendentes = await db
    .selectDistinct({ id: sorteiosOficiais.id })
    .from(sorteiosOficiais)
    .innerJoin(campaigns, and(eq(campaigns.sorteioOficialId, sorteiosOficiais.id), eq(campaigns.status, "published")))
    .where(and(isNotNull(sorteiosOficiais.resultadoEm), isNull(sorteiosOficiais.canceladoEm)));
  let sorteadas = 0;
  let esperando = 0;
  for (const p of pendentes) {
    const r = await sortearRifasDoSorteioOficial(p.id);
    sorteadas += r.sorteadas;
    esperando += r.esperando;
  }
  return { sorteadas, esperando };
}
