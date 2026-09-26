import { Router } from "express";
import { eq, and, sql, desc, inArray } from "drizzle-orm";
import { db } from "../db";
import {
  affiliates,
  commissions,
  payouts,
  orders,
  campaigns,
  buyers,
  clickEvents,
  coupons,
  organizations,
  afiliadoVinculos,
} from "@shared/schema";
import { aderir, comissaoNaRifa, organizacoesDoAfiliado, sair } from "../services/afiliados";
import { identify } from "../services/antifraude";
import QRCode from "qrcode";
import { affiliateId } from "../auth";
import { formatBRL } from "@shared/format";

export const affiliateRouter = Router();

/** Painel: cliques, conversão, receita gerada e comissão, em uma chamada. */
affiliateRouter.get("/overview", async (req, res, next) => {
  try {
    const id = affiliateId(req);

    const [aff] = await db.select().from(affiliates).where(eq(affiliates.id, id));

    const [clicks] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(clickEvents)
      .where(eq(clickEvents.affiliateId, id));

    const [sales] = await db
      .select({
        orders: sql<number>`count(*)::int`,
        revenueCents: sql<number>`coalesce(sum(${orders.amountCents}), 0)::int`,
      })
      .from(orders)
      .where(and(eq(orders.affiliateId, id), eq(orders.status, "paid")));

    const balance = await db
      .select({
        status: commissions.status,
        total: sql<number>`coalesce(sum(${commissions.amountCents}), 0)::int`,
      })
      .from(commissions)
      .where(eq(commissions.affiliateId, id))
      .groupBy(commissions.status);

    const byStatus = Object.fromEntries(balance.map((b) => [b.status, b.total]));

    const daily = await db.execute(sql`
      SELECT date_trunc('day', o.paid_at) AS day, count(*)::int AS sales
      FROM orders o
      WHERE o.affiliate_id = ${id}::uuid
        AND o.status = 'paid'
        AND o.paid_at > now() - interval '14 days'
      GROUP BY 1 ORDER BY 1
    `);

    const conversion = clicks.n > 0 ? sales.orders / clicks.n : 0;

    res.json({
      affiliate: {
        code: aff.code,
        pixKey: aff.pixKey,
        commissionPct: aff.commissionPct,
        status: aff.status,
      },
      clicks: clicks.n,
      sales: sales.orders,
      conversion,
      revenueCents: sales.revenueCents,
      commission: {
        pendingCents: byStatus.pending ?? 0,
        availableCents: byStatus.available ?? 0,
        paidCents: byStatus.paid ?? 0,
        reversedCents: byStatus.reversed ?? 0,
      },
      daily: daily.rows,
    });
  } catch (err) {
    next(err);
  }
});

/** Extrato por pedido: pendente, liberada, paga, estornada. */
affiliateRouter.get("/commissions", async (req, res, next) => {
  try {
    const id = affiliateId(req);
    const rows = await db
      .select({
        id: commissions.id,
        amountCents: commissions.amountCents,
        pct: commissions.pct,
        status: commissions.status,
        availableAt: commissions.availableAt,
        createdAt: commissions.createdAt,
        orderCode: orders.code,
        orderAmountCents: orders.amountCents,
        quantity: orders.quantity,
        // Quem comprou pelo link é cliente da plataforma: o afiliado vê só o
        // primeiro nome. A venda do cambista é dele — nome inteiro.
        buyerName: sql<string>`CASE WHEN ${orders.sellerId} IS NOT NULL THEN ${buyers.name}
                                    ELSE split_part(${buyers.name}, ' ', 1) END`,
        campaignTitle: campaigns.title,
      })
      .from(commissions)
      .innerJoin(orders, eq(orders.id, commissions.orderId))
      .innerJoin(buyers, eq(buyers.id, orders.buyerId))
      .innerJoin(campaigns, eq(campaigns.id, commissions.campaignId))
      .where(eq(commissions.affiliateId, id))
      .orderBy(desc(commissions.createdAt))
      .limit(200);

    res.json(rows);
  } catch (err) {
    next(err);
  }
});

/**
 * Kit de divulgação: link, QR pronto para o story e textos que o afiliado
 * só precisa copiar. Sem isso, cada um inventa a própria mensagem — e a pior
 * delas vira a cara da campanha.
 */
affiliateRouter.get("/links", async (req, res, next) => {
  try {
    const id = affiliateId(req);
    const [aff] = await db.select().from(affiliates).where(eq(affiliates.id, id));

    // Só as rifas das organizações com que o afiliado tem vínculo aprovado
    // (ou a "de casa", do cadastro antigo) — as outras não pagariam comissão.
    const todas = await db
      .select({
        id: campaigns.id,
        slug: campaigns.slug,
        title: campaigns.title,
        prizeTitle: campaigns.prizeTitle,
        priceCents: campaigns.priceCents,
        drawAt: campaigns.drawAt,
        commissionPctDefault: campaigns.commissionPctDefault,
        organizationId: campaigns.organizationId,
        termoId: campaigns.termoId,
        organizacao: organizations.name,
      })
      .from(campaigns)
      .innerJoin(organizations, eq(organizations.id, campaigns.organizationId))
      .where(eq(campaigns.status, "published"));
    const comComissao = await Promise.all(todas.map(async (c) => ({ c, r: await comissaoNaRifa(db, id, c) })));
    const vinculados = new Set(
      (
        await db
          .select({ org: afiliadoVinculos.organizationId })
          .from(afiliadoVinculos)
          .where(and(eq(afiliadoVinculos.affiliateId, id), eq(afiliadoVinculos.status, "aprovado")))
      ).map((v) => v.org),
    );
    // Aparece a rifa que paga, e a da organização aprovada que só espera o
    // aceite da versão nova do termo (com o aviso).
    const live = comComissao
      .filter(({ c, r }) => r.recebe || vinculados.has(c.organizationId))
      .map(({ c, r }) => ({ ...c, pct: r.pct, termoPendente: !r.recebe }));

    const myCoupons = await db
      .select()
      .from(coupons)
      .where(eq(coupons.affiliateId, id));

    const base = publicBaseUrl(req);

    const result = await Promise.all(
      live.map(async (c) => {
        const url = `${base}/r/${c.slug}?ref=${aff.code}`;
        const coupon = myCoupons.find(
          (k) => (!k.campaignId || k.campaignId === c.id) && (!k.organizationId || k.organizationId === c.organizationId),
        );
        const price = formatBRL(c.priceCents);
        const draw = c.drawAt
          ? new Date(c.drawAt).toLocaleDateString("pt-BR")
          : "em breve";

        return {
          slug: c.slug,
          title: c.title,
          organizacao: c.organizacao,
          termoPendente: c.termoPendente,
          pct: c.pct,
          url,
          qr: await QRCode.toDataURL(url, { margin: 1, width: 320 }),
          coupon: coupon
            ? { code: coupon.code, discountPct: coupon.discountPct }
            : null,
          texts: [
            `🎟️ ${c.prizeTitle} está sendo rifado! Cota a partir de ${price}. Sorteio ${draw} pela Loteria Federal. Garanta o seu: ${url}`,
            `Tô participando da rifa do ${c.prizeTitle} 👀 cota ${price} e o pagamento é na hora pelo Pix. Entra comigo: ${url}`,
            coupon
              ? `Use o cupom ${coupon.code} e ganhe ${coupon.discountPct}% de desconto na rifa do ${c.prizeTitle}: ${url}`
              : `Últimas cotas da rifa do ${c.prizeTitle}! Sorteio ${draw}. ${url}`,
          ],
        };
      }),
    );

    res.json(result);
  } catch (err) {
    next(err);
  }
});

/** Cupons do afiliado — criados pelo administrador, exibidos aqui. */
affiliateRouter.get("/coupons", async (req, res, next) => {
  try {
    const id = affiliateId(req);
    res.json(await db.select().from(coupons).where(eq(coupons.affiliateId, id)));
  } catch (err) {
    next(err);
  }
});

/** O link precisa levar ao domínio pelo qual a pessoa está acessando. */
function publicBaseUrl(req: { protocol: string; get(name: string): string | undefined }): string {
  if (process.env.PUBLIC_BASE_URL) return process.env.PUBLIC_BASE_URL.replace(/\/+$/, "");
  const host = req.get("host") ?? "localhost";
  return `${req.protocol}://${host}`;
}

affiliateRouter.patch("/pix-key", async (req, res, next) => {
  try {
    const id = affiliateId(req);
    const pixKey = String(req.body?.pixKey ?? "").trim();
    if (pixKey.length < 5) return res.status(400).json({ message: "Chave Pix inválida." });

    await db.update(affiliates).set({ pixKey }).where(eq(affiliates.id, id));
    res.json({ pixKey });
  } catch (err) {
    next(err);
  }
});

/** Saldo liberado por organização: cada uma paga o que é dela. */
affiliateRouter.get("/saldo", async (req, res, next) => {
  try {
    const id = affiliateId(req);
    const linhas = await db
      .select({
        organizacaoId: organizations.id,
        organizacao: organizations.name,
        disponivelCents: sql<number>`coalesce(sum(${commissions.amountCents}) filter (where ${commissions.status} = 'available'), 0)::int`,
        pendenteCents: sql<number>`coalesce(sum(${commissions.amountCents}) filter (where ${commissions.status} = 'pending'), 0)::int`,
      })
      .from(commissions)
      .innerJoin(campaigns, eq(campaigns.id, commissions.campaignId))
      .innerJoin(organizations, eq(organizations.id, campaigns.organizationId))
      .where(eq(commissions.affiliateId, id))
      .groupBy(organizations.id, organizations.name);
    res.json(linhas);
  } catch (err) {
    next(err);
  }
});

/**
 * Saque: só o que já passou da carência, e de **uma** organização — é ela
 * quem paga. Com saldo em uma só, ela é escolhida sozinha.
 */
affiliateRouter.post("/payouts", async (req, res, next) => {
  try {
    const id = affiliateId(req);
    const [aff] = await db.select().from(affiliates).where(eq(affiliates.id, id));
    if (!aff.pixKey) {
      return res.status(400).json({ message: "Cadastre sua chave Pix antes de sacar." });
    }

    const payout = await db.transaction(async (tx) => {
      const disponivelPorOrg = await tx
        .select({ org: campaigns.organizationId, id: commissions.id, amountCents: commissions.amountCents })
        .from(commissions)
        .innerJoin(campaigns, eq(campaigns.id, commissions.campaignId))
        .where(and(eq(commissions.affiliateId, id), eq(commissions.status, "available")))
        .for("update", { of: commissions });

      const orgs = [...new Set(disponivelPorOrg.map((d) => d.org))];
      const pedida = typeof req.body?.organizacaoId === "string" ? req.body.organizacaoId : orgs.length === 1 ? orgs[0] : null;
      if (!pedida) {
        if (orgs.length > 1) throw Object.assign(new Error("Escolha de qual organização é o saque."), { status: 400 });
        return null;
      }
      const lote = disponivelPorOrg.filter((d) => d.org === pedida);
      const totalCents = lote.reduce((sum, c) => sum + c.amountCents, 0);
      if (totalCents <= 0) {
        return null;
      }

      const [created] = await tx
        .insert(payouts)
        .values({ affiliateId: id, organizationId: pedida, amountCents: totalCents, pixKey: aff.pixKey! })
        .returning();

      await tx
        .update(commissions)
        .set({ status: "paid", payoutId: created.id })
        .where(
          and(
            eq(commissions.status, "available"),
            inArray(commissions.id, lote.map((c) => c.id)),
          ),
        );

      return created;
    });

    if (!payout) {
      return res.status(400).json({ message: "Nenhuma comissão liberada para saque." });
    }
    res.status(201).json(payout);
  } catch (err) {
    next(err);
  }
});

affiliateRouter.get("/payouts", async (req, res, next) => {
  try {
    const id = affiliateId(req);
    res.json(
      await db
        .select()
        .from(payouts)
        .where(eq(payouts.affiliateId, id))
        .orderBy(desc(payouts.requestedAt)),
    );
  } catch (err) {
    next(err);
  }
});

/* ---------------- organizações (vínculos e termo) ---------------- */

/** As organizações ativas, com o termo em vigor e o vínculo do afiliado. */
affiliateRouter.get("/organizacoes", async (req, res, next) => {
  try {
    res.json(await organizacoesDoAfiliado(affiliateId(req)));
  } catch (err) {
    next(err);
  }
});

/**
 * Aderir (ou aceitar a versão nova do termo). O aceite guarda a cópia do
 * texto, a versão, IP e aparelho em hash — é a prova do combinado.
 */
affiliateRouter.post("/organizacoes/:slug/aderir", async (req, res, next) => {
  try {
    res.json(
      await aderir(affiliateId(req), req.params.slug, { versao: req.body?.versao, identidade: identify(req) }),
    );
  } catch (err) {
    next(err);
  }
});

/** Sair: desfaz o vínculo, sem perder o que já ganhou. */
affiliateRouter.delete("/organizacoes/:slug", async (req, res, next) => {
  try {
    await sair(affiliateId(req), req.params.slug);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});
