import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "@shared/schema";

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL não definida. Configure o Postgres antes de subir o servidor.",
  );
}

/**
 * Driver TCP padrão: serve tanto o Postgres local do desenvolvimento quanto
 * o Neon em produção. O servidor é um processo longo (Fly/Railway), então
 * pool de conexões é o que queremos — não o driver serverless.
 */
export const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL.includes("localhost") ||
  process.env.DATABASE_URL.includes("127.0.0.1")
    ? false
    : { rejectUnauthorized: true },
  max: Number(process.env.PG_POOL_MAX ?? 10),
});

export const db = drizzle(pool, { schema });
export { schema };
