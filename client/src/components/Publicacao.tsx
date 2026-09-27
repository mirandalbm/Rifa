import { useEffect, useState, type ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button, Card } from "@/components/bits";
import { FOLHA } from "@/components/SeloVerificado";
import { apiRequest } from "@/lib/queryClient";
import {
  LEGENDA_MAX,
  contadorCurto,
  duracao,
  formatoDoVideo,
  problemaNaLegenda,
  type Acao,
  type FormatoDoVideo,
} from "@shared/publicacao";

/** Uma peça do carrossel, como o servidor manda (`pecaPublica`). */
export interface Peca {
  role: "banner" | "photo" | "video";
  url: string;
  srcSet?: string | null;
  lqip?: string | null;
  alt?: string | null;
  durationS?: number | null;
  formato?: FormatoDoVideo | null;
}

export interface Interacoes {
  curtidas: number;
  comentarios: number;
  republicacoes: number;
  compartilhamentos: number;
  curti: boolean;
  republiquei: boolean;
  salvei: boolean;
}

/**
 * O carrossel da publicação, como no Instagram: até 10 peças, arrastando
 * para o lado, com "1/8" no canto e os pontinhos embaixo. Vídeo até 3 min
 * é reels (toca mudo e em loop no próprio carrossel, com controles); até
 * 15 min, vídeo do feed (só toca no toque).
 */
export function Carrossel({
  pecas,
  titulo,
  proporcao = "aspect-[4/5]",
  href,
  aoAbrir,
  children,
}: {
  pecas: Peca[];
  titulo: string;
  proporcao?: string;
  /** Toque na imagem leva à rifa (no feed e no perfil). */
  href?: string;
  aoAbrir?: () => void;
  /** O que vai por cima da imagem (o perfil da promotora, o selo de vendidas). */
  children?: ReactNode;
}) {
  const [atual, setAtual] = useState(0);
  return (
    <div>
      <div className={`relative overflow-hidden bg-mist-2 ${proporcao}`}>
        <div
          className="flex h-full snap-x snap-mandatory overflow-x-auto"
          style={{ scrollbarWidth: "none" }}
          onScroll={(e) => {
            const el = e.currentTarget;
            setAtual(Math.round(el.scrollLeft / el.clientWidth));
          }}
          aria-roledescription="carrossel"
          aria-label={`${titulo}: ${pecas.length} ${pecas.length === 1 ? "peça" : "peças"}`}
        >
          {pecas.map((p, i) => (
            <div key={p.url} className="relative h-full w-full shrink-0 snap-center" aria-label={`${i + 1} de ${pecas.length}`}>
              {p.role === "video" ? (
                <VideoDaPublicacao peca={p} />
              ) : href ? (
                <Link href={href} onClick={aoAbrir} className="block h-full w-full" aria-label={titulo}>
                  <Imagem peca={p} titulo={titulo} primeira={i === 0} />
                </Link>
              ) : (
                <Imagem peca={p} titulo={titulo} primeira={i === 0} />
              )}
            </div>
          ))}
          {pecas.length === 0 ? (
            href ? (
              <Link href={href} onClick={aoAbrir} className="block h-full w-full" aria-label={titulo}>
                <SemImagem titulo={titulo} />
              </Link>
            ) : (
              <SemImagem titulo={titulo} />
            )
          ) : null}
        </div>
        {children}
        {pecas.length > 1 ? (
          <span className="tnum pointer-events-none absolute right-2 top-12 rounded-full bg-black/60 px-2 py-[1px] text-[11px] text-branco">
            {atual + 1}/{pecas.length}
          </span>
        ) : null}
      </div>
      {pecas.length > 1 ? (
        <div className="flex justify-center gap-1 pt-2" aria-hidden>
          {pecas.map((p, i) => (
            <span key={p.url} className={`h-1.5 w-1.5 rounded-full ${i === atual ? "bg-marca" : "bg-line-2"}`} />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function SemImagem({ titulo }: { titulo: string }) {
  return (
    <span
      className="flex h-full w-full items-end p-4 font-display text-2xl font-extrabold leading-tight text-branco"
      style={{ background: "linear-gradient(145deg,#0B1F14,#0d3a22 60%,#00873E)" }}
    >
      {titulo}
    </span>
  );
}

function Imagem({ peca, titulo, primeira }: { peca: Peca; titulo: string; primeira: boolean }) {
  return (
    <img
      src={peca.url}
      srcSet={peca.srcSet ?? undefined}
      sizes="(min-width: 768px) 480px, 100vw"
      alt={peca.alt || (primeira ? titulo : "")}
      loading={primeira ? "eager" : "lazy"}
      className="h-full w-full object-cover"
      style={peca.lqip ? { backgroundImage: `url(${peca.lqip})`, backgroundSize: "cover" } : undefined}
    />
  );
}

function VideoDaPublicacao({ peca }: { peca: Peca }) {
  const formato = peca.formato ?? (peca.durationS ? formatoDoVideo(peca.durationS) : null);
  const reels = formato === "reels";
  return (
    <>
      <video
        src={peca.url}
        controls
        playsInline
        muted={reels}
        loop={reels}
        preload="metadata"
        className="h-full w-full bg-ink object-cover"
      />
      <span className="pointer-events-none absolute bottom-12 left-2 rounded bg-black/60 px-1.5 py-[1px] text-[10px] text-branco">
        {reels ? "Reels" : "Vídeo"}
        {peca.durationS ? <span className="tnum"> · {duracao(peca.durationS)}</span> : null}
      </span>
    </>
  );
}

/**
 * Os ícones da barra, no desenho do Instagram: traço fino (1,75 em 24),
 * pontas e cantos redondos — mais suaves aos olhos que os de linha grossa.
 */
const TRACO = { fill: "none", stroke: "currentColor", strokeWidth: 1.75, strokeLinecap: "round", strokeLinejoin: "round" } as const;

function Icone({ tamanho = 26, children, className }: { tamanho?: number; children: ReactNode; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" width={tamanho} height={tamanho} aria-hidden className={className}>
      {children}
    </svg>
  );
}

/**
 * O trevo da curtida: contorno quando não curtiu, cheio na cor da marca
 * quando curtiu. O contorno é o das quatro folhas juntas — traço grosso
 * por baixo e as folhas pintadas da cor do fundo por cima, para as linhas
 * de dentro (onde as folhas se encostam) não aparecerem.
 */
export function IconeTrevo({ cheio, tamanho = 26 }: { cheio: boolean; tamanho?: number }) {
  const folhas = (props: Record<string, unknown>) => (
    <g {...props}>
      {[45, 135, 225, 315].map((giro) => (
        <path key={giro} d={FOLHA} transform={`rotate(${giro} 50 50)`} />
      ))}
    </g>
  );
  return (
    <svg viewBox="-4 -4 108 108" width={tamanho} height={tamanho} aria-hidden className={cheio ? "text-marca" : ""}>
      {cheio
        ? folhas({ fill: "currentColor" })
        : (
          <>
            {folhas({ fill: "none", stroke: "currentColor", strokeWidth: 15, strokeLinejoin: "round" })}
            {folhas({ fill: "var(--white)" })}
          </>
        )}
    </svg>
  );
}

function IconeComentar() {
  return (
    <Icone>
      <path {...TRACO} d="M20.66 17A9.99 9.99 0 1 0 17.07 20.62L22 22Z" />
    </Icone>
  );
}

function IconeRepublicar({ ligado }: { ligado: boolean }) {
  return (
    <Icone className={ligado ? "text-marca" : ""}>
      <path {...TRACO} d="M19.5 10V9a4 4 0 0 0-4-4H6.5M9 2 6 5l3 3M4.5 14v1a4 4 0 0 0 4 4h9M15 22l3-3-3-3" />
      <path {...TRACO} d="m8.75 12.25 2.25 2.25 4.25-4.25" />
    </Icone>
  );
}

function IconeCompartilhar() {
  return (
    <Icone tamanho={25}>
      <path {...TRACO} d="M22 3 9.22 10.08M11.7 20.33 22 3H2l7.22 7.08Z" />
    </Icone>
  );
}

function IconeSalvar({ ligado }: { ligado: boolean }) {
  return (
    <Icone>
      <path {...TRACO} fill={ligado ? "currentColor" : "none"} d="M19.5 21 12 14.5 4.5 21V3.5h15Z" />
    </Icone>
  );
}

/**
 * A barra embaixo da publicação, como no Instagram: curtir (o trevo),
 * comentar, republicar e compartilhar, com os contadores, e salvar à
 * direita (sem contador — é privado). Quem não entrou na conta é levado
 * a entrar; o servidor decide de novo (401).
 */
export function BarraDeAcoes({
  slug,
  titulo,
  caminho,
  interacoes,
  aoComentar,
}: {
  slug: string;
  titulo: string;
  /** Endereço da rifa, para compartilhar. */
  caminho: string;
  interacoes: Interacoes;
  aoComentar: () => void;
}) {
  const qc = useQueryClient();
  const [, navegar] = useLocation();
  const [i, setI] = useState(interacoes);
  const [aviso, setAviso] = useState<string | null>(null);
  useEffect(() => setI(interacoes), [interacoes]);

  const acao = useMutation({
    mutationFn: async (v: { acao: Acao; ligar: boolean }) =>
      (await (await apiRequest("PUT", `/api/public/campaigns/${slug}/acoes/${v.acao}`, { ligar: v.ligar })).json()) as Interacoes,
    onMutate: (v) =>
      setI((x) =>
        v.acao === "curtida"
          ? { ...x, curti: v.ligar, curtidas: Math.max(0, x.curtidas + (v.ligar ? 1 : -1)) }
          : v.acao === "republicacao"
            ? { ...x, republiquei: v.ligar, republicacoes: Math.max(0, x.republicacoes + (v.ligar ? 1 : -1)) }
            : { ...x, salvei: v.ligar },
      ),
    onSuccess: (r) => {
      setI((x) => ({ ...x, ...r }));
      qc.invalidateQueries({ predicate: (q) => String(q.queryKey[0]).startsWith("/api/public/conta/salvos") });
    },
    onError: (e: Error) => {
      setI(interacoes);
      if (/Entre na sua conta/.test(e.message)) navegar(`/entrar?volta=${encodeURIComponent(caminho)}`);
      else setAviso(e.message);
    },
  });

  async function compartilhar() {
    const url = `${window.location.origin}${caminho}`;
    try {
      if (navigator.share) await navigator.share({ title: titulo, url });
      else {
        await navigator.clipboard.writeText(url);
        setAviso("Link copiado.");
      }
    } catch {
      return; // cancelou o menu do aparelho: não conta
    }
    try {
      const r = (await (await apiRequest("POST", `/api/public/campaigns/${slug}/compartilhamentos`)).json()) as Interacoes;
      setI((x) => ({ ...x, compartilhamentos: r.compartilhamentos }));
    } catch {
      /* o contador é vitrine: falhar aqui não atrapalha quem compartilhou */
    }
  }

  const botao = "flex items-center gap-1.5 rounded-md py-1 pr-1 hover:opacity-70 disabled:opacity-50";
  return (
    <div className="px-3 pt-2">
      <div className="flex items-center gap-4">
        <button
          type="button"
          className={botao}
          aria-pressed={i.curti}
          aria-label={`${i.curti ? "Descurtir" : "Curtir"} (${i.curtidas} curtida${i.curtidas === 1 ? "" : "s"})`}
          onClick={() => acao.mutate({ acao: "curtida", ligar: !i.curti })}
        >
          <IconeTrevo cheio={i.curti} />
          <span className="tnum text-[15px] font-medium">{contadorCurto(i.curtidas)}</span>
        </button>
        <button type="button" className={botao} aria-label={`Comentar (${i.comentarios} comentário${i.comentarios === 1 ? "" : "s"})`} onClick={aoComentar}>
          <IconeComentar />
          <span className="tnum text-[15px] font-medium">{contadorCurto(i.comentarios)}</span>
        </button>
        <button
          type="button"
          className={botao}
          aria-pressed={i.republiquei}
          aria-label={`${i.republiquei ? "Desfazer republicação" : "Republicar no seu perfil"} (${i.republicacoes})`}
          onClick={() => acao.mutate({ acao: "republicacao", ligar: !i.republiquei })}
        >
          <IconeRepublicar ligado={i.republiquei} />
          <span className="tnum text-[15px] font-medium">{contadorCurto(i.republicacoes)}</span>
        </button>
        <button type="button" className={botao} aria-label={`Compartilhar (${i.compartilhamentos})`} onClick={() => void compartilhar()}>
          <IconeCompartilhar />
          <span className="tnum text-[15px] font-medium">{contadorCurto(i.compartilhamentos)}</span>
        </button>
        <button
          type="button"
          className={`${botao} ml-auto`}
          aria-pressed={i.salvei}
          aria-label={i.salvei ? "Tirar dos salvos" : "Salvar"}
          onClick={() => acao.mutate({ acao: "salvo", ligar: !i.salvei })}
        >
          <IconeSalvar ligado={i.salvei} />
        </button>
      </div>
      {aviso ? (
        <p className="pt-1 text-xs text-muted" role="status">
          {aviso}
        </p>
      ) : null}
    </div>
  );
}

/**
 * A legenda da organização, embaixo das ações: o nome em negrito e o
 * texto, recolhido em duas linhas com "mais".
 */
export function Legenda({ autor, texto }: { autor: ReactNode; texto: string | null | undefined }) {
  const [aberta, setAberta] = useState(false);
  if (!texto) return null;
  const longa = texto.length > 120 || texto.includes("\n");
  return (
    <p className={`whitespace-pre-wrap break-words px-3 pt-1 text-sm ${aberta ? "" : "line-clamp-2"}`}>
      <b className="font-semibold">{autor}</b> {texto}
      {longa && !aberta ? (
        <>
          {" "}
          <button type="button" className="text-muted" onClick={() => setAberta(true)}>
            mais
          </button>
        </>
      ) : null}
    </p>
  );
}

/** A organização escreve a legenda da publicação (muda a qualquer hora). */
export function LegendaCard({ campanha }: { campanha: { id: string; legenda?: string | null } }) {
  const qc = useQueryClient();
  const [texto, setTexto] = useState(campanha.legenda ?? "");
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null);
  useEffect(() => setTexto(campanha.legenda ?? ""), [campanha.id, campanha.legenda]);
  const problema = problemaNaLegenda(texto);
  const salvar = useMutation({
    mutationFn: () => apiRequest("PUT", `/api/admin/campaigns/${campanha.id}/legenda`, { legenda: texto }),
    onSuccess: () => {
      setMsg({ ok: true, texto: texto.trim() ? "Legenda salva: aparece embaixo da publicação." : "Legenda retirada." });
      qc.invalidateQueries({ queryKey: ["/api/admin/campaigns"] });
    },
    onError: (e: Error) => setMsg({ ok: false, texto: e.message }),
  });
  return (
    <Card title="Legenda da publicação">
      <div className="space-y-2 p-4 text-sm">
        <label htmlFor={`legenda-${campanha.id}`} className="label-xs">
          O texto embaixo da publicação, como no Instagram
        </label>
        <textarea
          id={`legenda-${campanha.id}`}
          value={texto}
          rows={4}
          maxLength={LEGENDA_MAX}
          onChange={(e) => {
            setMsg(null);
            setTexto(e.target.value);
          }}
          className="w-full rounded-md border border-line-2 px-3 py-2"
        />
        <p className="flex justify-between text-[11px] text-muted">
          <span>Sem link e sem telefone — o contato fica no perfil.</span>
          <span className="tnum">
            {texto.length}/{LEGENDA_MAX}
          </span>
        </p>
        {problema ? <p className="text-xs text-red">{problema}</p> : null}
        {msg ? <p className={`text-xs ${msg.ok ? "text-green-deep" : "text-red"}`}>{msg.texto}</p> : null}
        <Button onClick={() => salvar.mutate()} disabled={Boolean(problema) || salvar.isPending}>
          Salvar legenda
        </Button>
      </div>
    </Card>
  );
}
