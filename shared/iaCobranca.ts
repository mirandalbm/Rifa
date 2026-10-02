/**
 * Cobrança do assistente de IA — regras puras, lidas pelo servidor (que
 * cobra, credita e debita) e pela tela (o plano na coluna do assistente).
 *
 * O modelo, decidido pelo dono:
 * - **Assinatura mensal com franquia de créditos**: cada Pix pago abre (ou
 *   estende) um ciclo de `DIAS_DO_CICLO` dias com `franquiaCreditos`. A
 *   franquia que sobrar vence com o ciclo.
 * - **Créditos avulsos** em pacotes, que não vencem. Só se compra pacote com
 *   a assinatura ativa — crédito que não pode ser usado seria dinheiro preso.
 * - **Pix da plataforma, sem split** (como a recarga do patrocínio), com
 *   código numa faixa própria. Sem débito automático: renovar é outro Pix.
 * - Cada mensagem debita o que o Chatbase informou (em milésimos de crédito),
 *   **primeiro da franquia, depois do avulso**. O custo só é sabido depois da
 *   resposta, então o avulso pode ficar negativo por uma mensagem — é dívida,
 *   e a próxima é recusada.
 * - Quem paga: a organização (qualquer organizador dela) ou o afiliado (no
 *   próprio login). O administrador master não paga.
 */

/** Um ciclo da assinatura. */
export const DIAS_DO_CICLO = 30;
export const MS_DO_CICLO = DIAS_DO_CICLO * 24 * 60 * 60 * 1000;

/** Faixa própria do código do Pix: pedidos têm 8 dígitos, carrinho e recarga 9. */
export const IA_CODIGO_MIN = 1_000_000_000;
export const IA_CODIGO_MAX = 1_100_000_000;

/** Prazo do Pix da IA (como a recarga). */
export const IA_PIX_MINUTOS = 30;

export const MAX_PACOTES = 4;
const PRECO_MAX_CENTS = 1_000_000; // R$ 10.000,00
const CREDITOS_MAX = 100_000;

export interface PacoteIA {
  creditos: number;
  precoCents: number;
}

export interface ConfigCobrancaIA {
  /** Preço da assinatura de um ciclo, em centavos. 0 = ainda não definido. */
  assinaturaCents: number;
  /** Créditos do Chatbase que a assinatura dá a cada ciclo. */
  franquiaCreditos: number;
  /** Pacotes avulsos, do menor para o maior. */
  pacotes: PacoteIA[];
}

export const CONFIG_COBRANCA_IA_PADRAO: ConfigCobrancaIA = {
  assinaturaCents: 0,
  franquiaCreditos: 0,
  pacotes: [],
};

const erro = (m: string) => Object.assign(new Error(m), { status: 400 });

const inteiroEntre = (v: unknown, min: number, max: number) =>
  typeof v === "number" && Number.isInteger(v) && v >= min && v <= max;

/**
 * Só as chaves conhecidas, com limites. O preço do crédito no pacote **nunca
 * sobe** com a quantidade — senão o pacote maior sairia mais caro por crédito
 * (a mesma régua das faixas do patrocínio).
 */
export function validarConfigCobrancaIA(entrada: unknown): ConfigCobrancaIA {
  if (entrada === undefined || entrada === null)
    return CONFIG_COBRANCA_IA_PADRAO;
  if (typeof entrada !== "object")
    throw erro("Configuração da cobrança do assistente inválida.");
  const e = entrada as Record<string, unknown>;
  const assinaturaCents = e.assinaturaCents ?? 0;
  const franquiaCreditos = e.franquiaCreditos ?? 0;
  if (!inteiroEntre(assinaturaCents, 0, PRECO_MAX_CENTS))
    throw erro("O preço da assinatura vai de R$ 0,00 a R$ 10.000,00.");
  if (!inteiroEntre(franquiaCreditos, 0, CREDITOS_MAX))
    throw erro("A franquia vai de 0 a 100.000 créditos.");
  if ((assinaturaCents === 0) !== (franquiaCreditos === 0)) {
    throw erro(
      "Preço e franquia da assinatura andam juntos: preencha os dois ou nenhum.",
    );
  }
  const brutos = e.pacotes ?? [];
  if (!Array.isArray(brutos) || brutos.length > MAX_PACOTES)
    throw erro(`São até ${MAX_PACOTES} pacotes avulsos.`);
  const pacotes: PacoteIA[] = brutos.map((p) => {
    const q = (p ?? {}) as Record<string, unknown>;
    if (!inteiroEntre(q.creditos, 1, CREDITOS_MAX))
      throw erro("Cada pacote tem de 1 a 100.000 créditos.");
    if (!inteiroEntre(q.precoCents, 100, PRECO_MAX_CENTS))
      throw erro("Cada pacote custa de R$ 1,00 a R$ 10.000,00.");
    return {
      creditos: q.creditos as number,
      precoCents: q.precoCents as number,
    };
  });
  pacotes.sort((a, b) => a.creditos - b.creditos);
  for (let i = 1; i < pacotes.length; i++) {
    if (pacotes[i].creditos === pacotes[i - 1].creditos)
      throw erro("Dois pacotes com a mesma quantidade de créditos.");
    // preço por crédito do maior ≤ do menor, sem fração: p_i / c_i ≤ p_{i-1} / c_{i-1}
    if (
      pacotes[i].precoCents * pacotes[i - 1].creditos >
      pacotes[i - 1].precoCents * pacotes[i].creditos
    ) {
      throw erro("O crédito não pode sair mais caro no pacote maior.");
    }
  }
  return {
    assinaturaCents: assinaturaCents as number,
    franquiaCreditos: franquiaCreditos as number,
    pacotes,
  };
}

/** A assinatura está definida (preço e franquia)? Sem isso, organizador e afiliado não ligam. */
export function cobrancaPronta(c: ConfigCobrancaIA): boolean {
  return c.assinaturaCents > 0 && c.franquiaCreditos > 0;
}

/** Créditos inteiros → milésimos (a unidade do uso, `ia_uso.milicreditos`). */
export const emMilicreditos = (creditos: number) => creditos * 1000;

/** A conta de quem paga, como o servidor a guarda (milésimos de crédito). */
export interface ContaIA {
  franquia: number;
  avulso: number;
  cicloAte: Date | null;
}

export const CONTA_IA_VAZIA: ContaIA = {
  franquia: 0,
  avulso: 0,
  cicloAte: null,
};

export function cicloAtivo(conta: ContaIA, agora: Date): boolean {
  return conta.cicloAte !== null && conta.cicloAte.getTime() > agora.getTime();
}

/** O que a franquia vale agora: vencido o ciclo, nada (o relógio zera no banco depois). */
export function franquiaValida(conta: ContaIA, agora: Date): number {
  return cicloAtivo(conta, agora) ? conta.franquia : 0;
}

/**
 * Pode mandar mensagem? Precisa da assinatura ativa e de saldo positivo
 * (franquia válida + avulso). Devolve o motivo em português, ou `null`.
 */
export function problemaNoSaldo(conta: ContaIA, agora: Date): string | null {
  if (!cicloAtivo(conta, agora))
    return "Assine o assistente para conversar: a assinatura está vencida ou ainda não foi feita.";
  if (franquiaValida(conta, agora) + conta.avulso <= 0)
    return "Os créditos do assistente acabaram. Compre um pacote avulso ou renove a assinatura.";
  return null;
}

/**
 * O Pix da assinatura pago: o ciclo começa agora, ou — com um ciclo ainda em
 * curso — estende o que já existe por mais um ciclo, e a franquia nova soma à
 * que sobrou (quem renova antes não perde o que pagou).
 */
export function cicloDepoisDaAssinatura(
  conta: ContaIA,
  franquiaMilicreditos: number,
  agora: Date,
): ContaIA {
  if (cicloAtivo(conta, agora)) {
    return {
      ...conta,
      franquia: conta.franquia + franquiaMilicreditos,
      cicloAte: new Date(conta.cicloAte!.getTime() + MS_DO_CICLO),
    };
  }
  return {
    ...conta,
    franquia: franquiaMilicreditos,
    cicloAte: new Date(agora.getTime() + MS_DO_CICLO),
  };
}

/**
 * Debita o custo de uma mensagem: primeiro a franquia válida, o resto do
 * avulso (que pode ficar negativo — é a dívida da última mensagem). Devolve a
 * conta nova e quanto saiu de cada lado; a soma é exatamente o custo.
 */
export function debitar(
  conta: ContaIA,
  custo: number,
  agora: Date,
): { conta: ContaIA; daFranquia: number; doAvulso: number } {
  const disponivel = Math.max(0, franquiaValida(conta, agora));
  const daFranquia = Math.min(disponivel, Math.max(0, custo));
  const doAvulso = Math.max(0, custo) - daFranquia;
  return {
    conta: {
      ...conta,
      franquia: conta.franquia - daFranquia,
      avulso: conta.avulso - doAvulso,
    },
    daFranquia,
    doAvulso,
  };
}

/** CPF (11) ou CNPJ (14) só com dígitos, para o pagador do Pix; nunca é guardado. */
export function documentoDoPagador(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const d = v.replace(/\D/g, "");
  return d.length === 11 || d.length === 14 ? d : null;
}

/** O que a coluna mostra sobre o plano. */
export interface ResumoCobrancaIA {
  /** O titular paga (organização ou afiliado). O master nunca vê o plano. */
  cobrado: boolean;
  ativa: boolean;
  cicloAte: string | null;
  /** Créditos inteiros, para a tela (o avulso negativo aparece como dívida). */
  franquiaCreditos: number;
  avulsoCreditos: number;
  preco: {
    assinaturaCents: number;
    franquiaCreditos: number;
    pacotes: PacoteIA[];
  };
  /** O Pix ainda em aberto, se houver. */
  pendente: PagamentoIAPublico | null;
  /** O provedor pede CPF/CNPJ do pagador (o afiliado digita; a organização usa o CNPJ cadastrado). */
  pedeDocumento: boolean;
}

export interface PagamentoIAPublico {
  codigo: number;
  tipo: "assinatura" | "avulso";
  valorCents: number;
  creditos: number;
  status: "pendente" | "paga";
  pixQr: string | null;
  pixCopyPaste: string | null;
  expiresAt: string | null;
}

/** Milésimos → créditos para mostrar (para baixo no positivo, para cima na dívida). */
export function creditosParaTela(milicreditos: number): number {
  return milicreditos >= 0
    ? Math.floor(milicreditos / 1000)
    : -Math.ceil(-milicreditos / 1000);
}

/* ---------------- ajuste da plataforma e relatório ---------------- */

/** O maior ajuste numa vez só, em créditos (para mais ou para menos). */
export const AJUSTE_IA_MAX_CREDITOS = 100_000;
export const MOTIVO_AJUSTE_MIN = 5;
export const MOTIVO_AJUSTE_MAX = 300;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TITULAR_RE = /^[A-Za-z0-9_-]{2,64}$/;

export interface AjusteIA {
  titularTipo: "organizacao" | "afiliado";
  /** O endereço (slug) da organização ou o código do afiliado — nunca o id cru. */
  titular: string;
  /** Créditos inteiros: positivo é cortesia, negativo é correção. Nunca zero. */
  creditos: number;
  motivo: string;
  /** Gerado pela tela: o mesmo ajuste enviado duas vezes lança uma vez só. */
  idempotencia: string;
}

/**
 * O ajuste que a plataforma faz na conta de quem paga (cortesia ou correção):
 * só as chaves conhecidas, créditos inteiros e diferentes de zero, motivo
 * obrigatório (vai para o livro e para a auditoria) e a chave de idempotência
 * gerada pela tela. Devolve o motivo em português, ou o ajuste pronto.
 */
export function validarAjusteIA(entrada: unknown): { ok: true; valor: AjusteIA } | { ok: false; erro: string } {
  const e = (entrada && typeof entrada === "object" ? entrada : {}) as Record<string, unknown>;
  if (e.titularTipo !== "organizacao" && e.titularTipo !== "afiliado")
    return { ok: false, erro: "Escolha se o ajuste é de uma organização ou de um afiliado." };
  const titular = typeof e.titular === "string" ? e.titular.trim() : "";
  if (!TITULAR_RE.test(titular))
    return { ok: false, erro: e.titularTipo === "organizacao" ? "Informe o endereço da organização." : "Informe o código do afiliado." };
  const creditos = typeof e.creditos === "string" && e.creditos.trim() !== "" ? Number(e.creditos) : e.creditos;
  if (typeof creditos !== "number" || !Number.isInteger(creditos) || creditos === 0 || Math.abs(creditos) > AJUSTE_IA_MAX_CREDITOS)
    return { ok: false, erro: `Os créditos vão de 1 a ${AJUSTE_IA_MAX_CREDITOS.toLocaleString("pt-BR")}, para mais ou para menos.` };
  const motivo = typeof e.motivo === "string" ? e.motivo.trim().replace(/\s+/g, " ") : "";
  if (motivo.length < MOTIVO_AJUSTE_MIN || motivo.length > MOTIVO_AJUSTE_MAX)
    return { ok: false, erro: `Escreva o motivo (de ${MOTIVO_AJUSTE_MIN} a ${MOTIVO_AJUSTE_MAX} caracteres): ele fica no livro e na auditoria.` };
  const idempotencia = typeof e.idempotencia === "string" ? e.idempotencia : "";
  if (!UUID_RE.test(idempotencia)) return { ok: false, erro: "Ajuste sem identificação: recarregue a tela e tente de novo." };
  return { ok: true, valor: { titularTipo: e.titularTipo, titular, creditos, motivo, idempotencia: idempotencia.toLowerCase() } };
}

/**
 * O ajuste aplicado à conta: vai sempre para o **avulso** (não vence; a
 * franquia é o que a assinatura comprou). A correção para menos nunca deixa o
 * avulso negativo — dívida só nasce do uso. Devolve o motivo da recusa, ou `null`.
 */
export function problemaNoAjuste(conta: ContaIA, milicreditos: number): string | null {
  if (milicreditos >= 0) return null;
  if (conta.avulso + milicreditos < 0) {
    return `A conta tem ${creditosParaTela(Math.max(0, conta.avulso))} crédito(s) avulso(s): a correção não pode tirar mais que isso.`;
  }
  return null;
}

/** Períodos do relatório do assistente, em dias. */
export const PERIODOS_DO_RELATORIO_IA = [7, 30, 90] as const;
export type PeriodoRelatorioIA = (typeof PERIODOS_DO_RELATORIO_IA)[number];

export function periodoDoRelatorio(v: unknown): PeriodoRelatorioIA {
  const n = Number(v);
  return (PERIODOS_DO_RELATORIO_IA as readonly number[]).includes(n) ? (n as PeriodoRelatorioIA) : 30;
}

/** Uma linha do relatório: quem paga, sem dado pessoal (nome público da organização ou código do afiliado). */
export interface LinhaDoRelatorioIA {
  titularTipo: "organizacao" | "afiliado";
  /** Endereço da organização ou código do afiliado: é o que o ajuste usa. */
  titular: string;
  nome: string;
  mensagens: number;
  semMedida: number;
  creditosUsados: number;
  receitaCents: number;
  pixPagos: number;
  ativa: boolean;
  cicloAte: string | null;
  franquiaCreditos: number;
  avulsoCreditos: number;
}

export interface RelatorioIA {
  dias: PeriodoRelatorioIA;
  /** Havia mais contas do que a lista mostra (as de mais receita e uso vêm primeiro). */
  cortada: boolean;
  totais: {
    receitaCents: number;
    pixPagos: number;
    /** Pix pagos no período que depois foram estornados no provedor. */
    estornadosCents: number;
    mensagens: number;
    semMedida: number;
    creditosUsados: number;
    /** O uso do master (gratuito) entra à parte: é custo da plataforma, sem receita. */
    creditosDaPlataforma: number;
    contasAtivas: number;
  };
  linhas: LinhaDoRelatorioIA[];
}

export interface LancamentoIAPublico {
  motivo: string;
  franquiaCreditos: number;
  avulsoCreditos: number;
  descricao: string | null;
  criadoEm: string;
}
