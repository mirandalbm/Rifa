/**
 * Contrato do provedor de pagamento. Mercado Pago e Asaas entram por aqui
 * sem que nenhuma rota mude — a decisão entre os dois (split nativo x ledger
 * interno) fica isolada nesta interface.
 */

export interface PixCharge {
  provider: string;
  chargeId: string;
  /** Imagem do QR em data URI ou URL. */
  qr: string;
  /** Código copia e cola (payload EMV). */
  copyPaste: string;
  expiresAt: Date;
}

export interface WebhookResult {
  /** Identificador do evento no provedor — a chave da idempotência. */
  externalId: string;
  chargeId: string;
  event: "paid" | "expired" | "refunded" | "ignored";
  amountCents?: number;
}

export interface PaymentProvider {
  readonly name: string;
  createPixCharge(params: {
    orderCode: number;
    amountCents: number;
    description: string;
    payer: { name: string; phone: string; cpf?: string };
    expiresAt: Date;
  }): Promise<PixCharge>;
  /** Valida assinatura e traduz o corpo. Nunca confiar no redirect do browser. */
  verifyWebhook(headers: Record<string, unknown>, rawBody: string): Promise<WebhookResult>;
  refund?(chargeId: string): Promise<void>;
}
