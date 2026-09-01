import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { StatusNumero, TipoMidia } from "@prisma/client";

export const dynamic = "force-dynamic";

/// Todas as rifas abertas, para a vitrine. Só o resumo de cada uma — a situação
/// número a número fica na página da rifa, que é onde ela é usada.
export async function GET() {
  const rifas = await prisma.rifa.findMany({
    where: { status: "ABERTA" },
    orderBy: { dataSorteio: "asc" },
    include: { midias: { where: { tipo: TipoMidia.BANNER }, select: { id: true }, take: 1 } },
  });

  // Uma contagem por rifa, pelo índice (rifaId, status) — barato mesmo com
  // milhões de números, porque conta só os vendidos.
  const resumo = await Promise.all(
    rifas.map(async (rifa) => ({
      id: rifa.id,
      titulo: rifa.titulo,
      descricao: rifa.descricao,
      premio: rifa.premio,
      precoPorNumero: rifa.precoPorNumero.toFixed(2),
      quantidadeNumeros: rifa.quantidadeNumeros,
      dataSorteio: rifa.dataSorteio.toISOString(),
      banner: rifa.midias[0]?.id ?? null,
      vendidos: await prisma.numero.count({
        where: { rifaId: rifa.id, status: StatusNumero.PAGO },
      }),
    })),
  );

  return NextResponse.json({ rifas: resumo });
}
