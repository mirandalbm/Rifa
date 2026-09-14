import type { NotificationProvider, OutboundMessage } from "./provider";
import { renderText } from "./templates";

/**
 * Desenvolvimento: imprime a mensagem em vez de enviar. O fluxo inteiro roda
 * sem conta no WhatsApp Business, e dá para ler o que o comprador leria.
 */
export class ConsoleNotificationProvider implements NotificationProvider {
  readonly name = "console";

  async send(message: OutboundMessage): Promise<void> {
    console.log(
      `\n  📱 para ${message.to} [${message.template}]\n     ${renderText(
        message.template,
        message.params,
      )}\n`,
    );
  }
}
