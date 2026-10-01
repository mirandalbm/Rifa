/**
 * Banner pago na vitrine — regras puras, lidas pelo servidor (que decide e
 * cobra) e pelas telas (que mostram preço, prazo e situação).
 *
 * A organização escolhe uma rifa no ar, manda a arte (1200×600) e compra
 * **dias de topo**: o preço é por dia, editável pela plataforma, e sai do
 * saldo que já existe nas rifas patrocinadas. A arte passa pela análise da
 * plataforma antes de ir ao ar (propaganda enganosa no topo da vitrine é
 * golpe com a vitrine inteira de testemunha). Aprovado, o banner espera uma
 * vaga e, quando a pega, fica **os dias comprados** — o relógio só começa
 * quando ele aparece, nunca na fila. Rifa que sai do ar leva o banner
 * junto, e os dias não usados voltam ao saldo como crédito.
 *
 * Nasce desligado: sem a plataforma ligar e fixar o preço, a organização não
 * vê o produto e o servidor responde 404.
 */

export const DIA_MS = 86_400_000;

export const SITUACOES_DO_BANNER = {
  em_analise: "Em análise",
  aprovado: "Aprovado, esperando vaga",
  no_ar: "No ar",
  encerrado: "Encerrado",
  recusado: "Recusado",
  cancelado: "Cancelado",
} as const;
export type SituacaoDoBanner = keyof typeof SITUACOES_DO_BANNER;

/** Pedido que ainda ocupa a rifa: só um por vez (o índice parcial decide). */
export const SITUACOES_EM_ABERTO: SituacaoDoBanner[] = ["em_analise", "aprovado", "no_ar"];

export interface ConfigBannerPago {
  /** Sem isto o produto não existe para a organização. */
  ligado: boolean;
  /** Preço de um dia no topo, em centavos. */
  precoDiaCents: number;
  diasMin: number;
  diasMax: number;
  /** Banners pagos no ar ao mesmo tempo (os da plataforma não contam). */
  vagas: number;
  /** Quanto cada banner pago fica na tela antes de passar. */
  segundos: number;
}

export const CONFIG_BANNER_PAGO_PADRAO: ConfigBannerPago = {
  ligado: false,
  precoDiaCents: 2_000,
  diasMin: 1,
  diasMax: 30,
  vagas: 3,
  segundos: 6,
};

const erro = (m: string) => Object.assign(new Error(m), { status: 400 });

function inteiro(v: unknown, min: number, max: number, nome: string): number {
  const n = Number(v);
  if (!Number.isInteger(n) || n < min || n > max) throw erro(`${nome}: de ${min} a ${max}.`);
  return n;
}

/** Só as chaves conhecidas: isto vem do corpo da requisição. */
export function validarConfigBannerPago(bruto: unknown): ConfigBannerPago {
  if (bruto === undefined || bruto === null) return CONFIG_BANNER_PAGO_PADRAO;
  const b = bruto as Record<string, unknown>;
  const p = CONFIG_BANNER_PAGO_PADRAO;
  const diasMin = inteiro(b.diasMin ?? p.diasMin, 1, 90, "Mínimo de dias");
  const diasMax = inteiro(b.diasMax ?? p.diasMax, 1, 90, "Máximo de dias");
  if (diasMax < diasMin) throw erro("O máximo de dias não pode ser menor que o mínimo.");
  return {
    ligado: b.ligado === true,
    precoDiaCents: inteiro(b.precoDiaCents ?? p.precoDiaCents, 1, 1_000_000, "Preço do dia (centavos)"),
    diasMin,
    diasMax,
    vagas: inteiro(b.vagas ?? p.vagas, 0, 10, "Vagas de banner pago"),
    segundos: inteiro(b.segundos ?? p.segundos, 2, 30, "Segundos na tela"),
  };
}

/** O total do pedido: dias × preço do dia, tudo em centavos inteiros. */
export function precoDoBanner(cfg: ConfigBannerPago, diasBrutos: unknown): { dias: number; totalCents: number } {
  const dias = Number(diasBrutos);
  if (!Number.isInteger(dias) || dias < cfg.diasMin || dias > cfg.diasMax) {
    throw erro(`Escolha de ${cfg.diasMin} a ${cfg.diasMax} dias.`);
  }
  return { dias, totalCents: dias * cfg.precoDiaCents };
}

export const TITULO_MAX = 80;

/** O título é o texto alternativo da arte (quem não enxerga a imagem lê isto). */
export function validarTituloDoBanner(bruto: unknown): string {
  if (typeof bruto !== "string") throw erro("Dê um título ao banner: é o texto de quem não enxerga a imagem.");
  const t = bruto.replace(/\s+/g, " ").trim();
  if (t.length < 3) throw erro("O título do banner precisa de pelo menos 3 letras.");
  if (t.length > TITULO_MAX) throw erro(`O título passa de ${TITULO_MAX} caracteres.`);
  return t;
}

/**
 * Quanto volta ao saldo quando o banner sai do ar antes do fim. O dia em que
 * ele começou conta inteiro (começou, foi usado); o resto volta. Arredonda o
 * gasto para baixo no centavo: nunca devolve mais do que sobrou. Banner que
 * nem chegou a aparecer volta inteiro.
 */
export function sobraDoBanner(p: { valorPagoCents: number; dias: number; inicio: Date | null; agora: Date }): number {
  if (!p.inicio) return p.valorPagoCents;
  const usados = Math.min(p.dias, Math.max(1, Math.ceil((p.agora.getTime() - p.inicio.getTime()) / DIA_MS)));
  const gasto = Math.floor((p.valorPagoCents * usados) / p.dias);
  return Math.max(0, p.valorPagoCents - gasto);
}

/** Está na tela agora? A janela vale mesmo que o relógio ainda não tenha encerrado. */
export function bannerPagoNoAr(b: { status: string; inicio: Date | string | null; fim: Date | string | null }, agora = new Date()): boolean {
  if (b.status !== "no_ar" || !b.inicio || !b.fim) return false;
  return new Date(b.inicio).getTime() <= agora.getTime() && agora.getTime() < new Date(b.fim).getTime();
}

/** O que a tela mostra de quanto falta (para o painel, não para o público). */
export function diasQueFaltam(fim: Date | string | null, agora = new Date()): number {
  if (!fim) return 0;
  return Math.max(0, Math.ceil((new Date(fim).getTime() - agora.getTime()) / DIA_MS));
}

export function problemaNaRecusa(motivo: unknown): string | null {
  if (typeof motivo !== "string" || motivo.trim().length < 10) {
    return "Explique o motivo da recusa (pelo menos 10 letras): a organização lê isto.";
  }
  return null;
}
