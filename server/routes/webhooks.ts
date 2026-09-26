import { Router } from "express";
import { eq } from "drizzle-orm";
import { db } from "../db";
import { webhookEvents } from "@shared/schema";
import { paymentProviderByName, PROVEDORES_CONHECIDOS } from "../payments";
import { markOrderPaid, refundByChargeId } from "../services/orders";

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

    // Já processado: responder 200 para o provedor parar de reenviar.
    if (inserted.length === 0) {
      return res.json({ ok: true, duplicate: true });
    }

    if (event.event === "ignored" || !event.chargeId) {
      // Nada a fazer; o evento fica gravado para não ser reprocessado.
    } else if (event.event === "paid") {
      await markOrderPaid(event.chargeId);
    }

    // Estorno desfaz tudo que o pagamento criou: cota de volta ao estoque,
    // comissão revertida, taxa da plataforma cancelada. Antes disto o evento
    // era gravado e ignorado — a venda sumia do caixa mas a comissão era
    // liberada normalmente pelo relógio, que só olha a carência.
    if (event.event === "refunded" && event.chargeId) {
      const r = await refundByChargeId(event.chargeId);
      if (r && r.comissaoJaPagaCents > 0) {
        // Comissão já sacada não volta sozinha. Fica no log porque é dinheiro
        // que saiu e alguém precisa cobrar de volta.
        console.warn(
          `[webhook] estorno do pedido ${r.order.code}: ${r.comissaoJaPagaCents} centavos de comissão já tinham sido pagos`,
        );
      }
    }

    // `expired` não faz nada aqui de propósito: quem devolve reserva vencida
    // é o relógio (`releaseExpired`), que pega também quem nunca gerou Pix.

    await db
      .update(webhookEvents)
      .set({ processedAt: new Date() })
      .where(eq(webhookEvents.id, inserted[0].id));

    res.json({ ok: true });
  } catch (err) {
    // 4xx faz o provedor reenviar; é o que queremos em falha de assinatura.
    console.error("[webhook]", err);
    res.status(400).json({ message: "Webhook recusado." });
  }
});
