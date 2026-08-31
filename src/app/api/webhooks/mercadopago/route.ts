import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { StatusPagamento } from "@prisma/client";
import { assinaturaWebhookValida, consultarPagamento } from "@/lib/mercadopago";
import { confirmarPagamento, registrarAuditoria } from "@/lib/rifa";

export async function POST(req: NextRequest) {
  const corpo = await req.json().catch(() => null);
  const dataId = String(corpo?.data?.id ?? new URL(req.url).searchParams.get("data.id") ?? "");

  const valido = assinaturaWebhookValida({
    assinatura: req.headers.get("x-signature"),
    requestId: req.headers.get("x-request-id"),
    dataId: dataId || null,
  });

  if (!valido) {
    return NextResponse.json({ erro: "Assinatura inválida" }, { status: 401 });
  }

  if (corpo?.type !== "payment" || !dataId) {
    return NextResponse.json({ ignorado: true });
  }

  const pagamento = await prisma.pagamento.findUnique({ where: { idExterno: dataId } });
  if (!pagamento) {
    // Notificação de um pagamento que não é desta instalação: aceita e ignora,
    // para o Mercado Pago não ficar reenviando indefinidamente.
    return NextResponse.json({ ignorado: true });
  }

  const { status, bruto } = await consultarPagamento(dataId);

  if (status === "approved") {
    await confirmarPagamento({ compraId: pagamento.compraId, idExterno: dataId, dadosProvedor: bruto as object });
  } else if (status === "rejected" || status === "cancelled") {
    await prisma.pagamento.update({
      where: { id: pagamento.id },
      data: { status: StatusPagamento.RECUSADO, dadosProvedor: bruto as object },
    });
  } else if (status === "refunded" || status === "charged_back") {
    await prisma.pagamento.update({
      where: { id: pagamento.id },
      data: { status: StatusPagamento.ESTORNADO, dadosProvedor: bruto as object },
    });
  }

  await registrarAuditoria({
    acao: "webhook.pagamento",
    entidade: "Pagamento",
    entidadeId: pagamento.id,
    dados: { status },
  });

  return NextResponse.json({ ok: true });
}
