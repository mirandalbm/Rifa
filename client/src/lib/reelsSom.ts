/**
 * O som dos reels, lembrado no aparelho (como a região e o tema): quem ligou
 * o som continua ouvindo no reel seguinte e na próxima visita. Perder o valor
 * só devolve o padrão (mudo). Quem decide é a pessoa, com o botão de som — o
 * navegador pode barrar o som sem toque (aí o reel toca mudo e a escolha
 * guardada fica como estava).
 */
const CHAVE = "rifa.reels.som";

export function lerSomDosReels(): boolean {
  try {
    return localStorage.getItem(CHAVE) === "1";
  } catch {
    return false;
  }
}

export function guardarSomDosReels(ligado: boolean): void {
  try {
    if (ligado) localStorage.setItem(CHAVE, "1");
    else localStorage.removeItem(CHAVE);
  } catch {
    /* sem armazenamento: só não lembra */
  }
}
