/**
 * O carrinho, visto pelo servidor: o aparelho manda rifa e quantidade e
 * recebe de volta o que cada item é agora — prêmio, promotora, se ainda
 * vende e o total calculado aqui. Não grava nada e não reserva nada: a
 * compra de cada rifa segue o caminho de sempre (`createOrder`), que
 * recalcula o preço de novo. Regras em `shared/carrinho.ts`.
 */
import { numeracaoZero } from "@shared/apuracao";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { db } from "../db";
import { campaignStats, campaigns, organizacaoFotos, organizations, quotaPackages } from "@shared/schema";
import { limparCarrinho, quantidadeInicial, quantidadeNaFaixa, rifaAVenda, totalDoItem } from "@shared/carrinho";
import { getPaymentMethods } from "./settings";
import { midiasDas, pecaPublica, urlDaFoto } from "./perfil";

export async function itensDoCarrinho(bruto: unknown) {
  const pedidos = limparCarrinho(bruto);
  if (pedidos.length === 0) return [];
  const slugs = pedidos.map((p) => p.slug);

  const linhas = await db
    .select({ campaign: campaigns, stats: campaignStats, org: organizations, fotoEm: organizacaoFotos.updatedAt })
    .from(campaigns)
    .leftJoin(campaignStats, eq(campaignStats.campaignId, campaigns.id))
    .innerJoin(organizations, eq(organizations.id, campaigns.organizationId))
    .leftJoin(organizacaoFotos, eq(organizacaoFotos.organizationId, organizations.id))
    .where(and(inArray(campaigns.slug, slugs), isNull(organizations.archivedAt)));
  const porSlug = new Map(linhas.filter((l) => l.campaign.status !== "draft").map((l) => [l.campaign.slug, l]));

  const ids = [...porSlug.values()].map((l) => l.campaign.id);
  const pacotes = ids.length
    ? await db.select().from(quotaPackages).where(inArray(quotaPackages.campaignId, ids)).orderBy(quotaPackages.quantity)
    : [];
  const midias = await midiasDas(ids);
  const pixOnline = (await getPaymentMethods()).pix_online;

  return pedidos.map((p) => {
    const l = porSlug.get(p.slug);
    // Rascunho, apagada ou de promotora arquivada: o aparelho tira do carrinho.
    if (!l) return { slug: p.slug, indisponivel: true as const };
    const c = l.campaign;
    const packages = pacotes
      .filter((x) => x.campaignId === c.id)
      .map((x) => ({ quantity: x.quantity, discountPct: x.discountPct, highlight: x.highlight }));
    const soldCount = l.stats?.soldCount ?? 0;
    const vende = rifaAVenda({
      status: c.status,
      demonstracao: c.demonstracao,
      travada: Boolean(c.travadaEm) || Boolean(l.org.banidaEm),
      soldCount,
      totalQuotas: c.totalQuotas,
      pixOnline,
    });
    // O máximo também respeita o que sobrou de cota.
    const max = Math.max(c.minPerOrder, Math.min(c.maxPerOrder, c.totalQuotas - soldCount));
    const quantidade =
      p.quantidade === 0
        ? quantidadeInicial(packages, c.minPerOrder, max)
        : quantidadeNaFaixa(p.quantidade, c.minPerOrder, max);
    const capa = (midias.get(c.id) ?? []).map(pecaPublica)[0] ?? null;
    return {
      slug: c.slug,
      indisponivel: false as const,
      prizeTitle: c.prizeTitle,
      priceCents: c.priceCents,
      minPerOrder: c.minPerOrder,
      maxPerOrder: max,
      packages,
      quantidade,
      // A cartela escolhida segue só se a quantidade não precisou ser cortada.
      numeros: p.numeros && p.numeros.length === quantidade && p.numeros.every((n) => n <= c.totalQuotas) ? p.numeros : null,
      totalCents: totalDoItem(quantidade, c.priceCents, packages),
      vende,
      status: c.status,
      drawAt: c.drawAt,
      modoSorteio: c.modoSorteio,
      soldCount,
      totalQuotas: c.totalQuotas,
      numeracaoZero: numeracaoZero(c.metodoApuracao),
      capa: capa ? { url: capa.url, lqip: capa.lqip, role: capa.role } : null,
      organizacao: {
        slug: l.org.slug,
        nome: l.org.name,
        foto: urlDaFoto(l.org.slug, l.fotoEm),
        verificada: Boolean(l.org.verificadaEm),
      },
    };
  });
}
