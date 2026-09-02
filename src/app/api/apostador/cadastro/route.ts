import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { criarSessaoApostador, hashSenha } from "@/lib/auth";
import { esquemaCadastroApostador } from "@/lib/validacoes";

export async function POST(req: NextRequest) {
  const corpo = await req.json().catch(() => null);
  const analise = esquemaCadastroApostador.safeParse(corpo);

  if (!analise.success) {
    return NextResponse.json({ erro: analise.error.issues[0]?.message }, { status: 400 });
  }

  const dados = analise.data;

  const jaExiste = await prisma.contaApostador.findFirst({
    where: { OR: [{ usuario: dados.usuario }, { email: dados.email }] },
    select: { usuario: true },
  });

  if (jaExiste) {
    // Dizer qual dos dois está em uso é aceitável aqui: são dados que a pessoa
    // precisa corrigir, e um cadastro é público por natureza.
    return NextResponse.json(
      {
        erro:
          jaExiste.usuario === dados.usuario
            ? "Este nome de usuário já está em uso."
            : "Já existe uma conta com este e-mail.",
      },
      { status: 409 },
    );
  }

  const conta = await prisma.contaApostador.create({
    data: {
      usuario: dados.usuario,
      nome: dados.nome,
      email: dados.email,
      telefone: dados.telefone,
      cpf: dados.cpf ?? null,
      senhaHash: await hashSenha(dados.senha),
    },
  });

  await criarSessaoApostador({ contaId: conta.id, nome: conta.nome, usuario: conta.usuario });

  return NextResponse.json({ usuario: conta.usuario }, { status: 201 });
}
