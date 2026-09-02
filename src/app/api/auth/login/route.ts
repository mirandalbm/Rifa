import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { conferirSenha, criarSessao } from "@/lib/auth";
import { esquemaLogin } from "@/lib/validacoes";
import { registrarAuditoria } from "@/lib/rifa";

export async function POST(req: NextRequest) {
  const corpo = await req.json().catch(() => null);
  const analise = esquemaLogin.safeParse(corpo);

  if (!analise.success) {
    return NextResponse.json({ erro: "Usuário ou senha inválidos" }, { status: 400 });
  }

  const identificador = analise.data.identificador.toLowerCase();

  const usuario = await prisma.usuario.findFirst({
    where: { OR: [{ usuario: identificador }, { email: identificador }] },
  });

  // Mesma resposta para usuário inexistente, inativo e senha errada: um atacante
  // não consegue descobrir quais contas existem.
  const senhaConfere = usuario ? await conferirSenha(analise.data.senha, usuario.senhaHash) : false;
  if (!usuario || !usuario.ativo || !senhaConfere) {
    return NextResponse.json({ erro: "Usuário ou senha inválidos" }, { status: 401 });
  }

  await criarSessao({
    usuarioId: usuario.id,
    organizacaoId: usuario.organizacaoId,
    perfil: usuario.perfil,
    nome: usuario.nome,
  });

  await prisma.usuario.update({ where: { id: usuario.id }, data: { ultimoLogin: new Date() } });
  await registrarAuditoria({
    usuarioId: usuario.id,
    acao: "login",
    ip: req.headers.get("x-forwarded-for"),
  });

  const destino = usuario.perfil === "AFILIADO" ? "/afiliado" : "/organizadora";
  return NextResponse.json({ destino });
}
