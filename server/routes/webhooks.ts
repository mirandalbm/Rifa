import { Router } from "express";
import { eq } from "drizzle-orm";
import { db } from "../db";
import { webhookEvents } from "@shared/schema";
import { paymentProvider } from "../payments";
import { markOrderPaid } from "../services/orders";

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
    const provider = paymentProvider();
    if (provider.name !== providerName) {
      return res.status(404).json({ message: "Provedor desconhecido." });
    }

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

    if (event.event === "paid") {
      await markOrderPaid(event.chargeId);
    }

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
