/**
 * Bilhete da rifa.
 *
 * O mesmo conteúdo sai em três lugares: na tela (para imprimir em A4 ou em
 * bobina de 58 mm), no texto ESC/POS da impressora da maquininha e no
 * comprovante que o cambista entrega na mão. Por isso os dados são montados
 * uma vez só, aqui — a formatação mora em `ticketFormat.ts`.
 */
import { eq } from "drizzle-orm";
import { db } from "../db";
import { orders, buyers, campaigns, quotaAlloc, affiliates, users, draws } from "@shared/schema";
import { formatQuota, hidePhone, hideCpf } from "@shared/format";
import { organizerInfoOf } from "./orgs";
import { garantirCodigoCliente } from "./codigoCliente";
import { METODO_LABEL, SITUACAO_LABEL, type TicketData } from "./ticketFormat";

export type { TicketData } from "./ticketFormat";
export { escPosTicket } from "./ticketFormat";

export async function buildTicket(code: number): Promise<TicketData | null> {
  const [row] = await db
    .select({ order: orders, buyer: buyers, campaign: campaigns })
    .from(orders)
    .innerJoin(buyers, eq(buyers.id, orders.buyerId))
    .innerJoin(campaigns, eq(campaigns.id, orders.campaignId))
    .where(eq(orders.code, code));
  if (!row) return null;

  const numeros = await db
    .select({ number: quotaAlloc.number })
    .from(quotaAlloc)
    .where(eq(quotaAlloc.orderId, row.order.id))
    .orderBy(quotaAlloc.number);

  const [draw] = await db
    .select({ seedHash: draws.seedHash })
    .from(draws)
    .where(eq(draws.campaignId, row.campaign.id));

  let vendedor: TicketData["vendedor"] = null;
  if (row.order.sellerId) {
    const [seller] = await db
      .select({ nome: users.name, codigo: affiliates.code })
      .from(affiliates)
      .innerJoin(users, eq(users.id, affiliates.userId))
      .where(eq(affiliates.id, row.order.sellerId));
    if (seller) vendedor = seller;
  }

  return {
    codigo: row.order.code,
    emitidoEm: new Date().toISOString(),
    // A administradora é a organização promotora DESTA rifa, não a da
    // plataforma: é ela que a Lei 5.768/71 autoriza, e é o nome dela que
    // responde pelo bilhete.
    administradora: await organizerInfoOf(row.campaign.organizationId),
    apostador: {
      nome: row.buyer.name,
      // O bilhete é público pelo código do pedido: telefone e CPF saem
      // escondidos, como no ranking. Quem precisa do dado inteiro é o painel.
      telefone: hidePhone(row.buyer.phone),
      cpf: row.buyer.cpf ? hideCpf(row.buyer.cpf) : null,
      id: await garantirCodigoCliente(row.buyer.id),
    },
    rifa: {
      titulo: row.campaign.title,
      premio: row.campaign.prizeTitle,
      totalCotas: row.campaign.totalQuotas,
      precoCota: row.campaign.priceCents,
      autorizacao: row.campaign.authorizationCode,
    },
    sorteio: {
      data: row.campaign.drawAt ? row.campaign.drawAt.toISOString() : null,
      metodo: "Loteria Federal + semente publicada (HMAC)",
      seedHash: draw?.seedHash ?? row.campaign.drawSeedHash ?? null,
    },
    numeros: numeros.map((n) => formatQuota(n.number, row.campaign.totalQuotas)),
    pagamento: {
      metodo: METODO_LABEL[row.order.method] ?? row.order.method,
      situacao: SITUACAO_LABEL[row.order.status] ?? row.order.status,
      total: row.order.amountCents,
      desconto: row.order.discountCents,
      autorizacao: row.order.posAuthCode,
    },
    vendedor,
  };
}

/** Marca o bilhete como impresso — serve de trilha para reimpressão. */
export async function markTicketPrinted(code: number) {
  await db
    .update(orders)
    .set({ ticketPrintedAt: new Date() })
    .where(eq(orders.code, code));
}
