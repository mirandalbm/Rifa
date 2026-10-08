/**
 * Pix que chegou tarde (a fila de devolução da plataforma): os motivos e as
 * situações, com o texto que a tela mostra. Puro.
 */
import { somarDiasUteis } from "./chamados";

export const MOTIVOS_DO_PIX_TARDIO = {
  reserva_vencida: "A reserva venceu antes de o Pix ser confirmado",
  depois_do_sorteio: "O Pix foi confirmado depois do sorteio da rifa",
} as const;
export type MotivoDoPixTardio = keyof typeof MOTIVOS_DO_PIX_TARDIO;

export const SITUACOES_DO_PIX_TARDIO = {
  pendente: "A devolver",
  devolvendo: "Devolvendo — conferir no provedor",
  devolvido: "Devolvido pelo provedor",
  resolvido: "Resolvido por fora",
} as const;
export type SituacaoDoPixTardio = keyof typeof SITUACOES_DO_PIX_TARDIO;

/**
 * Em quantos dias úteis a plataforma confere e devolve o Pix que chegou tarde,
 * contados da confirmação do pagamento — o prazo que os Termos de uso (item 9)
 * prometem e que o cartão "Pix a devolver" mostra em cada caso.
 */
export const PIX_TARDIO_PRAZO_DIAS_UTEIS = 5;

/** Até quando devolver o caso que entrou na fila em `desde`. */
export function prazoDoPixTardio(desde: Date): Date {
  return somarDiasUteis(desde, PIX_TARDIO_PRAZO_DIAS_UTEIS);
}
