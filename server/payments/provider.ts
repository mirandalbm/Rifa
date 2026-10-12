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
  /**
   * O provedor dividiu na origem: a parte da plataforma já ficou retida e
   * a da promotora caiu na carteira dela. Quem honra o split (Asaas) diz
   * `true`; quem ignora deixa em branco, e a taxa segue no livro como devida.
   */
  splitAplicado?: boolean;
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
    /**
     * Quem paga. O e-mail só vai a quem o exige (`EXIGE_EMAIL`, o Pagar.me):
     * os outros provedores o ignoram.
     */
    payer: { name: string; phone: string; cpf?: string; email?: string };
    expiresAt: Date;
    /**
     * Divisão na origem (Asaas): parte do líquido que vai direto para outra
     * carteira. Provedor sem split ignora — o dinheiro entra todo na conta da
     * plataforma e o rateio fica só no livro.
     */
    split?: { walletId: string; percentual: number }[];
  }): Promise<PixCharge>;
  /**
   * Valida assinatura e traduz o corpo. Nunca confiar no redirect do browser.
   * `contexto.query` é a consulta do endereço chamado — o Pagar.me não assina
   * o webhook, e o segredo vai no endereço cadastrado no painel dele. Erro
   * com `status: 401` vira 401 (segredo ausente ou errado); qualquer outro, 400.
   */
  verifyWebhook(
    headers: Record<string, unknown>,
    rawBody: string,
    contexto?: { query?: Record<string, unknown> },
  ): Promise<WebhookResult>;
  /**
   * Devolve pelo provedor. `amountCents` ausente = valor inteiro; presente =
   * devolução parcial (reembolso com taxa administrativa retida). `chave`
   * identifica esta devolução (o pedido ou o caso da fila): no carrinho num
   * Pix só, duas devoluções da mesma cobrança com o mesmo valor são duas
   * devoluções, não a repetição de uma.
   */
  refund?(chargeId: string, amountCents?: number, chave?: string): Promise<void>;
  /** Cancela a cobrança de uma reserva que expirou (QR que vale o dia todo). */
  cancelCharge?(chargeId: string): Promise<void>;
}
