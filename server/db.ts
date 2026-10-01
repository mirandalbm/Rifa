import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "@shared/schema";
import { sslConfigFor } from "./dbSsl";

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL não definida. Configure o Postgres antes de subir o servidor.",
  );
}

/**
 * Driver TCP padrão: serve tanto o Postgres local do desenvolvimento quanto
 * o Neon ou o Railway em produção (o TLS de cada um sai de `sslConfigFor`).
 * O servidor é um processo longo (Fly/Railway), então
 * pool de conexões é o que queremos — não o driver serverless.
 */
export const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: sslConfigFor(process.env.DATABASE_URL),
  max: Number(process.env.PG_POOL_MAX ?? 10),
  // Sem prazo, uma requisição que não consegue conexão espera para sempre —
  // e o aparelho fica em "Carregando rifas…". Com prazo, ela falha (500) e o
  // servidor segue atendendo as outras.
  connectionTimeoutMillis: Number(process.env.PG_CONNECT_TIMEOUT_MS ?? 15_000),
  // A conexão que a rede derrubou calada (troca de rota, DNS do Railway) é
  // descoberta pelo keepalive em vez de ficar pendurada.
  keepAlive: true,
});

/**
 * As travas dos relógios (`pg_try_advisory_lock`) moram num pool **só
 * delas**. A trava é de sessão: a conexão fica presa enquanto o relógio
 * trabalha, e o trabalho usa o `pool` comum. Com as duas no mesmo pool, os
 * relógios que disparam juntos (a cada 15 min são uns 12) pegavam as 10
 * conexões só para as travas e esperavam para sempre por uma 11ª para
 * trabalhar — o servidor parava de responder qualquer rota com banco.
 * Uma conexão por trava cabe com folga (são 14).
 */
export const poolDasTravas = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: sslConfigFor(process.env.DATABASE_URL),
  max: Number(process.env.PG_LOCK_POOL_MAX ?? 16),
  connectionTimeoutMillis: Number(process.env.PG_CONNECT_TIMEOUT_MS ?? 15_000),
  keepAlive: true,
});

export const db = drizzle(pool, { schema });
export { schema };
