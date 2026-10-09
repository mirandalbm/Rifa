/**
 * Gestão de tráfego pago — regras puras, lidas pelo servidor (que cobra) e
 * pelas telas (que mostram preço, reserva e situação). O plano está em
 * `docs/PLANO-TRAFEGO-PAGO.md` (modelo A).
 *
 * A plataforma anuncia a rifa de uma organização no Google, no Meta e no
 * TikTok **pelas contas de anúncios da própria plataforma**. A organização
 * pede a campanha com o saldo de publicidade (o mesmo do patrocínio e do
 * banner pago): o pedido **reserva** o investimento em mídia mais a taxa de
 * gestão, de uma vez. A plataforma aprova, monta a campanha fora do sistema e
 * lança o gasto de cada dia; cada lançamento consome a reserva (mídia + taxa)
 * e **nunca passa dela**. Quando a campanha acaba — verba gasta, encerrada por
 * uma das partes ou rifa fora do ar —, o que sobrou da reserva volta ao saldo.
 *
 * Nasce desligado. A taxa e os mínimos são do administrador da plataforma
 * (painel), fotografados no pedido: mudar a tabela não mexe em campanha
 * contratada.
 */
import { temLinkOuTelefone } from "./comentarios";
import { ufValida, type UF } from "./endereco";
import { formatBRL } from "./format";

export const REDES_DE_ANUNCIO = {
  google: "Google",
  meta: "Instagram e Facebook",
  tiktok: "TikTok",
} as const;
export type RedeDeAnuncio = keyof typeof REDES_DE_ANUNCIO;
export const LISTA_DE_REDES = Object.keys(REDES_DE_ANUNCIO) as RedeDeAnuncio[];

export const SITUACOES_DA_CAMPANHA = {
  em_analise: "Em análise",
  ativa: "No ar",
  encerrando: "Fechando a conta",
  encerrada: "Encerrada",
  recusada: "Recusada",
  cancelada: "Cancelada",
} as const;
export type SituacaoDaCampanha = keyof typeof SITUACOES_DA_CAMPANHA;

/**
 * Campanha que ainda ocupa a rifa e a reserva: uma por rifa (o índice parcial
 * decide). "Fechando a conta" é a que parou e ainda espera os últimos gastos
 * da rede: a reserva segue presa até a plataforma fechar a conta.
 */
export const SITUACOES_EM_ABERTO: SituacaoDaCampanha[] = ["em_analise", "ativa", "encerrando"];

export interface ConfigTrafegoPago {
  /** Sem isto o produto não existe para a organização. */
  ligado: boolean;
  /** Taxa de gestão sobre o gasto em mídia (por cento, inteiro). */
  taxaPct: number;
  /** Investimento mínimo em mídia por campanha. */
  investimentoMinCents: number;
  /** O mínimo por dia (a rede não entrega nada abaixo de um piso). */
  verbaDiaMinCents: number;
  /** As redes que a plataforma oferece (as que aceitam rifa e têm conta pronta). */
  redes: RedeDeAnuncio[];
}

export const CONFIG_TRAFEGO_PADRAO: ConfigTrafegoPago = {
  ligado: false,
  taxaPct: 20,
  investimentoMinCents: 30_000,
  verbaDiaMinCents: 2_000,
  redes: [],
};

/** Teto de uma campanha (R$ 100 mil): erro de digitação não vira reserva gigante. */
export const INVESTIMENTO_MAX_CENTS = 10_000_000;
export const TAXA_MAX_PCT = 100;
export const OBSERVACAO_MAX = 500;

const erro = (m: string, status = 400) => Object.assign(new Error(m), { status });

function inteiro(v: unknown, min: number, max: number, nome: string): number {
  const n = Number(v);
  if (!Number.isInteger(n) || n < min || n > max) throw erro(`${nome}: de ${min} a ${max}.`);
  return n;
}

function redesValidas(v: unknown): RedeDeAnuncio[] {
  if (!Array.isArray(v)) return [];
  const out: RedeDeAnuncio[] = [];
  for (const r of v) {
    if (typeof r === "string" && Object.hasOwn(REDES_DE_ANUNCIO, r) && !out.includes(r as RedeDeAnuncio)) {
      out.push(r as RedeDeAnuncio);
    }
  }
  return out;
}

/** Só as chaves conhecidas: isto vem do corpo da requisição. */
export function validarConfigTrafego(bruto: unknown): ConfigTrafegoPago {
  if (bruto === undefined || bruto === null) return CONFIG_TRAFEGO_PADRAO;
  const b = bruto as Record<string, unknown>;
  const p = CONFIG_TRAFEGO_PADRAO;
  const redes = redesValidas(b.redes ?? p.redes);
  const ligado = b.ligado === true;
  if (ligado && redes.length === 0) throw erro("Para ligar, escolha pelo menos uma rede de anúncio.");
  const investimentoMinCents = inteiro(b.investimentoMinCents ?? p.investimentoMinCents, 100, INVESTIMENTO_MAX_CENTS, "Investimento mínimo (centavos)");
  const verbaDiaMinCents = inteiro(b.verbaDiaMinCents ?? p.verbaDiaMinCents, 100, INVESTIMENTO_MAX_CENTS, "Mínimo por dia (centavos)");
  if (verbaDiaMinCents > investimentoMinCents) throw erro("O mínimo por dia não pode passar do investimento mínimo.");
  return {
    ligado,
    taxaPct: inteiro(b.taxaPct ?? p.taxaPct, 0, TAXA_MAX_PCT, "Taxa de gestão (%)"),
    investimentoMinCents,
    verbaDiaMinCents,
    redes,
  };
}

/** A taxa de um gasto, para baixo no centavo: nunca cobra mais do que o percentual. */
export function taxaSobre(gastoCents: number, taxaPct: number): number {
  return Math.floor((gastoCents * taxaPct) / 100);
}

/**
 * Quanto o pedido reserva no saldo: a verba de mídia e a taxa sobre ela.
 * Cada lançamento cobra a taxa do próprio gasto, para baixo, e a soma dos
 * pisos nunca passa do piso da soma: o que se debita nunca passa da reserva.
 */
export function reservaDoPedido(investimentoCents: number, taxaPct: number): number {
  return investimentoCents + taxaSobre(investimentoCents, taxaPct);
}

export interface PedidoDeTrafego {
  redes: RedeDeAnuncio[];
  investimentoCents: number;
  verbaDiaCents: number;
  uf: UF | null;
  cidade: string | null;
  observacao: string | null;
}

/**
 * Confere o pedido contra a tabela da plataforma. A região é opcional (sem
 * ela, o Brasil todo); cidade só com o estado. A observação vai para quem
 * monta a campanha, na régua do comentário: sem link e sem telefone.
 */
export function validarPedidoDeTrafego(cfg: ConfigTrafegoPago, bruto: unknown): PedidoDeTrafego {
  const b = (bruto ?? {}) as Record<string, unknown>;
  const redes = redesValidas(b.redes);
  if (redes.length === 0) throw erro("Escolha pelo menos uma rede.");
  const fora = redes.find((r) => !cfg.redes.includes(r));
  if (fora) throw erro(`${REDES_DE_ANUNCIO[fora]} não está disponível agora.`);
  const investimentoCents = Number(b.investimentoCents);
  if (!Number.isInteger(investimentoCents) || investimentoCents < cfg.investimentoMinCents || investimentoCents > INVESTIMENTO_MAX_CENTS) {
    throw erro(`Invista de ${formatBRL(cfg.investimentoMinCents)} a ${formatBRL(INVESTIMENTO_MAX_CENTS)}.`);
  }
  const verbaDiaCents = Number(b.verbaDiaCents);
  if (!Number.isInteger(verbaDiaCents) || verbaDiaCents < cfg.verbaDiaMinCents || verbaDiaCents > investimentoCents) {
    throw erro(`O valor por dia vai de ${formatBRL(cfg.verbaDiaMinCents)} até o investimento total.`);
  }
  let uf: UF | null = null;
  if (b.uf !== undefined && b.uf !== null && b.uf !== "") {
    if (!ufValida(b.uf)) throw erro("Estado desconhecido.");
    uf = b.uf;
  }
  let cidade: string | null = null;
  if (typeof b.cidade === "string" && b.cidade.trim()) {
    if (!uf) throw erro("Para anunciar numa cidade, escolha o estado também.");
    cidade = b.cidade.replace(/\s+/g, " ").trim();
    if (!/^[\p{L}][\p{L} '.-]{1,59}$/u.test(cidade)) throw erro("Nome da cidade inválido.");
  }
  let observacao: string | null = null;
  if (typeof b.observacao === "string" && b.observacao.trim()) {
    observacao = b.observacao.replace(/[ \t]+/g, " ").trim();
    if (observacao.length > OBSERVACAO_MAX) throw erro(`A observação passa de ${OBSERVACAO_MAX} caracteres.`);
    const p = temLinkOuTelefone(observacao);
    if (p) throw erro(`Observação ${p.charAt(0).toLowerCase()}${p.slice(1)}`);
  }
  return { redes, investimentoCents, verbaDiaCents, uf, cidade, observacao };
}

export interface GastoDoDia {
  dia: string;
  rede: RedeDeAnuncio;
  gastoCents: number;
  /** Os cliques do dia no painel da rede (opcional no lançamento à mão). */
  cliques: number | null;
}

/**
 * O gasto de um dia numa rede, lançado pela plataforma a partir do painel da
 * rede. O dia é o de São Paulo, nunca no futuro e nunca antes da aprovação;
 * a rede tem de ser uma das que a campanha pediu. O teto (o que sobra da
 * verba) é conferido de novo no `UPDATE` condicional.
 */
export function validarGasto(
  bruto: unknown,
  c: { redes: string[]; investimentoCents: number; gastoCents: number; diaDaAprovacao: string | null },
  hoje: string,
): GastoDoDia {
  const b = (bruto ?? {}) as Record<string, unknown>;
  const dia = typeof b.dia === "string" ? b.dia : "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dia) || Number.isNaN(Date.parse(`${dia}T12:00:00Z`))) throw erro("Data inválida.");
  if (dia > hoje) throw erro("Não dá para lançar gasto de um dia que ainda não chegou.");
  if (c.diaDaAprovacao && dia < c.diaDaAprovacao) throw erro("Esse dia é anterior à aprovação da campanha.");
  if (typeof b.rede !== "string" || !Object.hasOwn(REDES_DE_ANUNCIO, b.rede) || !c.redes.includes(b.rede)) {
    throw erro("Essa rede não faz parte da campanha.");
  }
  const gastoCents = Number(b.gastoCents);
  if (!Number.isInteger(gastoCents) || gastoCents < 1) throw erro("Informe o gasto do dia em reais.");
  const resta = c.investimentoCents - c.gastoCents;
  if (gastoCents > resta) throw erro(`O gasto passa do que resta da verba (${formatBRL(resta)}).`, 409);
  let cliques: number | null = null;
  if (b.cliques !== undefined && b.cliques !== null && b.cliques !== "") {
    cliques = Number(b.cliques);
    if (!Number.isInteger(cliques) || cliques < 0 || cliques > CLIQUES_MAX_DIA) throw erro("Cliques inválidos.");
  }
  return { dia, rede: b.rede as RedeDeAnuncio, gastoCents, cliques };
}

/** O que volta ao saldo no fim: a reserva menos o que foi debitado. */
export function sobraDaCampanha(c: { reservaCents: number; gastoCents: number; taxaCents: number }): number {
  return Math.max(0, c.reservaCents - c.gastoCents - c.taxaCents);
}

/**
 * O código curto da campanha, que vai na UTM do link do anúncio: a venda que
 * chega por ele é atribuída à campanha. É estatística (último clique da aba,
 * aparelho trocado e link copiado escapam), nunca decide dinheiro.
 */
export function codigoDaCampanha(id: string): string {
  return id.replace(/-/g, "").slice(0, 8).toLowerCase();
}

export const utmCampanhaDe = (id: string) => `trafego-${codigoDaCampanha(id)}`;

/** O endereço que vai no anúncio de cada rede (página da rifa com a UTM da campanha). */
export function linkDoAnuncio(base: string, c: { id: string; orgSlug: string; rifaSlug: string }, rede: RedeDeAnuncio): string {
  const q = new URLSearchParams({ utm_source: rede, utm_medium: "cpc", utm_campaign: utmCampanhaDe(c.id) });
  return `${base.replace(/\/$/, "")}/o/${c.orgSlug}/r/${c.rifaSlug}?${q.toString()}`;
}

/** Custo por venda atribuída (mídia + taxa), para baixo; sem venda, nulo. */
export function custoPorVenda(totalCents: number, vendas: number): number | null {
  return vendas > 0 ? Math.floor(totalCents / vendas) : null;
}

export function problemaNaRecusa(motivo: unknown): string | null {
  if (typeof motivo !== "string" || motivo.trim().length < 10) {
    return "Explique o motivo da recusa (pelo menos 10 letras): a organização lê isto.";
  }
  return null;
}

/* ------------------------------------------------------------------ *
 * Fase 2: o gasto importado das redes
 * ------------------------------------------------------------------ */

/**
 * O gasto vem pronto das redes (pelo Windsor.ai, uma chave para as três) em
 * vez de ser digitado. A campanha da rede é casada com a nossa pelo código
 * da UTM (`trafego-<código>`) **no nome da campanha** na rede — é assim que a
 * plataforma deve nomear a campanha ao montá-la. Linha sem código, de rede
 * que não conhecemos ou com número estranho fica de fora (e conta como
 * ignorada, com o motivo). Só dias **já fechados** entram: o de hoje ainda
 * muda na rede.
 */
export const FONTES_DO_GASTO: Record<string, RedeDeAnuncio> = {
  google_ads: "google",
  google: "google",
  facebook: "meta",
  facebook_ads: "meta",
  meta: "meta",
  instagram: "meta",
  tiktok: "tiktok",
  tiktok_ads: "tiktok",
};

/** Quantos dias fechados para trás a importação olha (a rede ainda acerta o gasto de ontem). */
export const DIAS_DA_IMPORTACAO = 3;

/** O teto de cliques de um dia numa rede (número maior é dado estragado). */
export const CLIQUES_MAX_DIA = 10_000_000;

export type MotivoIgnorado = "sem_codigo" | "rede" | "data" | "valor";
export const MOTIVOS_IGNORADOS: Record<MotivoIgnorado, string> = {
  sem_codigo: "Campanha da rede sem o código trafego-… no nome",
  rede: "Rede que o sistema não conhece",
  data: "Data inválida ou fora da janela",
  valor: "Gasto ou cliques inválidos",
};

export interface GastoImportado {
  codigo: string;
  dia: string;
  rede: RedeDeAnuncio;
  gastoCents: number;
  cliques: number;
}

/** O código da nossa campanha dentro do nome da campanha na rede (`… trafego-ab12cd34 …`). */
export function codigoNoNome(nome: unknown): string | null {
  if (typeof nome !== "string") return null;
  const m = /(?:^|[^a-z0-9])trafego-([0-9a-f]{8})(?![0-9a-f])/i.exec(nome);
  return m ? m[1].toLowerCase() : null;
}

/** Reais da rede ("12.34", 12.34) em centavos inteiros; nada de negativo, NaN ou absurdo. */
export function centavosDoGasto(valor: unknown): number | null {
  const n = typeof valor === "string" && valor.trim() !== "" ? Number(valor) : typeof valor === "number" ? valor : NaN;
  if (!Number.isFinite(n) || n < 0) return null;
  const c = Math.round(n * 100);
  return c <= INVESTIMENTO_MAX_CENTS ? c : null;
}

/** Os dias fechados que a importação olha: de `DIAS_DA_IMPORTACAO` atrás até ontem (fuso de quem chama). */
export function janelaDaImportacao(hoje: string): { desde: string; ate: string } {
  const base = Date.parse(`${hoje}T12:00:00Z`);
  const dia = (n: number) => new Date(base - n * 86_400_000).toISOString().slice(0, 10);
  return { desde: dia(DIAS_DA_IMPORTACAO), ate: dia(1) };
}

/**
 * As linhas que a fonte devolveu, já conferidas e somadas por campanha, dia
 * e rede (a mesma campanha pode ter vários conjuntos de anúncios). A entrada
 * vem de fora: é dado, nunca instrução — só as chaves conhecidas são lidas.
 */
export function lerLinhasDoGasto(
  linhas: unknown,
  janela: { desde: string; ate: string },
): { gastos: GastoImportado[]; ignoradas: Partial<Record<MotivoIgnorado, number>> } {
  const ignoradas: Partial<Record<MotivoIgnorado, number>> = {};
  const contar = (m: MotivoIgnorado) => (ignoradas[m] = (ignoradas[m] ?? 0) + 1);
  const somados = new Map<string, GastoImportado>();
  for (const bruta of Array.isArray(linhas) ? linhas : []) {
    if (!bruta || typeof bruta !== "object") continue;
    const l = bruta as Record<string, unknown>;
    const codigo = codigoNoNome(l.campaign);
    if (!codigo) {
      contar("sem_codigo");
      continue;
    }
    const fonte = typeof l.datasource === "string" ? l.datasource : typeof l.source === "string" ? l.source : "";
    const rede = Object.hasOwn(FONTES_DO_GASTO, fonte.toLowerCase()) ? FONTES_DO_GASTO[fonte.toLowerCase()] : null;
    if (!rede) {
      contar("rede");
      continue;
    }
    const dia = typeof l.date === "string" ? l.date.slice(0, 10) : "";
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dia) || Number.isNaN(Date.parse(`${dia}T12:00:00Z`)) || dia < janela.desde || dia > janela.ate) {
      contar("data");
      continue;
    }
    const gastoCents = centavosDoGasto(l.spend);
    const cliques = l.clicks === undefined || l.clicks === null || l.clicks === "" ? 0 : Number(l.clicks);
    if (gastoCents === null || !Number.isInteger(cliques) || cliques < 0 || cliques > CLIQUES_MAX_DIA) {
      contar("valor");
      continue;
    }
    const chave = `${codigo}|${dia}|${rede}`;
    const atual = somados.get(chave);
    if (atual) {
      atual.gastoCents += gastoCents;
      atual.cliques += cliques;
    } else {
      somados.set(chave, { codigo, dia, rede, gastoCents, cliques });
    }
  }
  // Dia sem gasto não vira lançamento (o lançamento é cobrança).
  return { gastos: [...somados.values()].filter((g) => g.gastoCents > 0), ignoradas };
}
