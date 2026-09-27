import { useState } from "react";
import { Link } from "wouter";
import { MapPin, ShieldCheck } from "lucide-react";
import { BarraDeAcoes, CabecalhoDaPublicacao, Carrossel, Legenda, type Interacoes, type Peca } from "@/components/Publicacao";
import { quandoPublicou } from "@shared/publicacao";
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
  /** Aceita compra agora (`rifaAVenda`): a barra mostra carrinho e comprar. */
  vende?: boolean;
  publicadaEm?: string | null;
  /** O texto da organização embaixo da publicação. */
  legenda?: string | null;
  /** O carrossel (banner, fotos e vídeos, até 10). */
  midias?: Peca[];
  interacoes?: Interacoes;
  organizacao: { nome: string; slug: string; local: string | null; uf: string | null; foto: string | null; verificada?: boolean; seguindo?: boolean } | null;
  /** 0 = na cidade de quem olha, 1 = no estado, 2 = o resto; nulo sem região. */
  perto: 0 | 1 | 2 | null;
}

const PERTO = ["na sua cidade", "no seu estado"] as const;

/**
 * Uma rifa no feed, em formato de publicação do Instagram: o carrossel em
 * retrato (4:5) com o perfil da promotora por cima, a barra de ações
 * (trevo, comentar, republicar, compartilhar, carrinho e comprar), a legenda e, embaixo,
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
    <article className="-mx-4 overflow-hidden bg-white sm:mx-0">
      {/* O topo fica fora da imagem, como no Instagram. */}
      {c.organizacao ? (
        <CabecalhoDaPublicacao
          slug={c.organizacao.slug}
          nome={c.organizacao.nome}
          foto={c.organizacao.foto}
          verificada={c.organizacao.verificada}
          seguindo={c.organizacao.seguindo}
          subtitulo={
            c.organizacao.local ? (
              <span className="flex items-center gap-1">
                <MapPin size={11} aria-hidden className="shrink-0" />
                {c.organizacao.local}
                {c.perto === 0 || c.perto === 1 ? <span className="truncate"> · {PERTO[c.perto]}</span> : null}
              </span>
            ) : null
          }
        />
      ) : null}

      <Carrossel pecas={pecas} titulo={c.prizeTitle} href={href} aoAbrir={() => marcarOrigem(origem)}>
        <span
          className={`pointer-events-none absolute left-2 top-2 rounded px-2 py-[2px] font-mono text-[10px] ${
            retaFinal ? "bg-yellow text-on-yellow" : "bg-branco text-[#0b1f14]"
          }`}
        >
          {retaFinal ? "reta final" : `${pct}% vendida`}
        </span>
      </Carrossel>

      {/* Só a rifa vai dentro do cartão, logo abaixo da imagem e acima das ações. */}
      <Link href={href} onClick={() => marcarOrigem(origem)} className="mx-3 mt-3 block rounded-xl border border-line p-3 hover:bg-mist">
        <div className="space-y-2">
          <h3 className="font-display text-base font-extrabold leading-tight">{c.prizeTitle}</h3>
          {c.demonstracao ? (
            <p className="text-[11px] font-semibold text-yellow-deep">
              <span className="rounded bg-yellow-soft px-1.5 py-[1px]">Demonstração</span> · exemplo, não está à venda
            </p>
          ) : c.autorizacao ? (
            <p className="flex items-center gap-1 text-[11px] font-semibold text-ink-2">
              <ShieldCheck size={13} aria-hidden className="text-marca" />
              Autorizada SPA/MF <span className="tnum font-semibold text-ink-2">· {c.autorizacao}</span>
            </p>
          ) : null}
          <div className="flex items-baseline justify-between text-xs font-semibold text-ink-2">
            <span>
              cota <Money cents={c.priceCents} className="text-sm font-bold text-green-deep" />
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
          <p className="label-xs font-semibold text-ink-2">
            {groupNumber(c.soldCount)} de {groupNumber(c.totalQuotas)} cotas
          </p>
        </div>
      </Link>

      {/* Ações, legenda e comentários também ficam fora, embaixo. */}
      <BarraDeAcoes
        slug={c.slug}
        titulo={c.prizeTitle}
        caminho={href}
        interacoes={interacoes}
        aoComentar={() => setComentando(true)}
        vende={c.vende}
      />
      <Legenda autor={c.organizacao?.nome ?? ""} texto={c.legenda} />
      {interacoes.comentarios ? (
        <button type="button" onClick={() => setComentando(true)} className="block px-3 pt-1 text-left text-sm text-muted hover:text-ink">
          Ver {interacoes.comentarios === 1 ? "o comentário" : <>todos os <span className="tnum">{groupNumber(interacoes.comentarios)}</span> comentários</>}
        </button>
      ) : null}
      {quandoPublicou(c.publicadaEm) ? <p className="px-3 pb-4 pt-1 text-xs text-muted">{quandoPublicou(c.publicadaEm)}</p> : null}

      {comentando ? <PainelDeComentarios slug={c.slug} onFechar={() => setComentando(false)} /> : null}
    </article>
  );
}
