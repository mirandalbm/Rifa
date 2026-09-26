import { useEffect, useRef, useState } from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { X } from "lucide-react";
import { FotoDoPerfil } from "@/components/Seguir";
import { marcarVisto, vistoAte } from "@/lib/stories";
import { marcarOrigem } from "@/lib/origem";
import { STORY_SEGUNDOS, temStoryNovo } from "@shared/vitrine";

interface Story {
  id: string;
  imagem: string;
  legenda: string | null;
  criadoEm: string;
  rifa: { slug: string; premio: string } | null;
}

interface StoriesDoPerfil {
  slug: string;
  nome: string;
  foto: string | null;
  stories: Story[];
}

/** Re-desenha quando algum story é marcado como visto (nesta aba). */
export function useVistos() {
  const [, setN] = useState(0);
  useEffect(() => {
    const f = () => setN((n) => n + 1);
    window.addEventListener("rifa:stories-vistos", f);
    return () => window.removeEventListener("rifa:stories-vistos", f);
  }, []);
}

/**
 * A foto do perfil com o anel de story: grosso e na cor de marca quando há
 * story que a pessoa ainda não viu; fino e cinza quando já viu tudo; sem
 * anel quando não há story. O estado vai também no rótulo — nunca só cor.
 */
export function FotoComStory({
  slug,
  nome,
  foto,
  ultimoStory,
  tamanho,
  onAbrir,
}: {
  slug: string;
  nome: string;
  foto: string | null;
  ultimoStory: string | null;
  tamanho: number;
  onAbrir: () => void;
}) {
  useVistos();
  if (!ultimoStory) return <FotoDoPerfil nome={nome} foto={foto} tamanho={tamanho} />;
  const novo = temStoryNovo(ultimoStory, vistoAte(slug));
  return (
    <button
      type="button"
      onClick={onAbrir}
      aria-label={`Ver stories de ${nome}${novo ? " (novo)" : ""}`}
      className={`block w-fit shrink-0 rounded-full p-[2px] ${novo ? "border-[3px] border-marca" : "border border-line-2"}`}
    >
      <span className="block rounded-full bg-white p-[2px]">
        <FotoDoPerfil nome={nome} foto={foto} tamanho={tamanho} />
      </span>
    </button>
  );
}

const tempoAtras = (iso: string) => {
  const min = Math.max(1, Math.round((Date.now() - new Date(iso).getTime()) / 60_000));
  return min < 60 ? `${min} min` : `${Math.floor(min / 60)} h`;
};

/**
 * Stories em tela cheia, como no Instagram: barras de progresso no topo,
 * toque na direita avança, na esquerda volta, segurar pausa. Começa no
 * primeiro que a pessoa ainda não viu. Fundo preto nos dois temas: é foto.
 */
export function VisualizadorDeStories({ slug, onFechar }: { slug: string; onFechar: () => void }) {
  const { data, isError } = useQuery<StoriesDoPerfil>({ queryKey: [`/api/public/o/${slug}/stories`], staleTime: 0 });
  const [i, setI] = useState<number | null>(null);
  const [pausado, setPausado] = useState(false);
  const [progresso, setProgresso] = useState(0);
  const inicio = useRef(0);
  const acumulado = useRef(0);
  const lista = data?.stories ?? [];

  // Primeiro não visto; tudo visto, recomeça do primeiro.
  useEffect(() => {
    if (!data || i !== null) return;
    if (data.stories.length === 0) return onFechar();
    const visto = vistoAte(slug);
    const k = data.stories.findIndex((s) => temStoryNovo(s.criadoEm, visto));
    setI(k >= 0 ? k : 0);
  }, [data, i, slug, onFechar]);

  const atual = i !== null ? lista[i] : undefined;
  useEffect(() => {
    if (atual) marcarVisto(slug, atual.criadoEm);
    acumulado.current = 0;
    setProgresso(0);
  }, [atual, slug]);

  const proximo = () => (i !== null && i < lista.length - 1 ? setI(i + 1) : onFechar());
  const anterior = () => (i !== null && i > 0 ? setI(i - 1) : undefined);

  // Relógio do story: anda enquanto não está pausado.
  useEffect(() => {
    if (!atual || pausado) return;
    inicio.current = performance.now();
    let quadro = 0;
    const passo = () => {
      const p = (acumulado.current + performance.now() - inicio.current) / (STORY_SEGUNDOS * 1000);
      if (p >= 1) return proximo();
      setProgresso(p);
      quadro = requestAnimationFrame(passo);
    };
    quadro = requestAnimationFrame(passo);
    return () => {
      cancelAnimationFrame(quadro);
      acumulado.current += performance.now() - inicio.current;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [atual, pausado]);

  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      if (e.key === "Escape") onFechar();
      if (e.key === "ArrowRight") proximo();
      if (e.key === "ArrowLeft") anterior();
    };
    window.addEventListener("keydown", tecla);
    const antes = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", tecla);
      document.body.style.overflow = antes;
    };
  });

  return (
    <div role="dialog" aria-modal="true" aria-label={data ? `Stories de ${data.nome}` : "Stories"} className="fixed inset-0 z-50 flex items-center justify-center bg-black">
      {isError ? (
        <p className="text-sm text-branco">Não consegui abrir os stories.</p>
      ) : !data || !atual ? (
        <p className="text-sm text-branco/70">Carregando…</p>
      ) : (
        <div className="relative h-full max-h-[100dvh] w-full max-w-[min(100vw,56.25dvh)]">
          <img src={atual.imagem} alt={atual.legenda ?? `Story de ${data.nome}`} className="h-full w-full select-none object-contain" draggable={false} />

          {/* Toque: esquerda volta, direita avança; segurar pausa. */}
          <div className="absolute inset-0 flex" onPointerDown={() => setPausado(true)} onPointerUp={() => setPausado(false)} onPointerLeave={() => setPausado(false)}>
            <button type="button" aria-label="Story anterior" className="h-full w-1/3 cursor-default" onClick={anterior} />
            <button type="button" aria-label="Próximo story" className="h-full w-2/3 cursor-default" onClick={proximo} />
          </div>

          <div className="pointer-events-none absolute inset-x-0 top-0 bg-gradient-to-b from-black/60 to-transparent px-3 pb-8 pt-3">
            <div className="flex gap-1" aria-hidden>
              {lista.map((s, k) => (
                <span key={s.id} className="h-0.5 flex-1 overflow-hidden rounded-full bg-branco/35">
                  <span className="block h-full bg-branco" style={{ width: `${k < i! ? 100 : k === i ? progresso * 100 : 0}%` }} />
                </span>
              ))}
            </div>
            <div className="pointer-events-auto mt-3 flex items-center gap-2 text-branco">
              <Link href={`/o/${data.slug}`} onClick={onFechar} className="flex min-w-0 items-center gap-2">
                <FotoDoPerfil nome={data.nome} foto={data.foto} tamanho={32} />
                <span className="truncate text-sm font-semibold">{data.nome}</span>
              </Link>
              <span className="tnum shrink-0 text-xs text-branco/70">{tempoAtras(atual.criadoEm)}</span>
              <button type="button" onClick={onFechar} aria-label="Fechar stories" className="ml-auto rounded-full p-1.5 hover:bg-branco/10">
                <X size={22} aria-hidden />
              </button>
            </div>
          </div>

          {atual.legenda || atual.rifa ? (
            <div className="absolute inset-x-0 bottom-0 space-y-3 bg-gradient-to-t from-black/70 to-transparent px-4 pb-6 pt-12 text-branco">
              {atual.legenda ? <p className="text-sm">{atual.legenda}</p> : null}
              {atual.rifa ? (
                <Link
                  href={`/o/${data.slug}/r/${atual.rifa.slug}`}
                  onClick={() => {
                    marcarOrigem("story");
                    onFechar();
                  }}
                  className="block rounded-md bg-branco px-4 py-2.5 text-center text-sm font-semibold text-[#0b1f14]"
                >
                  Ver a rifa: {atual.rifa.premio}
                </Link>
              ) : null}
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
