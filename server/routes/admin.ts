import { numeracaoZero, validarMetodosLiberados } from "@shared/apuracao";
import { problemaNoPremio } from "@shared/premio";
import { calendario, cancelarSorteioOficial, criarSorteioOficial, editarSorteioOficial, integrarAoSorteioOficial, lancarResultado, salvarArquivoDaAta } from "../services/sorteiosOficiais";
import {
  BannerDivulgacaoError,
  bannerDoPainel,
  imagemDoPainel,
  removerBannerDeDivulgacao,
  salvarBannerDeDivulgacao,
} from "../services/bannerDivulgacao";
import { agendarPublicacao } from "../services/publicacaoAgendada";
import { enviarComFaixa, enviarFaixaDoBanco } from "../services/faixa";
import { devolverPixTardio, listarPixTardios, resolverPixTardio } from "../services/pixTardio";
import { abaterRetencao, liberarRetencao, listarRetencoes, reterManual } from "../services/retencao";
import { numerosPremiados } from "@shared/premiadas";
import express, { Router, type Request, type Response as Resposta } from "express";
import {
  aprovarTelefone,
  confirmarTelefone,
  decidirDenuncia,
  denunciasAbertas,
  destravarRifa,
  detalheDaDenuncia,
  estadoDoTelefone,
  listarDenuncias,
  pedirCodigoDoTelefone,
  varrerTextoDoOrganizador,
} from "../services/seguranca";
import { once } from "node:events";
import { randomInt } from "node:crypto";
import QRCode from "qrcode";
import { eq, and, sql, desc } from "drizzle-orm";
import { db } from "../db";
import {
  campaigns,
  campaignStats,
  campaignMedia,
  quotaPackages,
  quotaAlloc,
  prizedQuotas,
  orders,
  buyers,
  affiliates,
  afiliadoVinculos,
  recibos,
  users,
  commissions,
  coupons,
  payouts,
  settlements,
  draws,
  auditLog,
  organizations,
  organizacaoCapas,
  organizacaoFotos,
  insertCampaignSchema,
} from "@shared/schema";
import {
  publishCampaign,
  publishBlockers,
  tirarDoAr,
  marcarDemonstracao,
  excluirRifa,
  assertEditable,
  assertQuotaRange,
  CampaignRuleError,
  salvarDadosLegais,
  certificadoDa,
} from "../services/campaigns";
import { clienteVisivelSql, nomeNoPainelSql, dadoNoPainelSql } from "../services/titularidade";
import { executarSorteio, registrarNovaExtracao, resultadoParaARifa, SorteioRecusado, sortearRifasDoSorteioOficial } from "../services/sortear";
import {
  requestUpload,
  ingestUpload,
  removeMedia,
  listMedia,
  MediaRuleError,
} from "../services/media";
import { storage, LocalDiskStorage } from "../services/storage";
import { encerrarSessoesDoUsuario, hashPassword, verifyPassword } from "../auth";
import { notify } from "../notifications";
import { publicUrl } from "../services/urls";
import { normalizePhone } from "@shared/format";
import {
  getLimits,
  setLimits,
  listEvents,
  listBlocks,
  fraudSummary,
  block,
  unblock,
  identify,
} from "../services/antifraude";
import {
  openBalancesBySeller,
  closeSettlement,
  markSettlementPaid,
  listSettlements,
} from "../services/settlements";
import {
  getOrganizer,
  setOrganizer,
  getPaymentMethods,
  setPaymentMethods,
  getPlataforma,
  setPlataforma,
} from "../services/settings";
import { generateSecret, otpauthUrl } from "../services/totp";
import { codigoConfere, guardarSegredo } from "../services/segundoFator";
import { buildExport, ExportError, toCsvLine } from "../services/exports";
import { refundOrder } from "../services/orders";
import {
  planOfOrganization,
  setBillingPlan,
  carteiraDaPlataforma,
  extratoDa,
  darBaixa,
  lancarMensalidades,
} from "../services/billing";
import { BILLING_LABEL } from "@shared/billing";
import {
  orgOf,
  isPlatform,
  requirePlatformAdmin,
  assertCampaignInScope,
  assertAffiliateInScope,
  organizationForNewCampaign,
  organizerInfoOf,
  enderecoDa,
  salvarEndereco,
  listOrganizations,
  createOrganization,
  updateOrganization,
  archiveOrganization,
  restoreOrganization,
  OrgScopeError,
} from "../services/orgs";
import { isUniqueViolation } from "../pgError";
import { caixaDeEntrada } from "../services/caixa";
import { buscarNoPainel } from "../services/busca";
import { avisosDoPainel, marcarAvisosVistos } from "../services/avisos";
import { BUSCA_MAX, ID_DO_CLIENTE_VALIDO } from "@shared/busca";
import { cortarPagina, lerCursor, limiteDaPagina } from "@shared/paginacao";
import { destaqueDa, midiasDas, salvarPerfil, urlDaCapa, urlDaFoto } from "../services/perfil";
import { resultados as resultadosDoPainel } from "../services/resultados";
import {
  decidirPedidoDeColaborador,
  decidirVinculo,
  pedidosDeColaborador,
  publicarTermo,
  termoAtual, termoDoPainel,
  vinculosDaOrganizacao,
} from "../services/afiliados";
import { salvarFotoDoGanhador } from "../services/ganhador";
import {
  decidir as decidirDivulgacao,
  fotoDoPainel as fotoDaDivulgacao,
  videoDoPainel as videoDaDivulgacao,
  listarDaOrganizacao as listarDivulgacoesDaOrganizacao,
  modoDaOrganizacao,
  pendentesDaOrganizacao,
  salvarModo as salvarModoDeDivulgacao,
} from "../services/divulgacao";
import { cliquesDosLinks, linkCurtoDaRifa, linkCurtoDoPerfil } from "../services/links";
import {
  cancelarSolicitacao,
  conferirEdicao,
  decidirSolicitacao,
  detalheDaSolicitacao,
  escreverNaSolicitacao,
  listarSolicitacoes,
  pedirAdiamento,
  pedirEdicao,
  solicitacoesEmAnalise,
  valoresNovos,
} from "../services/solicitacoes";
import {
  criarDemonstracao,
  preencherComExemplo,
  removerDemonstracao,
  situacaoDaDemonstracao,
} from "../services/demonstracao";
import { emitirRecibo, pdfDoRecibo, reciboPorCodigo } from "../services/recibos";
import { FiscalError, cadastrosFiscais, decidirCadastro, documento, estadoFiscal, notaDoSaque } from "../services/fiscal";
import { montarRotasDaVerificacao } from "./verificacaoRotas";
import { salvarLegenda } from "../services/publicacao";
import { limparLegenda, problemaNaLegenda } from "@shared/publicacao";
import {
  decidirVerificacao,
  detalheDaVerificacao,
  documentoDaVerificacao,
  filaDeVerificacoes,
  fotoDaVerificacao,
  verificacoesPendentes,
} from "../services/verificacao";
import { urlDeConferencia } from "../services/urls";
import { validarPeriodo } from "@shared/resultados";
import {
  alterarBanner,
  apagarBanner,
  apagarStory,
  criarBanner,
  donoDoStory,
  listarBanners,
  ordenarBanners,
  postarStory,
  storiesDaOrganizacao,
  arquivoDoStoryNoPainel,
} from "../services/vitrine";
import {
  publicar,
  rascunho as rascunhoDoTemplate,
  restaurar,
  salvarLogo,
  salvarApoio,
  preencherRodapeComExemplo,
  salvarRascunho,
  templatePublicado,
  versoes as versoesDoTemplate,
} from "../services/template";
import { transmissaoValida } from "@shared/sorteio";
import { avisarRifaNova, emSegundoPlano } from "../services/push";
import {
  anexoPara,
  chamadosAbertos,
  concluirChamado,
  detalheDoChamado,
  executarEstorno,
  listarChamados,
  respostaDaOrganizacao,
  decidirDisputa,
  disputasAbertas,
} from "../services/chamados";
import { alterarMeta, criarMeta, painelDoBonus } from "../services/bonus";
import { painelDoMarketing, salvarMarketing } from "../services/marketing";
import {
  ajustarSaldo,
  comprarAnuncio,
  decidirReembolso,
  marcarReembolsoPago,
  painelDoPatrocinio,
  pedirRecarga,
  pedirReembolso,
  responderReembolso,
} from "../services/patrocinio";
import {
  arteDoPedido,
  cancelarBanner,
  comprarBanner,
  decidirBanner,
  painelDoBannerPago,
} from "../services/bannerPago";
import {
  PROVEDORES_PIX,
  NOME_PROVEDOR,
  CREDENCIAIS_PROVEDOR,
  EXIGE_CPF,
  validarFundoDaConversa,
  validarCanaisDasLoterias,
} from "@shared/plataforma";
import { estadoWhatsApp, criarModelosFaltantes, enviarTeste } from "../services/whatsappSetup";
import { validarConfigBusca } from "@shared/buscar";
import { validarConfigIA } from "@shared/ia";
import { configDaIA } from "../services/ia";
import { CobrancaIAError, ajustarCreditosIA, extratoDaIA, relatorioDaIA } from "../services/iaCobranca";
import { chaveDoChatbase } from "../services/chatbase";
import { senhaInvalida } from "@shared/senha";
import { conversasDenunciadasAbertas, decidirDenunciaDeConversa, detalheDaDenunciaDeConversa, fotoDaDenuncia, listarDenunciasDeConversa } from "../services/mensagens";
import { decidirDenunciaDeGrupo, detalheDaDenunciaDeGrupo, listarDenunciasDeGrupo } from "../services/grupos";
import { decidirDenunciaDoSorteio, detalheDaDenunciaDoSorteio, listarDenunciasDoSorteio } from "../services/sorteioComentarios";
import { EXPORTS, exportInfo, exportFilename, CSV_BOM } from "@shared/exports";
import { aceitarContrato, contratoDaOrganizacao, contratoDaPlataforma, previaDoContrato, publicarContrato } from "../services/contratoPromotora";
import {
  aceitarAnexo,
  anexosDaOrganizacao,
  anexosDaPlataforma,
  exigirAnexoNaRifa,
  previaDoAnexo,
  publicarAnexo,
} from "../services/contratoAnexos";
import { EMPRESA_VAZIA } from "@shared/legal";

export const adminRouter = Router();

async function audit(
  req: Request,
  action: string,
  entity: string,
  entityId?: string,
  diff?: unknown,
) {
  await db.insert(auditLog).values({
    actorId: req.user?.id,
    actorRole: req.user?.role,
    action,
    entity,
    entityId,
    diff: diff as never,
    ip: req.ip,
  });
}

/**
 * Recorte por organização para consulta que já junta `campaigns`.
 *
 * Existe para a linha do filtro ser curta o bastante para ninguém ter
 * preguiça de escrever: filtro esquecido aqui não dá erro, entrega dado.
 */
function escopoDaCampanha(req: Request) {
  const org = orgOf(req);
  return org ? eq(campaigns.organizationId, org) : sql`TRUE`;
}

/* ---------------- painel ---------------- */

adminRouter.get("/overview", async (req, res, next) => {
  try {
    // Todo número deste painel é dinheiro de alguém. O recorte entra em TODAS
    // as consultas: uma esquecida aqui soma o faturamento do vizinho no
    // painel de quem não vendeu aquilo.
    const org = orgOf(req);
    const daCampanha = org ? sql`AND c.organization_id = ${org}::uuid` : sql``;

    const [totals] = await db
      .select({
        revenueCents: sql<number>`coalesce(sum(${campaignStats.revenueCents}), 0)::int`,
        soldCount: sql<number>`coalesce(sum(${campaignStats.soldCount}), 0)::int`,
        reservedCount: sql<number>`coalesce(sum(${campaignStats.reservedCount}), 0)::int`,
      })
      .from(campaignStats)
      .innerJoin(campaigns, eq(campaigns.id, campaignStats.campaignId))
      .where(org ? eq(campaigns.organizationId, org) : sql`TRUE`);

    const [published] = await db
      .select({ n: sql<number>`count(*)::int`, quotas: sql<number>`coalesce(sum(${campaigns.totalQuotas}),0)::int` })
      .from(campaigns)
      .where(
        org
          ? and(eq(campaigns.status, "published"), eq(campaigns.organizationId, org))
          : eq(campaigns.status, "published"),
      );

    const [toPay] = await db
      .select({
        cents: sql<number>`coalesce(sum(${commissions.amountCents}), 0)::int`,
        affiliates: sql<number>`count(distinct ${commissions.affiliateId})::int`,
      })
      .from(commissions)
      .innerJoin(campaigns, eq(campaigns.id, commissions.campaignId))
      .where(
        org
          ? and(
              sql`${commissions.status} in ('pending','available')`,
              eq(campaigns.organizationId, org),
            )
          : sql`${commissions.status} in ('pending','available')`,
      );

    // Por dia, no fuso de São Paulo (o relatório de Resultados usa a mesma
    // régua): 30 dias para o gráfico e as séries dos widgets.
    const daily = await db.execute(sql`
      SELECT to_char(o.paid_at AT TIME ZONE 'America/Sao_Paulo', 'YYYY-MM-DD') AS day,
             coalesce(sum(o.amount_cents), 0)::int AS cents,
             coalesce(sum(o.quantity), 0)::int AS cotas
      FROM orders o
      JOIN campaigns c ON c.id = o.campaign_id
      WHERE o.status = 'paid' AND o.paid_at > now() - interval '30 days'
        ${daCampanha}
      GROUP BY 1 ORDER BY 1
    `);

    // Os widgets do painel: hoje, o mês, por canal (site ou cambista) e por
    // estado de quem comprou — tudo venda paga, com o mesmo recorte.
    const [periodos] = (
      await db.execute(sql`
        SELECT
          coalesce(sum(o.amount_cents) FILTER (WHERE (o.paid_at AT TIME ZONE 'America/Sao_Paulo')::date = (now() AT TIME ZONE 'America/Sao_Paulo')::date), 0)::int AS "hojeCents",
          coalesce(sum(o.quantity) FILTER (WHERE (o.paid_at AT TIME ZONE 'America/Sao_Paulo')::date = (now() AT TIME ZONE 'America/Sao_Paulo')::date), 0)::int AS "hojeCotas",
          coalesce(sum(o.amount_cents) FILTER (WHERE date_trunc('month', o.paid_at AT TIME ZONE 'America/Sao_Paulo') = date_trunc('month', now() AT TIME ZONE 'America/Sao_Paulo')), 0)::int AS "mesCents",
          count(*) FILTER (WHERE o.paid_at > now() - interval '30 days' AND o.seller_id IS NULL)::int AS "siteVendas",
          count(*) FILTER (WHERE o.paid_at > now() - interval '30 days' AND o.seller_id IS NOT NULL)::int AS "cambistaVendas",
          coalesce(sum(o.amount_cents) FILTER (WHERE o.paid_at > now() - interval '30 days' AND o.seller_id IS NULL), 0)::int AS "siteCents",
          coalesce(sum(o.amount_cents) FILTER (WHERE o.paid_at > now() - interval '30 days' AND o.seller_id IS NOT NULL), 0)::int AS "cambistaCents"
        FROM orders o
        JOIN campaigns c ON c.id = o.campaign_id
        WHERE o.status = 'paid' ${daCampanha}
      `)
    ).rows as {
      hojeCents: number; hojeCotas: number; mesCents: number;
      siteVendas: number; cambistaVendas: number; siteCents: number; cambistaCents: number;
    }[];
    const porEstado = await db.execute(sql`
      SELECT coalesce(nullif(b.uf, ''), '—') AS uf, coalesce(sum(o.amount_cents), 0)::int AS cents, count(*)::int AS pedidos
      FROM orders o
      JOIN campaigns c ON c.id = o.campaign_id
      LEFT JOIN buyers b ON b.id = o.buyer_id
      WHERE o.status = 'paid' AND o.paid_at > now() - interval '30 days' ${daCampanha}
      GROUP BY 1 ORDER BY cents DESC
      LIMIT 6
    `);

    const topAffiliates = await db.execute(sql`
      SELECT a.code, u.name, coalesce(sum(o.amount_cents), 0)::int AS cents
      FROM affiliates a
      JOIN users u ON u.id = a.user_id
      JOIN orders o ON o.affiliate_id = a.id AND o.status = 'paid'
      JOIN campaigns c ON c.id = o.campaign_id
      -- O afiliado é de várias organizações: conta a venda das rifas daqui.
      WHERE ${org ? sql`c.organization_id = ${org}::uuid` : sql`TRUE`}
      GROUP BY a.code, u.name
      ORDER BY cents DESC
      LIMIT 5
    `);

    // Para o painel em grade: o próximo sorteio, o que falta fazer e as
    // últimas vendas. Mesmo recorte; a venda sai sem nome nem telefone
    // (quem é o cliente é regra da titularidade — aqui basta o pedido).
    const proximo = await db.execute(sql`
      SELECT c.id, c.slug, c.prize_title AS "prizeTitle", (c.draw_at AT TIME ZONE 'UTC') AS "drawAt", c.total_quotas AS "totalQuotas",
             c.price_cents AS "priceCents", coalesce(s.sold_count, 0)::int AS "soldCount"
      FROM campaigns c
      LEFT JOIN campaign_stats s ON s.campaign_id = c.id
      WHERE c.status = 'published' AND c.draw_at > now() AND NOT c.demonstracao
        ${daCampanha}
      ORDER BY c.draw_at
      LIMIT 1
    `);
    const [pend] = (
      await db.execute(sql`
        SELECT
          (SELECT count(*)::int FROM chamados ch WHERE ch.status = 'aberto'
             ${org ? sql`AND ch.organization_id = ${org}::uuid` : sql``}) AS "chamadosAbertos",
          (SELECT count(*)::int FROM campaigns c WHERE c.status = 'draft' AND NOT c.demonstracao
             AND c.authorization_code IS NULL ${daCampanha}) AS "rascunhosSemAutorizacao",
          (SELECT count(*)::int FROM orders o JOIN campaigns c ON c.id = o.campaign_id
             WHERE o.status = 'pending' ${daCampanha}) AS "pedidosEsperandoPix"
      `)
    ).rows as { chamadosAbertos: number; rascunhosSemAutorizacao: number; pedidosEsperandoPix: number }[];
    const telefonePendente = org
      ? !(await db.select({ em: organizations.telefoneAprovadoEm }).from(organizations).where(eq(organizations.id, org)))[0]?.em
      : false;
    const ultimas = await db.execute(sql`
      SELECT o.code, c.prize_title AS "prizeTitle", o.quantity, o.amount_cents AS "amountCents", (o.paid_at AT TIME ZONE 'UTC') AS "paidAt",
             (o.seller_id IS NOT NULL) AS cambista
      FROM orders o
      JOIN campaigns c ON c.id = o.campaign_id
      WHERE o.status = 'paid' ${daCampanha}
      ORDER BY o.paid_at DESC
      LIMIT 6
    `);

    const prox = proximo.rows[0] as { slug: string; id?: string } | undefined;
    res.json({
      proximoSorteio: prox ? { ...prox, capa: prox.id ? ((await midiasDas([prox.id])).get(prox.id)?.find((m) => m.role !== "video")?.url ?? null) : null } : null,
      hoje: { cents: periodos.hojeCents, cotas: periodos.hojeCotas },
      mesCents: periodos.mesCents,
      canais: {
        site: { vendas: periodos.siteVendas, cents: periodos.siteCents },
        cambista: { vendas: periodos.cambistaVendas, cents: periodos.cambistaCents },
      },
      porEstado: porEstado.rows,
      pendencias: { ...pend, telefonePendente },
      ultimasVendas: ultimas.rows,
      revenueCents: totals.revenueCents,
      soldCount: totals.soldCount,
      reservedCount: totals.reservedCount,
      publishedCampaigns: published.n,
      publishedQuotas: published.quotas,
      commissionToPayCents: toPay.cents,
      commissionAffiliates: toPay.affiliates,
      daily: daily.rows,
      topAffiliates: topAffiliates.rows,
    });
  } catch (err) {
    next(err);
  }
});

/* ---------------- campanhas ---------------- */

adminRouter.get("/campaigns", async (req, res, next) => {
  try {
    const org = orgOf(req);
    const rows = await db
      .select({
        campaign: campaigns,
        stats: campaignStats,
        // Pedidos de mudança esperando a plataforma (edição, adiamento).
        emAnalise: sql<string[] | null>`(
          SELECT array_agg(s.tipo::text) FROM campanha_solicitacoes s
           WHERE s.campaign_id = "campaigns"."id" AND s.status = 'em_analise'
        )`,
      })
      .from(campaigns)
      .leftJoin(campaignStats, eq(campaignStats.campaignId, campaigns.id))
      .where(org ? eq(campaigns.organizationId, org) : sql`TRUE`)
      .orderBy(desc(campaigns.createdAt));
    // A capa da grade de rifas do painel: o banner, senão a primeira foto.
    const midias = await midiasDas(rows.map((r) => r.campaign.id));
    res.json(
      rows.map((r) => ({
        ...r,
        capa: midias.get(r.campaign.id)?.find((m) => m.role !== "video")?.url ?? null,
      })),
    );
  } catch (err) {
    next(err);
  }
});

adminRouter.post("/campaigns", async (req, res, next) => {
  try {
    const input = insertCampaignSchema.parse(req.body);
    assertQuotaRange(input.totalQuotas);

    // Organizador cria na própria; o administrador geral precisa dizer em
    // qual, senão a campanha nasceria sem administradora — e é a
    // administradora que a Lei 5.768/71 autoriza.
    const organizationId = organizationForNewCampaign(
      req,
      req.body?.organizationId ? String(req.body.organizationId) : undefined,
    );

    // Nasce com o primeiro método liberado (hoje, a Federal direta): a
    // numeração já sai a partir de zero e a promotora troca nos dados legais.
    const metodoApuracao = (await getPlataforma()).metodosDeApuracao[0] ?? null;
    const premio = problemaNoPremio(input.prizeTitle, Boolean(metodoApuracao));
    if (premio) return res.status(422).json({ message: premio });
    const [created] = await db
      .insert(campaigns)
      .values({ ...input, organizationId, status: "draft", metodoApuracao })
      .returning();

    await audit(req, "campaign.create", "campaign", created.id, input);
    res.status(201).json(created);
  } catch (err) {
    if (err instanceof CampaignRuleError) {
      return res.status(422).json({ message: err.message });
    }
    next(err);
  }
});

adminRouter.patch("/campaigns/:id", async (req, res, next) => {
  try {
    const campaign = await assertCampaignInScope(req, req.params.id);

    const changes = insertCampaignSchema.partial().parse(req.body);
    // A campanha não muda de dono por PATCH: seria transferir venda, cota e
    // comissão de uma administradora para outra com um campo de formulário.
    delete (changes as { organizationId?: unknown }).organizationId;
    // Só campos desconhecidos (ex.: autorização, que tem rota própria) viram
    // um objeto vazio — e UPDATE sem nada para gravar quebra no banco.
    if (Object.keys(changes).length === 0) {
      return res.status(400).json({
        message: "Nada para alterar. Autorização e data do sorteio ficam em \"Dados legais\".",
      });
    }
    // Rifa no ar tem comprador: a organização não muda nada sozinha, pede
    // (`/editar`) e a plataforma analisa.
    if (campaign.status !== "draft" && orgOf(req)) {
      return res.status(409).json({
        message: "Rifa publicada: a edição vai para análise da plataforma. Use \"Editar rifa\" no painel.",
      });
    }
    assertEditable(campaign, changes);
    if (changes.totalQuotas) assertQuotaRange(changes.totalQuotas);
    if (changes.prizeTitle !== undefined) {
      const premio = problemaNoPremio(changes.prizeTitle, Boolean(campaign.metodoApuracao));
      if (premio) return res.status(422).json({ message: premio });
    }

    const [updated] = await db
      .update(campaigns)
      .set(changes)
      .where(eq(campaigns.id, campaign.id))
      .returning();

    await audit(req, "campaign.update", "campaign", campaign.id, changes);
    res.json(updated);
  } catch (err) {
    if (err instanceof CampaignRuleError) {
      return res.status(422).json({ message: err.message });
    }
    next(err);
  }
});

/**
 * Editar rifa. Rascunho muda na hora (tudo, inclusive prêmio, preço e
 * total). Publicada: o prêmio, o preço e o total não mudam nunca; o resto,
 * se quem pede é a organização, vira pedido de análise (202) e a rifa só
 * muda quando a plataforma aprovar. A própria plataforma aplica direto.
 */
adminRouter.post("/campaigns/:id/editar", async (req, res, next) => {
  try {
    const campaign = await assertCampaignInScope(req, req.params.id);
    const corpo = (req.body ?? {}) as Record<string, unknown>;
    if (orgOf(req)) {
      emSegundoPlano(
        varrerTextoDoOrganizador({
          organizationId: campaign.organizationId,
          campaignId: campaign.id,
          onde: "texto da rifa",
          texto: [corpo.title, corpo.description].filter((t) => typeof t === "string").join("\n"),
        }),
        "varredura",
      );
    }

    if (campaign.status === "draft") {
      const changes = insertCampaignSchema.partial().parse(corpo);
      delete (changes as { organizationId?: unknown }).organizationId;
      if (Object.keys(changes).length === 0) return res.status(400).json({ message: "Nada para alterar." });
      if (changes.totalQuotas) assertQuotaRange(changes.totalQuotas);
      if (changes.prizeTitle !== undefined) {
        const premio = problemaNoPremio(changes.prizeTitle, Boolean(campaign.metodoApuracao));
        if (premio) return res.status(422).json({ message: premio });
      }
      const [updated] = await db.update(campaigns).set(changes).where(eq(campaigns.id, campaign.id)).returning();
      await audit(req, "campaign.update", "campaign", campaign.id, changes);
      return res.json({ aplicada: true, campaign: updated });
    }

    if (!orgOf(req)) {
      const alteracoes = conferirEdicao(campaign, corpo);
      const [updated] = await db
        .update(campaigns)
        .set(valoresNovos(alteracoes))
        .where(eq(campaigns.id, campaign.id))
        .returning();
      await audit(req, "campaign.update", "campaign", campaign.id, alteracoes);
      return res.json({ aplicada: true, campaign: updated });
    }

    const pedido = await pedirEdicao(req, campaign, corpo);
    await audit(req, "campaign.edicao.pedida", "campaign", campaign.id, {
      protocolo: pedido.protocolo,
      alteracoes: pedido.alteracoes,
    });
    res.status(202).json({ aplicada: false, protocolo: pedido.protocolo, solicitacaoId: pedido.id });
  } catch (err) {
    if (err instanceof CampaignRuleError) {
      return res.status(422).json({ message: err.message });
    }
    next(err);
  }
});

/**
 * Adiar o sorteio por não atingir a meta. Vira pedido de análise: a data
 * só muda quando a plataforma aprovar (e aí quem comprou é avisado).
 */
adminRouter.post("/campaigns/:id/adiar", async (req, res, next) => {
  try {
    const campaign = await assertCampaignInScope(req, req.params.id);
    const pedido = await pedirAdiamento(req, campaign, {
      novaData: req.body?.novaData,
      motivo: req.body?.motivo,
      sorteioOficialId: req.body?.sorteioOficialId,
    });
    await audit(req, "campaign.adiamento.pedido", "campaign", campaign.id, {
      protocolo: pedido.protocolo,
      de: pedido.drawAtAtual,
      para: pedido.drawAtNovo,
      ...(pedido.sorteioOficialNovoId ? { sorteioOficialId: pedido.sorteioOficialNovoId } : {}),
    });
    res.status(202).json({ protocolo: pedido.protocolo, solicitacaoId: pedido.id });
  } catch (err) {
    next(err);
  }
});

/* ------------- segurança: telefone, denúncias, trava ------------- */

/** Telefone do organizador: provado pelo código e aprovado pela plataforma. */
adminRouter.get("/organizacoes/:id/telefone", async (req, res, next) => {
  try {
    res.json(await estadoDoTelefone(req, req.params.id));
  } catch (err) {
    next(err);
  }
});

adminRouter.post("/organizacoes/:id/telefone", async (req, res, next) => {
  try {
    res.json(await pedirCodigoDoTelefone(req, req.params.id, req.body?.telefone));
  } catch (err) {
    next(err);
  }
});

adminRouter.post("/organizacoes/:id/telefone/confirmar", async (req, res, next) => {
  try {
    const r = await confirmarTelefone(req, req.params.id, req.body?.codigo);
    await audit(req, "organizacao.telefone.confirmado", "organization", req.params.id, { telefone: r.telefone });
    res.json(r);
  } catch (err) {
    next(err);
  }
});

/** Só a plataforma aprova (403 para organizador, no `npm run isolation`). */
adminRouter.post("/organizacoes/:id/telefone/aprovar", async (req, res, next) => {
  try {
    requirePlatformAdmin(req);
    await audit(req, "organizacao.telefone.aprovado", "organization", req.params.id, {});
    res.json(await aprovarTelefone(req, req.params.id));
  } catch (err) {
    next(err);
  }
});

/**
 * Retenção cautelar de saldo (`shared/retencao.ts`): nasce no banimento ou
 * pela plataforma; só a plataforma vê, libera e abate (403 para organizador,
 * no `npm run isolation`). A auditoria vai na transação do serviço.
 */
adminRouter.get("/retencoes", async (req, res, next) => {
  try {
    res.setHeader("Cache-Control", "no-store");
    res.json(await listarRetencoes(req));
  } catch (err) {
    next(err);
  }
});

adminRouter.post("/organizacoes/:id/retencao", async (req, res, next) => {
  try {
    res.status(201).json(await reterManual(req, req.params.id, req.body?.motivo));
  } catch (err) {
    next(err);
  }
});

adminRouter.post("/retencoes/:id/liberar", async (req, res, next) => {
  try {
    res.json(await liberarRetencao(req, req.params.id, req.body?.motivo));
  } catch (err) {
    next(err);
  }
});

adminRouter.post("/retencoes/:id/abater", async (req, res, next) => {
  try {
    res.json(await abaterRetencao(req, req.params.id, req.body ?? {}));
  } catch (err) {
    next(err);
  }
});

/**
 * Pix que chegou tarde (reserva vencida ou rifa já sorteada): a fila de
 * devolução. Só a plataforma — o dinheiro passou pela conta dela (403 para
 * organizador, no `npm run isolation`).
 */
adminRouter.get("/pix-tardios", async (req, res, next) => {
  try {
    res.setHeader("Cache-Control", "no-store");
    res.json(await listarPixTardios(req));
  } catch (err) {
    next(err);
  }
});

adminRouter.post("/pix-tardios/:id/devolver", async (req, res, next) => {
  try {
    res.json(await devolverPixTardio(req, req.params.id));
  } catch (err) {
    next(err);
  }
});

adminRouter.post("/pix-tardios/:id/resolver", async (req, res, next) => {
  try {
    res.json(await resolverPixTardio(req, req.params.id, req.body?.observacao));
  } catch (err) {
    next(err);
  }
});

/** Denúncias: só a plataforma vê e decide — a denunciada nunca (403). */
adminRouter.get("/denuncias", async (req, res, next) => {
  try {
    requirePlatformAdmin(req);
    res.json(await listarDenuncias(req.query.status ? String(req.query.status) : undefined));
  } catch (err) {
    next(err);
  }
});

adminRouter.get("/denuncias/:id", async (req, res, next) => {
  try {
    requirePlatformAdmin(req);
    res.json(await detalheDaDenuncia(req.params.id));
  } catch (err) {
    next(err);
  }
});

adminRouter.post("/denuncias/:id/decidir", async (req, res, next) => {
  try {
    requirePlatformAdmin(req);
    // Auditoria antes: travar e banir mudam rifa e organização na mesma transação.
    await audit(req, `denuncia.${String(req.body?.acao ?? "")}`, "denuncia", req.params.id, {
      resposta: req.body?.resposta ?? null,
    });
    res.json(await decidirDenuncia(req, req.params.id, { acao: req.body?.acao, resposta: req.body?.resposta }));
  } catch (err) {
    next(err);
  }
});

/**
 * Conversas denunciadas: só a plataforma. A fila não traz texto; o detalhe
 * traz só o trecho que foi anexado à denúncia — e a leitura entra em
 * `audit_log` antes de o texto sair.
 */
adminRouter.get("/mensagens/denuncias", async (req, res, next) => {
  try {
    requirePlatformAdmin(req);
    res.json(await listarDenunciasDeConversa(req.query.status ? String(req.query.status) : undefined));
  } catch (err) {
    next(err);
  }
});

adminRouter.get("/mensagens/denuncias/:id", async (req, res, next) => {
  try {
    requirePlatformAdmin(req);
    await audit(req, "mensagens.denuncia.ler", "mensagem_denuncia", req.params.id, {});
    res.json(await detalheDaDenunciaDeConversa(req.params.id));
  } catch (err) {
    next(err);
  }
});

/** A foto de uma mensagem denunciada: só se está no trecho da denúncia; a leitura é auditada antes. */
adminRouter.get("/mensagens/denuncias/:id/fotos/:fotoId", async (req, res, next) => {
  try {
    requirePlatformAdmin(req);
    await audit(req, "mensagens.denuncia.foto", "mensagem_denuncia", req.params.id, { fotoId: req.params.fotoId });
    const bytes = await fotoDaDenuncia(req.params.id, req.params.fotoId);
    res.setHeader("Content-Type", "image/jpeg");
    res.setHeader("Cache-Control", "private, no-store");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.send(bytes);
  } catch (err) {
    next(err);
  }
});

adminRouter.post("/mensagens/denuncias/:id/decidir", async (req, res, next) => {
  try {
    requirePlatformAdmin(req);
    // Só decisão conhecida entra na auditoria: o texto da ação não vem solto do corpo.
    if (req.body?.decisao !== "procedente" && req.body?.decisao !== "improcedente") return res.status(400).json({ message: "Escolha: procedente ou improcedente." });
    await audit(req, `mensagens.denuncia.${String(req.body?.decisao ?? "")}`, "mensagem_denuncia", req.params.id, {
      resposta: req.body?.resposta ?? null,
    });
    res.json(await decidirDenunciaDeConversa(req, req.params.id, { decisao: req.body?.decisao, resposta: req.body?.resposta }));
  } catch (err) {
    next(err);
  }
});

/* Grupos denunciados: a plataforma lê só o trecho, e a leitura é auditada antes. */
adminRouter.get("/mensagens/grupos/denuncias", async (req, res, next) => {
  try {
    requirePlatformAdmin(req);
    res.json(await listarDenunciasDeGrupo(req.query.status ? String(req.query.status) : undefined));
  } catch (err) {
    next(err);
  }
});

adminRouter.get("/mensagens/grupos/denuncias/:id", async (req, res, next) => {
  try {
    requirePlatformAdmin(req);
    await audit(req, "mensagens.grupo.denuncia.ler", "grupo_denuncia", req.params.id, {});
    res.json(await detalheDaDenunciaDeGrupo(req.params.id));
  } catch (err) {
    next(err);
  }
});

adminRouter.post("/mensagens/grupos/denuncias/:id/decidir", async (req, res, next) => {
  try {
    requirePlatformAdmin(req);
    // Só decisão conhecida entra na auditoria: o texto da ação não vem solto do corpo.
    if (req.body?.decisao !== "procedente" && req.body?.decisao !== "improcedente") return res.status(400).json({ message: "Escolha: procedente ou improcedente." });
    await audit(req, `mensagens.grupo.denuncia.${String(req.body?.decisao ?? "")}`, "grupo_denuncia", req.params.id, {
      resposta: req.body?.resposta ?? null,
    });
    res.json(await decidirDenunciaDeGrupo(req, req.params.id, { decisao: req.body?.decisao, resposta: req.body?.resposta }));
  } catch (err) {
    next(err);
  }
});

/* Comentários do sorteio oficial denunciados: só a plataforma; a leitura do trecho é auditada antes. */
adminRouter.get("/sorteios-oficiais/denuncias", async (req, res, next) => {
  try {
    requirePlatformAdmin(req);
    res.json(await listarDenunciasDoSorteio(req.query.status ? String(req.query.status) : undefined));
  } catch (err) {
    next(err);
  }
});

adminRouter.get("/sorteios-oficiais/denuncias/:id", async (req, res, next) => {
  try {
    requirePlatformAdmin(req);
    await audit(req, "sorteio.comentario.denuncia.ler", "sorteio_comentario_denuncia", req.params.id, {});
    res.json(await detalheDaDenunciaDoSorteio(req.params.id));
  } catch (err) {
    next(err);
  }
});

adminRouter.post("/sorteios-oficiais/denuncias/:id/decidir", async (req, res, next) => {
  try {
    requirePlatformAdmin(req);
    // A auditoria vai na transação da decisão: só registra o que aconteceu.
    res.json(await decidirDenunciaDoSorteio(req, req.params.id, { decisao: req.body?.decisao, resposta: req.body?.resposta }));
  } catch (err) {
    next(err);
  }
});

adminRouter.post("/campaigns/:id/destravar", async (req, res, next) => {
  try {
    requirePlatformAdmin(req);
    await audit(req, "campaign.destravar", "campaign", req.params.id, {});
    res.json(await destravarRifa(req.params.id));
  } catch (err) {
    next(err);
  }
});

/* ------------- pedidos de mudança em rifa publicada ------------- */

adminRouter.get("/solicitacoes", async (req, res, next) => {
  try {
    res.json(await listarSolicitacoes(req, req.query.status ? String(req.query.status) : undefined));
  } catch (err) {
    next(err);
  }
});

adminRouter.get("/solicitacoes/pendentes", async (req, res, next) => {
  try {
    res.json({ total: await solicitacoesEmAnalise(req) });
  } catch (err) {
    next(err);
  }
});

adminRouter.get("/solicitacoes/:id", async (req, res, next) => {
  try {
    res.json(await detalheDaSolicitacao(req, req.params.id));
  } catch (err) {
    next(err);
  }
});

adminRouter.post("/solicitacoes/:id/mensagens", async (req, res, next) => {
  try {
    res.status(201).json(await escreverNaSolicitacao(req, req.params.id, req.body?.texto));
  } catch (err) {
    next(err);
  }
});

adminRouter.post("/solicitacoes/:id/cancelar", async (req, res, next) => {
  try {
    await cancelarSolicitacao(req, req.params.id);
    await audit(req, "solicitacao.cancelar", "solicitacao", req.params.id, {});
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

/** A palavra final é da plataforma (403 para organizador, no `npm run isolation`). */
adminRouter.post("/solicitacoes/:id/decidir", async (req, res, next) => {
  try {
    requirePlatformAdmin(req);
    const aprovar = req.body?.aprovar === true;
    // Auditoria antes: a decisão muda a rifa na mesma transação.
    await audit(req, aprovar ? "solicitacao.aprovar" : "solicitacao.recusar", "solicitacao", req.params.id, {
      resposta: req.body?.resposta ?? null,
    });
    res.json(await decidirSolicitacao(req, req.params.id, { aprovar, resposta: req.body?.resposta }));
  } catch (err) {
    next(err);
  }
});

/**
 * Autorização SPA/MF, arquivo do certificado e data do sorteio. Rota à
 * parte do PATCH porque confere o arquivo e trava depois de publicar.
 */
adminRouter.put("/campaigns/:id/legal", async (req, res, next) => {
  try {
    const campaign = await assertCampaignInScope(req, req.params.id);
    const cert = req.body?.certificado;
    const atualizada = await salvarDadosLegais(campaign, {
      authorizationCode:
        req.body?.authorizationCode === undefined ? undefined : String(req.body.authorizationCode ?? ""),
      drawAt: req.body?.drawAt === undefined ? undefined : req.body.drawAt ? String(req.body.drawAt) : null,
      certificado: cert?.dataUrl ? { dataUrl: String(cert.dataUrl), nome: cert.nome ? String(cert.nome) : undefined } : null,
      regulamentoExtra: req.body?.regulamentoExtra,
      aceitaCotaBonus: req.body?.aceitaCotaBonus === undefined ? undefined : req.body.aceitaCotaBonus === true,
      bonusMaxCotas: req.body?.bonusMaxCotas,
      minimoVendidoPct: req.body?.minimoVendidoPct,
      modoSorteio: req.body?.modoSorteio,
      metodoApuracao: req.body?.metodoApuracao,
    });
    await audit(req, "campaign.legal", "campaign", campaign.id, {
      metodoApuracao: atualizada.metodoApuracao,
      aceitaCotaBonus: atualizada.aceitaCotaBonus,
      bonusMaxCotas: atualizada.bonusMaxCotas,
      minimoVendidoPct: atualizada.minimoVendidoPct,
      modoSorteio: atualizada.modoSorteio,
      authorizationCode: atualizada.authorizationCode,
      drawAt: atualizada.drawAt,
      certificado: Boolean(cert?.dataUrl),
    });
    res.json({
      authorizationCode: atualizada.authorizationCode,
      drawAt: atualizada.drawAt,
      temCertificado: Boolean(atualizada.authorizationFileKey),
      regulamentoExtra: atualizada.regulamentoExtra,
      aceitaCotaBonus: atualizada.aceitaCotaBonus,
      bonusMaxCotas: atualizada.bonusMaxCotas,
      minimoVendidoPct: atualizada.minimoVendidoPct,
      modoSorteio: atualizada.modoSorteio,
      metodoApuracao: atualizada.metodoApuracao,
    });
  } catch (err) {
    if (err instanceof CampaignRuleError) return res.status(422).json({ message: err.message });
    next(err);
  }
});

/**
 * Link da transmissão do sorteio. Ao contrário da autorização, muda depois
 * de publicar — o link da live só existe perto do sorteio, e o vídeo, depois.
 * Vazio apaga. Mesmo recorte de toda rota de campanha (vizinho: 404).
 */
/**
 * A legenda da publicação (o texto embaixo das ações, como no Instagram).
 * Muda a qualquer hora — não é termo da rifa —, pela régua do comentário
 * (sem link nem telefone) e com a varredura do Pix por fora.
 */
adminRouter.put("/campaigns/:id/legenda", async (req, res, next) => {
  try {
    const campaign = await assertCampaignInScope(req, req.params.id);
    const salva = await salvarLegenda(campaign.id, campaign.organizationId, req.body?.legenda ?? "");
    await audit(req, "campaign.legenda", "campaign", campaign.id, salva);
    res.json(salva);
  } catch (err) {
    next(err);
  }
});

// Banner de divulgação em cima da rifa (empresa, ONG): muda a qualquer hora,
// antes ou depois de publicar — não é termo da rifa. O vizinho é 404.
adminRouter.get("/campaigns/:id/banner-divulgacao", async (req, res, next) => {
  try {
    const campaign = await assertCampaignInScope(req, req.params.id);
    const b = await bannerDoPainel(campaign.id);
    res.setHeader("Cache-Control", "no-store");
    res.json(
      b
        ? {
            nome: b.nome,
            texto: b.texto,
            site: b.site,
            redes: b.redes,
            imagem: `/api/admin/campaigns/${campaign.id}/banner-divulgacao/imagem?v=${b.em.getTime()}`,
          }
        : null,
    );
  } catch (err) {
    next(err);
  }
});

adminRouter.get("/campaigns/:id/banner-divulgacao/imagem", async (req, res, next) => {
  try {
    const campaign = await assertCampaignInScope(req, req.params.id);
    const b = await imagemDoPainel(campaign.id);
    if (!b) return res.status(404).json({ message: "Sem banner." });
    res.setHeader("Cache-Control", "private, no-store");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.type(b.mime).send(b.bytes);
  } catch (err) {
    next(err);
  }
});

adminRouter.put("/campaigns/:id/banner-divulgacao", async (req, res, next) => {
  try {
    const campaign = await assertCampaignInScope(req, req.params.id);
    const corpo = req.body && typeof req.body === "object" ? (req.body as Record<string, unknown>) : {};
    // Entidade nova numa rifa já no ar: o anexo dela tem de estar aceito (cláusula 7).
    // Editar a que já existe não pede de novo — a rifa já segue a versão dela.
    if (!(await bannerDoPainel(campaign.id))) await exigirAnexoNaRifa(campaign.id, campaign.organizationId, "entidade");
    const salvo = await salvarBannerDeDivulgacao(campaign.id, campaign.organizationId, corpo);
    await audit(req, "campaign.banner_divulgacao", "campaign", campaign.id, {
      nome: salvo.nome,
      site: salvo.site,
      redes: salvo.redes.map((r) => r.rede),
      imagemNova: corpo.imagem !== undefined,
    });
    res.json(salvo);
  } catch (err) {
    if (err instanceof BannerDivulgacaoError) return res.status(err.status).json({ message: err.message });
    next(err);
  }
});

adminRouter.delete("/campaigns/:id/banner-divulgacao", async (req, res, next) => {
  try {
    const campaign = await assertCampaignInScope(req, req.params.id);
    await removerBannerDeDivulgacao(campaign.id);
    await audit(req, "campaign.banner_divulgacao.remover", "campaign", campaign.id, {});
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

adminRouter.put("/campaigns/:id/transmissao", async (req, res, next) => {
  try {
    const campaign = await assertCampaignInScope(req, req.params.id);
    const bruto = String(req.body?.url ?? "").trim();
    if (bruto && !transmissaoValida(bruto)) {
      return res.status(400).json({ message: "Link inválido: use o endereço https da live ou do vídeo." });
    }
    const [atualizada] = await db
      .update(campaigns)
      .set({ transmissaoUrl: bruto || null })
      .where(eq(campaigns.id, campaign.id))
      .returning({ transmissaoUrl: campaigns.transmissaoUrl });
    await audit(req, "campaign.transmissao", "campaign", campaign.id, atualizada);
    res.json(atualizada);
  } catch (err) {
    next(err);
  }
});

adminRouter.get("/campaigns/:id/certificado", async (req, res, next) => {
  try {
    const campaign = await assertCampaignInScope(req, req.params.id);
    const c = await certificadoDa(campaign.id);
    if (!c) return res.status(404).json({ message: "Certificado não enviado." });
    res.setHeader("Cache-Control", "private, no-store");
    res.setHeader("Content-Disposition", `inline; filename="${c.nome}"`);
    res.type(c.mime).send(c.bytes);
  } catch (err) {
    next(err);
  }
});

adminRouter.get("/campaigns/:id/blockers", async (req, res, next) => {
  try {
    await assertCampaignInScope(req, req.params.id);
    res.json({ blockers: await publishBlockers(req.params.id) });
  } catch (err) {
    next(err);
  }
});

/**
 * Tirar do ar: rifa publicada sem nenhuma venda volta a rascunho. Só a
 * plataforma (403 para organizador, no `npm run isolation`); com venda, 422
 * — o caminho é estornar quem comprou.
 */
adminRouter.post("/campaigns/:id/tirar-do-ar", async (req, res, next) => {
  try {
    requirePlatformAdmin(req);
    await tirarDoAr(req.params.id);
    await audit(req, "campaign.tirar_do_ar", "campaign", req.params.id, {});
    res.json({ ok: true });
  } catch (err) {
    if (err instanceof CampaignRuleError) {
      return res.status(422).json({ message: err.message });
    }
    next(err);
  }
});

/**
 * Rifa de teste (demonstração): marca ou desmarca. Só a plataforma (403 para
 * organizador, no `npm run isolation`); as regras moram em
 * `marcarDemonstracao()` — 422 quando não cabe.
 */
adminRouter.post("/campaigns/:id/demonstracao", async (req, res, next) => {
  try {
    requirePlatformAdmin(req);
    const ligado = req.body?.ligado === true;
    await marcarDemonstracao(req.params.id, ligado);
    await audit(req, "campaign.demonstracao", "campaign", req.params.id, { ligado });
    res.json({ ok: true });
  } catch (err) {
    if (err instanceof CampaignRuleError) {
      return res.status(422).json({ message: err.message });
    }
    next(err);
  }
});

/**
 * Apagar a rifa de vez: rascunho, rifa no ar sem nenhuma cota vendida, ou
 * rifa de teste. A organização apaga a dela (a do vizinho é 404, no `npm
 * run isolation`); as regras moram em `excluirRifa()` — 422 quando não
 * cabe. A auditoria vai antes.
 */
adminRouter.delete("/campaigns/:id", async (req, res, next) => {
  try {
    const c = await assertCampaignInScope(req, req.params.id);
    await audit(req, "campaign.excluir", "campaign", c.id, {
      title: c.title,
      slug: c.slug,
      status: c.status,
      demonstracao: c.demonstracao,
    });
    await excluirRifa(c.id);
    res.json({ ok: true });
  } catch (err) {
    if (err instanceof CampaignRuleError) {
      return res.status(422).json({ message: err.message });
    }
    next(err);
  }
});

adminRouter.post("/campaigns/:id/publish", async (req, res, next) => {
  try {
    await assertCampaignInScope(req, req.params.id);
    const published = await publishCampaign(req.params.id);
    await audit(req, "campaign.publish", "campaign", published.id, {
      totalQuotas: published.totalQuotas,
      seedHash: published.drawSeedHash,
      contratoPromotoraId: published.contratoPromotoraId,
      contratoAnexoIds: published.contratoAnexoIds,
    });
    // Quem segue a organização com o sino ligado fica sabendo. Fora da
    // resposta: a tela não espera os envios, e falha de push não desfaz nada.
    emSegundoPlano(avisarRifaNova(published.id), "rifa nova");
    res.json(published);
  } catch (err) {
    if (err instanceof CampaignRuleError) {
      return res.status(422).json({ message: err.message });
    }
    next(err);
  }
});

/**
 * Agendar (ou tirar a agenda de) a publicação do rascunho. Na hora, o relógio
 * publica pela mesma `publishCampaign()` — tudo é conferido de novo ali.
 * Recorte de sempre: a rifa do vizinho é 404.
 */
adminRouter.put("/campaigns/:id/agendar-publicacao", async (req, res, next) => {
  try {
    await assertCampaignInScope(req, req.params.id);
    const r = await agendarPublicacao(req.params.id, req.body?.publicarEm ?? null, req.user?.id ?? null);
    await audit(req, r.publicarEm ? "campaign.publish.agendar" : "campaign.publish.desagendar", "campaign", req.params.id, {
      publicarEm: r.publicarEm,
    });
    res.json(r);
  } catch (err) {
    if (err instanceof CampaignRuleError) {
      return res.status(422).json({ message: err.message });
    }
    next(err);
  }
});

adminRouter.put("/campaigns/:id/packages", async (req, res, next) => {
  try {
    await assertCampaignInScope(req, req.params.id);
    const list = (req.body?.packages ?? []) as {
      quantity: number;
      discountPct: number;
      highlight?: boolean;
    }[];

    await db.transaction(async (tx) => {
      await tx.delete(quotaPackages).where(eq(quotaPackages.campaignId, req.params.id));
      if (list.length > 0) {
        await tx.insert(quotaPackages).values(
          list.map((p) => ({
            campaignId: req.params.id,
            quantity: p.quantity,
            discountPct: p.discountPct,
            highlight: p.highlight ?? false,
          })),
        );
      }
    });

    await audit(req, "campaign.packages", "campaign", req.params.id, list);
    res.json({ packages: list });
  } catch (err) {
    next(err);
  }
});

/* ---------------- mídia: banner, 5 fotos, vídeo de 60 s ---------------- */

adminRouter.get("/campaigns/:id/media", async (req, res, next) => {
  try {
    await assertCampaignInScope(req, req.params.id);
    res.json(await listMedia(req.params.id));
  } catch (err) {
    next(err);
  }
});

/** Passo 1: URL assinada. O arquivo não passa pela nossa API. */
adminRouter.post("/campaigns/:id/media/upload-url", async (req, res, next) => {
  try {
    await assertCampaignInScope(req, req.params.id);
    const ticket = await requestUpload({
      campaignId: req.params.id,
      role: req.body?.role,
      filename: String(req.body?.filename ?? "arquivo"),
      mime: String(req.body?.mime ?? ""),
      bytes: Number(req.body?.bytes ?? 0),
    });
    res.json(ticket);
  } catch (err) {
    if (err instanceof MediaRuleError) {
      return res.status(err.status).json({ message: err.message });
    }
    next(err);
  }
});

/**
 * Recepção do upload em desenvolvimento, quando o armazenamento é o disco
 * local. Em produção o R2 recebe direto e esta rota não é usada.
 */
adminRouter.put(
  "/media/raw",
  // A assinatura (com o teto de bytes dentro) é conferida ANTES de ler o corpo, e o
  // leitor só aceita o que o passo 1 prometeu: sem isso, dois envios de 2 GB
  // em paralelo estouravam a memória do processo.
  (req, res, next) => {
    const store = storage();
    if (!(store instanceof LocalDiskStorage)) return res.status(404).json({ message: "Envie direto para o armazenamento." });
    const max = Number(req.query.max ?? 0);
    if (!store.verify(String(req.query.key ?? ""), Number(req.query.exp ?? 0), max, String(req.query.sig ?? ""))) {
      return res.status(403).json({ message: "Link de envio inválido ou expirado." });
    }
    express.raw({ type: "*/*", limit: max })(req, res, next);
  },
  async (req, res, next) => {
    try {
      const store = storage();
      if (!(store instanceof LocalDiskStorage)) {
        return res.status(404).json({ message: "Envie direto para o armazenamento." });
      }
      const key = String(req.query.key ?? "");
      await store.write(key, req.body as Buffer, String(req.headers["content-type"] ?? ""));
      res.json({ stored: key, bytes: (req.body as Buffer).length });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * Passo 2: confirma o envio. É AQUI que o arquivo é medido — dimensões da
 * imagem e duração do vídeo saem do próprio arquivo, nunca do que o
 * navegador informou.
 */
adminRouter.post("/campaigns/:id/media", async (req, res, next) => {
  try {
    const campanha = await assertCampaignInScope(req, req.params.id);
    const created = await ingestUpload({
      campaignId: req.params.id,
      role: req.body?.role,
      storageKey: String(req.body?.storageKey ?? ""),
      altText: req.body?.altText ? String(req.body.altText) : undefined,
      mime: String(req.body?.mime ?? ""),
      legenda: req.body?.legenda,
    });
    if (created.legenda) {
      emSegundoPlano(
        varrerTextoDoOrganizador({
          organizationId: campanha.organizationId,
          campaignId: campanha.id,
          onde: "legenda do reels",
          texto: created.legenda,
        }),
        "varredura",
      );
    }
    await audit(req, "media.add", "campaign", req.params.id, {
      role: created.role,
      durationS: created.durationS,
      width: created.width,
    });
    res.status(201).json(created);
  } catch (err) {
    if (err instanceof MediaRuleError) {
      return res.status(err.status).json({ message: err.message });
    }
    next(err);
  }
});

/** Troca a legenda de um reels (a qualquer hora, como a legenda da publicação). */
adminRouter.put("/media/:mediaId/legenda", async (req, res, next) => {
  try {
    const [midia] = await db
      .select({ campaignId: campaignMedia.campaignId, role: campaignMedia.role })
      .from(campaignMedia)
      .where(eq(campaignMedia.id, req.params.mediaId));
    if (!midia) return res.status(404).json({ message: "Mídia não encontrada." });
    const campanha = await assertCampaignInScope(req, midia.campaignId);
    if (midia.role !== "reels") return res.status(409).json({ message: "Só o reels tem legenda própria." });
    const problema = problemaNaLegenda(req.body?.legenda);
    if (problema) return res.status(422).json({ message: problema });
    const legenda = limparLegenda(typeof req.body?.legenda === "string" ? req.body.legenda : "") || null;
    const [gravada] = await db
      .update(campaignMedia)
      .set({ legenda })
      .where(and(eq(campaignMedia.id, req.params.mediaId), eq(campaignMedia.role, "reels")))
      .returning({ id: campaignMedia.id });
    // Apagada entre a leitura e a gravação: nada mudou, nada se audita.
    if (!gravada) return res.status(404).json({ message: "Mídia não encontrada." });
    if (legenda) {
      emSegundoPlano(
        varrerTextoDoOrganizador({
          organizationId: campanha.organizationId,
          campaignId: campanha.id,
          onde: "legenda do reels",
          texto: legenda,
        }),
        "varredura",
      );
    }
    await audit(req, "media.legenda", "campaign", campanha.id, { id: req.params.mediaId });
    res.json({ legenda });
  } catch (err) {
    next(err);
  }
});

adminRouter.delete("/media/:mediaId", async (req, res, next) => {
  try {
    // O caminho não traz a campanha, então o dono é conferido pelo pai: sem
    // isto, o id da mídia do vizinho apagaria o banner dele.
    const [midia] = await db
      .select({ campaignId: campaignMedia.campaignId })
      .from(campaignMedia)
      .where(eq(campaignMedia.id, req.params.mediaId));
    if (!midia) return res.status(404).json({ message: "Mídia não encontrada." });
    await assertCampaignInScope(req, midia.campaignId);

    const removed = await removeMedia(req.params.mediaId);
    if (!removed) return res.status(404).json({ message: "Mídia não encontrada." });
    await audit(req, "media.remove", "campaign", removed.campaignId, { id: removed.id });
    res.json({ removed: removed.id });
  } catch (err) {
    next(err);
  }
});

/* ---------------- cotas premiadas ---------------- */

adminRouter.get("/campaigns/:id/prized", async (req, res, next) => {
  try {
    await assertCampaignInScope(req, req.params.id);
    const rows = await db
      .select()
      .from(prizedQuotas)
      .where(eq(prizedQuotas.campaignId, req.params.id))
      .orderBy(prizedQuotas.number);
    // O número em jogo é só da plataforma. Se a organização soubesse qual é,
    // poderia comprá-lo (ou passá-lo a um conhecido) — a fraude que a cota
    // sorteada existe para evitar. Depois de ganho, a cota já foi vendida e o
    // número é público (topo dos comentários), então volta a aparecer.
    res.json(isPlatform(req) ? rows : rows.map((r) => (r.claimedByOrderId ? r : { ...r, number: null })));
  } catch (err) {
    next(err);
  }
});

/**
 * Sorteia N cotas premiadas. Os números saem por CSPRNG e ficam escondidos
 * do público — quem soubesse qual é compraria só aquele.
 */
adminRouter.post("/campaigns/:id/prized", async (req, res, next) => {
  try {
    const campaign = await assertCampaignInScope(req, req.params.id);

    const prizeLabel = String(req.body?.prizeLabel ?? "").trim();
    const quantity = Number(req.body?.quantity ?? 1);

    if (prizeLabel.length < 2) {
      return res.status(400).json({ message: "Descreva o prêmio da cota." });
    }
    const premio = problemaNoPremio(prizeLabel, Boolean(campaign.metodoApuracao));
    if (premio) return res.status(422).json({ message: premio });

    // Números escolhidos: só a plataforma, e só no cadastro, antes de publicar
    // (`shared/premiadas.ts`). A organização sorteia — quem escolhe o número
    // premiado da própria rifa pode comprá-lo.
    if (req.body?.numeros !== undefined) {
      if (!isPlatform(req)) {
        return res.status(403).json({ message: "As cotas premiadas são sorteadas pelo sistema. Só a plataforma vê os números." });
      }
      if (campaign.status !== "draft") {
        return res.status(409).json({ message: "Escolher os números só no cadastro, antes de publicar. Depois, só sorteando." });
      }
      const lidos = numerosPremiados(req.body.numeros, campaign.totalQuotas, numeracaoZero(campaign.metodoApuracao));
      if ("problema" in lidos) return res.status(400).json({ message: lidos.problema });
      const criados = await db
        .insert(prizedQuotas)
        .values(lidos.numeros.map((number) => ({ campaignId: campaign.id, number, prizeLabel })))
        .onConflictDoNothing()
        .returning();
      await audit(req, "prized.create", "campaign", campaign.id, { prizeLabel, quantity: criados.length, escolhidos: true });
      const repetidos = lidos.numeros.length - criados.length;
      return res.status(201).json({
        created: criados.length,
        prizeLabel,
        ...(repetidos ? { aviso: `${repetidos} número(s) já eram premiados e ficaram como estavam.` } : {}),
      });
    }
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 500) {
      return res.status(400).json({ message: "Sorteie de 1 a 500 cotas premiadas." });
    }

    const existing = await db
      .select({ number: prizedQuotas.number })
      .from(prizedQuotas)
      .where(eq(prizedQuotas.campaignId, campaign.id));
    const taken = new Set(existing.map((e) => e.number));
    // A primeira cota premiada numa rifa já no ar faz dela promoção mista: o
    // anexo do vale-brinde tem de estar aceito (cláusula 7), e a versão fica ligada à rifa.
    if (!existing.length) await exigirAnexoNaRifa(campaign.id, campaign.organizationId, "vale_brinde");

    if (taken.size + quantity > campaign.totalQuotas) {
      return res.status(409).json({ message: "Mais cotas premiadas do que cotas na rifa." });
    }

    const picked: number[] = [];
    // Teto de voltas: campanha pequena e muito premiada colide bastante.
    for (let spin = 0; spin < quantity * 200 && picked.length < quantity; spin++) {
      const n = randomInt(1, campaign.totalQuotas + 1);
      if (taken.has(n)) continue;
      taken.add(n);
      picked.push(n);
    }

    const created = await db
      .insert(prizedQuotas)
      .values(picked.map((number) => ({ campaignId: campaign.id, number, prizeLabel })))
      .onConflictDoNothing()
      .returning();

    await audit(req, "prized.create", "campaign", campaign.id, {
      prizeLabel,
      quantity: created.length,
    });
    res.status(201).json({ created: created.length, prizeLabel });
  } catch (err) {
    next(err);
  }
});

adminRouter.delete("/prized/:prizedId", async (req, res, next) => {
  try {
    // Confere o dono ANTES de apagar: aqui a rota apaga e só depois decide se
    // devolve, então um id de outra organização já teria sumido do banco.
    const [alvo] = await db
      .select({ campaignId: prizedQuotas.campaignId })
      .from(prizedQuotas)
      .where(eq(prizedQuotas.id, req.params.prizedId));
    if (!alvo) return res.status(404).json({ message: "Cota premiada não encontrada." });
    await assertCampaignInScope(req, alvo.campaignId);

    const [removed] = await db
      .delete(prizedQuotas)
      .where(eq(prizedQuotas.id, req.params.prizedId))
      .returning();
    if (!removed) return res.status(404).json({ message: "Cota premiada não encontrada." });
    if (removed.claimedByOrderId) {
      // Já foi ganha: recriar seria tirar prêmio de quem levou.
      await db.insert(prizedQuotas).values(removed);
      return res.status(409).json({ message: "Esta cota premiada já foi ganha." });
    }
    await audit(req, "prized.remove", "campaign", removed.campaignId, { id: removed.id });
    res.json({ removed: removed.id });
  } catch (err) {
    next(err);
  }
});

/* ---------------- pedidos ---------------- */

/**
 * A busca da barra de cima: pedido pelo código, cliente pelo ID e, para a
 * plataforma, organização pelo nome. O recorte é o de `orgOf`; o que não é
 * da sessão volta como lista vazia (`server/services/busca.ts`).
 */
adminRouter.get("/busca", async (req, res, next) => {
  try {
    const q = String(req.query.q ?? "").slice(0, BUSCA_MAX);
    res.json(await buscarNoPainel(orgOf(req), q));
  } catch (err) {
    next(err);
  }
});

adminRouter.get("/orders", async (req, res, next) => {
  try {
    const status = req.query.status ? String(req.query.status) : null;
    // A busca do painel chega aqui com `?codigo=` (o pedido) ou `?cliente=`
    // (o ID): a lista fica só com eles, dentro do mesmo recorte.
    const codigo = /^\d{8}$/.test(String(req.query.codigo ?? "")) ? Number(req.query.codigo) : null;
    const cliente = ID_DO_CLIENTE_VALIDO.test(String(req.query.cliente ?? "")) ? String(req.query.cliente) : null;
    const limite = limiteDaPagina(req.query.limite);
    const antes = lerCursor(req.query.antes);
    // Cliente da plataforma aparece só pelo ID; o do cambista, e o ganhador,
    // com nome e telefone (`shared/titularidade.ts`).
    const visivel = clienteVisivelSql(orgOf(req), "orders");
    const rows = await db
      .select({
        order: orders,
        buyer: {
          name: sql<string>`${nomeNoPainelSql(visivel, "buyers")}`,
          phone: sql<string | null>`${dadoNoPainelSql(visivel, "buyers.phone")}`,
          codigo: buyers.codigo,
          completo: sql<boolean>`${visivel}`,
        },
        campaign: { title: campaigns.title, totalQuotas: campaigns.totalQuotas },
      })
      .from(orders)
      .innerJoin(buyers, eq(buyers.id, orders.buyerId))
      .innerJoin(campaigns, eq(campaigns.id, orders.campaignId))
      .where(
        and(
          status ? sql`${orders.status} = ${status}` : sql`true`,
          codigo ? eq(orders.code, codigo) : sql`true`,
          cliente ? eq(buyers.codigo, cliente) : sql`true`,
          // Paginação por chave: a próxima página começa depois da última
          // linha vista (`shared/paginacao.ts`), sem OFFSET.
          antes ? sql`(${orders.createdAt}, ${orders.id}) < (${antes.criadoEm.toISOString()}::timestamp, ${antes.id}::uuid)` : sql`true`,
          escopoDaCampanha(req),
        ),
      )
      .orderBy(desc(orders.createdAt), desc(orders.id))
      .limit(limite + 1);
    // Uma linha a mais diz que há próxima página; o cursor vai no cabeçalho
    // para o corpo continuar sendo a lista, como sempre foi.
    const { itens, proximo } = cortarPagina(
      rows.map((r) => ({ ...r, criadoEm: r.order.createdAt, id: r.order.id })),
      limite,
    );
    if (proximo) res.setHeader("X-Proximo", proximo);
    res.json(itens.map(({ criadoEm: _c, id: _i, ...linha }) => linha));
  } catch (err) {
    next(err);
  }
});

/* ---------------- afiliados ---------------- */

adminRouter.get("/affiliates", async (req, res, next) => {
  try {
    const org = orgOf(req);
    // A organização vê os afiliados pelo vínculo com ela (e as vendas das
    // rifas dela); o status que ela decide é o do vínculo, não o da conta.
    if (org) {
      const vinculos = await vinculosDaOrganizacao(org);
      return res.json(
        vinculos.map((v) => ({
          affiliate: { ...v.affiliate, pixKey: null },
          user: v.user,
          salesCents: v.salesCents,
          vinculo: {
            id: v.vinculo.id,
            status: v.vinculo.status,
            commissionPct: v.vinculo.commissionPct,
            aceiteVersao: v.aceiteVersao,
            termoVersaoAtual: v.termoVersaoAtual,
          },
        })),
      );
    }
    const rows = await db
      .select({
        affiliate: affiliates,
        user: { name: users.name, email: users.email },
        salesCents: sql<number>`coalesce((
          SELECT sum(o.amount_cents) FROM orders o
          WHERE o.affiliate_id = ${affiliates.id} AND o.status = 'paid'
        ), 0)::int`,
      })
      .from(affiliates)
      .innerJoin(users, eq(users.id, affiliates.userId))
      // A plataforma vê todos os afiliados (a conta); cambista tem tela própria.
      .where(eq(affiliates.kind, "online"))
      .orderBy(desc(affiliates.createdAt));
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

adminRouter.post("/affiliates", async (req, res, next) => {
  try {
    const { name, email, password, code, commissionPct } = req.body ?? {};
    if (!name || !email || !password || !code) {
      return res.status(400).json({ message: "Nome, e-mail, senha e código são obrigatórios." });
    }

    // O afiliado é avulso (a conta não tem organização). Criado por um
    // organizador, já nasce com o vínculo aprovado com a organização dele.
    const organizationId = orgOf(req) ?? (req.body?.organizationId ? String(req.body.organizationId) : null);

    const created = await db.transaction(async (tx) => {
      const [user] = await tx
        .insert(users)
        .values({
          role: "affiliate",
          organizationId: null,
          name: String(name),
          email: String(email).toLowerCase().trim(),
          passwordHash: await hashPassword(String(password)),
        })
        .returning();

      const [aff] = await tx
        .insert(affiliates)
        .values({
          userId: user.id,
          code: String(code).toUpperCase().trim(),
          commissionPct: commissionPct ? Number(commissionPct) : null,
          status: "active",
          approvedAt: new Date(),
        })
        .returning();

      if (organizationId) {
        await tx
          .insert(afiliadoVinculos)
          .values({ affiliateId: aff.id, organizationId, status: "aprovado", decididoEm: new Date() })
          .onConflictDoNothing();
      }
      return aff;
    });

    await audit(req, "affiliate.create", "affiliate", created.id, { code: created.code });
    res.status(201).json(created);
  } catch (err) {
    next(err);
  }
});

adminRouter.patch("/affiliates/:id", async (req, res, next) => {
  try {
    const afiliado = await assertAffiliateInScope(req, req.params.id);
    const org = orgOf(req);
    // A organização decide o vínculo com ela — nunca a conta do afiliado,
    // que é de todas as organizações a que ele aderiu.
    if (org && afiliado.kind === "online") {
      const status =
        req.body?.status === "active" ? "aprovado" : req.body?.status === "blocked" ? "recusado" : req.body?.status;
      const [v] = await db
        .select({ id: afiliadoVinculos.id })
        .from(afiliadoVinculos)
        .where(and(eq(afiliadoVinculos.affiliateId, afiliado.id), eq(afiliadoVinculos.organizationId, org)));
      if (!v) return res.status(404).json({ message: "Cadastro não encontrado." });
      const feito = await decidirVinculo(org, v.id, { status, commissionPct: req.body?.commissionPct });
      await audit(req, "afiliado.vinculo", "affiliate", afiliado.id, { status: feito.status, commissionPct: feito.commissionPct });
      return res.json(feito);
    }

    const changes: Record<string, unknown> = {};
    if (req.body?.status) changes.status = req.body.status;
    if (req.body?.commissionPct !== undefined) {
      changes.commissionPct = req.body.commissionPct === null ? null : Number(req.body.commissionPct);
    }
    if (changes.status === "active") changes.approvedAt = new Date();

    const [updated] = await db
      .update(affiliates)
      .set(changes)
      .where(eq(affiliates.id, req.params.id))
      .returning();

    await audit(req, "affiliate.update", "affiliate", req.params.id, changes);
    res.json(updated);
  } catch (err) {
    next(err);
  }
});

/* ---------------- cupons ---------------- */

adminRouter.get("/coupons", async (req, res, next) => {
  try {
    const org = orgOf(req);
    const rows = await db
      .select({
        coupon: coupons,
        affiliateCode: affiliates.code,
        campaignTitle: campaigns.title,
      })
      .from(coupons)
      .leftJoin(affiliates, eq(affiliates.id, coupons.affiliateId))
      .leftJoin(users, eq(users.id, affiliates.userId))
      .leftJoin(campaigns, eq(campaigns.id, coupons.campaignId))
      // Cupom solto (sem campanha e sem afiliado) vale na plataforma inteira
      // e por isso não aparece para o organizador: ele não pode mexer nele.
      .where(
        org
          ? sql`(${coupons.organizationId} = ${org}::uuid OR ${campaigns.organizationId} = ${org}::uuid)`
          : sql`TRUE`,
      )
      .orderBy(desc(coupons.id));
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

/**
 * Cupom do afiliado: dá desconto ao comprador e, no checkout, sobrepõe o
 * cookie de primeiro clique — é como o afiliado ganha a venda de quem chegou
 * por outro caminho e digitou o código dele.
 */
adminRouter.post("/coupons", async (req, res, next) => {
  try {
    const code = String(req.body?.code ?? "").toUpperCase().trim();
    const discountPct = Number(req.body?.discountPct);

    if (!/^[A-Z0-9]{3,20}$/.test(code)) {
      return res.status(400).json({ message: "Use de 3 a 20 letras ou números." });
    }
    if (!Number.isInteger(discountPct) || discountPct < 1 || discountPct > 50) {
      return res.status(400).json({ message: "O desconto precisa ficar entre 1% e 50%." });
    }

    // Cupom de organizador tem que morder algo dele. Sem campanha e sem
    // afiliado o cupom vale em toda a plataforma — isso é da plataforma.
    if (req.body?.campaignId) {
      await assertCampaignInScope(req, String(req.body.campaignId));
    }
    if (req.body?.affiliateId) {
      await assertAffiliateInScope(req, String(req.body.affiliateId));
    }
    if (!req.body?.campaignId && !req.body?.affiliateId) {
      requirePlatformAdmin(req);
    }
    // Quem dá o desconto: a organização da sessão, ou a da rifa escolhida.
    // Cupom da plataforma (sem campanha e sem afiliado) não tem organização.
    let organizationId = orgOf(req);
    if (!organizationId && req.body?.campaignId) {
      const [c] = await db.select({ org: campaigns.organizationId }).from(campaigns).where(eq(campaigns.id, String(req.body.campaignId)));
      organizationId = c?.org ?? null;
    }

    // Código repetido: quem decide é o índice (`uq_coupons_code`), não uma
    // consulta antes — dois cadastros ao mesmo tempo passariam os dois.
    const [created] = await db
      .insert(coupons)
      .values({
        code,
        discountPct,
        organizationId,
        affiliateId: req.body?.affiliateId || null,
        campaignId: req.body?.campaignId || null,
        maxUses: req.body?.maxUses ? Number(req.body.maxUses) : null,
        expiresAt: req.body?.expiresAt ? new Date(req.body.expiresAt) : null,
      })
      .onConflictDoNothing({ target: coupons.code })
      .returning();
    if (!created) return res.status(409).json({ message: "Este código já existe." });

    await audit(req, "coupon.create", "coupon", created.id, { code, discountPct });
    res.status(201).json(created);
  } catch (err) {
    next(err);
  }
});

adminRouter.delete("/coupons/:id", async (req, res, next) => {
  try {
    // Confere o dono antes de apagar, pelo mesmo motivo da cota premiada.
    const [alvo] = await db.select().from(coupons).where(eq(coupons.id, req.params.id));
    if (!alvo) return res.status(404).json({ message: "Cupom não encontrado." });
    // O dono é a organização do cupom (o afiliado é de várias organizações:
    // conferir pelo afiliado deixaria uma apagar o cupom da outra).
    const org = orgOf(req);
    if (alvo.campaignId) await assertCampaignInScope(req, alvo.campaignId);
    if (org && alvo.organizationId !== org) return res.status(404).json({ message: "Cupom não encontrado." });
    if (!alvo.organizationId && !alvo.campaignId) requirePlatformAdmin(req);

    const [removed] = await db.delete(coupons).where(eq(coupons.id, req.params.id)).returning();
    if (!removed) return res.status(404).json({ message: "Cupom não encontrado." });
    await audit(req, "coupon.remove", "coupon", removed.id, { code: removed.code });
    res.json({ removed: removed.id });
  } catch (err) {
    next(err);
  }
});

/* ---------------- cambistas e acertos ---------------- */

/**
 * Cadastra um cambista. É o mesmo cadastro do afiliado, com `kind` diferente:
 * a comissão funciona igual, o que muda é a direção do caixa — o cambista
 * está com o dinheiro na mão e presta contas no acerto.
 */
adminRouter.post("/sellers", async (req, res, next) => {
  try {
    const { name, email, password, code, commissionPct, phone } = req.body ?? {};
    if (!name || !email || !password || !code) {
      return res.status(400).json({ message: "Nome, e-mail, senha e código são obrigatórios." });
    }
    // O cambista vende e dá baixa em dinheiro: a mesma régua de senha do resto.
    const senhaRuim = senhaInvalida(String(password), "cambista");
    if (senhaRuim) return res.status(400).json({ message: senhaRuim });

    const organizationId = organizationForNewCampaign(
      req,
      req.body?.organizationId ? String(req.body.organizationId) : undefined,
    );

    const created = await db.transaction(async (tx) => {
      const [user] = await tx
        .insert(users)
        .values({
          role: "cambista",
          organizationId,
          name: String(name),
          email: String(email).toLowerCase().trim(),
          phone: phone ? String(phone) : null,
          passwordHash: await hashPassword(String(password)),
        })
        .returning();

      const [seller] = await tx
        .insert(affiliates)
        .values({
          userId: user.id,
          code: String(code).toUpperCase().trim(),
          kind: "cambista",
          commissionPct: commissionPct ? Number(commissionPct) : null,
          status: "active",
          approvedAt: new Date(),
        })
        .returning();

      return seller;
    }).catch((err) => {
      // Repetido: quem decide é o índice (e vira 409, não erro interno).
      if (isUniqueViolation(err, "uq_users_email")) throw new OrgScopeError("Já existe um acesso com este e-mail.", 409);
      if (isUniqueViolation(err, "uq_affiliates_code")) throw new OrgScopeError("Este código já é de outro cambista ou afiliado.", 409);
      throw err;
    });

    await audit(req, "seller.create", "affiliate", created.id, { code: created.code });
    res.status(201).json(created);
  } catch (err) {
    next(err);
  }
});

/** Quanto cada cambista deve hoje. */
adminRouter.get("/settlements", async (req, res, next) => {
  try {
    const org = orgOf(req);
    res.json({
      emAberto: await openBalancesBySeller(org),
      historico: await listSettlements(undefined, org),
    });
  } catch (err) {
    next(err);
  }
});

adminRouter.post("/settlements/:sellerId/close", async (req, res, next) => {
  try {
    await assertAffiliateInScope(req, req.params.sellerId);
    const created = await closeSettlement(
      req.params.sellerId,
      req.body?.notes ? String(req.body.notes) : undefined,
    );
    if (!created) {
      return res.status(400).json({ message: "Este cambista não tem venda em aberto." });
    }
    await audit(req, "settlement.close", "settlement", created.id, {
      netCents: created.netCents,
      orderCount: created.orderCount,
    });
    res.status(201).json(created);
  } catch (err) {
    next(err);
  }
});

adminRouter.post("/settlements/:id/paid", async (req, res, next) => {
  try {
    const [acerto] = await db
      .select({ sellerId: settlements.sellerId })
      .from(settlements)
      .where(eq(settlements.id, req.params.id));
    if (!acerto) return res.status(404).json({ message: "Acerto não encontrado." });
    await assertAffiliateInScope(req, acerto.sellerId);

    const updated = await markSettlementPaid(req.params.id);
    if (!updated) return res.status(404).json({ message: "Acerto não encontrado." });
    await audit(req, "settlement.paid", "settlement", updated.id);
    res.json(updated);
  } catch (err) {
    next(err);
  }
});

/* ---------------- administradora da rifa ---------------- */

adminRouter.get("/organizer", async (req, res, next) => {
  try {
    // O que o bilhete chama de "administradora" é a organização da sessão.
    // Para o administrador geral, que não tem uma, continua valendo a
    // configuração antiga da plataforma.
    const org = orgOf(req);
    if (!org) return res.json(await getOrganizer());
    const [linha] = await db.select().from(organizations).where(eq(organizations.id, org));
    const [foto] = await db
      .select({ updatedAt: organizacaoFotos.updatedAt })
      .from(organizacaoFotos)
      .where(eq(organizacaoFotos.organizationId, org));
    const [capa] = await db
      .select({ updatedAt: organizacaoCapas.updatedAt })
      .from(organizacaoCapas)
      .where(eq(organizacaoCapas.organizationId, org));
    res.json({
      ...(await organizerInfoOf(org)),
      organizacaoId: org,
      slug: linha?.slug,
      bio: linha?.bio ?? null,
      foto: linha ? urlDaFoto(linha.slug, foto?.updatedAt) : null,
      capa: linha ? urlDaCapa(linha.slug, capa?.updatedAt) : null,
      destaque: linha ? destaqueDa(linha) : null,
      links: linha?.links ?? [],
      endereco: linha ? enderecoDa(linha) : null,
      // O que já existe, para o formulário não começar do zero quando o
      // cadastro antigo trouxe só cidade e UF.
      enderecoParcial: linha
        ? {
            cep: linha.cep,
            logradouro: linha.logradouro,
            numero: linha.numero,
            complemento: linha.complemento,
            bairro: linha.bairro,
            cidade: linha.cidade,
            uf: linha.uf,
          }
        : null,
    });
  } catch (err) {
    next(err);
  }
});

adminRouter.put("/organizer", async (req, res, next) => {
  try {
    const org = orgOf(req);

    // Para o organizador, "administradora" é a organização dele — mesma tela,
    // outro destino. Para o administrador geral, segue a configuração da
    // plataforma, que é o que vale para quem ainda não tem organização.
    if (org) {
      const alterada = await updateOrganization(org, {
        name: req.body?.nome,
        cnpj: req.body?.cnpj,
        contato: req.body?.contato,
        observacao: req.body?.observacao,
      });
      await audit(req, "organizer.update", "organization", alterada.id, req.body);
      return res.json(await organizerInfoOf(org));
    }

    const saved = await setOrganizer(req.body ?? {});
    await audit(req, "organizer.update", "settings", "organizador", saved);
    res.json(saved);
  } catch (err) {
    if (err instanceof Error && err.message.includes("administradora")) {
      return res.status(400).json({ message: err.message });
    }
    next(err);
  }
});

/* ---------------- exportações ---------------- */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Data do formulário (aaaa-mm-dd) ou nada. Texto torto vira `null`.
 *
 * Montada como data **local**, não com `new Date("2026-09-14")` — esse
 * construtor lê a string como UTC, e num servidor em UTC-3 a meia-noite viraria
 * 21h do dia anterior. O relatório passaria a começar no dia errado.
 */
function lerData(valor: unknown, fimDoDia = false): Date | null {
  const texto = String(valor ?? "");
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(texto);
  if (!m) return null;

  const [, ano, mes, dia] = m;
  const d = new Date(Number(ano), Number(mes) - 1, Number(dia));
  if (Number.isNaN(d.getTime())) return null;

  // O filtro do serviço é `< ate`. Quem escolhe "até 14/09" quer o dia 14
  // inteiro, então o fim é a meia-noite do dia seguinte.
  if (fimDoDia) d.setDate(d.getDate() + 1);

  return d;
}

adminRouter.get("/exportacoes", (_req, res) => {
  res.json({ relatorios: EXPORTS });
});

/**
 * O download.
 *
 * Escreve direto no socket, página por página, respeitando a contrapressão:
 * `res.write()` devolvendo `false` significa que o buffer do sistema encheu e
 * continuar escrevendo acumularia tudo na memória do processo — exatamente o
 * que o gerador paginado existe para evitar.
 *
 * O cabeçalho sai antes da primeira consulta pesada, então erro depois disso
 * não vira JSON: a resposta já começou. Por isso a validação toda acontece
 * antes, e uma falha no meio derruba a conexão de propósito — arquivo cortado
 * que parece inteiro é pior que download que falhou.
 */
adminRouter.get("/exportacoes/:key", async (req, res, next) => {
  try {
    const info = exportInfo(req.params.key);
    if (!info) return res.status(404).json({ message: "Relatório desconhecido." });

    const campaignId = req.query.campanha ? String(req.query.campanha) : null;
    if (info.campanhaObrigatoria && !campaignId) {
      return res.status(400).json({
        message: `O relatório "${info.label}" precisa de uma campanha.`,
      });
    }

    let campanha: { slug: string } | undefined;
    if (campaignId) {
      if (!UUID.test(campaignId)) {
        return res.status(400).json({ message: "Campanha inválida." });
      }
      // Confere o dono aqui: o relatório de cotas não junta `campaigns`, e
      // sem esta linha o id de uma campanha alheia sairia com os números e
      // os telefones de quem comprou nela.
      campanha = await assertCampaignInScope(req, campaignId);
    }

    const de = lerData(req.query.de);
    const ate = lerData(req.query.ate, true);
    if (req.query.de && !de) return res.status(400).json({ message: "Data inicial inválida." });
    if (req.query.ate && !ate) return res.status(400).json({ message: "Data final inválida." });
    if (de && ate && de > ate) {
      return res.status(400).json({ message: "A data inicial é depois da final." });
    }

    const relatorio = buildExport(info.key, {
      campaignId,
      organizationId: orgOf(req),
      de,
      ate,
    });

    // O registro do acesso vem ANTES do arquivo: exportação que leva dado
    // pessoal precisa deixar rastro mesmo que o download seja interrompido.
    await audit(req, "exportacao", "export", info.key, {
      campanha: campanha?.slug ?? null,
      organizacao: orgOf(req),
      de: de?.toISOString() ?? null,
      ate: ate?.toISOString() ?? null,
      dadoPessoal: info.dadoPessoal,
    });

    const nome = exportFilename(info.key, campanha?.slug ?? null);

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${nome}"`);
    // Relatório é retrato do instante: guardar em cache entrega número velho.
    res.setHeader("Cache-Control", "no-store");

    res.write(CSV_BOM + toCsvLine(relatorio.header));

    for await (const linha of relatorio.linhas) {
      if (!res.write(toCsvLine(linha))) {
        // Buffer cheio: espera o socket drenar antes de pedir a próxima
        // página. Sem isto, 500 mil linhas entram na memória do processo.
        await once(res, "drain");
      }
    }

    res.end();
  } catch (err) {
    if (res.headersSent) {
      // A resposta já começou: não dá para virar JSON. Derruba a conexão,
      // que é como o navegador entende "este arquivo não está inteiro".
      res.destroy(err as Error);
      return;
    }
    if (err instanceof ExportError) {
      return res.status(err.status).json({ message: err.message });
    }
    next(err);
  }
});

/* ---------------- organizações (só da plataforma) ---------------- */

/**
 * A lista de organizações é a carteira de clientes da plataforma — por isso
 * é só do administrador geral. O organizador não precisa saber quem mais
 * vende aqui, e saber já seria informação comercial de terceiro.
 */
adminRouter.get("/organizacoes", async (req, res, next) => {
  try {
    requirePlatformAdmin(req);
    const situacao = String(req.query.situacao ?? "ativas");
    const orgs = await listOrganizations(
      situacao === "arquivadas" || situacao === "todas" ? situacao : "ativas",
    );

    // Quantas campanhas e quanta gente em cada uma: é o que dá para decidir
    // sem entrar no painel de ninguém.
    const contagem = await db.execute(sql`
      SELECT o.id,
             count(DISTINCT c.id)::int AS campanhas,
             count(DISTINCT u.id)::int AS pessoas
        FROM organizations o
        LEFT JOIN campaigns c ON c.organization_id = o.id
        LEFT JOIN users u ON u.organization_id = o.id
       GROUP BY o.id
    `);
    const porId = new Map(
      (contagem.rows as { id: string; campanhas: number; pessoas: number }[]).map(
        (r) => [r.id, r],
      ),
    );

    const fotos = await db
      .select({ id: organizacaoFotos.organizationId, em: organizacaoFotos.updatedAt })
      .from(organizacaoFotos);
    const fotoDe = new Map(fotos.map((f) => [f.id, f.em]));
    const capas = await db
      .select({ id: organizacaoCapas.organizationId, em: organizacaoCapas.updatedAt })
      .from(organizacaoCapas);
    const capaDe = new Map(capas.map((c) => [c.id, c.em]));

    res.json(
      orgs.map((o) => ({
        ...o,
        campanhas: porId.get(o.id)?.campanhas ?? 0,
        pessoas: porId.get(o.id)?.pessoas ?? 0,
        foto: urlDaFoto(o.slug, fotoDe.get(o.id)),
        capa: urlDaCapa(o.slug, capaDe.get(o.id)),
        destaque: destaqueDa(o),
      })),
    );
  } catch (err) {
    next(err);
  }
});

/**
 * Organização de demonstração (perfil completo, sem rifa à venda): só a
 * plataforma cria, vê e remove — 403 para organizador, no `npm run isolation`.
 */
adminRouter.get("/demonstracao", async (req, res, next) => {
  try {
    requirePlatformAdmin(req);
    res.json(await situacaoDaDemonstracao());
  } catch (err) {
    next(err);
  }
});

adminRouter.post("/demonstracao", async (req, res, next) => {
  try {
    requirePlatformAdmin(req);
    const feita = await criarDemonstracao(process.env.PUBLIC_BASE_URL ?? "");
    await audit(req, "demonstracao.criar", "organization", feita.slug, {});
    res.json(feita);
  } catch (err) {
    next(err);
  }
});

/**
 * Preencher com exemplo: fotos das publicações de teste, destaques, foto e
 * capa (se faltarem) e stories numa organização de teste. Só a plataforma
 * (403 para organizador, no `npm run isolation`); recusa (409) organização
 * com rifa de verdade no ar.
 */
adminRouter.post("/organizacoes/:id/exemplo", async (req, res, next) => {
  try {
    requirePlatformAdmin(req);
    const feito = await preencherComExemplo(req.params.id, process.env.PUBLIC_BASE_URL ?? "");
    await audit(req, "organizacao.exemplo", "organization", req.params.id, feito);
    res.json(feito);
  } catch (err) {
    next(err);
  }
});

/* ---------------- endereço curto e cliques nos links ---------------- */

/** Recorte da organização pelo id do caminho: o do vizinho é 404. */
function orgDoCaminho(req: Request, res: Resposta): boolean {
  const org = orgOf(req);
  if (org && org !== req.params.id) {
    res.status(404).json({ message: "Organização não encontrada." });
    return false;
  }
  return true;
}

/** Endereço curto do perfil (criado na primeira vez) e quantos acessos teve. */
adminRouter.post("/organizacoes/:id/link-curto", async (req, res, next) => {
  try {
    if (!orgDoCaminho(req, res)) return;
    const [o] = await db.select({ id: organizations.id }).from(organizations).where(eq(organizations.id, req.params.id));
    if (!o) return res.status(404).json({ message: "Organização não encontrada." });
    res.json(await linkCurtoDoPerfil(o.id));
  } catch (err) {
    next(err);
  }
});

/** Cliques nos links do perfil (redes sociais e contato), últimos 30 dias. */
adminRouter.get("/organizacoes/:id/links/cliques", async (req, res, next) => {
  try {
    if (!orgDoCaminho(req, res)) return;
    res.json(await cliquesDosLinks(req.params.id));
  } catch (err) {
    next(err);
  }
});

/** Endereço curto da rifa — recorte da campanha antes (o do vizinho é 404). */
adminRouter.post("/campaigns/:id/link-curto", async (req, res, next) => {
  try {
    await assertCampaignInScope(req, req.params.id);
    res.json(await linkCurtoDaRifa(req.params.id));
  } catch (err) {
    next(err);
  }
});

adminRouter.delete("/demonstracao", async (req, res, next) => {
  try {
    requirePlatformAdmin(req);
    await removerDemonstracao();
    await audit(req, "demonstracao.remover", "organization", "demonstracao", {});
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

adminRouter.post("/organizacoes", async (req, res, next) => {
  try {
    requirePlatformAdmin(req);
    const criada = await createOrganization({
      name: String(req.body?.name ?? ""),
      cnpj: req.body?.cnpj ? String(req.body.cnpj) : undefined,
      contato: req.body?.contato ? String(req.body.contato) : undefined,
      observacao: req.body?.observacao ? String(req.body.observacao) : undefined,
    });
    await audit(req, "organizacao.create", "organization", criada.id, {
      name: criada.name,
    });
    res.status(201).json(criada);
  } catch (err) {
    next(err);
  }
});

/**
 * Editar a organização.
 *
 * O organizador edita a **dele** — é isto que o bilhete imprime como
 * administradora da rifa. Ligar e desligar é da plataforma: organização
 * desligada é cliente suspenso, não decisão de quem foi suspenso.
 */
adminRouter.patch("/organizacoes/:id", async (req, res, next) => {
  try {
    const org = orgOf(req);
    if (org && org !== req.params.id) {
      return res.status(404).json({ message: "Organização não encontrada." });
    }
    if (req.body?.active !== undefined) requirePlatformAdmin(req);
    // A carteira decide para onde vai o dinheiro das vendas: só a plataforma
    // cadastra. Organizador trocando a própria carteira seria o caminho mais
    // curto de uma sessão roubada até o caixa.
    if (req.body?.asaasWalletId !== undefined) requirePlatformAdmin(req);

    const alterada = await updateOrganization(req.params.id, {
      name: req.body?.name,
      cnpj: req.body?.cnpj,
      contato: req.body?.contato,
      observacao: req.body?.observacao,
      active: req.body?.active,
      asaasWalletId: req.body?.asaasWalletId,
      liberacaoComissao: req.body?.liberacaoComissao,
      prazoEstornoDias:
        req.body?.prazoEstornoDias !== undefined ? Number(req.body.prazoEstornoDias) : undefined,
      avisoTelefone:
        req.body?.avisoTelefone !== undefined ? String(req.body.avisoTelefone ?? "") : undefined,
    });
    await audit(req, "organizacao.update", "organization", alterada.id, req.body);
    res.json(alterada);
  } catch (err) {
    next(err);
  }
});

/**
 * Endereço da organização, inteiro de uma vez. O organizador grava o da
 * dele; o do vizinho é 404, como toda rota com id de organização.
 */
adminRouter.put("/organizacoes/:id/endereco", async (req, res, next) => {
  try {
    const org = orgOf(req);
    if (org && org !== req.params.id) {
      return res.status(404).json({ message: "Organização não encontrada." });
    }
    const endereco = await salvarEndereco(req.params.id, req.body);
    await audit(req, "organizacao.endereco", "organization", req.params.id, endereco);
    res.json(endereco);
  } catch (err) {
    next(err);
  }
});

/**
 * Foto, capa, bio, cor de destaque e links do perfil público (o white label
 * do organizador). Mesmo recorte do endereço: o organizador
 * edita o dele; o do vizinho é 404. O corpo pode ser grande (foto em base64):
 * a rota está na lista de 8 MB do `server/index.ts`.
 */
adminRouter.put(
  "/organizacoes/:id/perfil",
  async (req, res, next) => {
    try {
      const org = orgOf(req);
      if (org && org !== req.params.id) {
        return res.status(404).json({ message: "Organização não encontrada." });
      }
      const b = req.body ?? {};
      await salvarPerfil(req.params.id, {
        bio: b.bio,
        foto: b.foto,
        capa: b.capa,
        destaque: b.destaque,
        links: b.links,
      });
      // Bio pedindo pagamento por fora vira denúncia automática (não barra).
      if (typeof b.bio === "string") {
        emSegundoPlano(varrerTextoDoOrganizador({ organizationId: req.params.id, onde: "bio do perfil", texto: b.bio }), "varredura");
      }
      const imagem = (v: unknown) => (v === null ? "removida" : v ? "trocada" : "igual");
      await audit(req, "organizacao.perfil", "organization", req.params.id, {
        bio: b.bio !== undefined,
        foto: imagem(b.foto),
        capa: imagem(b.capa),
        destaque: b.destaque !== undefined ? b.destaque : "igual",
        links: Array.isArray(b.links) ? b.links.length : "igual",
      });
      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  },
);

/** Cria o acesso de organizador dentro de uma organização. */
adminRouter.post("/organizacoes/:id/acessos", async (req, res, next) => {
  try {
    requirePlatformAdmin(req);
    const { name, email, password } = req.body ?? {};
    if (!name || !email || !password) {
      return res.status(400).json({ message: "Nome, e-mail e senha são obrigatórios." });
    }
    const invalida = senhaInvalida(String(password), "organizer");
    if (invalida) return res.status(400).json({ message: invalida });

    const [org] = await db
      .select({ archivedAt: organizations.archivedAt })
      .from(organizations)
      .where(eq(organizations.id, req.params.id));
    if (!org) return res.status(404).json({ message: "Organização não encontrada." });
    if (org.archivedAt) {
      return res
        .status(409)
        .json({ message: "Organização arquivada: restaure antes de criar acesso." });
    }

    let criado: { id: string; email: string; name: string };
    try {
      [criado] = await db
        .insert(users)
        .values({
          role: "organizer",
          organizationId: req.params.id,
          name: String(name).trim(),
          email: String(email).toLowerCase().trim(),
          passwordHash: await hashPassword(String(password)),
        })
        .returning({ id: users.id, email: users.email, name: users.name });
    } catch (err) {
      // Quem decide se o e-mail está livre é o índice, não uma consulta antes.
      if (isUniqueViolation(err, "uq_users_email")) {
        return res.status(409).json({ message: "Já existe um acesso com este e-mail." });
      }
      throw err;
    }

    await audit(req, "organizacao.acesso", "organization", req.params.id, {
      email: criado.email,
    });
    res.status(201).json(criado);
  } catch (err) {
    next(err);
  }
});

/**
 * Arquivar exige senha E código do autenticador, como desligar o segundo
 * fator: a sessão aberta sozinha não tira um cliente da carteira. Quem não
 * ligou o segundo fator é mandado ligar — não há caminho sem ele.
 */
adminRouter.post("/organizacoes/:id/arquivar", async (req, res, next) => {
  try {
    requirePlatformAdmin(req);
    const [eu] = await db.select().from(users).where(eq(users.id, req.user!.id));
    if (!eu.totpSecret) {
      return res.status(409).json({
        message: "Ative o segundo fator (em Configurações) para poder arquivar organizações.",
        code: "totp_required",
      });
    }
    if (!(await verifyPassword(String(req.body?.password ?? ""), eu.passwordHash))) {
      return res.status(401).json({ message: "Senha incorreta." });
    }
    if (!codigoConfere(eu.totpSecret, String(req.body?.code ?? ""))) {
      return res.status(401).json({ message: "Código do autenticador incorreto." });
    }

    const arquivada = await archiveOrganization(req.params.id);
    await audit(req, "organizacao.arquivar", "organization", arquivada.id, {
      name: arquivada.name,
    });
    res.json(arquivada);
  } catch (err) {
    next(err);
  }
});

/** Volta para a carteira suspensa. Reativar é outra decisão, outro clique. */
adminRouter.post("/organizacoes/:id/restaurar", async (req, res, next) => {
  try {
    requirePlatformAdmin(req);
    const restaurada = await restoreOrganization(req.params.id);
    await audit(req, "organizacao.restaurar", "organization", restaurada.id, {
      name: restaurada.name,
    });
    res.json(restaurada);
  } catch (err) {
    next(err);
  }
});

/* ---------------- pagamentos e estorno ---------------- */

/**
 * Provedor do Pix e estorno pelo painel: decisões da plataforma, valem para
 * todas as organizações.
 */
adminRouter.get("/plataforma", async (req, res, next) => {
  try {
    requirePlatformAdmin(req);
    const config = await getPlataforma();
    const base = publicUrl("");
    res.json({
      ...config,
      // O que está gerando Pix agora: a escolha do painel ou, sem ela, a
      // variável do servidor.
      provedorEmUso: config.provedorPix ?? process.env.PAYMENT_PROVIDER ?? "dev",
      provedores: PROVEDORES_PIX.map((p) => ({
        id: p,
        nome: NOME_PROVEDOR[p],
        faltando: CREDENCIAIS_PROVEDOR[p].filter((v) => !process.env[v]),
        exigeCpf: EXIGE_CPF[p],
        webhook: `${base.replace(/\/$/, "")}/api/webhooks/${p}`,
      })),
    });
  } catch (err) {
    next(err);
  }
});

/** O topo do app: estilo e cor do aviso no trevo e os interruptores (publicação do apostador, Reels). Só a plataforma. */
adminRouter.put("/app", async (req, res, next) => {
  try {
    requirePlatformAdmin(req);
    const salva = await setPlataforma({
      avisoDoTrevo: req.body?.avisoDoTrevo,
      publicarApostador: typeof req.body?.publicarApostador === "boolean" ? req.body.publicarApostador : undefined,
      reelsLigado: typeof req.body?.reelsLigado === "boolean" ? req.body.reelsLigado : undefined,
      mensagensLigado: typeof req.body?.mensagensLigado === "boolean" ? req.body.mensagensLigado : undefined,
      buscarLigado: typeof req.body?.buscarLigado === "boolean" ? req.body.buscarLigado : undefined,
      buscarTipos: req.body?.buscarTipos && typeof req.body.buscarTipos === "object" ? validarConfigBusca(req.body.buscarTipos) : undefined,
      fundoDaConversaPct: req.body?.fundoDaConversaPct !== undefined ? validarFundoDaConversa(req.body.fundoDaConversaPct) : undefined,
    });
    const app = { avisoDoTrevo: salva.avisoDoTrevo, publicarApostador: salva.publicarApostador, reelsLigado: salva.reelsLigado, mensagensLigado: salva.mensagensLigado, buscarLigado: salva.buscarLigado, buscarTipos: salva.buscarTipos, fundoDaConversaPct: salva.fundoDaConversaPct };
    await audit(req, "plataforma.app", "settings", "plataforma", app);
    res.json(app);
  } catch (err) {
    next(err);
  }
});

/** As cores do selo de verificado (paleta de 12). Só a plataforma. */
adminRouter.put("/selos", async (req, res, next) => {
  try {
    requirePlatformAdmin(req);
    const salva = await setPlataforma({ coresDoSelo: req.body?.cores });
    await audit(req, "plataforma.selos", "settings", "plataforma", salva.coresDoSelo);
    res.json({ cores: salva.coresDoSelo });
  } catch (err) {
    next(err);
  }
});

adminRouter.put("/plataforma", async (req, res, next) => {
  try {
    requirePlatformAdmin(req);
    const salva = await setPlataforma({
      provedorPix: req.body?.provedorPix ?? null,
      estornoManual: req.body?.estornoManual === true,
      // Sem o campo, vale o que já estava — não volta ao padrão por omissão.
      taxaReembolsoPct:
        req.body?.taxaReembolsoPct !== undefined
          ? Number(req.body.taxaReembolsoPct)
          : (await getPlataforma()).taxaReembolsoPct,
      // Guarda da comissão (etapa 12): sem o campo, vale o que já estava.
      guardaComissao:
        req.body?.guardaComissao !== undefined
          ? req.body.guardaComissao === true
          : (await getPlataforma()).guardaComissao,
    });
    await audit(req, "plataforma.update", "settings", "plataforma", salva);
    res.json(salva);
  } catch (err) {
    next(err);
  }
});

/** A escolha do organizador: comissão na hora ou depois do sorteio. */
adminRouter.get("/comissao", async (req, res, next) => {
  try {
    const org = orgOf(req);
    if (!org) {
      return res.json({ liberacaoComissao: null, porOrganizacao: true });
    }
    const [linha] = await db
      .select({ liberacaoComissao: organizations.liberacaoComissao })
      .from(organizations)
      .where(eq(organizations.id, org));
    res.json({
      liberacaoComissao: linha?.liberacaoComissao ?? "apos_sorteio",
      porOrganizacao: false,
      // Com a guarda da plataforma, a comissão do afiliado online é dela e sai depois do sorteio.
      guardaDaPlataforma: (await getPlataforma()).guardaComissao,
    });
  } catch (err) {
    next(err);
  }
});

adminRouter.put("/comissao", async (req, res, next) => {
  try {
    const org = orgOf(req);
    if (!org) {
      return res
        .status(400)
        .json({ message: "Escolha por organização, na tela de Organizações." });
    }
    const alterada = await updateOrganization(org, {
      liberacaoComissao: String(req.body?.liberacaoComissao ?? ""),
    });
    await audit(req, "organizacao.comissao", "organization", org, {
      liberacaoComissao: alterada.liberacaoComissao,
    });
    res.json({ liberacaoComissao: alterada.liberacaoComissao });
  } catch (err) {
    next(err);
  }
});

/* ---------------- atendimento: chamados de reembolso ---------------- */

adminRouter.get("/chamados", async (req, res, next) => {
  try {
    res.json(await listarChamados(req, req.query.status ? String(req.query.status) : undefined));
  } catch (err) {
    next(err);
  }
});

/** O número ao lado de "Atendimento" no menu: chamados esperando alguém. */
adminRouter.get("/chamados/pendentes", async (req, res, next) => {
  try {
    // A plataforma também vê quantas disputas esperam a palavra final dela.
    // E os pedidos de mudança em rifa publicada, que só ela decide.
    res.json({
      total: await chamadosAbertos(req),
      disputas: orgOf(req) ? 0 : await disputasAbertas(),
      solicitacoes: orgOf(req) ? 0 : await solicitacoesEmAnalise(req),
      denuncias: orgOf(req) ? 0 : (await denunciasAbertas()) + (await conversasDenunciadasAbertas()),
      verificacoes: orgOf(req) ? 0 : await verificacoesPendentes(),
      // As peças de afiliado e apostador esperando a autorização da organização.
      // Só para ela: a plataforma não é quem autoriza no dia a dia.
      divulgacoes: orgOf(req) ? await pendentesDaOrganizacao(req) : 0,
    });
  } catch (err) {
    next(err);
  }
});

/* ---------------- avisos do painel (o sino) ---------------- */

adminRouter.get("/avisos", async (req, res, next) => {
  try {
    res.json(await avisosDoPainel(req));
  } catch (err) {
    next(err);
  }
});

adminRouter.post("/avisos/vistos", async (req, res, next) => {
  try {
    await marcarAvisosVistos(req);
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

adminRouter.get("/chamados/anexos/:id", async (req, res, next) => {
  try {
    const a = await anexoPara(req.params.id, { req });
    res.setHeader("Cache-Control", "private, no-store");
    res.type(a.mime).send(a.bytes);
  } catch (err) {
    next(err);
  }
});

adminRouter.get("/chamados/:id", async (req, res, next) => {
  try {
    res.json(await detalheDoChamado(req, req.params.id));
  } catch (err) {
    next(err);
  }
});

adminRouter.post("/chamados/:id/mensagens", async (req, res, next) => {
  try {
    await respostaDaOrganizacao(req, req.params.id, {
      texto: String(req.body?.texto ?? ""),
      anexo: req.body?.anexo ? String(req.body.anexo) : undefined,
    });
    res.status(201).json({ ok: true });
  } catch (err) {
    next(err);
  }
});

adminRouter.post("/chamados/:id/concluir", async (req, res, next) => {
  try {
    const feito = await concluirChamado(req, req.params.id, {
      decisao: req.body?.decisao,
      resposta: String(req.body?.resposta ?? ""),
    });
    await audit(req, `chamado.${feito.status}`, "chamado", feito.id, {
      protocolo: feito.protocolo,
      prazoEstornoAte: feito.prazoEstornoAte,
    });
    res.json(feito);
  } catch (err) {
    next(err);
  }
});

/** Palavra final da plataforma na disputa. Organização: 403 (a rota é da plataforma). */
adminRouter.post("/chamados/:id/disputa/decidir", async (req, res, next) => {
  try {
    requirePlatformAdmin(req);
    const feito = await decidirDisputa(req, req.params.id, {
      resultado: req.body?.resultado,
      decisao: String(req.body?.decisao ?? ""),
    });
    await audit(req, `chamado.disputa.${feito.disputa}`, "chamado", feito.id, {
      protocolo: feito.protocolo,
      status: feito.status,
      prazoEstornoAte: feito.prazoEstornoAte,
    });
    res.json(feito);
  } catch (err) {
    next(err);
  }
});

adminRouter.post("/chamados/:id/estornar", async (req, res, next) => {
  try {
    const { chamado, refund, devolverCents, taxaCents } = await executarEstorno(req, req.params.id);
    await audit(req, "chamado.estornado", "chamado", chamado.id, {
      protocolo: chamado.protocolo,
      forma: chamado.formaDevolucao,
      devolverCents,
      taxaCents,
      liberadas: refund?.liberadas.length ?? 0,
      comissaoJaPagaCents: refund?.comissaoJaPagaCents ?? 0,
    });
    res.json({
      protocolo: chamado.protocolo,
      forma: chamado.formaDevolucao,
      devolverCents,
      taxaCents,
      cotasLiberadas: refund?.liberadas.length ?? 0,
      cotasCongeladas: refund ? refund.liberadas.length === 0 : false,
      comissaoJaPagaCents: refund?.comissaoJaPagaCents ?? 0,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * Prazo de devolução e WhatsApp do aviso de chamado novo, da organização da
 * sessão (o administrador geral edita os dois em Organizações).
 */
adminRouter.get("/reembolso", async (req, res, next) => {
  try {
    const org = orgOf(req);
    if (!org) return res.json({ prazoEstornoDias: null, avisoTelefone: null, porOrganizacao: true });
    const [linha] = await db
      .select({ prazoEstornoDias: organizations.prazoEstornoDias, avisoTelefone: organizations.avisoTelefone })
      .from(organizations)
      .where(eq(organizations.id, org));
    res.json({
      prazoEstornoDias: linha?.prazoEstornoDias ?? 7,
      avisoTelefone: linha?.avisoTelefone ?? null,
      porOrganizacao: false,
    });
  } catch (err) {
    next(err);
  }
});

adminRouter.put("/reembolso", async (req, res, next) => {
  try {
    const org = orgOf(req);
    if (!org) {
      return res.status(400).json({ message: "Defina por organização, na tela de Organizações." });
    }
    const alterada = await updateOrganization(org, {
      prazoEstornoDias: Number(req.body?.prazoEstornoDias),
      avisoTelefone: req.body?.avisoTelefone !== undefined ? String(req.body.avisoTelefone ?? "") : undefined,
    });
    await audit(req, "organizacao.prazo_estorno", "organization", org, {
      prazoEstornoDias: alterada.prazoEstornoDias,
      avisoTelefone: alterada.avisoTelefone,
    });
    res.json({ prazoEstornoDias: alterada.prazoEstornoDias, avisoTelefone: alterada.avisoTelefone });
  } catch (err) {
    next(err);
  }
});

/* ---------------- WhatsApp ---------------- */

/**
 * A conta do WhatsApp é da plataforma: um número manda a mensagem de todas as
 * rifas. Por isso é só do administrador geral.
 */
adminRouter.get("/whatsapp", async (req, res, next) => {
  try {
    requirePlatformAdmin(req);
    res.json(await estadoWhatsApp());
  } catch (err) {
    next(err);
  }
});

adminRouter.post("/whatsapp/modelos", async (req, res, next) => {
  try {
    requirePlatformAdmin(req);
    const resultado = await criarModelosFaltantes();
    await audit(req, "whatsapp.modelos.criar", "whatsapp", undefined, resultado);
    res.json(resultado);
  } catch (err) {
    next(err);
  }
});

adminRouter.post("/whatsapp/teste", async (req, res, next) => {
  try {
    requirePlatformAdmin(req);
    const telefone = String(req.body?.telefone ?? "");
    const modelo = req.body?.modelo ? String(req.body.modelo) : undefined;
    await enviarTeste(telefone, modelo);
    await audit(req, "whatsapp.teste", "whatsapp", undefined, {
      modelo: modelo ?? "codigo_acesso",
      telefone: telefone.replace(/\d(?=\d{4})/g, "•"),
    });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

/* ---------------- usuários ---------------- */

/**
 * Todo mundo que entra no painel: organizador, afiliado, cambista — e, para
 * a plataforma, os administradores gerais também.
 *
 * O recorte é o de sempre: o organizador vê as pessoas da organização dele;
 * a plataforma vê todas e pode filtrar por uma. Hash de senha e segredo do
 * autenticador **nunca** saem daqui: a tela mostra só se o segundo fator
 * está ligado.
 */
adminRouter.get("/usuarios", async (req, res, next) => {
  try {
    const org = orgOf(req);
    // O filtro vem da barra de endereço: o que não for "plataforma" nem um
    // id válido é ignorado, em vez de virar erro de conversão no Postgres.
    const bruta = !org && req.query.organizacao ? String(req.query.organizacao) : null;
    const pedida =
      bruta === "plataforma" || (bruta && /^[0-9a-f-]{36}$/i.test(bruta)) ? bruta : null;
    const papel = req.query.papel ? String(req.query.papel) : null;
    const busca = req.query.q ? `%${String(req.query.q).trim().toLowerCase()}%` : null;

    const rows = await db.execute(sql`
      SELECT u.id, u.name, u.email, u.phone, u.role, u.active,
             (u.totp_secret IS NOT NULL) AS "doisFatores",
             u.created_at AS "createdAt",
             u.organization_id AS "organizationId",
             o.name AS "organizacao",
             (o.archived_at IS NOT NULL) AS "organizacaoArquivada",
             a.code AS "codigo", a.kind AS "tipo", a.status AS "cadastro",
             a.pix_key AS "pix", a.commission_pct AS "comissaoPct"
        FROM users u
        LEFT JOIN organizations o ON o.id = u.organization_id
        LEFT JOIN affiliates a ON a.user_id = u.id
       WHERE TRUE
         ${org ? sql`AND u.organization_id = ${org}::uuid` : sql``}
         ${pedida === "plataforma" ? sql`AND u.organization_id IS NULL` : sql``}
         ${pedida && pedida !== "plataforma" ? sql`AND u.organization_id = ${pedida}::uuid` : sql``}
         ${papel ? sql`AND u.role::text = ${papel}` : sql``}
         ${busca ? sql`AND (lower(u.name) LIKE ${busca} OR lower(u.email) LIKE ${busca} OR coalesce(u.phone, '') LIKE ${busca})` : sql``}
       ORDER BY u.created_at DESC
       LIMIT 500
    `);
    res.json(rows.rows);
  } catch (err) {
    next(err);
  }
});

/**
 * Confere que o usuário está no recorte de quem pede. Mesma regra de
 * campanha: fora do recorte, não existe (404). E administrador geral só é
 * alcançado pela plataforma.
 */
async function assertUserInScope(req: Request, userId: string) {
  const [alvo] = await db.select().from(users).where(eq(users.id, userId));
  const org = orgOf(req);
  if (!alvo || (org && alvo.organizationId !== org)) {
    throw new OrgScopeError("Usuário não encontrado.");
  }
  // A conta do afiliado é da plataforma, mesmo a do afiliado antigo que ainda
  // tem a organização no usuário: ele trabalha para várias. Redefinir a senha
  // dele daria a uma organização a conta — e os saques — que ele tem nas
  // outras. A organização decide o vínculo, em Afiliados.
  if (org && alvo.role === "affiliate") {
    throw new OrgScopeError(
      "A conta do afiliado é da plataforma. O vínculo com a sua organização você decide em Afiliados.",
      403,
    );
  }
  return alvo;
}

/**
 * Definir uma senha nova para alguém — o conserto de quando a pessoa esqueceu
 * ou quando o navegador preencheu a senha errada no cadastro. Quem define
 * vê a senha, então a pessoa deve trocá-la ao entrar.
 */
adminRouter.post("/usuarios/:id/senha", async (req, res, next) => {
  try {
    const alvo = await assertUserInScope(req, req.params.id);
    if (alvo.id === req.user!.id) {
      return res
        .status(400)
        .json({ message: "Para a sua própria senha, use \"Trocar minha senha\"." });
    }
    const senha = String(req.body?.password ?? "");
    const invalida = senhaInvalida(senha, alvo.role);
    if (invalida) return res.status(400).json({ message: invalida });

    await db
      .update(users)
      .set({ passwordHash: await hashPassword(senha) })
      .where(eq(users.id, alvo.id));
    // Senha redefinida é, quase sempre, suspeita de conta tomada: todas as
    // sessões da pessoa caem e ela entra de novo com a senha nova.
    await encerrarSessoesDoUsuario(alvo.id);
    await audit(req, "usuario.senha.redefinida", "user", alvo.id, { email: alvo.email });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

/** Ligar e desligar o acesso. Desligar não apaga: venda e comissão ficam. */
adminRouter.patch("/usuarios/:id", async (req, res, next) => {
  try {
    const alvo = await assertUserInScope(req, req.params.id);
    if (typeof req.body?.active !== "boolean") {
      return res.status(400).json({ message: "Informe se o acesso fica ativo." });
    }
    if (alvo.id === req.user!.id) {
      return res.status(400).json({ message: "Você não pode desligar o próprio acesso." });
    }
    await db.update(users).set({ active: req.body.active }).where(eq(users.id, alvo.id));
    await audit(req, req.body.active ? "usuario.ativar" : "usuario.desativar", "user", alvo.id, {
      email: alvo.email,
    });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

/* ---------------- estorno ---------------- */

/*
 * Estorno de pedido: não existe mais rota direta. O reembolso passa pelo
 * atendimento (chamado aberto pelo comprador logado, aprovado com protocolo)
 * — ver /chamados abaixo e `server/services/chamados.ts`.
 */

/* ---------------- cobrança da plataforma ---------------- */

/**
 * A carteira: quanto cada organização deve, e em que contrato está.
 */
adminRouter.get("/cobranca", async (req, res, next) => {
  try {
    requirePlatformAdmin(req);
    res.json({
      rotulos: BILLING_LABEL,
      carteira: await carteiraDaPlataforma(),
    });
  } catch (err) {
    next(err);
  }
});

/** Troca o contrato de uma organização: mensalidade OU comissão. */
adminRouter.put("/cobranca/:id/plano", async (req, res, next) => {
  try {
    requirePlatformAdmin(req);
    const plano = await setBillingPlan(req.params.id, req.body ?? {});
    await audit(req, "cobranca.plano", "organization", req.params.id, plano);
    res.json(plano);
  } catch (err) {
    next(err);
  }
});

/** Dá baixa no que está em aberto. */
adminRouter.post("/cobranca/:id/baixa", async (req, res, next) => {
  try {
    requirePlatformAdmin(req);
    const quantas = await darBaixa(req.params.id);
    await audit(req, "cobranca.baixa", "organization", req.params.id, { quantas });
    res.json({ baixadas: quantas });
  } catch (err) {
    next(err);
  }
});

/** Força o lançamento da mensalidade sem esperar o relógio. */
adminRouter.post("/cobranca/mensalidades", async (req, res, next) => {
  try {
    requirePlatformAdmin(req);
    const lancadas = await lancarMensalidades();
    await audit(req, "cobranca.mensalidades", "settings", "cobranca", { lancadas });
    res.json({ lancadas });
  } catch (err) {
    next(err);
  }
});

/**
 * O extrato de uma organização.
 *
 * O organizador vê o **dele**: o que deve à plataforma faz parte do caixa
 * dele, e esconder isso seria cobrar sem mostrar a conta.
 */
adminRouter.get("/cobranca/extrato", async (req, res, next) => {
  try {
    const org = orgOf(req);
    const pedida = req.query.organizacao ? String(req.query.organizacao) : null;

    // O parâmetro é conferido ANTES de cair no padrão. A versão anterior
    // ignorava a organização pedida e devolvia a própria — não vazava nada,
    // mas responder 200 a um pedido pelo extrato do vizinho faz parecer que
    // a leitura funcionou. Foi o `npm run isolation` que pegou isto.
    if (org && pedida && pedida !== org) {
      return res.status(404).json({ message: "Organização não encontrada." });
    }

    const alvo = org ?? pedida;
    if (!alvo) {
      return res.status(400).json({ message: "Escolha a organização." });
    }

    const { proximo, ...extrato } = await extratoDa(alvo, {
      limite: limiteDaPagina(req.query.limite),
      antes: lerCursor(req.query.antes),
    });
    if (proximo) res.setHeader("X-Proximo", proximo);
    res.json({
      plano: await planOfOrganization(alvo),
      rotulos: BILLING_LABEL,
      ...extrato,
    });
  } catch (err) {
    next(err);
  }
});

/* ---------------- antifraude ---------------- */

adminRouter.get("/antifraude", async (req, res, next) => {
  try {
    requirePlatformAdmin(req);
    res.json({
      limits: await getLimits(),
      resumo: await fraudSummary(),
      eventos: await listEvents(80),
      bloqueios: await listBlocks(),
    });
  } catch (err) {
    next(err);
  }
});

adminRouter.put("/antifraude/limites", async (req, res, next) => {
  try {
    requirePlatformAdmin(req);
    const saved = await setLimits(req.body ?? {});
    await audit(req, "antifraude.limites", "settings", "antifraude", saved);
    res.json(saved);
  } catch (err) {
    if (err instanceof Error && /mínimo|máximo/.test(err.message)) {
      return res.status(400).json({ message: err.message });
    }
    next(err);
  }
});

/**
 * Bloqueio manual. Telefone entra em dígitos; IP e aparelho entram já em
 * hash — o administrador copia o hash da lista de eventos, e assim o dado
 * cru nunca precisa transitar.
 */
adminRouter.post("/antifraude/bloqueios", async (req, res, next) => {
  try {
    requirePlatformAdmin(req);
    const kind = String(req.body?.kind) as "phone" | "device" | "ip";
    if (!["phone", "device", "ip"].includes(kind)) {
      return res.status(400).json({ message: "Tipo de bloqueio inválido." });
    }
    const bruto = String(req.body?.value ?? "").trim();
    if (bruto.length < 4) {
      return res.status(400).json({ message: "Informe o valor a bloquear." });
    }

    const value = kind === "phone" ? normalizePhone(bruto) : bruto;
    const created = await block({
      kind,
      value,
      reason: req.body?.reason ? String(req.body.reason) : undefined,
      expiresAt: req.body?.expiresAt ? new Date(req.body.expiresAt) : null,
    });

    await audit(req, "antifraude.bloqueio", "fraud_block", created.id, { kind });
    res.status(201).json(created);
  } catch (err) {
    next(err);
  }
});

adminRouter.delete("/antifraude/bloqueios/:id", async (req, res, next) => {
  try {
    requirePlatformAdmin(req);
    const removed = await unblock(req.params.id);
    if (!removed) return res.status(404).json({ message: "Bloqueio não encontrado." });
    await audit(req, "antifraude.desbloqueio", "fraud_block", removed.id);
    res.json({ removed: removed.id });
  } catch (err) {
    next(err);
  }
});

/* ---------------- meios de pagamento ---------------- */

adminRouter.get("/payment-methods", async (_req, res, next) => {
  try {
    res.json(await getPaymentMethods());
  } catch (err) {
    next(err);
  }
});

/**
 * Liga e desliga os meios de pagamento do app inteiro. Desligar o Pix online
 * deixa a rifa vendendo só pela mão do cambista — é uma escolha válida, e é
 * por isso que a regra exige apenas que sobre um meio ligado.
 */
adminRouter.put("/payment-methods", async (req, res, next) => {
  try {
    requirePlatformAdmin(req);
    const saved = await setPaymentMethods(req.body ?? {});
    await audit(req, "payment_methods.update", "settings", "meios_pagamento", saved);
    res.json(saved);
  } catch (err) {
    if (err instanceof Error && err.message.includes("ao menos um")) {
      return res.status(400).json({ message: err.message });
    }
    next(err);
  }
});

/* ---------------- financeiro ---------------- */

adminRouter.get("/finance", async (req, res, next) => {
  try {
    const org = orgOf(req);
    const pending = await db
      .select({
        affiliateId: commissions.affiliateId,
        code: affiliates.code,
        name: users.name,
        pixKey: affiliates.pixKey,
        pendingCents: sql<number>`coalesce(sum(${commissions.amountCents}) FILTER (WHERE ${commissions.status} = 'pending'), 0)::int`,
        availableCents: sql<number>`coalesce(sum(${commissions.amountCents}) FILTER (WHERE ${commissions.status} = 'available'), 0)::int`,
      })
      .from(commissions)
      .innerJoin(affiliates, eq(affiliates.id, commissions.affiliateId))
      .innerJoin(users, eq(users.id, affiliates.userId))
      .innerJoin(campaigns, eq(campaigns.id, commissions.campaignId))
      // O afiliado é de várias organizações: cada uma vê (e paga) só a
      // comissão das rifas dela — e a guardada pela plataforma não é dela.
      .where(org ? and(eq(campaigns.organizationId, org), eq(commissions.guardada, false)) : sql`TRUE`)
      .groupBy(commissions.affiliateId, affiliates.code, users.name, affiliates.pixKey);

    // O saque é pedido a uma organização (`payouts.organization_id`): sem o
    // recorte, o organizador veria (e pagaria) saque que não é dele.
    const requested = await db
      .select({ payout: payouts })
      .from(payouts)
      .where(
        and(
          eq(payouts.status, "requested"),
          org ? eq(payouts.organizationId, org) : sql`TRUE`,
        ),
      )
      .orderBy(desc(payouts.requestedAt));

    res.json({
      perAffiliate: pending,
      payoutsRequested: requested.map((r) => r.payout),
    });
  } catch (err) {
    next(err);
  }
});

/** Libera as comissões cuja carência já venceu. Roda sob demanda e no job. */
adminRouter.post("/finance/release", async (req, res, next) => {
  try {
    const org = orgOf(req);
    const released = await db
      .update(commissions)
      .set({ status: "available" })
      .where(
        and(
          eq(commissions.status, "pending"),
          sql`${commissions.availableAt} <= now()`,
          // Liberar comissão é liberar dinheiro. O organizador libera a dele.
          org
            ? sql`${commissions.campaignId} IN (
                SELECT id FROM campaigns WHERE organization_id = ${org}::uuid
              ) AND NOT ${commissions.guardada}`
            : sql`TRUE`,
        ),
      )
      .returning({ id: commissions.id });

    await audit(req, "commission.release", "commission", undefined, { count: released.length });
    res.json({ released: released.length });
  } catch (err) {
    next(err);
  }
});

/** O endereço do comprovante do saque, se for `https:` e de tamanho razoável; senão, nada. */
function comprovanteValido(bruto: unknown): string | null {
  if (typeof bruto !== "string" || bruto.length > 500) return null;
  try {
    const u = new URL(bruto.trim());
    return u.protocol === "https:" && !u.username && !u.password ? u.toString() : null;
  } catch {
    return null;
  }
}

/**
 * A nota fiscal do saque, para quem paga: a organização do saque (a do
 * vizinho é 404) ou a plataforma. A leitura vai à auditoria antes de sair.
 */
adminRouter.get("/payouts/:id/nota", async (req, res, next) => {
  try {
    const pid = String(req.params.id);
    const org = orgOf(req);
    const [saque] = /^[0-9a-f-]{36}$/i.test(pid)
      ? await db.select({ organizationId: payouts.organizationId }).from(payouts).where(eq(payouts.id, pid))
      : [];
    if (!saque || (org && saque.organizationId !== org)) return res.status(404).json({ message: "Saque não encontrado." });
    const n = await notaDoSaque(pid);
    await audit(req, "payout.nota.lida", "payout", pid);
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.type(n.mime).send(n.bytes);
  } catch (err) {
    if (err instanceof FiscalError) return res.status(err.status).json({ message: err.message });
    next(err);
  }
});

adminRouter.post("/payouts/:id/paid", async (req, res, next) => {
  try {
    const [saque] = await db
      .select({ affiliateId: payouts.affiliateId, organizationId: payouts.organizationId })
      .from(payouts)
      .where(eq(payouts.id, req.params.id));
    const org = orgOf(req);
    // Quem paga é a organização do saque — o do vizinho é 404.
    if (!saque || (org && saque.organizationId !== org)) {
      return res.status(404).json({ message: "Saque não encontrado." });
    }

    // Baixa e recibo na mesma transação; o `UPDATE` condicional impede dar
    // baixa duas vezes (e emitir dois recibos) em dois cliques.
    const feito = await db.transaction(async (tx) => {
      const [updated] = await tx
        .update(payouts)
        .set({
          status: "paid",
          processedAt: new Date(),
          // Endereço do comprovante: só `https:` (nunca `javascript:`), como os links do perfil.
          receiptUrl: comprovanteValido(req.body?.receiptUrl),
        })
        .where(and(eq(payouts.id, req.params.id), eq(payouts.status, "requested")))
        .returning();
      if (!updated) return null;
      const recibo = await emitirRecibo(tx, updated.id);
      return { ...updated, recibo };
    });
    if (!feito) return res.status(409).json({ message: "Este saque já foi pago." });

    await audit(req, "payout.paid", "payout", req.params.id, { recibo: feito.recibo });
    res.json(feito);
  } catch (err) {
    next(err);
  }
});

/* ---------------- aparência (construtor de templates) ---------------- */

/**
 * Só o administrador geral mexe na aparência da plataforma: é a tela de
 * todo mundo. Organizador recebe 403 (rota da plataforma, todos sabem que
 * existe) — o white label dele é outra coisa, no perfil.
 */
adminRouter.get("/template", async (req, res, next) => {
  try {
    requirePlatformAdmin(req);
    const [r, p, v] = await Promise.all([rascunhoDoTemplate(), templatePublicado(), versoesDoTemplate()]);
    res.json({ rascunho: r, publicado: p.template, versaoAtual: p.versao, versoes: v });
  } catch (err) {
    next(err);
  }
});

/** O rascunho, para a pré-visualização (`?previa=1`). Mesmo formato do público. */
adminRouter.get("/template/previa", async (req, res, next) => {
  try {
    requirePlatformAdmin(req);
    res.setHeader("Cache-Control", "no-store");
    res.json({ template: await rascunhoDoTemplate(), versao: "rascunho" });
  } catch (err) {
    next(err);
  }
});

adminRouter.put("/template/rascunho", async (req, res, next) => {
  try {
    requirePlatformAdmin(req);
    res.json(await salvarRascunho(req.body));
  } catch (err) {
    next(err);
  }
});

adminRouter.put("/template/logo", async (req, res, next) => {
  try {
    requirePlatformAdmin(req);
    res.json(await salvarLogo(req.body?.dataUrl));
  } catch (err) {
    next(err);
  }
});

adminRouter.put("/template/apoio", async (req, res, next) => {
  try {
    requirePlatformAdmin(req);
    res.status(201).json(await salvarApoio(req.body?.dataUrl));
  } catch (err) {
    next(err);
  }
});

/** Preenche o rascunho do rodapé com exemplo (redes, logos e texto). Não publica. */
adminRouter.post("/template/exemplo-rodape", async (req, res, next) => {
  try {
    requirePlatformAdmin(req);
    const { template, ids } = await preencherRodapeComExemplo();
    await audit(req, "template.exemplo_rodape", "template", "rascunho", { logosCriados: ids.length });
    res.json(template);
  } catch (err) {
    next(err);
  }
});

adminRouter.post("/template/publicar", async (req, res, next) => {
  try {
    requirePlatformAdmin(req);
    const v = await publicar(req.user!.id);
    await audit(req, "template.publicar", "template", v.id, {});
    res.status(201).json(v);
  } catch (err) {
    next(err);
  }
});

adminRouter.post("/template/versoes/:id/restaurar", async (req, res, next) => {
  try {
    requirePlatformAdmin(req);
    const v = await restaurar(req.params.id, req.user!.id);
    await audit(req, "template.restaurar", "template", v.id, { de: req.params.id });
    res.status(201).json(v);
  } catch (err) {
    next(err);
  }
});

/* ---------------- sorteio ---------------- */

adminRouter.get("/campaigns/:id/draw", async (req, res, next) => {
  try {
    await assertCampaignInScope(req, req.params.id);
    const [draw] = await db.select().from(draws).where(eq(draws.campaignId, req.params.id));
    if (!draw) return res.status(404).json({ message: "Campanha ainda não publicada." });
    // A semente só sai depois de executado o sorteio.
    const { seed, ...rest } = draw;
    res.json(draw.executedAt ? draw : rest);
  } catch (err) {
    next(err);
  }
});

/**
 * Executa o sorteio com o resultado oficial como entropia pública: os 5
 * prêmios da Federal digitados aqui ou, na rifa integrada a um sorteio
 * oficial, o resultado que a plataforma lançou (o corpo é ignorado). O hash
 * da semente já estava publicado desde antes da 1ª venda. A conta, as
 * travas e as recusas moram em `executarSorteio()` (services/sortear.ts).
 */
adminRouter.post("/campaigns/:id/draw", async (req, res, next) => {
  try {
    await assertCampaignInScope(req, req.params.id);
    const [campaign] = await db
      .select({ id: campaigns.id, status: campaigns.status, sorteioOficialId: campaigns.sorteioOficialId })
      .from(campaigns)
      .where(eq(campaigns.id, req.params.id));
    if (!campaign) return res.status(404).json({ message: "Campanha não encontrada." });
    if (campaign.status === "drawn") {
      return res.status(409).json({ message: "Esta campanha já foi sorteada." });
    }
    const resultado = await resultadoParaARifa(campaign, req.body ?? {});
    const feito = await executarSorteio(
      campaign.id,
      resultado,
      { id: req.user?.id, role: req.user?.role, ip: req.ip },
      req.body?.evidenceUrl ? String(req.body.evidenceUrl).slice(0, 500) : null,
    );
    res.json(feito);
  } catch (err) {
    if (err instanceof SorteioRecusado) {
      return res.status((err as { status?: number }).status ?? 409).json({ message: err.message });
    }
    next(err);
  }
});

/* ---------------- segundo fator ---------------- */

adminRouter.get("/2fa", async (req, res, next) => {
  try {
    const [user] = await db.select().from(users).where(eq(users.id, req.user!.id));
    res.json({ enabled: Boolean(user.totpSecret) });
  } catch (err) {
    next(err);
  }
});

/**
 * Gera um segredo e devolve a URL do QR. O segredo só é gravado depois que o
 * administrador prova que o aplicativo dele já está gerando o código certo —
 * gravar antes tranca a conta de quem desistiu no meio.
 */
adminRouter.post("/2fa/setup", async (req, res, next) => {
  try {
    const [user] = await db.select().from(users).where(eq(users.id, req.user!.id));
    if (user.totpSecret) {
      return res.status(409).json({ message: "O segundo fator já está ativo." });
    }
    const secret = generateSecret();
    // Na sessão (que mora no banco) também vai selado.
    req.session.pendingTotpSecret = guardarSegredo(secret);
    const otpauth = otpauthUrl({ secret, account: user.email });
    res.json({
      secret,
      otpauth,
      // Ler 32 caracteres à mão é onde as pessoas erram: o QR resolve.
      qr: await QRCode.toDataURL(otpauth, { margin: 1, width: 240 }),
    });
  } catch (err) {
    next(err);
  }
});

adminRouter.post("/2fa/enable", async (req, res, next) => {
  try {
    const pendente = req.session.pendingTotpSecret;
    if (!pendente) {
      return res.status(409).json({ message: "Comece de novo: gere o QR Code." });
    }
    if (!codigoConfere(pendente, String(req.body?.code ?? ""))) {
      return res.status(401).json({ message: "Código incorreto. Confira o aplicativo." });
    }

    await db.update(users).set({ totpSecret: pendente }).where(eq(users.id, req.user!.id));
    delete req.session.pendingTotpSecret;
    await audit(req, "admin.2fa.enable", "user", req.user!.id);
    res.json({ enabled: true });
  } catch (err) {
    next(err);
  }
});

/** Desligar exige senha E código: quem roubou a sessão não desarma sozinho. */
adminRouter.post("/2fa/disable", async (req, res, next) => {
  try {
    const [user] = await db.select().from(users).where(eq(users.id, req.user!.id));
    if (!user.totpSecret) return res.json({ enabled: false });

    const password = String(req.body?.password ?? "");
    if (!(await verifyPassword(password, user.passwordHash))) {
      return res.status(401).json({ message: "Senha incorreta." });
    }
    if (!codigoConfere(user.totpSecret, String(req.body?.code ?? ""))) {
      return res.status(401).json({ message: "Código incorreto." });
    }

    await db.update(users).set({ totpSecret: null }).where(eq(users.id, req.user!.id));
    await audit(req, "admin.2fa.disable", "user", req.user!.id);
    res.json({ enabled: false });
  } catch (err) {
    next(err);
  }
});

adminRouter.get("/audit", async (req, res, next) => {
  try {
    // A trilha guarda ação de todo mundo, inclusive de outras organizações.
    // Recortar por organização daria falsa completude; melhor não entregar.
    requirePlatformAdmin(req);
    res.json(
      await db.select().from(auditLog).orderBy(desc(auditLog.createdAt)).limit(200),
    );
  } catch (err) {
    next(err);
  }
});

/* ---------------- vitrine: banners da plataforma ---------------- */

/**
 * Banners do topo da vitrine. Só o administrador geral — organizador recebe
 * 403 (rota da plataforma). O corpo leva a imagem em base64: as rotas estão
 * na lista de 8 MB do `server/index.ts`.
 */
/* ---------------- sorteios oficiais (calendário da plataforma) ---------------- */

// O calendário: a plataforma vê tudo; a organização, o que aceita rifa e as dela.
adminRouter.get("/sorteios-oficiais", async (req, res, next) => {
  try {
    res.json(await calendario(orgOf(req)));
  } catch (err) {
    next(err);
  }
});

// Os métodos de apuração: a organização lê (para escolher nos dados legais);
// liberar e desligar é só da plataforma.
adminRouter.get("/apuracao/metodos", async (_req, res, next) => {
  try {
    res.json({ liberados: (await getPlataforma()).metodosDeApuracao });
  } catch (err) {
    next(err);
  }
});

adminRouter.put("/apuracao/metodos", async (req, res, next) => {
  try {
    requirePlatformAdmin(req);
    const liberados = validarMetodosLiberados(req.body?.liberados);
    const salva = await setPlataforma({ metodosDeApuracao: liberados });
    await audit(req, "apuracao.metodos", "plataforma", undefined, { liberados: salva.metodosDeApuracao });
    res.json({ liberados: salva.metodosDeApuracao });
  } catch (err) {
    next(err);
  }
});

// O canal oficial do YouTube de cada loteria: só a plataforma (é a tela de todo apostador).
adminRouter.get("/sorteios-oficiais/canais", async (req, res, next) => {
  try {
    requirePlatformAdmin(req);
    res.json({ canais: (await getPlataforma()).canaisDasLoterias });
  } catch (err) {
    next(err);
  }
});

adminRouter.put("/sorteios-oficiais/canais", async (req, res, next) => {
  try {
    requirePlatformAdmin(req);
    const canais = validarCanaisDasLoterias(req.body?.canais);
    const salva = await setPlataforma({ canaisDasLoterias: canais });
    await audit(req, "sorteio_oficial.canais", "plataforma", undefined, { canais: salva.canaisDasLoterias });
    res.json({ canais: salva.canaisDasLoterias });
  } catch (err) {
    next(err);
  }
});

adminRouter.post("/sorteios-oficiais", async (req, res, next) => {
  try {
    requirePlatformAdmin(req);
    const novo = await criarSorteioOficial(req.body, req.user?.id);
    await audit(req, "sorteio_oficial.criar", "sorteio_oficial", novo.id, {
      loteria: novo.loteria,
      concurso: novo.concurso,
      sorteioEm: novo.sorteioEm,
    });
    res.status(201).json(novo);
  } catch (err) {
    next(err);
  }
});

adminRouter.patch("/sorteios-oficiais/:id", async (req, res, next) => {
  try {
    requirePlatformAdmin(req);
    const s = await editarSorteioOficial(req.params.id, req.body);
    await audit(req, "sorteio_oficial.editar", "sorteio_oficial", s.id, {
      loteria: s.loteria,
      concurso: s.concurso,
      sorteioEm: s.sorteioEm,
      titulo: s.titulo,
      transmissaoUrl: s.transmissaoUrl,
    });
    res.json(s);
  } catch (err) {
    next(err);
  }
});

adminRouter.post("/sorteios-oficiais/:id/cancelar", async (req, res, next) => {
  try {
    requirePlatformAdmin(req);
    const s = await cancelarSorteioOficial(req.params.id);
    await audit(req, "sorteio_oficial.cancelar", "sorteio_oficial", s.id);
    res.json(s);
  } catch (err) {
    next(err);
  }
});

// O resultado oficial da Caixa, uma vez só e só depois da hora do sorteio.
// Gravado o resultado, cada rifa publicada integrada a ele sorteia sozinha;
// a que não pode agora guarda o motivo e o relógio tenta de novo.
adminRouter.post("/sorteios-oficiais/:id/resultado", async (req, res, next) => {
  try {
    requirePlatformAdmin(req);
    const s = await lancarResultado(req.params.id, req.body?.numeros, req.body?.ata);
    await audit(req, "sorteio_oficial.resultado", "sorteio_oficial", s.id, { resultado: s.resultado });
    // O resultado já está gravado: falha aqui não vira 500 (o segundo clique
    // daria 409 sem ninguém saber que gravou) — o relógio sorteia as rifas.
    const rifas = await sortearRifasDoSorteioOficial(s.id).catch((e) => {
      console.error("[sorteio oficial] sortear as rifas:", e);
      return { sorteadas: 0, esperando: 0, falhou: true };
    });
    res.json({ ...s, rifas });
  } catch (err) {
    next(err);
  }
});

// O arquivo da ata notarial da sessão do globo (PDF ou foto do cartório): só a
// plataforma anexa, depois do resultado. O público baixa pela rota pública.
adminRouter.put("/sorteios-oficiais/:id/ata", async (req, res, next) => {
  try {
    requirePlatformAdmin(req);
    const r = await salvarArquivoDaAta(req.params.id, req.body?.arquivo, req.body?.nome);
    await audit(req, "sorteio_oficial.ata", "sorteio_oficial", req.params.id, r);
    res.json(r);
  } catch (err) {
    next(err);
  }
});

// 9.5: no globo não há aproximação. A rifa cujo número não foi distribuído
// recebe nova extração no mesmo ato — só a plataforma registra; a rifa tenta
// sortear com ela na hora. A auditoria vai na transação do serviço.
adminRouter.post("/sorteios-oficiais/:id/rifas/:campaignId/extracoes", async (req, res, next) => {
  try {
    requirePlatformAdmin(req);
    if (!/^[0-9a-f-]{36}$/i.test(req.params.id) || !/^[0-9a-f-]{36}$/i.test(req.params.campaignId)) {
      return res.status(404).json({ message: "Não encontrado." });
    }
    const r = await registrarNovaExtracao(req.params.id, req.params.campaignId, req.body ?? {}, {
      id: req.user?.id,
      role: req.user?.role,
      ip: req.ip,
    });
    res.status(201).json(r);
  } catch (err) {
    if (err instanceof SorteioRecusado) {
      return res.status((err as { status?: number }).status ?? 409).json({ message: err.message });
    }
    next(err);
  }
});

// Integrar a rifa (em rascunho) num sorteio oficial do calendário, ou tirar (null).
adminRouter.put("/campaigns/:id/sorteio-oficial", async (req, res, next) => {
  try {
    const c = await assertCampaignInScope(req, req.params.id);
    const id = req.body?.sorteioOficialId;
    if (id !== null && (typeof id !== "string" || !/^[0-9a-f-]{36}$/i.test(id))) {
      return res.status(400).json({ message: "Escolha um sorteio do calendário." });
    }
    const r = await integrarAoSorteioOficial(c, id);
    await audit(req, "campaign.sorteio_oficial", "campaign", c.id, { sorteioOficialId: id });
    res.json({ id: r.id, sorteioOficialId: r.sorteioOficialId, drawAt: r.drawAt });
  } catch (err) {
    next(err);
  }
});

adminRouter.get("/banners", async (req, res, next) => {
  try {
    requirePlatformAdmin(req);
    res.json(await listarBanners());
  } catch (err) {
    next(err);
  }
});

adminRouter.post("/banners", async (req, res, next) => {
  try {
    requirePlatformAdmin(req);
    const novo = await criarBanner(req.body ?? {});
    await audit(req, "banner.criar", "banner", novo.id, { titulo: novo.titulo, link: novo.link });
    res.status(201).json(novo);
  } catch (err) {
    next(err);
  }
});

adminRouter.put("/banners/ordem", async (req, res, next) => {
  try {
    requirePlatformAdmin(req);
    const lista = await ordenarBanners(req.body?.ids);
    await audit(req, "banner.ordem", "banner", undefined, { ids: req.body?.ids });
    res.json(lista);
  } catch (err) {
    next(err);
  }
});

adminRouter.patch("/banners/:id", async (req, res, next) => {
  try {
    requirePlatformAdmin(req);
    const feito = await alterarBanner(req.params.id, req.body ?? {});
    const { imagem, ...resto } = req.body ?? {};
    await audit(req, "banner.alterar", "banner", req.params.id, { ...resto, imagem: imagem ? "trocada" : undefined });
    res.json(feito);
  } catch (err) {
    next(err);
  }
});

adminRouter.delete("/banners/:id", async (req, res, next) => {
  try {
    requirePlatformAdmin(req);
    await apagarBanner(req.params.id);
    await audit(req, "banner.apagar", "banner", req.params.id);
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

/* ---------------- vitrine: stories ---------------- */

/**
 * Stories da organização. Recorte de sempre: o organizador vê e posta os
 * dele; o administrador geral vê todos e, para postar, diz de qual
 * organização. Apagar confere o dono **antes** do `DELETE` — o do vizinho é
 * 404.
 */
adminRouter.get("/stories", async (req, res, next) => {
  try {
    res.json(await storiesDaOrganizacao(orgOf(req)));
  } catch (err) {
    next(err);
  }
});

adminRouter.post("/stories", async (req, res, next) => {
  try {
    const org = orgOf(req) ?? (typeof req.body?.organizacaoId === "string" ? req.body.organizacaoId : null);
    if (!org) return res.status(400).json({ message: "Diga de qual organização é o story." });
    const novo = await postarStory(org, {
      imagem: req.body?.imagem,
      video: req.body?.video,
      legenda: req.body?.legenda,
      campaignId: req.body?.campaignId,
      publicaEm: req.body?.publicaEm,
      enquete: req.body?.enquete,
      figurinhas: req.body?.figurinhas,
    });
    await audit(req, "story.postar", "story", novo.id, {
      organizacao: org,
      rifa: req.body?.campaignId ?? null,
      publicaEm: novo.publicaEm,
      enquete: Boolean(req.body?.enquete),
      figurinhas: novo.figurinhas.map((f) => f.tipo),
    });
    if (typeof req.body?.legenda === "string") {
      emSegundoPlano(varrerTextoDoOrganizador({ organizationId: org, onde: "legenda de story", texto: req.body.legenda }), "varredura");
    }
    // A enquete é texto da organização na tela de todo apostador: a mesma varredura do Pix por fora.
    const enquete = req.body?.enquete as { pergunta?: unknown; opcoes?: unknown } | undefined;
    if (enquete && typeof enquete.pergunta === "string") {
      const texto = [enquete.pergunta, ...(Array.isArray(enquete.opcoes) ? enquete.opcoes.filter((o): o is string => typeof o === "string") : [])].join(" · ");
      emSegundoPlano(varrerTextoDoOrganizador({ organizationId: org, onde: "enquete de story", texto }), "varredura");
    }
    // O texto da figurinha também: já passou pela régua (sem link e sem telefone).
    const textos = novo.figurinhas.flatMap((f) => (f.tipo === "texto" ? [f.texto] : []));
    if (textos.length) {
      emSegundoPlano(varrerTextoDoOrganizador({ organizationId: org, onde: "figurinha de story", texto: textos.join(" · ") }), "varredura");
    }
    res.status(201).json({ id: novo.id, publicaEm: novo.publicaEm });
  } catch (err) {
    next(err);
  }
});

/**
 * A peça do story para o painel (o agendado inclusive). O recorte vem antes:
 * o do vizinho é 404. Nunca em cache compartilhado.
 */
adminRouter.get("/stories/:id/:qual(imagem|poster)", async (req, res, next) => {
  try {
    const dono = await donoDoStory(req.params.id);
    const org = orgOf(req);
    if (!dono || (org && dono !== org)) return res.status(404).json({ message: "Story não encontrado." });
    const a = await arquivoDoStoryNoPainel(req.params.id, req.params.qual as "imagem" | "poster");
    if (!a) return res.status(404).json({ message: "Story não encontrado." });
    res.setHeader("Cache-Control", "private, no-store");
    enviarComFaixa(req, res, a.bytes, a.mime);
  } catch (err) {
    next(err);
  }
});

adminRouter.delete("/stories/:id", async (req, res, next) => {
  try {
    const dono = await donoDoStory(req.params.id);
    const org = orgOf(req);
    if (!dono || (org && dono !== org)) return res.status(404).json({ message: "Story não encontrado." });
    await apagarStory(req.params.id);
    await audit(req, "story.apagar", "story", req.params.id);
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

/* ---------------- resultados ---------------- */

/**
 * Painel de resultados. O organizador vê a própria organização (o
 * `?organizacao=` dele é ignorado — o recorte é da sessão); o administrador
 * geral vê a plataforma toda ou escolhe uma organização.
 */
adminRouter.get("/resultados", async (req, res, next) => {
  try {
    const daSessao = orgOf(req);
    const escolhida =
      !daSessao && typeof req.query.organizacao === "string" && /^[0-9a-f-]{36}$/i.test(req.query.organizacao)
        ? req.query.organizacao
        : null;
    res.json(await resultadosDoPainel(daSessao ?? escolhida, validarPeriodo(req.query.dias)));
  } catch (err) {
    next(err);
  }
});

/* ---------------- foto do ganhador ---------------- */

/**
 * Foto do ganhador, depois do sorteio (`null` tira). Recorte da campanha
 * antes de tudo: a do vizinho é 404. Corpo grande (base64): está na lista
 * de 8 MB do `server/index.ts`.
 */
adminRouter.put("/campaigns/:id/foto-ganhador", async (req, res, next) => {
  try {
    await assertCampaignInScope(req, req.params.id);
    await salvarFotoDoGanhador(req.params.id, req.body?.foto);
    await audit(req, "campanha.foto_ganhador", "campaign", req.params.id, {
      foto: req.body?.foto === null ? "removida" : "trocada",
    });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

/* ---------------- termo de adesão de afiliado ---------------- */

/** A organização do pedido: a da sessão; a plataforma diz qual. */
function organizacaoDoPedido(req: Request): string | null {
  const org = orgOf(req);
  if (org) return org;
  const pedida = req.query.organizacao ?? req.body?.organizacaoId;
  return typeof pedida === "string" && /^[0-9a-f-]{36}$/i.test(pedida) ? pedida : null;
}

adminRouter.get("/termo-afiliado", async (req, res, next) => {
  try {
    const org = organizacaoDoPedido(req);
    if (!org) return res.status(400).json({ message: "Escolha a organização." });
    res.json(await termoDoPainel(org));
  } catch (err) {
    next(err);
  }
});

/**
 * Publica uma versão nova do termo. Não edita a anterior: rifa já publicada
 * segue com a versão dela até o sorteio.
 */
adminRouter.post("/termo-afiliado", async (req, res, next) => {
  try {
    const org = organizacaoDoPedido(req);
    if (!org) return res.status(400).json({ message: "Escolha a organização." });
    const termo = await publicarTermo(org, req.body, req.user?.id ?? null);
    await audit(req, "afiliado.termo", "organization", org, { versao: termo.versao, comissaoPct: termo.comissaoPct });
    res.status(201).json(termo);
  } catch (err) {
    next(err);
  }
});

/* ---------------- contrato da plataforma com a promotora ---------------- */

/** Os "Dados da empresa" do template publicado — os mesmos dos Termos de uso. */
async function dadosDaEmpresaPublicados() {
  const { template } = await templatePublicado();
  return { ...EMPRESA_VAZIA, ...(template.legal ?? {}) };
}

/** A organização vê a versão em vigor e o aceite dela; a plataforma, as versões e quantas aceitaram. */
adminRouter.get("/contrato-promotora", async (req, res, next) => {
  try {
    const org = orgOf(req);
    res.set("Cache-Control", "no-store");
    if (org) {
      res.json({ ...(await contratoDaOrganizacao(org)), anexos: await anexosDaOrganizacao(org) });
    } else {
      const empresa = await dadosDaEmpresaPublicados();
      res.json({ ...(await contratoDaPlataforma(empresa)), anexos: await anexosDaPlataforma(empresa) });
    }
  } catch (err) {
    next(err);
  }
});

/** Versão nova do contrato. Só a plataforma (403 para organizador, no `npm run isolation`). */
adminRouter.post("/contrato-promotora", async (req, res, next) => {
  try {
    requirePlatformAdmin(req);
    const c = await publicarContrato(req.body, req.user?.id ?? null, await dadosDaEmpresaPublicados());
    await audit(req, "contrato_promotora.publicar", "contrato_promotora", undefined, { versao: c.versao });
    res.status(201).json(c);
  } catch (err) {
    next(err);
  }
});

/** Prévia: o texto com os campos preenchidos e o que falta. Só a plataforma (403 no `npm run isolation`). */
adminRouter.post("/contrato-promotora/previa", async (req, res, next) => {
  try {
    requirePlatformAdmin(req);
    res.set("Cache-Control", "no-store");
    res.json(previaDoContrato(req.body, await dadosDaEmpresaPublicados()));
  } catch (err) {
    next(err);
  }
});

/** O aceite é da organização da sessão; a plataforma publica, não aceita. */
adminRouter.post("/contrato-promotora/aceite", async (req, res, next) => {
  try {
    const org = orgOf(req);
    if (!org) return res.status(403).json({ message: "Quem aceita o contrato é a organização." });
    const r = await aceitarContrato(org, req.user!.id, { versao: req.body?.versao, identidade: identify(req) });
    if (r.novo) await audit(req, "contrato_promotora.aceite", "organization", org, { versao: r.versao });
    res.json(r);
  } catch (err) {
    next(err);
  }
});

/* ---------------- anexos do contrato por modalidade (cláusula 7) ---------------- */

/** Versão nova do anexo de uma modalidade. Só a plataforma (403 no `npm run isolation`). */
adminRouter.post("/contrato-promotora/anexos", async (req, res, next) => {
  try {
    requirePlatformAdmin(req);
    const a = await publicarAnexo(req.body, req.user?.id ?? null, await dadosDaEmpresaPublicados());
    await audit(req, "contrato_promotora.anexo.publicar", "contrato_promotora", undefined, { modalidade: a.modalidade, versao: a.versao });
    res.status(201).json(a);
  } catch (err) {
    next(err);
  }
});

adminRouter.post("/contrato-promotora/anexos/previa", async (req, res, next) => {
  try {
    requirePlatformAdmin(req);
    res.set("Cache-Control", "no-store");
    res.json(previaDoAnexo(req.body, await dadosDaEmpresaPublicados()));
  } catch (err) {
    next(err);
  }
});

/** O aceite do anexo é da organização da sessão, como o do contrato. */
adminRouter.post("/contrato-promotora/anexos/aceite", async (req, res, next) => {
  try {
    const org = orgOf(req);
    if (!org) return res.status(403).json({ message: "Quem aceita o anexo é a organização." });
    const r = await aceitarAnexo(org, req.user!.id, { modalidade: req.body?.modalidade, versao: req.body?.versao, identidade: identify(req) });
    if (r.novo) await audit(req, "contrato_promotora.anexo.aceite", "organization", org, { modalidade: r.modalidade, versao: r.versao });
    res.json(r);
  } catch (err) {
    next(err);
  }
});

/* ---------------- pedidos para ser colaborador ---------------- */

adminRouter.get("/colaboradores/pedidos", async (req, res, next) => {
  try {
    res.json(await pedidosDeColaborador(orgOf(req)));
  } catch (err) {
    next(err);
  }
});

adminRouter.post("/colaboradores/pedidos/:id", async (req, res, next) => {
  try {
    await decidirPedidoDeColaborador(orgOf(req), req.params.id, req.body?.status);
    await audit(req, "colaborador.pedido", "pedido_colaborador", req.params.id, { status: req.body?.status });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

/* ---------------- divulgação de terceiros (influenciador e apostador) ---------------- */

/** Como o afiliado publica com o material desta organização, e quantas peças esperam. */
adminRouter.get("/divulgacoes/config", async (req, res, next) => {
  try {
    const org = organizacaoDoPedido(req);
    res.json({ modo: org ? await modoDaOrganizacao(org) : null, porOrganizacao: !org, pendentes: await pendentesDaOrganizacao(req) });
  } catch (err) {
    next(err);
  }
});

adminRouter.put("/divulgacoes/config", async (req, res, next) => {
  try {
    const org = organizacaoDoPedido(req);
    if (!org) return res.status(400).json({ message: "Escolha a organização." });
    const r = await salvarModoDeDivulgacao(org, req.body);
    await audit(req, "divulgacao.modo", "organization", org, { modo: r.modo });
    res.json(r);
  } catch (err) {
    next(err);
  }
});

/** A fila, no recorte de `orgOf`: a organização vê só a dela. */
adminRouter.get("/divulgacoes", async (req, res, next) => {
  try {
    res.json(await listarDivulgacoesDaOrganizacao(req, req.query.status));
  } catch (err) {
    next(err);
  }
});

/** A foto da peça do apostador, para quem autoriza (a do vizinho é 404). Nunca em cache. */
adminRouter.get("/divulgacoes/:id/fotos/:fotoId", async (req, res, next) => {
  try {
    const bytes = await fotoDaDivulgacao(req, req.params.id, req.params.fotoId);
    res.setHeader("Cache-Control", "private, no-store");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.type("image/jpeg").send(bytes);
  } catch (err) {
    next(err);
  }
});

/** O vídeo do afiliado (ou o pôster, `?poster=1`), para quem autoriza (o do vizinho é 404). Nunca em cache; com `Range`. */
adminRouter.get("/divulgacoes/:id/video", async (req, res, next) => {
  try {
    const v = await videoDaDivulgacao(req, req.params.id, req.query.poster === "1");
    res.setHeader("Cache-Control", "private, no-store");
    res.setHeader("X-Content-Type-Options", "nosniff");
    await enviarFaixaDoBanco(req, res, v);
  } catch (err) {
    next(err);
  }
});

/** Aprovar, recusar ou retirar — uma decisão por peça (o segundo clique é 409). O do vizinho é 404. */
adminRouter.post("/divulgacoes/:id", async (req, res, next) => {
  try {
    const r = await decidirDivulgacao(req, req.params.id, req.body);
    await audit(req, `divulgacao.${r.acao}`, "divulgacao", req.params.id, { campaignId: r.campaignId });
    res.json({ id: r.id, status: r.status });
  } catch (err) {
    next(err);
  }
});

/* ---------------- recibos ---------------- */

/** PDF do recibo: a organização que pagou (ou a plataforma). O do vizinho é 404. */
adminRouter.get("/recibos/:codigo/pdf", async (req, res, next) => {
  try {
    const r = await reciboPorCodigo(req.params.codigo);
    const org = orgOf(req);
    if (!r || (org && r.organizationId !== org)) return res.status(404).json({ message: "Recibo não encontrado." });
    const pdf = await pdfDoRecibo(r, urlDeConferencia(r.codigo));
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Content-Disposition", `attachment; filename="recibo-${r.codigo}.pdf"`);
    res.type("application/pdf").send(pdf);
  } catch (err) {
    next(err);
  }
});

/** Saques pagos da organização (com o recibo de cada um). */
adminRouter.get("/saques-pagos", async (req, res, next) => {
  try {
    const org = orgOf(req);
    const linhas = await db
      .select({
        id: payouts.id,
        amountCents: payouts.amountCents,
        processedAt: payouts.processedAt,
        codigoAfiliado: affiliates.code,
        recibo: recibos.codigo,
      })
      .from(payouts)
      .innerJoin(affiliates, eq(affiliates.id, payouts.affiliateId))
      .leftJoin(recibos, eq(recibos.payoutId, payouts.id))
      .where(and(eq(payouts.status, "paid"), org ? eq(payouts.organizationId, org) : sql`TRUE`))
      .orderBy(desc(payouts.processedAt))
      .limit(50);
    res.json(linhas);
  } catch (err) {
    next(err);
  }
});

/* ---------------- programa de bônus (só a plataforma, etapa 13) ---------------- */

adminRouter.get("/bonus", async (req, res, next) => {
  try {
    requirePlatformAdmin(req);
    res.json(await painelDoBonus());
  } catch (err) {
    next(err);
  }
});

/** Liga/desliga o programa e o bônus por indicação. O resto da configuração fica como está. */
adminRouter.put("/bonus/config", async (req, res, next) => {
  try {
    requirePlatformAdmin(req);
    const atual = await getPlataforma();
    const salva = await setPlataforma({
      ...atual,
      bonusLigado: req.body?.bonusLigado === undefined ? atual.bonusLigado : req.body.bonusLigado === true,
      bonusPorIndicacao: req.body?.bonusPorIndicacao === undefined ? atual.bonusPorIndicacao : req.body.bonusPorIndicacao,
      // O presente (desconto de primeira compra pago pela plataforma).
      presente: req.body?.presente === undefined ? atual.presente : req.body.presente,
    });
    await audit(req, "bonus.config", "settings", "plataforma", {
      bonusLigado: salva.bonusLigado,
      bonusPorIndicacao: salva.bonusPorIndicacao,
      presente: salva.presente,
    });
    res.json({ bonusLigado: salva.bonusLigado, bonusPorIndicacao: salva.bonusPorIndicacao, presente: salva.presente });
  } catch (err) {
    next(err);
  }
});

adminRouter.post("/bonus/metas", async (req, res, next) => {
  try {
    requirePlatformAdmin(req);
    const m = await criarMeta(req.body);
    await audit(req, "bonus.meta.criar", "bonus_meta", m.id, m);
    res.status(201).json(m);
  } catch (err) {
    next(err);
  }
});

adminRouter.put("/bonus/metas/:id", async (req, res, next) => {
  try {
    requirePlatformAdmin(req);
    const m = await alterarMeta(req.params.id, req.body);
    await audit(req, "bonus.meta.alterar", "bonus_meta", m.id, m);
    res.json(m);
  } catch (err) {
    next(err);
  }
});

/* ---------------- banner pago na vitrine ---------------- */

/**
 * A mesma tela, dois recortes: a organização vê os pedidos e o saldo dela; a
 * plataforma vê todos. Desligado, a organização recebe 404 (o produto não
 * existe para ela).
 */
adminRouter.get("/banner-pago", async (req, res, next) => {
  try {
    res.json(await painelDoBannerPago(req));
  } catch (err) {
    next(err);
  }
});

adminRouter.post("/banner-pago/pedidos", async (req, res, next) => {
  try {
    const p = await comprarBanner(req, {
      campaignId: req.body?.campaignId,
      titulo: req.body?.titulo,
      imagem: req.body?.imagem,
      dias: req.body?.dias,
    });
    await audit(req, "banner.pedido", "banner_pedido", p.id, {
      campaignId: p.campaignId,
      dias: p.dias,
      valorPagoCents: p.valorPagoCents,
    });
    res.status(201).json(p);
  } catch (err) {
    next(err);
  }
});

/** A arte do pedido, para conferir antes de aprovar: dono ou plataforma (o do vizinho é 404). */
adminRouter.get("/banner-pago/pedidos/:id/imagem", async (req, res, next) => {
  try {
    const a = await arteDoPedido(req, req.params.id);
    if (!a) return res.status(404).json({ message: "Pedido não encontrado." });
    res.setHeader("Cache-Control", "private, no-store");
    res.type(a.mime).send(a.bytes);
  } catch (err) {
    next(err);
  }
});

adminRouter.post("/banner-pago/pedidos/:id/cancelar", async (req, res, next) => {
  try {
    const p = await cancelarBanner(req, req.params.id);
    await audit(req, "banner.cancelar", "banner_pedido", p.id, { valorPagoCents: p.valorPagoCents });
    res.json(p);
  } catch (err) {
    next(err);
  }
});

/** Aprovar ou recusar a arte: só a plataforma. A decisão fica na auditoria antes de a resposta sair. */
adminRouter.post("/banner-pago/pedidos/:id/decisao", async (req, res, next) => {
  try {
    requirePlatformAdmin(req);
    const p = await decidirBanner(req, req.params.id, { aprovar: req.body?.aprovar, motivo: req.body?.motivo });
    await audit(req, `banner.${p.status}`, "banner_pedido", p.id, { organizacao: p.organizationId, motivo: p.motivo });
    res.json(p);
  } catch (err) {
    next(err);
  }
});

/** Preço do dia, prazo e vagas (só a plataforma). O resto da configuração fica como está. */
adminRouter.put("/banner-pago/config", async (req, res, next) => {
  try {
    requirePlatformAdmin(req);
    const salva = await setPlataforma({ bannerPago: req.body });
    await audit(req, "banner.config", "settings", "plataforma", { ...salva.bannerPago });
    res.json(salva.bannerPago);
  } catch (err) {
    next(err);
  }
});

/* ---------------- assistente de IA (Chatbase) ---------------- */

/** A configuração do assistente (só a plataforma): liga, id do agente e a liberação para organizador e afiliado. */
adminRouter.get("/ia/config", async (req, res, next) => {
  try {
    requirePlatformAdmin(req);
    res.json(await configDaIA());
  } catch (err) {
    next(err);
  }
});

adminRouter.put("/ia/config", async (req, res, next) => {
  try {
    requirePlatformAdmin(req);
    const candidata = validarConfigIA(req.body);
    if (candidata.ligado && !chaveDoChatbase()) {
      return res.status(409).json({ message: "Falta CHATBASE_API_KEY no servidor: sem ela o assistente não conversa." });
    }
    const salva = await setPlataforma({ assistenteIA: candidata });
    await audit(req, "ia.config", "settings", "plataforma", { ...salva.assistenteIA });
    res.json({ config: salva.assistenteIA, chaveNoAmbiente: chaveDoChatbase() !== null });
  } catch (err) {
    next(err);
  }
});

/**
 * Uso e receita do assistente, por quem paga, e o ajuste de crédito
 * (cortesia ou correção). Só a plataforma (403 para organizador, no `npm run
 * isolation`); as regras moram em `services/iaCobranca.ts`.
 */
adminRouter.get("/ia/relatorio", async (req, res, next) => {
  try {
    requirePlatformAdmin(req);
    res.set("Cache-Control", "no-store");
    res.json(await relatorioDaIA(req.query.dias));
  } catch (err) {
    if (err instanceof CobrancaIAError) return res.status(err.status).json({ message: err.message });
    next(err);
  }
});

adminRouter.get("/ia/lancamentos", async (req, res, next) => {
  try {
    requirePlatformAdmin(req);
    res.set("Cache-Control", "no-store");
    res.json(await extratoDaIA(req.query.tipo, req.query.titular));
  } catch (err) {
    if (err instanceof CobrancaIAError) return res.status(err.status).json({ message: err.message });
    next(err);
  }
});

adminRouter.post("/ia/ajustes", async (req, res, next) => {
  try {
    requirePlatformAdmin(req);
    const feito = await ajustarCreditosIA({ id: req.user!.id, role: req.user!.role, ip: req.ip }, req.body ?? {});
    res.status(feito.repetido ? 200 : 201).json(feito);
  } catch (err) {
    if (err instanceof CobrancaIAError) return res.status(err.status).json({ message: err.message });
    next(err);
  }
});

/* ---------------- rifas patrocinadas (etapa 15) ---------------- */

/** A mesma tela, dois recortes: a organização vê os anúncios e números dela; a plataforma, a fila e todas. */
adminRouter.get("/patrocinio", async (req, res, next) => {
  try {
    res.json(await painelDoPatrocinio(req, req.query.dias));
  } catch (err) {
    next(err);
  }
});

/** Compra um anúncio (pacote de cliques) com o saldo. */
adminRouter.post("/patrocinio/anuncios", async (req, res, next) => {
  try {
    const a = await comprarAnuncio(req, {
      campaignId: req.body?.campaignId,
      alcance: req.body?.alcance,
      uf: req.body?.uf,
      cidade: req.body?.cidade,
      cliques: req.body?.cliques,
    });
    await audit(req, "patrocinio.anuncio", "patrocinio_anuncio", a.id, {
      campaignId: a.campaignId,
      segmento: a.segmento,
      cliques: a.cliquesComprados,
      valorPagoCents: a.valorPagoCents,
    });
    res.status(201).json(a);
  } catch (err) {
    next(err);
  }
});

/**
 * Reembolso do saldo pelo suporte. Não existe cancelamento de anúncio: o
 * crédito de rifa no ar fica preso a ele. Com o interruptor
 * `patrocinioReembolso` desligado, a abertura responde 404 ao organizador.
 */
adminRouter.post("/patrocinio/reembolsos", async (req, res, next) => {
  try {
    const p = await pedirReembolso(req, { valorCents: req.body?.valorCents, chavePix: req.body?.chavePix, motivo: req.body?.motivo });
    await audit(req, "patrocinio.reembolso.pedido", "patrocinio_reembolso", p.id, { protocolo: p.protocolo, valorCents: p.valorCents });
    res.status(201).json(p);
  } catch (err) {
    next(err);
  }
});

adminRouter.post("/patrocinio/reembolsos/:id/mensagens", async (req, res, next) => {
  try {
    res.status(201).json(await responderReembolso(req, req.params.id, req.body?.texto));
  } catch (err) {
    next(err);
  }
});

/** Só a plataforma decide e dá baixa (403 para organizador, no `npm run isolation`). */
adminRouter.post("/patrocinio/reembolsos/:id/decisao", async (req, res, next) => {
  try {
    requirePlatformAdmin(req);
    const p = await decidirReembolso(req, req.params.id, {
      aprovar: req.body?.aprovar,
      retidoCents: req.body?.retidoCents,
      explicacao: req.body?.explicacao,
    });
    await audit(req, `patrocinio.reembolso.${p.status}`, "patrocinio_reembolso", p.id, {
      protocolo: p.protocolo,
      valorCents: p.valorCents,
      retidoCents: p.retidoCents,
      devolverCents: p.devolverCents,
    });
    res.json(p);
  } catch (err) {
    next(err);
  }
});

adminRouter.post("/patrocinio/reembolsos/:id/pago", async (req, res, next) => {
  try {
    requirePlatformAdmin(req);
    const p = await marcarReembolsoPago(req, req.params.id);
    await audit(req, "patrocinio.reembolso.pago", "patrocinio_reembolso", p.id, { protocolo: p.protocolo, devolverCents: p.devolverCents });
    res.json(p);
  } catch (err) {
    next(err);
  }
});

adminRouter.post("/patrocinio/recargas", async (req, res, next) => {
  try {
    const r = await pedirRecarga(req, Number(req.body?.valorCents));
    await audit(req, "patrocinio.recarga", "patrocinio_recarga", r.id, { valorCents: r.valorCents, codigo: r.codigo });
    res.status(201).json({ id: r.id, codigo: r.codigo, valorCents: r.valorCents, pix: { qr: r.pixQr, copyPaste: r.pixCopyPaste }, expiresAt: r.expiresAt });
  } catch (err) {
    next(err);
  }
});

/** Configuração (só a plataforma). O resto da configuração fica como está. */
adminRouter.put("/patrocinio/config", async (req, res, next) => {
  try {
    requirePlatformAdmin(req);
    // Tabela de preço, faixas, mínimo, vagas e recarga mínima: o que vier
    // substitui a configuração do patrocínio inteira (validada em conjunto).
    const salva = await setPlataforma({
      patrocinioReembolso: req.body?.reembolso === undefined ? undefined : req.body.reembolso === true,
      patrocinio: req.body?.patrocinio === undefined ? undefined : req.body.patrocinio,
    });
    await audit(req, "patrocinio.config", "settings", "plataforma", {
      reembolso: salva.patrocinioReembolso,
      patrocinio: salva.patrocinio,
    });
    res.json({ reembolso: salva.patrocinioReembolso, ...salva.patrocinio });
  } catch (err) {
    next(err);
  }
});

/** Crédito ou débito no saldo de uma organização (só a plataforma). */
adminRouter.post("/patrocinio/ajustes", async (req, res, next) => {
  try {
    requirePlatformAdmin(req);
    const organizationId = String(req.body?.organizationId ?? "");
    const valorCents = Number(req.body?.valorCents);
    const r = await ajustarSaldo(req, organizationId, valorCents, String(req.body?.descricao ?? ""));
    await audit(req, "patrocinio.ajuste", "organization", organizationId, { valorCents, saldoCents: r.saldoCents });
    res.json(r);
  } catch (err) {
    next(err);
  }
});

/* ---------------- marketing e tráfego pago (etapa 16) ---------------- */

/** A mesma tela nos dois recortes (plataforma e organização). */
adminRouter.get("/marketing", async (req, res, next) => {
  try {
    res.json(await painelDoMarketing(req, req.query.dias));
  } catch (err) {
    next(err);
  }
});

/** Pixels e chaves de quem está logado. As chaves nunca voltam. */
adminRouter.put("/marketing", async (req, res, next) => {
  try {
    const r = await salvarMarketing(req, { pixels: req.body?.pixels, credenciais: req.body?.credenciais });
    await audit(req, "marketing.config", "marketing", orgOf(req) ?? "plataforma", { pixels: r.pixels, credenciais: r.credenciais });
    res.json(r);
  } catch (err) {
    next(err);
  }
});

/* ---------------- verificação do perfil (selo de trevo) ---------------- */

/**
 * A organização verifica a si mesma (o do vizinho é 404). A plataforma não
 * preenche por ela: confere pela fila, com auditoria.
 */
montarRotasDaVerificacao(adminRouter, "/organizacoes/:id/verificacao", "organizacao", (req) => {
  const org = orgOf(req);
  if (!org) throw Object.assign(new Error("A plataforma confere pela fila de verificações."), { status: 403 });
  if (org !== req.params.id) throw Object.assign(new Error("Organização não encontrada."), { status: 404 });
  return org;
});

/** A fila: só a plataforma (403 para organizador). Sem dado pessoal — o detalhe carrega com auditoria. */
adminRouter.get("/verificacoes", async (req, res, next) => {
  try {
    requirePlatformAdmin(req);
    res.json(await filaDeVerificacoes(req.query.filtro === "todas" ? "todas" : "pendentes"));
  } catch (err) {
    next(err);
  }
});

adminRouter.get("/verificacoes/:id", async (req, res, next) => {
  try {
    requirePlatformAdmin(req);
    await audit(req, "verificacao.ver_dados", "verificacao", req.params.id);
    res.setHeader("Cache-Control", "no-store");
    res.json(await detalheDaVerificacao(req.params.id));
  } catch (err) {
    next(err);
  }
});

adminRouter.get("/verificacoes/:id/documentos/:tipo", async (req, res, next) => {
  try {
    requirePlatformAdmin(req);
    await audit(req, "verificacao.ver_documento", "verificacao", req.params.id, { tipo: req.params.tipo });
    const d = await documentoDaVerificacao(req.params.id, req.params.tipo);
    res.setHeader("Cache-Control", "no-store");
    res.type(d.mime).send(d.bytes);
  } catch (err) {
    next(err);
  }
});

adminRouter.get("/verificacoes/:id/foto", async (req, res, next) => {
  try {
    requirePlatformAdmin(req);
    const bytes = await fotoDaVerificacao(req.params.id);
    res.setHeader("Cache-Control", "no-store");
    res.type("image/webp").send(bytes);
  } catch (err) {
    next(err);
  }
});

adminRouter.post("/verificacoes/:id/decidir", async (req, res, next) => {
  try {
    requirePlatformAdmin(req);
    await audit(req, "verificacao.decidir", "verificacao", req.params.id, { acao: req.body?.acao });
    res.json(await decidirVerificacao(req, req.params.id, req.body ?? {}));
  } catch (err) {
    next(err);
  }
});

/* ---------------- cadastro fiscal (só a plataforma) ---------------- */

/**
 * O cadastro fiscal do afiliado é visto só pela plataforma — organizador
 * recebe 403. Toda leitura de dado ou documento entra na auditoria **antes**
 * de o dado sair (se a auditoria falhar, nada sai).
 */
/** A caixa de entrada: o que espera decisão, de todas as filas. Só a plataforma. */
adminRouter.get("/caixa-de-entrada", async (req, res, next) => {
  try {
    requirePlatformAdmin(req);
    res.json(await caixaDeEntrada());
  } catch (err) {
    next(err);
  }
});

adminRouter.get("/fiscal", async (req, res, next) => {
  try {
    requirePlatformAdmin(req);
    res.json(await cadastrosFiscais());
  } catch (err) {
    next(err);
  }
});

adminRouter.get("/fiscal/:affiliateId", async (req, res, next) => {
  try {
    requirePlatformAdmin(req);
    await audit(req, "fiscal.ver_dados", "affiliate", req.params.affiliateId);
    res.setHeader("Cache-Control", "no-store");
    res.json(await estadoFiscal(req.params.affiliateId, true));
  } catch (err) {
    next(err);
  }
});

adminRouter.get("/fiscal/:affiliateId/documentos/:tipo", async (req, res, next) => {
  try {
    requirePlatformAdmin(req);
    await audit(req, "fiscal.ver_documento", "affiliate", req.params.affiliateId, { tipo: req.params.tipo });
    const d = await documento(req.params.affiliateId, req.params.tipo);
    res.setHeader("Cache-Control", "no-store");
    res.type(d.mime).send(d.bytes);
  } catch (err) {
    next(err);
  }
});

adminRouter.post("/fiscal/:affiliateId/decidir", async (req, res, next) => {
  try {
    requirePlatformAdmin(req);
    const feito = await decidirCadastro(req.params.affiliateId, req.body?.status, req.body?.motivo, req.user?.id ?? null);
    await audit(req, "fiscal.decidir", "affiliate", req.params.affiliateId, { status: feito.status });
    res.json(feito);
  } catch (err) {
    next(err);
  }
});
