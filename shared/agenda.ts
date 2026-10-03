/**
 * Agendar: o instante em que algo entra no ar (story, peça de divulgação,
 * publicação da rifa). Uma régua só, lida pela tela e pelo servidor.
 */

/** Folga para o relógio do aparelho: "agora" que chega um minuto atrasado ainda é agora. */
const FOLGA_DO_AGORA_MS = 60_000;

/**
 * Só o instante completo, com o fuso (o que a tela manda): "10/05/2026" seria
 * lido no formato americano, e uma data sem hora viraria meia-noite em UTC.
 */
const ISO_COM_FUSO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})$/;

/**
 * Quando entra no ar. Vazio é `null` (agora, sem agenda). Com data: de agora
 * até `maxDias` à frente; o passado (além da folga) e o longe demais são
 * recusados; o que cai na folga vira agora.
 */
export function instanteAgendado(bruta: unknown, maxDias: number, agora: Date = new Date()): Date | null {
  if (bruta === undefined || bruta === null || bruta === "") return null;
  if (typeof bruta !== "string" || !ISO_COM_FUSO.test(bruta)) throw new Error("Data de publicação inválida.");
  const d = new Date(bruta);
  if (Number.isNaN(d.getTime())) throw new Error("Data de publicação inválida.");
  if (d.getTime() < agora.getTime() - FOLGA_DO_AGORA_MS) throw new Error("Escolha uma hora que ainda não passou.");
  if (d.getTime() > agora.getTime() + maxDias * 86_400_000) throw new Error(`Agende para no máximo ${maxDias} dias à frente.`);
  return d.getTime() < agora.getTime() ? agora : d;
}

/** Até quantos dias à frente a organização agenda a publicação da rifa. */
export const RIFA_AGENDA_MAX_DIAS = 30;

/**
 * O que impede agendar a publicação para esta hora, ou `null`. A rifa precisa
 * ir ao ar antes do sorteio (com folga de uma hora para alguém comprar): o
 * resto (autorização, telefone, mídia, sorteio oficial) é conferido na hora
 * de publicar, pela mesma régua da publicação feita à mão.
 */
export function problemaNaAgendaDaRifa(publicarEm: Date, drawAt: Date | string | null): string | null {
  if (drawAt && publicarEm.getTime() > new Date(drawAt).getTime() - 3_600_000) {
    return "A rifa precisa ir ao ar pelo menos 1 hora antes do sorteio.";
  }
  return null;
}
