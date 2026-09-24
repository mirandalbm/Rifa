/**
 * Teste de carga: compradores simultâneos disputando cota numa campanha de
 * 1.000.000 (docs/PLANO-RIFA.md, Fase 4).
 *
 * O caso que interessa não é vender com a rifa vazia — sobra número, ninguém
 * colide. O caso que interessa é a **reta final**: a campanha acima de 85%,
 * já no pool de endgame, com todo mundo brigando pelas mesmas cotas que
 * restam. É ali que uma trava frouxa vende o mesmo número duas vezes.
 *
 *   npm run load -- --buyers 500 --quotas 5 --prefill 0.9
 */
import "dotenv/config";
import { baseUrl } from "./base-url";
import { sql, eq } from "drizzle-orm";
import { db, pool } from "../server/db";
import { campaigns, campaignStats, quotaAlloc, orders, appSettings } from "../shared/schema";
import { enterEndgame, ENDGAME_THRESHOLD } from "../server/services/quotas";
import { DEFAULT_LIMITS } from "../shared/antifraude";

interface Opcoes {
  url: string;
  slug: string;
  buyers: number;
  quotas: number;
  prefill: number;
}

function lerOpcoes(): Opcoes {
  const args = process.argv.slice(2);
  const valor = (nome: string, padrao: string) => {
    const i = args.indexOf(`--${nome}`);
    return i >= 0 && args[i + 1] ? args[i + 1] : padrao;
  };
  return {
    url: valor("url", baseUrl([])),
    slug: valor("slug", "pix-de-1-milhao"),
    buyers: Number(valor("buyers", "500")),
    quotas: Number(valor("quotas", "5")),
    prefill: Number(valor("prefill", "0.9")),
  };
}

/** Marca cotas como vendidas direto no banco, simulando a venda anterior. */
async function preencher(campaignId: string, total: number, ate: number) {
  const alvo = Math.floor(total * ate);
  const [atual] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(quotaAlloc)
    .where(eq(quotaAlloc.campaignId, campaignId));

  if (atual.n >= alvo) return atual.n;

  process.stdout.write(
    `  preenchendo até ${alvo.toLocaleString("pt-BR")} cotas vendidas… `,
  );
  const inicio = Date.now();

  // Pedido sintético: quota_alloc exige order_id, e estas cotas representam
  // vendas que já teriam acontecido antes do teste.
  const pedidoFalso = "00000000-0000-4000-8000-000000000001";

  await db.execute(sql`
    INSERT INTO quota_alloc (campaign_id, number, status, order_id)
    SELECT ${campaignId}::uuid, g, 'paid', ${pedidoFalso}::uuid
    FROM generate_series(1, ${alvo}) AS g
    ON CONFLICT DO NOTHING
  `);

  // O preenchimento escreve direto em quota_alloc, fora do caminho de
  // alocação — então o pool precisa ser reconciliado aqui, senão o teste
  // simula um estado que o app sozinho nunca produziria.
  await db.execute(sql`
    DELETE FROM free_pool f USING quota_alloc a
    WHERE a.campaign_id = f.campaign_id
      AND a.number = f.number
      AND f.campaign_id = ${campaignId}::uuid
  `);

  // O contador tem que refletir o que está no banco, não o alvo: se rodadas
  // anteriores já venderam cotas ACIMA da linha de preenchimento, gravar o
  // alvo apagaria essas vendas da conta e o teste acusaria um furo que é dele.
  const [pagas] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(quotaAlloc)
    .where(
      sql`${quotaAlloc.campaignId} = ${campaignId}::uuid AND ${quotaAlloc.status} = 'paid'`,
    );

  await db
    .update(campaignStats)
    .set({ soldCount: pagas.n, updatedAt: new Date() })
    .where(eq(campaignStats.campaignId, campaignId));

  console.log(`${((Date.now() - inicio) / 1000).toFixed(1)}s`);
  return pagas.n;
}

interface Resultado {
  ok: boolean;
  status: number;
  ms: number;
  motivo?: string;
  cotas?: number;
}

async function comprar(
  opcoes: Opcoes,
  campaignId: string,
  indice: number,
): Promise<Resultado> {
  const inicio = Date.now();
  try {
    const criar = await fetch(`${opcoes.url}/api/public/orders`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        // Cada comprador simulado é um celular diferente, como na rua.
        // Sem isto o teste mediria o limite de aparelho, não o motor.
        "x-device-id": `carga-${indice}`,
      },
      body: JSON.stringify({
        campaignId,
        quantity: opcoes.quotas,
        buyer: {
          name: `Comprador ${indice}`,
          // Telefone único por comprador: senão todos viram o mesmo cadastro.
          phone: `11${String(900000000 + indice).slice(0, 9)}`,
        },
      }),
    });

    const corpo = (await criar.json()) as {
      code?: number;
      numbers?: number[];
      message?: string;
    };

    if (!criar.ok) {
      return {
        ok: false,
        status: criar.status,
        ms: Date.now() - inicio,
        motivo: corpo.message,
      };
    }

    await fetch(`${opcoes.url}/api/dev/pay/${corpo.code}`, { method: "POST" });

    return {
      ok: true,
      status: 201,
      ms: Date.now() - inicio,
      cotas: corpo.numbers?.length ?? 0,
    };
  } catch (erro) {
    return {
      ok: false,
      status: 0,
      ms: Date.now() - inicio,
      motivo: (erro as Error).message,
    };
  }
}

/**
 * O teste sai todo do mesmo IP, e o antifraude — com razão — recusa isso.
 *
 * A bancada mede o motor de alocação, não o antifraude (esse tem prova
 * própria em tests/antifraude.test.ts e no painel). Então afrouxamos **só** o
 * limite por IP enquanto o teste roda e devolvemos a configuração de antes,
 * inclusive se o teste estourar no meio. Nada mais é tocado: o limite de
 * reserva em aberto, que é o que de fato protege o estoque, continua valendo.
 */
const CHAVE_LIMITES = "antifraude";

async function afrouxarIp(buyers: number) {
  const [antes] = await db
    .select()
    .from(appSettings)
    .where(eq(appSettings.key, CHAVE_LIMITES));

  const base = (antes?.value as Record<string, unknown> | undefined) ?? DEFAULT_LIMITS;
  const folga = Math.min(5_000, Math.max(100, buyers * 3));

  await db
    .insert(appSettings)
    .values({ key: CHAVE_LIMITES, value: { ...base, ordersPerIp: folga } })
    .onConflictDoUpdate({
      target: appSettings.key,
      set: { value: { ...base, ordersPerIp: folga }, updatedAt: new Date() },
    });

  console.log(`  antifraude: limite por IP em ${folga} durante a bancada`);

  return async function restaurar() {
    if (antes) {
      await db
        .update(appSettings)
        .set({ value: antes.value, updatedAt: new Date() })
        .where(eq(appSettings.key, CHAVE_LIMITES));
    } else {
      // Não existia linha: o app estava nos padrões. Voltar a não existir.
      await db.delete(appSettings).where(eq(appSettings.key, CHAVE_LIMITES));
    }
  };
}

function percentil(valores: number[], p: number): number {
  if (valores.length === 0) return 0;
  const ordenado = [...valores].sort((a, b) => a - b);
  return ordenado[Math.min(ordenado.length - 1, Math.floor((p / 100) * ordenado.length))];
}

/** As perguntas que o teste existe para responder. */
async function conferirInvariantes(campaignId: string, total: number) {
  const [linhas] = await db
    .select({
      total: sql<number>`count(*)::int`,
      distintas: sql<number>`count(distinct ${quotaAlloc.number})::int`,
      pagas: sql<number>`count(*) FILTER (WHERE ${quotaAlloc.status} = 'paid')::int`,
      reservadas: sql<number>`count(*) FILTER (WHERE ${quotaAlloc.status} = 'reserved')::int`,
      foraDaFaixa: sql<number>`count(*) FILTER (WHERE ${quotaAlloc.number} < 1 OR ${quotaAlloc.number} > ${total})::int`,
    })
    .from(quotaAlloc)
    .where(eq(quotaAlloc.campaignId, campaignId));

  const [stats] = await db
    .select()
    .from(campaignStats)
    .where(eq(campaignStats.campaignId, campaignId));

  const [pedidos] = await db
    .select({
      cotasVendidas: sql<number>`coalesce(sum(${orders.quantity}) FILTER (WHERE ${orders.status} = 'paid'), 0)::int`,
    })
    .from(orders)
    .where(eq(orders.campaignId, campaignId));

  // O pool não pode oferecer cota que já saiu: foi exatamente assim que a
  // escolha manual no mapa passou a derrubar a compra rápida na reta final.
  const [poolSujo] = await db.execute(sql`
    SELECT count(*)::int AS n
    FROM free_pool f
    JOIN quota_alloc a ON a.campaign_id = f.campaign_id AND a.number = f.number
    WHERE f.campaign_id = ${campaignId}::uuid
  `).then((r) => r.rows as { n: number }[]);

  const checagens = [
    {
      nome: "pool não oferece cota já vendida",
      ok: poolSujo.n === 0,
      detalhe: `${poolSujo.n} número(s) no pool já tomados`,
    },
    {
      nome: "nenhuma cota vendida duas vezes",
      ok: linhas.total === linhas.distintas,
      detalhe: `${linhas.total} linhas, ${linhas.distintas} números distintos`,
    },
    {
      nome: "nenhuma cota fora da faixa da campanha",
      ok: linhas.foraDaFaixa === 0,
      detalhe: `${linhas.foraDaFaixa} fora de 1..${total.toLocaleString("pt-BR")}`,
    },
    {
      nome: "contador de vendidas bate com as linhas pagas",
      ok: stats.soldCount === linhas.pagas,
      detalhe: `contador ${stats.soldCount}, linhas ${linhas.pagas}`,
    },
    {
      nome: "contador de reservadas bate com as linhas reservadas",
      ok: stats.reservedCount === linhas.reservadas,
      detalhe: `contador ${stats.reservedCount}, linhas ${linhas.reservadas}`,
    },
    {
      nome: "não vendeu mais cotas do que a campanha tem",
      ok: linhas.total <= total,
      detalhe: `${linhas.total} de ${total.toLocaleString("pt-BR")}`,
    },
  ];

  return { checagens, linhas, stats, pedidos };
}

async function main() {
  const opcoes = lerOpcoes();
  console.log("\n=== teste de carga ===");
  console.log(
    `  ${opcoes.buyers} compradores simultâneos · ${opcoes.quotas} cotas cada · rifa ${opcoes.slug}\n`,
  );

  const [campanha] = await db
    .select()
    .from(campaigns)
    .where(eq(campaigns.slug, opcoes.slug));
  if (!campanha) throw new Error(`Campanha ${opcoes.slug} não encontrada.`);

  const vendidas = await preencher(campanha.id, campanha.totalQuotas, opcoes.prefill);
  const ocupacao = vendidas / campanha.totalQuotas;
  console.log(
    `  campanha: ${campanha.totalQuotas.toLocaleString("pt-BR")} cotas, ${(ocupacao * 100).toFixed(1)}% ocupada`,
  );

  if (ocupacao >= ENDGAME_THRESHOLD) {
    process.stdout.write("  materializando o pool de endgame… ");
    const inicio = Date.now();
    await enterEndgame(campanha.id, campanha.totalQuotas);
    console.log(`${((Date.now() - inicio) / 1000).toFixed(1)}s`);
  }

  const restaurarAntifraude = await afrouxarIp(opcoes.buyers);

  console.log("\n  disparando…");
  const inicio = Date.now();
  let resultados: Resultado[];
  let duracao: number;
  try {
    resultados = await Promise.all(
      Array.from({ length: opcoes.buyers }, (_, i) => comprar(opcoes, campanha.id, i)),
    );
    duracao = Date.now() - inicio;
  } finally {
    await restaurarAntifraude();
  }

  const sucessos = resultados.filter((r) => r.ok);
  const semCota = resultados.filter((r) => !r.ok && r.status === 409);
  const erros = resultados.filter((r) => !r.ok && r.status !== 409);
  const latencias = resultados.map((r) => r.ms);

  console.log(`\n  ${duracao}ms no total · ${(opcoes.buyers / (duracao / 1000)).toFixed(0)} compras/s`);
  console.log(`  sucesso: ${sucessos.length} · sem cota: ${semCota.length} · erro: ${erros.length}`);
  console.log(
    `  latência  p50 ${percentil(latencias, 50)}ms · p95 ${percentil(latencias, 95)}ms · p99 ${percentil(latencias, 99)}ms · máx ${Math.max(...latencias)}ms`,
  );

  if (erros.length > 0) {
    const motivos = new Map<string, number>();
    for (const e of erros) {
      const chave = `${e.status} ${e.motivo ?? ""}`.trim();
      motivos.set(chave, (motivos.get(chave) ?? 0) + 1);
    }
    console.log("\n  erros:");
    for (const [motivo, n] of motivos) console.log(`    ${n}x ${motivo}`);
  }

  console.log("\n  conferindo o que ficou no banco:");
  const { checagens, linhas } = await conferirInvariantes(
    campanha.id,
    campanha.totalQuotas,
  );
  for (const c of checagens) {
    console.log(`    ${c.ok ? "✓" : "✗"} ${c.nome} (${c.detalhe})`);
  }
  console.log(
    `\n  cotas tomadas ao final: ${linhas.total.toLocaleString("pt-BR")} de ${campanha.totalQuotas.toLocaleString("pt-BR")}`,
  );

  const falhou = checagens.some((c) => !c.ok);
  await pool.end();
  process.exit(falhou ? 1 : 0);
}

main().catch(async (err) => {
  console.error(err);
  await pool.end().catch(() => {});
  process.exit(1);
});
