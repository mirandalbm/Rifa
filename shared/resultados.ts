/**
 * Painel de resultados do organizador: de onde veio cada venda e como somar.
 * Puro, sem banco — o servidor agrupa com isto e a tela rotula com isto.
 */

/**
 * De onde a pessoa chegou à rifa na compra pelo site. Vem do navegador, por
 * isso é só **estatística**: nunca decide dinheiro (comissão é do afiliado,
 * gravado pelo cupom/link, não por isto). Valor fora da lista vira nulo.
 */
export const ORIGENS = {
  vitrine: "Vitrine",
  perfil: "Perfil",
  story: "Story",
  banner: "Banner",
  estado: "Página do estado",
  anuncio: "Anúncio",
} as const;
export type Origem = keyof typeof ORIGENS;

export function validarOrigem(bruta: unknown): Origem | null {
  return typeof bruta === "string" && Object.prototype.hasOwnProperty.call(ORIGENS, bruta)
    ? (bruta as Origem)
    : null;
}

/**
 * O canal da venda, para o painel. Quem vendeu manda: venda do cambista é do
 * cambista, a do link/cupom é do afiliado; o resto é o site, pela origem.
 */
export const CANAIS = {
  cambista: "Cambista",
  afiliado: "Afiliado",
  ...ORIGENS,
  direto: "Direto (link ou busca)",
} as const;
export type Canal = keyof typeof CANAIS;

export function canalDaVenda(v: { sellerId: string | null; affiliateId: string | null; origem: string | null }): Canal {
  if (v.sellerId) return "cambista";
  if (v.affiliateId) return "afiliado";
  return validarOrigem(v.origem) ?? "direto";
}

export const PERIODOS = [7, 30, 90] as const;
export type Periodo = (typeof PERIODOS)[number];

export function validarPeriodo(bruto: unknown): Periodo {
  const n = Number(bruto);
  return (PERIODOS as readonly number[]).includes(n) ? (n as Periodo) : 30;
}

/** Fuso das datas do painel: o dia de venda é o dia no Brasil, não em UTC. */
export const FUSO = "America/Sao_Paulo";

/** "2026-10-01" no fuso de São Paulo. */
export function diaNoFuso(d: Date, fuso = FUSO): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: fuso, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}

/**
 * Os `n` dias do período terminando hoje, com zero onde não houve venda —
 * dia sem venda é informação, não buraco no gráfico.
 */
export function serieDiaria<T extends { dia: string }>(
  linhas: T[],
  n: number,
  hoje: Date,
  vazio: (dia: string) => T,
): T[] {
  const porDia = new Map(linhas.map((l) => [l.dia, l]));
  const saida: T[] = [];
  for (let k = n - 1; k >= 0; k--) {
    const dia = diaNoFuso(new Date(hoje.getTime() - k * 86_400_000));
    saida.push(porDia.get(dia) ?? vazio(dia));
  }
  return saida;
}

/** Ticket médio em centavos, arredondado para baixo (dinheiro é inteiro). */
export function ticketMedio(receitaCents: number, pedidos: number): number {
  return pedidos > 0 ? Math.floor(receitaCents / pedidos) : 0;
}

/** Participação em %, com uma casa, para o rótulo do canal. */
export function participacao(parte: number, total: number): number {
  return total > 0 ? Math.round((parte / total) * 1000) / 10 : 0;
}
