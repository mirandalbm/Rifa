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

/**
 * Cotas premiadas são **vale-brinde** (resposta 8.8 do advogado): a
 * contemplação é imediata, presa ao número na hora da compra — para a SPA/MF
 * é outra modalidade, com plano de operação e taxa próprios. Rifa com sorteio
 * e cota premiada é uma **promoção mista** (sorteio + vale-brinde), aprovada
 * no mesmo processo do SCPC. O painel avisa a promotora antes de sortear as
 * cotas; o regulamento diz isso a quem compra.
 */
export const AVISO_VALE_BRINDE =
  "Cotas premiadas são vale-brinde para a SPA/MF: com o sorteio final, a rifa vira uma promoção mista (sorteio + vale-brinde). Peça a autorização das duas modalidades no mesmo processo do SCPC — o plano de operação e a taxa de fiscalização são próprios. Sem a autorização do vale-brinde, não use cotas premiadas.";

export const CLAUSULA_VALE_BRINDE =
  "As cotas premiadas constituem a modalidade vale-brinde: a contemplação é imediata, revelada no pagamento ao portador do número premiado. Esta é uma promoção mista (sorteio e vale-brinde), autorizada pela SPA/MF nas duas modalidades.";

/**
 * A declaração da promotora (resposta 2.3 do advogado): a rifa autorizada com
 * cota premiada só publica com a declaração de que a autorização da SPA/MF
 * inclui o vale-brinde — além do arquivo da autorização, que já é exigido. O
 * sistema não lê o certificado: a declaração é da promotora, e quem declara
 * responde. Trava ao publicar; depois disso, cota premiada nova na rifa no ar
 * só com a declaração já feita.
 */
export const DECLARACAO_VALE_BRINDE =
  "Declaro que a autorização da SPA/MF anexada inclui a modalidade vale-brinde (as cotas premiadas), no mesmo processo do sorteio.";

export const PROBLEMA_SEM_DECLARACAO_VALE_BRINDE =
  "Esta rifa tem cota premiada: declare em Autorização e sorteio que a autorização da SPA/MF inclui o vale-brinde (ou tire as cotas premiadas)";

export const PROBLEMA_PREMIADA_SEM_DECLARACAO =
  "Esta rifa foi publicada sem a declaração de que a autorização inclui o vale-brinde: ela não pode ter cota premiada.";

/** A rifa autorizada com cota premiada precisa da declaração? (`null` = tudo certo). */
export function problemaDoValeBrinde(r: { metodoApuracao: string | null; declaraValeBrinde: boolean }, temPremiada: boolean): string | null {
  if (!r.metodoApuracao || !temPremiada || r.declaraValeBrinde) return null;
  return PROBLEMA_SEM_DECLARACAO_VALE_BRINDE;
}
