import { useState, type ReactNode } from "react";
import { Link, Redirect } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Bookmark, Check, Grid3x3, Lock, Megaphone, Repeat2, Settings, Share2, Store, type LucideIcon } from "lucide-react";
import { PublicShell } from "@/components/AppShell";
import { usePendencias } from "@/components/Console";
import { type BilheteDaConta } from "@/components/BilheteComoPublicacao";
import { type RifaDoFeed } from "@/components/CartaoDoFeed";
import { FotoDoApostador } from "@/components/PerfilDoApostador";
import { FOTO_COMO_NO_INSTAGRAM } from "@/components/Seguir";
import { SeloVerificado } from "@/components/SeloVerificado";
import { useListaPaginada } from "@/lib/paginada";
import { useSession } from "@/lib/session";

/**
 * O perfil de quem entrou (`/perfil`, o botão Perfil do console), como no
 * Instagram: o nome no alto com a engrenagem das configurações
 * (`/perfil/configuracoes`, onde ficou o menu da conta), a foto com os
 * contadores ao lado, o nome e a bio, os botões e, embaixo, a grade das
 * publicações em abas. O organizador vai ao perfil da organização (que tem
 * a mesma engrenagem); o afiliado tem o perfil de divulgador.
 */
export default function PerfilDoUsuario() {
  const { data: sessao, isLoading } = useSession();
  if (isLoading) {
    return (
      <PublicShell>
        <p className="py-8 text-center text-sm text-muted" role="status">
          Carregando perfil…
        </p>
      </PublicShell>
    );
  }
  if (sessao?.organizacao) return <Redirect to={`/o/${sessao.organizacao.slug}`} replace />;
  if (sessao?.role === "affiliate") return <PerfilDoAfiliado nome={sessao.user?.name ?? "Afiliado"} />;
  if (sessao?.user) return <PerfilDoPainel nome={sessao.user.name} home={sessao.home} />;
  return <PerfilDoApostadorDaConta />;
}

/* ---------------- peças comuns ---------------- */

/** O alto do perfil: o nome (ou @apelido) e a engrenagem das configurações. */
function TopoDoPerfil({ titulo, selo }: { titulo: string; selo?: ReactNode }) {
  return (
    <div className="flex items-center gap-2 py-1">
      <h1 className="flex min-w-0 flex-1 items-center gap-1.5 font-display text-xl font-extrabold">
        <span className="truncate">{titulo}</span>
        {selo}
      </h1>
      <Link
        href="/perfil/configuracoes"
        aria-label="Configurações"
        title="Configurações"
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full hover:bg-mist"
      >
        <Settings size={24} strokeWidth={1.75} aria-hidden />
      </Link>
    </div>
  );
}

interface Numero {
  rotulo: string;
  valor: string;
}

/** A foto e, ao lado, os contadores — o desenho do topo do Instagram. */
function FotoEContadores({ foto, numeros }: { foto: ReactNode; numeros: Numero[] }) {
  return (
    <div className="mt-2 flex items-center gap-4">
      <span className="shrink-0">{foto}</span>
      {numeros.length ? (
        <dl className="grid min-w-0 flex-1 text-center" style={{ gridTemplateColumns: `repeat(${numeros.length}, minmax(0, 1fr))` }}>
          {numeros.map((n) => (
            <div key={n.rotulo} className="min-w-0">
              <dt className="sr-only">{n.rotulo}</dt>
              <dd className="tnum font-display text-lg font-bold leading-tight">{n.valor}</dd>
              <dd className="truncate text-[11px] text-muted sm:text-xs">{n.rotulo}</dd>
            </div>
          ))}
        </dl>
      ) : null}
    </div>
  );
}

/** Os dois botões embaixo da bio, lado a lado e do mesmo tamanho. */
function Botoes({ children }: { children: ReactNode }) {
  return <div className="mt-4 grid grid-cols-2 gap-2">{children}</div>;
}

const BOTAO =
  "flex min-h-9 min-w-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg bg-mist-2 px-2 py-2 text-[13px] font-semibold hover:bg-mist sm:text-sm";

function BotaoLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} className={BOTAO}>
      {children}
    </Link>
  );
}

/** Compartilhar o perfil público: a folha do aparelho, senão copia o endereço. */
function BotaoCompartilhar({ caminho, titulo }: { caminho: string; titulo: string }) {
  const [copiado, setCopiado] = useState(false);
  async function compartilhar() {
    const url = `${window.location.origin}${caminho}`;
    if (navigator.share) {
      try {
        await navigator.share({ title: titulo, url });
        return;
      } catch {
        /* a pessoa cancelou: copia */
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      window.prompt("Copie o endereço do perfil:", url);
    }
  }
  return (
    <button type="button" onClick={() => void compartilhar()} className={BOTAO}>
      {copiado ? <Check size={16} aria-hidden className="hidden sm:block" /> : <Share2 size={16} aria-hidden className="hidden sm:block" />}
      {copiado ? "Endereço copiado" : "Compartilhar perfil"}
    </button>
  );
}

interface Aba {
  chave: string;
  rotulo: string;
  icone: LucideIcon;
  /** Só a própria pessoa vê: o cadeado diz isso no rótulo, não só no ícone. */
  privada?: boolean;
}

/** As abas da grade, com ícone e nome — a aberta tem o traço embaixo e `aria-selected`. */
function AbasDaGrade({ abas, aberta, abrir }: { abas: Aba[]; aberta: string; abrir: (chave: string) => void }) {
  return (
    <div role="tablist" aria-label="Publicações do perfil" className="mt-5 grid border-t border-line" style={{ gridTemplateColumns: `repeat(${abas.length}, minmax(0, 1fr))` }}>
      {abas.map((a) => {
        const ativa = a.chave === aberta;
        return (
          <button
            key={a.chave}
            type="button"
            role="tab"
            id={`aba-${a.chave}`}
            aria-selected={ativa}
            aria-controls={`painel-${a.chave}`}
            onClick={() => abrir(a.chave)}
            className={`-mt-px flex min-h-12 min-w-0 flex-col items-center justify-center gap-0.5 border-t-2 py-1.5 text-[11px] font-semibold sm:flex-row sm:gap-1.5 sm:text-xs ${
              ativa ? "border-ink text-ink" : "border-transparent text-muted hover:text-ink"
            }`}
          >
            <a.icone size={20} strokeWidth={ativa ? 2.25 : 1.75} aria-hidden className="shrink-0" />
            <span className="flex max-w-full items-center gap-0.5">
              <span className="truncate">{a.rotulo}</span>
              {a.privada ? <Lock size={10} aria-label="(só você vê)" className="shrink-0" /> : null}
            </span>
          </button>
        );
      })}
    </div>
  );
}

interface Quadro {
  chave: string;
  href: string;
  rotulo: string;
  imagem: string | null;
  /** Texto por cima, quando a peça ainda não está no ar (situação em texto, nunca só cor). */
  selo?: string | null;
}

/** A grade 3 × N de capas quadradas, como a do Instagram. */
function Grade({ aba, quadros, vazio, carregando, mais }: { aba: string; quadros: Quadro[]; vazio: string; carregando?: boolean; mais?: ReactNode }) {
  return (
    <section role="tabpanel" id={`painel-${aba}`} aria-labelledby={`aba-${aba}`} className="mt-1">
      {carregando ? (
        <p className="py-8 text-center text-sm text-muted" role="status">
          Carregando…
        </p>
      ) : quadros.length === 0 ? (
        <p className="py-10 text-center text-sm text-muted">{vazio}</p>
      ) : (
        <ul className="grid grid-cols-3 gap-0.5">
          {quadros.map((q) => (
            <li key={q.chave} className="relative aspect-square overflow-hidden bg-mist-2">
              <Link href={q.href} aria-label={q.rotulo} className="block h-full w-full">
                {q.imagem ? (
                  <img src={q.imagem} alt="" loading="lazy" className="h-full w-full object-cover" />
                ) : (
                  <span className="flex h-full w-full items-center justify-center p-2 text-center text-[11px] font-semibold text-ink-2">
                    {q.rotulo}
                  </span>
                )}
                {q.selo ? (
                  <span className="absolute left-1 top-1 rounded bg-ink/80 px-1.5 py-0.5 text-[10px] font-semibold text-branco">{q.selo}</span>
                ) : null}
              </Link>
            </li>
          ))}
        </ul>
      )}
      {mais}
    </section>
  );
}

/** A capa de uma rifa para a grade: o banner, senão a primeira imagem — nunca o vídeo cru. */
function capaDaRifa(r: { banner?: string | null; midias?: { role: string; url: string; poster?: string | null }[] }): string | null {
  if (r.banner) return r.banner;
  const p = r.midias?.find((m) => m.role !== "video") ?? r.midias?.find((m) => m.poster);
  return p ? (p.role === "video" ? (p.poster ?? null) : p.url) : null;
}

/* ---------------- apostador (e visitante) ---------------- */

interface MeuPerfil {
  foto: string | null;
  apelido: string | null;
  nomeReal: string;
  verificado: boolean;
}

function PerfilDoApostadorDaConta() {
  const { data: sessao } = useSession();
  const conta = Boolean(sessao?.buyer?.conta);
  const pendencias = usePendencias();
  const { data: perfil } = useQuery<MeuPerfil>({ queryKey: ["/api/public/conta/perfil"], enabled: conta });
  const { data: seguindo } = useQuery<unknown[]>({ queryKey: ["/api/public/seguindo"], enabled: conta });
  const bilhetes = useListaPaginada<BilheteDaConta[]>("/api/public/conta/bilhetes", {}, { enabled: conta });
  const apelido = perfil?.apelido ?? null;
  const { data: republicacoes, isLoading: carregandoRepublicacoes } = useQuery<RifaDoFeed[]>({
    queryKey: [`/api/public/u/${apelido}/republicacoes`],
    enabled: conta && Boolean(apelido),
  });
  const { data: salvos, isLoading: carregandoSalvos } = useQuery<RifaDoFeed[]>({ queryKey: ["/api/public/conta/salvos"], enabled: conta });
  const [aba, setAba] = useState("bilhetes");

  const nome = perfil?.nomeReal ?? sessao?.buyer?.name ?? null;
  const titulo = apelido ? `@${apelido}` : (nome ?? "Perfil");
  const foto = <FotoDoApostador nome={apelido ?? nome ?? "?"} foto={perfil?.foto ?? null} tamanho={FOTO_COMO_NO_INSTAGRAM} />;

  // Sem sessão: o mesmo desenho, com Entrar e Criar conta no lugar dos botões.
  if (!sessao?.buyer) {
    return (
      <PublicShell>
        <TopoDoPerfil titulo="Perfil" />
        <FotoEContadores foto={foto} numeros={[]} />
        <p className="mt-3 text-sm text-ink-2">Entre para comprar, comentar e acompanhar seus bilhetes.</p>
        <Botoes>
          <BotaoLink href="/entrar">Entrar</BotaoLink>
          <BotaoLink href="/criar-conta">Criar conta</BotaoLink>
        </Botoes>
        <p className="mt-4 text-sm">
          <Link href="/minhas-cotas" className="font-semibold text-green-deep underline">
            Ver meus bilhetes pelo WhatsApp
          </Link>{" "}
          <span className="text-muted">— sem conta, com o código que chega no seu número.</span>
        </p>
      </PublicShell>
    );
  }

  // Entrou só com o código do WhatsApp: as compras ficam em Minhas compras.
  if (!conta) {
    return (
      <PublicShell>
        <TopoDoPerfil titulo={nome ?? "Perfil"} />
        <FotoEContadores foto={foto} numeros={[]} />
        <p className="mt-3 text-sm text-ink-2">Crie uma conta para ter o seu perfil, com apelido, foto e os bilhetes como publicações.</p>
        <Botoes>
          <BotaoLink href="/minhas-compras">Minhas compras</BotaoLink>
          <BotaoLink href="/criar-conta">Criar conta</BotaoLink>
        </Botoes>
      </PublicShell>
    );
  }

  const listaDeBilhetes = bilhetes.paginas.flat();
  const numeros: Numero[] = [
    { rotulo: "bilhetes", valor: bilhetes.isLoading ? "…" : `${listaDeBilhetes.length}${bilhetes.hasNextPage ? "+" : ""}` },
    { rotulo: "republicações", valor: apelido ? String(republicacoes?.length ?? "…") : "0" },
    { rotulo: "seguindo", valor: String(seguindo?.length ?? "…") },
  ];
  const abas: Aba[] = [
    { chave: "bilhetes", rotulo: "Bilhetes", icone: Grid3x3, privada: true },
    { chave: "republicacoes", rotulo: "Republicações", icone: Repeat2 },
    { chave: "salvos", rotulo: "Salvos", icone: Bookmark, privada: true },
  ];

  return (
    <PublicShell>
      <TopoDoPerfil titulo={titulo} selo={perfil?.verificado ? <SeloVerificado sujeito="apostador" tamanho={18} /> : null} />
      <FotoEContadores foto={foto} numeros={numeros} />
      {nome ? <p className="mt-3 text-sm font-semibold">{nome}</p> : null}

      {pendencias.length ? (
        <section aria-label="Complete sua conta" className="mt-3 rounded-lg border border-green bg-green-soft p-3 text-sm">
          <p className="font-semibold text-green-deep">Complete sua conta</p>
          <ul className="mt-1 list-disc pl-5 text-ink-2">
            {pendencias.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
          <Link href="/minhas-compras?aba=conta" className="mt-2 inline-flex min-h-6 items-center font-semibold text-green-deep underline">
            Ir para Minha conta
          </Link>
        </section>
      ) : null}

      <Botoes>
        <BotaoLink href="/minhas-compras?aba=conta">Editar perfil</BotaoLink>
        {apelido ? <BotaoCompartilhar caminho={`/u/${apelido}`} titulo={`@${apelido} no rifa.br`} /> : <BotaoLink href="/minhas-compras">Minhas compras</BotaoLink>}
      </Botoes>

      <AbasDaGrade abas={abas} aberta={aba} abrir={setAba} />
      {aba === "bilhetes" ? (
        <Grade
          aba="bilhetes"
          carregando={bilhetes.isLoading}
          vazio="Você ainda não tem bilhete pago. Quando comprar uma rifa, ele aparece aqui."
          quadros={listaDeBilhetes.map((b) => ({
            chave: b.id,
            href: "/perfil/bilhetes",
            rotulo: `Bilhete de ${b.rifa.premio}`,
            imagem: capaDaRifa({ midias: b.midias }),
          }))}
          mais={
            bilhetes.hasNextPage ? (
              <p className="mt-3 text-center">
                <Link href="/perfil/bilhetes" className="text-sm font-semibold text-green-deep underline">
                  Ver todos os bilhetes
                </Link>
              </p>
            ) : null
          }
        />
      ) : null}
      {aba === "republicacoes" ? (
        <Grade
          aba="republicacoes"
          carregando={Boolean(apelido) && carregandoRepublicacoes}
          vazio={apelido ? "O que você republicar aparece aqui e no seu perfil público." : "Escolha um apelido em Editar perfil para republicar."}
          quadros={(republicacoes ?? []).map((r) => ({
            chave: r.id,
            href: r.organizacao ? `/o/${r.organizacao.slug}/r/${r.slug}` : `/r/${r.slug}`,
            rotulo: r.prizeTitle,
            imagem: capaDaRifa(r),
          }))}
        />
      ) : null}
      {aba === "salvos" ? (
        <Grade
          aba="salvos"
          carregando={carregandoSalvos}
          vazio="As rifas que você salvar aparecem aqui. Só você vê."
          quadros={(salvos ?? []).map((r) => ({
            chave: r.id,
            href: r.organizacao ? `/o/${r.organizacao.slug}/r/${r.slug}` : `/r/${r.slug}`,
            rotulo: r.prizeTitle,
            imagem: capaDaRifa(r),
          }))}
        />
      ) : null}
    </PublicShell>
  );
}

/* ---------------- afiliado ---------------- */

interface PainelDoAfiliado {
  affiliate: { code: string; foto: string | null; verificado: boolean };
  sales: number;
}

interface PecaDoAfiliado {
  id: string;
  slug: string;
  title: string;
  status: string;
  fotos: string[];
  video: { poster?: string | null } | null;
}

const SITUACAO_DA_PECA: Record<string, string | null> = {
  publicada: null,
  em_analise: "Em análise",
  recusada: "Recusada",
  retirada: "Retirada",
};

/** O perfil do divulgador: as peças que publicou, em grade, e o atalho para divulgar. */
function PerfilDoAfiliado({ nome }: { nome: string }) {
  const { data: painel } = useQuery<PainelDoAfiliado>({ queryKey: ["/api/affiliate/overview"] });
  const { data: pecas, isLoading } = useQuery<PecaDoAfiliado[]>({ queryKey: ["/api/affiliate/divulgacoes"] });
  const { data: organizacoes } = useQuery<{ vinculo: { status: string } | null }[]>({ queryKey: ["/api/affiliate/organizacoes"] });
  const [aba, setAba] = useState("divulgacoes");
  const vinculadas = organizacoes?.filter((o) => o.vinculo?.status === "aprovado").length;
  const numeros: Numero[] = [
    { rotulo: "divulgações", valor: pecas ? `${pecas.length}${pecas.length >= 50 ? "+" : ""}` : "…" },
    { rotulo: "organizações", valor: vinculadas === undefined ? "…" : String(vinculadas) },
    { rotulo: "vendas", valor: painel ? String(painel.sales) : "…" },
  ];

  return (
    <PublicShell>
      <TopoDoPerfil titulo={nome} selo={painel?.affiliate.verificado ? <SeloVerificado sujeito="afiliado" tamanho={18} /> : null} />
      <FotoEContadores foto={<FotoDoApostador nome={nome} foto={painel?.affiliate.foto ?? null} tamanho={FOTO_COMO_NO_INSTAGRAM} />} numeros={numeros} />
      <p className="mt-3 text-sm font-semibold">Afiliado</p>
      {painel ? (
        <p className="text-sm text-muted">
          Código <span className="tnum font-semibold text-ink-2">{painel.affiliate.code}</span>
        </p>
      ) : null}
      <Botoes>
        <BotaoLink href="/afiliado/dados">Editar perfil</BotaoLink>
        <BotaoLink href="/afiliado/divulgar">
          <Megaphone size={16} aria-hidden /> Divulgar
        </BotaoLink>
      </Botoes>
      <AbasDaGrade abas={[{ chave: "divulgacoes", rotulo: "Divulgações", icone: Grid3x3 }]} aberta={aba} abrir={setAba} />
      <Grade
        aba="divulgacoes"
        carregando={isLoading}
        vazio="As peças que você publicar sobre as rifas aparecem aqui."
        quadros={(pecas ?? []).map((p) => ({
          chave: p.id,
          href: "/afiliado/divulgar",
          rotulo: `Divulgação de ${p.title}`,
          imagem: p.fotos[0] ?? p.video?.poster ?? null,
          selo: SITUACAO_DA_PECA[p.status] ?? null,
        }))}
      />
    </PublicShell>
  );
}

/* ---------------- plataforma e cambista ---------------- */

/** Quem entrou pelo painel sem perfil público (plataforma, cambista): o nome e o painel. */
function PerfilDoPainel({ nome, home }: { nome: string; home: string }) {
  return (
    <PublicShell>
      <TopoDoPerfil titulo={nome} />
      <FotoEContadores foto={<FotoDoApostador nome={nome} foto={null} tamanho={FOTO_COMO_NO_INSTAGRAM} />} numeros={[]} />
      <Botoes>
        <BotaoLink href={home}>Meu painel</BotaoLink>
        <BotaoLink href="/">
          <Store size={16} aria-hidden /> Vitrine
        </BotaoLink>
      </Botoes>
    </PublicShell>
  );
}
