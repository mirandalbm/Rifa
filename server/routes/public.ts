import { Router, type Request, type Response } from "express";
import { createHash } from "node:crypto";
import { eq, and, desc, sql } from "drizzle-orm";
import { db } from "../db";
import {
  campaigns,
  organizations,
  campaignMedia,
  campaignStats,
  quotaPackages,
  affiliates,
  clickEvents,
  buyers,
  users,
  orders,
  prizedQuotas,
  organizacaoFotos,
  createOrderSchema,
} from "@shared/schema";
import { normalizePhone, hidePhone } from "@shared/format";
import { listPublicCampaigns, campaignBySlug, certificadoDa } from "../services/campaigns";
import { ufValida, ordenarPorProximidade, cidadeUf, distancia } from "@shared/endereco";
import { consultarCep } from "../services/cep";
import { chavesVapid, inscrever, cancelarInscricao } from "../services/push";
import {
  perfilPublico,
  fotoDoPerfil,
  seguir,
  deixarDeSeguir,
  ligarSino,
  perfisSeguidos,
} from "../services/perfil";
import QRCode from "qrcode";
import { publicUrl } from "../services/urls";
import { createOrder, orderByCode, ordersByPhone, OrderError } from "../services/orders";
import { blockBitmap, isTaken, BLOCK_SIZE, NumbersTakenError, NoQuotasAvailableError } from "../services/quotas";
import { issueOtp, checkOtp, hashPassword } from "../auth";
import { withUrls } from "../services/media";
import { notify, notificationProvider } from "../notifications";
import { buildTicket, escPosTicket, markTicketPrinted } from "../services/ticket";
import { getPaymentMethods } from "../services/settings";
import { identify, guardOtp, guardOtpVerify, lookupBlocked, recordLookupMiss } from "../services/antifraude";
import { paymentSummary } from "@shared/payments";
import { activePaymentProvider } from "../payments";
import { EXIGE_CPF, type ProvedorPix } from "@shared/plataforma";
import { getPlataforma } from "../services/settings";
import {
  abrirChamado,
  anexoPara,
  chamadoDoComprador,
  chamadosDoComprador,
  exigirComprador,
  garantirCodigoCliente,
  mensagemDoComprador,
} from "../services/chamados";
import {
  ContaError,
  criarConta,
  compradorDaSessao,
  dadosDaConta,
  entrarComoComprador,
  entrarNaConta,
  encerrarOutrasSessoes,
  titularidadeDaSessao,
  excluirConta,
  trocarSenha,
  definirPerfilPublico,
} from "../services/contaComprador";

export const publicRouter = Router();

const AFFILIATE_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

function hash(value: string) {
  return createHash("sha256").update(value).digest("hex").slice(0, 32);
}

/* ---------------- vitrine multi-rifas ---------------- */

/**
 * A vitrine inteira, na ordem de sempre (destaque, peso, mais nova) — ou,
 * com `?uf=` (e `?cidade=`), com a cidade e o estado de quem olha primeiro.
 * Ordena, nunca filtra: toda rifa é nacional.
 */
publicRouter.get("/campaigns", async (req, res, next) => {
  try {
    const uf = typeof req.query.uf === "string" && ufValida(req.query.uf.toUpperCase())
      ? req.query.uf.toUpperCase()
      : null;
    const cidade = typeof req.query.cidade === "string" ? req.query.cidade.slice(0, 120) : null;
    const rows = ordenarPorProximidade(
      (await listPublicCampaigns()).map((r) => ({
        ...r,
        uf: r.organizacao?.uf ?? null,
        cidade: r.organizacao?.cidade ?? null,
      })),
      { uf, cidade },
    );
    const banners = await db
      .select()
      .from(campaignMedia)
      .where(and(eq(campaignMedia.role, "banner"), eq(campaignMedia.status, "ready")));
    const bannerBy = new Map(banners.map((b) => [b.campaignId, withUrls(b)]));

    res.json(
      rows.map(({ campaign, stats, organizacao }) => ({
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
        organizacao: organizacao
          ? {
              nome: organizacao.nome,
              slug: organizacao.slug,
              local: cidadeUf(organizacao.cidade, organizacao.uf),
              uf: organizacao.uf,
            }
          : null,
        perto: uf ? distancia({ uf: organizacao?.uf, cidade: organizacao?.cidade }, { uf, cidade }) : null,
      })),
    );
  } catch (err) {
    next(err);
  }
});

/* ---------------- perfil do organizador ---------------- */

async function organizacaoDaRifa(orgId: string) {
  const [o] = await db
    .select({ slug: organizations.slug, nome: organizations.name, foto: organizacaoFotos.updatedAt })
    .from(organizations)
    .leftJoin(organizacaoFotos, eq(organizacaoFotos.organizationId, organizations.id))
    .where(eq(organizations.id, orgId));
  if (!o) return null;
  return {
    slug: o.slug,
    nome: o.nome,
    foto: o.foto ? `/api/public/o/${o.slug}/foto?v=${o.foto.getTime()}` : null,
  };
}

/** Seguir pede um comprador de verdade por trás da sessão. */
function quemSegue(req: Request, res: Response): string | null {
  const id = req.session.buyer?.id;
  if (!id) {
    res.status(401).json({ message: "Entre na sua conta para seguir." });
    return null;
  }
  return id;
}

publicRouter.get("/o/:slug", async (req, res, next) => {
  try {
    res.json(await perfilPublico(req.params.slug, req.session.buyer?.id));
  } catch (err) {
    next(err);
  }
});

publicRouter.get("/o/:slug/foto", async (req, res, next) => {
  try {
    const f = await fotoDoPerfil(req.params.slug);
    if (!f) return res.status(404).json({ message: "Sem foto." });
    // O endereço leva a data da foto (?v=): trocar a foto troca o endereço.
    res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
    res.type(f.mime).send(f.bytes);
  } catch (err) {
    next(err);
  }
});

publicRouter.get("/o/:slug/qr.svg", async (req, res, next) => {
  try {
    const perfil = await perfilPublico(req.params.slug);
    const svg = await QRCode.toString(publicUrl(`/o/${perfil.slug}`), {
      type: "svg",
      margin: 1,
      width: 320,
    });
    res.setHeader("Cache-Control", "public, max-age=86400");
    res.type("image/svg+xml").send(svg);
  } catch (err) {
    next(err);
  }
});

publicRouter.get("/o/:slug/seguir", async (req, res, next) => {
  try {
    const perfil = await perfilPublico(req.params.slug, req.session.buyer?.id);
    res.json({ seguindo: perfil.seguindo, sino: perfil.sino, seguidores: perfil.seguidores });
  } catch (err) {
    next(err);
  }
});

publicRouter.post("/o/:slug/seguir", async (req, res, next) => {
  try {
    const buyerId = quemSegue(req, res);
    if (!buyerId) return;
    res.json(await seguir(req.params.slug, buyerId));
  } catch (err) {
    next(err);
  }
});

publicRouter.delete("/o/:slug/seguir", async (req, res, next) => {
  try {
    const buyerId = quemSegue(req, res);
    if (!buyerId) return;
    res.json(await deixarDeSeguir(req.params.slug, buyerId));
  } catch (err) {
    next(err);
  }
});

publicRouter.put("/o/:slug/sino", async (req, res, next) => {
  try {
    const buyerId = quemSegue(req, res);
    if (!buyerId) return;
    res.json(await ligarSino(req.params.slug, buyerId, req.body?.ligado === true));
  } catch (err) {
    next(err);
  }
});

/** Os perfis que o comprador segue (vitrine). Sem sessão, lista vazia. */
publicRouter.get("/seguindo", async (req, res, next) => {
  try {
    const id = req.session.buyer?.id;
    res.json(id ? await perfisSeguidos(id) : []);
  } catch (err) {
    next(err);
  }
});

/* ---------------- notificações no celular ---------------- */

/** A chave pública VAPID: o navegador precisa dela para se inscrever. */
publicRouter.get("/push/chave", async (_req, res, next) => {
  try {
    res.json({ chave: (await chavesVapid()).publica });
  } catch (err) {
    next(err);
  }
});

publicRouter.post("/push/inscricoes", async (req, res, next) => {
  try {
    const id = req.session.buyer?.id;
    if (!id) return res.status(401).json({ message: "Entre na sua conta para receber avisos." });
    res.status(201).json(await inscrever(id, req.body));
  } catch (err) {
    next(err);
  }
});

publicRouter.delete("/push/inscricoes", async (req, res, next) => {
  try {
    const id = req.session.buyer?.id;
    if (!id) return res.status(401).json({ message: "Entre na sua conta." });
    res.json(await cancelarInscricao(id, req.body?.endpoint));
  } catch (err) {
    next(err);
  }
});

/* ---------------- CEP ---------------- */

/**
 * CEP → rua, bairro, cidade e UF. Serve ao cadastro do organizador e ao
 * "perto de você" da vitrine. É conveniência: fora do ar, a pessoa digita.
 */
publicRouter.get("/cep/:cep", async (req, res, next) => {
  try {
    const r = await consultarCep(req.params.cep);
    if (r === "invalido") return res.status(400).json({ message: "CEP inválido: são 8 números." });
    if (r === "nao_encontrado") return res.status(404).json({ message: "CEP não encontrado." });
    if (r === "indisponivel") {
      return res
        .status(503)
        .json({ message: "Consulta de CEP fora do ar. Preencha o endereço à mão." });
    }
    res.setHeader("Cache-Control", "public, max-age=86400");
    res.json(r);
  } catch (err) {
    next(err);
  }
});

/* ---------------- tela inicial da rifa ---------------- */

/**
 * O certificado da SPA/MF é o documento que o apostador tem direito de
 * conferir — público, mas só depois que a rifa vai ao ar.
 */
publicRouter.get("/campaigns/:slug/certificado", async (req, res, next) => {
  try {
    const found = await campaignBySlug(req.params.slug);
    if (!found || found.campaign.status === "draft") {
      return res.status(404).json({ message: "Rifa não encontrada." });
    }
    const c = await certificadoDa(found.campaign.id);
    if (!c) return res.status(404).json({ message: "Certificado não disponível." });
    res.setHeader("Cache-Control", "public, max-age=3600");
    res.setHeader("Content-Disposition", `inline; filename="${c.nome}"`);
    res.type(c.mime).send(c.bytes);
  } catch (err) {
    next(err);
  }
});

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
        temCertificado: Boolean(found.campaign.authorizationFileKey),
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
      // A rifa abre dentro do perfil: a tela mostra de quem ela é, com seguir.
      organizacao: await organizacaoDaRifa(found.campaign.organizationId),
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

/**
 * O que a tela de compra precisa saber antes de montar o formulário. Hoje, só
 * se o CPF é obrigatório — depende do provedor do Pix em uso.
 */
publicRouter.get("/checkout", async (_req, res, next) => {
  try {
    const provider = await activePaymentProvider();
    const plataforma = await getPlataforma();
    res.json({
      exigeCpf: EXIGE_CPF[provider.name as ProvedorPix] ?? false,
      // A regra de reembolso aparece antes da compra (CDC): quem compra
      // precisa saber a taxa antes de pagar.
      reembolso: { aceita: plataforma.estornoManual, taxaPct: plataforma.taxaReembolsoPct },
    });
  } catch (err) {
    next(err);
  }
});

publicRouter.post("/orders", async (req, res, next) => {
  try {
    const input = createOrderSchema.parse(req.body);
    const result = await createOrder(input, {
      sessionAffiliateCode: req.session.affiliateCode,
      identity: identify(req),
      // Dentro da conta, a compra é da conta (ver `CreateOrderContext.contaId`).
      contaId: req.session.buyer?.id || undefined,
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

/** Barra quem está varrendo códigos de pedido; ver `lookupBlocked`. */
async function lookupGuard(req: Request, res: Response): Promise<boolean> {
  if (await lookupBlocked(identify(req))) {
    res.status(429).json({ message: "Muitas consultas a pedidos que não existem. Espere alguns minutos." });
    return false;
  }
  return true;
}

/** A tela de pagamento pergunta por aqui até o webhook chegar. */
publicRouter.get("/orders/:code", async (req, res, next) => {
  try {
    if (!(await lookupGuard(req, res))) return;
    const found = await orderByCode(Number(req.params.code));
    if (!found) {
      await recordLookupMiss(identify(req));
      return res.status(404).json({ message: "Pedido não encontrado." });
    }

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

    const veredito = await guardOtpVerify(phone, identify(req));
    if (!veredito.allowed) {
      return res.status(429).json({ message: veredito.reason });
    }

    if (!(await checkOtp(req, code))) {
      return res.status(401).json({ message: "Código incorreto ou expirado." });
    }

    const [buyer] = await db.select().from(buyers).where(eq(buyers.phone, phone));

    // O código provou o telefone: a conta (se houver) passa a enxergar também
    // as compras feitas sem entrar. Sessão nova ao entrar — ver
    // `entrarComoComprador`.
    await entrarComoComprador(
      req,
      buyer ? { id: buyer.id, phone: buyer.phone, name: buyer.name } : { id: "", phone, name: "" },
      true,
    );
    // Primeira prova do telefone numa conta que ninguém tinha provado: quem
    // entrou antes pela senha pode não ser o dono — sai.
    if (buyer && !buyer.telefoneConfirmadoEm) {
      await db.update(buyers).set({ telefoneConfirmadoEm: new Date() }).where(eq(buyers.id, buyer.id));
      if (buyer.passwordHash) await encerrarOutrasSessoes(buyer.id, req.sessionID);
    }

    res.json({
      orders: await ordersByPhone(phone),
      phone,
      cliente: buyer ? await garantirCodigoCliente(buyer.id) : null,
      reembolso: (await getPlataforma()).estornoManual,
    });
  } catch (err) {
    next(err);
  }
});

publicRouter.get("/my-quotas", async (req, res, next) => {
  try {
    const phone = req.session.buyer?.phone;
    if (!phone) return res.status(401).json({ message: "Confirme seu telefone." });
    const buyerId = req.session.buyer?.id;
    const t = await titularidadeDaSessao(req);
    const visiveis = await ordersByPhone(phone, t);
    // Sobrou compra antiga que a conta ainda não provou ser dela? Só aí a
    // tela oferece o código do WhatsApp — o caso raro de compra sem CPF.
    const [todas] = buyerId
      ? await db
          .select({ n: sql<number>`count(*)::int` })
          .from(orders)
          .where(eq(orders.buyerId, buyerId))
      : [{ n: visiveis.length }];
    res.json({
      orders: visiveis,
      comprasAntigasOcultas: (todas?.n ?? 0) > visiveis.length,
      phone,
      cliente: buyerId ? await garantirCodigoCliente(buyerId) : null,
      reembolso: (await getPlataforma()).estornoManual,
      taxaReembolsoPct: (await getPlataforma()).taxaReembolsoPct,
    });
  } catch (err) {
    next(err);
  }
});

/* ---------------- conta do apostador ---------------- */

// Erro de conta vira status + mensagem; o resto segue para o tratador geral.
function erroDeConta(err: unknown, res: import("express").Response, next: import("express").NextFunction) {
  if (err instanceof ContaError) return res.status(err.status).json({ message: err.message });
  next(err);
}

publicRouter.post("/conta", async (req, res, next) => {
  try {
    const conta = await criarConta(req, {
      nome: String(req.body?.nome ?? ""),
      telefone: String(req.body?.telefone ?? ""),
      cpf: String(req.body?.cpf ?? ""),
      email: req.body?.email ? String(req.body.email) : undefined,
      senha: String(req.body?.senha ?? ""),
      lembrar: req.body?.lembrar === true,
    });
    res.status(201).json(await dadosDaConta(conta.id));
  } catch (err) {
    erroDeConta(err, res, next);
  }
});

publicRouter.post("/conta/entrar", async (req, res, next) => {
  try {
    const conta = await entrarNaConta(
      req,
      String(req.body?.identificador ?? ""),
      String(req.body?.senha ?? ""),
      req.body?.lembrar === true,
    );
    res.json(await dadosDaConta(conta.id));
  } catch (err) {
    erroDeConta(err, res, next);
  }
});

publicRouter.post("/conta/sair", (req, res) => {
  req.session.buyer = undefined;
  res.json({ ok: true });
});

publicRouter.get("/conta", async (req, res, next) => {
  try {
    const sessao = compradorDaSessao(req);
    res.json({ ...(await dadosDaConta(sessao.id)), sessaoConfirmada: sessao.confirmado === true });
  } catch (err) {
    erroDeConta(err, res, next);
  }
});

publicRouter.put("/conta/senha", async (req, res, next) => {
  try {
    await trocarSenha(req, String(req.body?.atual ?? ""), String(req.body?.nova ?? ""));
    res.json({ ok: true });
  } catch (err) {
    erroDeConta(err, res, next);
  }
});

publicRouter.put("/conta/perfil-publico", async (req, res, next) => {
  try {
    res.json(await definirPerfilPublico(req, req.body?.publico === true));
  } catch (err) {
    erroDeConta(err, res, next);
  }
});

/** Exclusão pela LGPD: dados pessoais saem, compras e recibos ficam. */
publicRouter.post("/conta/excluir", async (req, res, next) => {
  try {
    await excluirConta(req, String(req.body?.senha ?? ""));
    res.json({ ok: true });
  } catch (err) {
    erroDeConta(err, res, next);
  }
});

/* ---------------- reembolso: chamados do comprador ---------------- */

// Tudo aqui exige o comprador logado (código pelo WhatsApp): o reembolso não
// é pedido por quem só sabe o número do pedido.

publicRouter.get("/chamados", async (req, res, next) => {
  try {
    const c = exigirComprador(req);
    res.json({ cliente: await garantirCodigoCliente(c.id), chamados: await chamadosDoComprador(c.id) });
  } catch (err) {
    next(err);
  }
});

publicRouter.post("/chamados", async (req, res, next) => {
  try {
    const c = exigirComprador(req);
    const chamado = await abrirChamado(c, {
      orderCode: Number(req.body?.orderCode),
      motivo: String(req.body?.motivo ?? ""),
      cpf: String(req.body?.cpf ?? ""),
      pixChave: req.body?.pixChave ? String(req.body.pixChave) : undefined,
      anexo: String(req.body?.anexo ?? ""),
    });
    res.status(201).json({ id: chamado.id, protocolo: chamado.protocolo });
  } catch (err) {
    next(err);
  }
});

publicRouter.get("/chamados/anexos/:id", async (req, res, next) => {
  try {
    const c = exigirComprador(req);
    const a = await anexoPara(req.params.id, { buyerId: c.id });
    res.setHeader("Cache-Control", "private, no-store");
    res.type(a.mime).send(a.bytes);
  } catch (err) {
    next(err);
  }
});

publicRouter.get("/chamados/:id", async (req, res, next) => {
  try {
    const c = exigirComprador(req);
    res.json(await chamadoDoComprador(c.id, req.params.id));
  } catch (err) {
    next(err);
  }
});

publicRouter.post("/chamados/:id/mensagens", async (req, res, next) => {
  try {
    const c = exigirComprador(req);
    await mensagemDoComprador(c, req.params.id, {
      texto: String(req.body?.texto ?? ""),
      anexo: req.body?.anexo ? String(req.body.anexo) : undefined,
    });
    res.status(201).json({ ok: true });
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
    if (!(await lookupGuard(req, res))) return;
    const ticket = await buildTicket(Number(req.params.code));
    if (!ticket) {
      await recordLookupMiss(identify(req));
      return res.status(404).json({ message: "Bilhete não encontrado." });
    }
    res.json(ticket);
  } catch (err) {
    next(err);
  }
});

/** Texto pronto para a impressora térmica da maquininha. */
publicRouter.get("/tickets/:code/escpos", async (req, res, next) => {
  try {
    if (!(await lookupGuard(req, res))) return;
    const ticket = await buildTicket(Number(req.params.code));
    if (!ticket) {
      await recordLookupMiss(identify(req));
      return res.status(404).json({ message: "Bilhete não encontrado." });
    }
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

    // Afiliado divulga a rifa de alguém, então nasce com dono. Com um
    // promotor só no ar — o caso comum — não há o que perguntar; com vários,
    // a escolha é obrigatória, senão o cadastro cairia na organização errada.
    const ativas = await db
      .select({ id: organizations.id, slug: organizations.slug })
      .from(organizations)
      .where(eq(organizations.active, true));

    const pedida = String(req.body?.organizacao ?? "").trim();
    const organizacao = pedida
      ? ativas.find((o) => o.slug === pedida)
      : ativas.length === 1
        ? ativas[0]
        : undefined;

    if (!organizacao) {
      return res.status(400).json({
        message: pedida
          ? "Organização não encontrada."
          : "Escolha para qual organização você quer divulgar.",
        organizacoes: ativas.map((o) => o.slug),
      });
    }

    const code = await freeAffiliateCode(name);

    await db.transaction(async (tx) => {
      const [user] = await tx
        .insert(users)
        .values({
          role: "affiliate",
          organizationId: organizacao.id,
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
