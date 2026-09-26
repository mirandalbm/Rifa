import { useState, type ReactNode } from "react";
import { Link, useLocation, useParams } from "wouter";
import { useMutation, useQuery } from "@tanstack/react-query";
import { MoreVertical, Share2, MapPin, X, Copy, Check } from "lucide-react";
import { PublicShell } from "@/components/AppShell";
import { Money, Progress, Empty, Button } from "@/components/bits";
import { apiRequest } from "@/lib/queryClient";
import { useSession } from "@/lib/session";
import { SeguirBotoes, FotoDoPerfil } from "@/components/Seguir";
import { DestaqueOrg, LinksDoPerfil } from "@/components/DestaqueOrg";
import { FotoComStory, VisualizadorDeStories } from "@/components/Stories";
import { marcarOrigem } from "@/lib/origem";
import { groupNumber, percent } from "@shared/format";
import {
  contador,
  linkDeCompartilhar,
  NOME_REDE,
  type CorDeDestaque,
  type LinkDoPerfil,
  type Rede,
} from "@shared/perfil";

interface Midia {
  role: "banner" | "photo" | "video";
  url: string;
  srcSet: string | null;
  lqip: string | null;
  mime: string;
}

interface RifaDoPerfil {
  id: string;
  slug: string;
  title: string;
  prizeTitle: string;
  priceCents: number;
  totalQuotas: number;
  soldCount: number;
  drawAt: string | null;
  status: "published" | "closed" | "drawn";
  midias: Midia[];
}

interface Perfil {
  slug: string;
  nome: string;
  foto: string | null;
  capa: string | null;
  ultimoStory: string | null;
  destaque: CorDeDestaque | null;
  links: LinkDoPerfil[];
  local: string | null;
  desde: string;
  cnpj: string | null;
  contato: string | null;
  rifasRealizadas: number;
  seguidores: number;
  seguidoPor: string | null;
  bio: string | null;
  bioAutomatica: string[];
  autorizacoes: string[];
  destaques: { slug: string; prizeTitle: string; sorteadaEm: string | null; capa: string | null }[];
  rifas: RifaDoPerfil[];
}

const REDES: Rede[] = ["whatsapp", "telegram", "facebook", "instagram", "tiktok"];

/**
 * Perfil do organizador no formato do Instagram (`/o/:slug`). Cada rifa abre
 * dentro dele (`/o/:slug/r/:rifa`), e é daqui que o apostador segue e liga o
 * sino.
 */
export default function PerfilPage() {
  const { org } = useParams<{ org: string }>();
  const { data: p, isLoading, error } = useQuery<Perfil>({ queryKey: [`/api/public/o/${org}`] });
  const [menu, setMenu] = useState(false);
  const [painel, setPainel] = useState<"sobre" | "qr" | "compartilhar" | "colaborador" | null>(null);
  const [copiado, setCopiado] = useState(false);
  const [stories, setStories] = useState(false);

  if (isLoading) {
    return (
      <PublicShell>
        <p className="text-sm text-muted">Carregando perfil…</p>
      </PublicShell>
    );
  }
  if (error || !p) {
    return (
      <PublicShell>
        <Empty>Perfil não encontrado.</Empty>
      </PublicShell>
    );
  }

  const url = `${window.location.origin}/o/${p.slug}`;
  const texto = `Conheça as rifas de ${p.nome}`;
  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      window.prompt("Copie o endereço do perfil:", url);
    }
  };
  const compartilharNativo = async () => {
    if (navigator.share) {
      try {
        await navigator.share({ title: p.nome, text: texto, url });
        return;
      } catch {
        /* a pessoa cancelou: segue para as opções */
      }
    }
    setPainel("compartilhar");
  };

  return (
    <PublicShell>
      <DestaqueOrg cor={p.destaque}>
      {/* Capa: 3:1, de ponta a ponta; a foto sobe um pouco sobre ela */}
      {p.capa ? (
        <div className="-mx-4 -mt-4 aspect-[3/1] overflow-hidden bg-mist-2 sm:mx-0 sm:mt-0 sm:rounded-xl">
          <img src={p.capa} alt="" className="h-full w-full object-cover" />
        </div>
      ) : null}
      {/* Topo: nome, foto, contadores */}
      <h1 className={`font-display text-xl font-extrabold ${p.capa ? "sr-only" : ""}`}>{p.nome}</h1>
      <div className={`flex gap-4 ${p.capa ? "items-end" : "mt-3 items-center"}`}>
        <span className={p.capa ? "-mt-10 rounded-full bg-white p-1" : ""}>
          <FotoComStory
            slug={p.slug}
            nome={p.nome}
            foto={p.foto}
            ultimoStory={p.ultimoStory}
            tamanho={84}
            onAbrir={() => setStories(true)}
          />
        </span>
        <dl className="grid flex-1 grid-cols-3 text-center">
          <Contador rotulo="rifas realizadas" valor={contador(p.rifasRealizadas)} />
          <Contador rotulo="seguidores" valor={contador(p.seguidores)} />
          <div>
            <button
              type="button"
              onClick={() => setPainel("compartilhar")}
              className="mx-auto flex h-9 w-9 items-center justify-center rounded-full bg-mist-2 text-ink hover:bg-line"
              aria-label="Compartilhar este perfil"
            >
              <Share2 size={17} aria-hidden />
            </button>
            <dd className="mt-1 text-[11px] text-muted">compartilhar</dd>
          </div>
        </dl>
      </div>

      {p.capa ? (
        <p aria-hidden className="mt-2 font-display text-xl font-extrabold">
          {p.nome}
        </p>
      ) : null}

      {/* Ações: seguir, sino, ⋮ */}
      <div className="mt-4 flex items-center gap-2">
        <SeguirBotoes slug={p.slug} />
        <div className="relative ml-auto">
          <button
            type="button"
            aria-haspopup="menu"
            aria-expanded={menu}
            aria-label="Mais opções"
            onClick={() => setMenu(!menu)}
            className="flex h-8 w-9 items-center justify-center rounded-md border border-line-2 hover:bg-mist"
          >
            <MoreVertical size={17} aria-hidden />
          </button>
          {menu ? (
            <>
              <button
                type="button"
                aria-label="Fechar menu"
                className="fixed inset-0 z-30 cursor-default"
                onClick={() => setMenu(false)}
              />
              <div
                role="menu"
                className="absolute right-0 z-40 mt-2 w-56 overflow-hidden rounded-lg border border-line bg-white py-1 text-sm shadow-lg"
              >
                <ItemMenu href={`/seja-afiliado?organizacao=${p.slug}`}>Seja um afiliado</ItemMenu>
                <ItemMenu onClick={() => (setMenu(false), setPainel("colaborador"))}>Seja um colaborador</ItemMenu>
                <ItemMenu onClick={() => (setMenu(false), setPainel("sobre"))}>Sobre essa conta</ItemMenu>
                <ItemMenu onClick={() => (setMenu(false), void copiar())}>
                  {copiado ? "Endereço copiado" : "Copiar URL do perfil"}
                </ItemMenu>
                <ItemMenu onClick={() => (setMenu(false), void compartilharNativo())}>
                  Compartilhar esse perfil
                </ItemMenu>
                <ItemMenu onClick={() => (setMenu(false), setPainel("qr"))}>QR code</ItemMenu>
              </div>
            </>
          ) : null}
        </div>
      </div>

      {/* Bio: o texto do organizador e a rifa atual, escrita sozinha */}
      <div className="mt-4 space-y-1 text-sm">
        {p.local ? (
          <p className="flex items-center gap-1 text-muted">
            <MapPin size={13} aria-hidden /> {p.local}
          </p>
        ) : null}
        {p.bio ? <p className="whitespace-pre-line">{p.bio}</p> : null}
        {p.bioAutomatica.length ? (
          <div className="pt-1 text-[13px] text-ink-2">
            {p.bioAutomatica.map((l) => (
              <p key={l}>{l}</p>
            ))}
          </div>
        ) : null}
        <LinksDoPerfil links={p.links} />
        {p.seguidoPor ? <p className="pt-1 text-xs text-muted">{p.seguidoPor}</p> : null}
      </div>

      {/* Destaques: rifas já sorteadas */}
      {p.destaques.length ? (
        <section aria-label="Rifas realizadas" className="-mx-4 mt-5 overflow-x-auto px-4">
          <ul className="flex gap-4">
            {p.destaques.map((d) => (
              <li key={d.slug} className="w-[72px] shrink-0 text-center">
                <Link href={`/o/${p.slug}/r/${d.slug}`} onClick={() => marcarOrigem("perfil")} className="block">
                  <span className="mx-auto block h-16 w-16 overflow-hidden rounded-full border-2 border-marca p-[2px]">
                    {d.capa ? (
                      <img src={d.capa} alt="" className="h-full w-full rounded-full object-cover" />
                    ) : (
                      <span className="flex h-full w-full items-center justify-center rounded-full bg-mist-2 text-[10px] text-muted">
                        rifa
                      </span>
                    )}
                  </span>
                  <span className="tnum mt-1 block text-[11px] text-muted">
                    {d.sorteadaEm ? new Date(d.sorteadaEm).toLocaleDateString("pt-BR") : "—"}
                  </span>
                  <span className="sr-only">{d.prizeTitle}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {/* Grade: uma rifa por linha, cada uma em carrossel */}
      <section aria-label="Rifas no ar" className="mt-5 space-y-4 border-t border-line pt-4">
        {p.rifas.length === 0 ? <Empty>Nenhuma rifa no ar agora.</Empty> : null}
        {p.rifas.map((r) => (
          <CartaoDaRifa key={r.id} org={p.slug} rifa={r} />
        ))}
      </section>

      {painel === "sobre" ? (
        <Folha titulo="Sobre essa conta" fechar={() => setPainel(null)}>
          <dl className="space-y-3 text-sm">
            <Linha rotulo="Organização" valor={p.nome} />
            {p.cnpj ? <Linha rotulo="CNPJ" valor={p.cnpj} tnum /> : null}
            {p.local ? <Linha rotulo="Cidade" valor={p.local} /> : null}
            <Linha rotulo="Na plataforma desde" valor={new Date(p.desde).toLocaleDateString("pt-BR", { month: "long", year: "numeric" })} />
            <Linha rotulo="Rifas realizadas" valor={String(p.rifasRealizadas)} tnum />
            <Linha
              rotulo="Autorizações SPA/MF"
              valor={p.autorizacoes.length ? p.autorizacoes.join(" · ") : "—"}
              tnum
            />
          </dl>
        </Folha>
      ) : null}

      {painel === "colaborador" ? (
        <Folha titulo={`Vender para ${p.nome}`} fechar={() => setPainel(null)}>
          <PedidoDeColaborador slug={p.slug} nome={p.nome} />
        </Folha>
      ) : null}

      {painel === "qr" ? (
        <Folha titulo="QR code do perfil" fechar={() => setPainel(null)}>
          <img
            src={`/api/public/o/${p.slug}/qr.svg`}
            alt={`QR code que abre o perfil de ${p.nome}`}
            className="mx-auto h-56 w-56 rounded-lg bg-branco p-2"
          />
          <p className="mt-2 break-all text-center font-mono text-xs text-muted">{url}</p>
        </Folha>
      ) : null}

      {painel === "compartilhar" ? (
        <Folha titulo="Compartilhar este perfil" fechar={() => setPainel(null)}>
          <ul className="grid grid-cols-2 gap-2 text-sm">
            {REDES.map((rede) => {
              const link = linkDeCompartilhar(rede, url, texto);
              return (
                <li key={rede}>
                  {link ? (
                    <a
                      href={link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block rounded-md border border-line-2 px-3 py-2 text-center hover:bg-mist"
                    >
                      {NOME_REDE[rede]}
                    </a>
                  ) : (
                    <button
                      type="button"
                      onClick={() => void copiar()}
                      className="w-full rounded-md border border-line-2 px-3 py-2 hover:bg-mist"
                    >
                      {NOME_REDE[rede]}
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
          <button
            type="button"
            onClick={() => void copiar()}
            className="mt-3 flex w-full items-center justify-center gap-2 rounded-md bg-mist-2 px-3 py-2 text-sm"
          >
            {copiado ? <Check size={15} aria-hidden /> : <Copy size={15} aria-hidden />}
            {copiado ? "Endereço copiado" : "Copiar endereço"}
          </button>
          <p className="mt-2 text-[11px] text-muted">
            Instagram e TikTok não aceitam link pronto: o endereço é copiado para você colar no
            story ou na bio.
          </p>
        </Folha>
      ) : null}
      {stories ? <VisualizadorDeStories slug={p.slug} onFechar={() => setStories(false)} /> : null}
      </DestaqueOrg>
    </PublicShell>
  );
}

function Contador({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div>
      <dt className="sr-only">{rotulo}</dt>
      <dd className="tnum font-display text-lg font-bold">{valor}</dd>
      <dd className="text-[11px] text-muted">{rotulo}</dd>
    </div>
  );
}

function ItemMenu({
  children,
  href,
  externo,
  onClick,
}: {
  children: ReactNode;
  href?: string;
  externo?: boolean;
  onClick?: () => void;
}) {
  const classe = "block w-full px-4 py-2 text-left hover:bg-mist";
  if (href && externo) {
    return (
      <a role="menuitem" href={href} target="_blank" rel="noopener noreferrer" className={classe}>
        {children}
      </a>
    );
  }
  if (href) {
    return (
      <Link role="menuitem" href={href} className={classe}>
        {children}
      </Link>
    );
  }
  return (
    <button type="button" role="menuitem" onClick={onClick} className={classe}>
      {children}
    </button>
  );
}

function Folha({ titulo, fechar, children }: { titulo: string; fechar: () => void; children: ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:items-center" onClick={fechar}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={titulo}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-t-xl bg-white p-4 sm:rounded-xl"
      >
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-display text-base font-bold">{titulo}</h2>
          <button type="button" onClick={fechar} aria-label="Fechar" className="text-muted hover:text-ink">
            <X size={18} aria-hidden />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function Linha({ rotulo, valor, tnum }: { rotulo: string; valor: string; tnum?: boolean }) {
  return (
    <div>
      <dt className="label-xs">{rotulo}</dt>
      <dd className={tnum ? "tnum" : ""}>{valor}</dd>
    </div>
  );
}

/** Uma rifa na grade: carrossel (banner, até 5 fotos, 1 vídeo) e o resumo. */
function CartaoDaRifa({ org, rifa }: { org: string; rifa: RifaDoPerfil }) {
  const [atual, setAtual] = useState(0);
  const pct = percent(rifa.soldCount, rifa.totalQuotas);
  const href = `/o/${org}/r/${rifa.slug}`;
  const midias = rifa.midias;

  return (
    <article className="overflow-hidden rounded-xl border border-line bg-white">
      {midias.length ? (
        <div className="relative">
          <div
            className="flex snap-x snap-mandatory overflow-x-auto"
            style={{ scrollbarWidth: "none" }}
            onScroll={(e) => {
              const el = e.currentTarget;
              setAtual(Math.round(el.scrollLeft / el.clientWidth));
            }}
          >
            {midias.map((m, i) => (
              <div key={m.url} className="aspect-[4/3] w-full shrink-0 snap-center bg-mist-2">
                {m.role === "video" ? (
                  <video src={m.url} controls playsInline preload="none" className="h-full w-full object-cover" />
                ) : (
                  <Link href={href} onClick={() => marcarOrigem("perfil")}>
                    <img
                      src={m.url}
                      srcSet={m.srcSet ?? undefined}
                      sizes="(min-width: 768px) 720px, 100vw"
                      alt={i === 0 ? rifa.prizeTitle : ""}
                      loading={i === 0 ? "eager" : "lazy"}
                      className="h-full w-full object-cover"
                      style={m.lqip ? { backgroundImage: `url(${m.lqip})`, backgroundSize: "cover" } : undefined}
                    />
                  </Link>
                )}
              </div>
            ))}
          </div>
          {midias.length > 1 ? (
            <>
              <span className="tnum absolute right-2 top-2 rounded-full bg-black/60 px-2 py-[1px] text-[11px] text-branco">
                {atual + 1}/{midias.length}
              </span>
              <div className="absolute inset-x-0 bottom-2 flex justify-center gap-1" aria-hidden>
                {midias.map((m, i) => (
                  <span
                    key={m.url}
                    className={`h-1.5 w-1.5 rounded-full ${i === atual ? "bg-branco" : "bg-branco/50"}`}
                  />
                ))}
              </div>
            </>
          ) : null}
        </div>
      ) : null}
      <Link href={href} onClick={() => marcarOrigem("perfil")} className="block space-y-2 p-3">
        <div className="flex items-baseline justify-between gap-2">
          <h3 className="font-display text-base font-extrabold leading-tight">{rifa.prizeTitle}</h3>
          <Money cents={rifa.priceCents} className="shrink-0 text-sm text-green-deep" />
        </div>
        <Progress value={rifa.soldCount} total={rifa.totalQuotas} tone={pct >= 85 ? "yellow" : "green"} />
        <p className="flex justify-between text-xs text-muted">
          <span className="tnum">
            {groupNumber(rifa.soldCount)} de {groupNumber(rifa.totalQuotas)} cotas
          </span>
          <span className="tnum">
            {rifa.status === "closed"
              ? "vendas encerradas"
              : rifa.drawAt
                ? `sorteio ${new Date(rifa.drawAt).toLocaleDateString("pt-BR")}`
                : "sorteio a definir"}
          </span>
        </p>
      </Link>
    </article>
  );
}

/**
 * "Seja um colaborador": o pedido vai para a organização com o nome e o
 * WhatsApp da conta de quem pede (por isso precisa entrar). Um pedido em
 * aberto por organização.
 */
function PedidoDeColaborador({ slug, nome }: { slug: string; nome: string }) {
  const [local, navigate] = useLocation();
  const { data: sessao } = useSession();
  const [cidade, setCidade] = useState("");
  const [mensagem, setMensagem] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null);
  const pedir = useMutation({
    mutationFn: async () => (await apiRequest("POST", `/api/public/o/${slug}/colaborador`, { cidade, mensagem })).json(),
    onSuccess: (r: { message: string }) => setMsg({ ok: true, texto: r.message }),
    onError: (e: Error) => setMsg({ ok: false, texto: e.message }),
  });
  if (!sessao?.buyer) {
    return (
      <div className="space-y-3 text-sm">
        <p className="text-ink-2">
          Cambista vende as cotas de {nome} na rua, com a maquininha, e ganha comissão. Entre na sua conta para
          mandar o pedido — a organização responde pelo seu WhatsApp.
        </p>
        <Button onClick={() => navigate(`/entrar?volta=${encodeURIComponent(local)}`)}>Entrar para pedir</Button>
      </div>
    );
  }
  if (msg?.ok) return <p className="rounded-md bg-green-soft px-3 py-2 text-sm text-green-deep">{msg.texto}</p>;
  return (
    <form
      className="space-y-3 text-sm"
      onSubmit={(e) => {
        e.preventDefault();
        setMsg(null);
        pedir.mutate();
      }}
    >
      <p className="text-ink-2">
        O pedido vai com o seu nome e WhatsApp da conta. {nome} fala com você para combinar.
      </p>
      <div>
        <label htmlFor="colab-cidade" className="label-xs">Cidade onde você vende</label>
        <input id="colab-cidade" value={cidade} maxLength={80} onChange={(e) => setCidade(e.target.value)} className="mt-1 w-full rounded-md border border-line-2 px-3 py-2" />
      </div>
      <div>
        <label htmlFor="colab-msg" className="label-xs">Conte um pouco (opcional)</label>
        <textarea id="colab-msg" rows={3} maxLength={500} value={mensagem} onChange={(e) => setMensagem(e.target.value)} className="mt-1 w-full rounded-md border border-line-2 px-3 py-2" />
      </div>
      {msg ? <p className="rounded-md bg-red-soft px-3 py-2 text-red">{msg.texto}</p> : null}
      <Button type="submit" disabled={cidade.trim().length < 2 || pedir.isPending}>
        {pedir.isPending ? "Enviando…" : "Quero ser colaborador"}
      </Button>
    </form>
  );
}
