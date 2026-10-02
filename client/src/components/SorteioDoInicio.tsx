import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, Radio } from "lucide-react";
import {
  ATUALIZA_MS,
  Ganhadores,
  TelaDoProximoSorteio,
  type AoVivo,
} from "@/components/ColunaAoVivo";
import { Comentarios } from "@/components/Comentarios";
import {
  direcaoDoArrasto,
  resultadoDoGesto,
  toquePodeAbrir,
  type ElementoDoToque,
} from "@/lib/deslizar";
import { faltaParaOSorteio } from "@shared/aoVivo";

/** Onde a tela vale: abaixo de `md`, onde a vitrine não tem a coluna ao vivo. */
const NO_CELULAR = "(max-width: 767px)";
const MARCA = "#sorteio";

/**
 * A tela do sorteio principal no Início, só no celular (do tablet em diante a
 * coluna ao vivo já está ao lado do feed). Mora à esquerda da vitrine: abre
 * ao deslizar o dedo para a direita, ou pelo botão do topo, e fecha ao
 * deslizar de volta, pelo "Voltar" ou pelo voltar do aparelho (`#sorteio`).
 * Como no YouTube: o vídeo em cima (com tela cheia) e os comentários da rifa
 * abertos embaixo. O mesmo dado da coluna ao vivo (`/vitrine/ao-vivo`), só
 * buscado com a tela aberta.
 */
export function useSorteioDoInicio() {
  const [aberto, setAberto] = useState(false);
  const empurrou = useRef(false);

  const abrir = useCallback(() => {
    if (window.location.hash !== MARCA) {
      window.history.pushState(window.history.state, "", MARCA);
      empurrou.current = true;
    }
    setAberto(true);
  }, []);
  const fechar = useCallback(() => {
    // Volta o histórico que a abertura empurrou: o voltar do aparelho não
    // reabre a tela depois de fechada.
    if (empurrou.current && window.location.hash === MARCA) {
      empurrou.current = false;
      window.history.back();
    }
    setAberto(false);
  }, []);

  useEffect(() => {
    // Chegou direto com #sorteio (link ou recarga) e cabe o celular: abre.
    if (window.location.hash === MARCA && window.matchMedia(NO_CELULAR).matches)
      setAberto(true);
    const mudou = () => {
      if (window.location.hash !== MARCA) {
        empurrou.current = false;
        setAberto(false);
      }
    };
    window.addEventListener("popstate", mudou);
    return () => window.removeEventListener("popstate", mudou);
  }, []);

  return { aberto, abrir, fechar };
}

export function SorteioDoInicio({
  aberto,
  abrir,
  fechar,
}: {
  aberto: boolean;
  abrir: () => void;
  fechar: () => void;
}) {
  const [arrasto, setArrasto] = useState<number | null>(null);
  const toque = useRef<{
    x: number;
    y: number;
    podeAbrir: boolean;
    direcao: "lado" | "rolagem" | "indefinido";
  } | null>(null);
  const painel = useRef<HTMLDivElement>(null);
  const voltar = useRef<HTMLButtonElement>(null);

  // O gesto: o painel acompanha o dedo enquanto o arrasto é de lado.
  useEffect(() => {
    const celular = window.matchMedia(NO_CELULAR);
    const inicio = (e: TouchEvent) => {
      if (!celular.matches || e.touches.length !== 1) return;
      const t = e.touches[0];
      const alvo =
        e.target instanceof Element
          ? (e.target as unknown as ElementoDoToque)
          : null;
      const dentro = aberto ? painel.current?.contains(e.target as Node) : true;
      if (!dentro) return;
      toque.current = {
        x: t.clientX,
        y: t.clientY,
        // Aberto, o toque de dentro só fecha; fechado, vale a régua de quem rola de lado.
        podeAbrir: aberto
          ? true
          : toquePodeAbrir(
              alvo,
              (el) => getComputedStyle(el as unknown as Element).overflowX,
            ),
        direcao: "indefinido",
      };
    };
    const mover = (e: TouchEvent) => {
      const s = toque.current;
      if (!s || !s.podeAbrir) return;
      const t = e.touches[0];
      const dx = t.clientX - s.x;
      const dy = t.clientY - s.y;
      if (s.direcao === "indefinido") s.direcao = direcaoDoArrasto(dx, dy);
      if (s.direcao !== "lado") return;
      // Fechado, só para a direita; aberto, só para a esquerda.
      setArrasto(aberto ? Math.min(0, dx) : Math.max(0, dx));
    };
    const fim = (e: TouchEvent) => {
      const s = toque.current;
      toque.current = null;
      setArrasto(null);
      if (!s || !s.podeAbrir || s.direcao !== "lado") return;
      const t = e.changedTouches[0];
      const r = resultadoDoGesto(t.clientX - s.x, t.clientY - s.y, aberto);
      if (r === "abrir") abrir();
      else if (r === "fechar") fechar();
    };
    window.addEventListener("touchstart", inicio, { passive: true });
    window.addEventListener("touchmove", mover, { passive: true });
    window.addEventListener("touchend", fim, { passive: true });
    window.addEventListener("touchcancel", fim, { passive: true });
    return () => {
      window.removeEventListener("touchstart", inicio);
      window.removeEventListener("touchmove", mover);
      window.removeEventListener("touchend", fim);
      window.removeEventListener("touchcancel", fim);
    };
  }, [aberto, abrir, fechar]);

  // Aberta, a página de baixo não rola e o foco entra; fechada, volta.
  useEffect(() => {
    if (!aberto) return;
    const antes = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    voltar.current?.focus();
    const esc = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !document.fullscreenElement) fechar();
    };
    window.addEventListener("keydown", esc);
    return () => {
      document.body.style.overflow = overflow;
      window.removeEventListener("keydown", esc);
      antes?.focus?.();
    };
  }, [aberto, fechar]);

  // Posição: fechada fica fora da tela, à esquerda; o arrasto a traz junto.
  const largura = typeof window !== "undefined" ? window.innerWidth : 400;
  const deslocamento =
    arrasto === null
      ? aberto
        ? 0
        : -largura
      : aberto
        ? arrasto
        : -largura + arrasto;
  const visivel = aberto || arrasto !== null;

  return (
    <div
      ref={painel}
      role="dialog"
      aria-modal={aberto ? "true" : undefined}
      aria-label="Sorteio"
      aria-hidden={!aberto}
      className={`fixed inset-0 z-[60] flex flex-col bg-white md:hidden ${arrasto === null ? "transition-transform duration-200" : ""} ${visivel ? "" : "invisible"}`}
      style={{
        transform:
          deslocamento === 0 ? undefined : `translateX(${deslocamento}px)`,
      }}
    >
      {aberto ? <ConteudoDoSorteio fechar={fechar} voltar={voltar} /> : null}
      {!aberto && arrasto !== null ? (
        <ConteudoDoSorteio fechar={fechar} voltar={voltar} previa />
      ) : null}
    </div>
  );
}

function ConteudoDoSorteio({
  fechar,
  voltar,
  previa,
}: {
  fechar: () => void;
  voltar: React.RefObject<HTMLButtonElement>;
  previa?: boolean;
}) {
  const { data, isLoading } = useQuery<AoVivo>({
    queryKey: ["/api/public/vitrine/ao-vivo"],
    refetchInterval: previa ? false : ATUALIZA_MS,
    refetchIntervalInBackground: false,
  });
  const proximo = data?.proximo ?? null;
  const hora = proximo
    ? new Date(proximo.drawAt).toLocaleString("pt-BR", {
        day: "2-digit",
        month: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      })
    : null;
  const aoVivo = proximo
    ? faltaParaOSorteio(proximo.drawAt, Date.now()).aoVivo
    : false;

  return (
    <>
      <header className="flex shrink-0 items-center gap-2 border-b border-line px-2 py-2">
        <button
          ref={voltar}
          type="button"
          onClick={fechar}
          className="flex items-center gap-1 rounded-md p-2 text-sm font-semibold hover:bg-mist"
        >
          <ChevronLeft size={20} aria-hidden /> Voltar ao início
        </button>
        <h2 className="ml-auto flex items-center gap-1.5 pr-2 text-sm font-bold">
          <Radio size={16} aria-hidden className="text-marca" />
          {aoVivo ? "Sorteio ao vivo" : "Próximo sorteio"}
        </h2>
      </header>
      {/* O vídeo fica parado no alto; o que rola é a conversa. */}
      <div className="shrink-0">
        <TelaDoProximoSorteio proximo={proximo} />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-8 pt-3">
        {isLoading ? <p className="text-sm text-muted">Carregando…</p> : null}
        {proximo ? (
          <>
            <Link
              href={`/o/${proximo.organizacao.slug}/r/${proximo.slug}`}
              className="block rounded-lg hover:bg-mist"
            >
              <span className="block font-display text-lg font-bold leading-tight">
                {proximo.prizeTitle}
              </span>
              <span className="block text-sm text-muted">
                {proximo.organizacao.nome} · sorteio{" "}
                <span className="tnum">{hora}</span>
              </span>
            </Link>
            <div className="mt-4 border-t border-line pt-3">
              <h3 className="mb-2 text-sm font-bold">Comentários</h3>
              {previa ? null : (
                <Comentarios slug={proximo.slug} dentroDoPainel />
              )}
            </div>
          </>
        ) : !isLoading ? (
          <div className="space-y-3">
            <p className="text-sm text-muted">
              Nenhum sorteio marcado agora. Os últimos ganhadores:
            </p>
            <Ganhadores lista={data?.ganhadores} />
          </div>
        ) : null}
      </div>
    </>
  );
}

/** O caminho sem gesto para a mesma tela (acessibilidade: gesto nunca é o único jeito). */
export function BotaoDoSorteio({ onAbrir }: { onAbrir: () => void }) {
  return (
    <button
      type="button"
      onClick={onAbrir}
      aria-label="Sorteio ao vivo (ou deslize para a direita)"
      title="Sorteio ao vivo"
      className="rounded-full p-2 text-ink hover:bg-mist md:hidden"
    >
      <Radio size={22} aria-hidden />
    </button>
  );
}

/**
 * A contagem do próximo sorteio na faixa de cima do Início (à direita do
 * estado), com a cara da tela do sorteio: fundo escuro e as casas de dias,
 * horas, minutos e segundos. É botão: abre a tela do sorteio, à esquerda do
 * Início. Só no celular — do tablet em diante a coluna ao vivo já mostra a
 * contagem.
 */
export function ContagemDoSorteio({ onAbrir }: { onAbrir: () => void }) {
  const { data } = useQuery<AoVivo>({
    queryKey: ["/api/public/vitrine/ao-vivo"],
    refetchInterval: ATUALIZA_MS,
    refetchIntervalInBackground: false,
  });
  const [agora, setAgora] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setAgora(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const proximo = data?.proximo ?? null;
  const falta = proximo ? faltaParaOSorteio(proximo.drawAt, agora) : null;

  const casas: [number, string][] = falta
    ? [
        [falta.dias, "d"],
        [falta.horas, "h"],
        [falta.minutos, "m"],
        [falta.segundos, "s"],
      ]
    : [];
  const rotulo = !proximo
    ? "Nenhum sorteio marcado: ver os últimos ganhadores"
    : falta?.aoVivo
      ? `Sorteio ao vivo agora: ${proximo.prizeTitle}. Abrir a tela do sorteio`
      : `Próximo sorteio em ${falta?.dias} dias, ${falta?.horas} horas e ${falta?.minutos} minutos: ${proximo.prizeTitle}. Abrir a tela do sorteio`;

  return (
    <button
      type="button"
      onClick={onAbrir}
      aria-label={rotulo}
      className="ml-auto flex h-9 min-w-0 items-center gap-1.5 rounded-md border border-line-2 bg-[#0B1F14] px-2 text-branco md:hidden"
    >
      <Radio size={14} aria-hidden className="shrink-0 text-[#8cc2ff]" />
      {!proximo ? (
        <span className="truncate text-xs font-semibold">Ganhadores</span>
      ) : falta?.aoVivo ? (
        <span className="truncate text-xs font-bold uppercase tracking-wide">Ao vivo</span>
      ) : (
        <span aria-hidden className="flex items-center gap-1">
          {casas.map(([n, u]) => (
            <span key={u} className="rounded bg-branco/10 px-1 py-0.5 text-xs leading-none">
              <span className="tnum font-bold">{String(n).padStart(2, "0")}</span>
              <span className="text-[10px] text-branco/70">{u}</span>
            </span>
          ))}
        </span>
      )}
    </button>
  );
}
