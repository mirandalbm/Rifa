/** Ajustes gerais, com valor padrão quando o administrador ainda não preencheu. */
import { eq } from "drizzle-orm";
import { db } from "../db";
import { appSettings, type OrganizerInfo } from "@shared/schema";
import {
  DEFAULT_PAYMENT_METHODS,
  validatePaymentMethods,
  type PaymentMethodSettings,
} from "@shared/payments";
import {
  CONFIG_PADRAO,
  CREDENCIAIS_PROVEDOR,
  NOME_PROVEDOR,
  validarConfigPlataforma,
  type ConfigPlataforma,
} from "@shared/plataforma";

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

/* ------------------------------------------------------------------ *
 * Plataforma: provedor do Pix e estorno pelo painel
 * ------------------------------------------------------------------ */

const PLATAFORMA_KEY = "plataforma";

export async function getPlataforma(): Promise<ConfigPlataforma> {
  const [row] = await db
    .select()
    .from(appSettings)
    .where(eq(appSettings.key, PLATAFORMA_KEY));
  if (!row) return CONFIG_PADRAO;
  try {
    return validarConfigPlataforma(row.value as Partial<ConfigPlataforma>);
  } catch {
    return CONFIG_PADRAO;
  }
}

/**
 * Grava a escolha. Provedor sem credencial no servidor é recusado aqui: a
 * troca seria aceita e a próxima venda quebraria na hora do Pix, com o
 * comprador na frente da tela.
 */
export async function setPlataforma(
  candidato: Partial<ConfigPlataforma>,
): Promise<ConfigPlataforma> {
  const value = validarConfigPlataforma(candidato);
  if (value.provedorPix) {
    const faltando = CREDENCIAIS_PROVEDOR[value.provedorPix].filter((v) => !process.env[v]);
    if (faltando.length) {
      throw Object.assign(
        new Error(
          `Para usar ${NOME_PROVEDOR[value.provedorPix]}, configure no Railway: ${faltando.join(", ")}.`,
        ),
        { status: 400 },
      );
    }
  }

  await db
    .insert(appSettings)
    .values({ key: PLATAFORMA_KEY, value })
    .onConflictDoUpdate({
      target: appSettings.key,
      set: { value, updatedAt: new Date() },
    });
  return value;
}
