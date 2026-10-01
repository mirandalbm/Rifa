/**
 * A busca única do painel, no servidor: acha pedido pelo código, cliente pelo
 * ID e organização pelo nome, sempre dentro do recorte de quem busca
 * (`orgOf`). O que o vizinho tem simplesmente não aparece — a resposta é a
 * mesma lista vazia de "não existe", nunca um 403 que entregaria que o
 * código é válido.
 *
 * Nada aqui devolve nome, telefone ou CPF de comprador: o pedido vem com a
 * rifa e a situação, o cliente só com o ID e quantos pedidos ele tem no
 * recorte. Quem é o cliente continua sendo regra da tela de pedidos
 * (`shared/titularidade.ts`).
 */
import { and, desc, eq, ilike, isNull, or, sql } from "drizzle-orm";
import { db } from "../db";
import { buyers, campaigns, orders, organizations } from "@shared/schema";
import { ACHADOS_MAX, caminhoDoAchado, interpretarBusca, type AchadoDaBusca } from "@shared/busca";

const SITUACAO_DO_PEDIDO: Record<string, string> = {
  paid: "pago",
  pending: "pendente",
  expired: "expirado",
  refunded: "estornado",
};

/** `%` e `_` do texto digitado viram literais: "100%" não pode casar com tudo. */
function escaparLike(texto: string): string {
  return texto.replace(/[\\%_]/g, (c) => `\\${c}`);
}

export async function buscarNoPainel(organizationId: string | null, texto: string): Promise<AchadoDaBusca[]> {
  const consulta = interpretarBusca(texto);
  if (!consulta) return [];
  const escopo = organizationId ? eq(campaigns.organizationId, organizationId) : sql`TRUE`;

  if (consulta.tipo === "pedido") {
    const [achado] = await db
      .select({ code: orders.code, status: orders.status, titulo: campaigns.title })
      .from(orders)
      .innerJoin(campaigns, eq(campaigns.id, orders.campaignId))
      .where(and(eq(orders.code, consulta.codigo), escopo))
      .limit(1);
    if (!achado) return [];
    return [
      {
        tipo: "pedido",
        rotulo: `Pedido #${achado.code}`,
        detalhe: `${achado.titulo} · ${SITUACAO_DO_PEDIDO[achado.status] ?? achado.status}`,
        caminho: caminhoDoAchado({ tipo: "pedido", codigo: achado.code }),
      },
    ];
  }

  if (consulta.tipo === "cliente") {
    // Só pelo ID e só pelos pedidos dentro do recorte: o cliente que nunca
    // comprou rifa desta organização não existe para ela. Sem nome: a lista
    // de pedidos é quem decide, pedido a pedido, se o nome aparece.
    const [achado] = await db
      .select({
        codigo: buyers.codigo,
        pedidos: sql<number>`count(${orders.id})::int`,
      })
      .from(buyers)
      .innerJoin(orders, eq(orders.buyerId, buyers.id))
      .innerJoin(campaigns, eq(campaigns.id, orders.campaignId))
      .where(and(eq(buyers.codigo, consulta.codigo), escopo))
      .groupBy(buyers.codigo);
    if (!achado) return [];
    return [
      {
        tipo: "cliente",
        rotulo: `Cliente ${achado.codigo}`,
        detalhe: achado.pedidos === 1 ? "1 pedido" : `${achado.pedidos} pedidos`,
        caminho: caminhoDoAchado({ tipo: "cliente", codigo: achado.codigo! }),
      },
    ];
  }

  // Organização é só da plataforma: o organizador só tem a dele, e a tela
  // dela já está no menu.
  if (organizationId) return [];
  const padrao = `%${escaparLike(consulta.texto)}%`;
  const achadas = await db
    .select({
      id: organizations.id,
      name: organizations.name,
      slug: organizations.slug,
      cidade: organizations.cidade,
      uf: organizations.uf,
      arquivada: sql<boolean>`${organizations.archivedAt} IS NOT NULL`,
    })
    .from(organizations)
    .where(or(ilike(organizations.name, padrao), ilike(organizations.slug, padrao)))
    // As ativas primeiro, depois por nome.
    .orderBy(desc(isNull(organizations.archivedAt)), organizations.name)
    .limit(ACHADOS_MAX);
  return achadas.map((o) => ({
    tipo: "organizacao" as const,
    rotulo: o.name,
    detalhe: [o.cidade && o.uf ? `${o.cidade}/${o.uf}` : `/o/${o.slug}`, o.arquivada ? "arquivada" : null]
      .filter(Boolean)
      .join(" · "),
    caminho: caminhoDoAchado({ tipo: "organizacao", id: o.id }),
  }));
}
