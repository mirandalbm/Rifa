import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { exigirPerfil, hashSenha } from "@/lib/auth";
import { esquemaNovoAfiliado } from "@/lib/validacoes";
import { registrarAuditoria } from "@/lib/rifa";
import crypto from "crypto";

function gerarCodigoAfiliado(nome: string): string {
  const base = nome
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z]/g, "")
    .slice(0, 8)
    .toUpperCase();
  return `${base || "AFIL"}${crypto.randomInt(1000, 9999)}`;
}

export async function POST(req: NextRequest) {
  const sessao = await exigirPerfil("ORGANIZADORA");
  if (!sessao) return NextResponse.json({ erro: "Não autorizado" }, { status: 401 });

  const corpo = await req.json().catch(() => null);
  const analise = esquemaNovoAfiliado.safeParse(corpo);
  if (!analise.success) {
    return NextResponse.json({ erro: analise.error.issues[0]?.message }, { status: 400 });
  }

  const dados = analise.data;

  const jaExiste = await prisma.usuario.findUnique({ where: { email: dados.email } });
  if (jaExiste) return NextResponse.json({ erro: "Já existe um usuário com este e-mail" }, { status: 409 });

  const afiliado = await prisma.$transaction(async (tx) => {
    const usuario = await tx.usuario.create({
      data: {
        organizacaoId: sessao.organizacaoId,
        nome: dados.nome,
        email: dados.email,
        senhaHash: await hashSenha(dados.senha),
        perfil: "AFILIADO",
      },
    });

    return tx.afiliado.create({
      data: {
        organizacaoId: sessao.organizacaoId,
        usuarioId: usuario.id,
        codigo: gerarCodigoAfiliado(dados.nome),
        telefone: dados.telefone ?? null,
        chavePixRecebimento: dados.chavePixRecebimento ?? null,
        percentualComissao: dados.percentualComissao,
      },
    });
  });

  await registrarAuditoria({
    usuarioId: sessao.usuarioId,
    acao: "afiliado.criado",
    entidade: "Afiliado",
    entidadeId: afiliado.id,
    dados: { codigo: afiliado.codigo, percentual: dados.percentualComissao },
  });

  return NextResponse.json({ id: afiliado.id, codigo: afiliado.codigo }, { status: 201 });
}

/// Marca comissões como pagas depois que a organizadora fez o repasse ao afiliado.
export async function PATCH(req: NextRequest) {
  const sessao = await exigirPerfil("ORGANIZADORA");
  if (!sessao) return NextResponse.json({ erro: "Não autorizado" }, { status: 401 });

  const corpo = await req.json().catch(() => null);
  const comissaoIds: string[] = Array.isArray(corpo?.comissaoIds) ? corpo.comissaoIds : [];
  if (comissaoIds.length === 0) {
    return NextResponse.json({ erro: "Informe as comissões a marcar como pagas" }, { status: 400 });
  }

  const atualizadas = await prisma.comissao.updateMany({
    where: {
      id: { in: comissaoIds },
      status: { in: ["PENDENTE", "APROVADA"] },
      afiliado: { organizacaoId: sessao.organizacaoId },
    },
    data: { status: "PAGA", pagaEm: new Date() },
  });

  await registrarAuditoria({
    usuarioId: sessao.usuarioId,
    acao: "comissao.paga",
    entidade: "Comissao",
    dados: { quantidade: atualizadas.count },
  });

  return NextResponse.json({ atualizadas: atualizadas.count });
}
