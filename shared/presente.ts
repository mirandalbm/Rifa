/**
 * O presente: quem tem conta manda, pelo campo de comentários, um convite
 * com desconto na primeira compra do convidado — **pago pela plataforma**.
 *
 * - **Nasce desligado** e só a plataforma liga (`ConfigPlataforma.presente`),
 *   com o percentual e o teto em reais.
 * - **A compra conta como paga pelo preço cheio**: o comprador paga a parte
 *   dele (`orders.amount_cents`) e a plataforma, o desconto
 *   (`orders.presente_cents`). O rateio (`splitOrder`) corre sobre a soma —
 *   taxa, comissão e promotora como se fosse o preço cheio — e a parte da
 *   promotora no desconto vira crédito dela com a plataforma
 *   (`creditoDoPresente`), na transação do pagamento.
 * - **Uma vez por pessoa**: só dentro da conta (CPF único entre contas), só
 *   na primeira compra paga, e o índice único parcial
 *   `uq_presente_por_comprador` decide entre dois pedidos ao mesmo tempo.
 * - **Quem convida** ganha o bônus de indicação que já existe (etapa 13),
 *   se o programa estiver ligado. Autoindicação não vale nem o desconto.
 */
import { splitOrder } from "./pricing";

export interface ConfigPresente {
  ligado: boolean;
  /** Percentual de desconto na primeira compra, de 1 a 50. */
  pct: number;
  /** Teto do desconto, em centavos (R$ 1,00 a R$ 100,00). */
  tetoCents: number;
}

export const PRESENTE_PCT_MAX = 50;
export const PRESENTE_TETO_MIN_CENTS = 100;
export const PRESENTE_TETO_MAX_CENTS = 10_000;

export const CONFIG_PRESENTE_PADRAO: ConfigPresente = { ligado: false, pct: 10, tetoCents: 1_000 };

/** Só as chaves conhecidas, nos limites: isto vem do corpo da requisição. */
export function validarConfigPresente(v: unknown): ConfigPresente {
  if (v === undefined || v === null) return { ...CONFIG_PRESENTE_PADRAO };
  if (typeof v !== "object") throw Object.assign(new Error("Configuração do presente inválida."), { status: 400 });
  const e = v as Record<string, unknown>;
  const pct = e.pct === undefined ? CONFIG_PRESENTE_PADRAO.pct : Number(e.pct);
  if (!Number.isInteger(pct) || pct < 1 || pct > PRESENTE_PCT_MAX) {
    throw Object.assign(new Error(`O desconto do presente vai de 1 a ${PRESENTE_PCT_MAX}%.`), { status: 400 });
  }
  const teto = e.tetoCents === undefined ? CONFIG_PRESENTE_PADRAO.tetoCents : Number(e.tetoCents);
  if (!Number.isInteger(teto) || teto < PRESENTE_TETO_MIN_CENTS || teto > PRESENTE_TETO_MAX_CENTS) {
    throw Object.assign(new Error("O teto do presente vai de R$ 1,00 a R$ 100,00."), { status: 400 });
  }
  return { ligado: e.ligado === true, pct, tetoCents: teto };
}

/**
 * Quanto a plataforma paga da compra: o percentual sobre o total (já com
 * pacote e cupom), para baixo, até o teto. Com o máximo de 50%, o
 * comprador sempre paga alguma coisa — o Pix nunca sai de R$ 0,00.
 */
export function descontoDoPresente(totalCents: number, cfg: Pick<ConfigPresente, "pct" | "tetoCents">): number {
  if (!Number.isInteger(totalCents) || totalCents < 2) return 0;
  const pct = Math.min(Math.max(cfg.pct, 0), PRESENTE_PCT_MAX);
  return Math.min(Math.floor((totalCents * pct) / 100), cfg.tetoCents, totalCents - 1);
}

/**
 * A parte da promotora no desconto que a plataforma pagou: o desconto passa
 * pelo mesmo rateio da venda. A taxa da plataforma sobre ele fica com a
 * plataforma (seria dela mesmo); a comissão fica com a promotora, que paga
 * o afiliado — salvo guardada, que a plataforma paga e por isso retém.
 */
export function creditoDoPresente(p: {
  presenteCents: number;
  platformPct: number;
  commissionPct: number;
  comissaoGuardada: boolean;
}): number {
  if (p.presenteCents <= 0) return 0;
  const r = splitOrder({ paidCents: p.presenteCents, platformPct: p.platformPct, commissionPct: p.commissionPct });
  return p.comissaoGuardada ? r.organizerCents : r.netAfterPlatformCents;
}

/** O texto da oferta, na tela de quem manda e de quem recebe. */
export function textoDoPresente(cfg: Pick<ConfigPresente, "pct" | "tetoCents">): string {
  const teto = (cfg.tetoCents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  return `${cfg.pct}% de desconto na primeira compra, até ${teto}, pago pela plataforma`;
}
