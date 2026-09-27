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
