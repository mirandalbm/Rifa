/**
 * Pix que chegou tarde — o pagamento foi confirmado pelo provedor, mas o
 * pedido já não podia virar cota: a reserva tinha vencido (os números
 * voltaram ao estoque) ou a rifa já tinha sido sorteada (o quadro está
 * congelado). É dinheiro que entrou sem bilhete, e a pessoa tem direito a
 * receber de volta.
 *
 * Antes isto só ia ao log. Agora cada caso entra numa fila
 * (`pix_tardios`, um por pedido — o webhook repetido não duplica) que a
 * plataforma vê e resolve: devolver pelo provedor (o mesmo `refund` do
 * estorno, com o valor explícito) ou marcar como resolvido, com uma
 * observação, quando a devolução foi feita por fora. Só a plataforma (403
 * para organizador): o dinheiro passou pela conta dela.
 */
import { ehUuid } from "@shared/uuid";
import type { Request } from "express";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "../db";
import { auditLog, campaigns, orders, pixTardios } from "@shared/schema";
import { paymentProviderByName } from "../payments";
import { requirePlatformAdmin } from "./orgs";
import type { MotivoDoPixTardio } from "@shared/pixTardio";

export class PixTardioError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}

type PedidoTardio = Pick<typeof orders.$inferSelect, "id" | "code" | "amountCents" | "pspProvider" | "pspChargeId">;

/**
 * Anota o Pix tardio. **Lança se o banco falhar**: quem chama é a confirmação
 * do pagamento (o webhook), e engolir o erro concluía o evento com o dinheiro
 * sem cota e fora da fila — a devolução só existiria num `console.error`. Com
 * a falha propagada, o webhook solta o evento e o reenvio do provedor tenta de
 * novo. É idempotente (`uq_pix_tardio_pedido`, `ON CONFLICT DO NOTHING`).
 */
export async function registrarPixTardio(pedido: PedidoTardio, motivo: MotivoDoPixTardio) {
  console.error(`[pix tardio] Pix do pedido ${pedido.code} confirmado tarde (${motivo}): ${pedido.amountCents} centavos a devolver.`);
  await db
    .insert(pixTardios)
    .values({
      orderId: pedido.id,
      provider: pedido.pspProvider,
      chargeId: pedido.pspChargeId,
      valorCents: pedido.amountCents,
      motivo,
    })
    .onConflictDoNothing();
}

/** A fila: os pendentes primeiro, depois os 50 últimos resolvidos. Sem nome nem telefone de comprador. */
export async function listarPixTardios(req: Request) {
  requirePlatformAdmin(req);
  const campos = {
    id: pixTardios.id,
    motivo: pixTardios.motivo,
    status: pixTardios.status,
    valorCents: pixTardios.valorCents,
    provider: pixTardios.provider,
    erro: pixTardios.erro,
    observacao: pixTardios.observacao,
    createdAt: pixTardios.createdAt,
    resolvidoEm: pixTardios.resolvidoEm,
    pedido: orders.code,
    rifa: campaigns.title,
  };
  const base = () =>
    db
      .select(campos)
      .from(pixTardios)
      .innerJoin(orders, eq(orders.id, pixTardios.orderId))
      .leftJoin(campaigns, eq(campaigns.id, orders.campaignId));
  const [abertos, resolvidos] = await Promise.all([
    base().where(inArray(pixTardios.status, ["pendente", "devolvendo"])).orderBy(pixTardios.createdAt).limit(200),
    base().where(inArray(pixTardios.status, ["devolvido", "resolvido"])).orderBy(desc(pixTardios.resolvidoEm)).limit(50),
  ]);
  return { abertos, resolvidos };
}

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

async function auditar(tx: Tx, req: Request, id: string, action: string, diff: Record<string, unknown>) {
  await tx.insert(auditLog).values({
    actorId: req.user?.id ?? null,
    actorRole: req.user?.role ?? null,
    action,
    entity: "pix_tardio",
    entityId: id,
    diff,
    ip: req.ip,
  });
}

/**
 * Devolve pelo provedor. Toma o caso (`pendente` → `devolvendo`) antes de
 * chamar: dois cliques, uma devolução e um 409. O que se sabe antes de
 * chamar (sem cobrança, provedor que não devolve pelo sistema) volta a
 * `pendente`: nada saiu. Mas o provedor que deu erro **depois** de chamado
 * pode ter devolvido (prazo estourado, rede caída na resposta — o Asaas não
 * tem chave de idempotência): o caso fica em `devolvendo`, com o motivo,
 * e só se fecha por "resolver" depois de conferir no provedor. Voltar a
 * `pendente` deixaria o próximo clique devolver duas vezes.
 */
const UUID = { test: (v: unknown) => ehUuid(v) };

export async function devolverPixTardio(req: Request, id: string) {
  requirePlatformAdmin(req);
  if (!UUID.test(id)) throw new PixTardioError("Pix não encontrado.", 404);
  const [caso] = await db
    .update(pixTardios)
    .set({ status: "devolvendo", erro: null })
    .where(and(eq(pixTardios.id, id), eq(pixTardios.status, "pendente")))
    .returning();
  if (!caso) throw new PixTardioError("Este Pix já foi resolvido ou está sendo devolvido.", 409);

  const voltarParaAFila = async (msg: string) => {
    await db
      .update(pixTardios)
      .set({ status: "pendente", erro: msg })
      .where(and(eq(pixTardios.id, id), eq(pixTardios.status, "devolvendo")));
    throw new PixTardioError(msg, 409);
  };
  if (!caso.provider || !caso.chargeId) {
    return voltarParaAFila("Este pagamento não tem cobrança no provedor: devolva por fora e marque como resolvido.");
  }
  const provider = paymentProviderByName(caso.provider);
  if (!provider.refund) {
    return voltarParaAFila("Este provedor não devolve pelo sistema: devolva por fora e marque como resolvido.");
  }
  try {
    // Valor sempre explícito (no carrinho a cobrança é de várias rifas) e a
    // chave do caso: duas devoluções da mesma cobrança não viram uma só.
    await provider.refund(caso.chargeId, caso.valorCents, `pix-tardio-${caso.id}`);
  } catch (err) {
    const msg = `O provedor não confirmou a devolução (${(err as Error).message}). Confira no provedor: se o dinheiro voltou, marque como resolvido; se não, devolva por fora e marque como resolvido.`;
    await db
      .update(pixTardios)
      .set({ erro: msg.slice(0, 500) })
      .where(and(eq(pixTardios.id, id), eq(pixTardios.status, "devolvendo")));
    throw new PixTardioError(msg, 502);
  }
  await db.transaction(async (tx) => {
    await tx
      .update(pixTardios)
      .set({ status: "devolvido", erro: null, resolvidoEm: new Date(), resolvidoPor: req.user?.id ?? null })
      .where(and(eq(pixTardios.id, id), eq(pixTardios.status, "devolvendo")));
    await auditar(tx, req, id, "pix_tardio.devolvido", { valorCents: caso.valorCents, provider: caso.provider });
  });
  return { status: "devolvido" as const };
}

/**
 * A devolução foi feita por fora, ou conferida no provedor depois de um erro
 * (o caso parado em `devolvendo`): fecha com uma observação.
 */
export async function resolverPixTardio(req: Request, id: string, bruto: unknown) {
  requirePlatformAdmin(req);
  if (!UUID.test(id)) throw new PixTardioError("Pix não encontrado.", 404);
  const observacao = typeof bruto === "string" ? bruto.replace(/\s+/g, " ").trim().slice(0, 300) : "";
  if (observacao.length < 5) throw new PixTardioError("Diga como foi resolvido (por exemplo, devolvido por Pix manual).");
  return db.transaction(async (tx) => {
    const [caso] = await tx
      .update(pixTardios)
      .set({ status: "resolvido", observacao, erro: null, resolvidoEm: new Date(), resolvidoPor: req.user?.id ?? null })
      .where(and(eq(pixTardios.id, id), inArray(pixTardios.status, ["pendente", "devolvendo"])))
      .returning({ id: pixTardios.id, valorCents: pixTardios.valorCents });
    if (!caso) throw new PixTardioError("Este Pix já foi resolvido.", 409);
    await auditar(tx, req, id, "pix_tardio.resolvido", { valorCents: caso.valorCents, observacao });
    return { status: "resolvido" as const };
  });
}
