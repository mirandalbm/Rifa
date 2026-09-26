/**
 * Quanto volta num reembolso — regra do Código de Defesa do Consumidor,
 * pura, lida pelo servidor (que decide e grava) e pela tela (que mostra antes
 * de o comprador enviar o pedido, e antes da compra).
 *
 * | Quando o pedido é feito                                   | Devolve | Taxa        |
 * |-----------------------------------------------------------|---------|-------------|
 * | Compra online, até 7 dias da compra, antes do sorteio     | 100%    | nenhuma     |
 * | Depois de 7 dias, ou compra presencial (cambista)         | ≥ 90%   | até 10%     |
 * | A menos de 2 horas do sorteio, ou depois dele             | —       | não abre    |
 *
 * A taxa é administrativa, da plataforma, e o administrador geral a escolhe
 * entre 0% e 10% (limite que o Idec e a jurisprudência aceitam). O modelo é
 * promoção comercial (Lei 5.768/71), não título de capitalização.
 */

/** Direito de arrependimento: art. 49 do CDC, compra fora do estabelecimento. */
export const DIAS_ARREPENDIMENTO = 7;
/** O quadro de números fecha antes do sorteio: pedido novo não abre. */
export const CORTE_ANTES_DO_SORTEIO_MS = 2 * 60 * 60 * 1000;
/** Teto da taxa administrativa (art. 51 do CDC, multa não abusiva). */
export const TAXA_REEMBOLSO_MAX_PCT = 10;
export const TAXA_REEMBOLSO_PADRAO_PCT = 10;

export type TipoReembolso = "arrependimento" | "com_taxa";

export const NOME_TIPO_REEMBOLSO: Record<TipoReembolso, string> = {
  arrependimento: "arrependimento (até 7 dias) — devolução integral",
  com_taxa: "depois de 7 dias ou compra presencial — com taxa administrativa",
};

export interface CalculoReembolso {
  tipo: TipoReembolso;
  taxaPct: number;
  taxaCents: number;
  devolverCents: number;
}

/**
 * `vendaOnline`: comprada pelo site/app (Pix online), onde vale o
 * arrependimento. Venda do cambista é presencial. O prazo conta do pagamento
 * (ou da criação do pedido, se não houver data de pagamento).
 */
export function calcularReembolso(p: {
  pagoCents: number;
  vendaOnline: boolean;
  compradoEm: Date;
  pedidoEm: Date;
  taxaPct: number;
}): CalculoReembolso {
  const dentroDos7Dias =
    p.pedidoEm.getTime() - p.compradoEm.getTime() <= DIAS_ARREPENDIMENTO * 86_400_000;
  if (p.vendaOnline && dentroDos7Dias) {
    return { tipo: "arrependimento", taxaPct: 0, taxaCents: 0, devolverCents: p.pagoCents };
  }
  const pct = Math.min(TAXA_REEMBOLSO_MAX_PCT, Math.max(0, Math.round(p.taxaPct)));
  // A taxa arredonda para baixo: o centavo que sobra fica com o consumidor.
  const taxaCents = Math.floor((p.pagoCents * pct) / 100);
  return { tipo: "com_taxa", taxaPct: pct, taxaCents, devolverCents: p.pagoCents - taxaCents };
}

/** O pedido de reembolso ainda pode ser aberto, olhando só o relógio do sorteio. */
export function fechadoPeloSorteio(sorteioEm: Date | null | undefined, agora: Date): boolean {
  if (!sorteioEm) return false;
  return agora.getTime() >= sorteioEm.getTime() - CORTE_ANTES_DO_SORTEIO_MS;
}

/** O texto que o comprador lê antes de comprar. */
export function regraDoReembolso(taxaPct: number): string {
  const pct = Math.min(TAXA_REEMBOLSO_MAX_PCT, Math.max(0, Math.round(taxaPct)));
  return (
    `Reembolso: compra online pode ser cancelada com devolução integral em até ${DIAS_ARREPENDIMENTO} dias. ` +
    (pct > 0
      ? `Depois disso, ou em compra com cambista, é retida taxa administrativa de ${pct}%. `
      : `Depois disso, ou em compra com cambista, também sem taxa. `) +
    `Os pedidos fecham 2 horas antes do sorteio; depois do sorteio não há reembolso.`
  );
}
