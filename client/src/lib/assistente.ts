/**
 * A coluna do assistente aberta ou fechada, lembrada no aparelho
 * (`rifa.assistente.aberto`), como o menu do painel: cada tela monta a própria
 * casca, e a coluna aberta segue aberta ao trocar de tela. Perder a escolha
 * (aba anônima, armazenamento bloqueado) só devolve "fechada".
 *
 * Não há script de terceiro aqui: a conversa vai ao nosso servidor
 * (`/api/ia/*`), que fala com o Chatbase.
 */
export const CHAVE_DO_ASSISTENTE = "rifa.assistente.aberto";

function ler(): boolean {
  try {
    return globalThis.localStorage?.getItem(CHAVE_DO_ASSISTENTE) === "1";
  } catch {
    return false;
  }
}

let aberto = ler();
const ouvintes = new Set<() => void>();

export function assistenteAberto(): boolean {
  return aberto;
}

export function definirAssistenteAberto(valor: boolean) {
  aberto = valor;
  try {
    globalThis.localStorage?.setItem(CHAVE_DO_ASSISTENTE, valor ? "1" : "0");
  } catch {
    /* sem armazenamento, vale só nesta visita */
  }
  ouvintes.forEach((f) => f());
}

export function assinarAssistente(f: () => void): () => void {
  ouvintes.add(f);
  return () => {
    ouvintes.delete(f);
  };
}
