/**
 * Retenção cautelar de saldo (contrato da plataforma com a promotora: Pix
 * por fora é rescisão, banimento e retenção cautelar para cobrir passivos).
 *
 * **É suspensão, não apropriação** (resposta 1.5 do advogado, 07/10/2026):
 * reter só segura o saldo até a apuração. Usá-lo para cobrir um passivo
 * (abater) exige decisão judicial ou acordo com a promotora — o abatimento
 * leva o fundamento e a referência, que vão para a auditoria.
 *
 * Só se retém o que está **na conta da plataforma**: o saldo de patrocínio
 * (anúncios e banner pago), o crédito do presente ainda não repassado e o
 * reembolso do saldo aprovado e ainda não pago. O Pix das vendas cai na
 * carteira da promotora pelo split — esse dinheiro nunca passou por aqui e
 * não há o que reter. Puro: o servidor decide e a tela explica com o mesmo
 * texto.
 */

export const SITUACOES_DA_RETENCAO = {
  ativa: "Suspenso",
  liberada: "Liberado",
  abatida: "Abatido",
} as const;
export type SituacaoDaRetencao = keyof typeof SITUACOES_DA_RETENCAO;

export const ORIGENS_DA_RETENCAO = {
  banimento: "Banimento da organização",
  manual: "Retenção pela plataforma",
} as const;
export type OrigemDaRetencao = keyof typeof ORIGENS_DA_RETENCAO;

/** O que fica parado enquanto a retenção vale — a tela e o erro dizem o mesmo. */
export const O_QUE_FICA_RETIDO = [
  "o saldo de patrocínio (anúncios e banner pago) não volta em dinheiro",
  "o crédito do presente não é repassado no acerto",
  "o reembolso do saldo aprovado não recebe baixa",
] as const;

export const MENSAGEM_RETIDO =
  "O saldo desta organização está suspenso cautelarmente pela plataforma. Libere ou abata a suspensão antes de pagar.";

export const MOTIVO_MIN = 10;
export const MOTIVO_MAX = 1000;

export class RetencaoError extends Error {
  constructor(message: string, readonly status = 400) {
    super(message);
    this.name = "RetencaoError";
  }
}

export function validarMotivoDaRetencao(bruto: unknown): string {
  const motivo = String(bruto ?? "").replace(/\s+/g, " ").trim();
  if (motivo.length < MOTIVO_MIN) throw new RetencaoError(`Explique o motivo (pelo menos ${MOTIVO_MIN} letras): fica registrado.`);
  return motivo.slice(0, MOTIVO_MAX);
}

/** Base para usar o saldo suspenso (resposta 1.5): sem uma delas, não se abate. */
export const FUNDAMENTOS_DO_ABATE = {
  judicial: "Decisão judicial",
  acordo: "Acordo assinado com a promotora",
} as const;
export type FundamentoDoAbate = keyof typeof FUNDAMENTOS_DO_ABATE;

export const REFERENCIA_MIN = 3;
export const REFERENCIA_MAX = 200;

export interface Abatimento {
  /** Centavos tirados do saldo de patrocínio. */
  patrocinioCents: number;
  /** Os créditos do presente ainda devidos entram inteiros, ou nenhum. */
  presente: boolean;
  motivo: string;
  fundamento: FundamentoDoAbate;
  /** Número do processo ou identificação do acordo. */
  referencia: string;
}

/**
 * Abater é usar o que está retido para cobrir o passivo (condenação,
 * estorno, multa do contrato). Do saldo de patrocínio, qualquer valor até o
 * saldo; do presente, todos os créditos devidos ou nenhum (cada crédito é de
 * um pedido e não se parte). Pelo menos um dos dois. Sempre com o
 * fundamento — decisão judicial ou acordo — e a referência dele.
 */
export function validarAbatimento(
  entrada: { patrocinioCents?: unknown; presente?: unknown; motivo?: unknown; fundamento?: unknown; referencia?: unknown },
  disponivel: { patrocinioCents: number; presenteCents: number },
): Abatimento {
  const motivo = validarMotivoDaRetencao(entrada.motivo);
  const fundamento = entrada.fundamento;
  if (typeof fundamento !== "string" || !Object.hasOwn(FUNDAMENTOS_DO_ABATE, fundamento)) {
    throw new RetencaoError("Abater o saldo suspenso exige decisão judicial ou acordo com a promotora: escolha o fundamento.");
  }
  const referencia = String(entrada.referencia ?? "").replace(/\s+/g, " ").trim();
  if (referencia.length < REFERENCIA_MIN || referencia.length > REFERENCIA_MAX) {
    throw new RetencaoError("Informe o número do processo ou a identificação do acordo.");
  }
  const patrocinioCents = entrada.patrocinioCents === undefined || entrada.patrocinioCents === null || entrada.patrocinioCents === "" ? 0 : Number(entrada.patrocinioCents);
  if (!Number.isInteger(patrocinioCents) || patrocinioCents < 0) {
    throw new RetencaoError("Informe quanto abater do saldo de patrocínio, em centavos (zero se nada).");
  }
  if (patrocinioCents > disponivel.patrocinioCents) {
    throw new RetencaoError("O valor passa do saldo de patrocínio retido.", 409);
  }
  const presente = entrada.presente === true;
  if (presente && disponivel.presenteCents <= 0) throw new RetencaoError("Não há crédito do presente a abater.", 409);
  if (patrocinioCents === 0 && !presente) throw new RetencaoError("Escolha o que abater: saldo de patrocínio, crédito do presente ou os dois.");
  return { patrocinioCents, presente, motivo, fundamento: fundamento as FundamentoDoAbate, referencia };
}
