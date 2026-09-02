import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { exigirPerfil } from "@/lib/auth";
import { esquemaNovaRifa } from "@/lib/validacoes";
import { gerarNumerosPendentes, registrarAuditoria } from "@/lib/rifa";

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
    },
  });

  // Rifa pequena gera na hora — a organizadora já vê tudo pronto. Rifa grande
  // não cabe numa requisição HTTP: 10 milhões de números levam minutos, e
  // qualquer proxy encerra a conexão antes. Por isso a resposta sai agora e a
  // geração segue em blocos; a venda fica barrada até terminar.
  const geraAgora = dados.quantidadeNumeros <= 100_000;

  if (geraAgora) {
    await gerarNumerosPendentes(rifa.id);
  } else {
    void gerarNumerosPendentes(rifa.id).catch((erro) =>
      console.error("Falha ao gerar números da rifa", rifa.id, erro),
    );
  }

  await registrarAuditoria({
    usuarioId: sessao.usuarioId,
    acao: "rifa.criada",
    entidade: "Rifa",
    entidadeId: rifa.id,
    dados: { titulo: rifa.titulo, quantidadeNumeros: rifa.quantidadeNumeros },
  });

  return NextResponse.json(
    { id: rifa.id, gerandoEmSegundoPlano: !geraAgora },
    { status: 201 },
  );
}

/// Retoma a geração de uma rifa que ficou pela metade (servidor reiniciado no
/// meio, por exemplo). Idempotente: continua de onde parou.
export async function PUT(req: NextRequest) {
  const sessao = await exigirPerfil("ORGANIZADORA");
  if (!sessao) return NextResponse.json({ erro: "Não autorizado" }, { status: 401 });

  const corpo = await req.json().catch(() => null);
  const id = String(corpo?.id ?? "");

  const rifa = await prisma.rifa.findFirst({
    where: { id, organizacaoId: sessao.organizacaoId },
    select: { id: true, quantidadeNumeros: true, numerosGerados: true },
  });
  if (!rifa) return NextResponse.json({ erro: "Rifa não encontrada" }, { status: 404 });

  if (rifa.numerosGerados >= rifa.quantidadeNumeros) {
    return NextResponse.json({ gerados: rifa.numerosGerados, concluida: true });
  }

  void gerarNumerosPendentes(rifa.id).catch((erro) =>
    console.error("Falha ao retomar geração da rifa", rifa.id, erro),
  );

  return NextResponse.json({ gerados: rifa.numerosGerados, concluida: false }, { status: 202 });
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

  // Abrir a venda antes de todos os números existirem venderia uma rifa
  // incompleta: os números ainda não gerados nunca poderiam ser comprados,
  // mas continuariam concorrendo no sorteio.
  if (status === "ABERTA" && rifa.numerosGerados < rifa.quantidadeNumeros) {
    const porcentagem = Math.floor((rifa.numerosGerados / rifa.quantidadeNumeros) * 100);
    return NextResponse.json(
      {
        erro: `Os números ainda estão sendo gerados (${porcentagem}%). Aguarde a conclusão para abrir a venda.`,
      },
      { status: 409 },
    );
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
