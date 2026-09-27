import { useState } from "react";
import { Link } from "wouter";
import { MapPin, MessageCircle, ShieldCheck } from "lucide-react";
import { FotoDoPerfil } from "@/components/Seguir";
import { PainelDeComentarios } from "@/components/Comentarios";
import { Money, Progress } from "@/components/bits";
import { marcarOrigem } from "@/lib/origem";
import type { Origem } from "@shared/resultados";
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
  demonstracao?: boolean;
  /** Comentários visíveis na publicação. */
  comentarios?: number;
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
export function CartaoDoFeed({ rifa: c, origem = "vitrine" }: { rifa: RifaDoFeed; origem?: Origem }) {
  const pct = percent(c.soldCount, c.totalQuotas);
  const retaFinal = pct >= 85;
  const href = c.organizacao ? `/o/${c.organizacao.slug}/r/${c.slug}` : `/r/${c.slug}`;
  // Comentários sobem por cima do feed, como no Instagram — sem sair da vitrine.
  const [comentando, setComentando] = useState(false);

  return (
    <article className="overflow-hidden rounded-xl border border-line bg-white">
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
        <Link href={href} onClick={() => marcarOrigem(origem)} className="absolute inset-0 block" aria-label={c.prizeTitle}>
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
        </Link>
        {/* Perfil por cima da imagem, como no Instagram: sombra no topo para
            o texto branco ler sobre qualquer foto. O link do perfil é irmão
            do da rifa (link dentro de link não vale). */}
        <span
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 h-24"
          style={{ background: "linear-gradient(to bottom, rgba(0,0,0,.55), rgba(0,0,0,0))" }}
        />
        {c.organizacao ? (
          <Link
            href={`/o/${c.organizacao.slug}`}
            className="absolute left-2 top-2 flex max-w-[70%] items-center gap-2 rounded-full pr-2 text-branco"
          >
            <span className="rounded-full ring-2 ring-white/80">
              <FotoDoPerfil nome={c.organizacao.nome} foto={c.organizacao.foto} tamanho={34} />
            </span>
            <span className="min-w-0" style={{ textShadow: "0 1px 2px rgba(0,0,0,.6)" }}>
              <span className="block truncate text-sm font-semibold">{c.organizacao.nome}</span>
              {c.organizacao.local ? (
                <span className="flex items-center gap-1 truncate text-[11px] opacity-90">
                  <MapPin size={11} aria-hidden className="shrink-0" />
                  {c.organizacao.local}
                  {c.perto === 0 || c.perto === 1 ? <span className="truncate"> · {PERTO[c.perto]}</span> : null}
                </span>
              ) : null}
            </span>
          </Link>
        ) : null}
        <span
          className={`pointer-events-none absolute right-2 top-2 rounded px-2 py-[2px] font-mono text-[10px] ${
            retaFinal ? "bg-yellow text-on-yellow" : "bg-branco text-[#0b1f14]"
          }`}
        >
          {retaFinal ? "reta final" : `${pct}% vendida`}
        </span>
      </div>

      <Link href={href} onClick={() => marcarOrigem(origem)} className="block">
        <div className="space-y-2 p-3">
          <h3 className="font-display text-base font-extrabold leading-tight">{c.prizeTitle}</h3>
          {c.demonstracao ? (
            <p className="text-[11px] font-semibold text-yellow-deep">
              <span className="rounded bg-yellow-soft px-1.5 py-[1px]">Demonstração</span> · exemplo, não está à venda
            </p>
          ) : c.autorizacao ? (
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
      <button
        type="button"
        onClick={() => setComentando(true)}
        className="flex w-full items-center gap-1.5 border-t border-line px-3 py-2 text-left text-xs text-ink-2 hover:bg-mist"
      >
        <MessageCircle size={16} aria-hidden />
        {c.comentarios ? (
          <span>
            Ver <span className="tnum">{groupNumber(c.comentarios)}</span> comentário{c.comentarios === 1 ? "" : "s"}
          </span>
        ) : (
          <span>Comentar</span>
        )}
      </button>
      {comentando ? <PainelDeComentarios slug={c.slug} onFechar={() => setComentando(false)} /> : null}
    </article>
  );
}
