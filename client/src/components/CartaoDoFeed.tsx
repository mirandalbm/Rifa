import { SeloVerificado } from "@/components/SeloVerificado";
import { useState } from "react";
import { Link } from "wouter";
import { MapPin, ShieldCheck } from "lucide-react";
import { BarraDeAcoes, Carrossel, Legenda, type Interacoes, type Peca } from "@/components/Publicacao";
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
  status?: string;
  /** O texto da organização embaixo da publicação. */
  legenda?: string | null;
  /** O carrossel (banner, fotos e vídeos, até 10). */
  midias?: Peca[];
  interacoes?: Interacoes;
  organizacao: { nome: string; slug: string; local: string | null; uf: string | null; foto: string | null; verificada?: boolean } | null;
  /** 0 = na cidade de quem olha, 1 = no estado, 2 = o resto; nulo sem região. */
  perto: 0 | 1 | 2 | null;
}

const PERTO = ["na sua cidade", "no seu estado"] as const;

/**
 * Uma rifa no feed, em formato de publicação do Instagram: o carrossel em
 * retrato (4:5) com o perfil da promotora por cima, a barra de ações
 * (trevo, comentar, republicar, compartilhar, salvar), a legenda e, embaixo,
 * prêmio, selo da autorização, preço, progresso e sorteio.
 */
export function CartaoDoFeed({ rifa: c, origem = "vitrine" }: { rifa: RifaDoFeed; origem?: Origem }) {
  const pct = percent(c.soldCount, c.totalQuotas);
  const retaFinal = pct >= 85;
  const href = c.organizacao ? `/o/${c.organizacao.slug}/r/${c.slug}` : `/r/${c.slug}`;
  // Comentários sobem por cima do feed, como no Instagram — sem sair da vitrine.
  const [comentando, setComentando] = useState(false);

  const pecas: Peca[] =
    c.midias ?? (c.banner ? [{ role: "banner", url: c.banner, srcSet: c.bannerSrcSet, lqip: c.bannerLqip }] : []);
  const interacoes: Interacoes = c.interacoes ?? {
    curtidas: 0,
    comentarios: c.comentarios ?? 0,
    republicacoes: 0,
    compartilhamentos: 0,
    curti: false,
    republiquei: false,
    salvei: false,
  };

  return (
    <article className="overflow-hidden rounded-xl border border-line bg-white">
      <Carrossel pecas={pecas} titulo={c.prizeTitle} href={href} aoAbrir={() => marcarOrigem(origem)}>
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
              <span className="flex items-center gap-1 text-sm font-semibold">
                <span className="truncate">{c.organizacao.nome}</span>
                {c.organizacao.verificada ? <SeloVerificado sujeito="organizacao" tamanho={14} /> : null}
              </span>
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
      </Carrossel>

      <BarraDeAcoes
        slug={c.slug}
        titulo={c.prizeTitle}
        caminho={href}
        interacoes={interacoes}
        aoComentar={() => setComentando(true)}
      />
      <Legenda autor={c.organizacao?.nome ?? ""} texto={c.legenda} />
      {interacoes.comentarios ? (
        <button type="button" onClick={() => setComentando(true)} className="block px-3 pt-1 text-left text-sm text-muted hover:text-ink">
          Ver {interacoes.comentarios === 1 ? "o comentário" : <>todos os <span className="tnum">{groupNumber(interacoes.comentarios)}</span> comentários</>}
        </button>
      ) : null}

      <Link href={href} onClick={() => marcarOrigem(origem)} className="mt-1 block">
        <div className="space-y-2 p-3 pt-1">
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
              {c.status && c.status !== "published"
                ? "vendas encerradas"
                : c.drawAt
                  ? `sorteio ${new Date(c.drawAt).toLocaleDateString("pt-BR")}`
                  : "sorteio a definir"}
            </span>
          </div>
          <Progress value={c.soldCount} total={c.totalQuotas} tone={retaFinal ? "yellow" : "green"} />
          <p className="label-xs">
            {groupNumber(c.soldCount)} de {groupNumber(c.totalQuotas)} cotas
          </p>
        </div>
      </Link>
      {comentando ? <PainelDeComentarios slug={c.slug} onFechar={() => setComentando(false)} /> : null}
    </article>
  );
}
