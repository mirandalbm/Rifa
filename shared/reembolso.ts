/**
 * Quanto volta num reembolso — regra do Código de Defesa do Consumidor,
 * pura, lida pelo servidor (que decide e grava) e pela tela (que mostra antes
 * de o comprador enviar o pedido, e antes da compra).
 *
 * | Quando o pedido é feito                                   | Devolve | Taxa        |
 * |-----------------------------------------------------------|---------|-------------|
 * | Compra online, até 7 dias da compra, antes do sorteio     | 100%    | nenhuma     |
 * | Sorteio adiado depois da compra (online ou cambista)      | 100%    | nenhuma     |
 * | Depois de 7 dias, ou compra presencial (cambista)         | ≥ 90%   | até 10%     |
 * | A menos de 2 horas do sorteio, ou depois dele             | —       | não abre    |
 *
 * **O arrependimento acaba no que vier primeiro: 7 dias ou o fechamento dos
 * pedidos, 2 horas antes do sorteio.** O bilhete é a participação num sorteio
 * com data marcada; feito o sorteio, o serviço foi prestado (quem perdeu não
 * pode desistir depois de saber). Como o prazo pode ficar menor que 7 dias, a
 * tela avisa **antes da compra**, com a data e a hora exatas
 * (`avisoDePrazoCurto()`), ao lado do botão do Pix — CDC, arts. 6º, III, e
 * 31; Decreto 7.962/2013, art. 5º.
 *
 * **Adiamento muda o que foi comprado**: quem pagou antes de a plataforma
 * aprovar a data nova pode desistir com devolução integral, por qualquer
 * canal, até o fechamento da data nova.
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

export type TipoReembolso = "arrependimento" | "adiamento" | "com_taxa";

export const NOME_TIPO_REEMBOLSO: Record<TipoReembolso, string> = {
  arrependimento: "arrependimento (até 7 dias) — devolução integral",
  adiamento: "sorteio adiado depois da compra — devolução integral",
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
  /** Quando a plataforma aprovou o último adiamento do sorteio, se houve. */
  adiadoEm?: Date | null;
}): CalculoReembolso {
  if (p.adiadoEm && p.compradoEm.getTime() < p.adiadoEm.getTime()) {
    return {
      tipo: "adiamento",
      taxaPct: 0,
      taxaCents: 0,
      devolverCents: p.pagoCents,
    };
  }
  const dentroDos7Dias = p.pedidoEm.getTime() - p.compradoEm.getTime() <= DIAS_ARREPENDIMENTO * 86_400_000;
  if (p.vendaOnline && dentroDos7Dias) {
    return {
      tipo: "arrependimento",
      taxaPct: 0,
      taxaCents: 0,
      devolverCents: p.pagoCents,
    };
  }
  const pct = Math.min(TAXA_REEMBOLSO_MAX_PCT, Math.max(0, Math.round(p.taxaPct)));
  // A taxa arredonda para baixo: o centavo que sobra fica com o consumidor.
  const taxaCents = Math.floor((p.pagoCents * pct) / 100);
  return {
    tipo: "com_taxa",
    taxaPct: pct,
    taxaCents,
    devolverCents: p.pagoCents - taxaCents,
  };
}

/** O pedido de reembolso ainda pode ser aberto, olhando só o relógio do sorteio. */
export function fechadoPeloSorteio(sorteioEm: Date | null | undefined, agora: Date): boolean {
  if (!sorteioEm) return false;
  return agora.getTime() >= sorteioEm.getTime() - CORTE_ANTES_DO_SORTEIO_MS;
}

/**
 * Até quando quem compra agora pode desistir com devolução integral: 7 dias
 * ou o fechamento dos pedidos (2 horas antes do sorteio), o que vier
 * primeiro. Sem data de sorteio, 7 dias.
 */
export function prazoDoArrependimento(compradoEm: Date, sorteioEm: Date | null | undefined): Date {
  const seteDias = compradoEm.getTime() + DIAS_ARREPENDIMENTO * 86_400_000;
  if (!sorteioEm) return new Date(seteDias);
  return new Date(Math.min(seteDias, sorteioEm.getTime() - CORTE_ANTES_DO_SORTEIO_MS));
}

/** "10/10/2026 às 17:00", no fuso de São Paulo. */
function dataEHoraSP(d: Date): string {
  const partes = new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(d);
  const v = (t: string) => partes.find((x) => x.type === t)?.value ?? "";
  return `${v("day")}/${v("month")}/${v("year")} às ${v("hour")}:${v("minute")}`;
}

/**
 * O aviso ao lado do Pix quando o prazo de desistir fica menor que 7 dias
 * (o sorteio está perto). `null` quando valem os 7 dias inteiros.
 */
export function avisoDePrazoCurto(agora: Date, sorteioEm: Date | null | undefined): string | null {
  if (!sorteioEm) return null;
  const prazo = prazoDoArrependimento(agora, sorteioEm);
  if (prazo.getTime() >= agora.getTime() + DIAS_ARREPENDIMENTO * 86_400_000) return null;
  if (prazo.getTime() <= agora.getTime()) {
    return "Os pedidos de reembolso desta rifa já fecharam (2 horas antes do sorteio): esta compra não poderá ser desfeita.";
  }
  return (
    `Atenção: o sorteio é em ${dataEHoraSP(sorteioEm)}. ` +
    `Você pode desistir desta compra com devolução integral até ${dataEHoraSP(prazo)} ` +
    `(2 horas antes do sorteio), antes dos ${DIAS_ARREPENDIMENTO} dias.`
  );
}

/** O texto que o comprador lê antes de comprar. */
export function regraDoReembolso(taxaPct: number): string {
  const pct = Math.min(TAXA_REEMBOLSO_MAX_PCT, Math.max(0, Math.round(taxaPct)));
  return (
    `Reembolso: compra online pode ser desfeita com devolução integral em até ${DIAS_ARREPENDIMENTO} dias, ` +
    `desde que antes do fechamento dos pedidos, 2 horas antes do sorteio — o que vier primeiro. ` +
    (pct > 0
      ? `Depois disso, ou em compra com cambista, é retida taxa administrativa de ${pct}%. `
      : `Depois disso, ou em compra com cambista, também sem taxa. `) +
    `Se o sorteio for adiado depois da sua compra, a devolução é integral até 2 horas antes da nova data. ` +
    `Feito o sorteio, a participação foi prestada e não há reembolso.`
  );
}
