/**
 * Prova dos relógios contra o Postgres de verdade: muitos relógios
 * disparando no mesmo instante (a cada 15 min são uns 12) não podem prender
 * o pool de conexões do servidor.
 *
 * Foi assim que a produção parou: cada relógio pegava uma conexão do pool
 * comum só para a trava (`pg_try_advisory_lock`, que é de sessão) e pedia
 * outra ao mesmo pool para trabalhar. Com 12 juntos e 10 conexões, todas
 * ficavam presas esperando a 11ª — e toda rota com banco esperava para
 * sempre ("Carregando rifas…" no aparelho).
 *
 *   npm run relogios     (só o banco: não precisa do servidor no ar)
 */
import "dotenv/config";
import pg from "pg";
import { withLock } from "../server/jobs";
import { pool, poolDasTravas } from "../server/db";

let falhas = 0;
const checa = (n: string, ok: boolean, d = "") => {
  console.log(`  ${ok ? "✓" : "✗"} ${n}${d ? ` (${d})` : ""}`);
  if (!ok) falhas++;
};

const RELOGIOS = 12;
const PRAZO_MS = 10_000;

/** Dispara `RELOGIOS` relógios juntos; cada um trabalha pelo `comum`. */
async function dispararJuntos(comum: pg.Pool, travas: pg.Pool, chave: number) {
  let feitos = 0;
  const todos = Array.from({ length: RELOGIOS }, (_, i) =>
    withLock(
      chave + i,
      async () => {
        await comum.query("select pg_sleep(0.05)");
        feitos++;
      },
      travas,
    ),
  );
  const resultado = await Promise.race([
    Promise.all(todos).then(() => "terminou" as const),
    new Promise<"travou">((r) => setTimeout(() => r("travou"), PRAZO_MS)),
  ]);
  return { resultado, feitos };
}

async function main() {
  const url = process.env.DATABASE_URL!;

  console.log("\n  o defeito (trava e trabalho no mesmo pool de 10):");
  // Sem prazo de conexão, como era: o que se mede é a espera sem fim.
  const mesmo = new pg.Pool({ connectionString: url, max: 10 });
  const antes = await dispararJuntos(mesmo, mesmo, 912_000);
  checa(`com um pool só, ${RELOGIOS} relógios juntos travam`, antes.resultado === "travou", `${antes.feitos} terminaram`);

  console.log("\n  a correção (pool das travas à parte):");
  const comum = new pg.Pool({ connectionString: url, max: 10 });
  // Outras chaves: as do defeito seguem presas nas conexões que travaram.
  const depois = await dispararJuntos(comum, poolDasTravas, 913_000);
  checa(`${RELOGIOS} relógios juntos terminam`, depois.resultado === "terminou" && depois.feitos === RELOGIOS, `${depois.feitos} de ${RELOGIOS}`);
  checa("nenhuma conexão do pool comum ficou presa", comum.waitingCount === 0 && comum.idleCount === comum.totalCount);
  const { rows } = await comum.query("select count(*)::int as n from pg_locks where locktype = 'advisory' and objid between 913000 and 913099");
  checa("as travas foram devolvidas", rows[0].n === 0, `${rows[0].n} presas`);

  // O pool de verdade do servidor: sem conexão, a requisição falha com prazo
  // em vez de esperar para sempre.
  checa("o pool do servidor tem prazo para conseguir conexão", Number((pool as unknown as { options: { connectionTimeoutMillis?: number } }).options.connectionTimeoutMillis) > 0);

  await comum.end();
  // O pool do defeito tem conexões presas de propósito: não espera devolver.
  void mesmo.end().catch(() => {});
}

main()
  .catch((e) => {
    console.error(e);
    falhas++;
  })
  .finally(async () => {
    await Promise.allSettled([pool.end(), poolDasTravas.end()]);
    console.log(falhas ? `\n  ${falhas} falha(s)` : "\n  tudo certo");
    process.exit(falhas ? 1 : 0);
  });
