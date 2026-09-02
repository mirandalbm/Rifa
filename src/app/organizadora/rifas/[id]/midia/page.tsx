import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { exigirPerfil } from "@/lib/auth";
import { LIMITES } from "@/lib/midia";
import GerenciarMidia from "@/components/GerenciarMidia";

export const dynamic = "force-dynamic";

export default async function PaginaMidia({ params }: { params: Promise<{ id: string }> }) {
  const sessao = await exigirPerfil("ORGANIZADORA");
  if (!sessao) redirect("/organizadora");

  const { id } = await params;

  const rifa = await prisma.rifa.findFirst({
    where: { id, organizacaoId: sessao.organizacaoId },
    include: { midias: { orderBy: { ordem: "asc" } } },
  });
  if (!rifa) notFound();

  const banner = rifa.midias.find((m) => m.tipo === "BANNER") ?? null;
  const video = rifa.midias.find((m) => m.tipo === "VIDEO") ?? null;
  const imagens = rifa.midias.filter((m) => m.tipo === "IMAGEM");

  return (
    <div className="space-y-6">
      <div>
        <Link href="/organizadora/rifas" className="text-sm text-marca-600 hover:underline">
          ← voltar para as rifas
        </Link>
        <h1 className="mt-1 text-2xl font-bold">{rifa.titulo}</h1>
        <p className="text-slate-600">{rifa.premio}</p>
      </div>

      <GerenciarMidia
        rifaId={rifa.id}
        banner={banner && { id: banner.id, tipo: "BANNER" }}
        imagens={imagens.map((i) => ({ id: i.id, tipo: "IMAGEM" as const }))}
        video={video && { id: video.id, tipo: "VIDEO" }}
        limiteImagens={LIMITES.imagensPorRifa}
      />
    </div>
  );
}
