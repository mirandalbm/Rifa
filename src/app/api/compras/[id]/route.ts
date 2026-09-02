import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { StatusCompra } from "@prisma/client";
import { consultarPagamento } from "@/lib/mercadopago";
import { confirmarPagamento, formatarNumero, notificarCompraPaga } from "@/lib/rifa";

/// Consulta o estado da compra. O front-end chama isto em intervalos enquanto o
/// comprador está na tela do PIX; se o webhook ainda não chegou, confere direto
/// no provedor para não deixar o comprador esperando por uma notificação atrasada.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const compra = await prisma.compra.findUnique({
    where: { id },
    include: {
      rifa: { select: { titulo: true, quantidadeNumeros: true } },
      numeros: { select: { numero: true }, orderBy: { numero: "asc" } },
      pagamento: true,
      comprador: { select: { nome: true } },
    },
  });

  if (!compra) return NextResponse.json({ erro: "Compra não encontrada" }, { status: 404 });

  if (compra.status === StatusCompra.AGUARDANDO_PAGAMENTO && compra.pagamento?.idExterno) {
    try {
      const { status, bruto } = await consultarPagamento(compra.pagamento.idExterno);
      if (status === "approved") {
        const confirmadaAgora = await confirmarPagamento({
          compraId: compra.id,
          idExterno: compra.pagamento.idExterno,
          dadosProvedor: bruto as object,
        });
        if (confirmadaAgora) await notificarCompraPaga(compra.id);
        compra.status = StatusCompra.PAGA;
      }
    } catch {
      // Falha de consulta não é erro para o comprador: o webhook ainda resolve.
    }
  }

  return NextResponse.json({
    codigo: compra.codigo,
    status: compra.status,
    comprador: compra.comprador.nome,
    rifa: compra.rifa.titulo,
    quantidade: compra.quantidade,
    valorTotal: compra.valorTotal.toFixed(2),
    expiraEm: compra.expiraEm.toISOString(),
    numeros: compra.numeros.map((n) => formatarNumero(n.numero, compra.rifa.quantidadeNumeros)),
    pix: {
      copiaECola: compra.pagamento?.pixCopiaECola ?? null,
      qrCodeBase64: compra.pagamento?.pixQrCodeBase64 ?? null,
    },
  });
}
