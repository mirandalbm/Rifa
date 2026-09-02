import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ErroDeNegocio, criarCompra } from "@/lib/rifa";
import { criarCobrancaPix } from "@/lib/mercadopago";
import { esquemaNovaCompra } from "@/lib/validacoes";
import { lerSessaoApostador } from "@/lib/auth";
import { decimal } from "@/lib/dinheiro";
import crypto from "crypto";

export async function POST(req: NextRequest) {
  const corpo = await req.json().catch(() => null);
  const analise = esquemaNovaCompra.safeParse(corpo);

  if (!analise.success) {
    return NextResponse.json(
      { erro: analise.error.issues[0]?.message ?? "Dados inválidos" },
      { status: 400 },
    );
  }

  const { rifaId, numeros, quantidade, comprador, codigoAfiliado } = analise.data;

  // A conta vem da sessão, nunca do corpo do pedido: senão qualquer um poderia
  // lançar compras na conta de outra pessoa.
  const sessao = await lerSessaoApostador();

  let compra;
  try {
    compra = await criarCompra({
      rifaId,
      numeros,
      quantidade,
      comprador,
      contaId: sessao?.contaId ?? null,
      codigoAfiliado,
    });
  } catch (erro) {
    if (erro instanceof ErroDeNegocio) {
      return NextResponse.json({ erro: erro.message }, { status: 409 });
    }
    throw erro;
  }

  const chaveIdempotencia = crypto.randomUUID();

  // O registro do pagamento nasce antes da chamada externa: se o Mercado Pago
  // responder e a gravação falhar depois, a cobrança ainda tem rastro local.
  await prisma.pagamento.create({
    data: {
      compraId: compra.compraId,
      valor: compra.valorTotal,
      chaveIdempotencia,
      expiraEm: compra.expiraEm,
    },
  });

  try {
    const cobranca = await criarCobrancaPix({
      valor: decimal(compra.valorTotal).toNumber(),
      descricao: `Rifa — compra ${compra.codigo}`,
      chaveIdempotencia,
      expiraEm: compra.expiraEm,
      pagador: { nome: comprador.nome, email: comprador.email, cpf: comprador.cpf },
    });

    await prisma.pagamento.update({
      where: { compraId: compra.compraId },
      data: {
        idExterno: cobranca.idExterno,
        pixCopiaECola: cobranca.copiaECola,
        pixQrCodeBase64: cobranca.qrCodeBase64,
        dadosProvedor: cobranca.bruto as object,
      },
    });
  } catch (erro) {
    console.error("Falha ao gerar cobrança PIX", erro);

    // Sem cobrança não há como pagar: devolve os números ao estoque na hora, em
    // vez de deixá-los presos até a reserva expirar.
    await prisma.$transaction([
      prisma.numero.updateMany({
        where: { compraId: compra.compraId },
        data: { status: "DISPONIVEL", compraId: null, reservadoAte: null },
      }),
      prisma.compra.update({ where: { id: compra.compraId }, data: { status: "CANCELADA" } }),
      prisma.pagamento.update({
        where: { compraId: compra.compraId },
        data: { status: "RECUSADO" },
      }),
    ]);

    return NextResponse.json(
      { erro: "Não foi possível gerar a cobrança PIX agora. Tente novamente em instantes." },
      { status: 502 },
    );
  }

  return NextResponse.json({ compraId: compra.compraId, codigo: compra.codigo }, { status: 201 });
}
