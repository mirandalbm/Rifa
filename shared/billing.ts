/**
 * Como a plataforma cobra de cada organização.
 *
 * São dois contratos possíveis, e a escolha é por organização — cliente
 * grande costuma preferir mensalidade previsível, cliente que está começando
 * prefere pagar só quando vende:
 *
 * - **mensalidade**: valor fixo por mês, e a venda não paga nada por cima.
 * - **comissão**: percentual sobre cada venda paga, e nenhum valor fixo.
 *
 * Nunca os dois ao mesmo tempo. Cobrar mensalidade *e* percentual é um
 * terceiro contrato — se um dia for preciso, entra como modo novo aqui, não
 * como campo solto ligado junto, senão ninguém mais sabe quanto o cliente
 * paga.
 *
 * O padrão é `gratis`: organização que existia antes desta decisão não pode
 * acordar devendo. Quem cobra é quem escolheu cobrar.
 */

export type BillingMode = "gratis" | "mensalidade" | "comissao";

export interface BillingPlan {
  mode: BillingMode;
  /** Percentual sobre a venda. Só vale no modo `comissao`. */
  platformFeePct: number;
  /** Valor do mês em centavos. Só vale no modo `mensalidade`. */
  monthlyCents: number;
}

export const FREE_PLAN: BillingPlan = {
  mode: "gratis",
  platformFeePct: 0,
  monthlyCents: 0,
};

export const BILLING_LABEL: Record<BillingMode, string> = {
  gratis: "sem cobrança",
  mensalidade: "mensalidade",
  comissao: "comissão por venda",
};

/** Teto do percentual. Acima disso não é comissão, é sociedade. */
export const MAX_PLATFORM_PCT = 30;

/** Teto da mensalidade: R$ 50.000. Serve para pegar dedo errado no zero. */
export const MAX_MONTHLY_CENTS = 5_000_000;

/**
 * O percentual que entra no rateio da venda.
 *
 * É esta função que faz a mensalidade não cobrar duas vezes: quem paga por
 * mês tem taxa **zero** por venda, então `splitOrder` devolve exatamente o
 * rateio de quem não paga nada — e o afiliado recebe sobre o valor cheio.
 */
export function platformPctFor(plan: BillingPlan): number {
  return plan.mode === "comissao" ? plan.platformFeePct : 0;
}

/** O valor do mês. Zero fora do modo mensalidade. */
export function monthlyCentsFor(plan: BillingPlan): number {
  return plan.mode === "mensalidade" ? plan.monthlyCents : 0;
}

/**
 * Valida a escolha e **zera o campo do outro modo**.
 *
 * Zerar é de propósito: deixar um percentual guardado num plano de
 * mensalidade é uma bomba de relógio — basta alguém trocar o modo de volta
 * para o cliente ser cobrado num percentual que ninguém lembra de ter
 * combinado.
 */
export function validateBillingPlan(candidate: Partial<BillingPlan>): BillingPlan {
  const mode = candidate?.mode ?? "gratis";

  if (!["gratis", "mensalidade", "comissao"].includes(mode)) {
    throw new Error("Modo de cobrança desconhecido.");
  }

  if (mode === "comissao") {
    const pct = Number(candidate.platformFeePct);
    if (!Number.isFinite(pct) || pct <= 0) {
      throw new Error("Informe o percentual da plataforma.");
    }
    if (pct > MAX_PLATFORM_PCT) {
      throw new Error(`O percentual máximo é ${MAX_PLATFORM_PCT}%.`);
    }
    return { mode, platformFeePct: Math.round(pct * 100) / 100, monthlyCents: 0 };
  }

  if (mode === "mensalidade") {
    const cents = Number(candidate.monthlyCents);
    if (!Number.isInteger(cents) || cents <= 0) {
      throw new Error("Informe o valor da mensalidade.");
    }
    if (cents > MAX_MONTHLY_CENTS) {
      throw new Error("Mensalidade acima do teto.");
    }
    return { mode, platformFeePct: 0, monthlyCents: cents };
  }

  return FREE_PLAN;
}

/**
 * A competência de um mês, no formato `aaaa-mm`.
 *
 * É a chave que impede a mensalidade de ser lançada duas vezes: o job pode
 * rodar todo minuto, em quantas réplicas for, que a segunda gravação esbarra
 * no índice único `(organização, competência)`.
 */
export function competenciaDe(data: Date): string {
  return `${data.getFullYear()}-${String(data.getMonth() + 1).padStart(2, "0")}`;
}

/** A competência do mês anterior — a que se cobra quando o mês vira. */
export function competenciaAnterior(data: Date): string {
  return competenciaDe(new Date(data.getFullYear(), data.getMonth() - 1, 1));
}
