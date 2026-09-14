/**
 * Cálculo de preço e comissão. Funções puras: o servidor é quem chama,
 * o cliente só exibe. O front NUNCA envia preço — envia campanha e quantidade.
 */

export interface PricingPackage {
  quantity: number;
  discountPct: number;
}

export interface PriceBreakdown {
  quantity: number;
  unitCents: number;
  subtotalCents: number;
  /** Desconto do pacote por quantidade (ex.: +50 cotas = -12%). */
  packageDiscountCents: number;
  /** Desconto do cupom do afiliado, aplicado depois do pacote. */
  couponDiscountCents: number;
  totalCents: number;
  appliedPackageQuantity: number | null;
}

/** O maior pacote que a quantidade alcança. 37 cotas pega o pacote de 25. */
export function bestPackageFor(
  quantity: number,
  packages: PricingPackage[],
): PricingPackage | null {
  const eligible = packages
    .filter((p) => quantity >= p.quantity)
    .sort((a, b) => b.quantity - a.quantity);
  return eligible[0] ?? null;
}

export function priceOrder(params: {
  quantity: number;
  unitCents: number;
  packages?: PricingPackage[];
  couponPct?: number;
}): PriceBreakdown {
  const { quantity, unitCents } = params;
  const packages = params.packages ?? [];
  const couponPct = params.couponPct ?? 0;

  if (!Number.isInteger(quantity) || quantity < 1) {
    throw new Error("Quantidade inválida.");
  }
  if (!Number.isInteger(unitCents) || unitCents < 1) {
    throw new Error("Preço da cota inválido.");
  }

  const subtotalCents = quantity * unitCents;

  const pkg = bestPackageFor(quantity, packages);
  const packageDiscountCents = pkg
    ? Math.floor((subtotalCents * pkg.discountPct) / 100)
    : 0;

  const afterPackage = subtotalCents - packageDiscountCents;
  const couponDiscountCents = couponPct
    ? Math.floor((afterPackage * couponPct) / 100)
    : 0;

  return {
    quantity,
    unitCents,
    subtotalCents,
    packageDiscountCents,
    couponDiscountCents,
    totalCents: afterPackage - couponDiscountCents,
    appliedPackageQuantity: pkg?.quantity ?? null,
  };
}

/**
 * Comissão sobre o valor líquido efetivamente pago, arredondada para baixo —
 * a plataforma nunca deve mais do que recebeu.
 */
export function commissionCents(paidCents: number, pct: number): number {
  if (pct < 0 || pct > 100) throw new Error("Percentual de comissão inválido.");
  return Math.floor((paidCents * pct) / 100);
}

/** Liberação da comissão: fim da janela de estorno ou o sorteio, o que for depois. */
export function commissionAvailableAt(
  paidAt: Date,
  refundWindowDays: number,
  drawAt?: Date | null,
): Date {
  const afterWindow = new Date(paidAt.getTime() + refundWindowDays * 86_400_000);
  if (drawAt && drawAt > afterWindow) return new Date(drawAt);
  return afterWindow;
}
