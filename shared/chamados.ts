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
}): string | null {
  if (!p.estornoLigado) return "Esta plataforma não está aceitando pedidos de reembolso.";
  if (p.statusPedido !== "paid") return "Só pedido pago pode ter reembolso.";
  // Depois do sorteio, quem perdeu pediria o dinheiro de volta.
  if (p.statusRifa === "drawn") return "O sorteio desta rifa já aconteceu: não há reembolso.";
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
