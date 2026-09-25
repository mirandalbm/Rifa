import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { PublicShell } from "@/components/AppShell";
import { Money, Progress, Empty } from "@/components/bits";
import { groupNumber, percent } from "@shared/format";
import { InstalarApp } from "@/components/InstalarApp";

interface CampaignCard {
  id: string;
  slug: string;
  title: string;
  prizeTitle: string;
  priceCents: number;
  totalQuotas: number;
  drawAt: string | null;
  featured: boolean;
  soldCount: number;
  banner: string | null;
}

/** Vitrine multi-rifas: todas as campanhas no ar, banner na frente. */
export default function Vitrine() {
  const { data, isLoading } = useQuery<CampaignCard[]>({
    queryKey: ["/api/public/campaigns"],
  });

  return (
    <PublicShell>
      <div className="pb-2">
        <h1 className="font-display text-2xl font-extrabold">
          {isLoading ? "Carregando rifas…" : `${data?.length ?? 0} rifa(s) no ar`}
        </h1>
        <p className="mt-1 text-sm text-muted">Escolha uma e garanta seus números.</p>
      </div>

      {!isLoading && (data?.length ?? 0) === 0 ? (
        <Empty>Nenhuma rifa publicada ainda.</Empty>
      ) : null}

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {data?.map((c) => {
          const pct = percent(c.soldCount, c.totalQuotas);
          const finalStretch = pct >= 85;
          return (
            <Link
              key={c.id}
              href={`/r/${c.slug}`}
              className="overflow-hidden rounded-xl border border-line bg-white transition hover:shadow-card"
            >
              <div
                className="relative flex h-28 items-end overflow-hidden p-3"
                style={{
                  background: c.banner
                    ? `center/cover url(${c.banner})`
                    : "linear-gradient(145deg,#0B1F14,#0d3a22 60%,#00873E)",
                }}
              >
                <div
                  aria-hidden
                  className="absolute inset-0"
                  style={{
                    background:
                      "linear-gradient(to top, rgba(11,31,20,.85) 0%, rgba(11,31,20,.4) 55%, rgba(11,31,20,.05) 100%)",
                  }}
                />
                <span
                  className={`absolute right-2 top-2 z-10 rounded px-2 py-[2px] font-mono text-[10px] ${
                    finalStretch ? "bg-yellow text-[#3B2A00]" : "bg-white text-green-deep"
                  }`}
                >
                  {finalStretch ? "reta final" : `${pct}% vendida`}
                </span>
                <span className="relative font-display text-base font-extrabold leading-tight text-white">
                  {c.prizeTitle}
                </span>
              </div>
              <div className="space-y-2 p-3">
                <div className="flex items-baseline justify-between text-xs text-muted">
                  <span>
                    cota <Money cents={c.priceCents} className="text-sm text-green-deep" />
                  </span>
                  <span className="tnum">
                    {c.drawAt
                      ? `sorteio ${new Date(c.drawAt).toLocaleDateString("pt-BR")}`
                      : "sorteio a definir"}
                  </span>
                </div>
                <Progress
                  value={c.soldCount}
                  total={c.totalQuotas}
                  tone={finalStretch ? "yellow" : "green"}
                />
                <p className="label-xs">
                  {groupNumber(c.soldCount)} de {groupNumber(c.totalQuotas)} cotas
                </p>
              </div>
            </Link>
          );
        })}
      </div>
      <InstalarApp />
    </PublicShell>
  );
}
