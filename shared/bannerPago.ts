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
 *
 * **Modo por clique** (`docs/PLANO-BANNER-POR-CLIQUE.md`): além dos dias, a
 * plataforma pode vender um pacote de cliques (`config.clique`, nasce
 * desligado). Nos dois modos o banner ocupa a vaga por uma **janela**
 * (`dias`): no modo dia é o que foi comprado; no modo clique é o prazo máximo
 * da configuração do dia da compra, e gastar os cliques fecha a janela antes.
 * Este arquivo só traz a configuração e as contas puras — o que cobra, o que
 * encerra e a tela vêm nos passos seguintes do plano.
 */
import { CLIQUES_MAX_POR_ANUNCIO, descontoPara, gastoAte, validarFaixas, type FaixaDeDesconto } from "./patrocinio";
import { formatBRL } from "./format";

export const DIA_MS = 86_400_000;

/** Como o banner foi pago: dias de topo ou pacote de cliques. */
export const MODOS_DO_BANNER = {
  dia: "Por dia no topo",
  clique: "Por clique",
} as const;
export type ModoDoBanner = keyof typeof MODOS_DO_BANNER;

/** Por que um banner chegou ao fim (a tela diz em texto; cancelado e recusado têm situação própria). */
export const ENCERRADO_POR = {
  cliques: "Gastou todos os cliques",
  prazo: "Chegou ao prazo máximo",
  rifa_fora: "A rifa saiu do ar",
} as const;
export type MotivoDoEncerramento = keyof typeof ENCERRADO_POR;

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

/** O modo por clique: tudo é configuração da plataforma, nada fica escrito em tela ou servidor. */
export interface ConfigBannerPorClique {
  /** Sem isto o modo por clique não existe para a organização (nasce desligado). */
  ligado: boolean;
  /** Preço de um clique, em centavos. */
  precoCents: number;
  /** Menor pacote de cliques por pedido. */
  minimoCliques: number;
  /** Maior pacote de cliques por pedido. */
  maximoCliques: number;
  /** A janela: o banner sai do ar ao chegar aqui, mesmo com cliques sobrando. */
  prazoMaxDias: number;
  /** A partir de N cliques, X% de desconto. Ordenadas; o desconto só cresce. */
  faixas: FaixaDeDesconto[];
}

export interface ConfigBannerPago {
  /** Sem isto o produto não existe para a organização. */
  ligado: boolean;
  /** Preço de um dia no topo, em centavos. */
  precoDiaCents: number;
  diasMin: number;
  diasMax: number;
  /** Desconto por período no modo dia: a partir de N dias, X%. Vazio de fábrica. */
  faixasDia: FaixaDeDesconto[];
  /** Banners pagos no ar ao mesmo tempo (os da plataforma não contam). Vale para os dois modos. */
  vagas: number;
  /** Quanto cada banner pago fica na tela antes de passar. */
  segundos: number;
  /** O modo por clique. */
  clique: ConfigBannerPorClique;
}

/**
 * Padrão de fábrica: só vale para quem ainda não salvou nada. O que a
 * produção usa é o que a plataforma salvou no painel — este é o único lugar
 * do código com valor de preço, pacote ou prazo do modo por clique.
 */
export const CONFIG_BANNER_CLIQUE_PADRAO: ConfigBannerPorClique = {
  ligado: false,
  precoCents: 100,
  minimoCliques: 100,
  // R$ 10.000,00 ao preço de fábrica: o mesmo teto da recarga do saldo.
  maximoCliques: 10_000,
  prazoMaxDias: 30,
  faixas: [],
};

export const CONFIG_BANNER_PAGO_PADRAO: ConfigBannerPago = {
  ligado: false,
  precoDiaCents: 2_000,
  diasMin: 1,
  diasMax: 30,
  faixasDia: [],
  vagas: 3,
  segundos: 6,
  clique: CONFIG_BANNER_CLIQUE_PADRAO,
};

const erro = (m: string) => Object.assign(new Error(m), { status: 400 });

function inteiro(v: unknown, min: number, max: number, nome: string): number {
  const n = Number(v);
  if (!Number.isInteger(n) || n < min || n > max) throw erro(`${nome}: de ${min} a ${max}.`);
  return n;
}

function faixasDoCorpo(v: unknown, padrao: FaixaDeDesconto[], aPartirDeMax: number, unidade: string): FaixaDeDesconto[] {
  if (v === undefined || v === null) return padrao.map((f) => ({ ...f }));
  if (!Array.isArray(v)) throw erro("As faixas de desconto vêm numa lista.");
  return validarFaixas(v, { aPartirDeMax, unidade });
}

function validarCliqueDoBanner(bruto: unknown): ConfigBannerPorClique {
  const p = CONFIG_BANNER_CLIQUE_PADRAO;
  if (bruto === undefined || bruto === null) return { ...p, faixas: [] };
  if (typeof bruto !== "object" || Array.isArray(bruto)) throw erro("A configuração do banner por clique vem num objeto.");
  const b = bruto as Record<string, unknown>;
  const minimoCliques = inteiro(b.minimoCliques ?? p.minimoCliques, 1, CLIQUES_MAX_POR_ANUNCIO, "Mínimo de cliques por pedido");
  const maximoCliques = inteiro(b.maximoCliques ?? p.maximoCliques, 1, CLIQUES_MAX_POR_ANUNCIO, "Máximo de cliques por pedido");
  if (maximoCliques < minimoCliques) throw erro("O máximo de cliques não pode ser menor que o mínimo.");
  return {
    ligado: b.ligado === true,
    precoCents: inteiro(b.precoCents ?? p.precoCents, 1, 10_000, "Preço do clique (centavos)"),
    minimoCliques,
    maximoCliques,
    prazoMaxDias: inteiro(b.prazoMaxDias ?? p.prazoMaxDias, 1, 90, "Prazo máximo (dias)"),
    // Faixa acima do máximo seria um degrau que ninguém alcança.
    faixas: faixasDoCorpo(b.faixas, p.faixas, maximoCliques, "cliques"),
  };
}

/**
 * Só as chaves conhecidas: isto vem do corpo da requisição. O que falta no
 * corpo vira o padrão de fábrica — por isso quem **salva** parte da
 * configuração atual (`mesclarConfigBannerPago()`), nunca daqui.
 */
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
    faixasDia: faixasDoCorpo(b.faixasDia, p.faixasDia, diasMax, "dias"),
    vagas: inteiro(b.vagas ?? p.vagas, 0, 10, "Vagas de banner pago"),
    segundos: inteiro(b.segundos ?? p.segundos, 2, 30, "Segundos na tela"),
    clique: validarCliqueDoBanner(b.clique),
  };
}

const CHAVES_DA_CONFIG = ["ligado", "precoDiaCents", "diasMin", "diasMax", "faixasDia", "vagas", "segundos"] as const;
const CHAVES_DO_CLIQUE = ["ligado", "precoCents", "minimoCliques", "maximoCliques", "prazoMaxDias", "faixas"] as const;

/**
 * Valor que veio no corpo e vale: `undefined` é omissão e `null` também (nunca
 * volta ao padrão de fábrica, que é o que `null ?? padrão` faria). A lista de
 * faixas é a exceção: `null` ali é "limpar".
 */
function mandou(chave: string, valor: unknown, chaveDaLista: string): boolean {
  return valor !== undefined && (valor !== null || chave === chaveDaLista);
}

/**
 * A configuração que o `PUT` guarda: **parte da atual** e troca só as chaves
 * conhecidas que vieram no corpo (e, dentro de `clique`, só as que vieram ali).
 * Antes, o que faltava no corpo virava o padrão de fábrica — mandar
 * `{ ligado: true }` reescrevia preço, dias e vagas, e `ligado` ausente
 * desligava o produto. A lista de faixas troca inteira (é um valor só). O
 * resultado passa pela régua de sempre; corpo que não é objeto é 400.
 */
export function mesclarConfigBannerPago(atual: ConfigBannerPago, corpo: unknown): ConfigBannerPago {
  if (corpo === null || typeof corpo !== "object" || Array.isArray(corpo)) {
    throw erro("Mande a configuração do banner pago num objeto.");
  }
  const c = corpo as Record<string, unknown>;
  const mesclado: Record<string, unknown> = { ...atual, clique: { ...atual.clique } };
  for (const k of CHAVES_DA_CONFIG) if (mandou(k, c[k], "faixasDia")) mesclado[k] = c[k];
  if (c.clique !== undefined) {
    if (c.clique === null || typeof c.clique !== "object" || Array.isArray(c.clique)) {
      throw erro("A configuração do banner por clique vem num objeto.");
    }
    const cl = c.clique as Record<string, unknown>;
    const clique: Record<string, unknown> = { ...atual.clique };
    for (const k of CHAVES_DO_CLIQUE) if (mandou(k, cl[k], "faixas")) clique[k] = cl[k];
    mesclado.clique = clique;
  }
  return validarConfigBannerPago(mesclado);
}

/**
 * O total do pedido por dia: dias × preço do dia, menos o desconto da maior
 * faixa de período alcançada, tudo em centavos inteiros e **para baixo**. Sem
 * faixa, é o de sempre: dias × preço, centavo por centavo.
 */
export function precoDoBanner(
  cfg: ConfigBannerPago,
  diasBrutos: unknown,
): { dias: number; descontoPct: number; brutoCents: number; totalCents: number } {
  const dias = Number(diasBrutos);
  if (!Number.isInteger(dias) || dias < cfg.diasMin || dias > cfg.diasMax) {
    throw erro(`Escolha de ${cfg.diasMin} a ${cfg.diasMax} dias.`);
  }
  const descontoPct = descontoPara(cfg.faixasDia, dias);
  const brutoCents = dias * cfg.precoDiaCents;
  return { dias, descontoPct, brutoCents, totalCents: Math.floor((brutoCents * (100 - descontoPct)) / 100) };
}

/**
 * O total do pedido por clique: cliques × preço do clique, menos o desconto
 * da maior faixa alcançada, para baixo. Pacote fora do mínimo e do máximo da
 * configuração é recusado, com a mesma mensagem que a tela mostra. O preço do
 * clique e o desconto saem daqui para o pedido **fotografar** (mudar a
 * tabela depois não mexe no que já foi pago).
 */
export function precoDoBannerPorClique(
  cfg: ConfigBannerPago,
  cliquesBrutos: unknown,
): { cliques: number; precoCliqueCents: number; descontoPct: number; brutoCents: number; totalCents: number } {
  const c = cfg.clique;
  const cliques = Number(cliquesBrutos);
  if (!Number.isInteger(cliques)) throw erro("Informe quantos cliques, em número inteiro.");
  if (cliques < c.minimoCliques) throw erro(`O pacote mínimo é de ${c.minimoCliques} cliques.`);
  if (cliques > c.maximoCliques) throw erro(`O pacote máximo é de ${c.maximoCliques} cliques.`);
  const descontoPct = descontoPara(c.faixas, cliques);
  const brutoCents = cliques * c.precoCents;
  return {
    cliques,
    precoCliqueCents: c.precoCents,
    descontoPct,
    brutoCents,
    totalCents: Math.floor((brutoCents * (100 - descontoPct)) / 100),
  };
}

const reais = (cents: number) => formatBRL(cents).replace(/ /g, " ");
const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;

/**
 * A conta do pedido em texto — a mesma que a tela mostra e que o servidor
 * grava na descrição do lançamento: "7 dias × R$ 30,00 = R$ 210,00, menos 10%
 * (R$ 21,00) = R$ 189,00". Usa as mesmas funções de preço do servidor: a
 * quantidade fora da faixa lança o mesmo erro delas.
 */
export function resumoDoPedido(
  cfg: ConfigBannerPago,
  entrada: { modo: "dia"; dias: unknown } | { modo: "clique"; cliques: unknown },
): string {
  const p =
    entrada.modo === "dia"
      ? (() => {
          const d = precoDoBanner(cfg, entrada.dias);
          return { conta: `${plural(d.dias, "dia", "dias")} × ${reais(cfg.precoDiaCents)}`, ...d };
        })()
      : (() => {
          const c = precoDoBannerPorClique(cfg, entrada.cliques);
          return { conta: `${plural(c.cliques, "clique", "cliques")} × ${reais(c.precoCliqueCents)}`, ...c };
        })();
  const base = `${p.conta} = ${reais(p.brutoCents)}`;
  return p.descontoPct > 0
    ? `${base}, menos ${p.descontoPct}% (${reais(p.brutoCents - p.totalCents)}) = ${reais(p.totalCents)}`
    : base;
}

/** O que a tela diz do prazo, ao lado da conta: o prazo máximo sai da configuração, nunca digitado. */
export function avisoDoPrazo(cfg: ConfigBannerPago, modo: ModoDoBanner): string {
  if (modo === "dia") return "O tempo só começa a contar quando o banner entra no ar.";
  return `Vale até gastar os cliques ou em ${plural(cfg.clique.prazoMaxDias, "dia", "dias")}, o que vier primeiro. O que não for usado volta ao seu saldo como crédito.`;
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

/**
 * Quanto volta ao saldo no modo por clique: o valor pago menos o gasto dos
 * cliques usados (`gastoAte()` de `shared/patrocinio.ts`, a mesma conta de
 * cada clique: a soma de todos é exatamente o valor pago). Gasto + sobra
 * fecha o valor pago, sempre. Banner que nunca foi ao ar volta inteiro.
 */
export function sobraDoBannerPorClique(p: {
  valorPagoCents: number;
  comprados: number;
  usados: number;
  inicio: Date | null;
}): number {
  if (!p.inicio) return p.valorPagoCents;
  return Math.max(0, p.valorPagoCents - gastoDoBannerPorClique(p.valorPagoCents, p.comprados, p.usados));
}

/**
 * O que os `usados` cliques já gastaram do pacote — a parte proporcional do
 * valor pago, para baixo, limitada ao que foi comprado. Cada clique custa a
 * diferença entre dois acumulados, então a soma dos cliques é o valor pago.
 */
export function gastoDoBannerPorClique(valorPagoCents: number, comprados: number, usados: number): number {
  return gastoAte(valorPagoCents, comprados, Math.max(0, usados));
}

/**
 * Até quando cada banner da fila entra, **no mais tardar** — sem estimativa.
 * Cada vaga ocupada libera, no máximo, no `fim` dela (o último clique só pode
 * adiantar), e cada pedido da frente ocupa a vaga, no máximo, pela janela dele
 * (`dias`). Simula isso na ordem da fila e devolve, para cada pedido, o
 * instante (ms) limite da entrada: `agora` se há vaga livre; `Infinity` se a
 * plataforma não tem vaga nenhuma. `fins` são os fins (ms) dos banners no ar;
 * `janelasDias`, a janela de cada pedido esperando, na ordem de aprovação.
 */
export function previsaoDaFilaDoBanner(fins: number[], janelasDias: number[], vagas: number, agora: number): number[] {
  if (vagas <= 0) return janelasDias.map(() => Infinity);
  const ocupadas = fins.map((f) => Math.max(f, agora)).sort((a, b) => a - b);
  const saida: number[] = [];
  for (const dias of janelasDias) {
    // Quantas vagas precisam terminar para sobrar uma livre.
    const precisam = ocupadas.length - vagas + 1;
    let entra = agora;
    if (precisam > 0) {
      entra = ocupadas[precisam - 1];
      ocupadas.splice(0, precisam);
    }
    ocupadas.push(entra + Math.max(0, dias) * DIA_MS);
    ocupadas.sort((a, b) => a - b);
    saida.push(entra);
  }
  return saida;
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
