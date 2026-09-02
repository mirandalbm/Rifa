import { NextRequest, NextResponse } from "next/server";
import { TipoMidia } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { exigirPerfil } from "@/lib/auth";
import { registrarAuditoria } from "@/lib/rifa";
import { ErroDeMidia, apagar, gerarChave, gravar, limiteDe, validarArquivo } from "@/lib/midia";

type Contexto = { params: Promise<{ id: string }> };

const TIPOS: Record<string, TipoMidia> = {
  BANNER: TipoMidia.BANNER,
  IMAGEM: TipoMidia.IMAGEM,
  VIDEO: TipoMidia.VIDEO,
};

export async function POST(req: NextRequest, { params }: Contexto) {
  const sessao = await exigirPerfil("ORGANIZADORA");
  if (!sessao) return NextResponse.json({ erro: "Não autorizado" }, { status: 401 });

  const { id } = await params;

  const rifa = await prisma.rifa.findFirst({
    where: { id, organizacaoId: sessao.organizacaoId },
    select: { id: true },
  });
  if (!rifa) return NextResponse.json({ erro: "Rifa não encontrada" }, { status: 404 });

  const formulario = await req.formData().catch(() => null);
  const arquivo = formulario?.get("arquivo");
  const tipo = TIPOS[String(formulario?.get("tipo") ?? "")];

  if (!tipo) return NextResponse.json({ erro: "Tipo de mídia inválido" }, { status: 400 });
  if (!(arquivo instanceof File)) {
    return NextResponse.json({ erro: "Nenhum arquivo enviado" }, { status: 400 });
  }

  const conteudo = Buffer.from(await arquivo.arrayBuffer());

  let mime: string;
  try {
    mime = validarArquivo(tipo, conteudo);
  } catch (erro) {
    if (erro instanceof ErroDeMidia) {
      return NextResponse.json({ erro: erro.message }, { status: 400 });
    }
    throw erro;
  }

  const existentes = await prisma.midiaRifa.findMany({
    where: { rifaId: rifa.id, tipo },
    orderBy: { ordem: "asc" },
  });

  const limite = limiteDe(tipo);

  // Banner e vídeo são únicos: enviar outro substitui o anterior, em vez de
  // recusar e obrigar a apagar antes.
  const substituir = limite === 1 && existentes.length > 0 ? existentes[0] : null;

  if (!substituir && existentes.length >= limite) {
    return NextResponse.json(
      { erro: `Limite de ${limite} ${tipo === TipoMidia.IMAGEM ? "imagens" : "arquivos"} atingido.` },
      { status: 409 },
    );
  }

  const chave = gerarChave(mime);
  await gravar(chave, conteudo);

  const midia = await prisma.$transaction(async (tx) => {
    if (substituir) await tx.midiaRifa.delete({ where: { id: substituir.id } });

    return tx.midiaRifa.create({
      data: {
        rifaId: rifa.id,
        tipo,
        chave,
        mimeType: mime,
        tamanho: conteudo.length,
        ordem: tipo === TipoMidia.IMAGEM ? existentes.length : 0,
      },
    });
  });

  // O arquivo antigo só sai do disco depois que o banco confirmou a troca.
  if (substituir) await apagar(substituir.chave);

  await registrarAuditoria({
    usuarioId: sessao.usuarioId,
    acao: "rifa.midia.enviada",
    entidade: "Rifa",
    entidadeId: rifa.id,
    dados: { tipo, mimeType: mime, tamanho: conteudo.length },
  });

  return NextResponse.json(
    { id: midia.id, tipo: midia.tipo, url: `/api/midia/${midia.id}` },
    { status: 201 },
  );
}

export async function DELETE(req: NextRequest, { params }: Contexto) {
  const sessao = await exigirPerfil("ORGANIZADORA");
  if (!sessao) return NextResponse.json({ erro: "Não autorizado" }, { status: 401 });

  const { id } = await params;
  const corpo = await req.json().catch(() => null);
  const midiaId = String(corpo?.midiaId ?? "");

  const midia = await prisma.midiaRifa.findFirst({
    where: { id: midiaId, rifaId: id, rifa: { organizacaoId: sessao.organizacaoId } },
  });
  if (!midia) return NextResponse.json({ erro: "Mídia não encontrada" }, { status: 404 });

  await prisma.midiaRifa.delete({ where: { id: midia.id } });
  await apagar(midia.chave);

  await registrarAuditoria({
    usuarioId: sessao.usuarioId,
    acao: "rifa.midia.removida",
    entidade: "Rifa",
    entidadeId: id,
    dados: { tipo: midia.tipo },
  });

  return NextResponse.json({ ok: true });
}
