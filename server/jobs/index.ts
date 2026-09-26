import { and, eq, sql, gt, lt } from "drizzle-orm";
import { db } from "../db";
import { commissions, orders, buyers, campaigns } from "@shared/schema";
import { notify } from "../notifications";
import { publicUrl } from "../services/urls";
import { purgeRateEvents } from "../services/antifraude";
import { preencherCodigosDeCliente } from "../services/codigoCliente";
import { separarCidadesAntigas } from "../services/orgs";
import { avisarSorteiosChegando } from "../services/push";
import { completarRegioesPendentes } from "../services/contaComprador";
import { apagarStoriesVencidos } from "../services/vitrine";
import { migrarAfiliadosAntigos } from "../services/afiliados";
import { lancarMensalidades } from "../services/billing";
import { releaseExpired } from "../services/quotas";
import { paymentProviderByName } from "../payments";
import { log } from "../vite";
import { pool } from "../db";

/**
 * Trava de aplicação no Postgres: com duas réplicas, os dois processos
 * acordam no mesmo minuto e o mesmo job roda duas vezes. A trava é do banco,
 * então não importa quantos processos existam — só um passa.
 */
async function withLock(key: number, fn: () => Promise<void>) {
  const client = await pool.connect();
  try {
    const { rows } = await client.query("SELECT pg_try_advisory_lock($1) AS locked", [key]);
    if (!rows[0]?.locked) return;
    try {
      await fn();
    } finally {
      await client.query("SELECT pg_advisory_unlock($1)", [key]);
    }
  } finally {
    client.release();
  }
}

const LOCK_EXPIRACAO = 811_001;
const LOCK_COMISSAO = 811_002;
const LOCK_LEMBRETE = 811_003;
const LOCK_LIMPEZA = 811_004;
const LOCK_STORIES = 811_010;
const LOCK_AFILIADOS = 811_011;
const LOCK_MENSALIDADE = 811_005;
const LOCK_CODIGOS = 811_006;
const LOCK_CIDADES = 811_007;
const LOCK_PUSH_SORTEIO = 811_008;
const LOCK_REGIOES = 811_009;

/** Quantos minutos antes de a reserva cair o lembrete é enviado. */
const LEMBRETE_MINUTOS = Number(process.env.REMINDER_MINUTES_BEFORE ?? 5);

/**
 * Carrinho abandonado: quem reservou e não pagou recebe um empurrão antes
 * de perder os números. A chave de deduplicação garante um lembrete por
 * pedido, não um por minuto.
 */
async function lembrarReservasVencendo() {
  const now = new Date();
  const limite = new Date(now.getTime() + LEMBRETE_MINUTOS * 60_000);

  const pendentes = await db
    .select({
      order: orders,
      buyer: buyers,
      campaignTitle: campaigns.title,
    })
    .from(orders)
    .innerJoin(buyers, eq(buyers.id, orders.buyerId))
    .innerJoin(campaigns, eq(campaigns.id, orders.campaignId))
    .where(
      and(
        eq(orders.status, "pending"),
        gt(orders.expiresAt, now),
        lt(orders.expiresAt, limite),
      ),
    )
    .limit(200);

  let enviados = 0;
  for (const row of pendentes) {
    const restam = Math.max(
      1,
      Math.round((row.order.expiresAt!.getTime() - now.getTime()) / 60_000),
    );
    const ok = await notify({
      to: row.buyer.phone,
      template: "reserva_expirando",
      params: {
        nome: row.buyer.name.split(" ")[0],
        rifa: row.campaignTitle,
        minutos: String(restam),
        link: publicUrl(`/pedido/${row.order.code}`),
      },
      dedupeKey: `order:${row.order.id}:reserva_expirando`,
    });
    if (ok) enviados++;
  }
  return enviados;
}

/**
 * Cobrança de reserva vencida precisa deixar de valer no provedor: o Pix do
 * Asaas vale até o fim do dia, e pagar uma reserva já devolvida ao estoque
 * seria dinheiro sem cota. Melhor esforço — falha aqui não trava o relógio;
 * se o pagamento ainda assim chegar, o webhook recusa o pedido expirado e o
 * caso aparece no log para devolução.
 */
async function cancelarCobrancas(cobrancas: { provider: string; chargeId: string }[]) {
  for (const c of cobrancas) {
    try {
      const provider = paymentProviderByName(c.provider);
      await provider.cancelCharge?.(c.chargeId);
    } catch (err) {
      console.error(`[jobs] não cancelou a cobrança ${c.chargeId} (${c.provider}):`, (err as Error).message);
    }
  }
}

/**
 * Dois relógios. A expiração de reserva é o que devolve número ao estoque —
 * sem ela, cota reservada e não paga some da rifa.
 */
export function startJobs() {
  const expiryMs = 60_000;
  const releaseMs = 15 * 60_000;

  setInterval(async () => {
    try {
      await withLock(LOCK_EXPIRACAO, async () => {
        const { liberadas, cobrancas } = await releaseExpired();
        if (liberadas > 0) log(`${liberadas} cota(s) voltaram ao estoque`, "jobs");
        await cancelarCobrancas(cobrancas);
      });
    } catch (err) {
      console.error("[jobs] expiração de reservas:", err);
    }
  }, expiryMs).unref();

  setInterval(async () => {
    try {
      await withLock(LOCK_LEMBRETE, async () => {
        const enviados = await lembrarReservasVencendo();
        if (enviados > 0) log(`${enviados} lembrete(s) de reserva enviados`, "jobs");
      });
    } catch (err) {
      console.error("[jobs] lembrete de reserva:", err);
    }
  }, expiryMs).unref();

  // ID do cliente de quem comprou antes de o ID existir: o painel do
  // organizador mostra cliente da plataforma só por ele. Lotes pequenos até
  // zerar; depois cada rodada não encontra ninguém.
  setInterval(async () => {
    try {
      await withLock(LOCK_CODIGOS, async () => {
        const n = await preencherCodigosDeCliente();
        if (n > 0) log(`${n} ID(s) de cliente gerados`, "jobs");
      });
    } catch (err) {
      console.error("[jobs] IDs de cliente:", err);
    }
  }, releaseMs).unref();

  // Contas criadas com o serviço de CEP fora do ar: completa cidade e UF.
  setInterval(async () => {
    try {
      await withLock(LOCK_REGIOES, async () => {
        const n = await completarRegioesPendentes();
        if (n > 0) log(`${n} conta(s) com cidade completada pelo CEP`, "jobs");
      });
    } catch (err) {
      console.error("[jobs] região pelo CEP:", err);
    }
  }, releaseMs).unref();

  // Sorteio chegando: 24 h e 1 h antes, uma vez por pessoa (a chave do
  // aviso leva a janela). A trava garante uma réplica só.
  setInterval(async () => {
    try {
      await withLock(LOCK_PUSH_SORTEIO, async () => {
        const n = await avisarSorteiosChegando();
        if (n > 0) log(`${n} aviso(s) de sorteio chegando`, "jobs");
      });
    } catch (err) {
      console.error("[jobs] aviso de sorteio:", err);
    }
  }, expiryMs).unref();

  // Cadastro antigo com "Cidade/UF" num campo só: separa uma vez, para a
  // vitrine ordenar por estado sem esperar o organizador preencher tudo.
  setTimeout(async () => {
    try {
      await withLock(LOCK_CIDADES, async () => {
        const n = await separarCidadesAntigas();
        if (n > 0) log(`${n} organização(ões) com cidade e UF separadas`, "jobs");
      });
    } catch (err) {
      console.error("[jobs] cidades antigas:", err);
    }
  }, 5_000).unref();

  // Afiliado de antes dos vínculos (organização no usuário): cria o vínculo,
  // e a organização dos cupons e saques antigos. Idempotente.
  const migrarAfiliados = async () => {
    try {
      await withLock(LOCK_AFILIADOS, async () => {
        const n = await migrarAfiliadosAntigos();
        if (n > 0) log(`${n} afiliado(s) antigo(s) com vínculo criado`, "jobs");
      });
    } catch (err) {
      console.error("[jobs] vínculos de afiliados antigos:", err);
    }
  };
  setTimeout(migrarAfiliados, 3_000).unref();
  setInterval(migrarAfiliados, releaseMs).unref();

  // Stories vencidos (24 h): a rota já não serve, e o relógio tira do banco.
  setInterval(async () => {
    try {
      await withLock(LOCK_STORIES, async () => {
        const n = await apagarStoriesVencidos();
        if (n > 0) log(`${n} story(ies) vencido(s) apagado(s)`, "jobs");
      });
    } catch (err) {
      console.error("[jobs] stories vencidos:", err);
    }
  }, releaseMs).unref();

  setInterval(async () => {
    try {
      await withLock(LOCK_LIMPEZA, async () => {
        const apagados = await purgeRateEvents();
        if (apagados > 0) log(`${apagados} registro(s) de ritmo limpos`, "jobs");
      });
    } catch (err) {
      console.error("[jobs] limpeza do antifraude:", err);
    }
  }, releaseMs).unref();

  setInterval(async () => {
    try {
      await withLock(LOCK_COMISSAO, async () => {
        const rows = await db
          .update(commissions)
          .set({ status: "available" })
          .where(
            and(eq(commissions.status, "pending"), sql`${commissions.availableAt} <= now()`),
          )
          .returning({ id: commissions.id });
        if (rows.length > 0) log(`${rows.length} comissão(ões) liberadas`, "jobs");
      });
    } catch (err) {
      console.error("[jobs] liberação de comissões:", err);
    }
  }, releaseMs).unref();

  // Mensalidade: lança a competência do mês anterior para quem está nesse
  // contrato. É idempotente pelo índice (organização, competência), então
  // rodar junto com os outros relógios não cobra duas vezes — e não precisa
  // de um agendador de mês, que seria mais uma peça para dar errado.
  setInterval(async () => {
    try {
      await withLock(LOCK_MENSALIDADE, async () => {
        const lancadas = await lancarMensalidades();
        if (lancadas > 0) log(`${lancadas} mensalidade(s) lançadas`, "jobs");
      });
    } catch (err) {
      console.error("[jobs] mensalidades:", err);
    }
  }, releaseMs).unref();
}
