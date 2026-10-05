/**
 * Cotas premiadas: o sistema sorteia os números, e só a plataforma vê quais
 * são (a organização sorteia e vê "em segredo" até alguém ganhar; a
 * plataforma pode escolher, só no rascunho). Quem comprar um deles leva o prêmio na hora — a
 * revelação acontece no pagamento (`settleOrderAsPaid`), e depois disso o
 * ganhador aparece fixo no topo dos comentários da rifa com a cota.
 *
 * - **Escolher é só da plataforma, e só antes de publicar.** Depois de ter comprador, escolher o
 *   número seria poder premiar quem já comprou (um amigo, a própria conta).
 *   Sortear continua valendo a qualquer hora, porque ninguém escolhe.
 * - **O número não sai em endpoint público antes de ser ganho**: só a
 *   descrição do prêmio. Ganho, a cota já foi vendida — mostrar não dá
 *   vantagem a ninguém.
 */

export const PREMIADAS_MAX = 500;

/**
 * Lê a lista digitada ("12, 345 1000") ou recebida e confere: inteiros na
 * faixa da rifa, sem repetir, até `PREMIADAS_MAX`. Devolve a lista (os
 * números internos, 1 ao total) ou o problema, em português. Quem digita lê
 * a numeração da tela: na rifa que numera a partir de zero (`zero`), o 000
 * digitado é a cota interna 1.
 */
export function numerosPremiados(
  bruto: unknown,
  totalQuotas: number,
  zero: boolean,
): { numeros: number[] } | { problema: string } {
  const lista = Array.isArray(bruto)
    ? bruto
    : typeof bruto === "string"
      ? bruto.split(/[\s,;]+/).filter(Boolean)
      : null;
  if (!lista || lista.length === 0) return { problema: "Informe ao menos um número." };
  if (lista.length > PREMIADAS_MAX) return { problema: `No máximo ${PREMIADAS_MAX} cotas premiadas por vez.` };
  const primeiro = zero ? 0 : 1;
  const ultimo = zero ? totalQuotas - 1 : totalQuotas;
  const numeros: number[] = [];
  for (const x of lista) {
    const lido = typeof x === "number" ? x : Number(String(x).replace(/\D/g, "") || NaN);
    if (!Number.isInteger(lido) || lido < primeiro || lido > ultimo) {
      return { problema: `O número ${String(x)} está fora da faixa da rifa (${primeiro} a ${ultimo}).` };
    }
    const n = zero ? lido + 1 : lido;
    if (numeros.includes(n)) return { problema: `O número ${lido} está repetido.` };
    numeros.push(n);
  }
  return { numeros };
}
