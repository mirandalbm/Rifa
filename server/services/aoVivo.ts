/**
 * A coluna "ao vivo" da vitrine (tablet e computador): a tela do próximo
 * sorteio, os últimos ganhadores e quem está jogando agora. As regras de
 * exibição moram em `shared/aoVivo.ts`; aqui, só as consultas.
 *
 * Tudo é público, então tudo sai já recortado: nome curto, cidade e UF do
 * cadastro, prêmio e quantidade. Nunca telefone, CPF, código do pedido ou id
 * do comprador. Demonstração, rifa travada e promotora arquivada ou banida
 * ficam de fora — a vitrine também não as mostra.
 */
import { createHash } from "node:crypto";
import { and, asc, desc, eq, gt, inArray, isNotNull, isNull, lte, sql } from "drizzle-orm";
import { db } from "../db";
import { buyers, campaigns, draws, orders, organizations, prizedQuotas } from "@shared/schema";
import { formatQuota } from "@shared/format";
import { DURACAO_DA_TRANSMISSAO_MS, GANHADORES_NA_COLUNA, JOGANDO_NA_COLUNA, nomeCurto, transmissaoNoAr, videoDaTransmissao } from "@shared/aoVivo";

/** Rifa que a vitrine mostra: publicada, de verdade, de promotora no ar. */
const rifaDaVitrine = and(
  eq(campaigns.demonstracao, false),
  isNull(campaigns.travadaEm),
  isNull(organizations.archivedAt),
  isNull(organizations.banidaEm),
);

/**
 * Chave estável para a tela animar o item novo sem mandar o id do pedido
 * (que não é dado de ninguém de fora). Muda por pedido, não diz nada.
 */
function chave(tipo: string, id: string): string {
  return createHash("sha256").update(`${tipo}:${id}`).digest("hex").slice(0, 16);
}

/**
 * Quais organizações têm uma transmissão no ar agora (o selo "ao vivo" do
 * story e do perfil): `transmissaoNoAr()` decide, aqui só a consulta. Rifa
 * de verdade (a mesma régua da vitrine), publicada, não sorteada, com link
 * de transmissão e na janela do sorteio. Sem `orgIds`, todas.
 */
export async function transmissoesNoAr(orgIds?: string[]) {
  const agora = Date.now();
  const linhas = await db
    .select({
      orgId: campaigns.organizationId,
      slug: campaigns.slug,
      premio: campaigns.prizeTitle,
      drawAt: campaigns.drawAt,
      transmissaoUrl: campaigns.transmissaoUrl,
    })
    .from(campaigns)
    .innerJoin(organizations, eq(organizations.id, campaigns.organizationId))
    .leftJoin(draws, and(eq(draws.campaignId, campaigns.id), isNotNull(draws.executedAt)))
    .where(
      and(
        eq(campaigns.status, "published"),
        rifaDaVitrine,
        isNull(draws.id),
        isNotNull(campaigns.transmissaoUrl),
        lte(campaigns.drawAt, new Date(agora)),
        gt(campaigns.drawAt, new Date(agora - DURACAO_DA_TRANSMISSAO_MS)),
        orgIds ? inArray(campaigns.organizationId, orgIds) : undefined,
      ),
    )
    .orderBy(asc(campaigns.drawAt));
  const porOrg = new Map<string, { slug: string; premio: string }>();
  for (const l of linhas) {
    if (!l.orgId || porOrg.has(l.orgId)) continue;
    if (transmissaoNoAr({ drawAt: l.drawAt, sorteada: false, transmissaoUrl: l.transmissaoUrl }, agora)) {
      porOrg.set(l.orgId, { slug: l.slug, premio: l.premio });
    }
  }
  return porOrg;
}

async function proximoSorteio() {
  const [r] = await db
    .select({
      slug: campaigns.slug,
      prizeTitle: campaigns.prizeTitle,
      drawAt: campaigns.drawAt,
      transmissaoUrl: campaigns.transmissaoUrl,
      orgSlug: organizations.slug,
      orgNome: organizations.name,
    })
    .from(campaigns)
    .innerJoin(organizations, eq(organizations.id, campaigns.organizationId))
    .leftJoin(draws, and(eq(draws.campaignId, campaigns.id), isNotNull(draws.executedAt)))
    .where(
      and(
        eq(campaigns.status, "published"),
        rifaDaVitrine,
        isNull(draws.id),
        gt(campaigns.drawAt, new Date(Date.now() - DURACAO_DA_TRANSMISSAO_MS)),
      ),
    )
    .orderBy(asc(campaigns.drawAt))
    .limit(1);
  if (!r?.drawAt) return null;
  return {
    slug: r.slug,
    organizacao: { slug: r.orgSlug, nome: r.orgNome },
    prizeTitle: r.prizeTitle,
    drawAt: r.drawAt,
    video: videoDaTransmissao(r.transmissaoUrl),
  };
}

async function ultimosGanhadores() {
  const sorteios = await db
    .select({
      id: draws.id,
      em: draws.executedAt,
      // O número que levou: o contemplado (aproximação), ou o sorteado nos antigos.
      numero: sql<number>`coalesce(${draws.winnerNumber}, ${draws.resultNumber})`,
      totalQuotas: campaigns.totalQuotas,
      premio: campaigns.prizeTitle,
      slug: campaigns.slug,
      orgSlug: organizations.slug,
      nome: buyers.name,
      cidade: buyers.cidade,
      uf: buyers.uf,
    })
    .from(draws)
    .innerJoin(campaigns, eq(campaigns.id, draws.campaignId))
    .innerJoin(organizations, eq(organizations.id, campaigns.organizationId))
    .innerJoin(orders, eq(orders.id, draws.winnerOrderId))
    .innerJoin(buyers, eq(buyers.id, orders.buyerId))
    .where(and(isNotNull(draws.executedAt), rifaDaVitrine))
    .orderBy(desc(draws.executedAt))
    .limit(GANHADORES_NA_COLUNA);

  // Cota premiada só conta com pedido pago (o estorno devolve a cota e o
  // ganhador sai daqui junto) — a mesma régua do fixo dos comentários.
  const cotas = await db
    .select({
      id: prizedQuotas.id,
      em: prizedQuotas.claimedAt,
      numero: prizedQuotas.number,
      totalQuotas: campaigns.totalQuotas,
      premio: prizedQuotas.prizeLabel,
      slug: campaigns.slug,
      orgSlug: organizations.slug,
      nome: buyers.name,
      cidade: buyers.cidade,
      uf: buyers.uf,
    })
    .from(prizedQuotas)
    .innerJoin(campaigns, eq(campaigns.id, prizedQuotas.campaignId))
    .innerJoin(organizations, eq(organizations.id, campaigns.organizationId))
    .innerJoin(orders, eq(orders.id, prizedQuotas.claimedByOrderId))
    .innerJoin(buyers, eq(buyers.id, orders.buyerId))
    .where(and(eq(orders.status, "paid"), isNotNull(prizedQuotas.claimedAt), rifaDaVitrine))
    .orderBy(desc(prizedQuotas.claimedAt))
    .limit(GANHADORES_NA_COLUNA);

  const todos = [
    ...sorteios.map((g) => ({ ...g, tipo: "sorteio" as const })),
    ...cotas.map((g) => ({ ...g, tipo: "cota" as const })),
  ];
  return todos
    .filter((g) => g.em)
    .sort((a, b) => new Date(b.em!).getTime() - new Date(a.em!).getTime())
    .slice(0, GANHADORES_NA_COLUNA)
    .map((g) => ({
      chave: chave(g.tipo, g.id),
      tipo: g.tipo,
      nome: nomeCurto(g.nome),
      lugar: g.cidade && g.uf ? `${g.cidade}/${g.uf}` : (g.uf ?? null),
      premio: g.premio,
      cota: g.numero === null ? null : formatQuota(g.numero, g.totalQuotas),
      em: g.em,
      rifa: { slug: g.slug, organizacao: g.orgSlug },
    }));
}

async function jogandoAgora() {
  const linhas = await db
    .select({
      id: orders.id,
      em: orders.paidAt,
      quantidade: orders.quantity,
      nome: buyers.name,
      cidade: buyers.cidade,
      uf: buyers.uf,
      premio: campaigns.prizeTitle,
      slug: campaigns.slug,
      orgSlug: organizations.slug,
    })
    .from(orders)
    .innerJoin(buyers, eq(buyers.id, orders.buyerId))
    .innerJoin(campaigns, eq(campaigns.id, orders.campaignId))
    .innerJoin(organizations, eq(organizations.id, campaigns.organizationId))
    .where(and(eq(orders.status, "paid"), isNotNull(orders.paidAt), rifaDaVitrine))
    .orderBy(desc(orders.paidAt))
    .limit(JOGANDO_NA_COLUNA);
  return linhas.map((l) => ({
    chave: chave("pedido", l.id),
    nome: nomeCurto(l.nome),
    lugar: l.cidade && l.uf ? `${l.cidade}/${l.uf}` : (l.uf ?? null),
    quantidade: l.quantidade,
    em: l.em,
    rifa: { slug: l.slug, organizacao: l.orgSlug, premio: l.premio },
  }));
}

/**
 * A coluna inteira numa resposta só (a tela consulta a cada poucos
 * segundos). Guardada por alguns segundos: com muita gente olhando, o banco
 * responde uma vez por janela, não uma por aparelho.
 */
const GUARDA_MS = 5_000;
let guardada: { ate: number; valor: Promise<unknown> } | null = null;

export function colunaAoVivo() {
  const agora = Date.now();
  if (guardada && guardada.ate > agora) return guardada.valor;
  const valor = (async () => {
    const [proximo, ganhadores, jogando] = await Promise.all([proximoSorteio(), ultimosGanhadores(), jogandoAgora()]);
    return { proximo, ganhadores, jogando };
  })();
  guardada = { ate: agora + GUARDA_MS, valor };
  // Falhou: não guarda o erro para os próximos.
  valor.catch(() => {
    if (guardada?.valor === valor) guardada = null;
  });
  return valor;
}

/** Para as provas: esquecer o que estava guardado. */
export function esquecerColunaAoVivo() {
  guardada = null;
}

