/**
 * Roda antes do `drizzle-kit push` (`npm run db:push`): as extensões do
 * Postgres que o schema usa. O `drizzle-kit` não cria extensão, e sem a
 * `pg_trgm` os índices de trigrama da busca (`gin_trgm_ops`) fazem o push
 * inteiro falhar — e com ele o deploy. `IF NOT EXISTS`: rodar de novo não
 * faz nada.
 */
import "dotenv/config";
import pg from "pg";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL, ensure the database is provisioned");

const cliente = new pg.Client({ connectionString: url });
await cliente.connect();
try {
  await cliente.query("CREATE EXTENSION IF NOT EXISTS pg_trgm");
  console.log("[extensoes] pg_trgm pronta");
} finally {
  await cliente.end();
}
