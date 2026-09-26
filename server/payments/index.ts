import type { PaymentProvider } from "./provider";
import { DevPaymentProvider } from "./dev";
import { MercadoPagoProvider } from "./mercadopago";
import { AsaasProvider } from "./asaas";
import { getPlataforma } from "../services/settings";

/**
 * Dois papéis diferentes, e é por isso que há duas funções:
 *
 * - `activePaymentProvider()` escolhe quem gera o Pix das **vendas novas** —
 *   a escolha do administrador geral no painel, ou a variável
 *   `PAYMENT_PROVIDER` quando ele ainda não escolheu.
 * - `paymentProviderByName()` atende o **webhook e o estorno** pelo nome
 *   gravado no pedido. Trocar de provedor não pode deixar órfão o Pix que já
 *   foi emitido pelo outro: ele ainda vai ser pago, e a confirmação chega
 *   pelo provedor que o criou.
 */
const cache = new Map<string, PaymentProvider>();

export const PROVEDORES_CONHECIDOS = ["dev", "mercadopago", "asaas"] as const;

export function paymentProviderByName(nome: string): PaymentProvider {
  const existente = cache.get(nome);
  if (existente) return existente;

  let provider: PaymentProvider;
  switch (nome) {
    case "dev":
      provider = new DevPaymentProvider();
      break;
    case "mercadopago":
      provider = new MercadoPagoProvider();
      break;
    case "asaas":
      provider = new AsaasProvider();
      break;
    default:
      throw Object.assign(new Error(`Provedor de pagamento "${nome}" desconhecido.`), {
        status: 404,
      });
  }
  cache.set(nome, provider);
  return provider;
}

export async function activePaymentProvider(): Promise<PaymentProvider> {
  const { provedorPix } = await getPlataforma();
  return paymentProviderByName(provedorPix ?? process.env.PAYMENT_PROVIDER ?? "dev");
}

export type { PaymentProvider, PixCharge, WebhookResult } from "./provider";
