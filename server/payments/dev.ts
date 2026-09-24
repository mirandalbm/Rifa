import { createHash, randomUUID } from "node:crypto";
import type { PaymentProvider, PixCharge, WebhookResult } from "./provider";

/**
 * Provedor de desenvolvimento: gera uma cobrança falsa para o fluxo rodar
 * inteiro sem credencial. O pagamento é disparado à mão pela rota /api/dev.
 * Recusa-se a existir em produção.
 */
export class DevPaymentProvider implements PaymentProvider {
  readonly name = "dev";

  constructor() {
    if (process.env.NODE_ENV === "production") {
      throw new Error(
        "DevPaymentProvider não roda em produção. Configure PAYMENT_PROVIDER.",
      );
    }
  }

  async createPixCharge(params: {
    orderCode: number;
    amountCents: number;
    description: string;
    expiresAt: Date;
  }): Promise<PixCharge> {
    const chargeId = randomUUID();
    const fingerprint = createHash("sha256")
      .update(`${params.orderCode}:${params.amountCents}`)
      .digest("hex")
      .slice(0, 32);

    return {
      provider: this.name,
      chargeId,
      qr: "",
      copyPaste: `00020126580014BR.GOV.BCB.PIX0136${fingerprint}5204000053039865802BR6009SAO PAULO62070503***DEV`,
      expiresAt: params.expiresAt,
    };
  }

  async verifyWebhook(
    _headers: Record<string, unknown>,
    rawBody: string,
  ): Promise<WebhookResult> {
    const body = JSON.parse(rawBody) as {
      id?: string;
      chargeId?: string;
      event?: string;
      amountCents?: number;
    };
    if (!body.chargeId) throw new Error("Webhook sem chargeId.");
    return {
      externalId: body.id ?? randomUUID(),
      chargeId: body.chargeId,
      event: (body.event as WebhookResult["event"]) ?? "ignored",
      amountCents: body.amountCents,
    };
  }
}
