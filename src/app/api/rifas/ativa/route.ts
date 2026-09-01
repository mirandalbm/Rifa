import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { StatusNumero } from "@prisma/client";
import { LIMITE_GRADE_VISUAL, liberarReservasExpiradas } from "@/lib/rifa";

export const dynamic = "force-dynamic";

/// Rifa aberta no momento, com a situação de cada número para montar a grade.
export async function GET() {
  const rifa = await prisma.rifa.findFirst({
    where: { status: "ABERTA" },
    orderBy: { criadaEm: "desc" },
  });

  if (!rifa) return NextResponse.json({ rifa: null });

  await liberarReservasExpiradas(rifa.id);

  // Numa rifa grande, carregar linha por linha significaria trazer milhões de
  // registros a cada visita. As contagens saem do índice; a lista detalhada só
  // é montada quando a grade cabe na tela.
  const modoGrade = rifa.quantidadeNumeros <= LIMITE_GRADE_VISUAL;

  const vendidos = await prisma.numero.count({
    where: { rifaId: rifa.id, status: StatusNumero.PAGO },
  });

  const indisponiveis = modoGrade
    ? (
        await prisma.numero.findMany({
          where: { rifaId: rifa.id, status: { not: StatusNumero.DISPONIVEL } },
          select: { numero: true },
          orderBy: { numero: "asc" },
        })
      ).map((n) => n.numero)
    : [];

  // Contar DISPONIVEL varreria quase a tabela toda (9,9 milhões de linhas numa
  // rifa nova: ~780ms por visita). Os ocupados são poucos, então conta-se esses
  // e o resto sai por subtração — instantâneo pelo índice (rifaId, status).
  const ocupados = modoGrade
    ? indisponiveis.length
    : await prisma.numero.count({
        where: {
          rifaId: rifa.id,
          status: { in: [StatusNumero.PAGO, StatusNumero.RESERVADO] },
        },
      });

  const disponiveis = rifa.quantidadeNumeros - ocupados;

  return NextResponse.json({
    rifa: {
      id: rifa.id,
      titulo: rifa.titulo,
      descricao: rifa.descricao,
      premio: rifa.premio,
      precoPorNumero: rifa.precoPorNumero.toFixed(2),
      quantidadeNumeros: rifa.quantidadeNumeros,
      limiteNumerosPorCompra: rifa.limiteNumerosPorCompra,
      minutosParaPagar: rifa.minutosParaPagar,
      dataSorteio: rifa.dataSorteio.toISOString(),
      autorizacaoNumero: rifa.autorizacaoNumero,
      regulamentoUrl: rifa.regulamentoUrl,
      vendidos,
      disponiveis,
      modoGrade,
    },
    // Indisponível cobre pago e reservado: para quem está comprando, a diferença
    // não importa — só importa se pode clicar. Vazio fora do modo grade.
    indisponiveis,
  });
}
