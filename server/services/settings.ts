/** Ajustes gerais, com valor padrão quando o administrador ainda não preencheu. */
import { eq } from "drizzle-orm";
import { db } from "../db";
import { appSettings, type OrganizerInfo } from "@shared/schema";
import {
  DEFAULT_PAYMENT_METHODS,
  validatePaymentMethods,
  type PaymentMethodSettings,
} from "@shared/payments";

const ORGANIZER_KEY = "organizador";
const PAYMENTS_KEY = "meios_pagamento";

const PADRAO: OrganizerInfo = {
  nome: "Administradora da rifa",
  observacao:
    "Bilhete válido mediante pagamento confirmado. Sorteio pela Loteria Federal.",
};

export async function getOrganizer(): Promise<OrganizerInfo> {
  const [row] = await db
    .select()
    .from(appSettings)
    .where(eq(appSettings.key, ORGANIZER_KEY));
  return row ? { ...PADRAO, ...(row.value as OrganizerInfo) } : PADRAO;
}

export async function setOrganizer(info: OrganizerInfo): Promise<OrganizerInfo> {
  const nome = info.nome?.trim();
  if (!nome || nome.length < 2) {
    throw Object.assign(new Error("Informe o nome da administradora da rifa."), { status: 400 });
  }
  const value: OrganizerInfo = {
    nome,
    cnpj: info.cnpj?.trim() || undefined,
    contato: info.contato?.trim() || undefined,
    cidade: info.cidade?.trim() || undefined,
    observacao: info.observacao?.trim() || PADRAO.observacao,
  };

  await db
    .insert(appSettings)
    .values({ key: ORGANIZER_KEY, value })
    .onConflictDoUpdate({
      target: appSettings.key,
      set: { value, updatedAt: new Date() },
    });

  return value;
}

/* ------------------------------------------------------------------ *
 * Meios de pagamento
 * ------------------------------------------------------------------ */

export async function getPaymentMethods(): Promise<PaymentMethodSettings> {
  const [row] = await db
    .select()
    .from(appSettings)
    .where(eq(appSettings.key, PAYMENTS_KEY));
  if (!row) return DEFAULT_PAYMENT_METHODS;

  // Passa pela validação na leitura também: configuração antiga no banco
  // pode ter chave que não existe mais.
  try {
    return validatePaymentMethods(row.value as Partial<PaymentMethodSettings>);
  } catch {
    return DEFAULT_PAYMENT_METHODS;
  }
}

export async function setPaymentMethods(
  candidate: Partial<PaymentMethodSettings>,
): Promise<PaymentMethodSettings> {
  const value = validatePaymentMethods(candidate);

  await db
    .insert(appSettings)
    .values({ key: PAYMENTS_KEY, value })
    .onConflictDoUpdate({
      target: appSettings.key,
      set: { value, updatedAt: new Date() },
    });

  return value;
}
