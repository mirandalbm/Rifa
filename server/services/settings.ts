/** Ajustes gerais, com valor padrão quando o administrador ainda não preencheu. */
import { tabelaVigente, type ConfigCobranca } from "@shared/cobranca";
import { eq, sql } from "drizzle-orm";
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
  // Vem do corpo da requisição: número ou lista no lugar do texto quebrava no `trim()` (500).
  const texto = (v: unknown) => (typeof v === "string" ? v.trim() : "");
  const nome = texto(info.nome);
  if (!nome || nome.length < 2) {
    throw Object.assign(new Error("Informe o nome da administradora da rifa."), { status: 400 });
  }
  const value: OrganizerInfo = {
    nome,
    cnpj: texto(info.cnpj) || undefined,
    contato: texto(info.contato) || undefined,
    cidade: texto(info.cidade) || undefined,
    observacao: texto(info.observacao) || PADRAO.observacao,
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

type Leitor = Pick<typeof db, "select">;

async function lerPlataforma(exec: Leitor): Promise<ConfigPlataforma> {
  const [row] = await exec
    .select()
    .from(appSettings)
    .where(eq(appSettings.key, PLATAFORMA_KEY));
  if (!row) return CONFIG_PADRAO;
  try {
    return validarConfigPlataforma(row.value as Partial<ConfigPlataforma>);
  } catch (e) {
    // Voltar ao padrão em silêncio desliga tudo (interruptores, cobrança,
    // provedor) sem ninguém saber: ao menos o motivo vai ao log.
    console.error("[plataforma] a configuração guardada não passa mais na régua; valendo o padrão:", (e as Error).message);
    return CONFIG_PADRAO;
  }
}

export async function getPlataforma(): Promise<ConfigPlataforma> {
  return lerPlataforma(db);
}

/** Trava (de transação) que serializa quem grava a configuração da plataforma. */
const TRAVA_DA_CONFIGURACAO = 811_902;

/**
 * Grava a escolha. Provedor sem credencial no servidor é recusado aqui: a
 * troca seria aceita e a próxima venda quebraria na hora do Pix, com o
 * comprador na frente da tela.
 *
 * Ler a configuração, juntar o que veio e gravar acontece numa transação com
 * trava: dois cartões salvos ao mesmo tempo (o último a gravar vencia e
 * perdia o outro) esperam um pelo outro.
 */
export async function setPlataforma(
  candidato: Partial<ConfigPlataforma>,
): Promise<ConfigPlataforma> {
  // Parte da configuração atual: quem salva um pedaço (Pagamentos, Bônus)
  // não apaga o resto por omissão. Campo `undefined` não conta como enviado.
  const enviados = Object.fromEntries(Object.entries(candidato).filter(([, v]) => v !== undefined));
  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(${TRAVA_DA_CONFIGURACAO})`);
    const value = validarConfigPlataforma({ ...(await lerPlataforma(tx)), ...enviados });
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

    await tx
      .insert(appSettings)
      .values({ key: PLATAFORMA_KEY, value })
      .onConflictDoUpdate({
        target: appSettings.key,
        set: { value, updatedAt: new Date() },
      });
    return value;
  });
}

/**
 * A tabela de cobrança que vale agora: a agendada, se o dia dela já chegou
 * (`tabelaVigente()` em `shared/cobranca.ts`). É a que a publicação grava na rifa.
 */
export async function tabelaDeCobrancaAgora(agora = new Date()): Promise<ConfigCobranca> {
  const p = await getPlataforma();
  return tabelaVigente(p.cobranca, p.cobrancaProxima, agora);
}
