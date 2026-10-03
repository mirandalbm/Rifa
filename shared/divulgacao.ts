/**
 * Divulgação de terceiros: a peça que o **afiliado** (influenciador) ou o
 * **apostador** publica sobre uma rifa que não é dele. Regras puras — a tela
 * e o servidor leem daqui.
 *
 * Nada aqui altera a rifa: a divulgação é uma legenda própria (e, para o
 * afiliado, a escolha de mídias que a **organização** já publicou) com o
 * link ou o código de quem divulga. Preço, cotas, prêmio e autorização
 * SPA/MF não passam por esta tabela.
 *
 * - Afiliado: só com vínculo aprovado e, se a rifa tem termo, o aceite
 *   daquela versão (`comissaoNaRifa()`). A organização escolhe o modo:
 *   `autorizacao` (padrão, conservador: nada vai ao ar sem ela) ou
 *   `direta`.
 * - Apostador: só atrás do interruptor `publicarApostador`, só texto, só
 *   sobre rifa em que tem compra paga, e **sempre** com autorização da
 *   organização.
 */
import { LEGENDA_MAX, limparLegenda, problemaNaLegenda } from "./publicacao";

export const MODOS_DE_DIVULGACAO = {
  autorizacao: "Só depois da minha autorização",
  direta: "Publicação direta",
} as const;
export type ModoDeDivulgacao = keyof typeof MODOS_DE_DIVULGACAO;
/** Nasce pedindo autorização: a organização abre mão dela, não o contrário. */
export const MODO_PADRAO: ModoDeDivulgacao = "autorizacao";

export function validarModo(v: unknown): ModoDeDivulgacao {
  if (typeof v === "string" && v in MODOS_DE_DIVULGACAO) return v as ModoDeDivulgacao;
  throw new Error("Escolha publicação direta ou só depois da sua autorização.");
}

export const STATUS_DA_DIVULGACAO = {
  em_analise: "Aguardando a organização",
  publicada: "No ar",
  recusada: "Recusada",
  removida: "Retirada",
} as const;
export type StatusDaDivulgacao = keyof typeof STATUS_DA_DIVULGACAO;

export type AutorDaDivulgacao = "afiliado" | "apostador";

/** Mídias da própria rifa que o afiliado pode escolher para a peça. */
export const DIVULGACAO_MIDIAS_MAX = 5;
/** Peças novas por pessoa por dia (conta a tentativa, depois do erro de preenchimento). */
export const DIVULGACOES_POR_DIA = 10;
export const MOTIVO_MAX = 300;

export function statusInicial(autor: AutorDaDivulgacao, modo: ModoDeDivulgacao): StatusDaDivulgacao {
  return autor === "afiliado" && modo === "direta" ? "publicada" : "em_analise";
}

export type AcaoDaDecisao = "aprovar" | "recusar" | "remover";

/** O que cada decisão exige da situação de agora (o `UPDATE` condicional confere de novo). */
export const DE_PARA_DA_DECISAO: Record<AcaoDaDecisao, { de: StatusDaDivulgacao; para: StatusDaDivulgacao }> = {
  aprovar: { de: "em_analise", para: "publicada" },
  recusar: { de: "em_analise", para: "recusada" },
  remover: { de: "publicada", para: "removida" },
};

export function validarDecisao(entrada: unknown): { acao: AcaoDaDecisao; motivo: string | null } {
  const e = (entrada ?? {}) as Record<string, unknown>;
  const acao = e.acao;
  if (acao !== "aprovar" && acao !== "recusar" && acao !== "remover") throw new Error("Escolha aprovar, recusar ou retirar.");
  const motivo = typeof e.motivo === "string" ? e.motivo.replace(/\s+/g, " ").trim() : "";
  if (motivo.length > MOTIVO_MAX) throw new Error(`O motivo passa de ${MOTIVO_MAX} caracteres.`);
  // Quem escreve a peça lê o motivo: recusar e retirar sem explicar é só silêncio.
  if ((acao === "recusar" || acao === "remover") && motivo.length < 3) throw new Error("Diga o motivo, para quem publicou entender.");
  return { acao, motivo: motivo || null };
}

export interface EntradaDaDivulgacao {
  legenda: string;
  midias: string[];
}

/**
 * Confere o que o autor manda. Só chaves conhecidas. A legenda passa pela
 * régua da legenda da organização (sem link, sem telefone). O afiliado
 * precisa de legenda ou de ao menos uma mídia; o apostador, de legenda e
 * nunca de mídia (conteúdo de rifa alheia é da organização).
 */
export function validarDivulgacao(autor: AutorDaDivulgacao, bruto: unknown): EntradaDaDivulgacao {
  const b = (bruto ?? {}) as Record<string, unknown>;
  const problema = problemaNaLegenda(b.legenda);
  if (problema) throw new Error(problema);
  const legenda = limparLegenda(typeof b.legenda === "string" ? b.legenda : "");
  const ids = Array.isArray(b.midias) ? b.midias : [];
  if (!ids.every((i) => typeof i === "string" && /^[0-9a-f-]{36}$/i.test(i))) throw new Error("Mídia inválida.");
  const midias = Array.from(new Set(ids as string[]));
  if (autor === "apostador") {
    if (midias.length) throw new Error("O apostador publica só o texto.");
    if (legenda.length < 3) throw new Error("Escreva o que você quer dizer sobre a rifa.");
  } else if (!legenda && midias.length === 0) {
    throw new Error("Escreva a legenda ou escolha ao menos uma mídia da rifa.");
  }
  if (midias.length > DIVULGACAO_MIDIAS_MAX) throw new Error(`Escolha até ${DIVULGACAO_MIDIAS_MAX} mídias.`);
  if (legenda.length > LEGENDA_MAX) throw new Error(`A legenda passa de ${LEGENDA_MAX} caracteres.`);
  return { legenda, midias };
}

/** O link da divulgação: a rifa com o código de quem divulga (só afiliado). */
export function linkDaDivulgacao(slug: string, codigoDoAfiliado: string | null): string {
  return codigoDoAfiliado ? `/r/${slug}?ref=${encodeURIComponent(codigoDoAfiliado)}` : `/r/${slug}`;
}

/**
 * O aviso a quem publicou quando a organização decide a peça (push e trevo do
 * apostador; o afiliado vê o número no sino do painel). Só a decisão da
 * organização avisa: o que a própria pessoa retirou não vira aviso. O motivo
 * vai no corpo — quem escreveu precisa entender a recusa.
 */
export function avisoDaDecisao(status: StatusDaDivulgacao, rifa: string, motivo: string | null): { title: string; body: string } | null {
  const comMotivo = (t: string) => (motivo ? `${t} Motivo: ${motivo}` : t);
  if (status === "publicada") return { title: "Sua divulgação está no ar", body: `A organização aprovou a sua divulgação de ${rifa}.` };
  if (status === "recusada") return { title: "Divulgação recusada", body: comMotivo(`A organização recusou a sua divulgação de ${rifa}.`) };
  if (status === "removida") return { title: "Divulgação retirada", body: comMotivo(`A organização tirou do ar a sua divulgação de ${rifa}.`) };
  return null;
}
