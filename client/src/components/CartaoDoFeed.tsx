import { Link } from "wouter";
import { MapPin, ShieldCheck } from "lucide-react";
import { FotoDoPerfil } from "@/components/Seguir";
import { Money, Progress } from "@/components/bits";
import { groupNumber, percent } from "@shared/format";

export interface RifaDoFeed {
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
  bannerSrcSet?: string | null;
  bannerLqip?: string | null;
  autorizacao: string | null;
  organizacao: { nome: string; slug: string; local: string | null; uf: string | null; foto: string | null } | null;
  /** 0 = na cidade de quem olha, 1 = no estado, 2 = o resto; nulo sem região. */
  perto: 0 | 1 | 2 | null;
}

const PERTO = ["na sua cidade", "no seu estado"] as const;

/**
 * Uma rifa no feed, em formato de publicação: o perfil da promotora no
 * topo, a imagem em retrato (4:5) e, embaixo, prêmio, selo da autorização,
 * preço, progresso e sorteio.
 */
export function CartaoDoFeed({ rifa: c }: { rifa: RifaDoFeed }) {
  const pct = percent(c.soldCount, c.totalQuotas);
  const retaFinal = pct >= 85;
  const href = c.organizacao ? `/o/${c.organizacao.slug}/r/${c.slug}` : `/r/${c.slug}`;

  return (
    <article className="overflow-hidden rounded-xl border border-line bg-white">
      {c.organizacao ? (
        <Link href={`/o/${c.organizacao.slug}`} className="flex items-center gap-2 px-3 py-2">
          <FotoDoPerfil nome={c.organizacao.nome} foto={c.organizacao.foto} tamanho={34} />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-semibold">{c.organizacao.nome}</span>
            {c.organizacao.local ? (
              <span className="flex items-center gap-1 truncate text-[11px] text-muted">
                <MapPin size={11} aria-hidden className="shrink-0" />
                {c.organizacao.local}
              </span>
            ) : null}
          </span>
          {c.perto === 0 || c.perto === 1 ? (
            <span className="shrink-0 rounded-full bg-mist-2 px-2 py-[1px] font-mono text-[10px] text-ink">
              {PERTO[c.perto]}
            </span>
          ) : null}
        </Link>
      ) : null}

      <Link href={href} className="block">
        <div
          className="relative aspect-[4/5] overflow-hidden bg-mist-2"
          style={
            c.banner
              ? c.bannerLqip
                ? { backgroundImage: `url(${c.bannerLqip})`, backgroundSize: "cover" }
                : undefined
              : { background: "linear-gradient(145deg,#0B1F14,#0d3a22 60%,#00873E)" }
          }
        >
          {c.banner ? (
            <img
              src={c.banner}
              srcSet={c.bannerSrcSet ?? undefined}
              sizes="(min-width: 768px) 360px, 100vw"
              alt={c.prizeTitle}
              loading="lazy"
              className="h-full w-full object-cover"
            />
          ) : (
            <span className="absolute inset-0 flex items-end p-4 font-display text-2xl font-extrabold leading-tight text-branco">
              {c.prizeTitle}
            </span>
          )}
          <span
            className={`absolute right-2 top-2 rounded px-2 py-[2px] font-mono text-[10px] ${
              retaFinal ? "bg-yellow text-on-yellow" : "bg-branco text-[#0b1f14]"
            }`}
          >
            {retaFinal ? "reta final" : `${pct}% vendida`}
          </span>
        </div>

        <div className="space-y-2 p-3">
          <h3 className="font-display text-base font-extrabold leading-tight">{c.prizeTitle}</h3>
          {c.autorizacao ? (
            <p className="flex items-center gap-1 text-[11px] font-semibold text-ink-2">
              <ShieldCheck size={13} aria-hidden className="text-marca" />
              Autorizada SPA/MF <span className="tnum font-normal text-muted">· {c.autorizacao}</span>
            </p>
          ) : null}
          <div className="flex items-baseline justify-between text-xs text-muted">
            <span>
              cota <Money cents={c.priceCents} className="text-sm text-green-deep" />
            </span>
            <span className="tnum">
              {c.drawAt ? `sorteio ${new Date(c.drawAt).toLocaleDateString("pt-BR")}` : "sorteio a definir"}
            </span>
          </div>
          <Progress value={c.soldCount} total={c.totalQuotas} tone={retaFinal ? "yellow" : "green"} />
          <p className="label-xs">
            {groupNumber(c.soldCount)} de {groupNumber(c.totalQuotas)} cotas
          </p>
        </div>
      </Link>
    </article>
  );
}
