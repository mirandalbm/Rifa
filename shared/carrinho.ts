/**
 * O carrinho do apostador: rifas e quantidades, de várias organizações.
 *
 * - **Carrinho é lista de desejo, não reserva.** Guarda a rifa e quantas
 *   cotas — nunca número. A cota só é tomada na compra, pelo caminho de
 *   sempre (`reserveSpecific`/`reserveRandom`, pela PK).
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
}

const SLUG = /^[a-z0-9][a-z0-9-]{0,119}$/;

/**
 * Limpa o que veio do aparelho ou do corpo da requisição: só slug válido,
 * quantidade inteira (0 ou mais), sem repetir rifa (a última vence) e no
 * máximo `CARRINHO_MAX_ITENS`.
 */
export function limparCarrinho(bruto: unknown): ItemDoCarrinho[] {
  if (!Array.isArray(bruto)) return [];
  const porSlug = new Map<string, number>();
  for (const x of bruto) {
    if (!x || typeof x !== "object") continue;
    const { slug, quantidade } = x as Record<string, unknown>;
    if (typeof slug !== "string" || !SLUG.test(slug)) continue;
    if (typeof quantidade !== "number" || !Number.isInteger(quantidade) || quantidade < 0 || quantidade > 1_000_000) continue;
    porSlug.delete(slug);
    porSlug.set(slug, quantidade);
  }
  return [...porSlug].slice(-CARRINHO_MAX_ITENS).map(([slug, quantidade]) => ({ slug, quantidade }));
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
