/**
 * O que pode ser prêmio na rifa autorizada pela SPA/MF (resposta 5 do
 * advogado, 06/10/2026). Puro: o servidor recusa, a tela avisa, o teste
 * confere.
 *
 * - **Sem dinheiro**: promoção comercial (sorteio ou vale-brinde) não
 *   distribui prêmio em dinheiro — espécie, Pix, transferência. Isso é de
 *   título de capitalização e loteria. Bem (carro, celular) ou serviço
 *   (viagem, vale-compras de loja física) pode; "R$ 1.000 no Pix" não. O
 *   valor do bem pode aparecer ("moto avaliada em R$ 15.000"): o que se
 *   recusa é o prêmio **ser** o dinheiro.
 * - **Sem item proibido** (Decreto 70.951/72, art. 10 — resposta 5.1 do
 *   advogado, 07/10/2026): medicamento, combustível e lubrificante, arma e
 *   munição, explosivo e fogos de artifício, bebida alcoólica, fumo e
 *   derivados.
 *
 * Vale para o prêmio principal e para cada cota premiada. A palavra é lida
 * sem acento e sem diferença de maiúscula, e só como palavra inteira
 * ("armário" não é "arma").
 */

const semAcento = (t: string) => t.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();

/** Palavra inteira (com plural simples), lida no texto sem acento. */
function temPalavra(texto: string, palavras: readonly string[]): string | null {
  for (const p of palavras) {
    const re = new RegExp(`(?<![\\p{L}\\p{N}])${p.replace(/ /g, "\\s+")}(?:s|es)?(?![\\p{L}\\p{N}])`, "u");
    if (re.test(texto)) return p;
  }
  return null;
}

/** O que denuncia prêmio em dinheiro. */
const DINHEIRO = [
  "pix",
  "dinheiro",
  "em especie",
  "transferencia",
  "deposito",
  "saque",
  "cash",
  "credito em conta",
  "valor em conta",
] as const;

/** Prêmio que é só uma quantia: "R$ 50", "R$ 1.000,00", "500 reais". */
const SO_QUANTIA = /^\s*(r\$\s*[\d.,]+|[\d.,]+\s*(reais|real|r\$))\s*$/;

/**
 * Decreto 70.951/72, art. 10: o que não pode ser prêmio de promoção
 * comercial. "Diesel" sozinho fica de fora: "Hilux diesel" é o carro.
 */
export const ITENS_PROIBIDOS: readonly { grupo: string; palavras: readonly string[] }[] = [
  { grupo: "medicamento", palavras: ["medicamento", "remedio", "farmaco"] },
  {
    grupo: "combustível ou lubrificante",
    palavras: [
      "combustivel",
      "combustiveis",
      "gasolina",
      "etanol",
      "querosene",
      "gnv",
      "litros de diesel",
      "oleo diesel",
      "lubrificante",
      "oleo de motor",
    ],
  },
  {
    grupo: "arma ou munição",
    palavras: ["arma", "arma de fogo", "pistola", "revolver", "espingarda", "carabina", "fuzil", "rifle", "municao", "cartucho de bala"],
  },
  { grupo: "explosivo ou fogos de artifício", palavras: ["explosivo", "fogos de artificio", "rojao", "bomba de estampido"] },
  {
    grupo: "bebida alcoólica",
    palavras: [
      "bebida alcoolica",
      "cerveja",
      "chope",
      "chopp",
      "vinho",
      "espumante",
      "champanhe",
      "champagne",
      "whisky",
      "uisque",
      "vodka",
      "cachaca",
      "licor",
      "gin",
      "tequila",
      "rum",
    ],
  },
  {
    grupo: "fumo ou derivado",
    palavras: ["cigarro", "cigarro eletronico", "charuto", "tabaco", "fumo", "narguile", "vape", "pod descartavel"],
  },
];

export const MENSAGEM_DINHEIRO =
  "Prêmio em dinheiro (espécie, Pix ou transferência) não é permitido em promoção autorizada pela SPA/MF: ofereça um bem (carro, celular) ou um serviço (viagem, vale-compras de loja física).";

/** O problema do texto do prêmio, ou `null`. `autorizada`: a rifa tem método de apuração (a da SPA/MF). */
export function problemaNoPremio(texto: string, autorizada: boolean): string | null {
  if (!autorizada) return null;
  // "Vale-gasolina" e "vale gasolina" são a mesma coisa.
  const t = semAcento(String(texto ?? "")).replace(/-/g, " ");
  if (SO_QUANTIA.test(t) || temPalavra(t, DINHEIRO)) return MENSAGEM_DINHEIRO;
  for (const item of ITENS_PROIBIDOS) {
    if (temPalavra(t, item.palavras)) {
      return `Este prêmio parece ser ${item.grupo}, que não pode ser prêmio de promoção comercial (Decreto 70.951/72, art. 10). Escolha outro bem ou serviço.`;
    }
  }
  return null;
}
