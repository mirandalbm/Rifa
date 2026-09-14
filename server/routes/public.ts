import { Router } from "express";
import { createHash } from "node:crypto";
import { eq, and, desc, sql } from "drizzle-orm";
import { db } from "../db";
import {
  campaigns,
  campaignMedia,
  campaignStats,
  quotaPackages,
  affiliates,
  clickEvents,
  buyers,
  users,
  orders,
  prizedQuotas,
  createOrderSchema,
} from "@shared/schema";
import { normalizePhone, hidePhone } from "@shared/format";
import { listPublicCampaigns, campaignBySlug } from "../services/campaigns";
import { createOrder, orderByCode, ordersByPhone, OrderError } from "../services/orders";
import { blockBitmap, isTaken, BLOCK_SIZE, NumbersTakenError, NoQuotasAvailableError } from "../services/quotas";
import { issueOtp, checkOtp, hashPassword } from "../auth";
import { withUrls } from "../services/media";
import { notify, notificationProvider } from "../notifications";
import { buildTicket, escPosTicket, markTicketPrinted } from "../services/ticket";
import { getPaymentMethods } from "../services/settings";
import { identify, guardOtp } from "../services/antifraude";
import { paymentSummary } from "@shared/payments";

export const publicRouter = Router();

const AFFILIATE_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

function hash(value: string) {
  return createHash("sha256").update(value).digest("hex").slice(0, 32);
}

/* ---------------- vitrine multi-rifas ---------------- */

publicRouter.get("/campaigns", async (_req, res, next) => {
  try {
    const rows = await listPublicCampaigns();
    const banners = await db
      .select()
      .from(campaignMedia)
      .where(and(eq(campaignMedia.role, "banner"), eq(campaignMedia.status, "ready")));
    const bannerBy = new Map(banners.map((b) => [b.campaignId, withUrls(b)]));

    res.json(
      rows.map(({ campaign, stats }) => ({
        id: campaign.id,
        slug: campaign.slug,
        title: campaign.title,
        prizeTitle: campaign.prizeTitle,
        priceCents: campaign.priceCents,
        totalQuotas: campaign.totalQuotas,
        drawAt: campaign.drawAt,
        featured: campaign.featured,
        soldCount: stats?.soldCount ?? 0,
        banner: bannerBy.get(campaign.id)?.url ?? null,
        bannerSrcSet: bannerBy.get(campaign.id)?.srcSetWebp ?? null,
        bannerLqip: bannerBy.get(campaign.id)?.lqip ?? null,
      })),
    );
  } catch (err) {
    next(err);
  }
});

/* ---------------- tela inicial da rifa ---------------- */

publicRouter.get("/campaigns/:slug", async (req, res, next) => {
  try {
    const found = await campaignBySlug(req.params.slug);
    if (!found || found.campaign.status === "draft") {
      return res.status(404).json({ message: "Rifa não encontrada." });
    }

    const packages = await db
      .select()
      .from(quotaPackages)
      .where(eq(quotaPackages.campaignId, found.campaign.id))
      .orderBy(quotaPackages.quantity);

    res.json({
      campaign: {
        id: found.campaign.id,
        slug: found.campaign.slug,
        title: found.campaign.title,
        description: found.campaign.description,
        prizeTitle: found.campaign.prizeTitle,
        totalQuotas: found.campaign.totalQuotas,
        priceCents: found.campaign.priceCents,
        minPerOrder: found.campaign.minPerOrder,
        maxPerOrder: found.campaign.maxPerOrder,
        reservationTtlMin: found.campaign.reservationTtlMin,
        drawAt: found.campaign.drawAt,
        drawSeedHash: found.campaign.drawSeedHash,
        authorizationCode: found.campaign.authorizationCode,
        status: found.campaign.status,
      },
      stats: {
        soldCount: found.stats?.soldCount ?? 0,
        reservedCount: found.stats?.reservedCount ?? 0,
      },
      media: found.media.map((m) => {
        const withUrl = withUrls(m);
        return {
          role: m.role,
          position: m.position,
          url: withUrl.url,
          srcSetAvif: withUrl.srcSetAvif,
          srcSetWebp: withUrl.srcSetWebp,
          lqip: m.lqip,
          poster: m.posterKey,
          durationS: m.durationS,
          altText: m.altText,
        };
      }),
      packages,
      blockSize: BLOCK_SIZE,
      pagamento: paymentSummary(await getPaymentMethods()),
    });
  } catch (err) {
    next(err);
  }
});

/** Ocupação de um bloco: 1.000 bits em base64, 125 bytes. */
publicRouter.get("/campaigns/:slug/blocks/:block", async (req, res, next) => {
  try {
    const found = await campaignBySlug(req.params.slug);
    if (!found) return res.status(404).json({ message: "Rifa não encontrada." });

    const block = Number(req.params.block);
    const maxBlock = Math.ceil(found.campaign.totalQuotas / BLOCK_SIZE) - 1;
    if (!Number.isInteger(block) || block < 0 || block > maxBlock) {
      return res.status(400).json({ message: "Bloco fora da faixa." });
    }

    res.json(await blockBitmap(found.campaign.id, block, found.campaign.totalQuotas));
  } catch (err) {
    next(err);
  }
});

/** Busca direta: quem já sabe o número pula o mapa inteiro. */
publicRouter.get("/campaigns/:slug/numbers/:number", async (req, res, next) => {
  try {
    const found = await campaignBySlug(req.params.slug);
    if (!found) return res.status(404).json({ message: "Rifa não encontrada." });

    const number = Number(req.params.number);
    if (!Number.isInteger(number) || number < 1 || number > found.campaign.totalQuotas) {
      return res.status(400).json({ message: "Número fora da faixa desta rifa." });
    }

    res.json({ number, taken: await isTaken(found.campaign.id, number) });
  } catch (err) {
    next(err);
  }
});

/* ---------------- atribuição do afiliado ---------------- */

/** Primeiro clique vence e dura 30 dias. Cupom no checkout sobrepõe. */
publicRouter.post("/track-click", async (req, res, next) => {
  try {
    const code = String(req.body?.ref ?? "").toUpperCase().trim();
    const slug = req.body?.slug ? String(req.body.slug) : undefined;
    if (!code) return res.status(400).json({ message: "Código ausente." });

    const [aff] = await db
      .select()
      .from(affiliates)
      .where(and(eq(affiliates.code, code), eq(affiliates.status, "active")));
    if (!aff) return res.json({ tracked: false });

    const fresh =
      !req.session.affiliateSince ||
      Date.now() - req.session.affiliateSince > AFFILIATE_WINDOW_MS;

    if (!req.session.affiliateCode || fresh) {
      req.session.affiliateCode = code;
      req.session.affiliateSince = Date.now();
    }

    let campaignId: string | undefined;
    if (slug) {
      const [c] = await db
        .select({ id: campaigns.id })
        .from(campaigns)
        .where(eq(campaigns.slug, slug));
      campaignId = c?.id;
    }

    await db.insert(clickEvents).values({
      affiliateId: aff.id,
      campaignId,
      ipHash: req.ip ? hash(req.ip) : null,
      uaHash: req.get("user-agent") ? hash(req.get("user-agent")!) : null,
    });

    res.json({ tracked: true, attributed: req.session.affiliateCode });
  } catch (err) {
    next(err);
  }
});

/* ---------------- pedido ---------------- */

publicRouter.post("/orders", async (req, res, next) => {
  try {
    const input = createOrderSchema.parse(req.body);
    const result = await createOrder(input, {
      sessionAffiliateCode: req.session.affiliateCode,
      identity: identify(req),
    });

    res.status(201).json({
      code: result.order.code,
      numbers: result.numbers,
      amountCents: result.order.amountCents,
      discountCents: result.order.discountCents,
      expiresAt: result.order.expiresAt,
      pix: { qr: result.order.pixQr, copyPaste: result.order.pixCopyPaste },
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

/** A tela de pagamento pergunta por aqui até o webhook chegar. */
publicRouter.get("/orders/:code", async (req, res, next) => {
  try {
    const found = await orderByCode(Number(req.params.code));
    if (!found) return res.status(404).json({ message: "Pedido não encontrado." });

    res.json({
      code: found.order.code,
      status: found.order.status,
      quantity: found.order.quantity,
      amountCents: found.order.amountCents,
      discountCents: found.order.discountCents,
      expiresAt: found.order.expiresAt,
      paidAt: found.order.paidAt,
      numbers: found.numbers,
      prizes: found.prizes,
      pix: { qr: found.order.pixQr, copyPaste: found.order.pixCopyPaste },
      campaign: {
        title: found.campaign.title,
        slug: found.campaign.slug,
        totalQuotas: found.campaign.totalQuotas,
      },
      buyer: { name: found.buyer.name },
    });
  } catch (err) {
    next(err);
  }
});

/* ---------------- minhas cotas: telefone + código ---------------- */

publicRouter.post("/my-quotas/request-code", async (req, res, next) => {
  try {
    const phone = normalizePhone(String(req.body?.phone ?? ""));
    if (phone.length < 10) return res.status(400).json({ message: "Telefone inválido." });

    const veredito = await guardOtp(phone, identify(req));
    if (!veredito.allowed) {
      return res.status(429).json({ message: veredito.reason });
    }

    const code = await issueOtp(req, phone);

    await notify({
      to: phone,
      template: "codigo_acesso",
      params: { codigo: code },
      // Um código novo a cada pedido: a chave leva o instante.
      dedupeKey: `otp:${phone}:${Date.now()}`,
    });

    // Sem WhatsApp configurado, o código volta na resposta para o fluxo
    // rodar em desenvolvimento. Com provedor real, nunca.
    const echo =
      notificationProvider().name === "console" && process.env.NODE_ENV !== "production"
        ? { devCode: code }
        : {};
    res.json({ sent: true, ...echo });
  } catch (err) {
    next(err);
  }
});

publicRouter.post("/my-quotas/verify", async (req, res, next) => {
  try {
    const code = String(req.body?.code ?? "").trim();
    const phone = req.session.otp?.phone;
    if (!phone) return res.status(400).json({ message: "Peça um código novo." });

    if (!(await checkOtp(req, code))) {
      return res.status(401).json({ message: "Código incorreto ou expirado." });
    }

    const [buyer] = await db.select().from(buyers).where(eq(buyers.phone, phone));
    req.session.buyer = buyer
      ? { id: buyer.id, phone: buyer.phone, name: buyer.name }
      : { id: "", phone, name: "" };

    res.json({ orders: await ordersByPhone(phone) });
  } catch (err) {
    next(err);
  }
});

publicRouter.get("/my-quotas", async (req, res, next) => {
  try {
    const phone = req.session.buyer?.phone;
    if (!phone) return res.status(401).json({ message: "Confirme seu telefone." });
    res.json({ orders: await ordersByPhone(phone) });
  } catch (err) {
    next(err);
  }
});

/* ---------------- bilhete ---------------- */

/**
 * Dados do bilhete. Público pelo código do pedido, que é justamente o
 * número impresso no comprovante de quem comprou.
 */
publicRouter.get("/tickets/:code", async (req, res, next) => {
  try {
    const ticket = await buildTicket(Number(req.params.code));
    if (!ticket) return res.status(404).json({ message: "Bilhete não encontrado." });
    res.json(ticket);
  } catch (err) {
    next(err);
  }
});

/** Texto pronto para a impressora térmica da maquininha. */
publicRouter.get("/tickets/:code/escpos", async (req, res, next) => {
  try {
    const ticket = await buildTicket(Number(req.params.code));
    if (!ticket) return res.status(404).json({ message: "Bilhete não encontrado." });
    res.type("text/plain; charset=utf-8").send(escPosTicket(ticket));
  } catch (err) {
    next(err);
  }
});

publicRouter.post("/tickets/:code/printed", async (req, res, next) => {
  try {
    await markTicketPrinted(Number(req.params.code));
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

/* ---------------- conversão: prêmios, ranking, prova social ---------------- */

/**
 * Cotas premiadas: mostramos os prêmios e quantos ainda estão em jogo, mas
 * NUNCA quais números são. Revelar o número transformaria a brincadeira em
 * escolha a dedo.
 */
publicRouter.get("/campaigns/:slug/premios", async (req, res, next) => {
  try {
    const found = await campaignBySlug(req.params.slug);
    if (!found) return res.status(404).json({ message: "Rifa não encontrada." });

    const rows = await db
      .select()
      .from(prizedQuotas)
      .where(eq(prizedQuotas.campaignId, found.campaign.id));

    const porPremio = new Map<string, { total: number; restantes: number }>();
    for (const row of rows) {
      const atual = porPremio.get(row.prizeLabel) ?? { total: 0, restantes: 0 };
      atual.total += 1;
      if (!row.claimedByOrderId) atual.restantes += 1;
      porPremio.set(row.prizeLabel, atual);
    }

    res.json({
      total: rows.length,
      restantes: rows.filter((r) => !r.claimedByOrderId).length,
      premios: [...porPremio.entries()].map(([label, contagem]) => ({
        label,
        ...contagem,
      })),
    });
  } catch (err) {
    next(err);
  }
});

/** Últimas compras — prova social com o telefone escondido. */
publicRouter.get("/campaigns/:slug/ultimas-compras", async (req, res, next) => {
  try {
    const found = await campaignBySlug(req.params.slug);
    if (!found) return res.status(404).json({ message: "Rifa não encontrada." });

    const rows = await db
      .select({
        name: buyers.name,
        phone: buyers.phone,
        quantity: orders.quantity,
        paidAt: orders.paidAt,
      })
      .from(orders)
      .innerJoin(buyers, eq(buyers.id, orders.buyerId))
      .where(and(eq(orders.campaignId, found.campaign.id), eq(orders.status, "paid")))
      .orderBy(desc(orders.paidAt))
      .limit(8);

    res.json(
      rows.map((r) => ({
        nome: firstNameAndInitial(r.name),
        telefone: hidePhone(r.phone),
        quantidade: r.quantity,
        quando: r.paidAt,
      })),
    );
  } catch (err) {
    next(err);
  }
});

/** "Marina S." — reconhecível para quem é, anônimo para os outros. */
function firstNameAndInitial(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0];
  return `${parts[0]} ${parts[parts.length - 1][0].toUpperCase()}.`;
}

/* ---------------- cadastro de afiliado ---------------- */

/**
 * Qualquer pessoa se cadastra; ninguém divulga antes de ser aprovado pelo
 * administrador. O login de um cadastro pendente já responde explicando.
 */
publicRouter.post("/afiliados/cadastro", async (req, res, next) => {
  try {
    const name = String(req.body?.name ?? "").trim();
    const email = String(req.body?.email ?? "").toLowerCase().trim();
    const phone = normalizePhone(String(req.body?.phone ?? ""));
    const password = String(req.body?.password ?? "");

    if (name.length < 3) return res.status(400).json({ message: "Informe seu nome completo." });
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      return res.status(400).json({ message: "E-mail inválido." });
    }
    if (phone.length < 10) return res.status(400).json({ message: "WhatsApp inválido." });
    if (password.length < 8) {
      return res.status(400).json({ message: "A senha precisa de ao menos 8 caracteres." });
    }

    const [existing] = await db.select().from(users).where(eq(users.email, email));
    if (existing) {
      return res.status(409).json({ message: "Já existe uma conta com este e-mail." });
    }

    const code = await freeAffiliateCode(name);

    await db.transaction(async (tx) => {
      const [user] = await tx
        .insert(users)
        .values({
          role: "affiliate",
          name,
          email,
          phone,
          passwordHash: await hashPassword(password),
        })
        .returning();

      await tx.insert(affiliates).values({ userId: user.id, code, status: "pending" });
    });

    res.status(201).json({
      code,
      message: "Cadastro enviado. Você recebe um aviso quando for aprovado.",
    });
  } catch (err) {
    next(err);
  }
});

/** Código a partir do primeiro nome, com sufixo quando já existir. */
async function freeAffiliateCode(name: string): Promise<string> {
  const base =
    name
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, "")
      .slice(0, 8) || "AFILIADO";

  for (let i = 0; i < 50; i++) {
    const candidate = i === 0 ? base : `${base}${i + 1}`;
    const [taken] = await db.select().from(affiliates).where(eq(affiliates.code, candidate));
    if (!taken) return candidate;
  }
  return `AF${Date.now().toString(36).toUpperCase().slice(-6)}`;
}

/* ---------------- ranking público ---------------- */

publicRouter.get("/campaigns/:slug/ranking", async (req, res, next) => {
  try {
    const found = await campaignBySlug(req.params.slug);
    if (!found) return res.status(404).json({ message: "Rifa não encontrada." });

    const rows = await db.execute(sql`
      SELECT b.name, b.phone, sum(o.quantity)::int AS quotas
      FROM orders o
      JOIN buyers b ON b.id = o.buyer_id
      WHERE o.campaign_id = ${found.campaign.id}::uuid AND o.status = 'paid'
      GROUP BY b.id, b.name, b.phone
      ORDER BY quotas DESC
      LIMIT 10
    `);

    // Ranking é tela pública: nome reduzido e telefone escondido.
    res.json(
      (rows.rows as { name: string; phone: string; quotas: number }[]).map((r) => ({
        nome: firstNameAndInitial(r.name),
        telefone: hidePhone(r.phone),
        quotas: r.quotas,
      })),
    );
  } catch (err) {
    next(err);
  }
});
