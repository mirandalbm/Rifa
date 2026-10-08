import { Router, type Request } from "express";
import { SORTEIO_SEM_DATA } from "@shared/campanhaLegal";
import { eq, and, sql, desc, inArray } from "drizzle-orm";
import { db } from "../db";
import {
  affiliates,
  commissions,
  payouts,
  orders,
  campaignStats,
  campaigns,
  buyers,
  clickEvents,
  coupons,
  organizations,
  afiliadoVinculos,
  recibos,
  users,
  auditLog,
} from "@shared/schema";
import { getPlataforma } from "../services/settings";
import { templatePublicado } from "../services/template";
import { FiscalError, conferirSaque, documento, estadoFiscal, gravarNotaDoSaque, lerNotaFiscal, notaDoSaque, salvarDadosFiscais, salvarDocumento } from "../services/fiscal";
import { pdfDoRecibo, reciboPorCodigo } from "../services/recibos";
import { baseDoSite, urlDeConferencia } from "../services/urls";
import { aderir, comissaoNaRifa, organizacoesDoAfiliado, sair } from "../services/afiliados";
import { decididasParaOAfiliado, editarComoAfiliado, fotoDaPecaDoAfiliado, videoDaPecaDoAfiliado, marcarVistoDoAfiliado, minhasDoAfiliado, publicarComoAfiliado, retirarPropria, rifasParaDivulgar } from "../services/divulgacao";
import { enviarComFaixa, enviarFaixaDoBanco } from "../services/faixa";
import { guardLogin, hit, identify } from "../services/antifraude";
import QRCode from "qrcode";
import { artesDaRifa, rifaDaArte } from "../services/artes";
import { EditorError, conferirCamadas, dadosDoEditor } from "../services/editorImagem";
import { CONFERENCIAS_POR_JANELA } from "@shared/editorImagem";
import { enviarArte, enviarPacote, listaDeArtes } from "./artesRotas";
import { affiliateId, verifyPassword } from "../auth";
import { textosDoKit } from "@shared/afiliados";
import { irrfDoSaque } from "@shared/fiscal";
import { montarRotasDaVerificacao } from "./verificacaoRotas";
import { copiarDocumentosDoFiscal, estadoDaVerificacao, fotoDoAfiliado, salvarFotoDoAfiliado } from "../services/verificacao";

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
        foto: aff.fotoEm ? `/api/affiliate/foto?v=${aff.fotoEm.getTime()}` : null,
        verificado: Boolean(aff.verificadoEm),
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
        // Extrato por origem: a organização que paga cada comissão.
        organizacao: organizations.name,
      })
      .from(commissions)
      .innerJoin(orders, eq(orders.id, commissions.orderId))
      .innerJoin(buyers, eq(buyers.id, orders.buyerId))
      .innerJoin(campaigns, eq(campaigns.id, commissions.campaignId))
      .innerJoin(organizations, eq(organizations.id, campaigns.organizationId))
      .where(eq(commissions.affiliateId, id))
      .orderBy(desc(commissions.createdAt))
      .limit(200);

    // Comissão que espera um sorteio ainda sem data ("quando completar"): sem
    // data na tela, em vez da data provisória.
    res.json(rows.map((r) => (r.availableAt && r.availableAt >= SORTEIO_SEM_DATA ? { ...r, availableAt: null } : r)));
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
        metodoApuracao: campaigns.metodoApuracao,
        commissionPctDefault: campaigns.commissionPctDefault,
        organizationId: campaigns.organizationId,
        termoId: campaigns.termoId,
        organizacao: organizations.name,
        totalQuotas: campaigns.totalQuotas,
        autorizacao: campaigns.authorizationCode,
        vendidas: campaignStats.soldCount,
      })
      .from(campaigns)
      .innerJoin(organizations, eq(organizations.id, campaigns.organizationId))
      .leftJoin(campaignStats, eq(campaignStats.campaignId, campaigns.id))
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
          texts: textosDoKit(
            {
              premio: c.prizeTitle,
              precoCents: c.priceCents,
              drawAt: c.drawAt,
              metodoApuracao: c.metodoApuracao,
              autorizacao: c.autorizacao,
              totalQuotas: c.totalQuotas,
              vendidas: c.vendidas ?? 0,
              cupom: coupon ? { code: coupon.code, discountPct: coupon.discountPct } : null,
            },
            url,
          ),
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

/**
 * Artes prontas do kit (Fase A): só da rifa em que o afiliado recebe
 * comissão (`comissaoNaRifa`, a régua do link). O QR leva o código dele, tirado
 * da sessão — nunca de um parâmetro. Fora disso, 404, como rifa inexistente.
 */
async function rifaDoKit(req: Request, slug: string) {
  const id = affiliateId(req);
  const [c] = await db
    .select({
      id: campaigns.id,
      organizationId: campaigns.organizationId,
      termoId: campaigns.termoId,
      commissionPctDefault: campaigns.commissionPctDefault,
    })
    .from(campaigns)
    .where(eq(campaigns.slug, slug));
  if (!c || !(await comissaoNaRifa(db, id, c)).recebe) return null;
  const [aff] = await db.select({ code: affiliates.code }).from(affiliates).where(eq(affiliates.id, id));
  const r = await rifaDaArte(c.id);
  return r && aff ? { r, url: `${baseDoSite(req)}/r/${r.slug}?ref=${encodeURIComponent(aff.code)}`, id } : null;
}

affiliateRouter.get("/artes/:slug", async (req, res, next) => {
  try {
    const kit = await rifaDoKit(req, req.params.slug);
    if (!kit) return res.status(404).json({ message: "Rifa não encontrada." });
    res.setHeader("Cache-Control", "no-store");
    res.json(listaDeArtes(kit.r, kit.url, kit.url, true));
  } catch (err) {
    next(err);
  }
});

affiliateRouter.get("/artes/:slug/:tipo/pacote", async (req, res, next) => {
  try {
    const kit = await rifaDoKit(req, req.params.slug);
    if (!kit) return res.status(404).json({ message: "Rifa não encontrada." });
    await enviarPacote(res, kit.r, req.params.tipo, kit.url, kit.url, `afiliado:${kit.id}`, true);
  } catch (err) {
    next(err);
  }
});

affiliateRouter.get("/artes/:slug/:tipo", async (req, res, next) => {
  try {
    const kit = await rifaDoKit(req, req.params.slug);
    if (!kit) return res.status(404).json({ message: "Rifa não encontrada." });
    await enviarArte(res, kit.r, req.params.tipo, req.query.formato, kit.url, `afiliado:${kit.id}`);
  } catch (err) {
    next(err);
  }
});

// Editor de imagem (Fase C) no kit: só na rifa em que ele recebe e que tem
// arte (no ar, nem demonstração nem travada); o QR leva o link dele, tirado
// da sessão. O texto passa pela régua antes de virar imagem, e o Pix por
// fora vira denúncia como texto de terceiro.
affiliateRouter.get("/editor/:slug", async (req, res, next) => {
  try {
    const kit = await rifaDoKit(req, req.params.slug);
    if (!kit || !artesDaRifa(kit.r).length) return res.status(404).json({ message: "Rifa não encontrada." });
    const dados = await dadosDoEditor(kit.r.id, kit.url, kit.r);
    if (!dados) return res.status(404).json({ message: "Rifa não encontrada." });
    res.setHeader("Cache-Control", "no-store");
    res.json(dados);
  } catch (err) {
    next(err);
  }
});

affiliateRouter.post("/editor/:slug/conferir", async (req, res, next) => {
  try {
    const kit = await rifaDoKit(req, req.params.slug);
    if (!kit || !artesDaRifa(kit.r).length) return res.status(404).json({ message: "Rifa não encontrada." });
    if ((await hit(`editor:afiliado:${kit.id}`, CONFERENCIAS_POR_JANELA.minutos, CONFERENCIAS_POR_JANELA.limite)).excedeu) {
      return res.status(429).json({ message: "Muitas conferências em pouco tempo. Espere alguns minutos." });
    }
    const [aff] = await db.select({ code: affiliates.code }).from(affiliates).where(eq(affiliates.id, kit.id));
    const camadas = conferirCamadas(
      req.body?.camadas,
      { id: kit.r.id, organizationId: kit.r.organizationId, temSelo: Boolean(kit.r.dados.autorizacao) },
      `afiliado ${aff?.code ?? kit.id}`,
    );
    res.json({ camadas });
  } catch (err) {
    if (err instanceof EditorError) return res.status(err.status).json({ message: err.message });
    next(err);
  }
});

/** O link precisa levar ao domínio pelo qual a pessoa está acessando. */
const publicBaseUrl = baseDoSite;

/** "joao@exemplo.com" → "joa•••com": reconhecível na auditoria sem guardar a chave inteira. */
function mascararChave(chave: string | null | undefined): string | null {
  if (!chave) return null;
  return chave.length <= 6 ? "•••" : `${chave.slice(0, 3)}•••${chave.slice(-3)}`;
}

/**
 * Trocar a chave Pix é trocar para onde vai o dinheiro dos saques. Quem tomou
 * a sessão do afiliado não pode fazer isso sozinho: pede a senha — que conta
 * na mesma janela de força bruta do login — e a troca fica na auditoria.
 */
affiliateRouter.patch("/pix-key", async (req, res, next) => {
  try {
    const id = affiliateId(req);
    const pixKey = String(req.body?.pixKey ?? "").trim();
    if (pixKey.length < 5 || pixKey.length > 140) return res.status(400).json({ message: "Chave Pix inválida." });

    const veredito = await guardLogin(req.user!.email, identify(req));
    if (!veredito.allowed) return res.status(429).json({ message: veredito.reason });
    const [conta] = await db.select({ hash: users.passwordHash }).from(users).where(eq(users.id, req.user!.id));
    if (!conta || !(await verifyPassword(String(req.body?.senha ?? ""), conta.hash))) {
      return res.status(401).json({ message: "A senha não confere." });
    }

    const [antes] = await db.select({ pixKey: affiliates.pixKey }).from(affiliates).where(eq(affiliates.id, id));
    await db.update(affiliates).set({ pixKey }).where(eq(affiliates.id, id));
    await db.insert(auditLog).values({
      actorId: req.user!.id,
      actorRole: req.user!.role,
      action: "afiliado.pix.trocada",
      entity: "affiliate",
      entityId: id,
      diff: { de: mascararChave(antes?.pixKey), para: mascararChave(pixKey) },
      ip: req.ip,
    });
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
        // Comissão guardada pela plataforma é um saldo só, pago por ela
        // (`organizacaoId` "plataforma"); o resto, por organização.
        organizacaoId: sql<string>`case when ${commissions.guardada} then 'plataforma' else ${organizations.id}::text end`,
        organizacao: sql<string>`case when ${commissions.guardada} then 'Plataforma' else ${organizations.name} end`,
        cnpjDaOrganizacao: sql<string | null>`case when ${commissions.guardada} then null else ${organizations.cnpj} end`,
        disponivelCents: sql<number>`coalesce(sum(${commissions.amountCents}) filter (where ${commissions.status} = 'available'), 0)::int`,
        pendenteCents: sql<number>`coalesce(sum(${commissions.amountCents}) filter (where ${commissions.status} = 'pending'), 0)::int`,
      })
      .from(commissions)
      .innerJoin(campaigns, eq(campaigns.id, commissions.campaignId))
      .innerJoin(organizations, eq(organizations.id, campaigns.organizationId))
      .where(eq(commissions.affiliateId, id))
      .groupBy(sql`1`, sql`2`, sql`3`);
    // Contra quem a nota fiscal do saque é emitida (resposta 11.2 do
    // advogado): quem paga. A comissão guardada é paga pela plataforma, e a
    // nota sai contra o CNPJ dela (os Dados da empresa publicados).
    const empresa = linhas.some((l) => l.organizacaoId === "plataforma") ? (await templatePublicado()).template.legal : null;
    // A retenção de IRRF (Lucro Presumido ou Real) vai na tela antes do saque:
    // a nota é do bruto, e o afiliado sabe quanto cai na conta.
    const { regime } = await estadoFiscal(id, false);
    res.json(
      linhas.map(({ cnpjDaOrganizacao, ...l }) => ({
        ...l,
        irrfCents: irrfDoSaque(l.disponivelCents, regime),
        notaContra:
          l.organizacaoId === "plataforma"
            ? { nome: empresa?.razaoSocial || "Plataforma", cnpj: empresa?.cnpj || null }
            : { nome: l.organizacao, cnpj: cnpjDaOrganizacao || null },
      })),
    );
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
    // Só saca MEI ou empresa (resposta 6.4 do advogado): cadastro fiscal
    // aprovado com CNPJ e regime, e a nota fiscal do valor bruto anexada a
    // cada saque — pagar pessoa física exigiria RPA, que o sistema não faz.
    // O regime decide a retenção (1,5% de IRRF no Lucro Presumido ou Real),
    // lido do mesmo cadastro aprovado que libera o saque — nunca do corpo.
    const { problema, regime } = await conferirSaque(id);
    if (problema) return res.status(409).json({ message: problema });
    let nota: { mime: string; bytes: Buffer };
    try {
      nota = lerNotaFiscal(req.body?.notaFiscal);
    } catch (e) {
      if (e instanceof FiscalError) return res.status(e.status).json({ message: e.message });
      throw e;
    }

    const payout = await db.transaction(async (tx) => {
      const disponivelPorOrg = await tx
        .select({
          // Quem paga: a plataforma, se a comissão é guardada por ela; senão,
          // a organização da rifa.
          org: sql<string>`case when ${commissions.guardada} then 'plataforma' else ${campaigns.organizationId}::text end`,
          id: commissions.id,
          amountCents: commissions.amountCents,
        })
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
        // Saque da plataforma não tem organização: só o administrador geral o vê e paga.
        .values({
          affiliateId: id,
          organizationId: pedida === "plataforma" ? null : pedida,
          amountCents: totalCents,
          irrfCents: irrfDoSaque(totalCents, regime),
          pixKey: aff.pixKey!,
        })
        .returning();
      await gravarNotaDoSaque(tx, created.id, nota);

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

/** A nota fiscal do próprio saque (só a dele: o de outro é 404). */
affiliateRouter.get("/payouts/:id/nota", async (req, res, next) => {
  try {
    const pid = String(req.params.id);
    if (!/^[0-9a-f-]{36}$/i.test(pid)) return res.status(404).json({ message: "Saque não encontrado." });
    const [p] = await db
      .select({ id: payouts.id })
      .from(payouts)
      .where(and(eq(payouts.id, pid), eq(payouts.affiliateId, affiliateId(req))));
    if (!p) return res.status(404).json({ message: "Saque não encontrado." });
    const n = await notaDoSaque(p.id);
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.type(n.mime).send(n.bytes);
  } catch (err) {
    if (err instanceof FiscalError) return res.status(err.status).json({ message: err.message });
    next(err);
  }
});

affiliateRouter.get("/payouts", async (req, res, next) => {
  try {
    const id = affiliateId(req);
    const linhas = await db
      .select({ payout: payouts, recibo: recibos.codigo, organizacao: organizations.name })
      .from(payouts)
      .leftJoin(recibos, eq(recibos.payoutId, payouts.id))
      .leftJoin(organizations, eq(organizations.id, payouts.organizationId))
      .where(eq(payouts.affiliateId, id))
      .orderBy(desc(payouts.requestedAt));
    res.json(linhas.map((l) => ({ ...l.payout, recibo: l.recibo, organizacao: l.organizacao })));
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

/* ---------------- cadastro fiscal e recibos ---------------- */

/** O próprio cadastro fiscal (os dados que ele mesmo mandou). */
affiliateRouter.get("/fiscal", async (req, res, next) => {
  try {
    res.setHeader("Cache-Control", "no-store");
    res.json({ ...(await estadoFiscal(affiliateId(req), true)), exigido: true });
  } catch (err) {
    next(err);
  }
});

affiliateRouter.put("/fiscal", async (req, res, next) => {
  try {
    await salvarDadosFiscais(affiliateId(req), req.body);
    res.json(await estadoFiscal(affiliateId(req), true));
  } catch (err) {
    next(err);
  }
});

affiliateRouter.put("/fiscal/documentos/:tipo", async (req, res, next) => {
  try {
    await salvarDocumento(affiliateId(req), req.params.tipo, req.body?.arquivo);
    res.json(await estadoFiscal(affiliateId(req), false));
  } catch (err) {
    next(err);
  }
});

affiliateRouter.get("/fiscal/documentos/:tipo", async (req, res, next) => {
  try {
    const d = await documento(affiliateId(req), req.params.tipo);
    res.setHeader("Cache-Control", "no-store");
    res.type(d.mime).send(d.bytes);
  } catch (err) {
    next(err);
  }
});

/* ---------------- verificação do perfil (selo de trevo) ---------------- */

montarRotasDaVerificacao(affiliateRouter, "/verificacao", "afiliado", (req) => affiliateId(req));

/** Os documentos do cadastro fiscal servem aqui também — sem fotografar o RG de novo. */
affiliateRouter.post("/verificacao/copiar-do-fiscal", async (req, res, next) => {
  try {
    await copiarDocumentosDoFiscal(affiliateId(req));
    res.json(await estadoDaVerificacao("afiliado", affiliateId(req), true));
  } catch (err) {
    next(err);
  }
});

/** A foto do perfil do afiliado (a que se compara com o documento). */
affiliateRouter.put("/foto", async (req, res, next) => {
  try {
    res.json(await salvarFotoDoAfiliado(affiliateId(req), req.body?.foto ?? null));
  } catch (err) {
    next(err);
  }
});

affiliateRouter.get("/foto", async (req, res, next) => {
  try {
    const f = await fotoDoAfiliado(affiliateId(req));
    if (!f) return res.status(404).json({ message: "Sem foto." });
    res.setHeader("Cache-Control", "private, max-age=31536000, immutable");
    res.type(f.mime).send(f.bytes);
  } catch (err) {
    next(err);
  }
});

/** PDF do recibo de um saque dele. O de outro afiliado é 404. */
affiliateRouter.get("/recibos/:codigo/pdf", async (req, res, next) => {
  try {
    const r = await reciboPorCodigo(req.params.codigo);
    if (!r || r.affiliateId !== affiliateId(req)) return res.status(404).json({ message: "Recibo não encontrado." });
    const pdf = await pdfDoRecibo(r, urlDeConferencia(r.codigo));
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Content-Disposition", `attachment; filename="recibo-${r.codigo}.pdf"`);
    res.type("application/pdf").send(pdf);
  } catch (err) {
    next(err);
  }
});

/* ---------------- divulgação com o material da organização ---------------- */

/** As rifas que ele pode divulgar agora (vínculo aprovado e termo aceito) e as mídias de cada uma. */
affiliateRouter.get("/divulgacoes/rifas", async (req, res, next) => {
  try {
    res.json(await rifasParaDivulgar(affiliateId(req)));
  } catch (err) {
    next(err);
  }
});

affiliateRouter.get("/divulgacoes", async (req, res, next) => {
  try {
    res.json(await minhasDoAfiliado(affiliateId(req)));
  } catch (err) {
    next(err);
  }
});

/**
 * Nasce publicada ou esperando a organização, conforme o modo que ela
 * escolheu — com foto própria, sempre esperando a organização.
 */
affiliateRouter.post("/divulgacoes", async (req, res, next) => {
  try {
    res.status(201).json(await publicarComoAfiliado(affiliateId(req), req.body ?? {}));
  } catch (err) {
    next(err);
  }
});

/**
 * O sino do painel do afiliado: quantas peças dele a organização decidiu
 * desde a última vez que ele abriu o sino. Só o número — o motivo fica na
 * tela de Divulgar.
 */
affiliateRouter.get("/divulgacoes/novidades", async (req, res, next) => {
  try {
    res.setHeader("Cache-Control", "private, no-store");
    res.json({ decididas: await decididasParaOAfiliado(affiliateId(req), req.user!.id) });
  } catch (err) {
    next(err);
  }
});

/** Abriu o sino: o que já foi decidido fica visto (para esta pessoa). */
affiliateRouter.post("/avisos/vistos", async (req, res, next) => {
  try {
    await marcarVistoDoAfiliado(req.user!.id);
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

/**
 * Corrigir a própria peça (legenda, mídias da rifa e fotos próprias). Volta
 * para a fila da organização, salvo no modo direto sem foto própria. A de
 * outro afiliado é 404.
 */
affiliateRouter.patch("/divulgacoes/:id", async (req, res, next) => {
  try {
    res.json(await editarComoAfiliado(affiliateId(req), req.params.id, req.body ?? {}));
  } catch (err) {
    next(err);
  }
});

/** A foto própria da peça, para o afiliado que publicou. A de outro é 404; nunca em cache. */
affiliateRouter.get("/divulgacoes/:id/fotos/:fotoId", async (req, res, next) => {
  try {
    const bytes = await fotoDaPecaDoAfiliado(affiliateId(req), req.params.id, req.params.fotoId);
    res.setHeader("Cache-Control", "private, no-store");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.type("image/jpeg").send(bytes);
  } catch (err) {
    next(err);
  }
});

/** O vídeo próprio da peça (ou o pôster, `?poster=1`), para o afiliado que publicou. O de outro é 404; nunca em cache; com `Range`. */
affiliateRouter.get("/divulgacoes/:id/video", async (req, res, next) => {
  try {
    const v = await videoDaPecaDoAfiliado(affiliateId(req), req.params.id, req.query.poster === "1");
    res.setHeader("Cache-Control", "private, no-store");
    res.setHeader("X-Content-Type-Options", "nosniff");
    await enviarFaixaDoBanco(req, res, v);
  } catch (err) {
    next(err);
  }
});

/** Retirar a própria peça. A de outro afiliado é 404. */
affiliateRouter.delete("/divulgacoes/:id", async (req, res, next) => {
  try {
    res.json(await retirarPropria({ affiliateId: affiliateId(req) }, req.params.id));
  } catch (err) {
    next(err);
  }
});
