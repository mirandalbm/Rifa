import type { TemplateName } from "./templates";

export interface OutboundMessage {
  /** Telefone só com dígitos, com DDI. */
  to: string;
  template: TemplateName;
  params: Record<string, string>;
}

export interface NotificationProvider {
  readonly name: string;
  send(message: OutboundMessage): Promise<void>;
}
