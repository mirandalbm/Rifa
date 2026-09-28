/**
 * Pedido: reserva, cobrança e confirmação.
 *
 * O front nunca envia preço — envia campanha e quantidade (ou os números
 * escolhidos). O total é sempre recalculado aqui, em centavos inteiros.
 */
import { comissaoNaRifa, cupomValeNaRifa } from "./afiliados";
import type { Campaign } from "@shared/schema";
import { validarOrigem } from "@shared/resultados";
import { validarUtm } from "@shared/marketing";
import { destinosDaCompra, enfileirarCompra } from "./marketing";
import { randomInt } from "node:crypto";
import { and, eq, inArray, sql, desc, or, lte } from "drizzle-orm";
import type { Titularidade } from "@shared/contaComprador";
import { garantirCodigoCliente } from "./codigoCliente";
import { db } from "../db";
import {
  campaigns,
  campaignStats,
  quotaPackages,
  settlements,
  quotaAlloc,
  orders,
  buyers,
  affiliates,
  coupons,
  commissions,
  prizedQuotas,
  draws,
  platformCharges,
  carrinhoPedidos,
  bonusLancamentos as bonusLancamentosTabela,
  type CarrinhoCheckoutInput,
  type CreateOrderInput,
} from "@shared/schema";
import { CARRINHO_CODIGO_MAX, CARRINHO_CODIGO_MIN, limparCarrinho, splitDoCarrinho } from "@shared/carrinho";
import {
  priceOrder,
  commissionAvailableAt,
  splitOrder,
} from "@shared/pricing";
import { platformPctFor, FREE_PLAN } from "@shared/billing";
import { lancarTaxaDaVenda, planOfOrganization } from "./billing";
import { normalizePhone } from "@shared/format";
import { users, organizations } from "@shared/schema";
import {
  EXIGE_CPF,
  comissaoInicial,
  percentualDoPromotor,
  type ProvedorPix,
} from "@shared/plataforma";
import {
  intArray,
  reserveRandom,
  reserveSpecific,
  bumpReserved,
  confirmPaid,
  shouldEnterEndgame,
  enterEndgame,
  releasePaidQuotas,
} from "./quotas";
import { activePaymentProvider } from "../payments";
import { getPaymentMethods, getPlataforma } from "./settings";
import { conferirReservaAberta, guardOrder, type RequestIdentity } from "./antifraude";
import { enabledPhysical, labelFor } from "@shared/payments";
import { notify } from "../notifications";
import { publicUrl } from "./urls";
import { formatBRL, formatQuota, cpfValido } from "@shared/format";
import { isUniqueViolation } from "../pgError";
import { avaliarMetas, confirmarIndicacao, estornarIndicacao, registrarIndicacao } from "./bonus";
import { anuncioDaVenda } from "./patrocinio";
import { cancelarCreditoDoPresente, lancarCreditoDoPresente, presenteDoPedido } from "./presente";
import { bloqueioDoResgate } from "@shared/bonus";

/** Dias entre o pagamento e a liberação da comissão do afiliado. */
export const REFUND_WINDOW_DAYS = Number(process.env.REFUND_WINDOW_DAYS ?? 7);

export class OrderError extends Error {
  constructor(message: string, readonly status = 400) {
    super(message);
    this.name = "OrderError";
  }
}

/**
 * Código do pedido: o número que o comprador lê no WhatsApp e digita para
 * acompanhar a compra.
 *
 * Duas decisões moram aqui.
 *
 * **É sorteado, não sequencial.** A consulta do pedido é pública e devolve o
 * nome de quem comprou; com código sequencial, qualquer um enumeraria a
 * carteira de clientes da rifa — e ainda leria o volume de vendas do dia pela
 * diferença entre dois códigos.
 *
 * **Quem decide a colisão é o índice único, não uma consulta anterior.** A
 * versão antiga fazia `SELECT` e depois `INSERT`, o mesmo erro que a
 * invariante 1 proíbe para cota. O teste de carga achou o buraco na primeira
 * rodada: dois pedidos simultâneos sortearam o mesmo número entre a consulta
 * e a gravação, e um comprador levou erro 500.
 *
 * A faixa é de oito dígitos porque a de seis (990 mil) era um teto de
 * verdade: a plataforma roda várias rifas de até 1.000.000 de cotas, e o
 * número de *pedidos* ao longo da vida dela passa folgado de um milhão. Com
 * a faixa antiga, a rifa simplesmente pararia de emitir pedido. Oito dígitos
 * dão 90 milhões de códigos: com 1 milhão de pedidos gravados, a chance de
 * um sorteio colidir é de 1%, e a de esgotar as repetições abaixo de
 * 1 em 10^20.
 */
const ORDER_CODE_MIN = 10_000_000;
const ORDER_CODE_MAX = 100_000_000;

function randomOrderCode(): number {
  return randomInt(ORDER_CODE_MIN, ORDER_CODE_MAX);
}

/** Colisão no código do pedido — não confundir com colisão de cota. */
function isOrderCodeConflict(err: unknown): boolean {
  return isUniqueViolation(err, "uq_orders_code");
}

/** Quantas vezes sorteamos de novo antes de desistir. */
const ORDER_CODE_RETRIES = 10;

async function upsertBuyer(input: CreateOrderInput["buyer"]) {
  const phone = normalizePhone(input.phone);
  if (phone.length < 10) throw new OrderError("Telefone inválido.");

  let [existing] = await db.select().from(buyers).where(eq(buyers.phone, phone));
  if (!existing) {
    // Quem cria é o índice, não a consulta de cima: dois pedidos ao mesmo
    // tempo do mesmo telefone novo (dois toques em "pagar") liam os dois
    // "não existe", e o segundo caía no `uq_buyers_phone` como erro 500.
    const [created] = await db
      .insert(buyers)
      .values({ name: input.name, phone, cpf: input.cpf, email: input.email })
      .onConflictDoNothing({ target: buyers.phone })
      .returning();
    if (created) return created;
    [existing] = await db.select().from(buyers).where(eq(buyers.phone, phone));
    if (!existing) throw new OrderError("Não foi possível registrar o comprador. Tente de novo.", 409);
  }
  // Conta com senha tem dono: compra sem entrar, com o telefone dela, não
  // renomeia nem troca o CPF de ninguém.
  if (existing.passwordHash) return existing;
  // O CPF entra quando faltava (o Asaas passou a pedir), mas não troca o
  // que já estava gravado: o CPF do comprador não muda de pedido para pedido.
  const cpf = existing.cpf ?? input.cpf ?? null;
  if (existing.name !== input.name || cpf !== existing.cpf) {
    await db.update(buyers).set({ name: input.name, cpf }).where(eq(buyers.id, existing.id));
  }
  return { ...existing, name: input.name, cpf };
}

/**
 * Atribuição do afiliado, decidida na criação do pedido:
 * cupom digitado no checkout > primeiro clique guardado na sessão.
 * Autoindicação é bloqueada: o afiliado não ganha comissão da própria compra.
 */
async function resolveAttribution(params: {
  couponCode?: string;
  sessionAffiliateCode?: string;
  buyerPhone: string;
  campaign: Campaign;
}) {
  const { couponCode, sessionAffiliateCode, buyerPhone, campaign } = params;

  let affiliateId: string | null = null;
  let couponId: string | null = null;
  let couponPct = 0;

  if (couponCode) {
    const [coupon] = await db
      .select()
      .from(coupons)
      .where(eq(coupons.code, couponCode.toUpperCase().trim()));
    if (!coupon) throw new OrderError("Cupom inválido.");
    if (coupon.expiresAt && coupon.expiresAt < new Date()) {
      throw new OrderError("Este cupom expirou.");
    }
    if (coupon.maxUses !== null && coupon.uses >= coupon.maxUses) {
      throw new OrderError("Este cupom atingiu o limite de usos.");
    }
    // O desconto sai do bolso de quem criou o cupom: cupom de uma
    // organização não vale na rifa de outra, nem cupom preso a outra rifa.
    if (!cupomValeNaRifa(coupon, campaign) || (coupon.campaignId && coupon.campaignId !== campaign.id)) {
      throw new OrderError("Este cupom não vale para esta rifa.");
    }
    couponId = coupon.id;
    couponPct = coupon.discountPct;
    affiliateId = coupon.affiliateId ?? null;
  }

  if (!affiliateId && sessionAffiliateCode) {
    const [aff] = await db
      .select()
      .from(affiliates)
      .where(
        and(eq(affiliates.code, sessionAffiliateCode), eq(affiliates.status, "active")),
      );
    if (aff) affiliateId = aff.id;
  }

  if (affiliateId) {
    const [self] = await db
      .select({ phone: sql<string>`u.phone` })
      .from(sql`affiliates a JOIN users u ON u.id = a.user_id`)
      .where(sql`a.id = ${affiliateId}::uuid`);
    if (self?.phone && normalizePhone(self.phone) === buyerPhone) {
      affiliateId = null; // autoindicação
    }
  }

  // O afiliado só leva a venda da rifa de uma organização com que tem
  // vínculo aprovado — e, se a rifa foi publicada com termo, tendo aceitado
  // aquela versão. Sem isso a venda segue, sem afiliado.
  const naRifa = affiliateId ? await comissaoNaRifa(db, affiliateId, campaign) : null;
  if (affiliateId && !naRifa?.recebe) {
    affiliateId = null;
  }

  return { affiliateId, couponId, couponPct, comissaoPct: affiliateId ? (naRifa?.pct ?? 0) : 0 };
}

export interface CreateOrderContext {
  sessionAffiliateCode?: string;
  /** Venda física: o cambista é o vendedor e também quem recebe comissão. */
  sellerId?: string;
  /** IP e aparelho já em hash, para o antifraude. */
  identity?: RequestIdentity;
  /**
   * Compra feita dentro da conta do apostador: nome, telefone e CPF vêm da
   * conta (o formulário não troca), e o pedido é da conta mesmo sem o
   * telefone confirmado (`orders.via_conta`).
   */
  contaId?: string;
}

export class FraudBlockedError extends OrderError {
  constructor(message: string, readonly rule?: string) {
    super(message, 429);
    this.name = "FraudBlockedError";
  }
}

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** A reserva em aberto conferida dentro da transação (ver `conferirReservaAberta`). */
async function reservaAbertaNaTransacao(tx: Tx, buyerId: string, quantidade: number) {
  const veredito = await conferirReservaAberta(tx, buyerId, quantidade);
  if (!veredito.allowed) throw new FraudBlockedError(veredito.reason ?? "Compra recusada.", veredito.rule);
}

/**
 * Tudo que o pedido precisa antes de gravar: confere a rifa, os limites, o
 * CPF e o antifraude, resolve comprador e afiliado e calcula o preço. É a
 * mesma régua para a compra avulsa (`createOrder`) e para cada rifa do
 * carrinho (`createCartOrder`), que chama o antifraude uma vez só, antes.
 */
async function prepararPedido(
  input: CreateOrderInput,
  ctx: CreateOrderContext,
  opcoes: { antifraude?: boolean; presente?: boolean } = {},
) {
  const [campaign] = await db
    .select()
    .from(campaigns)
    .where(eq(campaigns.id, input.campaignId));

  if (!campaign) throw new OrderError("Campanha não encontrada.", 404);

  // Dentro da conta, quem compra é a conta: o formulário não escolhe outro
  // telefone para jogar a compra no nome de alguém.
  if (ctx.contaId && !ctx.sellerId) {
    const [conta] = await db.select().from(buyers).where(eq(buyers.id, ctx.contaId));
    if (!conta || conta.excluidoEm) throw new OrderError("Entre de novo na sua conta.", 401);
    input = {
      ...input,
      buyer: {
        ...input.buyer,
        name: conta.name,
        phone: conta.phone,
        cpf: conta.cpf ?? input.buyer.cpf,
      },
    };
  }
  if (campaign.status !== "published") {
    throw new OrderError("Esta rifa não está aberta para compra.", 409);
  }
  // Demonstração aparece na vitrine, mas não vende: nem site, nem cambista.
  if (campaign.demonstracao) {
    throw new OrderError("Rifa de demonstração: não está à venda.", 409);
  }
  // Travada pela plataforma (denúncia, organização banida): nada vende.
  if (campaign.travadaEm) {
    throw new OrderError("As vendas desta rifa estão suspensas pela plataforma.", 409);
  }

  // O administrador decide os meios aceitos; a checagem é aqui, não na tela.
  const meios = await getPaymentMethods();
  if (ctx.sellerId) {
    if (enabledPhysical(meios).length === 0) {
      throw new OrderError(
        "A venda na mão está desligada pela administração.",
        409,
      );
    }
  } else if (!meios.pix_online) {
    throw new OrderError(
      "Esta rifa está vendendo apenas com os cambistas no momento.",
      409,
    );
  }

  const wantsSpecific = Boolean(input.numbers?.length);
  const quantity = wantsSpecific ? input.numbers!.length : (input.quantity ?? 0);

  if (quantity < campaign.minPerOrder) {
    throw new OrderError(`O mínimo é ${campaign.minPerOrder} cota(s) por pedido.`);
  }
  if (quantity > campaign.maxPerOrder) {
    throw new OrderError(`O máximo é ${campaign.maxPerOrder} cotas por pedido.`);
  }

  const [stats] = await db
    .select()
    .from(campaignStats)
    .where(eq(campaignStats.campaignId, campaign.id));
  if (!stats) throw new OrderError("Campanha sem contadores. Republique-a.", 500);

  const remaining = campaign.totalQuotas - stats.soldCount - stats.reservedCount;
  if (remaining < quantity) {
    throw new OrderError(
      remaining <= 0
        ? "Esta rifa já vendeu todas as cotas."
        : `Restam apenas ${remaining} cotas.`,
      409,
    );
  }

  // O provedor em uso decide se o CPF é obrigatório (o Asaas só cobra
  // cliente com CPF). Conferido antes de reservar: descobrir na hora do Pix
  // deixaria cotas presas numa reserva que nunca vai ser paga.
  const provider = ctx.sellerId ? null : await activePaymentProvider();
  if (provider && EXIGE_CPF[provider.name as ProvedorPix]) {
    if (!cpfValido(input.buyer.cpf ?? "")) {
      throw new OrderError("Informe um CPF válido de quem está comprando: ele é exigido para gerar o Pix.", 400);
    }
  }

  // O antifraude entra antes de qualquer linha ser escrita: pedido recusado
  // não pode nem criar o comprador.
  const identity = ctx.identity ?? { ipHash: null, deviceHash: null };
  if (opcoes.antifraude !== false) {
    const veredito = await guardOrder({
      phone: input.buyer.phone,
      identity,
      campaignId: campaign.id,
      quantity,
      bySeller: Boolean(ctx.sellerId),
      affiliateCode: input.affiliateCode ?? ctx.sessionAffiliateCode,
    });
    if (!veredito.allowed) {
      throw new FraudBlockedError(veredito.reason ?? "Compra recusada.", veredito.rule);
    }
  }

  const buyer = await upsertBuyer(input.buyer);
  // Todo comprador tem ID desde a primeira compra: é ele que sai no bilhete
  // e que o organizador vê no lugar dos dados de cliente da plataforma.
  if (!buyer.codigo) buyer.codigo = await garantirCodigoCliente(buyer.id);
  // Compra sem entrar, no telefone de uma conta, com o CPF da conta: é do
  // dono (o CPF é a mesma prova do cadastro). Sem CPF, fica para o telefone
  // provado decidir.
  const compraProvadaPeloCpf = Boolean(
    !ctx.contaId &&
      !ctx.sellerId &&
      buyer.passwordHash &&
      buyer.cpf &&
      input.buyer.cpf &&
      input.buyer.cpf.replace(/\D/g, "") === buyer.cpf.replace(/\D/g, ""),
  );

  // Na venda física não há clique nem cookie: quem vendeu é quem leva.
  const attribution = ctx.sellerId
    ? { affiliateId: ctx.sellerId, couponId: null as string | null, couponPct: 0, comissaoPct: 0 }
    : await resolveAttribution({
        couponCode: input.couponCode,
        sessionAffiliateCode: input.affiliateCode ?? ctx.sessionAffiliateCode,
        buyerPhone: buyer.phone,
        campaign,
      });

  const packages = await db
    .select()
    .from(quotaPackages)
    .where(eq(quotaPackages.campaignId, campaign.id));

  const price = priceOrder({
    quantity,
    unitCents: campaign.priceCents,
    packages,
    couponPct: attribution.couponPct,
  });

  const expiresAt = new Date(Date.now() + campaign.reservationTtlMin * 60_000);

  // Guarda da comissão (etapa 12): só venda online com afiliado. O cambista
  // acerta com a casa em mãos; não há dinheiro dele passando pela plataforma.
  const comissaoGuardada = Boolean(
    !ctx.sellerId && attribution.affiliateId && (await getPlataforma()).guardaComissao,
  );
  // Venda que veio de anúncio patrocinado (etapa 15): o mesmo aparelho
  // clicou num anúncio desta rifa há até 7 dias. Só estatística.
  const anuncioId = ctx.sellerId ? null : await anuncioDaVenda(identity.deviceHash, campaign.id);

  // O presente: a parte da compra que a plataforma paga (primeira compra de
  // quem tem conta e veio pelo link de alguém). O carrinho não leva.
  const presente =
    opcoes.presente === false
      ? { cents: 0, deId: null }
      : await presenteDoPedido({
          buyerId: buyer.id,
          contaId: ctx.contaId,
          sellerId: ctx.sellerId,
          codigo: input.indicacao,
          totalCents: price.totalCents,
        });

  return {
    input,
    ctx,
    campaign,
    stats,
    quantity,
    wantsSpecific,
    provider,
    identity,
    buyer,
    compraProvadaPeloCpf,
    attribution,
    price,
    expiresAt,
    comissaoGuardada,
    anuncioId,
    presente,
  };
}

type Preparo = Awaited<ReturnType<typeof prepararPedido>>;

/**
 * Grava o pedido e reserva as cotas, dentro da transação de quem chama. A
 * reserva é a de sempre (`reserveSpecific`/`reserveRandom`, pela PK): se
 * faltar cota, a exceção desfaz a transação inteira — no carrinho, os
 * pedidos das outras rifas também.
 */
async function inserirPedido(
  tx: Tx,
  p: Preparo,
  code: number,
  extra: { carrinhoId?: string; expiresAt?: Date } = {},
) {
  const { input, ctx, campaign, stats, quantity, buyer, attribution, price, identity } = p;
  const expiresAt = extra.expiresAt ?? p.expiresAt;
  const [created] = await tx
    .insert(orders)
    .values({
      code,
      campaignId: campaign.id,
      buyerId: buyer.id,
      quantity,
      // O comprador paga o total menos o presente; a plataforma paga o resto.
      amountCents: price.totalCents - p.presente.cents,
      presenteCents: p.presente.cents,
      presenteDe: p.presente.deId,
      discountCents: price.packageDiscountCents + price.couponDiscountCents,
      status: "pending",
      affiliateId: attribution.affiliateId,
      sellerId: ctx.sellerId ?? null,
      method: ctx.sellerId ? "dinheiro" : "pix_online",
      viaConta: Boolean(ctx.contaId && !ctx.sellerId) || p.compraProvadaPeloCpf,
      // Venda do cambista não tem origem de site: o canal é ele.
      origem: ctx.sellerId ? null : validarOrigem(input.origem),
      utm: ctx.sellerId ? null : validarUtm(input.utm),
      marketingConsentimento: !ctx.sellerId && input.marketing === true,
      deviceHash: identity.deviceHash,
      ipHash: identity.ipHash,
      couponId: attribution.couponId,
      comissaoGuardada: p.comissaoGuardada,
      anuncioId: p.anuncioId,
      carrinhoId: extra.carrinhoId ?? null,
      expiresAt,
    })
    .returning();

  const reserved = p.wantsSpecific
    ? await reserveSpecific(tx, {
        campaignId: campaign.id,
        totalQuotas: campaign.totalQuotas,
        numbers: input.numbers!,
        orderId: created.id,
        reservedUntil: expiresAt,
      })
    : await reserveRandom(tx, {
        campaignId: campaign.id,
        totalQuotas: campaign.totalQuotas,
        count: quantity,
        orderId: created.id,
        reservedUntil: expiresAt,
        endgame: stats.endgame,
      });

  await bumpReserved(tx, campaign.id, reserved.numbers.length);

  if (attribution.couponId) {
    await tx
      .update(coupons)
      .set({ uses: sql`${coupons.uses} + 1` })
      .where(eq(coupons.id, attribution.couponId));
  }

  return { order: created, numbers: reserved.numbers };
}

/**
 * Repete a transação com outro código enquanto o índice único do código
 * recusar. A transação inteira é a unidade de repetição: se o código
 * colidir, o banco desfaz também a reserva de cota, e a próxima volta
 * sorteia outro. Pedido sem cota seria fantasma; cota sem pedido, cota
 * perdida.
 */
async function comCodigoLivre<T>(gravar: () => Promise<T>, colidiu: (err: unknown) => boolean): Promise<T> {
  for (let tentativa = 0; tentativa < ORDER_CODE_RETRIES; tentativa++) {
    try {
      return await gravar();
    } catch (err) {
      if (!colidiu(err)) throw err;
    }
  }
  throw new OrderError("Não foi possível gerar o número do pedido.", 500);
}

export async function createOrder(
  input: CreateOrderInput,
  ctx: CreateOrderContext = {},
) {
  const p = await prepararPedido(input, ctx);
  input = p.input;
  const { campaign, stats, quantity, provider, buyer, attribution, price, expiresAt, comissaoGuardada } = p;

  const { order, numbers } = await comCodigoLivre(
    () =>
      db.transaction(async (tx) => {
        // A venda do cambista é isenta dos limites de comprador (como no
        // `guardOrder`); a online confere de novo, já com o comprador travado.
        if (!ctx.sellerId) await reservaAbertaNaTransacao(tx, buyer.id, quantity);
        return inserirPedido(tx, p, randomOrderCode());
      }),
    isOrderCodeConflict,
  ).catch((err) => {
    // Dois pedidos com o presente ao mesmo tempo: o índice deixa um.
    if (isUniqueViolation(err, "uq_presente_por_comprador")) {
      throw new OrderError("Você já tem um pedido com o presente esperando pagamento. Pague esse ou espere a reserva vencer.", 409);
    }
    throw err;
  });

  // Venda física não passa por provedor: o dinheiro entra na mão do cambista.
  if (ctx.sellerId) {
    if (shouldEnterEndgame(stats, campaign.totalQuotas)) {
      await enterEndgame(campaign.id, campaign.totalQuotas);
    }
    return { order, numbers, price };
  }

  // Fora da transação: chamada externa não pode segurar linhas do banco.
  // Se o provedor recusar (CPF rejeitado, fora do ar), as cotas voltam na
  // hora em vez de ficarem presas até a reserva vencer.
  let charge: Awaited<ReturnType<NonNullable<typeof provider>["createPixCharge"]>>;
  try {
    charge = await provider!.createPixCharge({
    orderCode: order.code,
    amountCents: order.amountCents,
    description: `${campaign.title} — ${quantity} cota(s)`,
    payer: {
      name: buyer.name,
      phone: buyer.phone,
      cpf: buyer.cpf ?? input.buyer.cpf ?? undefined,
    },
    expiresAt,
    split: await splitDaOrganizacao(campaign.organizationId, comissaoGuardada ? attribution.comissaoPct : 0),
    });
  } catch (err) {
    await devolverReserva(order.id).catch((e) =>
      console.error(`[pedidos] não devolveu a reserva do pedido ${order.code}:`, e),
    );
    // O detalhe do provedor vai para o log; o comprador lê o que fazer.
    console.error(`[pedidos] Pix do pedido ${order.code} recusado:`, (err as Error).message);
    if ((err as { status?: number }).status === 400) {
      throw new OrderError((err as Error).message, 400);
    }
    throw new OrderError("Não foi possível gerar o Pix agora. Tente de novo em instantes.", 502);
  }

  const [withCharge] = await db
    .update(orders)
    .set({
      pspProvider: charge.provider,
      pspChargeId: charge.chargeId,
      pixQr: charge.qr,
      pixCopyPaste: charge.copyPaste,
    })
    .where(eq(orders.id, order.id))
    .returning();

  if (shouldEnterEndgame(stats, campaign.totalQuotas)) {
    await enterEndgame(campaign.id, campaign.totalQuotas);
  }

  // Indicação (etapa 13): anotada com o Pix já gerado, e nunca derruba a
  // compra — é bônus, não pagamento.
  await registrarIndicacao({ codigo: input.indicacao, indicadoId: buyer.id, orderId: order.id }).catch((e) =>
    console.error(`[bonus] indicação do pedido ${order.code} não anotada:`, e),
  );

  return { order: withCharge, numbers, price };
}

/**
 * A parte da organização no split do Asaas: a carteira dela e o percentual
 * do promotor (tudo menos a taxa da plataforma, em percentual sobre o
 * líquido). Sem carteira, nada é dividido na origem.
 */
async function parteDaOrganizacao(organizationId: string, comissaoGuardadaPct = 0) {
  const [org] = await db
    .select({ walletId: organizations.asaasWalletId })
    .from(organizations)
    .where(eq(organizations.id, organizationId));
  const plano = await planOfOrganization(organizationId);
  // Com a guarda, a comissão fica na conta da plataforma: sai da parte do
  // promotor, sobre o que sobrou da taxa (`percentualDoPromotor`).
  return {
    walletId: org?.walletId ?? null,
    percentual: percentualDoPromotor(platformPctFor(plano), comissaoGuardadaPct),
  };
}

/** O split do pedido avulso: a parte do promotor cai direto na carteira da organização. */
async function splitDaOrganizacao(organizationId: string, comissaoGuardadaPct = 0) {
  const parte = await parteDaOrganizacao(organizationId, comissaoGuardadaPct);
  return parte.walletId ? [{ walletId: parte.walletId, percentual: parte.percentual }] : undefined;
}

/* ------------------------------------------------------------------ *
 * Carrinho num Pix só
 * ------------------------------------------------------------------ */

function codigoDoCarrinho(): number {
  return randomInt(CARRINHO_CODIGO_MIN, CARRINHO_CODIGO_MAX);
}

/**
 * O carrinho pago num Pix só: um pedido por rifa, todos na mesma transação
 * e na mesma cobrança, na conta da plataforma, com o split do Asaas levando
 * a parte de cada promotora para a carteira dela no mesmo Pix.
 *
 * - O antifraude roda **uma vez**, antes de qualquer gravação, com a soma
 *   das cotas; o carrinho conta como um pedido aberto (`guardOrder`).
 * - Cada rifa passa pela mesma régua do pedido avulso (`prepararPedido`):
 *   rifa no ar, mínimo e máximo, preço recalculado aqui.
 * - **Tudo ou nada**: as reservas de todas as rifas estão na mesma
 *   transação. Faltou cota em uma, nenhuma fica reservada.
 * - Todos vencem juntos (o menor prazo de reserva entre as rifas): o relógio
 *   devolve as cotas de todos e cancela a cobrança uma vez só.
 * - Depois de pago, cada pedido segue sozinho: bilhete, comissão, taxa,
 *   sorteio e estorno — este, sempre com o valor do pedido explícito, para
 *   nunca devolver a cobrança inteira.
 */
export async function createCartOrder(input: CarrinhoCheckoutInput, ctx: CreateOrderContext = {}) {
  const itens = limparCarrinho(input.itens).filter((i) => i.quantidade > 0);
  if (itens.length === 0) throw new OrderError("O carrinho está vazio.");
  const rifas = await db
    .select({ id: campaigns.id, slug: campaigns.slug })
    .from(campaigns)
    .where(inArray(campaigns.slug, itens.map((i) => i.slug)));
  const idDe = new Map(rifas.map((r) => [r.slug, r.id]));
  const faltando = itens.find((i) => !idDe.has(i.slug));
  if (faltando) throw new OrderError("Uma rifa do carrinho saiu do ar. Atualize o carrinho.", 409);

  // Dentro da conta, quem compra é a conta — o telefone do antifraude também.
  let telefone = input.buyer.phone;
  if (ctx.contaId) {
    const [conta] = await db.select({ phone: buyers.phone, excluidoEm: buyers.excluidoEm }).from(buyers).where(eq(buyers.id, ctx.contaId));
    if (!conta || conta.excluidoEm) throw new OrderError("Entre de novo na sua conta.", 401);
    telefone = conta.phone;
  }

  // Antes de qualquer linha: o carrinho inteiro é uma tentativa de compra.
  const identity = ctx.identity ?? { ipHash: null, deviceHash: null };
  const veredito = await guardOrder({
    phone: telefone,
    identity,
    campaignId: idDe.get(itens[0].slug)!,
    quantity: itens.reduce((s, i) => s + i.quantidade, 0),
    bySeller: false,
    affiliateCode: input.affiliateCode ?? ctx.sessionAffiliateCode,
  });
  if (!veredito.allowed) {
    throw new FraudBlockedError(veredito.reason ?? "Compra recusada.", veredito.rule);
  }

  const preparos: Preparo[] = [];
  for (const item of itens) {
    preparos.push(
      await prepararPedido(
        {
          campaignId: idDe.get(item.slug)!,
          // Com a cartela escolhida, a reserva é daqueles números (tudo ou nada).
          ...(item.numeros ? { numbers: item.numeros } : { quantity: item.quantidade }),
          buyer: input.buyer,
          affiliateCode: input.affiliateCode,
          origem: input.origem,
          utm: input.utm,
          marketing: input.marketing,
        },
        { ...ctx, sellerId: undefined, identity },
        { antifraude: false, presente: false },
      ),
    );
  }
  const provider = preparos[0].provider!;
  const buyer = preparos[0].buyer;
  const total = preparos.reduce((s, p) => s + p.price.totalCents, 0);
  // Todos vencem juntos: o menor prazo de reserva entre as rifas.
  const expiresAt = new Date(Math.min(...preparos.map((p) => p.expiresAt.getTime())));

  const { carrinho, pedidos } = await comCodigoLivre(
    () =>
      db.transaction(async (tx) => {
        // O carrinho é um pedido aberto só, com a soma das cotas.
        await reservaAbertaNaTransacao(tx, buyer.id, preparos.reduce((s, p) => s + p.quantity, 0));
        const [carrinho] = await tx
          .insert(carrinhoPedidos)
          .values({ codigo: codigoDoCarrinho(), buyerId: buyer.id, totalCents: total, expiresAt })
          .returning();
        const pedidos = [];
        for (const p of preparos) {
          try {
            pedidos.push(await inserirPedido(tx, p, randomOrderCode(), { carrinhoId: carrinho.id, expiresAt }));
          } catch (err) {
            // A tela precisa saber de qual rifa era o número levado, para sortear de novo só nela.
            throw Object.assign(err as Error, { slug: p.campaign.slug });
          }
        }
        return { carrinho, pedidos };
      }),
    (err) => isOrderCodeConflict(err) || isUniqueViolation(err, "uq_carrinho_codigo"),
  );

  const devolverTudo = () =>
    Promise.all(
      pedidos.map((x) =>
        devolverReserva(x.order.id).catch((e) =>
          console.error(`[carrinho] não devolveu a reserva do pedido ${x.order.code}:`, e),
        ),
      ),
    );

  let charge: Awaited<ReturnType<typeof provider.createPixCharge>>;
  try {
    const partes = await Promise.all(
      preparos.map(async (p) => ({
        amountCents: p.price.totalCents,
        ...(await parteDaOrganizacao(p.campaign.organizationId, p.comissaoGuardada ? p.attribution.comissaoPct : 0)),
      })),
    );
    const split = splitDoCarrinho(partes.map((x) => ({ walletId: x.walletId, amountCents: x.amountCents, percentualDoPromotor: x.percentual })));
    charge = await provider.createPixCharge({
      orderCode: carrinho.codigo,
      amountCents: total,
      description: `Carrinho — ${pedidos.length} rifa(s)`,
      payer: { name: buyer.name, phone: buyer.phone, cpf: buyer.cpf ?? preparos[0].input.buyer.cpf ?? undefined },
      expiresAt,
      split: split.length ? split : undefined,
    });
  } catch (err) {
    await devolverTudo();
    console.error(`[carrinho] Pix do carrinho ${carrinho.codigo} recusado:`, (err as Error).message);
    if ((err as { status?: number }).status === 400) throw new OrderError((err as Error).message, 400);
    throw new OrderError("Não foi possível gerar o Pix agora. Tente de novo em instantes.", 502);
  }

  const cobranca = {
    pspProvider: charge.provider,
    pspChargeId: charge.chargeId,
    pixQr: charge.qr,
    pixCopyPaste: charge.copyPaste,
  };
  const [comCobranca] = await db.update(carrinhoPedidos).set(cobranca).where(eq(carrinhoPedidos.id, carrinho.id)).returning();
  await db.update(orders).set(cobranca).where(eq(orders.carrinhoId, carrinho.id));

  for (const p of preparos) {
    if (shouldEnterEndgame(p.stats, p.campaign.totalQuotas)) {
      await enterEndgame(p.campaign.id, p.campaign.totalQuotas);
    }
  }
  // Indicação: a primeira compra paga do indicado — o primeiro pedido basta.
  await registrarIndicacao({ codigo: input.indicacao, indicadoId: buyer.id, orderId: pedidos[0].order.id }).catch((e) =>
    console.error(`[bonus] indicação do carrinho ${carrinho.codigo} não anotada:`, e),
  );

  return {
    carrinho: comCobranca,
    pedidos: pedidos.map((x, i) => ({ order: x.order, numbers: x.numbers, campaign: preparos[i].campaign })),
  };
}

/** O carrinho pelo código (a tela do Pix pergunta por aqui até o webhook chegar). */
export async function cartByCode(codigo: number) {
  if (!Number.isInteger(codigo)) return null;
  const [carrinho] = await db.select().from(carrinhoPedidos).where(eq(carrinhoPedidos.codigo, codigo));
  if (!carrinho) return null;
  const pedidos = await db
    .select({ order: orders, campaign: campaigns, orgNome: organizations.name, orgSlug: organizations.slug })
    .from(orders)
    .innerJoin(campaigns, eq(campaigns.id, orders.campaignId))
    .innerJoin(organizations, eq(organizations.id, campaigns.organizationId))
    .where(eq(orders.carrinhoId, carrinho.id))
    .orderBy(orders.createdAt);
  return { carrinho, pedidos };
}

/**
 * Confirma o pagamento. Idempotente: chamar duas vezes não duplica comissão
 * nem conta a venda de novo.
 */
/**
 * Núcleo do "virou pago": move cotas, conta receita, revela cota premiada e
 * cria a comissão. Usado pelo webhook do Pix e pela confirmação do cambista —
 * duas portas, uma regra só.
 */
async function settleOrderAsPaid(order: typeof orders.$inferSelect) {
  const [campaign] = await db
    .select()
    .from(campaigns)
    .where(eq(campaigns.id, order.campaignId));

  // O contrato da organização é lido antes da transação: a consulta não
  // muda nada e mantém o BEGIN curto.
  const plano = campaign
    ? await planOfOrganization(campaign.organizationId)
    : FREE_PLAN;
  const [org] = campaign
    ? await db
        .select({ liberacao: organizations.liberacaoComissao })
        .from(organizations)
        .where(eq(organizations.id, campaign.organizationId))
    : [];
  const liberacao = org?.liberacao ?? "apos_sorteio";
  // Programa de bônus: lido antes da transação, como o contrato.
  const bonus = await getPlataforma();
  // Marketing (etapa 16): para onde a compra vai pelo servidor, decidido fora
  // do BEGIN (decifra chave). Falha aqui não pode derrubar o pagamento.
  const destinos = await destinosDaCompra(order).catch((e) => {
    console.error(`[marketing] destinos do pedido ${order.code}:`, e);
    return [];
  });

  const paidAt = new Date();

  const result = await db.transaction(async (tx) => {
    const [updated] = await tx
      .update(orders)
      .set({ status: "paid", paidAt })
      .where(and(eq(orders.id, order.id), eq(orders.status, "pending")))
      .returning();

    // Outra chamada ganhou a corrida: nada a fazer.
    if (!updated) return null;

    const numbers = await confirmPaid(tx, {
      campaignId: order.campaignId,
      orderId: order.id,
      amountCents: order.amountCents,
    });

    const prizes = numbers.length
      ? await tx
          .update(prizedQuotas)
          .set({ claimedByOrderId: order.id, claimedAt: paidAt })
          .where(
            and(
              eq(prizedQuotas.campaignId, order.campaignId),
              sql`${prizedQuotas.number} = ANY(${intArray(numbers)}::int[])`,
              sql`${prizedQuotas.claimedByOrderId} IS NULL`,
            ),
          )
          .returning({ label: prizedQuotas.prizeLabel, number: prizedQuotas.number })
      : [];

    // O rateio da venda, na ordem que não se negocia: a plataforma sai
    // antes, e a comissão incide sobre o que sobrou. Ver `splitOrder()`.
    // O percentual do termo fotografado na publicação da rifa (ou, sem
    // termo, o combinado de antes) — ver `comissaoNaRifa()`.
    const daRifa =
      order.affiliateId && campaign ? await comissaoNaRifa(tx, order.affiliateId, campaign) : null;

    // Com o presente, a compra foi paga por dois: o comprador e a
    // plataforma. O rateio corre sobre a soma — a promotora e o afiliado
    // recebem como se fosse o preço cheio — e a parte da promotora no
    // desconto vira crédito dela (`creditoDoPresente`).
    const rateio = splitOrder({
      paidCents: order.amountCents + order.presenteCents,
      platformPct: platformPctFor(plano),
      commissionPct: order.affiliateId ? (daRifa?.pct ?? 0) : 0,
    });

    if (order.presenteCents > 0 && campaign) {
      await lancarCreditoDoPresente(tx, {
        organizationId: campaign.organizationId,
        orderId: order.id,
        presenteCents: order.presenteCents,
        platformPct: rateio.platformPct,
        commissionPct: rateio.commissionPct,
        comissaoGuardada: order.comissaoGuardada,
      });
    }

    if (rateio.platformFeeCents > 0 && campaign) {
      await lancarTaxaDaVenda(tx, {
        organizationId: campaign.organizationId,
        orderId: order.id,
        amountCents: rateio.platformFeeCents,
        pct: rateio.platformPct,
      });
    }

    if (order.affiliateId && rateio.commissionCents > 0) {
      await tx
        .insert(commissions)
        .values({
          affiliateId: order.affiliateId,
          orderId: order.id,
          campaignId: order.campaignId,
          amountCents: rateio.commissionCents,
          pct: rateio.commissionPct,
          guardada: order.comissaoGuardada,
          // Depois do sorteio (padrão, com carência) ou na hora — escolha da
          // organização; guardada pela plataforma, sempre depois do sorteio.
          // Ver `comissaoInicial()`.
          ...comissaoInicial(
            liberacao,
            paidAt,
            commissionAvailableAt(paidAt, REFUND_WINDOW_DAYS, campaign?.drawAt),
            order.comissaoGuardada,
          ),
        })
        .onConflictDoNothing();
    }

    // Indicação: o primeiro pagamento do indicado credita quem indicou, na
    // mesma transação (estorno desfaz na do estorno — `estornarIndicacao`).
    const indicadorId =
      bonus.bonusLigado && order.method !== "bonus"
        ? await confirmarIndicacao(tx, order, bonus.bonusPorIndicacao)
        : null;

    // A compra para as plataformas de anúncio nasce com o pagamento: se a
    // transação cair, o evento cai junto. Quem manda é o relógio.
    await enfileirarCompra(tx, order.id, destinos);

    return { order: updated, numbers, prizes, indicadorId };
  });

  if (!result) return null;

  // Metas: depois da transação e sem derrubar o pagamento (a venda já aconteceu).
  if (bonus.bonusLigado) {
    for (const quem of [order.buyerId, result.indicadorId].filter(Boolean) as string[]) {
      await avaliarMetas(quem).catch((e) => console.error(`[bonus] metas de ${quem}:`, e));
    }
  }

  await announcePayment({
    orderId: order.id,
    campaignTitle: campaign?.title ?? "",
    campaignTotal: campaign?.totalQuotas ?? 0,
    numbers: result.numbers,
    prizes: result.prizes,
  });

  return result;
}

export async function markOrderPaid(chargeId: string) {
  const achados = await db
    .select()
    .from(orders)
    .where(eq(orders.pspChargeId, chargeId));

  if (achados.length === 0) throw new OrderError("Pedido não encontrado para esta cobrança.", 404);
  // Carrinho num Pix só: a cobrança paga vários pedidos, cada um pelo seu núcleo.
  if (achados.length > 1 || achados[0].carrinhoId) return marcarCarrinhoPago(achados);
  const [order] = achados;
  if (order.status === "paid") return { order, alreadyPaid: true, prizes: [] as string[] };
  if (order.status !== "pending") {
    throw new OrderError(`Pedido ${order.code} está ${order.status}.`, 409);
  }

  const result = await settleOrderAsPaid(order);

  if (!result) {
    const [fresh] = await db.select().from(orders).where(eq(orders.id, order.id));
    return { order: fresh, alreadyPaid: true, prizes: [] as string[] };
  }

  return {
    order: result.order,
    alreadyPaid: false,
    prizes: result.prizes.map((p) => `${p.number} — ${p.label}`),
  };
}

/**
 * O Pix do carrinho chegou: cada pedido vira pago pelo mesmo núcleo do
 * avulso (`settleOrderAsPaid`), numa transação por pedido — idempotente
 * como ele. Pedido que já não estava esperando (venceu antes do Pix) não é
 * reaberto: vai para o log, porque é dinheiro que entrou sem cota.
 */
async function marcarCarrinhoPago(pedidos: (typeof orders.$inferSelect)[]) {
  const prizes: string[] = [];
  let pagos = 0;
  for (const order of pedidos) {
    if (order.status !== "pending") {
      if (order.status !== "paid") {
        console.error(`[carrinho] Pix pago com o pedido ${order.code} ${order.status}: devolver ${order.amountCents} centavos.`);
      }
      continue;
    }
    const r = await settleOrderAsPaid(order);
    if (r) {
      pagos++;
      prizes.push(...r.prizes.map((p) => `${p.number} — ${p.label}`));
    }
  }
  const [fresh] = await db.select().from(orders).where(eq(orders.id, pedidos[0].id));
  return { order: fresh, alreadyPaid: pagos === 0, prizes };
}

/* ------------------------------------------------------------------ *
 * Venda física do cambista
 * ------------------------------------------------------------------ */

export type MetodoFisico = "dinheiro" | "cartao_maquininha" | "pix_maquininha";

/**
 * Reserva as cotas ANTES de cobrar. Cobrar o cartão e só depois tentar
 * reservar é como se perde a cota com o dinheiro já debitado.
 */
export async function createSellerSale(
  input: CreateOrderInput,
  sellerId: string,
  identity?: RequestIdentity,
) {
  return createOrder(input, { sellerId, identity });
}

/** O cambista recolheu: o pedido vira pago sem passar por provedor. */
export async function confirmSellerSale(params: {
  code: number;
  sellerId: string;
  method: MetodoFisico;
  posAuthCode?: string;
  posTerminal?: string;
}) {
  const [order] = await db.select().from(orders).where(eq(orders.code, params.code));
  if (!order) throw new OrderError("Venda não encontrada.", 404);
  if (order.sellerId !== params.sellerId) {
    throw new OrderError("Esta venda é de outro cambista.", 403);
  }
  if (order.status === "paid") {
    return { order, alreadyPaid: true, prizes: [] as string[] };
  }
  if (order.status !== "pending") {
    throw new OrderError(`Esta venda está ${order.status}.`, 409);
  }

  const meios = await getPaymentMethods();
  if (!meios[params.method]) {
    throw new OrderError(
      `${labelFor(params.method)} está desligado pela administração.`,
      409,
    );
  }

  await db
    .update(orders)
    .set({
      method: params.method,
      posAuthCode: params.posAuthCode ?? null,
      posTerminal: params.posTerminal ?? null,
    })
    .where(eq(orders.id, order.id));

  const atualizado = { ...order, method: params.method };
  const result = await settleOrderAsPaid(atualizado);

  if (!result) {
    const [fresh] = await db.select().from(orders).where(eq(orders.id, order.id));
    return { order: fresh, alreadyPaid: true, prizes: [] as string[] };
  }

  return {
    order: result.order,
    alreadyPaid: false,
    prizes: result.prizes.map((p) => `${p.number} — ${p.label}`),
  };
}

/** Cartão recusado ou cliente desistiu: devolve as cotas na hora. */
export async function cancelSellerSale(params: { code: number; sellerId: string }) {
  const [order] = await db.select().from(orders).where(eq(orders.code, params.code));
  if (!order) throw new OrderError("Venda não encontrada.", 404);
  if (order.sellerId !== params.sellerId) {
    throw new OrderError("Esta venda é de outro cambista.", 403);
  }
  if (order.status !== "pending") {
    throw new OrderError("Só dá para cancelar venda ainda não paga.", 409);
  }

  await devolverReserva(order.id);
  return { canceled: order.code };
}

/**
 * Devolve na hora as cotas de um pedido que não vai ser pago: venda física
 * cancelada ou Pix que o provedor recusou gerar. Sem isto, os números ficariam
 * presos até a reserva vencer.
 *
 * O pedido é marcado primeiro, num `UPDATE` condicional: se o pagamento
 * chegou no meio, nada é devolvido. E em endgame o número volta para o
 * `free_pool` — é a invariante 3 ao contrário; sem isso ele some do estoque.
 */
export async function devolverReserva(orderId: string): Promise<number> {
  return db.transaction(async (tx) => {
    const [pedido] = await tx
      .update(orders)
      .set({ status: "expired" })
      .where(and(eq(orders.id, orderId), eq(orders.status, "pending")))
      .returning({ campaignId: orders.campaignId });
    if (!pedido) return 0;

    const devolvidas = await tx
      .delete(quotaAlloc)
      .where(and(eq(quotaAlloc.orderId, orderId), eq(quotaAlloc.status, "reserved")))
      .returning({ number: quotaAlloc.number });
    if (devolvidas.length === 0) return 0;

    const [stats] = await tx
      .update(campaignStats)
      .set({
        reservedCount: sql`greatest(0, ${campaignStats.reservedCount} - ${devolvidas.length})`,
        updatedAt: new Date(),
      })
      .where(eq(campaignStats.campaignId, pedido.campaignId))
      .returning({ endgame: campaignStats.endgame });

    if (stats?.endgame) {
      await tx.execute(sql`
        INSERT INTO free_pool (campaign_id, number)
        SELECT ${pedido.campaignId}::uuid, n
          FROM unnest(${intArray(devolvidas.map((d) => d.number))}::int[]) AS n
        ON CONFLICT DO NOTHING
      `);
    }
    return devolvidas.length;
  });
}

/** Confirmação para o comprador, prêmio revelado e aviso ao afiliado. */
async function announcePayment(params: {
  orderId: string;
  campaignTitle: string;
  campaignTotal: number;
  numbers: number[];
  prizes: { number: number; label: string }[];
}) {
  const [row] = await db
    .select({ order: orders, buyer: buyers })
    .from(orders)
    .innerJoin(buyers, eq(buyers.id, orders.buyerId))
    .where(eq(orders.id, params.orderId));
  if (!row) return;

  const shown = params.numbers
    .slice(0, 10)
    .map((n) => formatQuota(n, params.campaignTotal))
    .join(", ");
  const numeros =
    params.numbers.length > 10 ? `${shown} e mais ${params.numbers.length - 10}` : shown;

  await notify({
    to: row.buyer.phone,
    template: "pagamento_confirmado",
    params: {
      nome: row.buyer.name.split(" ")[0],
      rifa: params.campaignTitle,
      quantidade: String(params.numbers.length),
      numeros,
      link: publicUrl(`/pedido/${row.order.code}`),
    },
    dedupeKey: `order:${row.order.id}:pagamento_confirmado`,
  });

  for (const prize of params.prizes) {
    await notify({
      to: row.buyer.phone,
      template: "cota_premiada",
      params: {
        nome: row.buyer.name.split(" ")[0],
        premio: prize.label,
        numero: formatQuota(prize.number, params.campaignTotal),
      },
      dedupeKey: `order:${row.order.id}:premio:${prize.number}`,
    });
  }

  if (row.order.affiliateId) {
    const [aff] = await db
      .select({ phone: users.phone, name: users.name })
      .from(affiliates)
      .innerJoin(users, eq(users.id, affiliates.userId))
      .where(eq(affiliates.id, row.order.affiliateId));

    const [commission] = await db
      .select()
      .from(commissions)
      .where(eq(commissions.orderId, row.order.id));

    if (aff?.phone && commission) {
      await notify({
        to: aff.phone,
        template: "venda_afiliado",
        params: {
          nome: aff.name.split(" ")[0],
          valor: formatBRL(row.order.amountCents),
          comissao: formatBRL(commission.amountCents),
          rifa: params.campaignTitle,
        },
        dedupeKey: `order:${row.order.id}:venda_afiliado`,
      });
    }
  }
}

export async function orderByCode(code: number) {
  const [row] = await db
    .select({ order: orders, campaign: campaigns, buyer: buyers })
    .from(orders)
    .innerJoin(campaigns, eq(campaigns.id, orders.campaignId))
    .innerJoin(buyers, eq(buyers.id, orders.buyerId))
    .where(eq(orders.code, code));
  if (!row) return null;

  const numbers = await db
    .select({ number: quotaAlloc.number })
    .from(quotaAlloc)
    .where(eq(quotaAlloc.orderId, row.order.id))
    .orderBy(quotaAlloc.number);

  const prizes = await db
    .select({ number: prizedQuotas.number, label: prizedQuotas.prizeLabel })
    .from(prizedQuotas)
    .where(eq(prizedQuotas.claimedByOrderId, row.order.id));

  return { ...row, numbers: numbers.map((n) => n.number), prizes };
}

/** "Minhas cotas": tudo que um telefone comprou, sem senha. */
/**
 * As compras do telefone que a sessão pode ver — a regra é
 * `pedidoVisivel()` em `shared/contaComprador.ts`, aqui em SQL.
 */
export async function ordersByPhone(
  phone: string,
  t: Titularidade = { telefoneConfirmado: true, comprasVinculadasEm: null },
) {
  const digits = normalizePhone(phone);
  return db
    .select({
      order: orders,
      campaign: {
        title: campaigns.title,
        slug: campaigns.slug,
        totalQuotas: campaigns.totalQuotas,
        status: campaigns.status,
        drawAt: campaigns.drawAt,
        prizeTitle: campaigns.prizeTitle,
      },
      // "Minhas compras" agrupa por rifa com o perfil do organizador.
      organizador: { nome: organizations.name, slug: organizations.slug },
      numbers: sql<number[]>`coalesce(array_agg(${quotaAlloc.number} ORDER BY ${quotaAlloc.number})
        FILTER (WHERE ${quotaAlloc.number} IS NOT NULL), '{}')`,
    })
    .from(orders)
    .innerJoin(buyers, eq(buyers.id, orders.buyerId))
    .innerJoin(campaigns, eq(campaigns.id, orders.campaignId))
    .leftJoin(organizations, eq(organizations.id, campaigns.organizationId))
    .leftJoin(quotaAlloc, eq(quotaAlloc.orderId, orders.id))
    .where(
      t.telefoneConfirmado
        ? eq(buyers.phone, digits)
        : and(
            eq(buyers.phone, digits),
            t.comprasVinculadasEm
              ? or(eq(orders.viaConta, true), lte(orders.createdAt, t.comprasVinculadasEm))
              : eq(orders.viaConta, true),
          ),
    )
    .groupBy(
      orders.id,
      campaigns.title,
      campaigns.slug,
      campaigns.totalQuotas,
      campaigns.status,
      campaigns.drawAt,
      campaigns.prizeTitle,
      organizations.name,
      organizations.slug,
    )
    .orderBy(desc(orders.createdAt));
}

/* ------------------------------------------------------------------ *
 * Estorno
 * ------------------------------------------------------------------ */

export interface RefundResult {
  order: typeof orders.$inferSelect;
  /** Números devolvidos ao estoque. Vazio quando a rifa já foi sorteada. */
  liberadas: number[];
  /** Comissões revertidas. */
  comissoes: number;
  /**
   * Comissão que **já tinha sido paga** ao afiliado quando o estorno chegou.
   * Revertida na conta, mas o dinheiro já saiu: vira cobrança a fazer, e por
   * isso volta daqui em vez de sumir calada.
   */
  comissaoJaPagaCents: number;
  /** Taxa da plataforma cancelada. */
  taxaCanceladaCents: number;
  /** Cotas premiadas que voltaram a valer. */
  premiadasLiberadas: number;
}

/**
 * Estorna um pedido pago.
 *
 * Desfaz tudo que o pagamento criou, na mesma transação e na ordem inversa:
 * devolve as cotas ao estoque, reverte a comissão, cancela a taxa da
 * plataforma e solta a cota premiada que aquele pedido tinha reclamado.
 *
 * **A cota só volta ao estoque se a rifa ainda não foi sorteada.** Depois do
 * sorteio o número está congelado: quem conferir o resultado precisa
 * encontrar exatamente o quadro que existia quando o número saiu, e devolver
 * uma cota mudaria esse quadro. Nesse caso o estorno vira só dinheiro — o
 * pedido fica `refunded`, as contas são desfeitas, e a cota permanece onde
 * estava.
 *
 * Idempotente: só age sobre pedido `paid`, e o `UPDATE` condicional garante
 * que duas chamadas simultâneas não dupliquem nada.
 */
export async function refundOrder(orderId: string): Promise<RefundResult | null> {
  const [order] = await db.select().from(orders).where(eq(orders.id, orderId));
  if (!order) throw new OrderError("Pedido não encontrado.", 404);
  if (order.status !== "paid") {
    // Já estornado, ou nunca pago: nada a desfazer.
    return null;
  }

  const [campaign] = await db
    .select()
    .from(campaigns)
    .where(eq(campaigns.id, order.campaignId));

  // O sorteio congela o quadro. Basta ter sido executado uma vez.
  const [draw] = await db
    .select({ executedAt: draws.executedAt })
    .from(draws)
    .where(eq(draws.campaignId, order.campaignId));
  const jaSorteada = Boolean(draw?.executedAt);

  return db.transaction(async (tx) => {
    const [atualizado] = await tx
      .update(orders)
      .set({ status: "refunded" })
      .where(and(eq(orders.id, order.id), eq(orders.status, "paid")))
      .returning();

    // Outra chamada ganhou a corrida.
    if (!atualizado) return null;

    const liberadas = jaSorteada
      ? []
      : await releasePaidQuotas(tx, {
          campaignId: order.campaignId,
          orderId: order.id,
          amountCents: order.amountCents,
        });

    // A cota premiada que este pedido reclamou volta a valer — o prêmio não
    // foi pago por quem estornou.
    const premiadas = jaSorteada
      ? []
      : await tx
          .update(prizedQuotas)
          .set({ claimedByOrderId: null, claimedAt: null })
          .where(eq(prizedQuotas.claimedByOrderId, order.id))
          .returning({ id: prizedQuotas.id });

    const revertidas = await tx
      .update(commissions)
      .set({ status: "reversed" })
      .where(
        and(eq(commissions.orderId, order.id), sql`${commissions.status} <> 'reversed'`),
      )
      .returning({ amountCents: commissions.amountCents, status: commissions.status });

    // O que já tinha virado saque pago não volta sozinho: a carência existe
    // para isso não acontecer, mas estorno tardio acontece.
    const jaPaga = revertidas
      .filter((c) => c.status === "paid")
      .reduce((soma, c) => soma + c.amountCents, 0);

    // Bônus da indicação que este pedido confirmou sai junto (etapa 13).
    await estornarIndicacao(tx, order.id);
    // E o crédito do presente que a plataforma devia à promotora.
    await cancelarCreditoDoPresente(tx, order.id);

    const taxas = await tx
      .update(platformCharges)
      .set({ status: "cancelada" })
      .where(
        and(
          eq(platformCharges.orderId, order.id),
          sql`${platformCharges.status} <> 'cancelada'`,
        ),
      )
      .returning({ amountCents: platformCharges.amountCents });

    return {
      order: atualizado,
      liberadas,
      comissoes: revertidas.length,
      comissaoJaPagaCents: jaPaga,
      taxaCanceladaCents: taxas.reduce((soma, t) => soma + t.amountCents, 0),
      premiadasLiberadas: premiadas.length,
    };
  }).then(async (r) => {
    if (r) await anunciarEstorno(r.order, campaign?.title ?? "", r.liberadas.length);
    return r;
  });
}

/**
 * Avisa o comprador do estorno.
 *
 * Fora da transação e com falha engolida, pela mesma regra do pagamento:
 * mensagem que não sai não pode desfazer o estorno que já aconteceu no banco.
 */
async function anunciarEstorno(
  order: typeof orders.$inferSelect,
  campanha: string,
  liberadas: number,
) {
  try {
    const [comprador] = await db.select().from(buyers).where(eq(buyers.id, order.buyerId));
    if (!comprador?.phone) return;

    const nome = comprador.name.split(" ")[0] ?? comprador.name;
    const valor = formatBRL(order.amountCents);

    // Nada liberado significa rifa já sorteada: dizer que as cotas voltaram
    // seria mentira, e o comprador iria procurar números que continuam lá.
    await notify({
      to: comprador.phone,
      ...(liberadas === 0
        ? {
            template: "estorno_pos_sorteio" as const,
            params: { nome, rifa: campanha, valor },
          }
        : {
            template: "estorno_confirmado" as const,
            params: { nome, rifa: campanha, valor, quantidade: String(liberadas) },
          }),
      dedupeKey: `estorno:${order.id}`,
    });
  } catch (err) {
    console.error("[estorno] aviso não enviado:", err);
  }
}

/**
 * Estorno vindo do provedor, achado pela cobrança. O provedor só avisa
 * "estornada" quando a cobrança **inteira** voltou (devolução parcial não
 * muda o status), então no carrinho todos os pedidos dela são desfeitos —
 * o dinheiro de todos saiu. `refundOrder` é idempotente: o que já tinha
 * sido estornado pelo chamado não é desfeito de novo.
 */
export async function refundByChargeId(chargeId: string) {
  const pedidos = await db.select({ id: orders.id }).from(orders).where(eq(orders.pspChargeId, chargeId));
  if (pedidos.length === 0) throw new OrderError("Pedido não encontrado para esta cobrança.", 404);
  const feitos: RefundResult[] = [];
  for (const p of pedidos) {
    const r = await refundOrder(p.id);
    if (r) feitos.push(r);
  }
  return feitos;
}

/* ------------------------------------------------------------------ *
 * Resgate de cotas de bônus (etapa 13)
 * ------------------------------------------------------------------ */

/**
 * Cota grátis do programa de bônus: um pedido de R$ 0,00 pelo **mesmo**
 * caminho de reserva das vendas (`reserveRandom`, `INSERT … ON CONFLICT`),
 * e confirmado pelo mesmo núcleo do pagamento (`settleOrderAsPaid`) — sem
 * comissão e sem taxa, porque não entrou dinheiro.
 *
 * O saldo sai num `UPDATE` condicional (saldo ≥ pedido) na mesma transação
 * que reserva as cotas: sem cota livre, nada sai do saldo.
 */
export async function resgatarCotasDeBonus(buyerId: string, campaignId: string, quantidade: number) {
  const [campaign] = await db.select().from(campaigns).where(eq(campaigns.id, campaignId));
  if (!campaign) throw new OrderError("Rifa não encontrada.", 404);
  const [comprador] = await db.select().from(buyers).where(eq(buyers.id, buyerId));
  if (!comprador || comprador.excluidoEm) throw new OrderError("Entre de novo na sua conta.", 401);
  const cfg = await getPlataforma();
  const bloqueio = bloqueioDoResgate({
    bonusLigado: cfg.bonusLigado,
    aceitaCotaBonus: campaign.aceitaCotaBonus,
    statusRifa: campaign.status,
    sorteioEm: campaign.drawAt,
    saldo: comprador.bonusSaldo,
    quantidade,
  });
  if (bloqueio) throw new OrderError(bloqueio, 409);

  const [stats] = await db.select().from(campaignStats).where(eq(campaignStats.campaignId, campaign.id));
  if (!stats) throw new OrderError("Campanha sem contadores.", 500);
  const expiresAt = new Date(Date.now() + campaign.reservationTtlMin * 60_000);

  const resgatar = (code: number) =>
    db.transaction(async (tx) => {
      const [debitado] = await tx
        .update(buyers)
        .set({ bonusSaldo: sql`${buyers.bonusSaldo} - ${quantidade}` })
        .where(and(eq(buyers.id, buyerId), sql`${buyers.bonusSaldo} >= ${quantidade}`))
        .returning({ id: buyers.id });
      if (!debitado) throw new OrderError("Saldo de bônus insuficiente.", 409);

      const [created] = await tx
        .insert(orders)
        .values({
          code,
          campaignId: campaign.id,
          buyerId,
          quantity: quantidade,
          amountCents: 0,
          discountCents: 0,
          status: "pending",
          method: "bonus",
          viaConta: true,
          expiresAt,
        })
        .returning();

      const reserved = await reserveRandom(tx, {
        campaignId: campaign.id,
        totalQuotas: campaign.totalQuotas,
        count: quantidade,
        orderId: created.id,
        reservedUntil: expiresAt,
        endgame: stats.endgame,
      });
      await bumpReserved(tx, campaign.id, reserved.numbers.length);

      // O saldo já saiu acima; o lançamento é o registro (chave do pedido).
      await tx.insert(bonusLancamentosTabela).values({
        buyerId,
        quantidade: -quantidade,
        motivo: "resgate",
        chave: `resgate:${created.id}`,
        descricao: `Resgate em ${campaign.title}`,
        orderId: created.id,
      });
      return created;
    });

  let pedido: typeof orders.$inferSelect | undefined;
  for (let tentativa = 0; tentativa < ORDER_CODE_RETRIES; tentativa++) {
    try {
      pedido = await resgatar(randomOrderCode());
      break;
    } catch (err) {
      if (!isOrderCodeConflict(err)) throw err;
    }
  }
  if (!pedido) throw new OrderError("Não foi possível gerar o número do pedido.", 500);

  const r = await settleOrderAsPaid(pedido);
  if (shouldEnterEndgame(stats, campaign.totalQuotas)) {
    await enterEndgame(campaign.id, campaign.totalQuotas);
  }
  return { code: pedido.code, numbers: r?.numbers ?? [] };
}
