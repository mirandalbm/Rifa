import { Router } from "express";
import { eq } from "drizzle-orm";
import { db } from "../db";
import { orders } from "@shared/schema";
import { markOrderPaid } from "../services/orders";

/**
 * Atalhos de desenvolvimento. Existem para o fluxo rodar de ponta a ponta
 * sem credencial de provedor — e se recusam a montar em produção.
 */
export const devRouter = Router();

devRouter.use((_req, res, next) => {
  if (process.env.NODE_ENV === "production") {
    return res.status(404).json({ message: "Não disponível." });
  }
  next();
});

/** Simula o Pix compensado do pedido. */
devRouter.post("/pay/:code", async (req, res, next) => {
  try {
    const [order] = await db
      .select()
      .from(orders)
      .where(eq(orders.code, Number(req.params.code)));
    if (!order?.pspChargeId) {
      return res.status(404).json({ message: "Pedido sem cobrança." });
    }
    res.json(await markOrderPaid(order.pspChargeId));
  } catch (err) {
    next(err);
  }
});
