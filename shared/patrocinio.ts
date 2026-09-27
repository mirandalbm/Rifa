/**
 * Rifas patrocinadas por clique (etapa 15) — regras puras, lidas pelo
 * servidor (que decide e cobra) e pela tela (que mostra preço e fila).
 *
 * O **anúncio é um pacote de cliques**: o organizador escolhe a rifa, o
 * alcance (cidade, estado ou Brasil) e quantos cliques compra. O preço sai
 * da tabela do administrador geral, com desconto por faixa de volume, e é
 * pago de uma vez com o saldo. Cada alcance tem vagas na vitrine; a fila é
 * por ordem de chegada, e o anúncio que entrou fica na vaga **até gastar
 * todos os cliques comprados** — aí o próximo entra sozinho.
 *
 * Três regras seguram a conta honesta: o clique conta uma vez por
 * visitante em 24 h; robô não conta; o anúncio nunca gasta mais cliques do
 * que comprou.
 */

export const ALCANCES = {
  cidade: "Cidade",
  estado: "Estado",
  nacional: "Brasil inteiro",
} as const;
export type Alcance = keyof typeof ALCANCES;

export const JANELA_DO_CLIQUE_HORAS = 24;
/** Venda atribuída ao clique: o mesmo aparelho compra a rifa em até 7 dias. */
export const JANELA_DA_VENDA_DIAS = 7;
export const RECARGA_MAXIMA_CENTS = 1_000_000;
export const CLIQUES_MAX_POR_ANUNCIO = 100_000;

export interface FaixaDeDesconto {
  /** A partir de quantos cliques vale o desconto. */
  aPartirDe: number;
  descontoPct: number;
}

export interface ConfigPatrocinio {
  /** Preço do clique por alcance, em centavos. */
  precos: Record<Alcance, number>;
  /** Quanto mais cliques, mais desconto. Ordenadas, sem repetir. */
  faixas: FaixaDeDesconto[];
  /** Menor pacote de cliques por anúncio. */
  minimoCliques: number;
  /** Vagas na vitrine de quem olha, por alcance. */
  vagas: Record<Alcance, number>;
  recargaMinimaCents: number;
}

export const CONFIG_PATROCINIO_PADRAO: ConfigPatrocinio = {
  precos: { cidade: 25, estado: 40, nacional: 60 },
  faixas: [
    { aPartirDe: 500, descontoPct: 5 },
    { aPartirDe: 1000, descontoPct: 10 },
    { aPartirDe: 5000, descontoPct: 15 },
  ],
  minimoCliques: 50,
  vagas: { cidade: 1, estado: 1, nacional: 3 },
  recargaMinimaCents: 2_000,
};

const erro = (m: string) => Object.assign(new Error(m), { status: 400 });

function inteiro(v: unknown, min: number, max: number, nome: string): number {
  const n = Number(v);
  if (!Number.isInteger(n) || n < min || n > max) throw erro(`${nome}: de ${min} a ${max}.`);
  return n;
}

/** Só as chaves conhecidas: isto vem do corpo da requisição. */
export function validarConfigPatrocinio(bruto: unknown): ConfigPatrocinio {
  if (bruto === undefined || bruto === null) return CONFIG_PATROCINIO_PADRAO;
  const b = bruto as Record<string, any>;
  const p = CONFIG_PATROCINIO_PADRAO;
  const precos = {
    cidade: inteiro(b.precos?.cidade ?? p.precos.cidade, 1, 10_000, "Preço do clique na cidade (centavos)"),
    estado: inteiro(b.precos?.estado ?? p.precos.estado, 1, 10_000, "Preço do clique no estado (centavos)"),
    nacional: inteiro(b.precos?.nacional ?? p.precos.nacional, 1, 10_000, "Preço do clique no Brasil (centavos)"),
  };
  const faixasBrutas: unknown[] = Array.isArray(b.faixas) ? b.faixas : p.faixas;
  if (faixasBrutas.length > 6) throw erro("Até 6 faixas de desconto.");
  const faixas = faixasBrutas
    .map((f: any, i) => ({
      aPartirDe: inteiro(f?.aPartirDe, 2, CLIQUES_MAX_POR_ANUNCIO, `Faixa ${i + 1}, a partir de (cliques)`),
      descontoPct: inteiro(f?.descontoPct, 1, 60, `Faixa ${i + 1}, desconto (%)`),
    }))
    .sort((x, y) => x.aPartirDe - y.aPartirDe);
  for (let i = 1; i < faixas.length; i++) {
    if (faixas[i].aPartirDe === faixas[i - 1].aPartirDe) throw erro("Duas faixas começam no mesmo número de cliques.");
    // Pacote maior nunca sai mais caro por clique que o menor.
    if (faixas[i].descontoPct <= faixas[i - 1].descontoPct) throw erro("O desconto precisa crescer junto com a faixa.");
  }
  return {
    precos,
    faixas,
    minimoCliques: inteiro(b.minimoCliques ?? p.minimoCliques, 1, 10_000, "Mínimo de cliques por anúncio"),
    vagas: {
      cidade: inteiro(b.vagas?.cidade ?? p.vagas.cidade, 0, 5, "Vagas por cidade"),
      estado: inteiro(b.vagas?.estado ?? p.vagas.estado, 0, 5, "Vagas por estado"),
      nacional: inteiro(b.vagas?.nacional ?? p.vagas.nacional, 0, 5, "Vagas no Brasil"),
    },
    recargaMinimaCents: inteiro(b.recargaMinimaCents ?? p.recargaMinimaCents, 100, RECARGA_MAXIMA_CENTS, "Recarga mínima (centavos)"),
  };
}

/** O desconto da maior faixa alcançada. */
export function descontoPara(faixas: FaixaDeDesconto[], cliques: number): number {
  let d = 0;
  for (const f of faixas) if (cliques >= f.aPartirDe) d = f.descontoPct;
  return d;
}

/**
 * Quanto custa o pacote. O total arredonda para baixo (dinheiro é inteiro,
 * e o organizador nunca paga fração de centavo a mais).
 */
export function precoDoPacote(cfg: ConfigPatrocinio, alcance: Alcance, cliques: number) {
  if (!(alcance in ALCANCES)) throw erro("Alcance desconhecido.");
  if (!Number.isInteger(cliques) || cliques < cfg.minimoCliques) throw erro(`O pacote mínimo é de ${cfg.minimoCliques} cliques.`);
  if (cliques > CLIQUES_MAX_POR_ANUNCIO) throw erro(`O pacote máximo é de ${CLIQUES_MAX_POR_ANUNCIO} cliques.`);
  const precoCliqueCents = cfg.precos[alcance];
  const descontoPct = descontoPara(cfg.faixas, cliques);
  const brutoCents = precoCliqueCents * cliques;
  const totalCents = Math.floor((brutoCents * (100 - descontoPct)) / 100);
  return { precoCliqueCents, descontoPct, brutoCents, totalCents };
}

/**
 * Gasto acumulado depois de `usados` cliques: a parte proporcional do que
 * foi pago, para baixo. Cada clique custa a diferença entre dois
 * acumulados — a soma de todos os cliques é exatamente o valor pago.
 */
export function gastoAte(valorPagoCents: number, comprados: number, usados: number): number {
  if (comprados <= 0) return 0;
  return Math.floor((valorPagoCents * Math.min(usados, comprados)) / comprados);
}

/* ------------------------------------------------------------------ *
 * Segmentos: onde o anúncio aparece
 * ------------------------------------------------------------------ */

/** Cidade sem acento e sem caixa: "São José" e "sao jose" são a mesma. */
export function normalizarCidade(c: string): string {
  return c
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/** A chave da fila: cada alcance, em cada lugar, tem a sua. */
export function segmentoDe(alcance: Alcance, uf?: string | null, cidade?: string | null): string {
  if (alcance === "nacional") return "nacional";
  if (!uf || !/^[A-Z]{2}$/.test(uf)) throw erro("Escolha o estado do anúncio.");
  if (alcance === "estado") return `estado:${uf}`;
  const c = normalizarCidade(cidade ?? "");
  if (c.length < 2) throw erro("Escolha a cidade do anúncio.");
  return `cidade:${uf}:${c}`;
}

/** As filas que valem para quem olha, na ordem da vitrine: cidade, estado, Brasil. */
export function segmentosDeQuemOlha(uf?: string | null, cidade?: string | null): { alcance: Alcance; segmento: string }[] {
  const lista: { alcance: Alcance; segmento: string }[] = [];
  if (uf && /^[A-Z]{2}$/.test(uf)) {
    if (cidade && normalizarCidade(cidade).length >= 2) lista.push({ alcance: "cidade", segmento: `cidade:${uf}:${normalizarCidade(cidade)}` });
    lista.push({ alcance: "estado", segmento: `estado:${uf}` });
  }
  lista.push({ alcance: "nacional", segmento: "nacional" });
  return lista;
}

/* ------------------------------------------------------------------ *
 * A fila
 * ------------------------------------------------------------------ */

/**
 * Quando cada anúncio da fila entra. Supõe que as vagas recebem cliques no
 * mesmo ritmo: a vaga que acabar primeiro recebe o próximo. Devolve, para
 * cada um da fila, quantos cliques o segmento ainda precisa dar antes de ele
 * entrar (0 = entra no próximo clique).
 */
export function previsaoDaFila(restantesNoAr: number[], restantesNaFila: number[], vagas: number): number[] {
  if (vagas <= 0) return restantesNaFila.map(() => Infinity);
  // Fim de cada vaga, em cliques por vaga. Vaga vazia termina já.
  const fins = [...restantesNoAr.map((r) => Math.max(0, r))];
  while (fins.length < vagas) fins.push(0);
  const saida: number[] = [];
  for (const r of restantesNaFila) {
    fins.sort((a, b) => a - b);
    const entra = fins[0];
    saida.push(Math.ceil(entra * vagas));
    fins[0] = entra + Math.max(0, r);
  }
  return saida;
}

/* ------------------------------------------------------------------ *
 * Números que o patrocinador lê
 * ------------------------------------------------------------------ */

/** Robô: buscadores, pré-visualizadores de link, automação. */
const ROBO =
  /bot|crawl|spider|slurp|facebookexternalhit|whatsapp|telegram|preview|headless|lighthouse|curl|wget|python-requests|axios|node-fetch|go-http|java\//i;

export function ehRobo(userAgent: string | null | undefined): boolean {
  return !userAgent || userAgent.length < 10 || ROBO.test(userAgent);
}

/** Motivo pelo qual a recarga não sai, ou `null`. */
export function problemaNaRecarga(valorCents: number, minimaCents: number): string | null {
  if (!Number.isInteger(valorCents)) return "Informe o valor em reais.";
  if (valorCents < minimaCents) return `A recarga mínima é de ${(minimaCents / 100).toFixed(2).replace(".", ",")} reais.`;
  if (valorCents > RECARGA_MAXIMA_CENTS) return "A recarga máxima é de 10.000,00 reais.";
  return null;
}

export interface Totais {
  exibicoes: number;
  cliques: number;
  gastoCents: number;
  pedidos: number;
  vendas: number;
  receitaCents: number;
}

/**
 * Os indicadores de retorno. Divisão por zero vira `null` (a tela mostra
 * "—"); dinheiro arredonda para baixo; taxas saem em décimos de por cento.
 */
export function indicadores(t: Totais) {
  const taxa = (a: number, b: number) => (b > 0 ? Math.round((1000 * a) / b) / 10 : null);
  return {
    ...t,
    taxaDeCliquePct: taxa(t.cliques, t.exibicoes),
    conversaoPct: taxa(t.vendas, t.cliques),
    custoPorCliqueCents: t.cliques > 0 ? Math.floor(t.gastoCents / t.cliques) : null,
    custoPorVendaCents: t.vendas > 0 ? Math.floor(t.gastoCents / t.vendas) : null,
    /** Receita por real gasto (2,5 = cada R$ 1 trouxe R$ 2,50). */
    retorno: t.gastoCents > 0 ? Math.round((100 * t.receitaCents) / t.gastoCents) / 100 : null,
  };
}
