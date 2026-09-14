/**
 * Meios de pagamento aceitos — decisão do administrador, respeitada pelas
 * três superfícies.
 *
 * As regras moram aqui, puras, porque quem valida é o servidor mas quem
 * precisa exibir o botão certo é o cliente. Duas cópias da regra viram duas
 * regras diferentes na primeira mudança.
 */

export type PaymentMethodKey =
  | "pix_online"
  | "dinheiro"
  | "cartao_maquininha"
  | "pix_maquininha";

export interface PaymentMethodSettings {
  /** Pix do comprador na loja online. Desligado, a rifa vende só na mão. */
  pix_online: boolean;
  /** Dinheiro recolhido pelo cambista. */
  dinheiro: boolean;
  /** Cartão na maquininha do cambista. */
  cartao_maquininha: boolean;
  /** Pix cobrado pela maquininha do cambista. */
  pix_maquininha: boolean;
}

export const DEFAULT_PAYMENT_METHODS: PaymentMethodSettings = {
  pix_online: true,
  dinheiro: true,
  cartao_maquininha: true,
  pix_maquininha: true,
};

export interface PaymentMethodInfo {
  key: PaymentMethodKey;
  label: string;
  /** Onde este meio aparece. */
  scope: "online" | "fisico";
  hint: string;
}

export const PAYMENT_METHODS: PaymentMethodInfo[] = [
  {
    key: "pix_online",
    label: "Pix na loja online",
    scope: "online",
    hint: "O comprador paga sozinho pelo site. Desligado, a rifa só vende com cambista.",
  },
  {
    key: "dinheiro",
    label: "Dinheiro com o cambista",
    scope: "fisico",
    hint: "O cambista recolhe em espécie e presta contas no acerto.",
  },
  {
    key: "cartao_maquininha",
    label: "Cartão na maquininha",
    scope: "fisico",
    hint: "Exige maquininha com o app instalado, ou cobrança no aparelho da adquirente.",
  },
  {
    key: "pix_maquininha",
    label: "Pix na maquininha",
    scope: "fisico",
    hint: "QR Code gerado pelo aparelho do cambista.",
  },
];

export const PHYSICAL_METHODS: PaymentMethodKey[] = [
  "dinheiro",
  "cartao_maquininha",
  "pix_maquininha",
];

export function isEnabled(
  settings: PaymentMethodSettings,
  key: PaymentMethodKey,
): boolean {
  return settings[key] === true;
}

export function enabledPhysical(
  settings: PaymentMethodSettings,
): PaymentMethodKey[] {
  return PHYSICAL_METHODS.filter((key) => settings[key]);
}

export function labelFor(key: PaymentMethodKey): string {
  return PAYMENT_METHODS.find((m) => m.key === key)?.label ?? key;
}

/**
 * Nenhum meio ligado deixaria a rifa sem como vender — a tela ficaria de pé
 * e nada entraria. Um precisa sobrar.
 */
export function validatePaymentMethods(
  candidate: Partial<PaymentMethodSettings>,
): PaymentMethodSettings {
  // Só as chaves conhecidas entram: isto vem do corpo da requisição, e
  // espalhar o objeto cru guardaria qualquer coisa que mandassem.
  const settings = { ...DEFAULT_PAYMENT_METHODS };
  for (const { key } of PAYMENT_METHODS) {
    if (typeof candidate?.[key] === "boolean") settings[key] = candidate[key]!;
  }

  const ligados = PAYMENT_METHODS.filter((m) => settings[m.key]);
  if (ligados.length === 0) {
    throw new Error("Deixe ao menos um meio de pagamento ligado.");
  }

  return settings;
}

/** Resumo para a tela: o que o comprador e o cambista podem usar. */
export function paymentSummary(settings: PaymentMethodSettings) {
  return {
    online: settings.pix_online,
    fisico: enabledPhysical(settings),
    somenteFisico: !settings.pix_online && enabledPhysical(settings).length > 0,
  };
}
