import { Router } from "express";
import { eq, and, desc, sql, isNull } from "drizzle-orm";
import { db } from "../db";
import { orders, buyers, campaigns, affiliates, createOrderSchema } from "@shared/schema";
import { affiliateId } from "../auth";
import {
  createSellerSale,
  confirmSellerSale,
  cancelSellerSale,
  OrderError,
} from "../services/orders";
import { NumbersTakenError, NoQuotasAvailableError } from "../services/quotas";
import { openBalance, listSettlements } from "../services/settlements";
import { buildTicket } from "../services/ticket";
import { getPaymentMethods } from "../services/settings";
import { hit, identify } from "../services/antifraude";
import { enabledPhysical } from "@shared/payments";
import {
  VENDAS_DO_CAMBISTA_POR_JANELA,
  codigoDaVenda,
  lerComprovanteDaMaquininha,
  lerMeioFisico,
} from "@shared/vendaFisica";

export const sellerRouter = Router();

/**
 * O cambista é preso à organização do usuário dele. Organização nula é a
 * plataforma — recorte que abre tudo —, e o cambista nunca é a plataforma:
 * sem organização, a porta fica fechada (a entrada e a sessão já recusam, e
 * aqui é a última linha, como o organizador sem organização).
 */
sellerRouter.use((req, res, next) => {
  if (!req.user?.organizationId) {
    return res.status(403).json({ message: "Seu acesso não está ligado a nenhuma organização." });
  }
  next();
});

/** A organização da sessão, já conferida pelo `use` acima. */
const orgDoCambista = (req: { user?: { organizationId?: string | null } }) => req.user!.organizationId!;

/** Tela de abrir o dia: o que dá para vender e quanto eu devo. */
sellerRouter.get("/overview", async (req, res, next) => {
  try {
    const id = affiliateId(req);
    const [seller] = await db.select().from(affiliates).where(eq(affiliates.id, id));

    const live = await db
      .select({
        id: campaigns.id,
        slug: campaigns.slug,
        title: campaigns.title,
        prizeTitle: campaigns.prizeTitle,
        priceCents: campaigns.priceCents,
        minPerOrder: campaigns.minPerOrder,
        maxPerOrder: campaigns.maxPerOrder,
        totalQuotas: campaigns.totalQuotas,
        metodoApuracao: campaigns.metodoApuracao,
        drawAt: campaigns.drawAt,
        commissionPctDefault: campaigns.commissionPctDefault,
      })
      .from(campaigns)
      // O cambista só vende rifa da organização dele. Sem este filtro ele
      // venderia cota de outro promotor, e o acerto cairia no caixa errado.
      // Demonstração e rifa travada pela plataforma não vendem (a reserva as
      // recusa): não são oferecidas.
      .where(
        and(
          eq(campaigns.status, "published"),
          eq(campaigns.organizationId, orgDoCambista(req)),
          eq(campaigns.demonstracao, false),
          isNull(campaigns.travadaEm),
        ),
      );

    const [hoje] = await db
      .select({
        vendas: sql<number>`count(*)::int`,
        cotas: sql<number>`coalesce(sum(${orders.quantity}), 0)::int`,
        totalCents: sql<number>`coalesce(sum(${orders.amountCents}), 0)::int`,
      })
      .from(orders)
      .where(
        and(
          eq(orders.sellerId, id),
          eq(orders.status, "paid"),
          // "Hoje" é o dia de São Paulo, não o do banco (UTC): às 21h o contador
          // zerava, e a venda da noite — a do evento — caía no dia seguinte.
          // `paid_at` guarda UTC: o início do dia é convertido uma vez e a
          // comparação fica na coluna crua.
          sql`${orders.paidAt} >= (date_trunc('day', now() AT TIME ZONE 'America/Sao_Paulo') AT TIME ZONE 'America/Sao_Paulo') AT TIME ZONE 'UTC'`,
        ),
      );

    res.json({
      seller: { code: seller.code, commissionPct: seller.commissionPct },
      meios: enabledPhysical(await getPaymentMethods()),
      campanhas: live.map((c) => ({
        ...c,
        pct: seller.commissionPct ?? c.commissionPctDefault,
      })),
      hoje,
      acerto: await openBalance(id),
    });
  } catch (err) {
    next(err);
  }
});

/** Passo 1: reserva as cotas e devolve o total a cobrar. */
sellerRouter.post("/sales", async (req, res, next) => {
  try {
    const id = affiliateId(req);
    const input = createOrderSchema.parse(req.body);

    // A tela só oferece as rifas da organização dele, mas a tela é cortesia:
    // quem barra é aqui.
    const [alvo] = await db
      .select({ organizationId: campaigns.organizationId })
      .from(campaigns)
      .where(eq(campaigns.id, input.campaignId));
    if (!alvo || alvo.organizationId !== orgDoCambista(req)) {
      return res.status(404).json({ message: "Campanha não encontrada." });
    }
    // Teto de vendas novas por cambista, depois do erro de preenchimento e do
    // recorte (que não contam): a venda dele é isenta dos limites de comprador,
    // e sem este teto uma conta reservaria o estoque da rifa sem parar.
    const { minutos, limite } = VENDAS_DO_CAMBISTA_POR_JANELA;
    if ((await hit(`cambista-venda:${id}`, minutos, limite)).excedeu) {
      return res.status(429).json({ message: "Muitas vendas em pouco tempo. Espere alguns minutos e tente de novo." });
    }
    const result = await createSellerSale(input, id, identify(req));

    res.status(201).json({
      code: result.order.code,
      numbers: result.numbers,
      amountCents: result.order.amountCents,
      discountCents: result.order.discountCents,
      expiresAt: result.order.expiresAt,
    });
  } catch (err) {
    if (err instanceof NumbersTakenError) {
      return res.status(409).json({ message: err.message, taken: err.taken });
    }
    if (err instanceof NoQuotasAvailableError) {
      return res.status(409).json({ message: err.message });
    }
    if (err instanceof OrderError) {
      return res.status(err.status).json({ message: err.message });
    }
    next(err);
  }
});

/** Passo 2: recolheu o dinheiro (ou a maquininha aprovou). */
sellerRouter.post("/sales/:code/confirm", async (req, res, next) => {
  try {
    const id = affiliateId(req);
    const method = lerMeioFisico(req.body?.method);
    if (!method) {
      return res.status(400).json({ message: "Forma de pagamento inválida." });
    }
    const comprovante = lerComprovanteDaMaquininha(req.body?.posAuthCode, req.body?.posTerminal);
    if (!comprovante.ok) return res.status(400).json({ message: comprovante.message });
    // O que não é um código de venda não existe (404), como a venda do colega.
    const code = codigoDaVenda(req.params.code);
    if (code === null) return res.status(404).json({ message: "Venda não encontrada." });

    const result = await confirmSellerSale({
      code,
      sellerId: id,
      method,
      posAuthCode: comprovante.posAuthCode,
      posTerminal: comprovante.posTerminal,
    });

    res.json({
      code: result.order!.code,
      status: result.order!.status,
      prizes: result.prizes,
      ticket: await buildTicket(code),
    });
  } catch (err) {
    if (err instanceof OrderError) {
      return res.status(err.status).json({ message: err.message });
    }
    next(err);
  }
});

/** Pix não pago ou desistência: devolve as cotas na hora. */
sellerRouter.post("/sales/:code/cancel", async (req, res, next) => {
  try {
    const id = affiliateId(req);
    const code = codigoDaVenda(req.params.code);
    if (code === null) return res.status(404).json({ message: "Venda não encontrada." });
    res.json(await cancelSellerSale({ code, sellerId: id }));
  } catch (err) {
    if (err instanceof OrderError) {
      return res.status(err.status).json({ message: err.message });
    }
    next(err);
  }
});

sellerRouter.get("/sales", async (req, res, next) => {
  try {
    const id = affiliateId(req);
    const rows = await db
      .select({
        code: orders.code,
        status: orders.status,
        method: orders.method,
        quantity: orders.quantity,
        amountCents: orders.amountCents,
        paidAt: orders.paidAt,
        createdAt: orders.createdAt,
        settlementId: orders.settlementId,
        buyerName: buyers.name,
        campaignTitle: campaigns.title,
      })
      .from(orders)
      .innerJoin(buyers, eq(buyers.id, orders.buyerId))
      .innerJoin(campaigns, eq(campaigns.id, orders.campaignId))
      .where(eq(orders.sellerId, id))
      .orderBy(desc(orders.createdAt))
      .limit(200);
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

sellerRouter.get("/settlement", async (req, res, next) => {
  try {
    const id = affiliateId(req);
    res.json({
      aberto: await openBalance(id),
      historico: await listSettlements(id),
    });
  } catch (err) {
    next(err);
  }
});
