/**
 * Qual aba abre: a do endereço (`?aba=`), senão a da âncora de um link antigo
 * (`#verificacao` → a aba que tem aquele cartão), senão a primeira. Pura,
 * porque é o que o `Abas` do painel decide ao montar — e o que um link
 * mandado para alguém precisa fazer sempre igual. Valor desconhecido na URL
 * (aba que sumiu, texto qualquer) cai na primeira, nunca em tela vazia.
 */
export function abaInicial(
  ids: string[],
  { search, hash }: { search: string; hash: string },
  ancoras: Record<string, string> = {},
  parametro = "aba",
): string {
  const pedida = new URLSearchParams(search).get(parametro);
  if (pedida && ids.includes(pedida)) return pedida;
  const dela = ancoras[hash.replace(/^#/, "")];
  return dela && ids.includes(dela) ? dela : ids[0];
}

/** Setas, Home e End: o índice da aba que o teclado pede, ou `null` para outra tecla. */
export function abaDoTeclado(tecla: string, atual: number, total: number): number | null {
  switch (tecla) {
    case "ArrowRight":
      return (atual + 1) % total;
    case "ArrowLeft":
      return (atual - 1 + total) % total;
    case "Home":
      return 0;
    case "End":
      return total - 1;
    default:
      return null;
  }
}
