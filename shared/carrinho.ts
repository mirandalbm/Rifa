/**
 * O carrinho do apostador: rifas e quantidades, de várias organizações.
 *
 * - **Carrinho é lista de desejo, não reserva.** Guarda a rifa, quantas
 *   cotas e, se a pessoa escolheu na janela do "+", a cartela sugerida. A
 *   cota só é tomada na compra, pelo caminho de sempre
 *   (`reserveSpecific`/`reserveRandom`, pela PK).
 * - **Fica no aparelho** (`rifa.carrinho`), como a região e o tema: perder
 *   só esvazia o carrinho.
 * - **O preço é do servidor.** O aparelho manda rifa e quantidade;
 *   `POST /api/public/carrinho` devolve o total de cada item calculado por
 *   `priceOrder()`, e a compra recalcula de novo em `createOrder`.
 */
import { priceOrder, type PricingPackage } from "./pricing";

export const CARRINHO_MAX_ITENS = 20;

export interface ItemDoCarrinho {
  slug: string;
  /** 0 = ainda não escolheu: vale a sugerida pela rifa (`quantidadeInicial`). */
  quantidade: number;
  /**
   * A cartela escolhida na janela do "+" (`sugerirCartelas`). Sugestão, não
   * reserva: vai para `reserveSpecific` só na compra, e se alguém levou um
   * número no meio a compra recusa (409) e o carrinho volta a sortear na hora.
   */
  numeros?: number[];
  /**
   * Os bilhetes (cartelas) que formam os `numeros`, na ordem em que entraram:
   * só para mostrar cada bilhete separado no carrinho. A compra segue um
   * pedido por rifa, com todos os números; juntos, os bilhetes são
   * exatamente os `numeros`, sem repetir.
   */
  bilhetes?: number[][];
}

/** Os bilhetes servem se, juntos e na ordem, são exatamente os números. */
export function bilhetesDoItem(bilhetes: unknown, numeros: number[]): number[][] | undefined {
  if (!Array.isArray(bilhetes) || bilhetes.length === 0 || bilhetes.length > numeros.length) return undefined;
  const grupos = bilhetes.map((b) => numerosDaCartela(b));
  if (grupos.some((g) => !g)) return undefined;
  const juntos = (grupos as number[][]).flat();
  return juntos.length === numeros.length && juntos.every((n, i) => n === numeros[i]) ? (grupos as number[][]) : undefined;
}

/** Maior cartela guardada no aparelho (a compra rápida vai até 50; a escolhida pelo usuário, até isto). */
export const CARTELA_MAX_NUMEROS = 1_000;

/** Números da cartela, se servirem: inteiros positivos, sem repetir, até o teto. */
export function numerosDaCartela(v: unknown): number[] | undefined {
  if (!Array.isArray(v) || v.length === 0 || v.length > CARTELA_MAX_NUMEROS) return undefined;
  if (!v.every((n) => typeof n === "number" && Number.isInteger(n) && n > 0 && n <= 10_000_000)) return undefined;
  const unicos = [...new Set(v as number[])];
  return unicos.length === v.length ? unicos : undefined;
}

/**
 * Juntar mais uma cartela ao item da rifa. O carrinho continua com um item
 * por rifa (cada rifa é um pedido na compra), e a cartela nova soma os
 * números dela aos que já estavam lá:
 *
 * - item com cartela: o bilhete novo entra em `bilhetes` e os números dele
 *   somam aos de antes; bilhete com qualquer número que já está no
 *   carrinho é `repetida` (não entra pela metade);
 * - item só com quantidade (a pessoa mudou a quantidade no carrinho): soma
 *   a quantidade e os números passam a ser sorteados na compra — a cartela
 *   só vale se tiver exatamente a quantidade do item;
 * - passar do máximo da rifa (ou do teto da cartela) é `maximo`, e nada muda.
 */
export type CartelaJuntada =
  | { ok: true; item: ItemDoCarrinho; novos: number }
  | { ok: false; motivo: "repetida" | "maximo" };

export function juntarCartela(
  atual: ItemDoCarrinho | undefined,
  slug: string,
  numeros: number[],
  maximo: number = CARTELA_MAX_NUMEROS,
): CartelaJuntada {
  const teto = Math.min(maximo, CARTELA_MAX_NUMEROS);
  const cartela = [...new Set(numeros)];
  if (!atual || atual.quantidade === 0) {
    if (cartela.length > teto) return { ok: false, motivo: "maximo" };
    return { ok: true, item: { slug, quantidade: cartela.length, numeros: cartela, bilhetes: [cartela] }, novos: cartela.length };
  }
  if (!atual.numeros) {
    const quantidade = atual.quantidade + cartela.length;
    if (quantidade > maximo) return { ok: false, motivo: "maximo" };
    return { ok: true, item: { slug, quantidade }, novos: cartela.length };
  }
  // Bilhete com número que já está no carrinho não entra: ficaria menor
  // do que a pessoa escolheu. A tela troca a cartela por outra.
  const ja = new Set(atual.numeros);
  if (cartela.some((n) => ja.has(n))) return { ok: false, motivo: "repetida" };
  const novos = cartela;
  const juntos = [...atual.numeros, ...novos];
  if (juntos.length > teto) return { ok: false, motivo: "maximo" };
  const antes = atual.bilhetes ?? [atual.numeros];
  return { ok: true, item: { slug, quantidade: juntos.length, numeros: juntos, bilhetes: [...antes, novos] }, novos: novos.length };
}

/**
 * Tira um bilhete do item: os outros ficam, com os números deles. Sem
 * bilhete nenhum, o item sai do carrinho (`null`).
 */
export function tirarBilhete(item: ItemDoCarrinho, indice: number): ItemDoCarrinho | null {
  if (!item.numeros) return item;
  const bilhetes = (item.bilhetes ?? [item.numeros]).filter((_, i) => i !== indice);
  if (bilhetes.length === 0) return null;
  const numeros = bilhetes.flat();
  return { slug: item.slug, quantidade: numeros.length, numeros, bilhetes };
}

const SLUG = /^[a-z0-9][a-z0-9-]{0,119}$/;

/**
 * Limpa o que veio do aparelho ou do corpo da requisição: só slug válido,
 * quantidade inteira (0 ou mais), sem repetir rifa (a última vence) e no
 * máximo `CARRINHO_MAX_ITENS`.
 */
export function limparCarrinho(bruto: unknown): ItemDoCarrinho[] {
  if (!Array.isArray(bruto)) return [];
  const porSlug = new Map<string, ItemDoCarrinho>();
  for (const x of bruto) {
    if (!x || typeof x !== "object") continue;
    const { slug, quantidade, numeros, bilhetes } = x as Record<string, unknown>;
    if (typeof slug !== "string" || !SLUG.test(slug)) continue;
    if (typeof quantidade !== "number" || !Number.isInteger(quantidade) || quantidade < 0 || quantidade > 1_000_000) continue;
    // A cartela só vale se tiver exatamente a quantidade do item.
    const cartela = numerosDaCartela(numeros);
    porSlug.delete(slug);
    if (cartela && cartela.length === quantidade) {
      const grupos = bilhetesDoItem(bilhetes, cartela);
      porSlug.set(slug, grupos ? { slug, quantidade, numeros: cartela, bilhetes: grupos } : { slug, quantidade, numeros: cartela });
    } else porSlug.set(slug, { slug, quantidade });
  }
  return [...porSlug.values()].slice(-CARRINHO_MAX_ITENS);
}

/** A rifa aceita compra pela loja agora? A mesma régua da página da rifa. */
export function rifaAVenda(r: {
  status: string;
  demonstracao?: boolean | null;
  travada?: boolean | null;
  soldCount: number;
  totalQuotas: number;
  pixOnline?: boolean;
}): boolean {
  return (
    r.status === "published" &&
    !r.demonstracao &&
    !r.travada &&
    r.soldCount < r.totalQuotas &&
    (r.pixOnline ?? true)
  );
}

/** Quantidade que cabe na rifa: entre o mínimo e o máximo por pedido. */
export function quantidadeNaFaixa(quantidade: number, min: number, max: number): number {
  return Math.min(Math.max(Math.trunc(quantidade) || min, min), max);
}

/**
 * Quantas cotas entram quando a pessoa toca no carrinho: o pacote em
 * destaque, senão o menor pacote, senão o mínimo por pedido.
 */
export function quantidadeInicial(
  packages: (PricingPackage & { highlight?: boolean })[],
  min: number,
  max: number,
): number {
  const destaque = packages.find((p) => p.highlight)?.quantity;
  const menor = [...packages].sort((a, b) => a.quantity - b.quantity)[0]?.quantity;
  return quantidadeNaFaixa(destaque ?? menor ?? min, min, max);
}

/** O total de um item, pela mesma conta da compra (pacote aplicado, sem cupom). */
export function totalDoItem(quantidade: number, unitCents: number, packages: PricingPackage[]): number {
  return priceOrder({ quantity: quantidade, unitCents, packages }).totalCents;
}

/**
 * Separa por organização, na ordem em que cada uma entrou no carrinho. É
 * como a compra acontece: cada promotora tem a própria autorização, o
 * próprio bilhete e o próprio Pix.
 */
export function agruparPorOrganizacao<T extends { organizacao: { slug: string } | null }>(itens: T[]) {
  const grupos = new Map<string, T[]>();
  for (const i of itens) {
    const chave = i.organizacao?.slug ?? "";
    grupos.set(chave, [...(grupos.get(chave) ?? []), i]);
  }
  return [...grupos].map(([slug, lista]) => ({ slug, itens: lista }));
}

/** O carrinho pago num Pix só tem código na faixa 100.000.000–899.999.999. */
export const CARRINHO_CODIGO_MIN = 100_000_000;
export const CARRINHO_CODIGO_MAX = 900_000_000;

/**
 * O split do Pix único do carrinho. O Asaas divide em percentual sobre o
 * **líquido** da cobrança inteira, então a parte de cada promotora é a
 * média dos percentuais dela pesada pelo valor de cada pedido:
 *
 *   percentual(carteira) = Σ valor_i × percentualDoPromotor_i / total
 *
 * Cada pedido entra com o percentual que teria sozinho (taxa do plano e
 * comissão guardada, `percentualDoPromotor`), então o carrinho não muda o
 * rateio de ninguém. Pedido de organização sem carteira não entra: a parte
 * dela fica na conta da plataforma, como no pedido avulso. Arredonda para
 * baixo em 4 casas (o que o Asaas aceita): a promotora nunca recebe fração
 * que não é dela, e a soma nunca passa de 100%.
 */
export function splitDoCarrinho(
  pedidos: { walletId: string | null; amountCents: number; percentualDoPromotor: number }[],
): { walletId: string; percentual: number }[] {
  const total = pedidos.reduce((s, p) => s + p.amountCents, 0);
  if (total <= 0) return [];
  const porCarteira = new Map<string, number>();
  for (const p of pedidos) {
    if (!p.walletId) continue;
    porCarteira.set(p.walletId, (porCarteira.get(p.walletId) ?? 0) + p.amountCents * p.percentualDoPromotor);
  }
  return [...porCarteira]
    .map(([walletId, soma]) => ({ walletId, percentual: Math.floor((soma / total) * 10_000 + 1e-9) / 10_000 }))
    .filter((s) => s.percentual > 0);
}

/**
 * A situação do carrinho, tirada dos pedidos dele (nunca guardada à parte,
 * para não desencontrar): pago quando nenhum está esperando e algum foi
 * pago; vencido quando todos venceram; senão, esperando o Pix.
 */
export function situacaoDoCarrinho(status: string[]): "pending" | "paid" | "expired" {
  if (status.some((s) => s === "pending")) return "pending";
  if (status.some((s) => s === "paid" || s === "refunded")) return "paid";
  return "expired";
}

/** Quantos bilhetes há no carrinho (o número do console): cada cartela posta conta um; rifa só com quantidade, um. */
export function bilhetesNoCarrinho(itens: ItemDoCarrinho[]): number {
  return itens.reduce((n, i) => n + (i.numeros ? (bilhetesDoItem(i.bilhetes, i.numeros)?.length ?? 1) : 1), 0);
}
