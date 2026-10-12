/**
 * O relógio da reserva vencida: devolve as cotas ao estoque
 * (`releaseExpired`) e fecha a cobrança no provedor.
 *
 * Cobrança de reserva vencida precisa deixar de valer no provedor: o Pix do
 * Asaas vale até o fim do dia, e pagar uma reserva já devolvida ao estoque
 * seria dinheiro sem cota. Melhor esforço — falha aqui não trava o relógio.
 *
 * E a cobrança que o provedor diz **já paga** (o Pix chegou no limite e o
 * webhook não veio, ou se perdeu — no Pagar.me, `cancelCharge` consulta antes
 * de cancelar e devolve `"paga"`) segue pelo caminho do pagamento:
 * `markOrderPaid` vê o pedido vencido e o manda para a fila do Pix tardio.
 * Sem isso, o dinheiro ficaria sem cota e fora de qualquer fila.
 */
import { releaseExpired } from "./quotas";
import { OrderError, markOrderPaid } from "./orders";
import { paymentProviderByName } from "../payments";

export async function cancelarCobrancas(cobrancas: { provider: string; chargeId: string }[]): Promise<{ pagas: number }> {
  let pagas = 0;
  for (const c of cobrancas) {
    try {
      const provider = paymentProviderByName(c.provider);
      const resultado = await provider.cancelCharge?.(c.chargeId);
      if (resultado === "paga") {
        pagas++;
        await markOrderPaid(c.chargeId).catch((err) => {
          // O pedido vencido responde 409 depois de ir para a fila: é o esperado.
          if (!(err instanceof OrderError)) throw err;
        });
      }
    } catch (err) {
      console.error(`[jobs] não cancelou a cobrança ${c.chargeId} (${c.provider}):`, (err as Error).message);
    }
  }
  return { pagas };
}

/** Uma volta do relógio: quantas cotas voltaram e quantas cobranças já estavam pagas. */
export async function expirarReservas(now = new Date()): Promise<{ liberadas: number; pagas: number }> {
  const { liberadas, cobrancas } = await releaseExpired(now);
  const { pagas } = await cancelarCobrancas(cobrancas);
  return { liberadas, pagas };
}
