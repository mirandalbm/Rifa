/**
 * A tela cheia do vídeo do sorteio deita o aparelho, como o YouTube: o vídeo
 * é 16:9, e em pé ele ocupa só uma faixa no meio da tela. Quem gira é o
 * `screen.orientation.lock("landscape")`, que o Android aceita só com a tela
 * cheia de verdade ligada (e mesmo com a rotação automática desligada).
 * Onde não há como (computador, Safari do iPhone, que nem põe um elemento
 * qualquer em tela cheia), nada acontece e a tela segue o aparelho — nunca
 * erro na tela. Sair da tela cheia solta a orientação.
 */

interface OrientacaoDaTela {
  lock?: (orientacao: "landscape") => Promise<void>;
  unlock?: () => void;
}

function orientacaoDoAparelho(): OrientacaoDaTela | undefined {
  try {
    return (globalThis.screen?.orientation as OrientacaoDaTela | undefined) ?? undefined;
  } catch {
    return undefined;
  }
}

/** Tenta deitar a tela; devolve se conseguiu. Nunca lança. */
export async function deitarATela(o: OrientacaoDaTela | undefined = orientacaoDoAparelho()): Promise<boolean> {
  if (typeof o?.lock !== "function") return false;
  try {
    await o.lock("landscape");
    return true;
  } catch {
    // Computador, aparelho que não gira ou navegador que não deixa: segue como está.
    return false;
  }
}

/** Solta a orientação travada (ao sair da tela cheia). Nunca lança. */
export function soltarATela(o: OrientacaoDaTela | undefined = orientacaoDoAparelho()): void {
  try {
    o?.unlock?.();
  } catch {
    // Nada travado: nada a soltar.
  }
}

/**
 * No iPhone não há tela cheia de verdade nem giro pelo navegador: a tela
 * ocupa a janela por cima de tudo (a "falsa"). Com o aparelho em pé, ela é
 * desenhada deitada — girada 90° e com a largura e a altura trocadas —, como
 * o YouTube faz: o vídeo 16:9 ocupa a tela inteira e é só virar o celular.
 * Com o aparelho já deitado, nada a girar.
 */
export function deveGirarATela(falsa: boolean, deitado: boolean): boolean {
  return falsa && !deitado;
}

/** O desenho da tela girada: ocupa a janela inteira, de lado. */
export const ESTILO_DA_TELA_GIRADA = {
  position: "fixed",
  top: 0,
  left: 0,
  width: "100dvh",
  height: "100dvw",
  transformOrigin: "top left",
  transform: "rotate(90deg) translateY(-100%)",
} as const;
