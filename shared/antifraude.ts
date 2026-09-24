/**
 * Limites do antifraude.
 *
 * O ataque que mais dói numa rifa não é o de pagamento: é **bloqueio de
 * estoque**. Um script reserva milhares de cotas, não paga, deixa expirar e
 * repete. A rifa parece vendida, ninguém consegue comprar e o organizador
 * não entende por quê.
 *
 * Por isso os limites mais apertados são de reserva em aberto, não de
 * volume de compra.
 */

export interface AntiFraudLimits {
  /** Pedidos criados por telefone numa janela de 10 minutos. */
  ordersPerPhone: number;
  /** Pedidos criados por aparelho numa janela de 10 minutos. */
  ordersPerDevice: number;
  /**
   * Pedidos por IP na mesma janela. Folgado de propósito: operadora de
   * celular põe um bairro inteiro atrás do mesmo IP.
   */
  ordersPerIp: number;
  /** Pedidos pendentes ao mesmo tempo, por telefone. */
  openOrdersPerPhone: number;
  /** Cotas reservadas e não pagas ao mesmo tempo, por telefone. */
  reservedQuotasPerPhone: number;
  /** Tentativas de entrar (senha) por conta, em 15 minutos. */
  loginAttempts: number;
  /** Pedidos de código de acesso por telefone, em 15 minutos. */
  otpRequests: number;
  /** Bloqueia o afiliado de comprar pelo próprio link. */
  blockSelfReferral: boolean;
}

export const DEFAULT_LIMITS: AntiFraudLimits = {
  ordersPerPhone: 5,
  ordersPerDevice: 8,
  ordersPerIp: 60,
  openOrdersPerPhone: 2,
  reservedQuotasPerPhone: 500,
  loginAttempts: 8,
  otpRequests: 5,
  blockSelfReferral: true,
};

export interface LimitInfo {
  key: keyof AntiFraudLimits;
  label: string;
  hint: string;
  /** Limites numéricos têm faixa; o de autoindicação é liga-desliga. */
  min?: number;
  max?: number;
}

export const LIMIT_FIELDS: LimitInfo[] = [
  {
    key: "openOrdersPerPhone",
    label: "Pedidos abertos por telefone",
    hint: "Reserva sem pagar é o jeito mais barato de travar uma rifa. Este é o limite que mais protege.",
    min: 1,
    max: 20,
  },
  {
    key: "reservedQuotasPerPhone",
    label: "Cotas reservadas por telefone",
    hint: "Teto de cotas seguradas ao mesmo tempo sem pagamento.",
    min: 10,
    max: 10_000,
  },
  {
    key: "ordersPerPhone",
    label: "Pedidos por telefone (10 min)",
    hint: "Quantas compras o mesmo telefone pode iniciar na janela.",
    min: 1,
    max: 100,
  },
  {
    key: "ordersPerDevice",
    label: "Pedidos por aparelho (10 min)",
    hint: "Pega quem troca de telefone mas continua no mesmo celular.",
    min: 1,
    max: 200,
  },
  {
    key: "ordersPerIp",
    label: "Pedidos por IP (10 min)",
    hint: "Folgado de propósito: operadora de celular põe um bairro inteiro atrás do mesmo IP.",
    min: 10,
    max: 5_000,
  },
  {
    key: "loginAttempts",
    label: "Tentativas de entrar (15 min)",
    hint: "Trava a força bruta de senha de administrador e afiliado.",
    min: 3,
    max: 50,
  },
  {
    key: "otpRequests",
    label: "Pedidos de código (15 min)",
    hint: "Evita usar o envio de código como metralhadora de mensagem.",
    min: 1,
    max: 50,
  },
];

/** Janelas em minutos — fixas, porque mudar isso muda o sentido do limite. */
export const WINDOWS = {
  orders: 10,
  login: 15,
  otp: 15,
} as const;

export type BlockKind = "phone" | "device" | "ip";

export interface FraudCheckResult {
  allowed: boolean;
  /** Motivo em português, para o comprador entender e o admin auditar. */
  reason?: string;
  rule?: string;
}

export function validateLimits(
  candidate: Partial<AntiFraudLimits>,
): AntiFraudLimits {
  // Só as chaves conhecidas entram: isto vem do corpo da requisição.
  const limits = { ...DEFAULT_LIMITS };

  for (const campo of LIMIT_FIELDS) {
    const valor = candidate?.[campo.key];
    if (typeof valor !== "number" || !Number.isFinite(valor)) continue;
    const arredondado = Math.round(valor);
    if (campo.min !== undefined && arredondado < campo.min) {
      throw new Error(`${campo.label}: o mínimo é ${campo.min}.`);
    }
    if (campo.max !== undefined && arredondado > campo.max) {
      throw new Error(`${campo.label}: o máximo é ${campo.max}.`);
    }
    (limits[campo.key] as number) = arredondado;
  }

  if (typeof candidate?.blockSelfReferral === "boolean") {
    limits.blockSelfReferral = candidate.blockSelfReferral;
  }

  return limits;
}
