import { useEffect, useRef, useState, type PointerEvent as PE, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { ExternalLink, Maximize, Minimize, PictureInPicture2, Radio, Settings, Trophy, Users, X } from "lucide-react";
import { acimaDoConsole } from "@/components/Console";
import {
  QUALIDADES_DO_VIDEO,
  aceitaQualidade,
  faltaParaOSorteio,
  srcComQualidade,
  srcDaTwitch,
  type QualidadeDoVideo,
  type VideoDaTransmissao,
} from "@shared/aoVivo";

/** O que `GET /api/public/vitrine/ao-vivo` devolve — já recortado no servidor. */
export interface AoVivo {
  proximo: {
    slug: string;
    organizacao: { slug: string; nome: string };
    prizeTitle: string;
    drawAt: string;
    video: VideoDaTransmissao | null;
  } | null;
  ganhadores: {
    chave: string;
    tipo: "sorteio" | "cota";
    nome: string;
    lugar: string | null;
    premio: string;
    cota: string | null;
    em: string;
    rifa: { slug: string; organizacao: string };
  }[];
  jogando: {
    chave: string;
    nome: string;
    lugar: string | null;
    quantidade: number;
    em: string;
    rifa: { slug: string; organizacao: string; premio: string };
  }[];
}

/** De quanto em quanto tempo a coluna se atualiza (o servidor guarda 5 s). */
export const ATUALIZA_MS = 15_000;

const haQuanto = (iso: string) => {
  const min = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60_000));
  if (min < 1) return "agora";
  if (min < 60) return `há ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `há ${h} h`;
  return `há ${Math.floor(h / 24)} d`;
};

/**
 * A coluna da direita da vitrine no tablet e no computador (o celular não a
 * tem): a tela do próximo sorteio no alto, os últimos ganhadores no meio e
 * quem está jogando agora embaixo, ocupando o resto. Fixa na rolagem. Só
 * dado real, com nome curto — nada simulado.
 */
export function ColunaAoVivo() {
  const { data } = useQuery<AoVivo>({
    queryKey: ["/api/public/vitrine/ao-vivo"],
    refetchInterval: ATUALIZA_MS,
    refetchIntervalInBackground: false,
  });
  const [flutuando, setFlutuando] = useState(false);

  return (
    <aside
      aria-label="Ao vivo"
      // Colada no feed, separada só pela linha de 1 px; ocupa a altura da
      // tela (no tablet, entre o topo e o console de baixo).
      className="sticky top-[57px] hidden h-[calc(100vh-57px-var(--acima-do-console))] min-h-0 flex-col gap-3 self-start border-l border-line p-3 md:flex lg:top-0 lg:h-screen"
      style={{ ["--acima-do-console" as string]: acimaDoConsole }}
    >
      <TelaDoSorteio proximo={data?.proximo ?? null} flutuando={flutuando} onFlutuar={setFlutuando} />
      <Ganhadores lista={data?.ganhadores} />
      {/* Com a tela flutuando, a fila de quem joga ganha o espaço dela. */}
      <JogandoAgora lista={data?.jogando} />
    </aside>
  );
}

/* ------------------------------ a tela ------------------------------ */

function TelaDoSorteio({
  proximo,
  flutuando,
  onFlutuar,
}: {
  proximo: AoVivo["proximo"];
  flutuando: boolean;
  onFlutuar: (v: boolean) => void;
}) {
  const [agora, setAgora] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setAgora(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  // A qualidade escolhida fica aqui em cima: flutuar não a perde.
  const [qualidade, setQualidade] = useState<QualidadeDoVideo>("auto");

  const tela = (
    <Tela
      proximo={proximo}
      agora={agora}
      qualidade={qualidade}
      onQualidade={setQualidade}
      onFlutuar={flutuando || !proximo ? undefined : () => onFlutuar(true)}
    />
  );
  if (flutuando) {
    return (
      <>
        <div className="flex items-center justify-between rounded-xl border border-line px-3 py-2 text-xs text-muted">
          <span className="flex items-center gap-1.5">
            <PictureInPicture2 size={14} aria-hidden /> A tela está flutuando
          </span>
          <button type="button" onClick={() => onFlutuar(false)} className="font-semibold text-marca hover:underline">
            Voltar para a coluna
          </button>
        </div>
        {createPortal(<TelaFlutuante onFechar={() => onFlutuar(false)}>{tela}</TelaFlutuante>, document.body)}
      </>
    );
  }
  return (
    <section aria-label="Próximo sorteio" className="shrink-0 overflow-hidden rounded-xl">
      {tela}
    </section>
  );
}

/**
 * A tela do próximo sorteio sem a coluna: contagem, transmissão e a barra
 * (qualidade e tela cheia). É a do Início no celular (`SorteioDoInicio`).
 */
export function TelaDoProximoSorteio({ proximo }: { proximo: AoVivo["proximo"] }) {
  const [agora, setAgora] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setAgora(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const [qualidade, setQualidade] = useState<QualidadeDoVideo>("auto");
  // O título vai embaixo do vídeo, como no YouTube: dentro da tela, só a contagem.
  return <Tela proximo={proximo} agora={agora} qualidade={qualidade} onQualidade={setQualidade} semTitulo />;
}

/**
 * Liga e desliga a tela cheia de um elemento, sabendo quando o navegador sai
 * sozinho (Esc). Onde o navegador não põe um elemento qualquer em tela cheia
 * (o Safari do iPhone só deixa o `<video>`), a tela ocupa a janela inteira
 * por cima de tudo (`falsa`) — sai pelo mesmo botão ou pelo Esc.
 */
function useTelaCheia(ref: RefObject<HTMLElement | null>) {
  const [cheia, setCheia] = useState(false);
  const [falsa, setFalsa] = useState(false);
  useEffect(() => {
    const mudou = () => setCheia(document.fullscreenElement === ref.current && ref.current !== null);
    document.addEventListener("fullscreenchange", mudou);
    return () => document.removeEventListener("fullscreenchange", mudou);
  }, [ref]);
  useEffect(() => {
    if (!falsa) return;
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setFalsa(false);
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [falsa]);
  const alternar = () => {
    if (falsa) return setFalsa(false);
    if (document.fullscreenElement) return void document.exitFullscreen?.().catch(() => {});
    if (document.fullscreenEnabled && ref.current?.requestFullscreen) {
      return void ref.current.requestFullscreen().catch(() => setFalsa(true));
    }
    setFalsa(true);
  };
  return { cheia: cheia || falsa, falsa, alternar, disponivel: true };
}

/**
 * A tela com a barra de baixo, como no YouTube: qualidade (só onde o
 * player aceita — `aceitaQualidade()`), flutuar e tela cheia. A barra fica
 * fora do vídeo, para não cobrir os botões do próprio player, e vai junto
 * para a tela cheia.
 */
function Tela({
  proximo,
  agora,
  qualidade,
  onQualidade,
  onFlutuar,
  semTitulo,
}: {
  proximo: AoVivo["proximo"];
  agora: number;
  qualidade: QualidadeDoVideo;
  onQualidade: (q: QualidadeDoVideo) => void;
  onFlutuar?: () => void;
  /** O título fica fora da tela (no Início do celular, embaixo do vídeo). */
  semTitulo?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const { cheia, falsa, alternar, disponivel } = useTelaCheia(ref);
  const aoVivo = proximo ? faltaParaOSorteio(proximo.drawAt, agora).aoVivo : false;
  const comQualidade = aoVivo && aceitaQualidade(proximo?.video);

  return (
    <div ref={ref} className={`flex w-full flex-col bg-[#0B1F14] ${falsa ? "fixed inset-0 z-[80] h-[100dvh]" : "h-full"}`}>
      <div className={`min-h-0 ${cheia ? "flex-1" : "aspect-video"}`}>
        <ConteudoDaTela proximo={proximo} agora={agora} qualidade={qualidade} semTitulo={semTitulo && !cheia} />
      </div>
      {proximo ? (
        <div className="flex h-9 shrink-0 items-center justify-end gap-1 bg-black/40 pl-1.5 pr-4 text-branco">
          {comQualidade ? (
            <label className="mr-auto flex items-center gap-1 text-[11px]">
              <Settings size={14} aria-hidden />
              <span className="sr-only">Qualidade do vídeo</span>
              <select
                value={qualidade}
                onChange={(e) => onQualidade(e.target.value as QualidadeDoVideo)}
                className="tnum h-7 rounded bg-black/40 px-1 text-[11px] text-branco hover:bg-black/60"
              >
                {QUALIDADES_DO_VIDEO.map((q) => (
                  <option key={q.valor} value={q.valor} className="bg-white text-ink">
                    {q.rotulo}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          {onFlutuar && !cheia ? (
            <button type="button" onClick={onFlutuar} aria-label="Deixar a tela flutuando" title="Flutuar" className="rounded p-1.5 hover:bg-white/20">
              <PictureInPicture2 size={16} aria-hidden />
            </button>
          ) : null}
          {disponivel ? (
            <button
              type="button"
              onClick={alternar}
              aria-label={cheia ? "Sair da tela cheia" : "Tela cheia"}
              title={cheia ? "Sair da tela cheia" : "Tela cheia"}
              aria-pressed={cheia}
              className="rounded p-1.5 hover:bg-white/20"
            >
              {cheia ? <Minimize size={16} aria-hidden /> : <Maximize size={16} aria-hidden />}
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

/** Contagem até o sorteio; na hora, a transmissão (ou o link dela). */
function ConteudoDaTela({
  proximo,
  agora,
  qualidade,
  semTitulo,
}: {
  proximo: AoVivo["proximo"];
  agora: number;
  qualidade: QualidadeDoVideo;
  semTitulo?: boolean;
}) {
  if (!proximo) {
    return (
      <div className="flex h-full items-center justify-center p-4 text-center text-sm text-branco/80">
        Nenhum sorteio marcado agora.
      </div>
    );
  }
  const falta = faltaParaOSorteio(proximo.drawAt, agora);
  const href = `/o/${proximo.organizacao.slug}/r/${proximo.slug}`;
  const hora = new Date(proximo.drawAt).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

  if (falta.aoVivo && proximo.video && proximo.video.tipo !== "link") {
    const src =
      proximo.video.tipo === "twitch" ? srcDaTwitch(proximo.video.canal, window.location.hostname) : srcComQualidade(proximo.video.src, qualidade);
    return (
      <iframe
        // Trocar a qualidade recarrega o player com o endereço novo.
        key={src}
        src={src}
        title={`Sorteio ao vivo: ${proximo.prizeTitle}`}
        className="h-full w-full"
        allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
        allowFullScreen
        referrerPolicy="strict-origin-when-cross-origin"
        // Página de outro serviço: sem acesso a nada do site.
        sandbox="allow-scripts allow-same-origin allow-presentation allow-popups"
      />
    );
  }

  const casas: [number, string][] = [
    [falta.dias, "dias"],
    [falta.horas, "horas"],
    [falta.minutos, "min"],
    [falta.segundos, "seg"],
  ];
  return (
    <div className="flex h-full flex-col justify-between p-3 text-branco">
      <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-[#8cc2ff]">
        <Radio size={13} aria-hidden /> {falta.aoVivo ? "Sorteio agora" : "Próximo sorteio"}
      </p>
      {falta.aoVivo ? (
        proximo.video?.tipo === "link" ? (
          <a
            href={proximo.video.href}
            target="_blank"
            rel="noopener noreferrer nofollow"
            className="mx-auto flex items-center gap-1.5 rounded-lg bg-branco px-3 py-2 text-sm font-bold text-[#0B1F14]"
          >
            Assistir a transmissão <ExternalLink size={14} aria-hidden />
          </a>
        ) : (
          <p className="text-center text-sm">A transmissão começa em instantes.</p>
        )
      ) : (
        <div className="flex justify-center gap-2" role="timer" aria-label={`Faltam ${falta.dias} dias, ${falta.horas} horas e ${falta.minutos} minutos`}>
          {casas.map(([n, rotulo]) => (
            <span key={rotulo} className="min-w-[3.25rem] rounded-lg bg-branco/10 px-1.5 py-1 text-center">
              <span className="tnum block text-xl font-bold leading-tight">{String(n).padStart(2, "0")}</span>
              <span className="block text-[10px] text-branco/70">{rotulo}</span>
            </span>
          ))}
        </div>
      )}
      {semTitulo ? (
        <span aria-hidden />
      ) : (
        <Link href={href} className="block truncate text-sm font-semibold hover:underline">
          {proximo.prizeTitle}
          <span className="block truncate text-[11px] font-normal text-branco/70">
            {proximo.organizacao.nome} · <span className="tnum">{hora}</span>
          </span>
        </Link>
      )}
    </div>
  );
}

const LARGURA_MIN = 280;

/**
 * A tela solta da coluna: arrasta pela barra de cima, muda de tamanho pelo
 * canto (livre, sempre 16:9) e nunca sai da janela. Qualidade e tela cheia
 * ficam na barra de baixo da própria tela. Fechar devolve a tela à coluna.
 */
function TelaFlutuante({ children, onFechar }: { children: ReactNode; onFechar: () => void }) {
  const [largura, setLargura] = useState(480);
  const [pos, setPos] = useState(() => ({ x: window.innerWidth - 480 - 24, y: window.innerHeight - 270 - 24 - 72 }));
  const arrasto = useRef<{ dx: number; dy: number } | null>(null);
  const redim = useRef<{ x0: number; l0: number } | null>(null);
  const altura = Math.round((largura * 9) / 16) + 72;

  // Nunca fora da janela (inclusive quando a janela muda de tamanho).
  const prender = (x: number, y: number, l = largura) => ({
    x: Math.min(Math.max(0, x), Math.max(0, window.innerWidth - l)),
    y: Math.min(Math.max(0, y), Math.max(0, window.innerHeight - (Math.round((l * 9) / 16) + 72))),
  });
  useEffect(() => {
    const ajustar = () => setPos((p) => prender(p.x, p.y));
    window.addEventListener("resize", ajustar);
    return () => window.removeEventListener("resize", ajustar);
  });
  useEffect(() => {
    // Em tela cheia, o Esc é do navegador: sai da tela cheia, não da flutuante.
    const esc = (e: KeyboardEvent) => e.key === "Escape" && !document.fullscreenElement && onFechar();
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [onFechar]);

  const mudarLargura = (l: number) => {
    const nova = Math.min(Math.max(LARGURA_MIN, l), window.innerWidth - 16);
    setLargura(nova);
    setPos((p) => prender(p.x, p.y, nova));
  };

  const comecarArrasto = (e: PE<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest("button")) return;
    arrasto.current = { dx: e.clientX - pos.x, dy: e.clientY - pos.y };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const arrastar = (e: PE<HTMLDivElement>) => {
    if (arrasto.current) setPos(prender(e.clientX - arrasto.current.dx, e.clientY - arrasto.current.dy));
  };
  const comecarRedim = (e: PE<HTMLDivElement>) => {
    redim.current = { x0: e.clientX, l0: largura };
    e.currentTarget.setPointerCapture(e.pointerId);
    e.stopPropagation();
  };
  const redimensionar = (e: PE<HTMLDivElement>) => {
    if (redim.current) mudarLargura(redim.current.l0 + (e.clientX - redim.current.x0));
  };

  return (
    <div
      role="dialog"
      aria-label="Tela do sorteio flutuando"
      className="fixed z-50 overflow-hidden rounded-xl bg-[#0B1F14] shadow-2xl"
      style={{ left: pos.x, top: pos.y, width: largura, height: altura }}
    >
      <div
        className="flex h-9 cursor-move touch-none select-none items-center gap-1 bg-black/40 px-2 text-branco"
        onPointerDown={comecarArrasto}
        onPointerMove={arrastar}
        onPointerUp={() => (arrasto.current = null)}
      >
        <span className="flex-1 truncate text-xs font-semibold">Sorteio · arraste para mover</span>
        <button type="button" onClick={onFechar} aria-label="Voltar a tela para a coluna" className="ml-1 rounded p-1 hover:bg-white/20">
          <X size={15} aria-hidden />
        </button>
      </div>
      <div className="h-[calc(100%-2.25rem)]">{children}</div>
      {/* Canto de redimensionar. */}
      <div
        aria-hidden
        className="absolute bottom-0 right-0 h-4 w-4 cursor-se-resize touch-none"
        style={{ background: "linear-gradient(135deg, transparent 50%, rgba(255,255,255,.55) 50%)" }}
        onPointerDown={comecarRedim}
        onPointerMove={redimensionar}
        onPointerUp={() => (redim.current = null)}
      />
    </div>
  );
}

/* ------------------------------ as filas ------------------------------ */

export function Ganhadores({ lista }: { lista: AoVivo["ganhadores"] | undefined }) {
  return (
    <section aria-label="Últimos ganhadores" className="shrink-0 rounded-xl border border-line p-3">
      <h2 className="flex items-center gap-1.5 font-display text-sm font-bold">
        <Trophy size={15} aria-hidden className="text-yellow-deep" /> Últimos ganhadores
      </h2>
      {!lista?.length ? (
        <p className="mt-2 text-xs text-muted">Os ganhadores aparecem aqui assim que saírem.</p>
      ) : (
        <ol className="mt-2 space-y-2">
          {lista.map((g) => (
            <li key={g.chave} className="entra-no-topo">
              <Link href={`/o/${g.rifa.organizacao}/r/${g.rifa.slug}`} className="block rounded-lg px-1 py-0.5 hover:bg-mist">
                <span className="flex items-center gap-2 text-[13px]">
                  <span className="min-w-0 flex-1 truncate font-semibold">{g.nome}</span>
                  <span className="shrink-0 rounded bg-yellow-soft px-1.5 text-[10px] font-semibold text-yellow-deep">
                    {g.tipo === "sorteio" ? "Sorteio" : "Cota premiada"}
                  </span>
                </span>
                <span className="block truncate text-xs text-ink-2">
                  {g.premio}
                  {g.cota ? (
                    <>
                      {" "}
                      · cota <span className="tnum">{g.cota}</span>
                    </>
                  ) : null}
                </span>
                <span className="block truncate text-[11px] text-muted">
                  {g.lugar ? `${g.lugar} · ` : ""}
                  {haQuanto(g.em)}
                </span>
              </Link>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

function JogandoAgora({ lista }: { lista: AoVivo["jogando"] | undefined }) {
  return (
    <section aria-label="Jogando agora" className="flex min-h-[8rem] flex-1 flex-col rounded-xl border border-line p-3">
      <h2 className="flex items-center gap-1.5 font-display text-sm font-bold">
        <Users size={15} aria-hidden className="text-green-deep" /> Jogando agora
      </h2>
      {!lista?.length ? (
        <p className="mt-2 text-xs text-muted">As compras aparecem aqui assim que forem pagas.</p>
      ) : (
        <ol className="mt-2 min-h-0 flex-1 space-y-1.5 overflow-y-auto">
          {lista.map((j) => (
            <li key={j.chave} className="entra-no-topo">
              <Link href={`/o/${j.rifa.organizacao}/r/${j.rifa.slug}`} className="flex items-center gap-2 rounded-lg px-1 py-0.5 hover:bg-mist">
                <span aria-hidden className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-green-soft text-[11px] font-bold text-green-deep">
                  {j.nome.charAt(0).toUpperCase()}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-semibold">{j.nome}</span>
                  <span className="block truncate text-[11px] text-muted">
                    {j.lugar ? `${j.lugar} · ` : ""}
                    {j.rifa.premio}
                  </span>
                </span>
                <span className="shrink-0 text-right">
                  <span className="tnum block text-[12px] font-bold text-green-deep">+{j.quantidade}</span>
                  <span className="block text-[10px] text-muted">{haQuanto(j.em)}</span>
                </span>
              </Link>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
