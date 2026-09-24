/**
 * Cria o administrador geral — e só ele. É o primeiro passo depois de subir
 * em produção, onde o `db:seed` não serve: ele cria rifas de exemplo e usa
 * senha padrão conhecida.
 *
 *   ADMIN_EMAIL=voce@exemplo.com ADMIN_PASSWORD='uma senha longa' npm run admin:create
 *
 * Idempotente: se o e-mail já existe, não mexe em nada. Para trocar a senha
 * de quem já existe, acrescente `-- --reset-password`. Com `--if-configured`
 * (como no deploy do Railway), sem ADMIN_EMAIL definido ele sai sem erro.
 */
import "dotenv/config";
import { eq } from "drizzle-orm";
import { db } from "../server/db";
import { users } from "../shared/schema";
import { hashPassword } from "../server/auth";

const MIN_PASSWORD = 12;

function fail(message: string): never {
  console.error(`\n  ✗ ${message}\n`);
  process.exit(1);
}

async function main() {
  const email = (process.env.ADMIN_EMAIL ?? "").toLowerCase().trim();
  const password = process.env.ADMIN_PASSWORD ?? "";
  const name = (process.env.ADMIN_NAME ?? "Administrador geral").trim();
  const reset = process.argv.includes("--reset-password");

  // No deploy do Railway este comando roda sempre, logo depois do db:push.
  // Sem ADMIN_EMAIL configurado não há nada a fazer — e isso não pode
  // derrubar a publicação.
  if (process.argv.includes("--if-configured") && !email) {
    console.log("  ADMIN_EMAIL não definido: nenhum administrador a criar.");
    process.exit(0);
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    fail("Defina ADMIN_EMAIL com um e-mail válido.");
  }
  // Quem já existe é conferido ANTES da senha: depois do primeiro deploy a
  // orientação é apagar ADMIN_PASSWORD, e o deploy seguinte não pode falhar
  // por falta de uma senha que não vai usar.
  const [existing] = await db.select().from(users).where(eq(users.email, email));
  if (existing && !reset) {
    console.log(`\n  ${email} já existe (${existing.role}). Nada foi alterado.`);
    console.log("  Para trocar a senha: npm run admin:create -- --reset-password\n");
    process.exit(0);
  }

  // O painel do administrador alcança o caixa de todas as organizações: a
  // senha dele não pode ser a do seed nem algo curto.
  if (password.length < MIN_PASSWORD) {
    fail(`Defina ADMIN_PASSWORD com pelo menos ${MIN_PASSWORD} caracteres.`);
  }
  if (["admin123", "senha123", "123456789012"].includes(password)) {
    fail("Essa senha é conhecida demais. Escolha outra.");
  }

  if (existing) {
    if (existing.role !== "admin") {
      fail(`${email} existe com o papel "${existing.role}", não "admin". Nada foi alterado.`);
    }
    await db
      .update(users)
      .set({ passwordHash: await hashPassword(password), active: true })
      .where(eq(users.id, existing.id));
    console.log(`\n  ✓ Senha de ${email} trocada.\n`);
    process.exit(0);
  }

  await db.insert(users).values({
    role: "admin",
    // Nulo é a plataforma: o administrador geral enxerga todas as organizações.
    organizationId: null,
    name,
    email,
    passwordHash: await hashPassword(password),
  });

  console.log(`\n  ✓ Administrador geral criado: ${email}`);
  console.log("  Entre pelo site e ative o segundo fator (autenticador) no primeiro acesso.\n");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
