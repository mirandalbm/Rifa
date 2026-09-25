import type { NotificationProvider, OutboundMessage } from "./provider";
import { TEMPLATES } from "./templates";
import { GRAPH_VERSION, IDIOMA_PADRAO, componentesDeEnvio } from "./metaTemplates";

/**
 * WhatsApp Cloud API.
 *
 * Fora da janela de 24 horas — que é o nosso caso, porque o comprador não
 * iniciou conversa nenhuma — só passa mensagem de modelo aprovado. Por isso
 * tudo aqui é template, e não texto livre.
 */
export class WhatsAppProvider implements NotificationProvider {
  readonly name = "whatsapp";
  private token = required("WHATSAPP_TOKEN");
  private phoneId = required("WHATSAPP_PHONE_ID");
  private language = process.env.WHATSAPP_LANGUAGE ?? IDIOMA_PADRAO;

  async send(message: OutboundMessage): Promise<void> {
    const spec = TEMPLATES[message.template];

    const res = await fetch(
      `https://graph.facebook.com/${GRAPH_VERSION}/${this.phoneId}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to: withCountryCode(message.to),
          type: "template",
          template: {
            name: spec.whatsappName,
            language: { code: this.language },
            components: componentesDeEnvio(message.template, message.params),
          },
        }),
      },
    );

    if (!res.ok) {
      throw new Error(`WhatsApp recusou (${res.status}): ${await res.text()}`);
    }
  }
}

/** Telefone brasileiro digitado sem DDI é o caso comum. */
export function withCountryCode(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.startsWith("55")) return digits;
  if (digits.length === 10 || digits.length === 11) return `55${digits}`;
  return digits;
}

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} é obrigatória para usar o WhatsApp.`);
  return value;
}
