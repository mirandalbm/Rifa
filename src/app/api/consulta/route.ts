import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { esquemaConsultaNumeros } from "@/lib/validacoes";
import { formatarNumero } from "@/lib/rifa";

/// Consulta pública de "meus números" por CPF, telefone ou código da compra.
export async function POST(req: NextRequest) {
  const corpo = await req.json().catch(() => null);
  const analise = esquemaConsultaNumeros.safeParse(corpo);

  if (!analise.success) {
    return NextResponse.json({ erro: analise.error.issues[0]?.message }, { status: 400 });
  }

  const termo = analise.data.termo;
  const digitos = termo.replace(/\D/g, "");

  const compras = await prisma.compra.findMany({
    where: {
      OR: [
        { codigo: termo.toUpperCase() },
        ...(digitos.length >= 10 ? [{ comprador: { cpf: digitos } }, { comprador: { telefone: digitos } }] : []),
      ],
    },
    include: {
      rifa: { select: { titulo: true, quantidadeNumeros: true, dataSorteio: true } },
      numeros: { select: { numero: true }, orderBy: { numero: "asc" } },
      comprador: { select: { nome: true } },
    },
    orderBy: { criadaEm: "desc" },
    take: 50,
  });

  return NextResponse.json({
    compras: compras.map((compra) => ({
      codigo: compra.codigo,
      rifa: compra.rifa.titulo,
      comprador: compra.comprador.nome,
      status: compra.status,
      valorTotal: compra.valorTotal.toFixed(2),
      dataSorteio: compra.rifa.dataSorteio.toISOString(),
      criadaEm: compra.criadaEm.toISOString(),
      numeros: compra.numeros.map((n) => formatarNumero(n.numero, compra.rifa.quantidadeNumeros)),
    })),
  });
}
