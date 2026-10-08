/**
 * Regras do atendimento de reembolso — puras, lidas pelo servidor (que
 * decide) e pela tela (que mostra o botão e avisa antes de enviar).
 *
 * O desenho existe para o reembolso não ser banal: só o comprador logado
 * pede, só para pedido pago dele, só antes do sorteio, com o print do
 * bilhete, e a organização decide num chamado com protocolo. O dinheiro
 * volta preferencialmente pelo provedor, para a mesma conta que pagou —
 * é isso que tira a graça do pedido falso: não adianta informar a chave
 * Pix de outra pessoa.
 */
import { cpfValido, normalizePhone } from "./format";
import { fechadoPeloSorteio } from "./reembolso";

export type StatusChamado = "aberto" | "aprovado" | "recusado" | "estornado";

export const NOME_STATUS_CHAMADO: Record<StatusChamado, string> = {
  aberto: "em análise",
  aprovado: "aprovado — aguardando devolução",
  recusado: "recusado",
  estornado: "devolvido",
};

/** Cor do <Pill> para cada situação (o rótulo vai em texto). */
export const PILL_CHAMADO: Record<StatusChamado, string> = {
  aberto: "pending",
  aprovado: "reserved",
  recusado: "expired",
  estornado: "paid",
};

export const PRAZO_ESTORNO_MIN = 1;
export const PRAZO_ESTORNO_MAX = 30;

/** Anexo: tamanho do arquivo enviado, antes do reprocessamento. */
export const ANEXO_MAX_BYTES = 5 * 1024 * 1024;
export const ANEXO_MIMES = ["image/jpeg", "image/png", "image/webp", "image/heic"];

/** Chamados de reembolso por comprador em 24 h. Pedido falso vem em série. */
export const CHAMADOS_POR_DIA = 3;

const ALFABETO = "23456789ABCDEFGHJKMNPQRSTUVWXYZ"; // sem 0/O, 1/I/L

/** `sorteio` é um número aleatório por caractere, injetado para teste. */
export function gerarCodigoCliente(sorteio: (max: number) => number): string {
  let s = "";
  for (let i = 0; i < 8; i++) s += ALFABETO[sorteio(ALFABETO.length)];
  return `C-${s}`;
}

/** RB-AAAAMMDD-NNNNNN: a data ajuda o atendimento; o número é sorteado. */
export function gerarProtocolo(agora: Date, sorteio: (max: number) => number): string {
  const d = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  })
    .format(agora)
    .replace(/-/g, "");
  return `RB-${d}-${String(sorteio(1_000_000)).padStart(6, "0")}`;
}

/** Motivo pelo qual o pedido NÃO pode virar reembolso, ou `null` se pode. */
export function bloqueioDoReembolso(p: {
  estornoLigado: boolean;
  statusPedido: string;
  statusRifa: string;
  /** Data do sorteio: os pedidos fecham 2 horas antes (`shared/reembolso.ts`). */
  sorteioEm?: Date | null;
  agora?: Date;
}): string | null {
  if (!p.estornoLigado) return "Esta plataforma não está aceitando pedidos de reembolso.";
  if (p.statusPedido !== "paid") return "Só pedido pago pode ter reembolso.";
  // Depois do sorteio, quem perdeu pediria o dinheiro de volta.
  if (p.statusRifa === "drawn") return "O sorteio desta rifa já aconteceu: não há reembolso.";
  if (fechadoPeloSorteio(p.sorteioEm, p.agora ?? new Date())) {
    return "Os pedidos de reembolso fecham 2 horas antes do sorteio.";
  }
  return null;
}

export interface PedidoDeReembolso {
  motivo: string;
  cpf: string;
  pixChave?: string;
}

/** Confere o que o comprador mandou. Devolve o problema, ou `null`. */
export function problemaNoPedido(p: PedidoDeReembolso): string | null {
  const motivo = p.motivo?.trim() ?? "";
  if (motivo.length < 10) return "Conte o motivo com pelo menos 10 caracteres.";
  if (motivo.length > 1000) return "O motivo pode ter no máximo 1000 caracteres.";
  if (!cpfValido(p.cpf ?? "")) return "Informe o CPF de quem comprou.";
  if (p.pixChave && p.pixChave.trim().length > 140) return "Chave Pix longa demais.";
  return null;
}

/** Prazo de devolução, contado da conclusão do chamado. */
export function prazoDoEstorno(concluidoEm: Date, dias: number): Date {
  const d = Math.min(PRAZO_ESTORNO_MAX, Math.max(PRAZO_ESTORNO_MIN, Math.round(dias)));
  return new Date(concluidoEm.getTime() + d * 86_400_000);
}

/**
 * Devolução integral (arrependimento do art. 49 e adiamento do art. 35 do
 * CDC) é obrigação legal e a lei pede devolução imediata: o prazo é o
 * bancário, em dias úteis, nunca o que a promotora escolheu (resposta 3.6 do
 * advogado, 06/10/2026). Os 1 a 30 dias da organização valem só para o
 * reembolso com taxa, que é liberalidade.
 */
export const DIAS_UTEIS_DEVOLUCAO_INTEGRAL = 3;

/**
 * Soma dias úteis (segunda a sexta, no fuso de São Paulo, UTC−3 sem horário
 * de verão). Feriado não é pulado: o prazo fica menor, nunca maior.
 */
export function somarDiasUteis(de: Date, dias: number): Date {
  let t = de.getTime();
  let contados = 0;
  while (contados < dias) {
    t += 86_400_000;
    const diaDaSemana = new Date(t - 3 * 3_600_000).getUTCDay();
    if (diaDaSemana !== 0 && diaDaSemana !== 6) contados++;
  }
  return new Date(t);
}

/** O prazo de devolução pelo tipo do reembolso: integral em dias úteis; com taxa, o da organização. */
export function prazoDoEstornoDoTipo(concluidoEm: Date, tipo: string | null | undefined, diasDaOrganizacao: number): Date {
  if (tipo === "arrependimento" || tipo === "adiamento") return somarDiasUteis(concluidoEm, DIAS_UTEIS_DEVOLUCAO_INTEGRAL);
  return prazoDoEstorno(concluidoEm, diasDaOrganizacao);
}

/* ------------------------------------------------------------------ *
 * Aviso de chamado novo à organização
 * ------------------------------------------------------------------ */

/** DDD + número (10 ou 11 dígitos), com ou sem o 55 na frente. */
export function telefoneDeAvisoValido(entrada: string): boolean {
  const d = normalizePhone(entrada);
  return d.length >= 10 && d.length <= 13;
}

/**
 * Quem recebe o aviso de chamado novo. O número que a organização escolheu
 * vale sozinho — é o do atendimento, e ela pode não querer o celular pessoal
 * de todo organizador tocando. Sem ele, avisa os organizadores dela que têm
 * WhatsApp no cadastro, para o chamado nunca chegar em silêncio.
 */
export function destinatariosDoAviso(
  avisoTelefone: string | null | undefined,
  telefonesDosOrganizadores: (string | null | undefined)[],
): string[] {
  if (avisoTelefone && telefoneDeAvisoValido(avisoTelefone)) return [normalizePhone(avisoTelefone)];
  const vistos = new Set<string>();
  for (const t of telefonesDosOrganizadores) {
    if (t && telefoneDeAvisoValido(t)) vistos.add(normalizePhone(t));
  }
  return [...vistos];
}

/* ------------------------------------------------------------------ *
 * Disputa: quando a organização recusa, ou não responde
 * ------------------------------------------------------------------ */

/**
 * A disputa leva o chamado ao administrador geral, que dá a palavra final.
 * Existe porque a organização é juiz em causa própria: o dinheiro que ela
 * devolve é dela. Uma disputa por chamado, e a decisão da plataforma encerra.
 */
export type StatusDisputa = "aberta" | "procedente" | "improcedente";

export const NOME_STATUS_DISPUTA: Record<StatusDisputa, string> = {
  aberta: "em disputa com a plataforma",
  procedente: "disputa procedente",
  improcedente: "disputa improcedente",
};

export const PILL_DISPUTA: Record<StatusDisputa, string> = {
  aberta: "pending",
  procedente: "paid",
  improcedente: "expired",
};

/** Prazo para contestar a recusa, contado da resposta da organização. */
export const DISPUTA_PRAZO_DIAS = 7;

/**
 * A palavra final da plataforma encerra o caso dentro do site, nunca o direito
 * do consumidor: a tela da disputa e a mensagem da decisão dizem isso.
 */
export const DIREITO_DO_CONSUMIDOR = "Isso não tira o seu direito de reclamar no Procon ou no consumidor.gov.br.";
/** Prazo da organização para responder antes de o comprador poder recorrer. */
export const RESPOSTA_PRAZO_DIAS = 3;

const DIA = 86_400_000;

/** Quando o chamado sem resposta pode ir à plataforma. */
export function disputaLiberadaEm(abertoEm: Date): Date {
  return new Date(abertoEm.getTime() + RESPOSTA_PRAZO_DIAS * DIA);
}

/**
 * Motivo pelo qual o comprador NÃO pode levar o chamado à plataforma, ou
 * `null` se pode. Mesma régua do pedido de reembolso para o sorteio: a
 * disputa fecha 2 horas antes, senão quem teve o pedido recusado esperaria o
 * resultado e só contestaria se perdesse.
 */
export function bloqueioDaDisputa(p: {
  estornoLigado: boolean;
  status: StatusChamado;
  disputa: string | null;
  abertoEm: Date;
  concluidoEm: Date | null;
  statusRifa: string;
  sorteioEm?: Date | null;
  agora?: Date;
}): string | null {
  const agora = p.agora ?? new Date();
  if (!p.estornoLigado) return "Esta plataforma não está aceitando pedidos de reembolso.";
  if (p.disputa) return "Este chamado já foi levado à plataforma.";
  if (p.status === "aprovado" || p.status === "estornado") return "O reembolso foi aprovado: não há o que contestar.";
  if (p.statusRifa === "drawn") return "O sorteio desta rifa já aconteceu: não há disputa.";
  if (fechadoPeloSorteio(p.sorteioEm, agora)) return "A disputa fecha 2 horas antes do sorteio.";
  if (p.status === "recusado") {
    const ate = new Date((p.concluidoEm ?? p.abertoEm).getTime() + DISPUTA_PRAZO_DIAS * DIA);
    if (agora > ate) return `O prazo para contestar a recusa (${DISPUTA_PRAZO_DIAS} dias) passou.`;
    return null;
  }
  // Aberto: a organização tem o prazo dela para responder primeiro.
  if (agora < disputaLiberadaEm(p.abertoEm)) {
    return `A organização tem ${RESPOSTA_PRAZO_DIAS} dias para responder. Sem resposta até lá, você pode levar o caso à plataforma.`;
  }
  return null;
}

/** Confere o motivo da disputa. Devolve o problema, ou `null`. */
export function problemaNaDisputa(motivo: string): string | null {
  const m = motivo?.trim() ?? "";
  if (m.length < 20) return "Explique por que discorda, com pelo menos 20 caracteres.";
  if (m.length > 1000) return "A explicação pode ter no máximo 1000 caracteres.";
  return null;
}
