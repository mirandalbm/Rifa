import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useQuery } from "@tanstack/react-query";
import { Check, Image as IconeImagem, RefreshCw, Send, Ticket, Trash2, Type, Volume2, VolumeX, X } from "lucide-react";
import { IconeReels } from "@/components/Icones";
import { EscolherCapa } from "@/components/EscolherCapa";
import { apiRequest } from "@/lib/queryClient";
import { enviarReels } from "@/lib/enviarReels";
import { LEGENDA_MAX, duracao, problemaNaLegenda } from "@shared/publicacao";
import { problemaNoVideoParaReels } from "@shared/reels";

/**
 * Criar reels no celular e no tablet, como no Instagram: o vídeo ocupa a tela
 * e as ferramentas ficam por cima dele, em ícones, no mesmo lugar em que as
 * ações aparecem no reels publicado (a coluna da direita). Embaixo, à
 * esquerda, a prévia de como a rifa e a legenda vão aparecer. No computador
 * o cartão do painel segue como era.
 *
 * Nada aqui decide: duração, medidas e legenda o servidor confere de novo ao
 * gravar (`ingest`). O aviso antes de enviar é só cortesia.
 */

interface RifaDoPainel {
  campaign: { id: string; title: string; status: string; demonstracao?: boolean };
  capa: string | null;
}

const SITUACAO: Record<string, string> = { draft: "Rascunho", published: "No ar", closed: "Encerrada", drawn: "Sorteada" };

/** O diálogo de tela cheia: trava a rolagem de trás, prende o Tab e devolve o foco a quem abriu. */
function useTelaCheia(aoEsc: () => void) {
  const caixa = useRef<HTMLDivElement>(null);
  const esc = useRef(aoEsc);
  esc.current = aoEsc;
  useEffect(() => {
    const antes = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const quemAbriu = document.activeElement as HTMLElement | null;
    caixa.current?.focus();
    const tecla = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        esc.current();
        return;
      }
      if (e.key !== "Tab" || !caixa.current) return;
      const focaveis = Array.from(
        caixa.current.querySelectorAll<HTMLElement>('button:not([disabled]), textarea, input:not([type="file"]), label[tabindex], [href]'),
      ).filter((el) => el.offsetParent !== null);
      if (focaveis.length === 0) return;
      const primeiro = focaveis[0];
      const ultimo = focaveis[focaveis.length - 1];
      if (e.shiftKey && document.activeElement === primeiro) {
        e.preventDefault();
        ultimo.focus();
      } else if (!e.shiftKey && document.activeElement === ultimo) {
        e.preventDefault();
        primeiro.focus();
      }
    };
    window.addEventListener("keydown", tecla);
    return () => {
      window.removeEventListener("keydown", tecla);
      document.body.style.overflow = antes;
      quemAbriu?.focus?.();
    };
  }, []);
  return caixa;
}

/** Um ícone da coluna de ferramentas: círculo escuro sobre o vídeo e o nome embaixo, em texto. */
function Ferramenta({
  rotulo,
  icone,
  onClick,
  pressionado,
  arquivo,
}: {
  rotulo: string;
  icone: ReactNode;
  onClick?: () => void;
  pressionado?: boolean;
  /** Em vez de botão, o seletor de arquivo (trocar o vídeo). */
  arquivo?: (f: File) => void;
}) {
  const circulo = <span className="flex h-11 w-11 items-center justify-center rounded-full bg-black/50">{icone}</span>;
  const nome = <span className="text-[11px] font-semibold leading-none [text-shadow:0_1px_2px_rgba(0,0,0,0.8)]">{rotulo}</span>;
  if (arquivo) {
    return (
      <label className="flex cursor-pointer flex-col items-center gap-1 focus-within:outline focus-within:outline-2 focus-within:outline-branco">
        {circulo}
        {nome}
        <input
          type="file"
          accept="video/mp4,video/quicktime"
          className="sr-only"
          aria-label={rotulo}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) arquivo(f);
            e.target.value = "";
          }}
        />
      </label>
    );
  }
  return (
    <button type="button" onClick={onClick} aria-pressed={pressionado} className="flex flex-col items-center gap-1">
      {circulo}
      {nome}
    </button>
  );
}

/** A folha que sobe de baixo, por cima do vídeo (legenda, escolher a rifa). */
function Folha({ titulo, onFechar, children }: { titulo: string; onFechar: () => void; children: ReactNode }) {
  return (
    <div className="absolute inset-0 z-30 flex flex-col justify-end bg-black/40" onClick={onFechar}>
      <section
        aria-label={titulo}
        className="max-h-[75%] overflow-y-auto rounded-t-2xl bg-[#121212] p-4 text-branco"
        style={{ paddingBottom: "calc(1rem + env(safe-area-inset-bottom))" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-base font-bold">{titulo}</h3>
          <button type="button" onClick={onFechar} className="rounded-full bg-branco px-4 py-1.5 text-sm font-semibold text-black">
            Pronto
          </button>
        </div>
        {children}
      </section>
    </div>
  );
}

function CampoDeLegenda({ valor, mudar }: { valor: string; mudar: (v: string) => void }) {
  const problema = valor.trim() ? problemaNaLegenda(valor) : null;
  return (
    <div>
      <label className="block">
        <span className="sr-only">Legenda do vídeo</span>
        <textarea
          autoFocus
          rows={4}
          maxLength={LEGENDA_MAX}
          value={valor}
          onChange={(e) => mudar(e.target.value)}
          placeholder="Escreva uma legenda… (sem link e sem telefone)"
          className="w-full rounded-lg border border-branco/25 bg-branco/10 p-3 text-base text-branco placeholder:text-branco/60 focus:border-branco focus:outline-none"
        />
      </label>
      <div className="mt-1 flex justify-between gap-2 text-xs">
        <span role={problema ? "alert" : undefined} className={problema ? "text-[#ff8a80]" : "text-branco/70"}>
          {problema ?? "Quem assiste lê a legenda embaixo do vídeo."}
        </span>
        <span className="tnum shrink-0 text-branco/70">
          {valor.length}/{LEGENDA_MAX}
        </span>
      </div>
    </div>
  );
}

/** O botão de som da prévia (o vídeo começa mudo, como no Reels). */
function iconeDoSom(mudo: boolean) {
  return mudo ? <VolumeX size={22} aria-hidden /> : <Volume2 size={22} aria-hidden />;
}

export function CriarReels({
  campanhaInicial,
  onFechar,
  onPublicado,
}: {
  campanhaInicial?: string;
  onFechar: () => void;
  onPublicado?: (campaignId: string) => void;
}) {
  const { data: rifas } = useQuery<RifaDoPainel[]>({ queryKey: ["/api/admin/campaigns"] });
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [endereco, setEndereco] = useState<string | null>(null);
  const [medida, setMedida] = useState<{ duracao: number; largura: number; altura: number } | null>(null);
  const [semPrevia, setSemPrevia] = useState(false);
  const [legenda, setLegenda] = useState("");
  const [rifaId, setRifaId] = useState<string | undefined>(campanhaInicial);
  const [mudo, setMudo] = useState(true);
  const [folha, setFolha] = useState<null | "legenda" | "rifa">(null);
  const [progresso, setProgresso] = useState<number | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [pronto, setPronto] = useState(false);

  // Sem rifa escolhida e com uma só no painel, ela já vem escolhida.
  useEffect(() => {
    if (!rifaId && rifas && rifas.length === 1) setRifaId(rifas[0].campaign.id);
  }, [rifas, rifaId]);

  useEffect(() => {
    if (!arquivo) return;
    const url = URL.createObjectURL(arquivo);
    setEndereco(url);
    return () => URL.revokeObjectURL(url);
  }, [arquivo]);

  const enviando = progresso !== null;
  const fechar = () => {
    if (enviando) return;
    if (folha) return setFolha(null);
    if (arquivo && !pronto && !window.confirm("Descartar este vídeo?")) return;
    onFechar();
  };
  const caixa = useTelaCheia(fechar);

  const rifa = rifas?.find((r) => r.campaign.id === rifaId);
  const problemaDoVideo = medida ? problemaNoVideoParaReels(medida) : null;
  const problema = problemaDoVideo ?? (legenda.trim() ? problemaNaLegenda(legenda) : null);

  function escolher(f: File) {
    setErro(null);
    setMedida(null);
    setSemPrevia(false);
    setArquivo(f);
  }

  async function publicar() {
    if (!arquivo || !rifaId) return;
    setErro(null);
    setProgresso(0);
    try {
      await enviarReels(rifaId, arquivo, legenda, setProgresso);
      setPronto(true);
      onPublicado?.(rifaId);
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setProgresso(null);
    }
  }

  function outro() {
    setArquivo(null);
    setEndereco(null);
    setMedida(null);
    setLegenda("");
    setPronto(false);
  }

  return createPortal(
    <div
      ref={caixa}
      tabIndex={-1}
      role="dialog"
      aria-modal="true"
      aria-label="Novo reels"
      data-sem-gesto
      className="fixed inset-0 z-[70] flex flex-col bg-black text-branco outline-none"
    >
      <header className="absolute inset-x-0 top-0 z-20 flex items-center gap-2 bg-gradient-to-b from-black/70 to-transparent px-3 pb-6 pt-3">
        <button type="button" onClick={fechar} aria-label="Fechar" className="flex h-10 w-10 items-center justify-center rounded-full hover:bg-branco/15">
          <X size={26} aria-hidden />
        </button>
        <h2 className="flex-1 text-center text-base font-bold">Novo reels</h2>
        <span className="w-10" aria-hidden />
      </header>

      {!arquivo ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-5 px-6 text-center">
          <span className="flex h-24 w-24 items-center justify-center rounded-full border-2 border-branco/40">
            <IconeReels tamanho={44} />
          </span>
          <div className="space-y-1">
            <p className="text-lg font-bold">Escolha um vídeo</p>
            <p className="text-sm text-branco/75">Em pé (9 por 16), até 3 minutos, MP4 ou MOV.</p>
          </div>
          <label className="cursor-pointer rounded-full bg-green px-6 py-3 text-base font-semibold text-on-green focus-within:outline focus-within:outline-2 focus-within:outline-branco">
            Escolher vídeo
            <input
              type="file"
              accept="video/mp4,video/quicktime"
              className="sr-only"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) escolher(f);
              }}
            />
          </label>
        </div>
      ) : (
        <div className="relative mx-auto h-full w-full max-w-[560px] flex-1">
          {endereco && !semPrevia ? (
            <video
              key={endereco}
              src={endereco}
              autoPlay
              loop
              playsInline
              muted={mudo}
              onLoadedMetadata={(e) => {
                const v = e.currentTarget;
                setMedida({ duracao: v.duration, largura: v.videoWidth, altura: v.videoHeight });
              }}
              onError={() => setSemPrevia(true)}
              onClick={(e) => (e.currentTarget.paused ? void e.currentTarget.play() : e.currentTarget.pause())}
              aria-label="Prévia do vídeo"
              className="h-full w-full object-contain"
            />
          ) : (
            <div className="flex h-full items-center justify-center px-8 text-center text-sm text-branco/80">
              Este aparelho não mostra a prévia deste arquivo. Ao publicar, o servidor confere a duração e as medidas.
            </div>
          )}

          {/* As ferramentas, em ícones, na coluna da direita — onde ficam as ações do reels publicado. */}
          <div className="absolute right-2 top-20 z-10 flex flex-col items-center gap-4">
            <Ferramenta rotulo="Legenda" icone={<Type size={22} aria-hidden />} onClick={() => setFolha("legenda")} />
            <Ferramenta rotulo="Rifa" icone={<Ticket size={22} aria-hidden />} onClick={() => setFolha("rifa")} />
            <Ferramenta rotulo={mudo ? "Sem som" : "Com som"} icone={iconeDoSom(mudo)} onClick={() => setMudo(!mudo)} pressionado={!mudo} />
            <Ferramenta rotulo="Trocar" icone={<RefreshCw size={22} aria-hidden />} arquivo={escolher} />
          </div>

          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black/80 to-transparent" />

          {/* A prévia de como fica publicado: a rifa e a legenda, embaixo à esquerda. */}
          <div className="absolute inset-x-0 bottom-20 z-10 space-y-2 pl-3 pr-20">
            <button
              type="button"
              onClick={() => setFolha("rifa")}
              className="flex max-w-full items-center gap-2 rounded-full bg-black/50 py-1 pl-1 pr-3 text-left text-sm font-semibold"
            >
              {rifa?.capa ? (
                <img src={rifa.capa} alt="" className="h-8 w-8 shrink-0 rounded-full object-cover" />
              ) : (
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-branco/20">
                  <Ticket size={16} aria-hidden />
                </span>
              )}
              <span className="truncate">{rifa ? rifa.campaign.title : "Escolher a rifa"}</span>
            </button>
            <button type="button" onClick={() => setFolha("legenda")} className="block w-full text-left text-sm leading-snug">
              {legenda.trim() ? (
                <span className="line-clamp-2 [text-shadow:0_1px_2px_rgba(0,0,0,0.8)]">{legenda}</span>
              ) : (
                <span className="text-branco/70">Toque para escrever a legenda</span>
              )}
            </button>
            {medida && Number.isFinite(medida.duracao) ? (
              <p className="tnum text-xs text-branco/70">{duracao(medida.duracao)}</p>
            ) : null}
          </div>

          <div className="absolute inset-x-0 bottom-0 z-10 space-y-2 px-3 pb-3" style={{ paddingBottom: "calc(0.75rem + env(safe-area-inset-bottom))" }}>
            {problema || erro ? (
              <p role="alert" className="rounded-lg bg-red px-3 py-2 text-sm text-branco">
                {problema ?? erro}
              </p>
            ) : null}
            <button
              type="button"
              onClick={() => void publicar()}
              disabled={!rifaId || Boolean(problema) || enviando}
              className="flex w-full items-center justify-center gap-2 rounded-full bg-green py-3 text-base font-semibold text-on-green disabled:opacity-50"
            >
              <Send size={18} aria-hidden />
              {rifaId ? "Publicar no Reels" : "Escolha a rifa para publicar"}
            </button>
          </div>

          {enviando ? <Enviando fracao={progresso ?? 0} /> : null}
        </div>
      )}

      {folha === "legenda" ? (
        <Folha titulo="Legenda" onFechar={() => setFolha(null)}>
          <CampoDeLegenda valor={legenda} mudar={setLegenda} />
        </Folha>
      ) : null}
      {folha === "rifa" ? (
        <Folha titulo="De que rifa é o vídeo?" onFechar={() => setFolha(null)}>
          {!rifas ? <p className="text-sm text-branco/75">Carregando as rifas…</p> : null}
          {rifas && rifas.length === 0 ? <p className="text-sm text-branco/75">Cadastre uma rifa antes de publicar no Reels.</p> : null}
          <ul className="space-y-1">
            {(rifas ?? []).map((r) => {
              const escolhida = r.campaign.id === rifaId;
              return (
                <li key={r.campaign.id}>
                  <button
                    type="button"
                    aria-pressed={escolhida}
                    onClick={() => {
                      setRifaId(r.campaign.id);
                      setFolha(null);
                    }}
                    className={`flex w-full items-center gap-3 rounded-lg p-2 text-left ${escolhida ? "bg-branco/15" : "hover:bg-branco/10"}`}
                  >
                    {r.capa ? (
                      <img src={r.capa} alt="" className="h-12 w-12 shrink-0 rounded-lg object-cover" />
                    ) : (
                      <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-branco/10">
                        <Ticket size={20} aria-hidden />
                      </span>
                    )}
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold">{r.campaign.title}</span>
                      <span className="block text-xs text-branco/70">
                        {r.campaign.demonstracao ? "Demonstração" : (SITUACAO[r.campaign.status] ?? r.campaign.status)}
                      </span>
                    </span>
                    {escolhida ? <Check size={20} aria-label="Escolhida" /> : null}
                  </button>
                </li>
              );
            })}
          </ul>
        </Folha>
      ) : null}

      {pronto ? (
        <div className="absolute inset-0 z-40 flex flex-col items-center justify-center gap-4 bg-black px-6 text-center" role="status">
          <span className="flex h-20 w-20 items-center justify-center rounded-full bg-green text-on-green">
            <Check size={40} aria-hidden />
          </span>
          <p className="text-lg font-bold">Vídeo publicado no Reels</p>
          <p className="max-w-xs text-sm text-branco/75">
            {rifa?.campaign.status === "published"
              ? "Ele entra na fila do Reels em instantes, com a capa tirada do próprio vídeo."
              : "Ele aparece no Reels quando a rifa estiver no ar."}
          </p>
          <div className="flex gap-3">
            <button type="button" onClick={outro} className="rounded-full border border-branco/60 px-5 py-2.5 text-sm font-semibold">
              Publicar outro
            </button>
            <button type="button" onClick={onFechar} className="rounded-full bg-branco px-5 py-2.5 text-sm font-semibold text-black">
              Concluir
            </button>
          </div>
        </div>
      ) : null}
    </div>,
    document.body,
  );
}

/** O círculo do envio, com o percentual no meio (em texto também, para o leitor de tela). */
function Enviando({ fracao }: { fracao: number }) {
  const pct = Math.round(fracao * 100);
  const r = 34;
  const volta = 2 * Math.PI * r;
  return (
    <div className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-3 bg-black/70" role="status" aria-live="polite">
      <svg width={84} height={84} viewBox="0 0 84 84" aria-hidden>
        <circle cx={42} cy={42} r={r} fill="none" stroke="rgba(255,255,255,0.25)" strokeWidth={6} />
        <circle
          cx={42}
          cy={42}
          r={r}
          fill="none"
          stroke="currentColor"
          strokeWidth={6}
          strokeLinecap="round"
          strokeDasharray={volta}
          strokeDashoffset={volta * (1 - fracao)}
          transform="rotate(-90 42 42)"
          className="text-green"
        />
      </svg>
      <p className="text-sm font-semibold">
        Enviando… <span className="tnum">{pct}%</span>
      </p>
    </div>
  );
}

export interface ReelsGuardado {
  id: string;
  url: string;
  posterUrl: string | null;
  durationS: number | null;
  width: number | null;
  height: number | null;
  legenda: string | null;
}

/**
 * Um vídeo já publicado, em tela cheia, com as mesmas ferramentas em ícones:
 * mudar a legenda, som e apagar. É a gestão do celular e do tablet; no
 * computador o cartão do painel abre o editor de sempre.
 */
export function VerReels({ reels, onFechar, aoMudar }: { reels: ReelsGuardado; onFechar: () => void; aoMudar: () => void }) {
  const [mudo, setMudo] = useState(true);
  const [folha, setFolha] = useState(false);
  const [capa, setCapa] = useState(false);
  const [texto, setTexto] = useState(reels.legenda ?? "");
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const mudou = texto !== (reels.legenda ?? "");
  const problema = texto.trim() ? problemaNaLegenda(texto) : null;
  const caixa = useTelaCheia(() => (folha ? setFolha(false) : onFechar()));

  async function agir(fazer: () => Promise<unknown>, depois?: () => void) {
    setErro(null);
    setOcupado(true);
    try {
      await fazer();
      aoMudar();
      depois?.();
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setOcupado(false);
    }
  }

  return createPortal(
    <div
      ref={caixa}
      tabIndex={-1}
      role="dialog"
      aria-modal="true"
      aria-label="Vídeo do Reels"
      data-sem-gesto
      className="fixed inset-0 z-[70] bg-black text-branco outline-none"
    >
      <div className="relative mx-auto h-full w-full max-w-[560px]">
        <video
          src={reels.url}
          poster={reels.posterUrl ?? undefined}
          autoPlay
          loop
          playsInline
          muted={mudo}
          onClick={(e) => (e.currentTarget.paused ? void e.currentTarget.play() : e.currentTarget.pause())}
          aria-label="Vídeo do Reels"
          className="h-full w-full object-contain"
        />
        <header className="absolute inset-x-0 top-0 z-20 flex items-center gap-2 bg-gradient-to-b from-black/70 to-transparent px-3 pb-6 pt-3">
          <button type="button" onClick={onFechar} aria-label="Fechar" className="flex h-10 w-10 items-center justify-center rounded-full hover:bg-branco/15">
            <X size={26} aria-hidden />
          </button>
          <h2 className="flex-1 text-center text-base font-bold">Seu reels</h2>
          <span className="w-10" aria-hidden />
        </header>
        <div className="absolute right-2 top-20 z-10 flex flex-col items-center gap-4">
          <Ferramenta rotulo="Legenda" icone={<Type size={22} aria-hidden />} onClick={() => setFolha(true)} />
          <Ferramenta rotulo={mudo ? "Sem som" : "Com som"} icone={iconeDoSom(mudo)} onClick={() => setMudo(!mudo)} pressionado={!mudo} />
          {reels.durationS ? <Ferramenta rotulo="Capa" icone={<IconeImagem size={22} aria-hidden />} onClick={() => setCapa(true)} /> : null}
          <Ferramenta
            rotulo="Apagar"
            icone={<Trash2 size={22} aria-hidden />}
            onClick={() => {
              if (!ocupado && window.confirm("Apagar este vídeo do Reels?"))
                void agir(() => apiRequest("DELETE", `/api/admin/media/${reels.id}`), onFechar);
            }}
          />
        </div>
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black/80 to-transparent" />
        <div className="absolute inset-x-0 bottom-0 z-10 space-y-2 pb-4 pl-3 pr-20" style={{ paddingBottom: "calc(1rem + env(safe-area-inset-bottom))" }}>
          {erro ? (
            <p role="alert" className="rounded-lg bg-red px-3 py-2 text-sm text-branco">
              {erro}
            </p>
          ) : null}
          <button type="button" onClick={() => setFolha(true)} className="block w-full text-left text-sm leading-snug">
            {reels.legenda ? (
              <span className="line-clamp-3 [text-shadow:0_1px_2px_rgba(0,0,0,0.8)]">{reels.legenda}</span>
            ) : (
              <span className="text-branco/70">Sem legenda — toque para escrever</span>
            )}
          </button>
          {reels.durationS ? <p className="tnum text-xs text-branco/70">{duracao(reels.durationS)}</p> : null}
        </div>
        {folha ? (
          <div className="absolute inset-0 z-30 flex flex-col justify-end bg-black/40" onClick={() => setFolha(false)}>
            <section
              aria-label="Legenda"
              className="rounded-t-2xl bg-[#121212] p-4"
              style={{ paddingBottom: "calc(1rem + env(safe-area-inset-bottom))" }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="mb-3 flex items-center justify-between gap-2">
                <h3 className="text-base font-bold">Legenda</h3>
                <button
                  type="button"
                  disabled={!mudou || ocupado || Boolean(problema)}
                  onClick={() => void agir(() => apiRequest("PUT", `/api/admin/media/${reels.id}/legenda`, { legenda: texto }), () => setFolha(false))}
                  className="rounded-full bg-green px-4 py-1.5 text-sm font-semibold text-on-green disabled:opacity-50"
                >
                  Salvar
                </button>
              </div>
              <CampoDeLegenda valor={texto} mudar={setTexto} />
            </section>
          </div>
        ) : null}
      </div>
      {capa && reels.durationS ? (
        <EscolherCapa
          mediaId={reels.id}
          url={reels.url}
          poster={reels.posterUrl}
          durationS={reels.durationS}
          camada="z-[80]"
          onFechar={() => setCapa(false)}
          aoEscolher={aoMudar}
        />
      ) : null}
    </div>,
    document.body,
  );
}
