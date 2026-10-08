import { useEffect, useRef, useState } from "react";
import { Link, useLocation } from "wouter";
import { useInfiniteQuery } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import { BarraDeAcoes, CabecalhoDaPublicacao, type Interacoes } from "@/components/Publicacao";
import { PainelDeComentarios } from "@/components/Comentarios";
import { BotaoDenunciar } from "@/components/Seguranca";
import { EmBreve } from "@/pages/EmBreve";
import { useConfigDoApp } from "@/components/Console";
import { Money } from "@/components/bits";
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
 * (as mesmas ações e a compra pela rifa), nada de reserva aqui.
 */
export default function ReelsPagina() {
  const { reelsLigado } = useConfigDoApp();
  if (!reelsLigado) return <EmBreve tela="reels" />;
  return <Reels />;
}

function Reels() {
  const [, navegar] = useLocation();
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
    <div className="fixed inset-0 z-40 bg-black text-branco">
      <header className="absolute inset-x-0 top-0 z-20 flex items-center gap-2 bg-gradient-to-b from-black/60 to-transparent px-3 py-3">
        <button
          type="button"
          aria-label="Voltar"
          onClick={() => (window.history.length > 1 ? window.history.back() : navegar("/"))}
          className="flex h-10 w-10 items-center justify-center rounded-full hover:bg-white/20"
        >
          <ArrowLeft size={24} aria-hidden />
        </button>
        <div role="tablist" aria-label="Reels" className="flex flex-1 justify-center gap-6">
          {(Object.entries(ABAS_DO_REELS) as [AbaDoReels, string][]).map(([id, rotulo]) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={aba === id}
              onClick={() => setAba(id)}
              className={`border-b-2 px-1 py-1 text-base font-bold ${aba === id ? "border-branco" : "border-transparent opacity-70"}`}
            >
              {rotulo}
            </button>
          ))}
        </div>
        <span className="w-10" aria-hidden />
      </header>

      <div className="h-full snap-y snap-mandatory overflow-y-auto overscroll-contain">
        {lista.isLoading ? <p className="flex h-full items-center justify-center text-sm">Carregando reels…</p> : null}
        {lista.isError ? <p className="flex h-full items-center justify-center text-sm">Não foi possível carregar os reels.</p> : null}
        {precisaEntrar ? (
          <p className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center text-sm">
            Entre na sua conta para ver os reels de quem você segue.
            <Link href="/entrar?volta=/reels" className="rounded-lg bg-branco px-4 py-2 font-semibold text-ink">
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
            aoSom={() => {
              guardarSomDosReels(mudo);
              setMudo(!mudo);
            }}
            aoBarrado={() => setMudo(true)}
            aoComentar={() => setComentando(c.slug)}
            marca={i === Math.max(0, itens.length - 2) ? fim : undefined}
          />
        ))}
        {lista.isFetchingNextPage ? <p className="py-4 text-center text-xs">Carregando mais…</p> : null}
      </div>
      {comentando ? <PainelDeComentarios slug={comentando} onFechar={() => setComentando(null)} /> : null}
    </div>
  );
}

function Quadro({
  rifa: c,
  mudo,
  aoSom,
  aoBarrado,
  aoComentar,
  marca,
}: {
  rifa: ItemDoReels;
  mudo: boolean;
  aoSom: () => void;
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
    <section className="relative h-full snap-start snap-always" aria-label={c.prizeTitle}>
      <div className="relative mx-auto h-full w-full max-w-[480px] bg-ink">
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
        <div className="absolute bottom-24 right-2 z-10 flex flex-col items-center gap-3">
          <BarraDeAcoes
            vertical
            slug={c.slug}
            titulo={c.prizeTitle}
            caminho={caminho}
            interacoes={c.interacoes ?? SEM_INTERACAO}
            aoComentar={aoComentar}
            vende={c.vende}
          />
          <button
            type="button"
            onClick={aoSom}
            aria-label={mudo ? "Ligar o som" : "Desligar o som"}
            aria-pressed={!mudo}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-black/50"
          >
            <svg viewBox="0 0 24 24" width={18} height={18} aria-hidden>
              <path d="M3 9.5h4l5-4v13l-5-4H3Z" fill="currentColor" />
              {mudo ? (
                <path d="M16 9.5l5 5M21 9.5l-5 5" stroke="currentColor" strokeWidth={2} strokeLinecap="round" />
              ) : (
                <path d="M16 8.5a5 5 0 0 1 0 7M18.5 6a8.5 8.5 0 0 1 0 12" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" />
              )}
            </svg>
          </button>
          <span className="text-branco">
            <BotaoDenunciar rifa={c.slug} soIcone />
          </span>
        </div>

        {/* O painel de quem publicou, embaixo à esquerda. */}
        <div className="absolute inset-x-0 bottom-16 z-10 pr-16">
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
          <Link
            href={caminho}
            onClick={() => marcarOrigem("vitrine")}
            className="mx-3 block text-sm font-semibold leading-snug"
          >
            {c.prizeTitle} · <Money cents={c.priceCents} className="tnum" /> a cota
          </Link>
          {c.legenda ? <p className="mx-3 mt-1 line-clamp-2 text-sm opacity-90">{c.legenda}</p> : null}
        </div>

        {/* A barra de baixo: comentar e, se a rifa vende, comprar. */}
        <div className="absolute inset-x-0 bottom-0 z-10 flex items-center gap-2 px-3 pb-3 pt-2">
          <button
            type="button"
            onClick={aoComentar}
            className="flex-1 rounded-full border border-branco/60 px-4 py-2 text-left text-sm opacity-90 hover:bg-white/10"
          >
            Comentar…
          </button>
          {c.vende ? (
            <button
              type="button"
              onClick={() => navegar(`${caminho}?comprar=1`)}
              className="rounded-full bg-marca px-4 py-2 text-sm font-semibold text-branco"
            >
              Comprar
            </button>
          ) : null}
        </div>
        {marca ? <div ref={marca} aria-hidden className="absolute bottom-0 h-px w-px" /> : null}
      </div>
    </section>
  );
}
