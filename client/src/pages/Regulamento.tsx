import { Link, useParams } from "wouter";
import { ArrowLeft } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { PublicShell } from "@/components/AppShell";
import { Empty } from "@/components/bits";
import { TextoDeLeitura } from "@/components/TextoDeLeitura";
import type { Secao } from "@shared/regulamento";

interface Resposta {
  rifa: { slug: string; title: string; prizeTitle: string };
  organizacao: { slug: string; nome: string } | null;
  secoes: Secao[];
}

/**
 * Regulamento da rifa — montado dos dados dela, então não tem como dizer
 * uma coisa e a rifa fazer outra. Aberto antes da compra.
 */
export default function Regulamento() {
  const { slug } = useParams<{ slug: string }>();
  const { data, isLoading, error } = useQuery<Resposta>({
    queryKey: [`/api/public/campaigns/${slug}/regulamento`],
  });

  if (isLoading) {
    return (
      <PublicShell>
        <p className="text-sm text-muted">Carregando regulamento…</p>
      </PublicShell>
    );
  }
  if (error || !data) {
    return (
      <PublicShell>
        <Empty>Regulamento não encontrado.</Empty>
        <p className="-mt-4 text-center text-sm">
          <Link href="/" className="inline-flex min-h-6 items-center text-green-deep underline">
            Ver as rifas no ar
          </Link>
        </p>
      </PublicShell>
    );
  }

  const voltar = data.organizacao ? `/o/${data.organizacao.slug}/r/${data.rifa.slug}` : `/r/${data.rifa.slug}`;
  return (
    <PublicShell>
      <Link href={voltar} className="inline-flex min-h-6 items-center gap-1.5 text-sm text-green-deep hover:underline">
        <ArrowLeft size={14} aria-hidden />
        voltar para a rifa
      </Link>
      <h1 className="mt-[18px] font-display text-2xl font-extrabold">Regulamento</h1>
      <p className="mt-0.5 text-[13px] text-muted [overflow-wrap:anywhere]">{data.rifa.prizeTitle}</p>
      <TextoDeLeitura secoes={data.secoes} />
    </PublicShell>
  );
}
