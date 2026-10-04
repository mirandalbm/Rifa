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
 *   `direta`. Com foto própria (até `DIVULGACAO_FOTOS_MAX`), a peça passa
 *   pela organização **em qualquer modo**: a varredura do Pix por fora só lê
 *   texto, e o Pix em imagem passaria direto.
 * - Apostador: só atrás do interruptor `publicarApostador`, texto e até
 *   `DIVULGACAO_FOTOS_MAX` fotos dele, só sobre rifa em que tem compra paga, e
 *   **sempre** com autorização da organização (a varredura do Pix por fora
 *   só lê texto: a foto, quem lê é a organização).
 */
import { LEGENDA_MAX, limparLegenda, problemaNaLegenda } from "./publicacao";
import { instanteAgendado } from "./agenda";

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
/** Fotos próprias de quem publica (apostador ou afiliado), sempre com a autorização da organização. */
export const DIVULGACAO_FOTOS_MAX = 4;
/** Cada foto, antes de reprocessar (a tela já manda JPEG de 1600 px, bem abaixo disto). */
export const DIVULGACAO_FOTO_MAX_BYTES = 3 * 1024 * 1024;

/**
 * As fotos próprias que o autor manda: ausente é `null` (na edição, ficam as que a
 * peça tinha); lista vazia tira todas. Só `data:image/…;base64,…`, até
 * `DIVULGACAO_FOTOS_MAX`. O conteúdo é conferido ao reprocessar, no servidor.
 */
export function validarFotos(v: unknown): string[] | null {
  if (v === undefined || v === null) return null;
  if (!Array.isArray(v)) throw new Error("Fotos inválidas.");
  if (v.length > DIVULGACAO_FOTOS_MAX) throw new Error(`Envie até ${DIVULGACAO_FOTOS_MAX} fotos.`);
  for (const f of v) {
    if (typeof f !== "string" || !/^data:image\/(jpeg|jpg|png|webp);base64,[A-Za-z0-9+/=]+$/i.test(f)) throw new Error("Envie fotos em JPG, PNG ou WebP.");
  }
  return v as string[];
}
/**
 * O vídeo próprio do afiliado (um por peça, no lugar das fotos — foto ou
 * vídeo, nunca os dois: o corpo da peça fica dentro do limite). Vai como veio,
 * sem transcode; duração e medidas saem do arquivo, no servidor. A peça com
 * vídeo sempre passa pela organização. O apostador não manda vídeo.
 */
export const DIVULGACAO_VIDEO_MAX_SEGUNDOS = 60;
export const DIVULGACAO_VIDEO_MAX_BYTES = 15 * 1024 * 1024;

/**
 * O vídeo que o autor manda: ausente é `undefined` (na edição, fica o que a
 * peça tinha); `null` tira; senão só `data:video/mp4|quicktime;base64,…`. O
 * conteúdo é medido no servidor (`problemaNoVideoDaDivulgacao`).
 */
export function validarVideo(v: unknown): string | null | undefined {
  if (v === undefined) return undefined;
  if (v === null || v === "") return null;
  if (typeof v !== "string" || !/^data:video\/(mp4|quicktime);base64,[A-Za-z0-9+/=]+$/i.test(v)) throw new Error("Envie o vídeo em MP4 ou MOV.");
  return v;
}

/**
 * O que impede este vídeo de entrar na peça, ou `null` se serve. Em pé ou
 * deitado, mas medido: vídeo que não sabemos medir não entra (a promessa de
 * duração é do servidor, nunca do navegador).
 */
export function problemaNoVideoDaDivulgacao(bytes: number, segundos: number, medidas: { width: number; height: number } | null): string | null {
  if (bytes > DIVULGACAO_VIDEO_MAX_BYTES) return `O vídeo passa de ${DIVULGACAO_VIDEO_MAX_BYTES / 1024 / 1024} MB. Exporte mais leve.`;
  if (!Number.isFinite(segundos) || segundos <= 0) return "Não consegui medir a duração do vídeo.";
  if (segundos > DIVULGACAO_VIDEO_MAX_SEGUNDOS) return `O vídeo passa de ${DIVULGACAO_VIDEO_MAX_SEGUNDOS} segundos.`;
  if (!medidas || medidas.width <= 0 || medidas.height <= 0) return "Não consegui medir o tamanho do vídeo. Envie em MP4 ou MOV.";
  return null;
}

/** Até quantos dias à frente quem publica agenda a peça. */
export const DIVULGACAO_AGENDA_MAX_DIAS = 30;

/**
 * A hora em que a peça entra na página da rifa: ausente é `undefined` (na
 * edição, fica a que estava); vazia é `null` (sem agenda: entra assim que
 * estiver no ar); com data, até `DIVULGACAO_AGENDA_MAX_DIAS` à frente. A
 * aprovação da organização continua valendo antes: agendar não pula a fila.
 */
export function agendaDaPeca(bruta: unknown, agora: Date = new Date()): Date | null | undefined {
  if (bruta === undefined) return undefined;
  return instanteAgendado(bruta, DIVULGACAO_AGENDA_MAX_DIAS, agora);
}

/**
 * Aparece na página da rifa agora? (no ar e, se agendada, já passou da hora)
 * A consulta do servidor é `noArAgora()` em `server/services/divulgacao.ts`,
 * a mesma regra em SQL: mudou uma, mude a outra.
 */
export function pecaNoArAgora(status: StatusDaDivulgacao, publicaEm: Date | string | null, agora: Date = new Date()): boolean {
  return status === "publicada" && (!publicaEm || new Date(publicaEm).getTime() <= agora.getTime());
}

/**
 * No feed da vitrine, entra uma divulgação depois de cada tantas rifas: o feed
 * continua sendo de rifas, e a peça de terceiro aparece marcada "Divulgação".
 */
export const DIVULGACAO_A_CADA_RIFAS = 3;

/**
 * Intercala as divulgações nas rifas: uma depois de cada `aCada` rifas, na
 * ordem em que vieram; as que sobram ficam de fora (o feed não termina numa
 * fila de divulgações). Puro, para a tela e o teste.
 */
export function intercalar<R, D>(rifas: R[], pecas: D[], aCada = DIVULGACAO_A_CADA_RIFAS): ({ tipo: "rifa"; item: R } | { tipo: "divulgacao"; item: D })[] {
  const saida: ({ tipo: "rifa"; item: R } | { tipo: "divulgacao"; item: D })[] = [];
  let p = 0;
  rifas.forEach((r, i) => {
    saida.push({ tipo: "rifa", item: r });
    if ((i + 1) % aCada === 0 && p < pecas.length) saida.push({ tipo: "divulgacao", item: pecas[p++] });
  });
  return saida;
}

/** Peças novas por pessoa por dia (conta a tentativa, depois do erro de preenchimento). */
export const DIVULGACOES_POR_DIA = 10;
export const MOTIVO_MAX = 300;
/** Edições por pessoa por dia (balde próprio: corrigir não gasta o de peças novas). */
export const EDICOES_POR_DIA = 20;

/**
 * Só se edita o que ainda vale: em análise ou no ar. Recusada e retirada
 * terminaram — quem quiser de novo envia outra.
 */
export function podeEditar(status: StatusDaDivulgacao): boolean {
  return status === "em_analise" || status === "publicada";
}

/**
 * Vai ao ar sem a organização só a peça do afiliado, no modo direto e **sem
 * foto nem vídeo próprio** — a imagem, quem lê é a organização.
 */
export function statusInicial(autor: AutorDaDivulgacao, modo: ModoDeDivulgacao, temMidiaPropria = false): StatusDaDivulgacao {
  return autor === "afiliado" && modo === "direta" && !temMidiaPropria ? "publicada" : "em_analise";
}

export type AcaoDaDecisao = "aprovar" | "recusar" | "remover";

/** O que cada decisão exige da situação de agora (o `UPDATE` condicional confere de novo). */
export const DE_PARA_DA_DECISAO: Record<AcaoDaDecisao, { de: StatusDaDivulgacao; para: StatusDaDivulgacao }> = {
  aprovar: { de: "em_analise", para: "publicada" },
  recusar: { de: "em_analise", para: "recusada" },
  remover: { de: "publicada", para: "removida" },
};

export function validarDecisao(entrada: unknown): { acao: AcaoDaDecisao; motivo: string | null; versao: number } {
  const e = (entrada ?? {}) as Record<string, unknown>;
  const acao = e.acao;
  if (acao !== "aprovar" && acao !== "recusar" && acao !== "remover") throw new Error("Escolha aprovar, recusar ou retirar.");
  const motivo = typeof e.motivo === "string" ? e.motivo.replace(/\s+/g, " ").trim() : "";
  if (motivo.length > MOTIVO_MAX) throw new Error(`O motivo passa de ${MOTIVO_MAX} caracteres.`);
  // Quem escreve a peça lê o motivo: recusar e retirar sem explicar é só silêncio.
  if ((acao === "recusar" || acao === "remover") && motivo.length < 3) throw new Error("Diga o motivo, para quem publicou entender.");
  // O motivo vai no push e no trevo de quem publicou: a régua da legenda
  // (sem link e sem telefone) vale aqui também — senão seria o canal do
  // "chama no zap" escrito pela organização.
  const problema = motivo ? problemaNaLegenda(motivo) : null;
  if (problema) throw new Error(problema);
  // A versão que a organização leu é obrigatória: sem ela, a peça editada
  // depois que a lista abriu seria decidida às cegas.
  const versao = versaoInformada(e.versao);
  if (versao === null) throw new Error("Abra a lista de novo antes de decidir.");
  return { acao, motivo: motivo || null, versao };
}

/** A versão que a tela leu: inteira e não negativa; ausente é `null`, formato errado é erro. */
export function versaoInformada(v: unknown): number | null {
  if (v === undefined || v === null) return null;
  if (!(typeof v === "number" && Number.isInteger(v) && v >= 0)) throw new Error("Versão inválida.");
  return v;
}

export const VAZIA_DO_AFILIADO = "Escreva a legenda, escolha uma mídia da rifa ou envie uma foto ou um vídeo seu.";

export interface EntradaDaDivulgacao {
  legenda: string;
  midias: string[];
}

/**
 * Confere o que o autor manda. Só chaves conhecidas. A legenda passa pela
 * régua da legenda da organização (sem link, sem telefone). O afiliado
 * precisa de legenda, de uma mídia da rifa ou de mídia própria (`fotos`,
 * quantas fotos — ou o vídeo — a peça terá); o apostador, de legenda e nunca de mídia da rifa
 * (conteúdo de rifa alheia é da organização).
 */
export function validarDivulgacao(autor: AutorDaDivulgacao, bruto: unknown, fotos = 0): EntradaDaDivulgacao {
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
  } else if (!legenda && midias.length === 0 && fotos === 0) {
    throw new Error(VAZIA_DO_AFILIADO);
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
export function avisoDaDecisao(
  status: StatusDaDivulgacao,
  rifa: string,
  motivo: string | null,
  publicaEm: Date | string | null = null,
  agora: Date = new Date(),
): { title: string; body: string } | null {
  const comMotivo = (t: string) => (motivo ? `${t} Motivo: ${motivo}` : t);
  if (status === "publicada" && !pecaNoArAgora(status, publicaEm, agora)) {
    // Aprovada antes da hora agendada: dizer "está no ar" seria mentira até lá.
    const quando = new Date(publicaEm as string | Date).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" });
    return { title: "Sua divulgação foi aprovada", body: `A organização aprovou a sua divulgação de ${rifa}. Ela aparece na página da rifa em ${quando}.` };
  }
  if (status === "publicada") return { title: "Sua divulgação está no ar", body: `A organização aprovou a sua divulgação de ${rifa}.` };
  if (status === "recusada") return { title: "Divulgação recusada", body: comMotivo(`A organização recusou a sua divulgação de ${rifa}.`) };
  if (status === "removida") return { title: "Divulgação retirada", body: comMotivo(`A organização tirou do ar a sua divulgação de ${rifa}.`) };
  return null;
}
