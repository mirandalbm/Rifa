import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, Radio } from "lucide-react";
import { Comentarios } from "@/components/Comentarios";
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
const NO_CELULAR = "(max-width: 767px)";
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
      organizacao: { slug: string; nome: string };
      numeroContemplado: number | null;
    }[];
  } | null;
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
      {/* O vídeo fica parado no alto; o que rola é o resto. */}
      <div className="shrink-0">
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
          <TelaDoProximoSorteio proximo={naTela} />
        )}
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
                // Linha horizontal: quem comprou acha a rifa dela no sorteio.
                <ul className="flex snap-x scroll-px-4 gap-3 overflow-x-auto px-4 pb-2" data-sem-gesto>
                  {s.rifas.map((r) => (
                    <li key={r.slug} className="w-36 shrink-0 snap-start">
                      <Link href={`/o/${r.organizacao.slug}/r/${r.slug}`} className="block rounded-lg hover:bg-mist">
                        <span className="block aspect-square overflow-hidden rounded-lg bg-mist-2">
                          {r.capa ? <img src={r.capa} alt="" loading="lazy" className="h-full w-full object-cover" /> : null}
                        </span>
                        <span className="mt-1 block truncate text-sm font-semibold">{r.premio}</span>
                        <span className="block truncate text-xs text-muted">{r.organizacao.nome}</span>
                        {r.numeroContemplado !== null ? (
                          <span className="block text-xs text-green-deep">
                            Contemplado: <span className="tnum font-bold">{r.numeroContemplado}</span>
                          </span>
                        ) : null}
                      </Link>
                    </li>
                  ))}
                </ul>
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
        ) : daRifa ? (
          <>
            <div className="px-4">
              <p className="font-display text-lg font-bold leading-tight">{daRifa.prizeTitle}</p>
              <p className="text-sm text-muted">
                {daRifa.organizacao.nome} · <span className="tnum">{new Date(daRifa.drawAt).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</span>
              </p>
              <Link
                href={`/o/${daRifa.organizacao.slug}/r/${daRifa.slug}`}
                className="mt-2 inline-block text-sm font-semibold text-marca underline"
              >
                Ver a rifa
              </Link>
            </div>
            {/* Os comentários da rifa abertos, como no YouTube. */}
            <div className="mt-3 border-t border-line px-4">
              <Comentarios slug={daRifa.slug} />
            </div>
          </>
        ) : !isLoading ? (
          <p className="px-4 text-sm text-muted">Nenhum sorteio marcado agora.</p>
        ) : null}
      </div>
    </>
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
  const proximo = oficialMarcado
    ? { prizeTitle: oficialMarcado.nome, drawAt: oficialMarcado.sorteioEm }
    : aoVivo?.proximo
      ? { prizeTitle: aoVivo.proximo.prizeTitle, drawAt: aoVivo.proximo.drawAt }
      : null;
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
    ? oficial
      ? `Resultado oficial: ${oficial.nome}. Abrir a tela do sorteio`
      : "Nenhum sorteio marcado. Abrir a tela do sorteio"
    : falta?.aoVivo
      ? `Sorteio ao vivo agora: ${proximo.prizeTitle}. Abrir a tela do sorteio`
      : `Próximo sorteio em ${falta?.dias} dias, ${falta?.horas} horas e ${falta?.minutos} minutos: ${proximo.prizeTitle}. Abrir a tela do sorteio`;

  return (
    <button
      type="button"
      onClick={onAbrir}
      aria-label={rotulo}
      className="ml-auto flex h-11 min-w-0 shrink-0 items-center gap-2 rounded-lg border border-line-2 bg-[#0B1F14] px-3 text-branco md:hidden"
    >
      <Radio size={16} aria-hidden className="shrink-0 text-[#8cc2ff]" />
      {!proximo ? (
        <span className="truncate text-sm font-semibold">{oficial ? "Resultado" : "Sorteios"}</span>
      ) : falta?.aoVivo ? (
        <span className="truncate text-sm font-bold uppercase tracking-wide">Ao vivo</span>
      ) : (
        <span aria-hidden className="flex items-center gap-1">
          {casas.map(([n, u]) => (
            <span key={u} className="rounded bg-branco/10 px-1.5 py-1 text-sm leading-none">
              <span className="tnum font-bold">{String(n).padStart(2, "0")}</span>
              <span className="text-[11px] text-branco/70">{u}</span>
            </span>
          ))}
        </span>
      )}
    </button>
  );
}
