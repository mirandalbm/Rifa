import { Router } from "express";
import { and, eq, isNull, lt, sql } from "drizzle-orm";
import { db } from "../db";
import { webhookEvents } from "@shared/schema";
import { paymentProviderByName, PROVEDORES_CONHECIDOS } from "../payments";
import type { WebhookResult } from "../payments/provider";
import { OrderError, markOrderPaid, refundByChargeId } from "../services/orders";
import { confirmarRecarga } from "../services/patrocinio";
import { estornarPagamentoIA, confirmarPagamentoIA } from "../services/iaCobranca";

export const webhookRouter = Router();

/**
 * Webhook do provedor de pagamento.
 *
 * Duas regras: a assinatura é validada (o redirect do navegador não vale como
 * prova de pagamento) e o evento é idempotente pela chave (provider,
 * external_id) — reprocessar não faz nada.
 */
webhookRouter.post("/:provider", async (req, res) => {
  const providerName = req.params.provider;
  const raw = Buffer.isBuffer(req.body) ? req.body.toString("utf8") : String(req.body ?? "");

  try {
    // Pelo nome do caminho, não pelo provedor em uso: trocar de provedor no
    // painel não pode deixar sem confirmação o Pix emitido pelo outro.
    if (!(PROVEDORES_CONHECIDOS as readonly string[]).includes(providerName)) {
      return res.status(404).json({ message: "Provedor desconhecido." });
    }
    const provider = paymentProviderByName(providerName);

    const event = await provider.verifyWebhook(req.headers as Record<string, unknown>, raw);

    const inserted = await db
      .insert(webhookEvents)
      .values({
        provider: providerName,
        externalId: event.externalId,
        payload: JSON.parse(raw || "{}"),
      })
      .onConflictDoNothing()
      .returning({ id: webhookEvents.id });

    let eventoId = inserted[0]?.id;
    if (!eventoId) {
      // Já visto. Concluído: responde 200 para o provedor parar de reenviar.
      // Não concluído (o processamento falhou ou o processo caiu no meio): o
      // pagamento NÃO pode ficar perdido atrás de um "duplicado" — a nova
      // entrega retoma a linha. Quem retoma é um `UPDATE` condicional que
      // renova o prazo (`created_at`): duas entregas ao mesmo tempo, uma só
      // processa, e a outra vê a linha fresca e responde duplicado.
      const [retomada] = await db
        .update(webhookEvents)
        .set({ createdAt: sql`now()` })
        .where(
          and(
            eq(webhookEvents.provider, providerName),
            eq(webhookEvents.externalId, event.externalId),
            isNull(webhookEvents.processedAt),
            lt(webhookEvents.createdAt, sql`now() - make_interval(secs => ${PRAZO_DO_PROCESSAMENTO_S})`),
          ),
        )
        .returning({ id: webhookEvents.id });
      if (!retomada) {
        const [vista] = await db
          .select({ processedAt: webhookEvents.processedAt })
          .from(webhookEvents)
          .where(and(eq(webhookEvents.provider, providerName), eq(webhookEvents.externalId, event.externalId)));
        if (vista?.processedAt) return res.json({ ok: true, duplicate: true });
        // Em andamento (outra entrega processa, ou o processo caiu há menos do
        // prazo): NÃO é 2xx. Um 200 aqui encerraria os reenvios do provedor e,
        // se o processo morreu, o Pix pago nunca viraria cota. 503 faz o
        // provedor tentar de novo, e a retomada pega depois do prazo.
        res.setHeader("Retry-After", String(PRAZO_DO_PROCESSAMENTO_S));
        return res.status(503).json({ message: "Evento em processamento. Tente de novo.", emAndamento: true });
      }
      eventoId = retomada.id;
    }

    try {
      await processarEvento(event);
    } catch (err) {
      if (err instanceof OrderError) {
        // Resultado de regra, não falha: cobrança que não conhecemos, ou Pix de
        // pedido já vencido (que `markOrderPaid` já mandou para a fila de
        // devolução). Repetir o evento daria o mesmo — fica concluído, e o
        // provedor para de reenviar.
        console.warn(`[webhook] ${providerName} ${event.externalId}: ${err.message}`);
      } else {
        // Falha inesperada (banco, rede): solta a linha já, para o reenvio do
        // provedor retomar sem esperar o prazo.
        await db
          .update(webhookEvents)
          .set({ createdAt: sql`'epoch'::timestamp` })
          .where(and(eq(webhookEvents.id, eventoId), isNull(webhookEvents.processedAt)))
          .catch(() => {});
        throw err;
      }
    }

    await db
      .update(webhookEvents)
      .set({ processedAt: new Date() })
      .where(eq(webhookEvents.id, eventoId));

    res.json({ ok: true });
  } catch (err) {
    // 4xx faz o provedor reenviar; é o que queremos em falha de assinatura.
    console.error("[webhook]", err);
    res.status(400).json({ message: "Webhook recusado." });
  }
});

/** Quanto uma entrega sem conclusão é considerada "em andamento" antes de outra poder retomá-la. */
const PRAZO_DO_PROCESSAMENTO_S = 60;

/**
 * O efeito do evento. Cada passo é idempotente por conta própria (`UPDATE`
 * condicional no pedido, chave única no livro), por isso retomar um evento que
 * falhou no meio nunca cobra, credita ou estorna duas vezes.
 */
async function processarEvento(event: WebhookResult) {
  if (event.event === "ignored" || !event.chargeId) {
    // Nada a fazer; o evento fica gravado para não ser reprocessado.
    return;
  }
  if (event.event === "paid") {
    // Recarga de patrocínio (etapa 15) e Pix do assistente não são pedido: creditam o saldo de cada um.
    if (!(await confirmarPagamentoIA(event.chargeId)) && !(await confirmarRecarga(event.chargeId))) {
      await markOrderPaid(event.chargeId);
    }
  }

  // Estorno desfaz tudo que o pagamento criou: cota de volta ao estoque,
  // comissão revertida, taxa da plataforma cancelada. Antes disto o evento
  // era gravado e ignorado — a venda sumia do caixa mas a comissão era
  // liberada normalmente pelo relógio, que só olha a carência.
  if (event.event === "refunded" && !(await estornarPagamentoIA(event.chargeId))) {
    // No carrinho num Pix só, a cobrança é de vários pedidos: todos voltam.
    for (const r of await refundByChargeId(event.chargeId)) {
      if (r.comissaoJaPagaCents > 0) {
        // Comissão já sacada não volta sozinha. Fica no log porque é dinheiro
        // que saiu e alguém precisa cobrar de volta.
        console.warn(
          `[webhook] estorno do pedido ${r.order.code}: ${r.comissaoJaPagaCents} centavos de comissão já tinham sido pagos`,
        );
      }
    }
  }

  // `expired` não faz nada aqui de propósito: quem devolve reserva vencida
  // é o relógio (`releaseExpired`), que pega também quem nunca gerou Pix.
}
