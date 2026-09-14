import type { PaymentProvider } from "./provider";
import { DevPaymentProvider } from "./dev";

let cached: PaymentProvider | null = null;

/**
 * Escolhe o provedor por ambiente. Mercado Pago e Asaas entram aqui quando
 * as credenciais existirem; até lá, o provedor de desenvolvimento mantém o
 * fluxo de ponta a ponta funcionando.
 */
export function paymentProvider(): PaymentProvider {
  if (cached) return cached;

  const configured = process.env.PAYMENT_PROVIDER ?? "dev";
  switch (configured) {
    case "dev":
      cached = new DevPaymentProvider();
      break;
    default:
      throw new Error(
        `Provedor de pagamento "${configured}" ainda não implementado. ` +
          "Implemente server/payments/<provedor>.ts seguindo PaymentProvider.",
      );
  }
  return cached;
}

export type { PaymentProvider, PixCharge, WebhookResult } from "./provider";
