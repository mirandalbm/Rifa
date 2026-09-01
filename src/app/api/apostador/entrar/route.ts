import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { conferirSenha, criarSessaoApostador } from "@/lib/auth";
import { esquemaLogin } from "@/lib/validacoes";

export async function POST(req: NextRequest) {
  const corpo = await req.json().catch(() => null);
  const analise = esquemaLogin.safeParse(corpo);

  if (!analise.success) {
    return NextResponse.json({ erro: "Usuário ou senha inválidos" }, { status: 400 });
  }

  const identificador = analise.data.identificador.toLowerCase();

  const conta = await prisma.contaApostador.findFirst({
    where: { OR: [{ usuario: identificador }, { email: identificador }] },
  });

  // Resposta idêntica para conta inexistente, inativa e senha errada.
  const senhaConfere = conta ? await conferirSenha(analise.data.senha, conta.senhaHash) : false;
  if (!conta || !conta.ativo || !senhaConfere) {
    return NextResponse.json({ erro: "Usuário ou senha inválidos" }, { status: 401 });
  }

  await criarSessaoApostador({ contaId: conta.id, nome: conta.nome, usuario: conta.usuario });
  await prisma.contaApostador.update({
    where: { id: conta.id },
    data: { ultimoLogin: new Date() },
  });

  return NextResponse.json({ destino: "/minha-conta" });
}
