/**
 * Pix que chegou tarde (a fila de devolução da plataforma): os motivos e as
 * situações, com o texto que a tela mostra. Puro.
 */
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
