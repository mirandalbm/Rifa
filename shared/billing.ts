/**
 * O lançamento da taxa da plataforma sobre uma venda paga.
 *
 * Não existe mais contrato por organização (mensalidade ou comissão): quem
 * decide quanto a plataforma cobra é a rifa — percentual sobre a venda ou
 * valor fixo por cota, escolhido pela organização no rascunho e fotografado
 * na publicação — mais a taxa do Pix, em faixas pelo volume do mês. As regras
 * moram em `shared/cobranca.ts`; aqui fica só a linha do razão.
 */

/**
 * A linha da taxa de uma venda paga: a parte da venda e a do Pix juntas.
 * Com o Pix dividido na origem (split do Asaas), a plataforma já ficou com a
 * taxa: a linha existe para o extrato fechar, mas nasce `retida` — listá-la
 * como `aberta` cobraria a mesma taxa duas vezes. Devolve `null` quando não
 * há o que lançar.
 */
export function lancamentoDaTaxa(
  params: {
    organizationId: string;
    orderId: string;
    vendaCents: number;
    pixCents: number;
    /** O modo da rifa no pedido (`percentual` ou `por_cota`). */
    modo: string;
    /** O percentual da venda em pontos-base, no modo percentual. */
    vendaBp: number;
    retidaNoSplit?: boolean;
  },
  agora = new Date(),
) {
  for (const v of [params.vendaCents, params.pixCents]) {
    if (!Number.isInteger(v) || v < 0) throw new Error("Taxa da plataforma inválida.");
  }
  const amountCents = params.vendaCents + params.pixCents;
  if (amountCents <= 0) return null;
  return {
    organizationId: params.organizationId,
    kind: "venda" as const,
    orderId: params.orderId,
    amountCents,
    vendaCents: params.vendaCents,
    pixCents: params.pixCents,
    modo: params.modo,
    pct: params.modo === "percentual" ? params.vendaBp : null,
    ...(params.retidaNoSplit ? { status: "retida" as const, paidAt: agora } : {}),
  };
}
