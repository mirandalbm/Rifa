import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { exigirPerfil } from "@/lib/auth";
import { esquemaNovaRifa } from "@/lib/validacoes";
import { registrarAuditoria } from "@/lib/rifa";

export async function POST(req: NextRequest) {
  const sessao = await exigirPerfil("ORGANIZADORA");
  if (!sessao) return NextResponse.json({ erro: "Não autorizado" }, { status: 401 });

  const corpo = await req.json().catch(() => null);
  const analise = esquemaNovaRifa.safeParse(corpo);
  if (!analise.success) {
    return NextResponse.json({ erro: analise.error.issues[0]?.message }, { status: 400 });
  }

  const dados = analise.data;

  const rifa = await prisma.rifa.create({
    data: {
      organizacaoId: sessao.organizacaoId,
      titulo: dados.titulo,
      descricao: dados.descricao ?? null,
      premio: dados.premio,
      precoPorNumero: dados.precoPorNumero,
      quantidadeNumeros: dados.quantidadeNumeros,
      limiteNumerosPorCompra: dados.limiteNumerosPorCompra,
      minutosParaPagar: dados.minutosParaPagar,
      dataSorteio: dados.dataSorteio,
      autorizacaoNumero: dados.autorizacaoNumero ?? null,
      regulamentoUrl: dados.regulamentoUrl ?? null,
      numeros: {
        createMany: {
          data: Array.from({ length: dados.quantidadeNumeros }, (_, numero) => ({ numero })),
        },
      },
    },
  });

  await registrarAuditoria({
    usuarioId: sessao.usuarioId,
    acao: "rifa.criada",
    entidade: "Rifa",
    entidadeId: rifa.id,
    dados: { titulo: rifa.titulo, quantidadeNumeros: rifa.quantidadeNumeros },
  });

  return NextResponse.json({ id: rifa.id }, { status: 201 });
}

export async function PATCH(req: NextRequest) {
  const sessao = await exigirPerfil("ORGANIZADORA");
  if (!sessao) return NextResponse.json({ erro: "Não autorizado" }, { status: 401 });

  const corpo = await req.json().catch(() => null);
  const id = String(corpo?.id ?? "");
  const status = String(corpo?.status ?? "");

  if (!id || !["RASCUNHO", "ABERTA", "ENCERRADA", "CANCELADA"].includes(status)) {
    return NextResponse.json({ erro: "Dados inválidos" }, { status: 400 });
  }

  const rifa = await prisma.rifa.findFirst({ where: { id, organizacaoId: sessao.organizacaoId } });
  if (!rifa) return NextResponse.json({ erro: "Rifa não encontrada" }, { status: 404 });
  if (rifa.status === "SORTEADA") {
    return NextResponse.json({ erro: "Rifa já sorteada não pode mudar de status" }, { status: 409 });
  }

  await prisma.rifa.update({ where: { id }, data: { status: status as never } });
  await registrarAuditoria({
    usuarioId: sessao.usuarioId,
    acao: "rifa.status",
    entidade: "Rifa",
    entidadeId: id,
    dados: { de: rifa.status, para: status },
  });

  return NextResponse.json({ ok: true });
}
