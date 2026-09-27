/**
 * Mudança em rifa publicada: edição e adiamento do sorteio.
 *
 * Rifa no ar tem comprador, e quem comprou comprou aquela rifa. Por isso a
 * organização não muda nada sozinha depois de publicar: pede, e a
 * plataforma analisa (aprova ou recusa, com a conversa no Atendimento).
 * Algumas coisas não mudam nem com aprovação — o prêmio, o preço, o total
 * de cotas e a autorização (`LOCKED_AFTER_PUBLISH` em `services/campaigns.ts`).
 *
 * Regras puras: a tela mostra o que pode, o servidor confere o mesmo.
 */

export type TipoSolicitacao = "edicao" | "adiamento";
export type StatusSolicitacao = "em_analise" | "aprovada" | "recusada" | "cancelada";

export const NOME_TIPO_SOLICITACAO: Record<TipoSolicitacao, string> = {
  edicao: "Edição da rifa",
  adiamento: "Adiamento do sorteio",
};

export const NOME_STATUS_SOLICITACAO: Record<StatusSolicitacao, string> = {
  em_analise: "em análise",
  aprovada: "aprovada",
  recusada: "recusada",
  cancelada: "cancelada",
};

/** Cor da `<Pill>` (que sempre traz o rótulo em texto). */
export const PILL_SOLICITACAO: Record<StatusSolicitacao, string> = {
  em_analise: "pending",
  aprovada: "paid",
  recusada: "expired",
  cancelada: "draft",
};

/**
 * O que a organização pode pedir para mudar numa rifa publicada. O prêmio
 * fica de fora de propósito: quem comprou comprou aquele prêmio.
 */
export const CAMPOS_EDITAVEIS = {
  title: "Título",
  description: "Descrição",
  minPerOrder: "Mínimo de cotas por pedido",
  maxPerOrder: "Máximo de cotas por pedido",
  reservationTtlMin: "Tempo da reserva (minutos)",
  commissionPctDefault: "Comissão padrão (%)",
} as const;

export type CampoEditavel = keyof typeof CAMPOS_EDITAVEIS;
export type ValorEditavel = string | number | null;
export type Alteracoes = Partial<Record<CampoEditavel, { de: ValorEditavel; para: ValorEditavel }>>;

/** Campos que nunca mudam depois de publicar — nem pedindo. */
export const NAO_MUDA_DEPOIS_DE_PUBLICAR: Record<string, string> = {
  prizeTitle: "O prêmio não muda depois de publicar: quem comprou comprou aquele prêmio.",
  totalQuotas: "O total de cotas trava ao publicar.",
  priceCents: "O preço da cota trava ao publicar.",
  slug: "O endereço da rifa trava ao publicar.",
};

const DESCRICAO_MAX = 5000;
export const RESERVA_MIN = 5;
export const RESERVA_MAX = 60;

function inteiro(v: unknown): number | null {
  const n = typeof v === "string" && v.trim() !== "" ? Number(v) : v;
  return typeof n === "number" && Number.isInteger(n) ? n : null;
}

/**
 * Confere o pedido de edição contra a rifa atual e devolve só o que muda,
 * com o valor de antes (é o que o analista lê). Campo desconhecido é
 * ignorado; campo que não muda depois de publicar é recusado com o motivo.
 */
export function validarEdicao(
  entrada: Record<string, unknown>,
  atual: Record<CampoEditavel, ValorEditavel>,
): { ok: true; alteracoes: Alteracoes } | { ok: false; erro: string } {
  for (const campo of Object.keys(NAO_MUDA_DEPOIS_DE_PUBLICAR)) {
    if (campo in entrada && entrada[campo] !== undefined) {
      return { ok: false, erro: NAO_MUDA_DEPOIS_DE_PUBLICAR[campo] };
    }
  }

  const novo: Record<CampoEditavel, ValorEditavel> = { ...atual };
  if ("title" in entrada) {
    const t = String(entrada.title ?? "").trim();
    if (t.length < 3 || t.length > 120) return { ok: false, erro: "O título precisa ter de 3 a 120 caracteres." };
    novo.title = t;
  }
  if ("description" in entrada) {
    const d = String(entrada.description ?? "").trim();
    if (d.length > DESCRICAO_MAX) return { ok: false, erro: `A descrição passa de ${DESCRICAO_MAX} caracteres.` };
    novo.description = d || null;
  }
  for (const campo of ["minPerOrder", "maxPerOrder", "reservationTtlMin", "commissionPctDefault"] as const) {
    if (!(campo in entrada)) continue;
    const n = inteiro(entrada[campo]);
    if (n === null) return { ok: false, erro: `${CAMPOS_EDITAVEIS[campo]}: use um número inteiro.` };
    novo[campo] = n;
  }

  const min = novo.minPerOrder as number;
  const max = novo.maxPerOrder as number;
  if (min < 1) return { ok: false, erro: "O mínimo por pedido é pelo menos 1 cota." };
  if (max < min) return { ok: false, erro: "O máximo por pedido não pode ser menor que o mínimo." };
  if (max > 10_000) return { ok: false, erro: "O máximo por pedido é de até 10.000 cotas." };
  const ttl = novo.reservationTtlMin as number;
  if (ttl < RESERVA_MIN || ttl > RESERVA_MAX) {
    return { ok: false, erro: `O tempo da reserva vai de ${RESERVA_MIN} a ${RESERVA_MAX} minutos.` };
  }
  const pct = novo.commissionPctDefault as number;
  if (pct < 0 || pct > 50) return { ok: false, erro: "A comissão padrão vai de 0 a 50%." };

  const alteracoes: Alteracoes = {};
  for (const campo of Object.keys(CAMPOS_EDITAVEIS) as CampoEditavel[]) {
    if (novo[campo] !== atual[campo]) alteracoes[campo] = { de: atual[campo], para: novo[campo] };
  }
  if (Object.keys(alteracoes).length === 0) return { ok: false, erro: "Nada mudou em relação à rifa atual." };
  return { ok: true, alteracoes };
}

/** O sorteio adiado precisa ficar pelo menos um dia à frente... */
export const ADIAMENTO_ANTECEDENCIA_MS = 24 * 3600_000;
/** ...e no máximo seis meses depois da data atual. */
export const ADIAMENTO_MAX_DIAS = 180;
export const MOTIVO_MIN = 10;
export const MOTIVO_MAX = 1000;

/**
 * Adiar o sorteio por não atingir a meta. Só rifa publicada e ainda não
 * sorteada; rifa com todas as cotas vendidas já bateu a meta. A nova data
 * vem depois da atual, com um dia de antecedência e até seis meses.
 * Devolve o motivo da recusa, ou `null`.
 */
export function problemaNoAdiamento(r: {
  status: string;
  sorteada: boolean;
  drawAt: Date | null;
  vendidas: number;
  total: number;
  novaData: Date | null;
  motivo: string;
  agora: Date;
}): string | null {
  if (r.status !== "published" || r.sorteada) return "Só dá para adiar rifa publicada e ainda não sorteada.";
  if (!r.drawAt) return "A rifa não tem data de sorteio.";
  if (r.vendidas >= r.total) return "Todas as cotas foram vendidas: a meta foi atingida, não há o que adiar.";
  if (!r.novaData || Number.isNaN(r.novaData.getTime())) return "Informe a nova data do sorteio.";
  if (r.novaData.getTime() <= r.drawAt.getTime()) return "A nova data precisa ser depois da data atual do sorteio.";
  if (r.novaData.getTime() < r.agora.getTime() + ADIAMENTO_ANTECEDENCIA_MS) {
    return "A nova data precisa estar pelo menos 24 horas à frente.";
  }
  const base = Math.max(r.drawAt.getTime(), r.agora.getTime());
  if (r.novaData.getTime() > base + ADIAMENTO_MAX_DIAS * 86_400_000) {
    return `O adiamento é de até ${ADIAMENTO_MAX_DIAS} dias.`;
  }
  const m = r.motivo.trim();
  if (m.length < MOTIVO_MIN) return "Explique o motivo do adiamento (pelo menos 10 caracteres).";
  if (m.length > MOTIVO_MAX) return `O motivo passa de ${MOTIVO_MAX} caracteres.`;
  return null;
}

/**
 * Excluir de vez: rifa que nunca vendeu. Rascunho sempre (salvo dinheiro
 * envolvido, que o servidor confere); publicada só sem nenhuma cota tomada
 * — com comprador, o caminho é o estorno.
 */
export function podeExcluir(r: { status: string; vendidas: number; demonstracao?: boolean }) {
  if (r.demonstracao) return true;
  if (r.status === "draft") return true;
  return r.status === "published" && r.vendidas === 0;
}

/** `RS-AAAAMMDD-NNNNNN`, no dia de São Paulo — o mesmo formato do chamado. */
export function protocoloDaSolicitacao(agora: Date, sorteio: (max: number) => number): string {
  const d = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  })
    .format(agora)
    .replace(/-/g, "");
  return `RS-${d}-${String(sorteio(1_000_000)).padStart(6, "0")}`;
}
