/**
 * Decisões da plataforma que o administrador geral liga e desliga pelo painel
 * — e as regras puras que dependem delas. Puro, sem banco: o servidor decide
 * com isto e a tela mostra com isto.
 */

/* ------------------------------------------------------------------ *
 * Provedor do Pix
 * ------------------------------------------------------------------ */

import { TAXA_REEMBOLSO_MAX_PCT, TAXA_REEMBOLSO_PADRAO_PCT } from "./reembolso";

export const PROVEDORES_PIX = ["mercadopago", "asaas"] as const;
export type ProvedorPix = (typeof PROVEDORES_PIX)[number];

export const NOME_PROVEDOR: Record<ProvedorPix, string> = {
  mercadopago: "Mercado Pago",
  asaas: "Asaas",
};

/** Variáveis que cada provedor precisa no Railway para funcionar. */
export const CREDENCIAIS_PROVEDOR: Record<ProvedorPix, string[]> = {
  mercadopago: ["MP_ACCESS_TOKEN", "MP_WEBHOOK_SECRET"],
  asaas: ["ASAAS_API_KEY", "ASAAS_WEBHOOK_TOKEN"],
};

/**
 * O Asaas cobra de um cliente cadastrado com CPF/CNPJ — sem ele, não emite o
 * Pix. O Mercado Pago aceita sem. A tela do comprador pede o CPF só quando o
 * provedor em uso exige.
 */
export const EXIGE_CPF: Record<ProvedorPix, boolean> = {
  mercadopago: false,
  asaas: true,
};

/* ------------------------------------------------------------------ *
 * Configuração da plataforma
 * ------------------------------------------------------------------ */

export interface ConfigPlataforma {
  /**
   * Quem gera o Pix das vendas novas. `null` segue a variável
   * `PAYMENT_PROVIDER` do servidor — o comportamento de antes deste ajuste.
   */
  provedorPix: ProvedorPix | null;
  /**
   * Estorno pelo painel. **Desligado por padrão**: numa rifa, a compra vale
   * como participação e não se desfaz depois do sorteio. Ligar é decisão da
   * plataforma para casos excepcionais (erro de operação, cobrança em
   * duplicidade). Estorno que o próprio provedor avisa (contestação, Pix
   * devolvido pelo banco) é registrado mesmo desligado: o dinheiro já saiu.
   */
  estornoManual: boolean;
  /**
   * Taxa administrativa retida no reembolso fora do arrependimento (depois de
   * 7 dias, ou compra presencial), de 0 a 10% — ver `shared/reembolso.ts`.
   */
  taxaReembolsoPct: number;
}

export const CONFIG_PADRAO: ConfigPlataforma = {
  provedorPix: null,
  estornoManual: false,
  taxaReembolsoPct: TAXA_REEMBOLSO_PADRAO_PCT,
};

/** Só as chaves conhecidas: isto vem do corpo da requisição. */
export function validarConfigPlataforma(entrada: Partial<ConfigPlataforma>): ConfigPlataforma {
  const provedor = entrada.provedorPix ?? null;
  if (provedor !== null && !PROVEDORES_PIX.includes(provedor)) {
    throw Object.assign(new Error("Provedor de Pix desconhecido."), { status: 400 });
  }
  const taxa =
    entrada.taxaReembolsoPct === undefined ? TAXA_REEMBOLSO_PADRAO_PCT : Number(entrada.taxaReembolsoPct);
  if (!Number.isInteger(taxa) || taxa < 0 || taxa > TAXA_REEMBOLSO_MAX_PCT) {
    throw Object.assign(
      new Error(`A taxa de reembolso vai de 0 a ${TAXA_REEMBOLSO_MAX_PCT}% (limite do Código de Defesa do Consumidor).`),
      { status: 400 },
    );
  }
  return {
    provedorPix: provedor,
    estornoManual: entrada.estornoManual === true,
    taxaReembolsoPct: taxa,
  };
}

/* ------------------------------------------------------------------ *
 * Liberação da comissão (escolha de cada organização)
 * ------------------------------------------------------------------ */

export const LIBERACAO_COMISSAO = ["apos_sorteio", "imediata"] as const;
export type LiberacaoComissao = (typeof LIBERACAO_COMISSAO)[number];

export const NOME_LIBERACAO: Record<LiberacaoComissao, string> = {
  apos_sorteio: "Depois do sorteio",
  imediata: "Na hora do pagamento",
};

/**
 * Como a comissão nasce ao confirmar o pagamento.
 *
 * - `apos_sorteio` (padrão): `pending` até passar a janela de estorno e o
 *   sorteio — é a carência que evita pagar comissão por venda que voltou.
 * - `imediata`: já nasce `available`, pronta para saque. A organização escolhe
 *   assumir o risco: se houver estorno depois do saque, o valor aparece como
 *   comissão já paga, para cobrar do divulgador.
 */
export function comissaoInicial(
  modo: LiberacaoComissao,
  paidAt: Date,
  carenciaAte: Date,
): { status: "pending" | "available"; availableAt: Date } {
  return modo === "imediata"
    ? { status: "available", availableAt: paidAt }
    : { status: "pending", availableAt: carenciaAte };
}

/* ------------------------------------------------------------------ *
 * Split do Asaas
 * ------------------------------------------------------------------ */

/**
 * Quanto do líquido vai para a carteira do promotor, em percentual.
 *
 * O Asaas desconta a tarifa dele antes de dividir; um valor fixo igual ao
 * "bruto menos a taxa" estouraria o líquido e a cobrança seria recusada. Em
 * percentual sobre o líquido, a tarifa se divide na mesma proporção entre
 * plataforma e promotor — e a divisão nunca passa do que entrou.
 *
 * A comissão do divulgador **não** vai no split: ela tem carência (ou não,
 * conforme a organização escolher) e é paga pelo saldo do painel. Mandá-la
 * junto com o pagamento tornaria o estorno impossível de desfazer.
 */
export function percentualDoPromotor(platformPct: number): number {
  const pct = Math.min(100, Math.max(0, 100 - platformPct));
  // O Asaas aceita até 4 casas; inteiro basta para taxa em % inteiro.
  return Math.round(pct * 10_000) / 10_000;
}

/** Carteira do Asaas: é um UUID. */
export function carteiraAsaasValida(walletId: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(walletId.trim());
}
