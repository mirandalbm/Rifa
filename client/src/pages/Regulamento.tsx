import { Link, useParams } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { PublicShell } from "@/components/AppShell";
import { Empty } from "@/components/bits";
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
      </PublicShell>
    );
  }

  const voltar = data.organizacao ? `/o/${data.organizacao.slug}/r/${data.rifa.slug}` : `/r/${data.rifa.slug}`;
  return (
    <PublicShell>
      <Link href={voltar} className="text-sm text-green-deep underline">
        ← voltar para a rifa
      </Link>
      <h1 className="mt-2 font-display text-xl font-extrabold">Regulamento</h1>
      <p className="text-sm text-muted">{data.rifa.prizeTitle}</p>
      <article className="mt-4 space-y-5 text-sm leading-relaxed [overflow-wrap:anywhere]">
        {data.secoes.map((s) => (
          <section key={s.titulo}>
            <h2 className="font-display text-base font-bold">{s.titulo}</h2>
            {s.itens.map((i) => (
              <p key={i} className="mt-1 text-ink-2">
                {i}
              </p>
            ))}
          </section>
        ))}
      </article>
    </PublicShell>
  );
}
