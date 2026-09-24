/**
 * Envio de mensagens, com duas garantias:
 *
 * 1. **Não repete.** A chave de deduplicação é única no banco, então o mesmo
 *    lembrete não sai duas vezes nem com duas réplicas acordando juntas.
 * 2. **Não derruba o fluxo.** Se o WhatsApp estiver fora do ar, o pagamento
 *    já foi confirmado e as cotas já são do comprador — a falha é registrada
 *    e a vida segue.
 */
import { eq } from "drizzle-orm";
import { db } from "../db";
import { notifications } from "@shared/schema";
import { normalizePhone } from "@shared/format";
import type { NotificationProvider, OutboundMessage } from "./provider";
import { ConsoleNotificationProvider } from "./console";
import { WhatsAppProvider } from "./whatsapp";
import { renderText, type TemplateName } from "./templates";

let cached: NotificationProvider | null = null;

export function notificationProvider(): NotificationProvider {
  if (cached) return cached;
  const configured =
    process.env.NOTIFICATION_PROVIDER ??
    (process.env.WHATSAPP_TOKEN ? "whatsapp" : "console");

  cached = configured === "whatsapp" ? new WhatsAppProvider() : new ConsoleNotificationProvider();
  return cached;
}

export interface NotifyParams {
  to: string;
  template: TemplateName;
  params: Record<string, string>;
  /** Mesma chave = mesma mensagem; a segunda tentativa não envia nada. */
  dedupeKey: string;
}

export async function notify(input: NotifyParams): Promise<boolean> {
  const to = normalizePhone(input.to);
  if (to.length < 10) return false;

  const [claimed] = await db
    .insert(notifications)
    .values({
      to,
      template: input.template,
      params: input.params,
      dedupeKey: input.dedupeKey,
      status: "sent",
    })
    .onConflictDoNothing()
    .returning({ id: notifications.id });

  // Outro processo já mandou esta mensagem.
  if (!claimed) return false;

  try {
    const message: OutboundMessage = {
      to,
      template: input.template,
      params: input.params,
    };
    await notificationProvider().send(message);
    return true;
  } catch (err) {
    await db
      .update(notifications)
      .set({ status: "failed", error: (err as Error).message.slice(0, 500) })
      .where(eq(notifications.id, claimed.id));
    console.error(
      `[notificações] falhou ${input.template} para ${to}:`,
      (err as Error).message,
    );
    return false;
  }
}

export { renderText };
export type { TemplateName };
