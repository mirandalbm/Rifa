/**
 * Asaas — cobrança Pix com split e webhook.
 *
 * As mesmas duas regras de segurança do Mercado Pago:
 *
 * 1. O corpo do webhook só diz *qual* cobrança mudou. O status vem de uma
 *    consulta nossa à API — nunca do corpo, que qualquer um poderia forjar.
 * 2. O webhook traz o token combinado no cabeçalho `asaas-access-token`,
 *    conferido em comparação de tempo constante.
 *
 * O que muda em relação ao Mercado Pago:
 *
 * - **Split**: a parte do promotor vai direto para a carteira Asaas da
 *   organização no momento do pagamento. A plataforma não segura dinheiro
 *   de terceiro. Ver `percentualDoPromotor()` em `shared/plataforma.ts`.
 * - **CPF obrigatório**: o Asaas só cobra cliente cadastrado com CPF/CNPJ.
 * - **Vencimento por dia**: o QR dinâmico vale até o fim do vencimento, não
 *   por minutos. Por isso a reserva expirada cancela a cobrança
 *   (`cancelCharge`) — senão o comprador pagaria um Pix de reserva já solta.
 */
import { timingSafeEqual } from "node:crypto";
import type { PaymentProvider, PixCharge, WebhookResult } from "./provider";

const PRODUCAO = "https://api.asaas.com/v3";
const SANDBOX = "https://api-sandbox.asaas.com/v3";

/* ------------------------------------------------------------------ *
 * Funções puras — testáveis sem rede
 * ------------------------------------------------------------------ */

/** Status da cobrança no Asaas → o que o nosso domínio entende. */
export function traduzirStatusAsaas(status: string): WebhookResult["event"] {
  switch (status) {
    case "RECEIVED":
    case "CONFIRMED":
    case "RECEIVED_IN_CASH":
      return "paid";
    case "REFUNDED":
    case "CHARGEBACK_REQUESTED":
      return "refunded";
    case "OVERDUE":
      return "expired";
    default:
      // REFUND_REQUESTED / REFUND_IN_PROGRESS ainda não devolveram: quem
      // fecha o estorno é o REFUNDED que vem depois.
      return "ignored";
  }
}

/** Confere o token do webhook sem vazar tempo de comparação. */
export function tokenConfere(recebido: unknown, esperado: string): boolean {
  if (typeof recebido !== "string" || !esperado) return false;
  const a = Buffer.from(recebido);
  const b = Buffer.from(esperado);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/** Data de vencimento `AAAA-MM-DD` no fuso de Brasília. */
export function vencimentoAsaas(expiresAt: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(expiresAt);
}

/** Centavos inteiros → reais com duas casas, como a API espera. */
export function reais(cents: number): number {
  return Math.round(cents) / 100;
}

/** Mensagem da API do Asaas (`{ errors: [{ description }] }`) legível. */
export function erroAsaas(status: number, corpo: string): string {
  try {
    const e = JSON.parse(corpo) as { errors?: { description?: string }[] };
    const texto = e.errors?.map((x) => x.description).filter(Boolean).join(" ");
    if (texto) return `Asaas recusou (${status}): ${texto}`;
  } catch {
    // corpo não-JSON
  }
  return `Asaas recusou (${status}): ${corpo.slice(0, 300)}`;
}

/* ------------------------------------------------------------------ *
 * Provedor
 * ------------------------------------------------------------------ */

export class AsaasProvider implements PaymentProvider {
  readonly name = "asaas";
  private chave = required("ASAAS_API_KEY");
  private tokenWebhook = required("ASAAS_WEBHOOK_TOKEN");
  private base = process.env.ASAAS_SANDBOX === "1" ? SANDBOX : PRODUCAO;

  private async api<T>(caminho: string, init: RequestInit = {}): Promise<T> {
    const res = await fetch(`${this.base}${caminho}`, {
      ...init,
      headers: {
        access_token: this.chave,
        "Content-Type": "application/json",
        "User-Agent": "rifa.br",
        ...(init.headers ?? {}),
      },
    });
    const corpo = await res.text();
    if (!res.ok) throw new Error(erroAsaas(res.status, corpo));
    return (corpo ? JSON.parse(corpo) : {}) as T;
  }

  /**
   * O cliente do Asaas é achado pelo CPF antes de criar: a API não impede
   * duplicata, e o mesmo comprador em dez rifas viraria dez cadastros.
   */
  private async cliente(payer: { name: string; phone: string; cpf?: string }): Promise<string> {
    const cpf = (payer.cpf ?? "").replace(/\D/g, "");
    if (cpf.length !== 11 && cpf.length !== 14) {
      throw Object.assign(new Error("Informe o CPF para gerar o Pix."), { status: 400 });
    }
    const achados = await this.api<{ data?: { id: string }[] }>(
      `/customers?cpfCnpj=${cpf}&limit=1`,
    );
    if (achados.data?.[0]?.id) return achados.data[0].id;

    const criado = await this.api<{ id: string }>("/customers", {
      method: "POST",
      body: JSON.stringify({
        name: payer.name,
        cpfCnpj: cpf,
        mobilePhone: payer.phone.replace(/\D/g, ""),
        // Quem avisa o comprador é o WhatsApp da rifa, não o e-mail do Asaas.
        notificationDisabled: true,
      }),
    });
    return criado.id;
  }

  async createPixCharge(params: Parameters<PaymentProvider["createPixCharge"]>[0]): Promise<PixCharge> {
    const customer = await this.cliente(params.payer);

    const cobranca = await this.api<{ id: string }>("/payments", {
      method: "POST",
      body: JSON.stringify({
        customer,
        billingType: "PIX",
        value: reais(params.amountCents),
        dueDate: vencimentoAsaas(params.expiresAt),
        description: params.description.slice(0, 500),
        externalReference: String(params.orderCode),
        ...(params.split?.length
          ? {
              split: params.split.map((s) => ({
                walletId: s.walletId,
                percentualValue: s.percentual,
              })),
            }
          : {}),
      }),
    });

    const qr = await this.api<{ encodedImage?: string; payload?: string }>(
      `/payments/${cobranca.id}/pixQrCode`,
    );
    if (!qr.payload) throw new Error("O Asaas não devolveu o código Pix.");

    return {
      provider: this.name,
      chargeId: cobranca.id,
      qr: qr.encodedImage ? `data:image/png;base64,${qr.encodedImage}` : "",
      copyPaste: qr.payload,
      expiresAt: params.expiresAt,
    };
  }

  async verifyWebhook(headers: Record<string, unknown>, rawBody: string): Promise<WebhookResult> {
    if (!tokenConfere(headers["asaas-access-token"], this.tokenWebhook)) {
      throw new Error("Token do webhook do Asaas inválido.");
    }
    const corpo = JSON.parse(rawBody || "{}") as {
      id?: string;
      event?: string;
      payment?: { id?: string };
    };
    const id = corpo.payment?.id;
    if (!id) {
      // Evento que não é de cobrança (conta, transferência): nada a fazer.
      return { externalId: corpo.id ?? `asaas:${Date.now()}`, chargeId: "", event: "ignored" };
    }

    // O corpo não diz se foi pago — quem diz é a API, consultada por nós.
    const pagamento = await this.api<{ id: string; status: string; value: number }>(
      `/payments/${id}`,
    );

    return {
      externalId: corpo.id ?? `${id}:${pagamento.status}`,
      chargeId: pagamento.id,
      event: traduzirStatusAsaas(pagamento.status),
      amountCents: Math.round(pagamento.value * 100),
    };
  }

  async refund(chargeId: string, amountCents?: number): Promise<void> {
    await this.api(`/payments/${chargeId}/refund`, {
      method: "POST",
      ...(amountCents !== undefined ? { body: JSON.stringify({ value: reais(amountCents) }) } : {}),
    });
  }

  /** Cobrança de reserva que expirou: some do Asaas, e o QR para de valer. */
  async cancelCharge(chargeId: string): Promise<void> {
    await this.api(`/payments/${chargeId}`, { method: "DELETE" });
  }
}

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} é obrigatória para usar o Asaas.`);
  return value;
}
