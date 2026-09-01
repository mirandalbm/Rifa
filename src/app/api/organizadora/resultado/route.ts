import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { StatusNumero } from "@prisma/client";
import { exigirPerfil } from "@/lib/auth";
import { esquemaPublicarResultado } from "@/lib/validacoes";
import { ErroDeNegocio, numeroVencedorPelaFederal, registrarAuditoria } from "@/lib/rifa";

/// Publicação do resultado. O número vencedor não é escolhido pela organizadora:
/// ele é derivado do 1º prêmio da Loteria Federal, que qualquer participante
/// pode conferir no site da Caixa.
export async function POST(req: NextRequest) {
  const sessao = await exigirPerfil("ORGANIZADORA");
  if (!sessao) return NextResponse.json({ erro: "Não autorizado" }, { status: 401 });

  const corpo = await req.json().catch(() => null);
  const analise = esquemaPublicarResultado.safeParse(corpo);
  if (!analise.success) {
    return NextResponse.json({ erro: analise.error.issues[0]?.message }, { status: 400 });
  }

  const dados = analise.data;

  const rifa = await prisma.rifa.findFirst({
    where: { id: dados.rifaId, organizacaoId: sessao.organizacaoId },
    include: { resultado: true },
  });

  if (!rifa) return NextResponse.json({ erro: "Rifa não encontrada" }, { status: 404 });
  if (rifa.resultado) {
    return NextResponse.json({ erro: "Esta rifa já teve o resultado publicado" }, { status: 409 });
  }

  // O 1º prêmio sempre entra primeiro; os demais só são exigidos em rifas
  // grandes, e a própria função recusa a apuração se faltarem.
  const premios = [dados.primeiroPremio, ...(dados.premiosFederal ?? [])];

  let numeroSorteado: number;
  try {
    numeroSorteado = numeroVencedorPelaFederal(premios, rifa.quantidadeNumeros);
  } catch (erro) {
    if (erro instanceof ErroDeNegocio) {
      return NextResponse.json({ erro: erro.message }, { status: 400 });
    }
    throw erro;
  }

  const vencedor = await prisma.numero.findFirst({
    where: { rifaId: rifa.id, numero: numeroSorteado, status: StatusNumero.PAGO },
    include: { compra: { include: { comprador: true } } },
  });

  const resultado = await prisma.$transaction(async (tx) => {
    const criado = await tx.resultado.create({
      data: {
        rifaId: rifa.id,
        numeroSorteado,
        concurso: dados.concurso,
        premiosFederal: premios,
        dataApuracao: dados.dataApuracao,
        compraVencedora: vencedor?.compraId ?? null,
        publicadoPorId: sessao.usuarioId,
        observacao: dados.observacao ?? null,
      },
    });

    await tx.rifa.update({ where: { id: rifa.id }, data: { status: "SORTEADA", concursoLoteriaFederal: dados.concurso } });

    return criado;
  });

  await registrarAuditoria({
    usuarioId: sessao.usuarioId,
    acao: "resultado.publicado",
    entidade: "Rifa",
    entidadeId: rifa.id,
    dados: { numeroSorteado, concurso: dados.concurso, houveVencedor: Boolean(vencedor) },
    ip: req.headers.get("x-forwarded-for"),
  });

  return NextResponse.json({
    numeroSorteado,
    resultadoId: resultado.id,
    vencedor: vencedor
      ? { nome: vencedor.compra?.comprador.nome, codigoCompra: vencedor.compra?.codigo }
      : null,
  });
}
