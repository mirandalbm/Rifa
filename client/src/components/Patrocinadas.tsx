import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Money } from "@/components/bits";
import { marcarOrigem } from "@/lib/origem";
import { apiRequest } from "@/lib/queryClient";
import type { RifaDoFeed } from "@/components/CartaoDoFeed";

/**
 * Bloco "Patrocinadas" da vitrine (etapa 15): até 5 rifas pagas por clique,
 * sorteadas a cada visita. Diz "Patrocinada" em texto — propaganda que não
 * se identifica engana o comprador (CDC, art. 36). O clique é contado no
 * servidor (uma vez por aparelho em 24 h, robô não conta); aqui só avisa, sem
 * segurar a navegação.
 */
export function Patrocinadas({ rifas, titulo }: { rifas: RifaDoFeed[] | undefined; titulo?: string }) {
  const { data } = useQuery<{ id: string; campaignId: string }[]>({ queryKey: ["/api/public/patrocinadas"], staleTime: 60_000 });
  const porId = new Map((rifas ?? []).map((r) => [r.id, r]));
  const lista = (data ?? []).map((p) => ({ p, r: porId.get(p.campaignId) })).filter((x) => x.r) as { p: { id: string }; r: RifaDoFeed }[];
  if (!lista.length) return null;

  const clicou = (id: string) => {
    marcarOrigem("patrocinada");
    // A navegação é dentro do app: o aviso segue mesmo com a página trocando.
    apiRequest("POST", `/api/public/patrocinadas/${id}/clique`).catch(() => {});
  };

  return (
    <section aria-label={titulo || "Rifas patrocinadas"} className="mt-4">
      <h2 className="font-display text-lg font-bold">{titulo || "Patrocinadas"}</h2>
      <ul className="-mx-4 mt-2 flex snap-x gap-3 overflow-x-auto px-4 pb-2">
        {lista.map(({ p, r }) => (
          <li key={p.id} className="w-60 shrink-0 snap-start">
            <Link
              href={r.organizacao ? `/o/${r.organizacao.slug}/r/${r.slug}` : `/r/${r.slug}`}
              onClick={() => clicou(p.id)}
              className="block overflow-hidden rounded-xl border border-line bg-white hover:border-line-2"
            >
              <div className="relative aspect-[2/1] bg-mist-2">
                {r.banner ? <img src={r.banner} alt="" loading="lazy" className="h-full w-full object-cover" /> : null}
                <span className="absolute left-2 top-2 rounded-full border border-line bg-white px-2 py-[1px] font-mono text-[10px] text-ink">
                  Patrocinada
                </span>
              </div>
              <div className="space-y-0.5 px-3 py-2">
                <p className="truncate text-sm font-semibold">{r.prizeTitle}</p>
                <p className="truncate text-xs text-muted">{r.organizacao?.nome ?? r.title}</p>
                <p className="text-xs">
                  <Money cents={r.priceCents} /> <span className="text-muted">por cota</span>
                </p>
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
