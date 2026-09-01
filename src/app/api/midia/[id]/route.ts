import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ler } from "@/lib/midia";

/// Entrega o arquivo. Público de propósito: a galeria da rifa é vista por quem
/// ainda não comprou nada. O que não é público é *enviar* — isso exige sessão.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const midia = await prisma.midiaRifa.findUnique({ where: { id } });
  if (!midia) return new NextResponse("Não encontrado", { status: 404 });

  const conteudo = await ler(midia.chave).catch(() => null);
  if (!conteudo) return new NextResponse("Não encontrado", { status: 404 });

  return new NextResponse(new Uint8Array(conteudo), {
    headers: {
      // O mime vem da assinatura do arquivo conferida no upload, nunca do que
      // o navegador declarou — é o que impede servir HTML como se fosse imagem.
      "Content-Type": midia.mimeType,
      "Content-Length": String(midia.tamanho),
      // Impede o navegador de adivinhar outro tipo e executar o conteúdo.
      "X-Content-Type-Options": "nosniff",
      // A chave é única por arquivo; trocar a mídia gera outro id, então pode
      // ser guardada por bastante tempo.
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}
