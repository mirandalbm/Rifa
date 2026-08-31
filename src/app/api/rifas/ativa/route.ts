import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { StatusNumero } from "@prisma/client";
import { liberarReservasExpiradas } from "@/lib/rifa";

export const dynamic = "force-dynamic";

/// Rifa aberta no momento, com a situação de cada número para montar a grade.
export async function GET() {
  const rifa = await prisma.rifa.findFirst({
    where: { status: "ABERTA" },
    orderBy: { criadaEm: "desc" },
  });

  if (!rifa) return NextResponse.json({ rifa: null });

  await liberarReservasExpiradas(rifa.id);

  const numeros = await prisma.numero.findMany({
    where: { rifaId: rifa.id },
    select: { numero: true, status: true },
    orderBy: { numero: "asc" },
  });

  const vendidos = numeros.filter((n) => n.status === StatusNumero.PAGO).length;

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
    },
    // Indisponível cobre pago e reservado: para quem está comprando, a diferença
    // não importa — só importa se pode clicar.
    indisponiveis: numeros.filter((n) => n.status !== StatusNumero.DISPONIVEL).map((n) => n.numero),
  });
}
