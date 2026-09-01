/// Diagnóstico da instalação local: `npm run doctor`.
///
/// Existe porque o erro que o Prisma mostra quando o banco recusa a conexão
/// ("Authentication failed") não diz em que porta ele tentou, se havia algo
/// escutando, nem qual das causas prováveis é a sua. Este script diz.

import fs from "fs";
import net from "net";
import path from "path";
import { PrismaClient } from "@prisma/client";

const VERDE = "\x1b[32m";
const VERMELHO = "\x1b[31m";
const AMARELO = "\x1b[33m";
const CINZA = "\x1b[90m";
const FIM = "\x1b[0m";

const ok = (t: string) => console.log(`${VERDE}  ok${FIM}   ${t}`);
const falha = (t: string) => console.log(`${VERMELHO}  erro${FIM} ${t}`);
const aviso = (t: string) => console.log(`${AMARELO}  aviso${FIM} ${t}`);
const dica = (t: string) => console.log(`${CINZA}       ${t}${FIM}`);

type Alvo = { host: string; porta: number; usuario: string; banco: string };

function lerUrl(url: string): Alvo | null {
  try {
    const u = new URL(url);
    return {
      host: u.hostname,
      porta: Number(u.port || 5432),
      usuario: decodeURIComponent(u.username),
      banco: u.pathname.replace(/^\//, "") || "(vazio)",
    };
  } catch {
    return null;
  }
}

function portaAberta(host: string, porta: number, msTimeout = 2500): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    const encerrar = (resultado: boolean) => {
      socket.destroy();
      resolve(resultado);
    };
    socket.setTimeout(msTimeout);
    socket.once("connect", () => encerrar(true));
    socket.once("timeout", () => encerrar(false));
    socket.once("error", () => encerrar(false));
    socket.connect(porta, host === "localhost" ? "127.0.0.1" : host);
  });
}

async function main() {
  console.log("\nDiagnóstico da instalação\n");

  // 1. O arquivo .env existe?
  const caminhoEnv = path.join(process.cwd(), ".env");
  if (!fs.existsSync(caminhoEnv)) {
    falha(".env não encontrado");
    dica("Crie com: cp .env.example .env   (Windows: copy .env.example .env)");
    process.exitCode = 1;
    return;
  }
  ok(".env encontrado");

  // 2. As variáveis essenciais estão preenchidas?
  const url = process.env.DATABASE_URL;
  if (!url) {
    falha("DATABASE_URL não está definida no .env");
    process.exitCode = 1;
    return;
  }

  const alvo = lerUrl(url);
  if (!alvo) {
    falha("DATABASE_URL não é uma URL válida");
    dica('Formato esperado: postgresql://usuario:senha@localhost:5433/rifa?schema=public');
    process.exitCode = 1;
    return;
  }

  console.log(`${CINZA}       conectando em ${alvo.host}:${alvo.porta}, banco "${alvo.banco}", usuário "${alvo.usuario}"${FIM}`);

  if (!process.env.JWT_SECRET) {
    aviso("JWT_SECRET vazio — o login não vai funcionar");
    dica('Gere com: node -e "console.log(require(\'crypto\').randomBytes(64).toString(\'hex\'))"');
  } else {
    ok("JWT_SECRET definido");
  }

  // 3. Tem algo escutando nessa porta?
  const aberta = await portaAberta(alvo.host, alvo.porta);
  if (!aberta) {
    falha(`nada está escutando em ${alvo.host}:${alvo.porta}`);
    dica("O banco não está no ar. Suba com: docker compose up -d");
    dica("Confira com: docker compose ps   (deve mostrar rifa-banco como running)");
    process.exitCode = 1;
    return;
  }
  ok(`porta ${alvo.porta} respondendo`);

  // 4. As credenciais funcionam?
  const prisma = new PrismaClient();
  try {
    await prisma.$queryRaw`SELECT 1`;
    ok("conexão com o banco funcionando");
  } catch (erro) {
    const mensagem = String(erro);

    if (/Authentication failed|password authentication/i.test(mensagem)) {
      falha(`o servidor em ${alvo.porta} recusou o usuário "${alvo.usuario}"`);
      console.log("");
      console.log("  Tem um PostgreSQL nessa porta, mas ele não aceita essas credenciais.");
      console.log("  As duas causas comuns:");
      console.log("");
      console.log(`  1. É outro PostgreSQL, não o do projeto.`);
      dica(`Se você já tinha PostgreSQL instalado, ele costuma ocupar a 5432.`);
      dica(`O container do projeto usa a 5433. Confira se o .env aponta para :5433.`);
      console.log("");
      console.log("  2. O volume do container foi criado antes, com outra senha.");
      dica("O Postgres só aplica usuário/senha ao criar o volume pela primeira vez.");
      dica("Recrie com: docker compose down -v  &&  docker compose up -d");
    } else if (/does not exist|database .* not found/i.test(mensagem)) {
      falha(`o banco "${alvo.banco}" não existe no servidor`);
      dica("Recrie o container: docker compose down -v && docker compose up -d");
    } else {
      falha("não foi possível conectar");
      dica(mensagem.split("\n").slice(0, 3).join(" "));
    }
    process.exitCode = 1;
    await prisma.$disconnect();
    return;
  }

  // 5. As tabelas existem?
  try {
    const usuarios = await prisma.usuario.count();
    ok(`tabelas criadas (${usuarios} usuário(s) cadastrado(s))`);

    if (usuarios === 0) {
      aviso("nenhum usuário — falta rodar o seed");
      dica("Rode: npm run db:seed");
    }
  } catch {
    falha("as tabelas ainda não foram criadas");
    dica("Rode: npx prisma migrate deploy");
    process.exitCode = 1;
    await prisma.$disconnect();
    return;
  }

  await prisma.$disconnect();
  console.log("\nTudo pronto. Suba com: npm run dev\n");
}

main().catch((erro) => {
  console.error(erro);
  process.exit(1);
});
