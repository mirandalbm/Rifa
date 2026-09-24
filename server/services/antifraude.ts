/**
 * Antifraude.
 *
 * Duas ideias governam este arquivo:
 *
 * 1. **O ataque que dói é bloqueio de estoque.** Reservar cota e não pagar é
 *    barato, some sozinho quando expira e, enquanto dura, a rifa parece
 *    vendida. Por isso o limite mais apertado é o de reserva em aberto.
 * 2. **Dado pessoal não vira chave crua.** IP e identificador de aparelho
 *    entram como hash; telefone aparece mascarado no registro. Um vazamento
 *    da tabela de fraude não pode virar lista de telefones.
 */
import { createHash } from "node:crypto";
import { and, eq, gt, sql, isNull, or, desc } from "drizzle-orm";
import { db } from "../db";
import {
  rateEvents,
  fraudEvents,
  fraudBlocks,
  orders,
  buyers,
  quotaAlloc,
  affiliates,
  users,
} from "@shared/schema";
import {
  DEFAULT_LIMITS,
  WINDOWS,
  validateLimits,
  type AntiFraudLimits,
  type FraudCheckResult,
  type BlockKind,
} from "@shared/antifraude";
import { normalizePhone, hidePhone } from "@shared/format";
import { appSettings } from "@shared/schema";

const LIMITS_KEY = "antifraude";

/* ------------------------------------------------------------------ *
 * Configuração
 * ------------------------------------------------------------------ */

export async function getLimits(): Promise<AntiFraudLimits> {
  const [row] = await db
    .select()
    .from(appSettings)
    .where(eq(appSettings.key, LIMITS_KEY));
  if (!row) return DEFAULT_LIMITS;
  try {
    return validateLimits(row.value as Partial<AntiFraudLimits>);
  } catch {
    return DEFAULT_LIMITS;
  }
}

export async function setLimits(
  candidate: Partial<AntiFraudLimits>,
): Promise<AntiFraudLimits> {
  const value = validateLimits(candidate);
  await db
    .insert(appSettings)
    .values({ key: LIMITS_KEY, value })
    .onConflictDoUpdate({
      target: appSettings.key,
      set: { value, updatedAt: new Date() },
    });
  return value;
}

/* ------------------------------------------------------------------ *
 * Identificadores
 * ------------------------------------------------------------------ */

export function hashValue(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 32);
}

export interface RequestIdentity {
  ipHash: string | null;
  deviceHash: string | null;
}

/** Lê IP e aparelho da requisição já em hash. */
export function identify(req: {
  ip?: string;
  get(name: string): string | undefined;
}): RequestIdentity {
  const device = req.get("x-device-id");
  return {
    ipHash: req.ip ? hashValue(req.ip) : null,
    deviceHash: device ? hashValue(device) : null,
  };
}

/* ------------------------------------------------------------------ *
 * Janela deslizante
 * ------------------------------------------------------------------ */

async function countInWindow(bucket: string, minutes: number): Promise<number> {
  const desde = new Date(Date.now() - minutes * 60_000);
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(rateEvents)
    .where(and(eq(rateEvents.bucket, bucket), gt(rateEvents.createdAt, desde)));
  return row?.n ?? 0;
}

async function record(bucket: string) {
  await db.insert(rateEvents).values({ bucket });
}

/**
 * Conta e registra numa tacada. Registrar mesmo quando bloqueia é de
 * propósito: quem insiste continua contando, e a janela não zera por
 * tentativa recusada.
 */
async function hit(
  bucket: string,
  minutes: number,
  limit: number,
): Promise<{ excedeu: boolean; atual: number }> {
  const atual = await countInWindow(bucket, minutes);
  await record(bucket);
  return { excedeu: atual >= limit, atual: atual + 1 };
}

/* ------------------------------------------------------------------ *
 * Registro e bloqueio
 * ------------------------------------------------------------------ */

async function flag(params: {
  rule: string;
  reason: string;
  subject?: string | null;
  campaignId?: string | null;
  detail?: unknown;
}) {
  await db.insert(fraudEvents).values({
    rule: params.rule,
    reason: params.reason,
    subject: params.subject ?? null,
    campaignId: params.campaignId ?? null,
    detail: params.detail as never,
  });
}

export async function isBlocked(kind: BlockKind, value: string): Promise<boolean> {
  if (!value) return false;
  const [row] = await db
    .select({ id: fraudBlocks.id })
    .from(fraudBlocks)
    .where(
      and(
        eq(fraudBlocks.kind, kind),
        eq(fraudBlocks.value, value),
        or(isNull(fraudBlocks.expiresAt), gt(fraudBlocks.expiresAt, new Date())),
      ),
    );
  return Boolean(row);
}

export async function block(params: {
  kind: BlockKind;
  value: string;
  reason?: string;
  expiresAt?: Date | null;
}) {
  const [row] = await db
    .insert(fraudBlocks)
    .values({
      kind: params.kind,
      value: params.value,
      reason: params.reason ?? null,
      expiresAt: params.expiresAt ?? null,
    })
    .onConflictDoUpdate({
      target: [fraudBlocks.kind, fraudBlocks.value],
      set: { reason: params.reason ?? null, expiresAt: params.expiresAt ?? null },
    })
    .returning();
  return row;
}

export async function unblock(id: string) {
  const [row] = await db.delete(fraudBlocks).where(eq(fraudBlocks.id, id)).returning();
  return row ?? null;
}

export async function listBlocks() {
  return db.select().from(fraudBlocks).orderBy(desc(fraudBlocks.createdAt)).limit(200);
}

export async function listEvents(limit = 100) {
  return db.select().from(fraudEvents).orderBy(desc(fraudEvents.createdAt)).limit(limit);
}

/* ------------------------------------------------------------------ *
 * O guarda da criação de pedido
 * ------------------------------------------------------------------ */

export interface OrderGuardInput {
  phone: string;
  identity: RequestIdentity;
  campaignId: string;
  quantity: number;
  /** Cambista vende na mão: os limites de comprador não se aplicam a ele. */
  bySeller?: boolean;
  affiliateCode?: string;
}

export async function guardOrder(input: OrderGuardInput): Promise<FraudCheckResult> {
  const limits = await getLimits();
  const phone = normalizePhone(input.phone);
  const { ipHash, deviceHash } = input.identity;

  const recusar = async (
    rule: string,
    reason: string,
    detail?: unknown,
  ): Promise<FraudCheckResult> => {
    await flag({
      rule,
      reason,
      subject: hidePhone(phone),
      campaignId: input.campaignId,
      detail,
    });
    return { allowed: false, reason, rule };
  };

  /* --- bloqueios manuais do administrador --- */

  if (await isBlocked("phone", phone)) {
    return recusar("bloqueio", "Este telefone está bloqueado pela administração.");
  }
  if (deviceHash && (await isBlocked("device", deviceHash))) {
    return recusar("bloqueio", "Este aparelho está bloqueado pela administração.");
  }
  if (ipHash && (await isBlocked("ip", ipHash))) {
    return recusar("bloqueio", "Acesso bloqueado pela administração.");
  }

  // A venda do cambista é presencial e já tem dono: ele responde por ela no
  // acerto, então os limites de comprador anônimo não fazem sentido aqui.
  if (input.bySeller) return { allowed: true };

  /* --- bloqueio de estoque: reserva em aberto --- */

  const [buyer] = await db.select().from(buyers).where(eq(buyers.phone, phone));

  if (buyer) {
    const [abertos] = await db
      .select({
        pedidos: sql<number>`count(*)::int`,
        cotas: sql<number>`coalesce(sum(${orders.quantity}), 0)::int`,
      })
      .from(orders)
      .where(
        and(
          eq(orders.buyerId, buyer.id),
          eq(orders.status, "pending"),
          gt(orders.expiresAt, new Date()),
        ),
      );

    if (abertos.pedidos >= limits.openOrdersPerPhone) {
      return recusar(
        "reserva_aberta",
        `Você já tem ${abertos.pedidos} pedido(s) aguardando pagamento. Pague ou aguarde expirar antes de reservar mais.`,
        { abertos: abertos.pedidos, limite: limits.openOrdersPerPhone },
      );
    }

    if (abertos.cotas + input.quantity > limits.reservedQuotasPerPhone) {
      return recusar(
        "reserva_aberta",
        `Você já tem ${abertos.cotas} cota(s) reservadas sem pagamento. O limite é ${limits.reservedQuotasPerPhone}.`,
        { reservadas: abertos.cotas, limite: limits.reservedQuotasPerPhone },
      );
    }
  }

  /* --- autoindicação por aparelho --- */

  if (limits.blockSelfReferral && input.affiliateCode && deviceHash) {
    const [afiliado] = await db
      .select({ id: affiliates.id })
      .from(affiliates)
      .where(eq(affiliates.code, input.affiliateCode.toUpperCase()));

    if (afiliado) {
      const [mesmoAparelho] = await db
        .select({ n: sql<number>`count(*)::int` })
        .from(orders)
        .where(
          and(eq(orders.affiliateId, afiliado.id), eq(orders.deviceHash, deviceHash)),
        );
      // Aparelho que já vendeu por este afiliado e agora compra por ele:
      // o padrão clássico de quem cria o próprio cliente.
      if (mesmoAparelho.n >= limits.ordersPerDevice) {
        return recusar(
          "autoindicacao",
          "Não é possível usar este link de afiliado neste aparelho.",
          { afiliado: input.affiliateCode },
        );
      }
    }
  }

  /* --- ritmo --- */

  const porTelefone = await hit(`order:phone:${phone}`, WINDOWS.orders, limits.ordersPerPhone);
  if (porTelefone.excedeu) {
    return recusar(
      "ritmo_telefone",
      "Muitas tentativas de compra seguidas. Espere alguns minutos.",
      { tentativas: porTelefone.atual, limite: limits.ordersPerPhone },
    );
  }

  if (deviceHash) {
    const porAparelho = await hit(
      `order:device:${deviceHash}`,
      WINDOWS.orders,
      limits.ordersPerDevice,
    );
    if (porAparelho.excedeu) {
      return recusar(
        "ritmo_aparelho",
        "Muitas tentativas de compra neste aparelho. Espere alguns minutos.",
        { tentativas: porAparelho.atual, limite: limits.ordersPerDevice },
      );
    }
  }

  if (ipHash) {
    const porIp = await hit(`order:ip:${ipHash}`, WINDOWS.orders, limits.ordersPerIp);
    if (porIp.excedeu) {
      return recusar("ritmo_ip", "Muitas compras vindas desta conexão. Espere alguns minutos.", {
        tentativas: porIp.atual,
        limite: limits.ordersPerIp,
      });
    }
  }

  return { allowed: true };
}

/* ------------------------------------------------------------------ *
 * Entrada e código de acesso
 * ------------------------------------------------------------------ */

export async function guardLogin(
  email: string,
  identity: RequestIdentity,
): Promise<FraudCheckResult> {
  const limits = await getLimits();
  const chave = email.toLowerCase().trim();

  if (identity.ipHash && (await isBlocked("ip", identity.ipHash))) {
    return { allowed: false, reason: "Acesso bloqueado.", rule: "bloqueio" };
  }

  const tentativa = await hit(`login:${chave}`, WINDOWS.login, limits.loginAttempts);
  if (tentativa.excedeu) {
    await flag({
      rule: "forca_bruta",
      reason: "Tentativas de entrada demais para a mesma conta.",
      subject: chave,
      detail: { tentativas: tentativa.atual, limite: limits.loginAttempts },
    });
    return {
      allowed: false,
      reason: "Muitas tentativas. Espere 15 minutos antes de tentar de novo.",
      rule: "forca_bruta",
    };
  }

  return { allowed: true };
}

export async function guardOtp(
  phone: string,
  identity: RequestIdentity,
): Promise<FraudCheckResult> {
  const limits = await getLimits();
  const digitos = normalizePhone(phone);

  if (await isBlocked("phone", digitos)) {
    return { allowed: false, reason: "Este telefone está bloqueado.", rule: "bloqueio" };
  }

  const tentativa = await hit(`otp:${digitos}`, WINDOWS.otp, limits.otpRequests);
  if (tentativa.excedeu) {
    await flag({
      rule: "otp_excessivo",
      reason: "Pedidos de código demais para o mesmo telefone.",
      subject: hidePhone(digitos),
      detail: { tentativas: tentativa.atual, limite: limits.otpRequests },
    });
    return {
      allowed: false,
      reason: "Muitos pedidos de código. Espere alguns minutos.",
      rule: "otp_excessivo",
    };
  }

  // Marcar o IP também: trocar de telefone não deve zerar a conta.
  if (identity.ipHash) await record(`otp:ip:${identity.ipHash}`);

  return { allowed: true };
}

/** Limpa o histórico de janela — roda no relógio, senão a tabela só cresce. */
export async function purgeRateEvents(): Promise<number> {
  const rows = await db
    .delete(rateEvents)
    .where(sql`${rateEvents.createdAt} < now() - interval '2 hours'`)
    .returning({ id: rateEvents.id });
  return rows.length;
}

/** Painel: o que foi barrado, agrupado por regra. */
export async function fraudSummary() {
  const rows = await db
    .select({
      rule: fraudEvents.rule,
      total: sql<number>`count(*)::int`,
      ultimo: sql<string>`max(${fraudEvents.createdAt})`,
    })
    .from(fraudEvents)
    .where(sql`${fraudEvents.createdAt} > now() - interval '7 days'`)
    .groupBy(fraudEvents.rule);
  return rows;
}
