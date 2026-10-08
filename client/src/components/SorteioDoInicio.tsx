import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, Radio } from "lucide-react";
import { Comentarios } from "@/components/Comentarios";
import { FOTO_COMO_NO_INSTAGRAM, FotoDoPerfil } from "@/components/Seguir";
import { VisualizadorDeStories, useVistos } from "@/components/Stories";
import { vistoAte } from "@/lib/stories";
import { temStoryNovo } from "@shared/vitrine";
import {
  ATUALIZA_MS,
  TelaDoProximoSorteio,
  type AoVivo,
} from "@/components/ColunaAoVivo";
import {
  direcaoDoArrasto,
  resultadoDoGesto,
  toquePodeAbrir,
  type ElementoDoToque,
} from "@/lib/deslizar";
import { faltaParaOSorteio, type VideoDaTransmissao } from "@shared/aoVivo";

/** Onde a tela vale: abaixo de `md`, onde a vitrine não tem a coluna ao vivo. */
/**
 * O celular, em pé ou deitado: deitado ele passa de 768 px de largura, mas
 * a altura fica baixa — sem isto, girar o aparelho com o vídeo em tela cheia
 * escondia a tela do sorteio inteira. A mesma régua está na classe do painel.
 */
const NO_CELULAR = "(max-width: 767px), (max-height: 500px)";
const MARCA = "#sorteio";

/**
 * A tela do sorteio principal no Início, só no celular (do tablet em diante a
 * coluna ao vivo já está ao lado do feed). Mora à esquerda da vitrine: abre
 * ao deslizar o dedo para a direita, ou pela contagem da faixa do estado, e fecha ao
 * deslizar de volta, pelo "Voltar" ou pelo voltar do aparelho (`#sorteio`).
 * Como no YouTube: o vídeo em cima (com tela cheia), a fileira das rifas
 * integradas e os comentários do sorteio oficial abertos embaixo. O mesmo dado da coluna ao vivo (`/vitrine/ao-vivo`), só
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
    } else if (window.location.hash === MARCA) {
      // Chegou com #sorteio (o "Ver o sorteio" da rifa): tira a marca sem voltar de página.
      window.history.replaceState(window.history.state, "", window.location.pathname + window.location.search);
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
        // Aberto, o toque de dentro só fecha — menos na fileira das rifas, que
        // rola de lado, e nos campos; fechado, vale a régua de quem rola de lado.
        podeAbrir: aberto
          ? !(e.target instanceof Element && e.target.closest("[data-sem-gesto], input, textarea, select"))
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
      className={`fixed inset-0 z-[60] flex flex-col bg-white [@media(min-width:768px)_and_(min-height:501px)]:hidden ${arrasto === null ? "transition-transform duration-200" : ""} ${visivel ? "" : "invisible"}`}
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

/** O sorteio oficial da tela (GET /api/public/sorteio-oficial). */
export interface SorteioOficialDaTela {
  sorteio: {
    id: string;
    nome: string;
    loteriaNome: string;
    concurso: number;
    sorteioEm: string;
    resultado: string[] | null;
    situacao: "agendado" | "com_resultado" | "cancelado";
    selo: string;
    video: VideoDaTransmissao | null;
    rifas: {
      slug: string;
      premio: string;
      capa: string | null;
      organizacao: OrganizacaoDoAvatar;
      numeroContemplado: string | null;
    }[];
  } | null;
  /** Sem sorteio oficial: as rifas dos próximos sorteios, a mais próxima primeiro. */
  proximas?: { slug: string; premio: string; organizacao: OrganizacaoDoAvatar }[];
}

interface OrganizacaoDoAvatar {
  slug: string;
  nome: string;
  foto: string | null;
  ultimoStory: string | null;
}

const CHAVE_DO_SORTEIO = ["/api/public/sorteio-oficial"];
/** O mesmo dado da coluna ao vivo do tablet e do computador. */
const CHAVE_AO_VIVO = ["/api/public/vitrine/ao-vivo"];

function ConteudoDoSorteio({
  fechar,
  voltar,
  previa,
}: {
  fechar: () => void;
  voltar: React.RefObject<HTMLButtonElement>;
  previa?: boolean;
}) {
  const { data, isLoading } = useQuery<SorteioOficialDaTela>({
    queryKey: CHAVE_DO_SORTEIO,
    refetchInterval: previa ? false : ATUALIZA_MS,
    refetchIntervalInBackground: false,
  });
  const s = data?.sorteio ?? null;
  // Sem sorteio oficial, a tela mostra o próximo sorteio de rifa, como a
  // coluna ao vivo do tablet e do computador.
  const { data: dadosAoVivo } = useQuery<AoVivo>({
    queryKey: CHAVE_AO_VIVO,
    enabled: Boolean(data) && !s,
    refetchInterval: previa ? false : ATUALIZA_MS,
    refetchIntervalInBackground: false,
  });
  const daRifa = !s ? (dadosAoVivo?.proximo ?? null) : null;
  const proximas = data?.proximas ?? [];
  const [stories, setStories] = useState<string | null>(null);
  const hora = s
    ? new Date(s.sorteioEm).toLocaleString("pt-BR", {
        day: "2-digit",
        month: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      })
    : null;
  const comResultado = s?.situacao === "com_resultado";
  const aoVivo = s && !comResultado ? faltaParaOSorteio(s.sorteioEm, Date.now()).aoVivo : false;
  // A mesma tela da coluna ao vivo: contagem e, na hora, a transmissão.
  const naTela: AoVivo["proximo"] =
    s && !comResultado
      ? { slug: "", organizacao: { slug: "", nome: "" }, prizeTitle: s.nome, drawAt: s.sorteioEm, video: s.video }
      : daRifa;
  const aoVivoDaRifa = daRifa ? faltaParaOSorteio(daRifa.drawAt, Date.now()).aoVivo : false;

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
          {comResultado ? "Resultado oficial" : aoVivo || aoVivoDaRifa ? "Sorteio ao vivo" : s ? "Sorteio oficial" : "Próximo sorteio"}
        </h2>
      </header>
      {/* O vídeo fica parado no alto; o que rola é o resto. Com o celular
          deitado, o 16:9 na largura toda passaria da altura da tela (e o
          botão de tela cheia sumiria): o vídeo fica com 60% da altura, no centro. */}
      <div className="shrink-0 bg-[#0B1F14]">
        <div className="mx-auto w-full [@media(orientation:landscape)_and_(max-height:500px)]:max-w-[calc(60dvh*16/9)]">
        {comResultado && s?.resultado ? (
          <div className="flex aspect-video w-full flex-col items-center justify-center gap-3 bg-[#0B1F14] p-4 text-branco">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-[#8cc2ff]">
              Resultado oficial · {s.loteriaNome}
            </p>
            <p className="tnum flex flex-wrap justify-center gap-1.5" aria-label={`Números: ${s.resultado.join(", ")}`}>
              {s.resultado.map((n, i) => (
                <span key={i} className="rounded-lg bg-branco/10 px-2 py-1 text-lg font-bold">
                  {n}
                </span>
              ))}
            </p>
          </div>
        ) : (
          <TelaDoProximoSorteio proximo={naTela} comentariosDoSorteio={s?.id} />
        )}
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain pb-8 pt-3">
        {isLoading ? <p className="px-4 text-sm text-muted">Carregando…</p> : null}
        {s ? (
          <>
            <div className="px-4">
              <p className="font-display text-lg font-bold leading-tight">{s.nome}</p>
              <p className="text-sm text-muted">
                {s.loteriaNome} · concurso <span className="tnum">{s.concurso}</span> · <span className="tnum">{hora}</span>
              </p>
            </div>
            <section aria-label="Rifas neste sorteio" className="mt-4 border-t border-line pt-3">
              <h3 className="mb-2 px-4 text-sm font-bold">
                Rifas neste sorteio <span className="tnum font-normal text-muted">({s.rifas.length})</span>
              </h3>
              {s.rifas.length ? (
                <FileiraDeAvatares rifas={s.rifas} aoAbrirStories={setStories} />
              ) : (
                <p className="px-4 text-sm text-muted">Nenhuma rifa integrada a este sorteio ainda.</p>
              )}
            </section>
            {/* Como no YouTube: embaixo do vídeo, a conversa aberta. Todo mundo
                lê; quem tem conta e apelido escreve (emoji só verificado). */}
            <div className="border-t border-line px-4">
              <Comentarios sorteioOficialId={s.id} />
            </div>
          </>
        ) : proximas.length ? (
          // Sem sorteio oficial: as rifas dos próximos sorteios como avatares,
          // no modelo dos stories — nenhuma em detalhe.
          <section aria-label="Rifas dos próximos sorteios" className="pt-1">
            <h3 className="mb-2 px-4 text-sm font-bold">
              Rifas dos próximos sorteios <span className="tnum font-normal text-muted">({proximas.length})</span>
            </h3>
            <FileiraDeAvatares rifas={proximas} aoAbrirStories={setStories} />
          </section>
        ) : !isLoading ? (
          <p className="px-4 text-sm text-muted">Nenhum sorteio marcado agora.</p>
        ) : null}
      </div>
      {stories ? <VisualizadorDeStories slug={stories} onFechar={() => setStories(null)} /> : null}
    </>
  );
}

/**
 * A fileira das rifas como avatares, no modelo da fileira de stories da
 * vitrine: a foto da organização com o anel. Dois alvos no mesmo círculo:
 * **o anel (a borda) abre o story** da organização, **o meio abre a rifa**.
 * Sem story no ar, não há anel e o círculo inteiro abre a rifa. Embaixo, só
 * o nome da organização — a rifa não aparece em detalhe aqui.
 */
function FileiraDeAvatares({
  rifas,
  aoAbrirStories,
}: {
  rifas: { slug: string; premio: string; organizacao: OrganizacaoDoAvatar; numeroContemplado?: string | null }[];
  aoAbrirStories: (slug: string) => void;
}) {
  useVistos();
  return (
    <ul className="flex snap-x scroll-px-4 gap-3 overflow-x-auto px-4 pb-2" data-sem-gesto>
      {rifas.map((r) => {
        const o = r.organizacao;
        const rifa = `/o/${o.slug}/r/${r.slug}`;
        const novo = o.ultimoStory ? temStoryNovo(o.ultimoStory, vistoAte(o.slug)) : false;
        return (
          <li key={r.slug} className="shrink-0 snap-start text-center" style={{ width: AVATAR + 2 * BORDA }}>
            <span className="relative mx-auto block" style={{ width: AVATAR + 2 * BORDA, height: AVATAR + 2 * BORDA }}>
              {o.ultimoStory ? (
                <button
                  type="button"
                  onClick={() => aoAbrirStories(o.slug)}
                  aria-label={`Ver stories de ${o.nome}${novo ? " (novo)" : ""}`}
                  className={`absolute inset-0 rounded-full ${novo ? "border-[3px] border-marca" : "border border-line-2"}`}
                />
              ) : null}
              <Link
                href={rifa}
                aria-label={`Abrir a rifa ${r.premio}, de ${o.nome}`}
                className="absolute block overflow-hidden rounded-full"
                style={{ inset: BORDA }}
              >
                <FotoDoPerfil nome={o.nome} foto={o.foto} tamanho={AVATAR} />
              </Link>
            </span>
            <span className="mt-1 block truncate text-xs text-ink-2">{o.nome}</span>
            {r.numeroContemplado != null ? (
              <span className="block text-[11px] text-green-deep">
                Nº <span className="tnum font-bold">{r.numeroContemplado}</span>
              </span>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}

/** A foto como no Instagram (`FOTO_COMO_NO_INSTAGRAM`); com o anel, o círculo tem 96 px. */
const AVATAR = FOTO_COMO_NO_INSTAGRAM;
/** A borda que abre o story: o anel e o espaço até a foto, alvo de 10 px. */
const BORDA = 10;

/**
 * A contagem do próximo sorteio na faixa de cima do Início (à direita do
 * estado), com a cara da tela do sorteio: fundo escuro e as casas de dias,
 * horas, minutos e segundos. É botão: abre a tela do sorteio, à esquerda do
 * Início. Só no celular — do tablet em diante a coluna ao vivo já mostra a
 * contagem.
 */
export function ContagemDoSorteio({ onAbrir }: { onAbrir: () => void }) {
  const { data } = useQuery<SorteioOficialDaTela>({
    queryKey: CHAVE_DO_SORTEIO,
    refetchInterval: ATUALIZA_MS,
    refetchIntervalInBackground: false,
  });
  const [agora, setAgora] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setAgora(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const oficial = data?.sorteio ?? null;
  const oficialMarcado = oficial && oficial.situacao !== "com_resultado" ? oficial : null;
  // Sem sorteio oficial marcado, conta até o próximo sorteio de rifa — o mesmo
  // da coluna ao vivo do tablet e do computador.
  const { data: aoVivo } = useQuery<AoVivo>({
    queryKey: CHAVE_AO_VIVO,
    enabled: Boolean(data) && !oficialMarcado,
    refetchInterval: ATUALIZA_MS,
    refetchIntervalInBackground: false,
  });
  // O sorteio é de várias organizações: a contagem nunca cita prêmio nem
  // rifa. Do sorteio oficial vai o nome dele (a loteria e o concurso); do
  // sorteio de rifa, só a hora.
  const proximo = oficialMarcado
    ? { nome: oficialMarcado.nome as string | null, drawAt: oficialMarcado.sorteioEm }
    : aoVivo?.proximo
      ? { nome: null, drawAt: aoVivo.proximo.drawAt }
      : null;
  const falta = proximo ? faltaParaOSorteio(proximo.drawAt, agora) : null;

  const casas: [number, string][] = falta
    ? [
        [falta.dias, "dias"],
        [falta.horas, "horas"],
        [falta.minutos, "min"],
        [falta.segundos, "seg"],
      ]
    : [];
  const rotulo = !proximo
    ? oficial
      ? `Resultado oficial: ${oficial.nome}. Abrir a tela do sorteio`
      : "Nenhum sorteio marcado. Abrir a tela do sorteio"
    : falta?.aoVivo
      ? `Sorteio ao vivo agora${proximo.nome ? `: ${proximo.nome}` : ""}. Abrir a tela do sorteio`
      : `Próximo sorteio em ${falta?.dias} dias, ${falta?.horas} horas e ${falta?.minutos} minutos${proximo.nome ? `: ${proximo.nome}` : ""}. Abrir a tela do sorteio`;

  // Um banner pequeno de ponta a ponta: o título em cima, as casas no meio
  // (como a tela do sorteio) e, embaixo, o nome do sorteio oficial ou o
  // convite para assistir — nunca o prêmio. Tudo centralizado.
  return (
    <button
      type="button"
      onClick={onAbrir}
      aria-label={rotulo}
      className="flex w-full min-w-0 flex-col items-center justify-center gap-1.5 rounded-xl border border-line-2 bg-[#0B1F14] px-4 py-3 text-center text-branco md:hidden"
    >
      <span aria-hidden className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-[#8cc2ff]">
        <Radio size={14} className="shrink-0" />
        {!proximo ? (oficial ? "Resultado do sorteio" : "Sorteios") : falta?.aoVivo ? "Ao vivo agora" : "Próximo sorteio"}
      </span>
      {proximo && !falta?.aoVivo ? (
        <span aria-hidden className="flex items-stretch justify-center gap-2">
          {casas.map(([n, u]) => (
            <span key={u} className="flex min-w-[3.5rem] flex-col items-center rounded-lg bg-branco/10 px-2 py-1.5">
              <span className="tnum text-2xl font-bold leading-none">{String(n).padStart(2, "0")}</span>
              <span className="mt-1 text-[11px] leading-none text-branco/70">{u}</span>
            </span>
          ))}
        </span>
      ) : null}
      <span aria-hidden className="max-w-full truncate text-xs text-branco/80">
        {proximo ? (proximo.nome ?? "Toque para assistir ao sorteio") : oficial ? oficial.nome : "Toque para ver os últimos sorteios"}
      </span>
    </button>
  );
}
