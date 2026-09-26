/**
 * Mercado Pago — cobrança Pix e webhook.
 *
 * Duas coisas importam aqui e as duas são de segurança:
 *
 * 1. A notificação do Mercado Pago só traz o ID do pagamento. O status vem
 *    de uma consulta nossa à API — nunca do corpo recebido, que qualquer um
 *    poderia forjar.
 * 2. A assinatura em `x-signature` é conferida contra o segredo do webhook,
 *    em comparação de tempo constante.
 */
import { createHmac, timingSafeEqual } from "node:crypto";
import type { PaymentProvider, PixCharge, WebhookResult } from "./provider";

const API = "https://api.mercadopago.com";

/* ------------------------------------------------------------------ *
 * Assinatura do webhook — funções puras, testáveis sem rede
 * ------------------------------------------------------------------ */

export interface SignatureParts {
  ts: string;
  v1: string;
}

/** `x-signature: ts=1699000000,v1=abc123…` */
export function parseSignatureHeader(header: string | undefined): SignatureParts | null {
  if (!header) return null;
  const parts: Record<string, string> = {};
  for (const piece of header.split(",")) {
    const [key, value] = piece.split("=");
    if (key && value) parts[key.trim()] = value.trim();
  }
  return parts.ts && parts.v1 ? { ts: parts.ts, v1: parts.v1 } : null;
}

/** O manifesto é fixado pelo Mercado Pago; a ordem e o ponto-e-vírgula importam. */
export function signatureManifest(params: {
  dataId: string;
  requestId: string;
  ts: string;
}): string {
  return `id:${params.dataId};request-id:${params.requestId};ts:${params.ts};`;
}

export function verifySignature(params: {
  header: string | undefined;
  dataId: string;
  requestId: string;
  secret: string;
  toleranceSeconds?: number;
  now?: number;
}): boolean {
  const parsed = parseSignatureHeader(params.header);
  if (!parsed) return false;

  // Janela de tolerância: barra replay de notificação antiga capturada.
  const tolerance = params.toleranceSeconds ?? 600;
  const now = params.now ?? Date.now();
  const tsMs = Number(parsed.ts);
  if (!Number.isFinite(tsMs)) return false;
  const ageSeconds = Math.abs(now - (tsMs > 1e12 ? tsMs : tsMs * 1000)) / 1000;
  if (ageSeconds > tolerance) return false;

  const expected = createHmac("sha256", params.secret)
    .update(
      signatureManifest({
        dataId: params.dataId,
        requestId: params.requestId,
        ts: parsed.ts,
      }),
    )
    .digest();

  let received: Buffer;
  try {
    received = Buffer.from(parsed.v1, "hex");
  } catch {
    return false;
  }
  if (received.length !== expected.length) return false;
  return timingSafeEqual(received, expected);
}

/** O status do Mercado Pago traduzido para o que o nosso domínio entende. */
export function translateStatus(status: string): WebhookResult["event"] {
  switch (status) {
    case "approved":
      return "paid";
    case "refunded":
    case "charged_back":
      return "refunded";
    case "cancelled":
    case "rejected":
      return "expired";
    default:
      return "ignored";
  }
}

/* ------------------------------------------------------------------ *
 * Provedor
 * ------------------------------------------------------------------ */

export class MercadoPagoProvider implements PaymentProvider {
  readonly name = "mercadopago";
  private token = required("MP_ACCESS_TOKEN");
  private webhookSecret = required("MP_WEBHOOK_SECRET");

  async createPixCharge(params: {
    orderCode: number;
    amountCents: number;
    description: string;
    payer: { name: string; phone: string; cpf?: string };
    expiresAt: Date;
  }): Promise<PixCharge> {
    const [firstName, ...rest] = params.payer.name.trim().split(/\s+/);

    const res = await fetch(`${API}/v1/payments`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.token}`,
        "Content-Type": "application/json",
        // Repetir a criação do mesmo pedido não gera duas cobranças.
        "X-Idempotency-Key": `pedido-${params.orderCode}`,
      },
      body: JSON.stringify({
        transaction_amount: params.amountCents / 100,
        description: params.description,
        payment_method_id: "pix",
        date_of_expiration: params.expiresAt.toISOString(),
        external_reference: String(params.orderCode),
        payer: {
          first_name: firstName,
          last_name: rest.join(" ") || firstName,
          ...(params.payer.cpf
            ? { identification: { type: "CPF", number: params.payer.cpf } }
            : {}),
        },
      }),
    });

    if (!res.ok) {
      throw new Error(
        `Mercado Pago recusou a cobrança (${res.status}): ${await res.text()}`,
      );
    }

    const body = (await res.json()) as {
      id: number;
      point_of_interaction?: {
        transaction_data?: { qr_code?: string; qr_code_base64?: string };
      };
    };

    const data = body.point_of_interaction?.transaction_data;
    if (!data?.qr_code) {
      throw new Error("Mercado Pago não devolveu o código Pix.");
    }

    return {
      provider: this.name,
      chargeId: String(body.id),
      qr: data.qr_code_base64 ? `data:image/png;base64,${data.qr_code_base64}` : "",
      copyPaste: data.qr_code,
      expiresAt: params.expiresAt,
    };
  }

  async verifyWebhook(
    headers: Record<string, unknown>,
    rawBody: string,
  ): Promise<WebhookResult> {
    const body = JSON.parse(rawBody || "{}") as {
      id?: number | string;
      type?: string;
      action?: string;
      data?: { id?: string };
    };

    const dataId = String(body.data?.id ?? "");
    if (!dataId) throw new Error("Notificação sem id de pagamento.");

    const ok = verifySignature({
      header: headers["x-signature"] as string | undefined,
      dataId,
      requestId: String(headers["x-request-id"] ?? ""),
      secret: this.webhookSecret,
    });
    if (!ok) throw new Error("Assinatura do webhook inválida.");

    // O corpo não diz se foi pago — quem diz é a API, consultada por nós.
    const res = await fetch(`${API}/v1/payments/${dataId}`, {
      headers: { Authorization: `Bearer ${this.token}` },
    });
    if (!res.ok) {
      throw new Error(`Não foi possível consultar o pagamento ${dataId}.`);
    }

    const payment = (await res.json()) as {
      id: number;
      status: string;
      transaction_amount: number;
    };

    return {
      externalId: String(body.id ?? `${dataId}:${payment.status}`),
      chargeId: String(payment.id),
      event: translateStatus(payment.status),
      amountCents: Math.round(payment.transaction_amount * 100),
    };
  }

  async refund(chargeId: string, amountCents?: number): Promise<void> {
    const res = await fetch(`${API}/v1/payments/${chargeId}/refunds`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.token}`,
        // Chave fixa por cobrança e valor: repetir a chamada (rede caiu no
        // meio) não devolve duas vezes.
        "X-Idempotency-Key": `estorno-${chargeId}-${amountCents ?? "total"}`,
        ...(amountCents !== undefined ? { "Content-Type": "application/json" } : {}),
      },
      ...(amountCents !== undefined
        ? { body: JSON.stringify({ amount: Math.round(amountCents) / 100 }) }
        : {}),
    });
    if (!res.ok) {
      throw new Error(`Estorno recusado (${res.status}): ${await res.text()}`);
    }
  }
}

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} é obrigatória para usar o Mercado Pago.`);
  return value;
}
