import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import type { EstadoComRifa } from "@shared/vitrine";

/**
 * Estados com rifa no ar, em círculos (a sigla, com o nome embaixo). O
 * estado de quem olha vem primeiro. Toque leva a `/estado/UF`.
 */
export function EstadosVitrine({ uf }: { uf: string | null }) {
  const { data = [] } = useQuery<EstadoComRifa[]>({
    queryKey: ["/api/public/estados", uf ? { uf } : undefined],
    staleTime: 60_000,
  });
  if (data.length === 0) return null;
  return (
    <nav aria-label="Rifas por estado" className="-mx-4 mb-3 overflow-x-auto px-4" style={{ scrollbarWidth: "none" }}>
      <ul className="flex gap-3">
        {data.map((e) => (
          <li key={e.uf} className="w-16 shrink-0 text-center">
            <Link href={`/estado/${e.uf}`} className="block" aria-label={`${e.nome}: ${e.rifas} rifa(s) no ar`}>
              <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full border border-line-2 bg-mist font-display text-base font-extrabold text-ink">
                {e.uf}
              </span>
              <span className="mt-1 block truncate text-[11px] text-ink-2">{e.nome}</span>
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
