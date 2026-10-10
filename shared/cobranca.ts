/**
 * Como a plataforma cobra da organização — por sorteio.
 *
 * Cada rifa escolhe **um** modo, no rascunho, e ele trava ao publicar
 * (invariante 7: quem comprou comprou aquela rifa):
 *
 * - **percentual**: um percentual sobre cada venda paga;
 * - **por_cota**: um valor fixo por cota vendida.
 *
 * Além do modo, toda venda paga por **Pix online** leva a **taxa de
 * transação Pix**: um percentual em faixas por volume (quanto mais
 * transações a organização faz no mês, menor a taxa). Ela é custo de
 * transação, separada do contrato: aparece em linha própria no extrato e
 * é descontada da organização, nunca do comprador — o preço que o comprador
 * vê é o preço que ele paga.
 *
 * Os valores (o percentual, o valor por cota e as faixas do Pix) são da
 * plataforma, no painel do admin master. Eles são **fotografados na
 * publicação da rifa** (`CobrancaDaRifa`): mudar a tabela depois não muda o
 * preço de uma rifa que já está no ar. E cada pedido fotografa a taxa que
 * pagou, para o rateio e o estorno lerem o mesmo número.
 *
 * Não existe mensalidade: a plataforma cobra só quando a organização vende.
 * Tudo em centavos inteiros; percentuais com até duas casas.
 */

import { priceOrder, type PricingPackage } from "./pricing";

export const MODOS_DE_COBRANCA = ["percentual", "por_cota"] as const;
export type ModoDeCobranca = (typeof MODOS_DE_COBRANCA)[number];

export const NOME_DO_MODO: Record<ModoDeCobranca, string> = {
  percentual: "Percentual sobre cada venda",
  por_cota: "Valor fixo por cota vendida",
};

/** O modo que a rifa nova traz, até a organização escolher. */
export const MODO_PADRAO: ModoDeCobranca = "percentual";

/** Teto do percentual sobre a venda. Acima disso não é taxa, é sociedade. */
export const PERCENTUAL_MAX = 30;
/** Teto do valor por cota: R$ 100. Serve para pegar dedo errado no zero. */
export const POR_COTA_MAX_CENTS = 10_000;
/** Teto da taxa Pix de uma faixa. */
export const PIX_PCT_MAX = 10;
/** Quantas faixas a tabela do Pix aceita. */
export const FAIXAS_PIX_MAX = 10;

/**
 * Uma faixa da taxa Pix: vale para a transação de número até `ate` no mês
 * (inclusive). A última faixa não tem teto (`ate: null`).
 */
export interface FaixaPix {
  ate: number | null;
  pct: number;
}

/** A tabela da plataforma, editada pelo admin master. */
export interface ConfigCobranca {
  percentualPct: number;
  porCotaCents: number;
  faixasPix: FaixaPix[];
}

/**
 * O padrão é **não cobrar**: sem o admin definir os valores, a rifa sai sem
 * taxa. Quem cobra é quem escolheu cobrar.
 */
export const CONFIG_COBRANCA_PADRAO: ConfigCobranca = {
  percentualPct: 0,
  porCotaCents: 0,
  faixasPix: [{ ate: null, pct: 0 }],
};

/** O que fica gravado na rifa ao publicar: o modo e os valores do dia. */
export interface CobrancaDaRifa {
  modo: ModoDeCobranca;
  percentualPct: number;
  porCotaCents: number;
  faixasPix: FaixaPix[];
}

/** O que cada pedido fotografa ao nascer. */
export interface TaxaDoPedido {
  modo: ModoDeCobranca;
  /** Percentual sobre a venda, em centésimos de ponto (150 = 1,50%). Zero no modo por cota. */
  vendaBp: number;
  /** Valor por cota, em centavos. Zero no modo percentual. */
  porCotaCents: number;
  /** Taxa Pix da faixa do pedido, em centésimos de ponto. Zero fora do Pix online. */
  pixBp: number;
}

export const TAXA_ZERO: TaxaDoPedido = { modo: "percentual", vendaBp: 0, porCotaCents: 0, pixBp: 0 };

function erro(msg: string): Error {
  return Object.assign(new Error(msg), { status: 400 });
}

/** Percentual com até duas casas, de 0 ao teto. */
function pctValido(v: unknown, teto: number, nome: string): number {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n) || n < 0 || n > teto) throw erro(`${nome} vai de 0 a ${teto}%.`);
  const arredondado = Math.round(n * 100) / 100;
  if (Math.abs(arredondado - n) > 1e-9) throw erro(`${nome} aceita no máximo duas casas decimais.`);
  return arredondado;
}

export function validarModo(v: unknown): ModoDeCobranca {
  if (typeof v !== "string" || !(MODOS_DE_COBRANCA as readonly string[]).includes(v)) {
    throw erro("Escolha como a plataforma cobra: percentual sobre a venda ou valor fixo por cota.");
  }
  return v as ModoDeCobranca;
}

/**
 * A tabela do Pix: de 1 a `FAIXAS_PIX_MAX` faixas, os tetos subindo, a taxa
 * nunca subindo (quanto mais transação, menor a cobrança) e a última sem
 * teto. Só as chaves conhecidas entram.
 */
export function validarFaixasPix(v: unknown): FaixaPix[] {
  if (!Array.isArray(v) || v.length === 0 || v.length > FAIXAS_PIX_MAX) {
    throw erro(`A taxa Pix tem de 1 a ${FAIXAS_PIX_MAX} faixas.`);
  }
  const faixas: FaixaPix[] = v.map((f, i) => {
    if (!f || typeof f !== "object") throw erro("Faixa da taxa Pix em formato inválido.");
    const { ate, pct } = f as Record<string, unknown>;
    const ultima = i === v.length - 1;
    if (ultima) {
      if (ate !== null && ate !== undefined) throw erro("A última faixa da taxa Pix não tem teto.");
    } else if (typeof ate !== "number" || !Number.isInteger(ate) || ate < 1) {
      throw erro("O teto de cada faixa da taxa Pix é um número inteiro de transações.");
    }
    return { ate: ultima ? null : (ate as number), pct: pctValido(pct, PIX_PCT_MAX, "A taxa Pix") };
  });
  for (let i = 1; i < faixas.length; i++) {
    const antes = faixas[i - 1];
    const agora = faixas[i];
    if (agora.ate !== null && agora.ate <= (antes.ate as number)) {
      throw erro("Os tetos das faixas da taxa Pix precisam subir.");
    }
    if (agora.pct > antes.pct) {
      throw erro("A taxa Pix não pode subir com o volume: quanto mais transação, menor a cobrança.");
    }
  }
  return faixas;
}

/** O que vem do painel do admin master. Campo ausente fica no padrão. */
export function validarConfigCobranca(v: unknown): ConfigCobranca {
  if (v === undefined || v === null) return CONFIG_COBRANCA_PADRAO;
  if (typeof v !== "object" || Array.isArray(v)) throw erro("Tabela de cobrança em formato inválido.");
  const e = v as Record<string, unknown>;
  const porCota = e.porCotaCents === undefined ? 0 : Number(e.porCotaCents);
  if (!Number.isInteger(porCota) || porCota < 0 || porCota > POR_COTA_MAX_CENTS) {
    throw erro(`O valor por cota vai de R$ 0,00 a R$ ${(POR_COTA_MAX_CENTS / 100).toFixed(2).replace(".", ",")}.`);
  }
  return {
    percentualPct: e.percentualPct === undefined ? 0 : pctValido(e.percentualPct, PERCENTUAL_MAX, "O percentual sobre a venda"),
    porCotaCents: porCota,
    faixasPix: e.faixasPix === undefined ? CONFIG_COBRANCA_PADRAO.faixasPix : validarFaixasPix(e.faixasPix),
  };
}

/** O guardado no banco que não passe mais na régua volta ao padrão, sem derrubar o resto. */
export function configCobrancaGuardada(v: unknown): ConfigCobranca {
  try {
    return validarConfigCobranca(v);
  } catch {
    return CONFIG_COBRANCA_PADRAO;
  }
}

/** A fotografia da publicação: o modo da rifa com a tabela de hoje. */
export function cobrancaNaPublicacao(modo: ModoDeCobranca, cfg: ConfigCobranca): CobrancaDaRifa {
  return { modo, percentualPct: cfg.percentualPct, porCotaCents: cfg.porCotaCents, faixasPix: cfg.faixasPix };
}

/**
 * O que barra a publicação: no modo por cota, a taxa precisa ficar abaixo
 * do preço da cota — senão cada venda daria prejuízo à organização.
 */
export function problemaNaCobranca(
  modo: ModoDeCobranca,
  cfg: Pick<ConfigCobranca, "porCotaCents">,
  precoDaCotaCents: number,
  pacotes: PricingPackage[] = [],
): string | null {
  if (modo !== "por_cota") return null;
  if (cfg.porCotaCents >= precoDaCotaCents) {
    return "A taxa por cota da plataforma não pode ser igual ou maior que o preço da cota. Escolha a cobrança em percentual ou aumente o preço.";
  }
  // O pacote com desconto baixa o preço de cada cota: a taxa por cota tem de
  // continuar abaixo dele, senão a organização venderia o pacote de graça.
  for (const p of pacotes) {
    if (!Number.isInteger(p.quantity) || p.quantity < 1) continue;
    const total = priceOrder({ quantity: p.quantity, unitCents: precoDaCotaCents, packages: [p] }).totalCents;
    if (cfg.porCotaCents * p.quantity >= total) {
      return `O pacote de ${p.quantity} cotas com ${p.discountPct}% de desconto deixa cada cota abaixo da taxa por cota da plataforma. Diminua o desconto ou escolha a cobrança em percentual.`;
    }
  }
  return null;
}

/**
 * A última guarda, no pedido: no modo por cota, a taxa da venda (cotas ×
 * valor) não pode chegar ao total pago depois de pacote e cupom. Pacote é
 * conferido ao salvar, mas o cupom do afiliado desconta por cima.
 */
export function problemaNoTotalDoPedido(t: TaxaDoPedido, totalCents: number, quantidade: number): string | null {
  if (t.modo === "por_cota" && t.porCotaCents * quantidade >= totalCents) {
    return "Este cupom reduz o valor abaixo da taxa mínima da plataforma por cota. Remova o cupom ou escolha outro pacote.";
  }
  return null;
}

/** Percentual (até duas casas) em centésimos de ponto: 1,5 → 150. */
export function paraBp(pct: number): number {
  return Math.round(pct * 100);
}

/**
 * A faixa da taxa Pix para a próxima transação: com `jaFeitas` transações
 * pagas no mês, esta é a de número `jaFeitas + 1`.
 */
export function faixaPixPara(jaFeitas: number, faixas: FaixaPix[]): FaixaPix {
  const proxima = Math.max(0, Math.floor(jaFeitas)) + 1;
  return faixas.find((f) => f.ate === null || proxima <= f.ate) ?? faixas[faixas.length - 1];
}

/**
 * A taxa que o pedido fotografa. A taxa Pix só vale para o Pix online
 * (a cobrança que passa pelo provedor da plataforma); dinheiro e Pix na
 * maquininha do cambista não a pagam.
 */
export function taxaDoPedido(p: {
  cobranca: CobrancaDaRifa | null;
  pixOnline: boolean;
  transacoesPixNoMes: number;
}): TaxaDoPedido {
  if (!p.cobranca) return TAXA_ZERO;
  const c = p.cobranca;
  return {
    modo: c.modo,
    vendaBp: c.modo === "percentual" ? paraBp(c.percentualPct) : 0,
    porCotaCents: c.modo === "por_cota" ? c.porCotaCents : 0,
    pixBp: p.pixOnline ? paraBp(faixaPixPara(p.transacoesPixNoMes, c.faixasPix).pct) : 0,
  };
}

/**
 * As duas taxas de um pedido, em centavos, pela fotografia dele.
 *
 * - **Taxa de venda**: o percentual sobre o total (no presente, a soma do
 *   que o comprador e a plataforma pagaram) ou o valor por cota × cotas.
 * - **Taxa Pix**: o percentual da faixa sobre o que entrou por Pix.
 *
 * As duas arredondam **para baixo** e, juntas, nunca passam do total — o
 * centavo que sobra fica com a organização (invariante 12).
 */
export function taxasEmCentavos(
  t: TaxaDoPedido,
  p: { totalCents: number; pixCents: number; quantidade: number },
): { vendaCents: number; pixCents: number } {
  const venda =
    t.modo === "por_cota"
      ? t.porCotaCents * Math.max(0, p.quantidade)
      : Math.floor((p.totalCents * t.vendaBp) / 10_000);
  const vendaCents = Math.min(p.totalCents, venda);
  const pix = Math.floor((Math.max(0, p.pixCents) * t.pixBp) / 10_000);
  const pixCents = Math.min(p.totalCents - vendaCents, pix);
  return { vendaCents, pixCents };
}

/**
 * O percentual equivalente da taxa sobre o valor do Pix, para o split do
 * provedor (que divide em percentual): quanto do Pix fica com a plataforma.
 * Para cima, em 4 casas: o split nunca manda à organização a parte da taxa.
 */
export function pctEquivalente(taxaCents: number, pixCents: number): number {
  if (pixCents <= 0 || taxaCents <= 0) return 0;
  const pct = Math.min(100, (taxaCents * 100) / pixCents);
  return Math.ceil(pct * 10_000 - 1e-9) / 10_000;
}

/** Texto da tela: "1,5%". */
export function textoPct(pct: number): string {
  return `${pct.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%`;
}

/** Texto da tela de uma faixa: "até 100 transações no mês: 2%" / "acima de 1.000: 1%". */
export function textoDaFaixa(faixas: FaixaPix[], i: number): string {
  const f = faixas[i];
  const anterior = i > 0 ? faixas[i - 1].ate : null;
  const pct = textoPct(f.pct);
  if (f.ate === null) {
    return anterior === null ? `qualquer volume: ${pct}` : `acima de ${anterior.toLocaleString("pt-BR")} transações no mês: ${pct}`;
  }
  return `até ${f.ate.toLocaleString("pt-BR")} transações no mês: ${pct}`;
}

/**
 * O mês civil em São Paulo (`aaaa-mm`): é a janela do volume que escolhe a
 * faixa do Pix. O servidor roda em UTC; virar o mês às 21h de Brasília
 * mudaria a faixa de quem compra à noite do último dia.
 */
export function mesEmSaoPaulo(d: Date): string {
  const partes = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
  }).formatToParts(d);
  const ano = partes.find((x) => x.type === "year")?.value;
  const mes = partes.find((x) => x.type === "month")?.value;
  return `${ano}-${mes}`;
}

/* ------------------------------------------------------------------ *
 * Estorno
 * ------------------------------------------------------------------ */

/**
 * Por que o pedido foi estornado, para decidir a taxa da plataforma
 * (cláusula X.10 do contrato da promotora, decisão de 10/10/2026). Vem do
 * chamado (`tipoReembolso`, e a marca de falha que só a plataforma põe); sem
 * chamado, é a devolução avisada pelo provedor (MED, contestação).
 */
export type MotivoDoEstorno = "arrependimento" | "adiamento" | "com_taxa" | "provedor" | "falha_plataforma";

/**
 * A taxa de transação Pix fica com a plataforma no estorno? A taxa da venda
 * é sempre cancelada; a do Pix remunera a transação que já aconteceu e só é
 * cancelada no arrependimento do comprador (art. 49 do CDC) e na falha da
 * plataforma. Fica no reembolso com taxa, no adiamento (pedido da promotora)
 * e na devolução do provedor. O comprador recebe o que recebia antes em
 * todos os casos: isto é só a conta entre a plataforma e a promotora.
 */
export function taxaPixFicaNoEstorno(motivo: MotivoDoEstorno): boolean {
  return motivo === "com_taxa" || motivo === "adiamento" || motivo === "provedor";
}

/** O motivo pelo chamado estornado do pedido (ou nenhum: o provedor). */
export function motivoDoEstorno(chamado: { tipoReembolso: string | null; falhaPlataforma: boolean } | null): MotivoDoEstorno {
  if (!chamado) return "provedor";
  if (chamado.falhaPlataforma) return "falha_plataforma";
  // Chamado de antes da regra do reembolso não tem tipo: devolução integral, como o arrependimento.
  if (chamado.tipoReembolso === "adiamento" || chamado.tipoReembolso === "com_taxa") return chamado.tipoReembolso;
  return "arrependimento";
}

/* ------------------------------------------------------------------ *
 * Mudança da tabela (cláusula X.3, parágrafo único)
 * ------------------------------------------------------------------ */

/** Aviso prévio para aumentar qualquer valor da tabela. */
export const AVISO_DA_TABELA_DIAS = 30;
/** Até quando dá para agendar (pega dedo errado no ano). */
export const AGENDA_DA_TABELA_MAX_DIAS = 365;

/** A tabela nova, com a data em que passa a valer (`aaaa-mm-dd`, horário de Brasília). */
export interface TabelaAgendada {
  vigenteEm: string;
  tabela: ConfigCobranca;
}

/** O começo do dia `aaaa-mm-dd` em Brasília (sem horário de verão desde 2019). */
export function inicioDoDia(data: string): Date {
  return new Date(`${data}T00:00:00-03:00`);
}

/** O dia de hoje em Brasília, `aaaa-mm-dd`. */
export function hojeEmSaoPaulo(agora: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(agora);
}

/** O primeiro dia em que um aumento pode valer: 30 dias inteiros de aviso. */
export function primeiroDiaComAviso(agora: Date): string {
  let dia = hojeEmSaoPaulo(new Date(agora.getTime() + AVISO_DA_TABELA_DIAS * 86_400_000));
  if (inicioDoDia(dia).getTime() < agora.getTime() + AVISO_DA_TABELA_DIAS * 86_400_000) {
    dia = hojeEmSaoPaulo(new Date(inicioDoDia(dia).getTime() + 36 * 3_600_000));
  }
  return dia;
}

/** A tabela que vale agora: a agendada, se o dia dela já chegou. */
export function tabelaVigente(atual: ConfigCobranca, proxima: TabelaAgendada | null, agora: Date): ConfigCobranca {
  return proxima && agora.getTime() >= inicioDoDia(proxima.vigenteEm).getTime() ? proxima.tabela : atual;
}

/** A vigente e a agendada que ainda não começou (a que já começou é a vigente). */
export function tabelasDeCobranca(
  atual: ConfigCobranca,
  proxima: TabelaAgendada | null,
  agora: Date,
): { vigente: ConfigCobranca; proxima: TabelaAgendada | null } {
  const vigente = tabelaVigente(atual, proxima, agora);
  return { vigente, proxima: proxima && vigente !== proxima.tabela ? proxima : null };
}

/** O que `GET /admin/cobranca/tabela` devolve. */
export interface TabelasDaCobranca {
  vigente: ConfigCobranca;
  proxima: TabelaAgendada | null;
  /** O primeiro dia em que um aumento salvo hoje pode valer. */
  primeiroDiaComAviso: string;
  avisoDias: number;
}

/** `aaaa-mm-dd` → `dd/mm/aaaa`. */
export function dataDaVigencia(dia: string): string {
  return dia.split("-").reverse().join("/");
}

/**
 * A tabela nova aumenta algum valor para alguma promotora? O percentual, o
 * valor por cota, ou a taxa Pix em qualquer volume do mês. As faixas são
 * degraus: basta conferir no começo de cada degrau das duas tabelas.
 */
export function aumentaAlgumaTaxa(antes: ConfigCobranca, depois: ConfigCobranca): boolean {
  if (depois.percentualPct > antes.percentualPct || depois.porCotaCents > antes.porCotaCents) return true;
  const inicios = new Set<number>([0]);
  for (const f of [...antes.faixasPix, ...depois.faixasPix]) if (f.ate !== null) inicios.add(f.ate);
  for (const jaFeitas of inicios) {
    if (faixaPixPara(jaFeitas, depois.faixasPix).pct > faixaPixPara(jaFeitas, antes.faixasPix).pct) return true;
  }
  return false;
}

/**
 * Pode valer nesta data? Redução vale na hora. Aumento só com 30 dias de
 * aviso — salvo antes de qualquer promotora ter aceitado o contrato (não há
 * a quem avisar: é a montagem da tabela antes do lançamento).
 */
export function problemaNaVigencia(p: {
  antes: ConfigCobranca;
  depois: ConfigCobranca;
  /** `aaaa-mm-dd`, ou nulo para valer agora. */
  vigenteEm: string | null;
  agora: Date;
  comPromotoras: boolean;
}): string | null {
  if (p.vigenteEm !== null) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(p.vigenteEm) || Number.isNaN(inicioDoDia(p.vigenteEm).getTime()) || hojeEmSaoPaulo(inicioDoDia(p.vigenteEm)) !== p.vigenteEm) {
      return "Data de vigência inválida.";
    }
    const inicio = inicioDoDia(p.vigenteEm).getTime();
    if (inicio <= p.agora.getTime()) return "A data de vigência precisa ser no futuro. Para valer agora, deixe sem data.";
    if (inicio > p.agora.getTime() + AGENDA_DA_TABELA_MAX_DIAS * 86_400_000) return `Agende no máximo ${AGENDA_DA_TABELA_MAX_DIAS} dias à frente.`;
  }
  if (!p.comPromotoras || !aumentaAlgumaTaxa(p.antes, p.depois)) return null;
  const minimo = primeiroDiaComAviso(p.agora);
  if (p.vigenteEm === null || p.vigenteEm < minimo) {
    return `Aumentar uma taxa exige ${AVISO_DA_TABELA_DIAS} dias de aviso às promotoras: agende para ${dataDaVigencia(minimo)} ou depois.`;
  }
  return null;
}

/** A tabela agendada guardada: fora da régua, some (nunca derruba a configuração). */
export function tabelaAgendadaGuardada(v: unknown): TabelaAgendada | null {
  if (!v || typeof v !== "object") return null;
  const e = v as Record<string, unknown>;
  if (typeof e.vigenteEm !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(e.vigenteEm)) return null;
  try {
    return { vigenteEm: e.vigenteEm, tabela: validarConfigCobranca(e.tabela) };
  } catch {
    return null;
  }
}
