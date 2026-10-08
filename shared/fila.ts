/**
 * A fila de trabalho pesado (Fase F do `docs/PLANO-FERRAMENTAS.md`): uma
 * tabela no Postgres que já existe (`trabalhos`) e um processo à parte, o
 * **trabalhador** (`server/worker.ts`, outro serviço no Railway com o mesmo
 * código). O processo web nunca recomprime vídeo: ele só enfileira e recebe.
 *
 * O caminho de um trabalho:
 *
 *   pendente → executando (o trabalhador tomou) → pronto (saída gravada)
 *            → recebendo (o site pegou a saída) → concluido
 *
 * e `falhou` em qualquer ponto. Quem decide quem toma é o `UPDATE … FOR
 * UPDATE SKIP LOCKED` (dois trabalhadores nunca pegam o mesmo), e quem decide
 * que não há dois trabalhos iguais em aberto é o índice único parcial sobre a
 * chave (`uq_trabalho_aberto`) — nunca um `SELECT` antes.
 *
 * As entradas e a saída moram no banco (`trabalho_arquivos`), não no disco:
 * o volume do Railway é de um serviço só, e o trabalhador não alcança o do
 * site. Por isso o trabalhador só precisa do `DATABASE_URL` e do `ffmpeg`.
 */

export const SITUACOES_DO_TRABALHO = ["pendente", "executando", "pronto", "recebendo", "concluido", "falhou"] as const;
export type SituacaoDoTrabalho = (typeof SITUACOES_DO_TRABALHO)[number];

/** As situações "em aberto": o índice único da chave vale só nelas. */
export const SITUACOES_EM_ABERTO: readonly SituacaoDoTrabalho[] = ["pendente", "executando", "pronto", "recebendo"];

/** Tentativas do trabalhador antes de desistir. */
export const TENTATIVAS_DO_TRABALHO = 3;

/**
 * Quanto um trabalho pode ficar `executando` (ou `recebendo`) sem terminar:
 * passado isso, o processo caiu no meio (deploy, falta de memória), e o
 * trabalho volta para a fila — ou falha, se já gastou as tentativas.
 */
export const PRAZO_DO_TRABALHO_MS = 10 * 60_000;

/** O trabalhador avisa que está no ar a cada volta; sem aviso há 2 min, a tela diz que o gerador está parado. */
export const TRABALHADOR_NO_AR_MS = 2 * 60_000;

/** A saída de um trabalho nunca passa disto (o arquivo vai inteiro para o banco). */
export const SAIDA_DO_TRABALHO_MAX_BYTES = 40 * 1024 * 1024;

/** Trabalho terminado (concluído ou falho) sai da tabela depois de tantos dias. */
export const GUARDA_DOS_TRABALHOS_DIAS = 30;

/**
 * Quanto esperar antes da próxima tentativa (a `n`-ésima falha): 30 s, 2 min,
 * 8 min… até 30 min. Falha repetida não gira o `ffmpeg` sem parar.
 */
export function esperaDaTentativa(falhas: number): number {
  const n = Math.max(1, Math.floor(falhas));
  return Math.min(30 * 60_000, 30_000 * 4 ** (n - 1));
}

/** Depois de `falhas` falhas, ainda tenta de novo? */
export function tentaDeNovo(falhas: number, max = TENTATIVAS_DO_TRABALHO): boolean {
  return falhas < max;
}

/** O trabalhador está no ar? (o último aviso dele, ou `null`). */
export function trabalhadorNoAr(vistoEm: Date | string | null | undefined, agora = Date.now()): boolean {
  if (!vistoEm) return false;
  const t = new Date(vistoEm).getTime();
  return Number.isFinite(t) && agora - t <= TRABALHADOR_NO_AR_MS;
}

/** O erro que vai para a tela: uma linha, curta, sem caminho de arquivo. */
export function erroParaATela(e: unknown): string {
  const bruto = e instanceof Error ? e.message : typeof e === "string" ? e : "Erro desconhecido.";
  return bruto.replace(/\s+/g, " ").replace(/(^|\s)\/(?:[\w.-]+\/)+[\w.-]*/g, "$1…").trim().slice(0, 300) || "Erro desconhecido.";
}
