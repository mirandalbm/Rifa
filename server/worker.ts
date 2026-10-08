/**
 * O trabalhador (Fase F): o processo à parte que faz o trabalho pesado da fila
 * (`shared/fila.ts`) — hoje, montar o reels gerado com o `ffmpeg`. No Railway é
 * outro serviço com o mesmo repositório e o comando `npm run start:worker`;
 * precisa só do `DATABASE_URL` (o mesmo do site) e do `ffmpeg`. O site nunca
 * recomprime vídeo: sem este processo, os pedidos esperam na fila e a tela diz
 * que o gerador está parado.
 */
import { pool, poolDasTravas } from "./db";
import { iniciarTrabalhador } from "./trabalhos/trabalhador";

const trabalhador = iniciarTrabalhador();

let saindo = false;
async function sair(sinal: string) {
  if (saindo) return;
  saindo = true;
  console.log(`${new Date().toISOString()} [trabalhador] ${sinal}: terminando o que está em andamento`);
  // O Railway espera um pouco antes de matar; o trabalho que não terminar a
  // tempo volta para a fila pelo prazo (`devolverPresos`).
  const prazo = setTimeout(() => process.exit(0), 25_000);
  prazo.unref();
  await trabalhador.parar().catch(() => {});
  await Promise.allSettled([pool.end(), poolDasTravas.end()]);
  process.exit(0);
}
process.on("SIGTERM", () => void sair("SIGTERM"));
process.on("SIGINT", () => void sair("SIGINT"));
