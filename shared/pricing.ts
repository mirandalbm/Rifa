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

/**
 * Prazo de estorno da comissão, em dias contados do pagamento: a comissão
 * (padrão) só libera depois dele e do sorteio. O termo do afiliado diz o
 * número (cláusula 4) — o servidor e o texto leem daqui, pelo
 * `REFUND_WINDOW_DAYS` de `server/services/prazoDeEstorno.ts`.
 */
export const PRAZO_DE_ESTORNO_DIAS = 7;

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

/* ------------------------------------------------------------------ *
 * Rateio da venda
 * ------------------------------------------------------------------ */

export interface SplitBreakdown {
  /** O que o comprador efetivamente pagou — já com pacote e cupom. */
  paidCents: number;
  platformPct: number;
  /** Taxa da plataforma (venda + Pix). **Sai primeiro**, do topo. */
  platformFeeCents: number;
  /** A parte da taxa que é de venda (percentual ou por cota). */
  saleFeeCents: number;
  /** A parte da taxa que é de transação Pix. */
  pixFeeCents: number;
  /** O que sobra depois da plataforma. É a base da comissão. */
  netAfterPlatformCents: number;
  commissionPct: number;
  commissionCents: number;
  /** O que fica com o promotor da rifa. Absorve o arredondamento. */
  organizerCents: number;
}

/**
 * Divide uma venda paga entre plataforma, divulgador e promotor.
 *
 * **A ordem importa e é esta: a plataforma sai antes.** A taxa incide sobre o
 * que o comprador pagou; a comissão do afiliado ou do cambista incide sobre o
 * que sobrou depois dela, não sobre o bruto. Inverter a ordem faria a
 * plataforma cobrar sobre dinheiro que já era de outro, e as duas contas
 * cresceriam uma em cima da outra.
 *
 * As duas fatias arredondam **para baixo** e o centavo que sobra fica com o
 * promotor. É a única direção segura: arredondar para cima em qualquer uma
 * das duas faria a soma passar do que o comprador pagou, e aí o sistema
 * estaria distribuindo dinheiro que não existe.
 *
 * Por isso a garantia deste arquivo é de igualdade, não de aproximação:
 * `plataforma + comissão + promotor === pago`, em centavos inteiros, sempre.
 *
 * A taxa da plataforma vem de um de dois jeitos: o percentual (`platformPct`)
 * ou as taxas já calculadas do pedido (`taxas`, de `taxasEmCentavos()` em
 * `shared/cobranca.ts`: venda — percentual ou por cota — e Pix). Com
 * `taxas`, o percentual é ignorado. Em qualquer dos dois, a soma das taxas
 * nunca passa do que foi pago.
 */
export function splitOrder(params: {
  paidCents: number;
  platformPct: number;
  commissionPct: number;
  taxas?: { vendaCents: number; pixCents: number };
}): SplitBreakdown {
  const { paidCents, platformPct, commissionPct, taxas } = params;

  if (!Number.isInteger(paidCents) || paidCents < 0) {
    throw new Error("Valor pago inválido.");
  }
  if (platformPct < 0 || platformPct > 100) {
    throw new Error("Taxa da plataforma inválida.");
  }
  if (commissionPct < 0 || commissionPct > 100) {
    throw new Error("Percentual de comissão inválido.");
  }

  if (taxas) {
    for (const v of [taxas.vendaCents, taxas.pixCents]) {
      if (!Number.isInteger(v) || v < 0) throw new Error("Taxa da plataforma inválida.");
    }
  }

  const saleFeeCents = Math.min(
    paidCents,
    taxas ? taxas.vendaCents : Math.floor((paidCents * platformPct) / 100),
  );
  const pixFeeCents = taxas ? Math.min(paidCents - saleFeeCents, taxas.pixCents) : 0;
  const platformFeeCents = saleFeeCents + pixFeeCents;
  const netAfterPlatformCents = paidCents - platformFeeCents;
  const commission = commissionCents(netAfterPlatformCents, commissionPct);

  return {
    paidCents,
    platformPct,
    platformFeeCents,
    saleFeeCents,
    pixFeeCents,
    netAfterPlatformCents,
    commissionPct,
    commissionCents: commission,
    organizerCents: netAfterPlatformCents - commission,
  };
}
