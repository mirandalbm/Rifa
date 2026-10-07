import { PRAZO_DE_ESTORNO_DIAS } from "@shared/pricing";

/**
 * A janela de estorno da comissão, em dias contados do pagamento. A mesma
 * conta que libera a comissão (`commissionAvailableAt`) e o número que o termo
 * do afiliado escreve na cláusula 4 — mudar a variável muda os dois juntos (o
 * painel avisa que o termo publicado ficou desatualizado).
 */
export const REFUND_WINDOW_DAYS = Number(process.env.REFUND_WINDOW_DAYS ?? PRAZO_DE_ESTORNO_DIAS);
