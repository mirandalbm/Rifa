import { SeloVerificado } from "@/components/SeloVerificado";
import { BarraDeAcoes, Carrossel, Legenda, type Interacoes, type Peca } from "@/components/Publicacao";
import { PainelDeComentarios } from "@/components/Comentarios";
import { useEffect, useState, type ReactNode } from "react";
import { Link, useLocation, useParams } from "wouter";
import { definirOrganizacaoDaPagina } from "@/lib/marketing";
import { useMutation, useQuery } from "@tanstack/react-query";
import { MoreVertical, Share2, MapPin, X, Copy, Check } from "lucide-react";
import { PublicShell } from "@/components/AppShell";
import { Money, Progress, Empty, Button } from "@/components/bits";
import { apiRequest } from "@/lib/queryClient";
import { useSession } from "@/lib/session";
import { SeguirBotoes, FotoDoPerfil } from "@/components/Seguir";
import { Denunciar } from "@/components/Seguranca";
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
  vende?: boolean;
  midias: Peca[];
  legenda?: string | null;
  interacoes: Interacoes;
}

interface Perfil {
  verificada?: boolean;
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
  // Os pixels da promotora valem no perfil dela (etapa 16).
  useEffect(() => {
    definirOrganizacaoDaPagina(org ?? null);
    return () => definirOrganizacaoDaPagina(null);
  }, [org]);
  const { data: p, isLoading, error } = useQuery<Perfil>({ queryKey: [`/api/public/o/${org}`] });
  const { data: sessao } = useSession();
  const [denunciando, setDenunciando] = useState(false);
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
    <PublicShell larga>
      <DestaqueOrg cor={p.destaque}>
      {/* Capa: 3:1, de ponta a ponta; a foto sobe um pouco sobre ela. Sem
          capa enviada, o padrão: o nome sobre um degradê da cor de destaque. */}
      <div className="-mx-4 -mt-4 aspect-[3/1] overflow-hidden bg-mist-2 sm:mx-0 sm:mt-0 sm:rounded-xl lg:aspect-[4/1]">
        {p.capa ? (
          <img src={p.capa} alt="" className="h-full w-full object-cover" />
        ) : (
          <CapaPadrao nome={p.nome} />
        )}
      </div>
      {/* No computador, duas colunas abaixo da capa: o cartão do perfil à
          esquerda, fixo na rolagem, e as rifas em grade à direita. No
          celular, a mesma ordem de sempre. */}
      <div className="lg:grid lg:grid-cols-[320px_minmax(0,1fr)] lg:items-start lg:gap-8">
      <div className="lg:sticky lg:top-[68px]">
      {/* Topo: foto à esquerda; à direita, o nome e, embaixo dele, os contadores */}
      <div className="flex items-end gap-4">
        <span className="relative z-10 -mt-10 shrink-0 rounded-full bg-white p-1">
          <FotoComStory
            slug={p.slug}
            nome={p.nome}
            foto={p.foto}
            ultimoStory={p.ultimoStory}
            tamanho={84}
            onAbrir={() => setStories(true)}
          />
        </span>
        <div className="min-w-0 flex-1 pt-2">
          <h1 className="line-clamp-2 font-display text-lg font-extrabold leading-tight">
            {p.nome}
            {p.verificada ? (
              <span className="ml-1.5 inline-block">
                <SeloVerificado sujeito="organizacao" tamanho={18} />
              </span>
            ) : null}
          </h1>
          <dl className="mt-2 grid grid-cols-3 text-center">
            <Contador rotulo="rifas realizadas" valor={contador(p.rifasRealizadas)} />
            <Contador rotulo="seguidores" valor={contador(p.seguidores)} />
            <div>
              <dt className="sr-only">compartilhar</dt>
              <dd>
                <button
                  type="button"
                  onClick={() => setPainel("compartilhar")}
                  className="mx-auto flex h-7 items-center justify-center text-ink hover:text-marca"
                  aria-label="Compartilhar este perfil"
                >
                  <Share2 size={20} aria-hidden />
                </button>
              </dd>
              <dd className="text-[11px] text-muted">compartilhar</dd>
            </div>
          </dl>
        </div>
      </div>

      {/* Ações: seguir, sino, ⋮ */}
      <div className="mt-4 flex items-center gap-2">
        {/* No próprio perfil, o organizador edita em vez de seguir. */}
        {sessao?.organizacao?.slug === p.slug ? (
          <Link
            href="/admin/configuracoes"
            className="rounded-md border border-line-2 px-4 py-1.5 text-sm font-semibold hover:bg-mist"
          >
            Editar perfil
          </Link>
        ) : (
          <SeguirBotoes slug={p.slug} />
        )}
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
                <ItemMenu onClick={() => (setMenu(false), setDenunciando(true))}>Denunciar</ItemMenu>
              </div>
            </>
          ) : null}
        </div>
      </div>

      {denunciando ? <Denunciar organizacao={p.slug} onFechar={() => setDenunciando(false)} /> : null}

      {/* Bio: o texto do organizador e a rifa atual, escrita sozinha */}
      <div className="mt-4 space-y-1 text-sm">
        {p.local ? (
          <p className="flex items-center gap-1 text-muted">
            <MapPin size={13} aria-hidden /> {p.local}
          </p>
        ) : null}
        {p.bio ? <p className="whitespace-pre-line font-semibold">{p.bio}</p> : null}
        {p.bioAutomatica.length ? (
          <div className="pt-1 text-[13px] font-semibold text-ink-2">
            {p.bioAutomatica.map((l) => (
              <p key={l}>{l}</p>
            ))}
          </div>
        ) : null}
        <LinksDoPerfil links={p.links} slug={p.slug} />
        {p.seguidoPor ? <p className="pt-1 text-xs text-muted">{p.seguidoPor}</p> : null}
      </div>

      {/* Destaques: rifas já sorteadas */}
      {p.destaques.length ? (
        <section aria-label="Rifas realizadas" className="-mx-4 mt-5 overflow-x-auto px-4 lg:mx-0 lg:overflow-visible lg:px-0">
          <ul className="flex gap-4 lg:flex-wrap">
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
                  <span className="mt-1 block truncate text-[11px] font-semibold">{d.prizeTitle}</span>
                  <span className="tnum block text-[10px] text-muted">
                    {d.sorteadaEm ? new Date(d.sorteadaEm).toLocaleDateString("pt-BR") : "—"}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      </div>

      {/* Grade: uma rifa por linha no celular, duas no computador */}
      <section
        aria-label="Rifas no ar"
        className="mt-5 space-y-4 border-t border-line pt-4 lg:grid lg:grid-cols-2 lg:gap-6 lg:space-y-0 lg:border-t-0 lg:pt-0"
      >
        {p.rifas.length === 0 ? (
          <div className="lg:col-span-2">
            <Empty>Nenhuma rifa no ar agora.</Empty>
          </div>
        ) : null}
        {p.rifas.map((r) => (
          <CartaoDaRifa key={r.id} org={p.slug} nome={p.nome} rifa={r} />
        ))}
      </section>
      </div>

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

/** Uma rifa no perfil, como publicação: carrossel, ações, legenda e o resumo. */
function CartaoDaRifa({ org, nome, rifa }: { org: string; nome: string; rifa: RifaDoPerfil }) {
  const pct = percent(rifa.soldCount, rifa.totalQuotas);
  const href = `/o/${org}/r/${rifa.slug}`;
  const [comentando, setComentando] = useState(false);

  return (
    <article className="overflow-hidden bg-white">
      <Carrossel pecas={rifa.midias} titulo={rifa.prizeTitle} href={href} aoAbrir={() => marcarOrigem("perfil")} />
      {/* Só a rifa vai dentro do cartão, logo abaixo da imagem e acima das ações, como no feed. */}
      <Link href={href} onClick={() => marcarOrigem("perfil")} className="mx-3 mt-3 block space-y-2 rounded-xl border border-line p-3 hover:bg-mist">
        <div className="flex items-baseline justify-between gap-2">
          <h3 className="font-display text-base font-extrabold leading-tight">{rifa.prizeTitle}</h3>
          <Money cents={rifa.priceCents} className="shrink-0 text-sm font-bold text-green-deep" />
        </div>
        <Progress value={rifa.soldCount} total={rifa.totalQuotas} tone={pct >= 85 ? "yellow" : "green"} />
        <p className="flex justify-between text-xs font-semibold text-ink-2">
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
      <BarraDeAcoes slug={rifa.slug} titulo={rifa.prizeTitle} caminho={href} interacoes={rifa.interacoes} aoComentar={() => setComentando(true)} vende={rifa.vende} />
      <div className="pb-4">
        <Legenda autor={nome} texto={rifa.legenda} />
      </div>
      {comentando ? <PainelDeComentarios slug={rifa.slug} onFechar={() => setComentando(false)} /> : null}
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

/**
 * Capa de quem ainda não enviou a sua: degradê da cor de destaque (`--marca`)
 * escurecido, para o nome em branco ler nos dois temas — no escuro a
 * `--marca` é clara. Nada é gravado — enviar a
 * capa no painel troca na hora.
 */
function CapaPadrao({ nome }: { nome: string }) {
  return (
    <div
      aria-hidden
      className="relative flex h-full w-full items-center justify-center overflow-hidden px-6"
      style={{
        background:
          "linear-gradient(135deg, color-mix(in srgb, var(--marca) 62%, #0b1f14), color-mix(in srgb, var(--marca) 40%, #4c1d95))",
      }}
    >
      <span className="absolute -right-6 -top-10 h-32 w-32 rounded-full bg-white/10" />
      <span className="absolute -bottom-12 -left-8 h-28 w-28 rounded-full bg-black/10" />
      <span className="relative line-clamp-2 text-center font-display text-2xl font-extrabold text-branco drop-shadow">
        {nome}
      </span>
    </div>
  );
}
