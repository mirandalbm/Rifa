/**
 * O relógio da reserva vencida: devolve as cotas ao estoque
 * (`releaseExpired`) e fecha a cobrança no provedor.
 *
 * Cobrança de reserva vencida precisa deixar de valer no provedor: o Pix do
 * Asaas vale até o fim do dia, e pagar uma reserva já devolvida ao estoque
 * seria dinheiro sem cota. Melhor esforço — falha ao cancelar não trava o
 * relógio.
 *
 * E a cobrança que o provedor diz **já paga** (o Pix chegou no limite e o
 * webhook não veio, ou se perdeu — no Pagar.me, `cancelCharge` consulta antes
 * de cancelar e devolve `"paga"`) segue pelo caminho do pagamento:
 * `markOrderPaid` vê o pedido vencido e o manda para a fila do Pix tardio.
 *
 * **Segunda chance**: a reserva já voltou ao estoque quando o provedor diz
 * "paga", então a volta seguinte não a encontraria de novo. Por isso a
 * cobrança paga é **anotada antes** (`cobrancas_pagas_a_conferir` em
 * `app_settings`, durável) e só sai da lista depois que o Pix foi para a
 * fila; o banco que falhar no meio deixa a anotação, e a volta seguinte (a
 * cada minuto) tenta de novo. Se nem a anotação gravar, ela fica na memória
 * do processo até gravar ou o Pix entrar na fila.
 */
import { sql } from "drizzle-orm";
import { db } from "../db";
import { releaseExpired } from "./quotas";
import { OrderError, markOrderPaid } from "./orders";
import { paymentProviderByName } from "../payments";

export const CHAVE_DAS_PAGAS_A_CONFERIR = "cobrancas_pagas_a_conferir";

type Cobranca = { provider: string; chargeId: string };

/** As anotadas que não conseguiram nem ir para o banco. */
const naMemoria = new Map<string, Cobranca>();

async function anotar(c: Cobranca) {
  const item = JSON.stringify([{ provider: c.provider, chargeId: c.chargeId }]);
  try {
    await db.execute(sql`
      INSERT INTO app_settings (key, value, updated_at)
      VALUES (${CHAVE_DAS_PAGAS_A_CONFERIR}, ${item}::jsonb, now())
      ON CONFLICT (key) DO UPDATE SET
        value = CASE
          WHEN app_settings.value @> ${item}::jsonb THEN app_settings.value
          ELSE app_settings.value || ${item}::jsonb
        END,
        updated_at = now()
    `);
  } catch (err) {
    naMemoria.set(c.chargeId, c);
    console.error(`[jobs] cobrança paga ${c.chargeId} (${c.provider}) não anotada no banco, fica na memória até a próxima volta:`, (err as Error).message);
  }
}

async function tirarDaLista(chargeId: string) {
  naMemoria.delete(chargeId);
  await db.execute(sql`
    UPDATE app_settings
    SET value = coalesce((SELECT jsonb_agg(e) FROM jsonb_array_elements(value) e WHERE e->>'chargeId' <> ${chargeId}), '[]'::jsonb),
        updated_at = now()
    WHERE key = ${CHAVE_DAS_PAGAS_A_CONFERIR}
  `);
}

async function anotadas(): Promise<Cobranca[]> {
  const lista = new Map(naMemoria);
  try {
    const { rows } = await db.execute(sql`SELECT value FROM app_settings WHERE key = ${CHAVE_DAS_PAGAS_A_CONFERIR}`);
    const valor = (rows[0] as { value?: unknown } | undefined)?.value;
    for (const x of Array.isArray(valor) ? valor : []) {
      const c = x as Partial<Cobranca>;
      if (typeof c?.provider === "string" && typeof c?.chargeId === "string") lista.set(c.chargeId, { provider: c.provider, chargeId: c.chargeId });
    }
  } catch (err) {
    console.error("[jobs] não li as cobranças pagas a conferir:", (err as Error).message);
  }
  return [...lista.values()];
}

/**
 * Leva à fila do Pix tardio cada cobrança paga anotada. Só tira da lista
 * depois de `markOrderPaid` terminar (o `OrderError` do pedido vencido é o
 * fim esperado: a linha já está na fila); erro do banco deixa para a volta
 * seguinte.
 */
export async function conferirCobrancasPagas(): Promise<{ resolvidas: number; pendentes: number }> {
  let resolvidas = 0;
  let pendentes = 0;
  for (const c of await anotadas()) {
    try {
      await markOrderPaid(c.chargeId).catch((err) => {
        if (!(err instanceof OrderError)) throw err;
      });
      await tirarDaLista(c.chargeId);
      resolvidas++;
    } catch (err) {
      pendentes++;
      console.error(
        `[jobs] Pix pago da cobrança ${c.chargeId} (${c.provider}) ainda não foi para a fila do Pix tardio; tento de novo na próxima volta:`,
        (err as Error).message,
      );
    }
  }
  return { resolvidas, pendentes };
}

export async function cancelarCobrancas(cobrancas: Cobranca[]): Promise<{ pagas: number }> {
  let pagas = 0;
  for (const c of cobrancas) {
    let resultado: void | "paga";
    try {
      const provider = paymentProviderByName(c.provider);
      resultado = await provider.cancelCharge?.(c.chargeId);
    } catch (err) {
      console.error(`[jobs] não cancelou a cobrança ${c.chargeId} (${c.provider}):`, (err as Error).message);
      continue;
    }
    if (resultado === "paga") {
      pagas++;
      // Anotada antes de tentar a fila: se o banco falhar no meio, a volta
      // seguinte tenta de novo (`conferirCobrancasPagas`).
      await anotar(c);
    }
  }
  return { pagas };
}

/** Uma volta do relógio: quantas cotas voltaram e quantas cobranças já estavam pagas. */
export async function expirarReservas(now = new Date()): Promise<{ liberadas: number; pagas: number }> {
  const { liberadas, cobrancas } = await releaseExpired(now);
  const { pagas } = await cancelarCobrancas(cobrancas);
  // As desta volta e as que ficaram das voltas anteriores.
  await conferirCobrancasPagas();
  return { liberadas, pagas };
}
