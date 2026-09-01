import { Suspense } from "react";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { lerSessaoApostador } from "@/lib/auth";
import ComprarNumeros from "@/components/ComprarNumeros";

export const dynamic = "force-dynamic";

export default async function PaginaRifa({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  // Só quantas rifas existem: com mais de uma, faz sentido oferecer a volta
  // para a vitrine; com uma só, esse link levaria a um redirecionamento de
  // volta para esta mesma página.
  const abertas = await prisma.rifa.count({ where: { status: "ABERTA" } });

  // Quem está logado não deve redigitar nome, e-mail e telefone a cada compra.
  // A sessão é lida aqui, no servidor, e não numa chamada extra do navegador.
  const sessao = await lerSessaoApostador();
  const conta = sessao
    ? await prisma.contaApostador.findUnique({
        where: { id: sessao.contaId },
        select: { nome: true, email: true, telefone: true, cpf: true },
      })
    : null;

  return (
    <div className="space-y-4">
      {abertas > 1 && (
        <Link href="/" className="text-sm text-marca-600 hover:underline">
          ← ver todas as rifas abertas
        </Link>
      )}

      <Suspense fallback={<p className="text-slate-500">Carregando rifa…</p>}>
        <ComprarNumeros rifaId={id} conta={conta} />
      </Suspense>
    </div>
  );
}
