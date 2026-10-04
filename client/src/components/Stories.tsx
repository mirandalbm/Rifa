import { useEffect, useRef, useState } from "react";
import { Link } from "wouter";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Volume2, VolumeX, X } from "lucide-react";
import { FotoDoPerfil } from "@/components/Seguir";
import { marcarVisto, vistoAte } from "@/lib/stories";
import { marcarOrigem } from "@/lib/origem";
import { STORY_SEGUNDOS, temStoryNovo } from "@shared/vitrine";
import { ApiError, apiRequest } from "@/lib/queryClient";
import { type FigurinhaNaTela, nomeDoEmoji, textoDaContagem } from "@shared/figurinhasStory";

interface Story {
  id: string;
  tipo: "imagem" | "video";
  poster?: string | null;
  /** O endereço do arquivo: imagem ou vídeo, conforme `tipo`. */
  imagem: string;
  legenda: string | null;
  criadoEm: string;
  rifa: { slug: string; premio: string } | null;
  enquete?: EnqueteDoStory | null;
  figurinhas?: FigurinhaNaTela[];
}

/** A enquete como a tela recebe: o resultado só vem para quem já votou. */
interface EnqueteDoStory {
  pergunta: string;
  opcoes: string[];
  meuVoto: number | null;
  percentuais: number[] | null;
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

/** A transmissão do sorteio no ar agora (o servidor decide: `transmissaoNoAr()`). */
export interface AoVivoDaOrg {
  slug: string;
  premio: string;
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
  aoVivo = null,
}: {
  slug: string;
  nome: string;
  foto: string | null;
  ultimoStory: string | null;
  tamanho: number;
  onAbrir: () => void;
  /** Transmissão no ar: o anel ganha o selo "AO VIVO" (texto, não só cor). */
  aoVivo?: AoVivoDaOrg | null;
}) {
  useVistos();
  if (!ultimoStory && !aoVivo) return <FotoDoPerfil nome={nome} foto={foto} tamanho={tamanho} />;
  const novo = temStoryNovo(ultimoStory, vistoAte(slug));
  const anel = `block w-fit shrink-0 rounded-full p-[2px] ${aoVivo || novo ? "border-[3px] border-marca" : "border border-line-2"}`;
  const miolo = (
    <>
      <span className="block rounded-full bg-white p-[2px]">
        <FotoDoPerfil nome={nome} foto={foto} tamanho={tamanho} />
      </span>
      {aoVivo ? <SeloAoVivo /> : null}
    </>
  );
  if (aoVivo && !ultimoStory) {
    // Sem story, o anel leva direto à transmissão, na página da rifa.
    return (
      <Link
        href={`/o/${slug}/r/${aoVivo.slug}`}
        onClick={() => marcarOrigem("story")}
        aria-label={`Assistir ao vivo: sorteio de ${nome}`}
        className={`relative ${anel}`}
      >
        {miolo}
      </Link>
    );
  }
  return (
    <button
      type="button"
      onClick={onAbrir}
      aria-label={`Ver stories de ${nome}${aoVivo ? " (ao vivo agora)" : ""}${novo ? " (novo)" : ""}`}
      className={`relative ${anel}`}
    >
      {miolo}
    </button>
  );
}

/** O selo em texto, preso à borda de baixo do anel. Cor de superfície invertida: lê nos dois temas. */
function SeloAoVivo() {
  return (
    <span
      aria-hidden
      className="absolute -bottom-1 left-1/2 -translate-x-1/2 whitespace-nowrap rounded bg-ink px-1.5 py-px text-[10px] font-bold uppercase leading-tight tracking-wide text-white"
    >
      Ao vivo
    </span>
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
export function VisualizadorDeStories({
  slug,
  onFechar,
  aoVivo = null,
}: {
  slug: string;
  onFechar: () => void;
  aoVivo?: AoVivoDaOrg | null;
}) {
  // Sem guardar ao fechar: a lista traz o voto de quem olha, e quem entra
  // depois na mesma aba não pode ver por um instante o resultado de outro.
  const { data, isError } = useQuery<StoriesDoPerfil>({ queryKey: [`/api/public/o/${slug}/stories`], staleTime: 0, gcTime: 0 });
  const [i, setI] = useState<number | null>(null);
  const [pausado, setPausado] = useState(false);
  const [progresso, setProgresso] = useState(0);
  const [mudo, setMudo] = useState(false);
  const video = useRef<HTMLVideoElement>(null);
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
    // Vídeo: quem manda no tempo é o próprio vídeo (progresso e fim abaixo).
    if (!atual || atual.tipo === "video" || pausado) return;
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

  // Segurar pausa o vídeo também; solto, ele segue de onde parou.
  useEffect(() => {
    const v = video.current;
    if (!v) return;
    if (pausado) v.pause();
    else v.play().catch(() => {
      // O navegador não deixou tocar com som: toca mudo, e o botão devolve o som.
      v.muted = true;
      setMudo(true);
      v.play().catch(() => undefined);
    });
  }, [pausado, atual]);

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
    <div role="dialog" aria-modal="true" aria-label={data ? `Stories de ${data.nome}` : "Stories"} className="fixed inset-0 z-[70] flex items-center justify-center bg-black">
      {isError ? (
        <p className="text-sm text-branco">Não consegui abrir os stories.</p>
      ) : !data || !atual ? (
        <p className="text-sm text-branco/70">Carregando…</p>
      ) : (
        <div className="relative h-full max-h-[100dvh] w-full max-w-[min(100vw,56.25dvh)]">
          {atual.tipo === "video" ? (
            <video
              ref={video}
              key={atual.id}
              src={atual.imagem}
              poster={atual.poster ?? undefined}
              aria-label={atual.legenda ?? `Story em vídeo de ${data.nome}`}
              className="h-full w-full select-none object-contain"
              autoPlay
              playsInline
              muted={mudo}
              onTimeUpdate={(e) => {
                const v = e.currentTarget;
                if (v.duration > 0) setProgresso(v.currentTime / v.duration);
              }}
              onEnded={proximo}
              onError={proximo}
            />
          ) : (
            <img src={atual.imagem} alt={atual.legenda ?? `Story de ${data.nome}`} className="h-full w-full select-none object-contain" draggable={false} />
          )}

          {/* Toque: esquerda volta, direita avança; segurar pausa. */}
          <div className="absolute inset-0 flex" onPointerDown={() => setPausado(true)} onPointerUp={() => setPausado(false)} onPointerLeave={() => setPausado(false)}>
            <button type="button" aria-label="Story anterior" className="h-full w-1/3 cursor-default" onClick={anterior} />
            <button type="button" aria-label="Próximo story" className="h-full w-2/3 cursor-default" onClick={proximo} />
          </div>

          {atual.enquete ? (
            <EnqueteNoStory
              key={atual.id}
              storyId={atual.id}
              enquete={atual.enquete}
              chave={`/api/public/o/${slug}/stories`}
              aoTocar={() => setPausado(true)}
              aoSoltar={() => setPausado(false)}
            />
          ) : null}

          {atual.figurinhas?.length ? (
            <FigurinhasNoStory
              key={`f-${atual.id}`}
              figurinhas={atual.figurinhas}
              perfil={data.slug}
              aoSair={() => {
                marcarOrigem("story");
                onFechar();
              }}
            />
          ) : null}

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
              {atual.tipo === "video" ? (
                <button
                  type="button"
                  onClick={() => setMudo((m) => !m)}
                  aria-label={mudo ? "Ligar o som" : "Desligar o som"}
                  aria-pressed={!mudo}
                  className="ml-auto rounded-full p-1.5 hover:bg-branco/10"
                >
                  {mudo ? <VolumeX size={22} aria-hidden /> : <Volume2 size={22} aria-hidden />}
                </button>
              ) : null}
              <button type="button" onClick={onFechar} aria-label="Fechar stories" className={`${atual.tipo === "video" ? "" : "ml-auto "} rounded-full p-1.5 hover:bg-branco/10`}>
                <X size={22} aria-hidden />
              </button>
            </div>
          </div>

          {atual.legenda || atual.rifa || aoVivo ? (
            <div className="absolute inset-x-0 bottom-0 space-y-3 bg-gradient-to-t from-black/70 to-transparent px-4 pb-6 pt-12 text-branco">
              {aoVivo ? (
                <Link
                  href={`/o/${data.slug}/r/${aoVivo.slug}`}
                  onClick={() => {
                    marcarOrigem("story");
                    onFechar();
                  }}
                  className="block rounded-md border border-branco px-4 py-2.5 text-center text-sm font-semibold text-branco"
                >
                  Ao vivo agora: assistir ao sorteio de {aoVivo.premio}
                </Link>
              ) : null}
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

/**
 * A enquete por cima do story, como a figurinha do Instagram: a pergunta e as
 * opções. Toque numa opção vota (só com conta: sem ela, o convite para
 * entrar); depois do voto, cada opção mostra o percentual, e a escolhida vem
 * marcada com ✓ e "Seu voto" — nunca só pela cor. Enquanto o dedo está no
 * cartão, o story fica parado.
 */
function EnqueteNoStory({
  storyId,
  enquete,
  chave,
  aoTocar,
  aoSoltar,
}: {
  storyId: string;
  enquete: EnqueteDoStory;
  chave: string;
  aoTocar: () => void;
  aoSoltar: () => void;
}) {
  const qc = useQueryClient();
  const [estado, setEstado] = useState(enquete);
  const [enviando, setEnviando] = useState(false);
  const [aviso, setAviso] = useState<"entrar" | string | null>(null);
  const votou = estado.meuVoto !== null && estado.percentuais !== null;

  async function votar(opcao: number) {
    if (votou || enviando) return;
    setEnviando(true);
    setAviso(null);
    try {
      const r = (await (await apiRequest("POST", `/api/public/stories/${storyId}/enquete`, { opcao })).json()) as { meuVoto: number; percentuais: number[] };
      setEstado({ ...estado, meuVoto: r.meuVoto, percentuais: r.percentuais });
      // A lista guardada passa a ter o voto: voltar a este story não pede de novo.
      qc.invalidateQueries({ queryKey: [chave] });
    } catch (e) {
      const erro = e as ApiError;
      setAviso(erro.status === 401 ? "entrar" : erro.message);
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="absolute inset-x-6 top-1/2 z-10 -translate-y-1/2">
      <div
        role="group"
        aria-label={`Enquete: ${estado.pergunta}`}
        className="rounded-2xl bg-branco p-4 text-[#0b1f14] shadow-lg"
        onPointerDown={(e) => {
          e.stopPropagation();
          aoTocar();
        }}
        onPointerUp={(e) => {
          e.stopPropagation();
          aoSoltar();
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <p className="text-center text-base font-bold">{estado.pergunta}</p>
        <ul className="mt-3 space-y-2">
          {estado.opcoes.map((o, k) => {
            const pct = estado.percentuais?.[k] ?? 0;
            const minha = estado.meuVoto === k;
            return (
              <li key={k}>
                <button
                  type="button"
                  disabled={votou || enviando}
                  onClick={() => void votar(k)}
                  aria-pressed={minha}
                  aria-label={votou ? `${o}: ${pct}%${minha ? ", seu voto" : ""}` : `Votar em ${o}`}
                  className={`relative flex min-h-11 w-full items-center overflow-hidden rounded-xl border px-3 py-2 text-left text-sm font-semibold ${
                    minha ? "border-[#0b6b3a]" : "border-[#0b1f14]/20"
                  } ${votou ? "cursor-default" : "hover:bg-[#0b1f14]/5"}`}
                >
                  {votou ? (
                    <span aria-hidden className={`absolute inset-y-0 left-0 ${minha ? "bg-[#0b6b3a]/20" : "bg-[#0b1f14]/10"}`} style={{ width: `${pct}%` }} />
                  ) : null}
                  <span className="relative min-w-0 flex-1 truncate">
                    {minha ? "✓ " : ""}
                    {o}
                  </span>
                  {votou ? <span className="tnum relative ml-2 shrink-0">{pct}%</span> : null}
                </button>
              </li>
            );
          })}
        </ul>
        {votou ? <p className="mt-2 text-center text-xs text-[#0b1f14]/70">Seu voto: {estado.opcoes[estado.meuVoto!]}</p> : null}
        {aviso === "entrar" ? (
          <p className="mt-2 text-center text-xs">
            <Link href={`/entrar?volta=${encodeURIComponent(window.location.pathname)}`} className="font-semibold underline">
              Entre na sua conta
            </Link>{" "}
            para votar.
          </p>
        ) : aviso ? (
          <p role="alert" className="mt-2 text-center text-xs text-[#b42318]">
            {aviso}
          </p>
        ) : null}
      </div>
    </div>
  );
}

/** Re-desenha a cada segundo enquanto há o que contar. */
function useAgora(ligado: boolean) {
  const [agora, setAgora] = useState(() => new Date());
  useEffect(() => {
    if (!ligado) return;
    const t = window.setInterval(() => setAgora(new Date()), 1000);
    return () => window.clearInterval(t);
  }, [ligado]);
  return agora;
}

/**
 * As figurinhas por cima do story, cada uma no ponto que a organização
 * escolheu. Texto, emoji e contagem não pegam o toque (o toque segue
 * passando o story); só o Comprar é botão. O estado vai em texto, nunca só
 * na cor.
 */
function FigurinhasNoStory({ figurinhas, perfil, aoSair }: { figurinhas: FigurinhaNaTela[]; perfil: string; aoSair: () => void }) {
  const contagem = figurinhas.find((f) => f.tipo === "contagem");
  const agora = useAgora(Boolean(contagem && contagem.tipo === "contagem" && contagem.drawAt && !contagem.sorteada));
  return (
    <>
      {figurinhas.map((f, k) => {
        const lugar = { left: `${f.x * 100}%`, top: `${f.y * 100}%` };
        const base = "absolute z-10 max-w-[80%] -translate-x-1/2 -translate-y-1/2";
        if (f.tipo === "comprar") {
          return (
            <Link
              key={k}
              href={`/o/${perfil}/r/${f.slug}?comprar=1`}
              onClick={aoSair}
              style={lugar}
              className={`${base} whitespace-nowrap rounded-full bg-[#0b6b3a] px-5 py-2.5 text-sm font-bold text-branco shadow-lg`}
            >
              Comprar
            </Link>
          );
        }
        if (f.tipo === "contagem") {
          const c = textoDaContagem(f.drawAt, f.sorteada, agora);
          return (
            <div
              key={k}
              role="timer"
              aria-label={c.texto}
              style={lugar}
              className={`${base} pointer-events-none rounded-xl bg-[#0b1f14]/85 px-3 py-2 text-center text-branco shadow-lg`}
            >
              <p className="text-[11px] font-semibold uppercase tracking-wide text-branco/80" aria-hidden>
                {c.partes ? "Sorteio em" : c.texto}
              </p>
              {c.partes ? (
                <p className="tnum mt-0.5 flex gap-1.5 text-lg font-bold" aria-hidden>
                  {c.partes.map((p) => (
                    <span key={p.unidade}>
                      {String(p.valor).padStart(2, "0")}
                      <span className="text-xs font-semibold text-branco/70">{p.unidade}</span>
                    </span>
                  ))}
                </p>
              ) : null}
            </div>
          );
        }
        if (f.tipo === "texto") {
          return (
            <p
              key={k}
              style={lugar}
              className={`${base} pointer-events-none rounded-lg bg-black/60 px-3 py-1.5 text-center text-base font-semibold text-branco`}
            >
              {f.texto}
            </p>
          );
        }
        return (
          <span key={k} role="img" aria-label={nomeDoEmoji(f.emoji)} style={lugar} className={`${base} pointer-events-none text-5xl leading-none`}>
            {f.emoji}
          </span>
        );
      })}
    </>
  );
}
