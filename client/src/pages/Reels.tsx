import { useEffect, useRef, useState } from "react";
import { Link, useLocation } from "wouter";
import { useInfiniteQuery } from "@tanstack/react-query";
import { BarraDeAcoes, CabecalhoDaPublicacao, type Interacoes } from "@/components/Publicacao";
import { PainelDeComentarios } from "@/components/Comentarios";
import { BotaoDenunciar } from "@/components/Seguranca";
import { EmBreve } from "@/pages/EmBreve";
import { ConsoleDoApp, acimaDoConsole, useConfigDoApp } from "@/components/Console";
import { Button, Money, TONS_DO_BOTAO } from "@/components/bits";
import { marcarOrigem } from "@/lib/origem";
import { guardarSomDosReels, lerSomDosReels } from "@/lib/reelsSom";
import { useVideoHls } from "@/lib/hls";
import { ABAS_DO_REELS, type AbaDoReels } from "@shared/reels";
import type { RifaDoFeed } from "@/components/CartaoDoFeed";
import { FigurinhasNaTela } from "@/components/Figurinhas";
import type { FigurinhaNaTela } from "@shared/figurinhasStory";

type ItemDoReels = RifaDoFeed & {
  reelsId?: string;
  reels: string | null;
  reelsPoster?: string | null;
  reelsHls?: string | null;
  reelsFigurinhas?: FigurinhaNaTela[];
};
interface Pagina {
  ligado: boolean;
  precisaEntrar?: boolean;
  itens: ItemDoReels[];
  proximo: string | null;
}

const SEM_INTERACAO: Interacoes = { curtidas: 0, comentarios: 0, republicacoes: 0, compartilhamentos: 0, curti: false, republiquei: false, salvei: false };

/**
 * Reels: um vídeo em pé por vez, em tela cheia, descendo com o dedo. Só as
 * rifas no ar com vídeo de até 3 minutos (o servidor decide); a plataforma
 * liga e desliga (`reelsLigado`) — desligado, é a tela "Em breve". O vídeo
 * toca mudo quando ocupa a tela e para ao sair. É o mesmo cartão da vitrine
 * (as mesmas ações e a compra pela rifa), nada de reserva aqui. O console
 * do app fica à vista (a barra da base, ou a lateral no computador), como no
 * Figma "15 · Reels".
 */
export default function ReelsPagina() {
  const { reelsLigado } = useConfigDoApp();
  if (!reelsLigado) return <EmBreve tela="reels" />;
  return <Reels />;
}

function Reels() {
  const [aba, setAba] = useState<AbaDoReels>("reels");
  // O som lembrado no aparelho; sem toque, o navegador pode barrar e o reel cai para mudo.
  const [mudo, setMudo] = useState(() => !lerSomDosReels());
  const [comentando, setComentando] = useState<string | null>(null);

  const lista = useInfiniteQuery<Pagina>({
    queryKey: ["/api/public/reels", aba],
    initialPageParam: "",
    queryFn: async ({ pageParam }) => {
      const q = new URLSearchParams({ aba });
      if (pageParam) q.set("depois", String(pageParam));
      const r = await fetch(`/api/public/reels?${q}`, { credentials: "include" });
      if (!r.ok) throw new Error("Não foi possível carregar os reels.");
      return (await r.json()) as Pagina;
    },
    getNextPageParam: (u) => u.proximo ?? undefined,
  });
  const itens = lista.data?.pages.flatMap((p) => p.itens) ?? [];
  const precisaEntrar = lista.data?.pages[0]?.precisaEntrar;

  // A leva seguinte vem quando o penúltimo vídeo aparece.
  const fim = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = fim.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const olho = new IntersectionObserver(([e]) => {
      if (e.isIntersecting && lista.hasNextPage && !lista.isFetchingNextPage) void lista.fetchNextPage();
    });
    olho.observe(el);
    return () => olho.disconnect();
  }, [lista, itens.length]);

  useEffect(() => {
    const antes = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = antes;
    };
  }, []);

  return (
    <>
      {/*
        A tela cheia fica entre o console e o topo da janela: no celular e no
        tablet acima da barra da base; no computador, à direita da lateral de
        ícones (que abre com os nomes por cima dela, z-30). Do tablet em diante,
        o vídeo é uma coluna de 480 px centrada, de cantos arredondados.
      */}
      <div
        style={{ ["--acima-do-console" as string]: acimaDoConsole }}
        className="fixed inset-x-0 top-0 bottom-[var(--acima-do-console)] z-[25] bg-black text-branco lg:bottom-0 lg:left-[72px]"
      >
        <h1 className="sr-only">Reels</h1>
        <header className="pointer-events-none absolute inset-x-0 top-0 z-20 md:top-6">
          <div className="pointer-events-auto mx-auto flex max-w-[480px] items-center gap-2 bg-gradient-to-b from-black/60 to-transparent px-4 pb-6 pt-3 md:rounded-t-2xl">
            <div role="tablist" aria-label="Reels" className="flex flex-1 items-center gap-4">
              {(Object.entries(ABAS_DO_REELS) as [AbaDoReels, string][]).map(([id, rotulo]) => (
                <button
                  key={id}
                  type="button"
                  role="tab"
                  aria-selected={aba === id}
                  onClick={() => setAba(id)}
                  className={`min-h-10 font-display font-extrabold ${aba === id ? "text-xl" : "text-base opacity-70"}`}
                >
                  {rotulo}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => {
                guardarSomDosReels(mudo);
                setMudo(!mudo);
              }}
              aria-label={mudo ? "Ligar o som" : "Desligar o som"}
              aria-pressed={!mudo}
              className="flex h-10 w-10 items-center justify-center rounded-full hover:bg-white/20"
            >
              <svg viewBox="0 0 24 24" width={24} height={24} aria-hidden>
                <path d="M3 9.5h4l5-4v13l-5-4H3Z" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinejoin="round" />
                {mudo ? (
                  <path d="M16 9.5l5 5M21 9.5l-5 5" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" />
                ) : (
                  <path d="M16 8.5a5 5 0 0 1 0 7M18.5 6a8.5 8.5 0 0 1 0 12" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" />
                )}
              </svg>
            </button>
          </div>
        </header>

        <div className="h-full snap-y snap-mandatory overflow-y-auto overscroll-contain">
          {lista.isLoading ? <p className="flex h-full items-center justify-center text-sm">Carregando reels…</p> : null}
          {lista.isError ? <p className="flex h-full items-center justify-center text-sm">Não foi possível carregar os reels.</p> : null}
          {precisaEntrar ? (
            <p className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center text-sm">
              Entre na sua conta para ver os reels de quem você segue.
              <Link href="/entrar?volta=/reels" className={`inline-flex h-10 items-center justify-center rounded-lg px-4 text-[13px] font-semibold ${TONS_DO_BOTAO.primario}`}>
                Entrar
              </Link>
            </p>
          ) : null}
          {!lista.isLoading && !lista.isError && !precisaEntrar && itens.length === 0 ? (
            <p className="flex h-full items-center justify-center px-6 text-center text-sm">
              {aba === "seguindo" ? "Quem você segue ainda não publicou reels." : "Ainda não há reels no ar."}
            </p>
          ) : null}
          {itens.map((c, i) => (
            <Quadro
              key={c.reelsId ?? c.id}
              rifa={c}
              mudo={mudo}
              aoBarrado={() => setMudo(true)}
              aoComentar={() => setComentando(c.slug)}
              marca={i === Math.max(0, itens.length - 2) ? fim : undefined}
            />
          ))}
          {lista.isFetchingNextPage ? <p className="py-4 text-center text-xs">Carregando mais…</p> : null}
        </div>
        {comentando ? <PainelDeComentarios slug={comentando} onFechar={() => setComentando(null)} /> : null}
      </div>
      <ConsoleDoApp />
    </>
  );
}

function Quadro({
  rifa: c,
  mudo,
  aoBarrado,
  aoComentar,
  marca,
}: {
  rifa: ItemDoReels;
  mudo: boolean;
  /** O navegador barrou o som sem toque: o reel passa a tocar mudo. */
  aoBarrado: () => void;
  aoComentar: () => void;
  marca?: React.RefObject<HTMLDivElement>;
}) {
  const [, navegar] = useLocation();
  const video = useRef<HTMLVideoElement>(null);
  const [tocando, setTocando] = useState(false);
  useVideoHls(video, c.reels, c.reelsHls);
  const caminho = c.organizacao ? `/o/${c.organizacao.slug}/r/${c.slug}` : `/r/${c.slug}`;

  useEffect(() => {
    const v = video.current;
    if (!v || typeof IntersectionObserver === "undefined") return;
    const olho = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting && e.intersectionRatio >= 0.6) {
          v.play().catch(() => {
            // Sem som o navegador deixa tocar: tenta de novo mudo e avisa a tela.
            if (!v.muted) {
              v.muted = true;
              aoBarrado();
              v.play().catch(() => {});
            }
          });
        }
        else {
          v.pause();
          v.currentTime = 0;
        }
      },
      { threshold: [0, 0.6] },
    );
    olho.observe(v);
    return () => olho.disconnect();
  }, []);

  const alternar = () => {
    const v = video.current;
    if (!v) return;
    if (v.paused) v.play().catch(() => {});
    else v.pause();
  };

  return (
    <section className="relative h-full snap-start snap-always md:py-6" aria-label={c.prizeTitle}>
      <div className="relative mx-auto h-full w-full max-w-[480px] overflow-hidden bg-ink md:rounded-2xl">
        {c.reels ? (
          <video
            ref={video}
            poster={c.reelsPoster ?? undefined}
            playsInline
            loop
            muted={mudo}
            preload="metadata"
            onClick={alternar}
            onPlay={() => setTocando(true)}
            onPause={() => setTocando(false)}
            className="h-full w-full cursor-pointer object-cover"
          />
        ) : null}
        {!tocando ? (
          <button
            type="button"
            onClick={alternar}
            aria-label="Tocar vídeo"
            className="absolute left-1/2 top-1/2 flex h-16 w-16 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-black/50"
          >
            <svg viewBox="0 0 24 24" width={30} height={30} aria-hidden>
              <path d="M8 5.5v13l10.5-6.5Z" fill="currentColor" />
            </svg>
          </button>
        ) : null}
        {/* As figurinhas do vídeo (contagem, Comprar, texto, emoji): só o Comprar pega o toque. */}
        {c.reelsFigurinhas?.length ? (
          <FigurinhasNaTela figurinhas={c.reelsFigurinhas} perfil={c.organizacao?.slug ?? ""} aoSair={() => marcarOrigem("vitrine")} />
        ) : null}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black/70 to-transparent" />

        {/* A coluna de ações à direita: trevo, comentar, republicar, compartilhar, "+" e sacola. */}
        <div className="absolute bottom-20 right-2 z-10 flex flex-col items-center gap-3">
          <BarraDeAcoes
            vertical
            slug={c.slug}
            titulo={c.prizeTitle}
            caminho={caminho}
            interacoes={c.interacoes ?? SEM_INTERACAO}
            aoComentar={aoComentar}
            vende={c.vende}
          />
          <span className="text-branco">
            <BotaoDenunciar rifa={c.slug} soIcone />
          </span>
        </div>

        {/* Embaixo à esquerda: quem publicou, a legenda e o cartão da rifa com o Comprar. */}
        <div className="absolute inset-x-0 bottom-0 z-10 space-y-2.5 pb-4 pr-14">
          {c.organizacao ? (
            <CabecalhoDaPublicacao
              slug={c.organizacao.slug}
              nome={c.organizacao.nome}
              foto={c.organizacao.foto}
              verificada={c.organizacao.verificada}
              seguindo={c.organizacao.seguindo}
              sobreImagem
            />
          ) : null}
          {c.legenda ? <p className="mx-4 line-clamp-2 text-sm leading-snug">{c.legenda}</p> : null}
          <div className="mx-4 flex items-center gap-2.5 rounded-xl bg-black/45 px-2.5 py-2">
            <Link href={caminho} onClick={() => marcarOrigem("vitrine")} className="min-w-0 flex-1">
              <span className="block truncate text-sm font-bold leading-snug">{c.prizeTitle}</span>
              <span className="tnum block truncate font-mono text-[11px] opacity-85">
                <Money cents={c.priceCents} /> a cota
                {c.drawAt ? ` · sorteio ${new Date(c.drawAt).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })}` : ""}
                {c.autorizacao ? ` · ${c.autorizacao}` : ""}
              </span>
            </Link>
            {/* O Comprar leva à compra rápida da rifa: nada é reservado aqui. */}
            {c.vende ? (
              <Button className="shrink-0" onClick={() => navegar(`${caminho}?comprar=1`)}>
                Comprar
              </Button>
            ) : null}
          </div>
        </div>
        {marca ? <div ref={marca} aria-hidden className="absolute bottom-0 h-px w-px" /> : null}
      </div>
    </section>
  );
}
