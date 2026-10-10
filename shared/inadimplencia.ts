/**
 * Falta de pagamento da promotora à plataforma — cláusula X.13 (a) do
 * contrato da promotora: "bloquear a publicação de novas rifas, depois de
 * notificar a Promotora pelo painel e de decorridos 10 (dez) dias sem a
 * regularização".
 *
 * O que a promotora deve são as taxas em aberto (`platform_charges` com
 * `aberta`: o Pix sem split e a venda do cambista, cláusula X.7 (b)). A
 * plataforma **notifica** de propósito, com o valor daquele instante; a
 * notificação vale só para as taxas abertas naquele instante, e a venda de
 * depois não entra nela. Passado o prazo com alguma delas ainda em aberto, a
 * organização não publica rifa nova (`publishBlockers` e de novo na
 * transação de `publishCampaign()`); as rifas no ar seguem vendendo.
 * Regularizar é a plataforma dar baixa (o acerto) ou a taxa sair por estorno.
 *
 * As regras são puras: a tela, o servidor e os testes leem daqui.
 */
import { formatBRL } from "./format";
import { dataDaVigencia, hojeEmSaoPaulo, inicioDoDia } from "./cobranca";

/** Os dias para regularizar depois da notificação (cláusula X.13 (a)). */
export const PRAZO_PARA_REGULARIZAR_DIAS = 10;

/**
 * Quando o bloqueio passa a valer: a meia-noite de Brasília depois do 10º
 * dia. O prazo exclui o dia da notificação e inclui o último (Código Civil,
 * art. 132): notificada no dia 10, regulariza até o fim do dia 20 e o
 * bloqueio começa no dia 21.
 */
export function bloqueioDaNotificacao(notificadaEm: Date): Date {
  const dia = hojeEmSaoPaulo(notificadaEm);
  return new Date(inicioDoDia(dia).getTime() + (PRAZO_PARA_REGULARIZAR_DIAS + 1) * 86_400_000);
}

/** O último dia para regularizar, `dd/mm/aaaa` (o dia antes do bloqueio). */
export function ultimoDiaParaRegularizar(bloqueiaEm: Date | string): string {
  return dataDaVigencia(hojeEmSaoPaulo(new Date(new Date(bloqueiaEm).getTime() - 3_600_000)));
}

/** A data de um instante em Brasília, `dd/mm/aaaa`. */
export function diaEmBrasilia(instante: Date | string): string {
  return dataDaVigencia(hojeEmSaoPaulo(new Date(instante)));
}

/** A notificação como a tela e o servidor a leem. */
export interface NotificacaoDeCobranca {
  id: string;
  /** O que estava em aberto quando a plataforma notificou. */
  valorCents: number;
  /** O que ainda está em aberto das taxas notificadas (a venda de depois não entra). */
  abertoCents: number;
  notificadaEm: string | Date;
  bloqueiaEm: string | Date;
}

/**
 * `no_prazo`: notificada, ainda dá para regularizar. `bloqueando`: o prazo
 * passou com taxa notificada em aberto — rifa nova não publica.
 * `regularizada`: nada do que foi notificado segue em aberto.
 */
export type SituacaoDaNotificacao = "no_prazo" | "bloqueando" | "regularizada";

export function situacaoDaNotificacao(
  n: Pick<NotificacaoDeCobranca, "abertoCents" | "bloqueiaEm">,
  agora: Date,
): SituacaoDaNotificacao {
  if (n.abertoCents <= 0) return "regularizada";
  return agora.getTime() >= new Date(n.bloqueiaEm).getTime() ? "bloqueando" : "no_prazo";
}

/** O que impede a publicação, ou `null`. A mesma frase no painel e na falha da agendada. */
export function problemaDaInadimplencia(n: NotificacaoDeCobranca | null, agora: Date): string | null {
  if (!n || situacaoDaNotificacao(n, agora) !== "bloqueando") return null;
  return (
    `Publicação de rifa nova bloqueada por falta de pagamento à plataforma: ${formatBRL(n.abertoCents)} em aberto, ` +
    `notificados em ${diaEmBrasilia(n.notificadaEm)}. As rifas no ar seguem vendendo; a publicação volta assim que ` +
    `a plataforma registrar o pagamento (Cobrança).`
  );
}

/** O aviso para a organização, em texto (Cobrança e sino). */
export function avisoDaNotificacao(n: NotificacaoDeCobranca, agora: Date): string | null {
  const situacao = situacaoDaNotificacao(n, agora);
  if (situacao === "regularizada") return null;
  if (situacao === "bloqueando") return problemaDaInadimplencia(n, agora);
  return (
    `A plataforma notificou em ${diaEmBrasilia(n.notificadaEm)} a falta de pagamento de ${formatBRL(n.abertoCents)}. ` +
    `Regularize até ${ultimoDiaParaRegularizar(n.bloqueiaEm)}: depois disso, enquanto o valor seguir em aberto, ` +
    `nenhuma rifa nova pode ser publicada. As rifas no ar seguem vendendo.`
  );
}

export const MOTIVO_DO_CANCELAMENTO_MIN = 5;
export const MOTIVO_DO_CANCELAMENTO_MAX = 500;

export class InadimplenciaError extends Error {
  constructor(message: string, readonly status = 400) {
    super(message);
    this.name = "InadimplenciaError";
  }
}

/** Cancelar a notificação exige motivo: fica na auditoria. */
export function validarMotivoDoCancelamento(bruto: unknown): string {
  const motivo = String(bruto ?? "").replace(/\s+/g, " ").trim();
  if (motivo.length < MOTIVO_DO_CANCELAMENTO_MIN) {
    throw new InadimplenciaError(`Diga o motivo do cancelamento (pelo menos ${MOTIVO_DO_CANCELAMENTO_MIN} letras).`);
  }
  if (motivo.length > MOTIVO_DO_CANCELAMENTO_MAX) {
    throw new InadimplenciaError(`O motivo passa de ${MOTIVO_DO_CANCELAMENTO_MAX} letras.`);
  }
  return motivo;
}

/**
 * Pode notificar? Só com taxa em aberto, e só se o que a plataforma deve à
 * organização (a parte dela nos presentes) não cobrir a dívida: aí o caminho
 * é o acerto, que compensa (cláusula X.13 (b)), não o bloqueio.
 */
export function problemaParaNotificar(abertoCents: number, creditoCents: number): string | null {
  if (abertoCents <= 0) return "Esta organização não tem taxa em aberto.";
  if (creditoCents >= abertoCents) {
    return "O que a plataforma deve a esta organização (presentes) cobre o que ela deve: faça o acerto (dar baixa), que compensa os dois.";
  }
  return null;
}
