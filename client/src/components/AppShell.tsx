import { Link, useLocation } from "wouter";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { RodapeDaPlataforma } from "@/components/RodapeDaPlataforma";
import { Marketing, useTemMarketing } from "@/components/Marketing";
import { ALTURA_DO_CONSOLE, BotaoPublicar, ConsoleDoApp, TrevoDeAvisos, acimaDoConsole } from "@/components/Console";
import { reabrirAviso, useEscolha } from "@/lib/marketing";
import {
  Banknote,
  Bell,
  Building2,
  ChevronDown,
  ChevronsLeft,
  ChevronsRight,
  Circle,
  CircleDollarSign,
  Inbox,
  Menu,
  Search,
  SlidersHorizontal,
  TrendingUp,
  UsersRound,
  Download,
  HandCoins,
  KeyRound,
  Landmark,
  LayoutDashboard,
  Link2,
  ListOrdered,
  LogOut,
  Megaphone,
  Palette,
  Percent,
  Receipt,
  MessagesSquare,
  Settings,
  ShieldAlert,
  ShoppingCart,
  Store,
  Ticket,
  Trophy,
  Users,
  Wallet,
  type LucideIcon,
  CircleDashed,
  BarChart3,
  IdCard,
  FileCheck2,
  Gift,
  GalleryHorizontal,
  Rocket,
  Target,
} from "lucide-react";
import { menuDe, type IconeDoGrupo, type Section, type SectionKey } from "@shared/access";
import { BUSCA_MAX, NOME_DO_TIPO, interpretarBusca, type AchadoDaBusca } from "@shared/busca";
import { caminhoDoAviso, naoLidos, rotuloDoSino, type AvisoDoPainel } from "@shared/avisos";
import { quandoPublicou } from "@shared/publicacao";
import { apiRequest } from "@/lib/queryClient";
import { useSession, useLogout } from "@/lib/session";
import { TemaCiclo } from "@/components/TemaToggle";
import { AssistenteDoPainel } from "@/components/AssistenteDoPainel";
import { Marca } from "@/components/Marca";
import { useTemplate } from "@/lib/template";

/**
 * Mantidos com os nomes antigos: o que fica fixo acima da base (barra de
 * compra da rifa, avisos) agora fica acima do console.
 */
export const ALTURA_DO_RODAPE = ALTURA_DO_CONSOLE;
export const acimaDoRodape = acimaDoConsole;

/**
 * Casca da loja, como no Instagram. No celular e no tablet: o topo com a
 * logo à esquerda e, à direita, a publicação e o trevo de avisos; embaixo, o
 * console fixo com os seis botões. No computador (`lg`): o topo some e tudo
 * vai para o menu da lateral esquerda (`ConsoleDoApp`).
 *
 * `larga`: no computador a página abre em grade larga — a rifa em duas
 * colunas, a vitrine e o perfil em cartões. No celular é a mesma coluna de
 * sempre.
 */
export function PublicShell({
  children,
  larga,
  vitrine,
  rodape,
}: {
  children: ReactNode;
  larga?: boolean;
  /** A vitrine ocupa a largura toda do tablet em diante (feed e coluna ao vivo). */
  vitrine?: boolean;
  /** O rodapé da plataforma (informações, pagamentos, 18+ e logos) — tablet e computador. */
  rodape?: boolean;
}) {
  // A vitrine ocupa a tela toda do tablet em diante: as colunas ficam
  // coladas (1 px de linha entre elas), sem margem sobrando dos lados.
  const largura = vitrine ? "max-w-3xl md:max-w-none" : larga ? "max-w-3xl lg:max-w-6xl" : "max-w-3xl";

  return (
    <div className="min-h-screen bg-white lg:pl-[72px]">
      <header className="sticky top-0 z-20 border-b border-line bg-white lg:hidden">
        <div className={`mx-auto flex ${largura} items-center justify-between px-4 py-2`}>
          <Link href="/" className="text-lg">
            <Marca />
          </Link>
          <nav aria-label="Criar e avisos" className="flex items-center gap-1">
            <BotaoPublicar />
            <TrevoDeAvisos />
          </nav>
        </div>
      </header>
      <main className={`mx-auto ${largura} px-4 pb-8 pt-4 ${vitrine ? "md:p-0" : ""}`}>{children}</main>
      {rodape ? <RodapeDaPlataforma /> : null}
      <RodapePublico largura={largura} comRodape={Boolean(rodape)} />
    </div>
  );
}

/** Ícone de cada seção do menu. A lista de seções vem da sessão; o desenho, daqui. */
const ICONE: Partial<Record<SectionKey, LucideIcon>> = {
  afiliadoPainel: LayoutDashboard,
  afiliadoLinks: Link2,
  afiliadoOrganizacoes: Building2,
  afiliadoComissoes: Percent,
  afiliadoSaques: Banknote,
  afiliadoDados: IdCard,
  cambistaVenda: ShoppingCart,
  cambistaVendas: ListOrdered,
  cambistaAcerto: HandCoins,
  adminPainel: LayoutDashboard,
  adminCampanhas: Ticket,
  adminPedidos: Receipt,
  adminAtendimento: MessagesSquare,
  adminStories: CircleDashed,
  adminResultados: BarChart3,
  adminAfiliados: Megaphone,
  adminCambistas: Store,
  adminUsuarios: Users,
  adminFinanceiro: Wallet,
  adminSorteios: Trophy,
  adminExportacoes: Download,
  adminCobranca: Landmark,
  adminConfiguracoes: Settings,
  adminOrganizacoes: Building2,
  adminAntifraude: ShieldAlert,
  adminAparencia: Palette,
  adminFiscal: FileCheck2,
  adminCaixa: Inbox,
  adminBonus: Gift,
  adminPatrocinio: Rocket,
  adminBannerPago: GalleryHorizontal,
  adminMarketing: Target,
};

const CHAVE_MENU = "rifa.menu.aberto";

function telaLarga(): boolean {
  return typeof window !== "undefined" && window.matchMedia?.("(min-width: 768px)").matches;
}

/**
 * Aberto (260 px, com os nomes) ou recolhido (72 px, só os ícones — e abre
 * com os nomes por cima do conteúdo ao passar o ponteiro). Lembrado no
 * aparelho. No celular não existe recolhido: o menu fica fora da tela e
 * entra por cima quando o botão do topo o chama.
 */
function menuInicial(): boolean {
  try {
    const guardado = localStorage.getItem(CHAVE_MENU);
    return guardado === null ? true : guardado === "1";
  } catch {
    return true;
  }
}

/** O desenho de cada item "pai" do menu em grupos (`MENUS` em shared/access.ts). */
const ICONE_DO_GRUPO: Record<IconeDoGrupo, LucideIcon> = {
  caixa: Inbox,
  visaoGeral: LayoutDashboard,
  rifas: Ticket,
  dinheiro: CircleDollarSign,
  pessoas: Users,
  crescimento: TrendingUp,
  plataforma: SlidersHorizontal,
  equipe: UsersRound,
};

const NOME_DO_PAPEL: Partial<Record<string, string>> = {
  admin: "Administrador geral",
  organizer: "Organizador",
  affiliate: "Afiliado",
  cambista: "Cambista",
};

/** Sem acento e em minúsculas, para a busca do painel não depender de acento. */
const simples = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/**
 * A busca única do topo: encontra uma tela do painel pelo nome e, pelo
 * servidor, o pedido pelo código, o cliente pelo ID e (para a plataforma) a
 * organização pelo nome — `GET /api/admin/busca`, com o recorte da sessão.
 * Enter abre o primeiro achado; Esc limpa. O que vem do servidor espera o
 * dedo parar (300 ms) para não consultar a cada letra.
 */
function BuscaDoPainel({ secoes }: { secoes: Section[] }) {
  const [, navegar] = useLocation();
  const [texto, setTexto] = useState("");
  const termo = simples(texto.trim());
  const telas = termo ? secoes.filter((s) => simples(s.label).includes(termo)).slice(0, 6) : [];

  const [parado, setParado] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setParado(texto.trim()), 300);
    return () => clearTimeout(t);
  }, [texto]);
  const consulta = interpretarBusca(parado);
  const { data: achados, isFetching } = useQuery<AchadoDaBusca[]>({
    queryKey: ["/api/admin/busca", { q: parado }],
    enabled: consulta !== null,
    staleTime: 10_000,
  });
  const doServidor = consulta && achados ? achados : [];

  const itens: { chave: string; rotulo: string; detalhe: string; caminho: string }[] = [
    ...telas.map((s) => ({ chave: `tela:${s.key}`, rotulo: s.label, detalhe: s.path, caminho: s.path })),
    ...doServidor.map((a) => ({ chave: `${a.tipo}:${a.caminho}`, rotulo: a.rotulo, detalhe: `${NOME_DO_TIPO[a.tipo]} · ${a.detalhe}`, caminho: a.caminho })),
  ];
  const esperando = consulta !== null && (isFetching || parado !== texto.trim());
  const ir = (caminho: string) => {
    setTexto("");
    navegar(caminho);
  };
  return (
    <form
      role="search"
      className="relative min-w-0 flex-1"
      onSubmit={(e) => {
        e.preventDefault();
        if (itens[0]) ir(itens[0].caminho);
      }}
    >
      <label htmlFor="busca-do-painel" className="sr-only">
        Buscar no painel
      </label>
      <Search size={18} aria-hidden className="pointer-events-none absolute left-0 top-1/2 -translate-y-1/2 text-muted" />
      <input
        id="busca-do-painel"
        type="search"
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape") setTexto("");
        }}
        placeholder="Tela, pedido, cliente ou organização"
        autoComplete="off"
        maxLength={BUSCA_MAX}
        className="w-full border-0 bg-transparent py-2 pl-7 pr-2 text-sm text-ink placeholder:text-muted focus:outline-none"
      />
      {termo ? (
        <ul
          aria-label="Resultados da busca"
          className="cartao absolute left-0 top-full z-30 mt-1 w-80 max-w-[calc(100vw-2rem)] rounded-lg border border-line bg-white py-1 text-sm"
        >
          {itens.length === 0 ? (
            <li className="px-3 py-2 text-muted">{esperando ? "Procurando…" : "Nada com esse nome, código ou ID."}</li>
          ) : (
            itens.map((i) => (
              <li key={i.chave}>
                <button type="button" onClick={() => ir(i.caminho)} className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-mist">
                  <span className="min-w-0 truncate">{i.rotulo}</span>
                  <span className="tnum ml-auto shrink-0 truncate text-[11px] text-muted">{i.detalhe}</span>
                </button>
              </li>
            ))
          )}
        </ul>
      ) : null}
    </form>
  );
}

/**
 * Casca dos painéis, no padrão do kit Materialize: menu lateral de 260 px com
 * os itens em grupos (subtítulo em letras pequenas, item pai que abre os
 * filhos, o aceso numa pílula verde), barra de cima de 64 px com a busca, o
 * tema, o aviso do atendimento e a conta; o conteúdo sobre um fundo neutro;
 * o rodapé com o © e os atalhos.
 *
 * O menu vem da sessão (`sections`); a ordem e a hierarquia vêm de
 * `menuDe()` em shared/access.ts — não há lista fixa no cliente. Recolhido
 * (72 px), só os ícones dos itens de cima; ao passar o ponteiro (ou entrar
 * pelo teclado) abre com os nomes por cima do conteúdo e fecha ao sair. No
 * celular, o menu entra por cima e fecha ao escolher uma página.
 */
export function PanelShell({
  children,
  title,
}: {
  children: ReactNode;
  title: string;
}) {
  const { data: session } = useSession();
  const [location] = useLocation();
  const logout = useLogout();
  const [aberto, setAberto] = useState(menuInicial);
  const [noCelular, setNoCelular] = useState(false);
  const nomeDaMarca = useTemplate().identidade.nome;
  const secoes = session?.sections ?? [];
  const menu = useMemo(() => (session ? menuDe(session.role, session.sections) : []), [session]);

  // O item pai da tela atual já nasce aberto; os outros abrem no toque.
  const paiDe = (caminho: string) => {
    for (const g of menu) for (const i of g.itens) if ("filhos" in i && i.filhos.some((f) => secoes.find((s) => s.key === f)?.path === caminho)) return i.rotulo;
    return null;
  };
  const [abertos, setAbertos] = useState<string[]>(() => {
    const p = paiDe(location);
    return p ? [p] : [];
  });
  useEffect(() => {
    const p = paiDe(location);
    if (p) setAbertos((lista) => (lista.includes(p) ? lista : [...lista, p]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location, menu]);

  // Chamado de reembolso tem prazo: o contador no menu é o aviso que o
  // organizador vê sem precisar abrir o Atendimento.
  const temAtendimento = secoes.some((s) => s.key === "adminAtendimento");
  const { data: pendentes } = useQuery<{ total: number; disputas?: number; solicitacoes?: number; denuncias?: number; verificacoes?: number }>({
    queryKey: ["/api/admin/chamados/pendentes"],
    enabled: temAtendimento,
    refetchInterval: 60_000,
  });
  const contador: Partial<Record<string, number>> = {
    // A plataforma conta o que só ela resolve: as disputas.
    adminAtendimento:
      (session?.role === "admin"
        ? (pendentes?.disputas ?? 0) + (pendentes?.solicitacoes ?? 0) + (pendentes?.denuncias ?? 0) + (pendentes?.verificacoes ?? 0)
        : pendentes?.total) ||
      undefined,
  };
  const pendenciasNoMenu = Object.values(contador).reduce<number>((s, n) => s + (n ?? 0), 0);
  const caminhoDoAtendimento = secoes.find((s) => s.key === "adminAtendimento")?.path;

  // Os avisos do sino: os últimos comentários de apostador nas rifas do
  // recorte. Abrir o sino marca tudo como visto; o número vai no rótulo.
  const qc = useQueryClient();
  const { data: avisos } = useQuery<AvisoDoPainel[]>({
    queryKey: ["/api/admin/avisos"],
    refetchInterval: 60_000,
  });
  const novos = naoLidos(avisos ?? []);
  // As mensagens um para um da organização e do afiliado: o apostador tem o
  // número no console; aqui o painel ganha o dele (a caixa continua em /mensagens).
  const comoNasMensagens = session?.role === "organizer" ? "organizacao" : session?.role === "affiliate" ? "afiliado" : null;
  const { data: resumoMensagens } = useQuery<{ naoLidas: number }>({
    queryKey: [`/api/public/mensagens/resumo?como=${comoNasMensagens}`],
    enabled: comoNasMensagens !== null,
    refetchInterval: 60_000,
  });
  const mensagensNovas = comoNasMensagens ? (resumoMensagens?.naoLidas ?? 0) : 0;
  const verAvisos = useMutation({
    mutationFn: () => apiRequest("POST", "/api/admin/avisos/vistos"),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/admin/avisos"] }),
  });

  // O menu da conta e o sino (dois <details>) fecham ao clicar fora ou no
  // Esc, como um menu de verdade — senão ficariam abertos por cima do conteúdo.
  const menuDaConta = useRef<HTMLDetailsElement>(null);
  const sino = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const fechar = (e: MouseEvent | KeyboardEvent) => {
      for (const d of [menuDaConta.current, sino.current]) {
        if (!d?.open) continue;
        if (e instanceof KeyboardEvent ? e.key === "Escape" : !d.contains(e.target as Node)) d.open = false;
      }
    };
    document.addEventListener("click", fechar);
    document.addEventListener("keydown", fechar);
    return () => {
      document.removeEventListener("click", fechar);
      document.removeEventListener("keydown", fechar);
    };
  }, []);

  const alternar = () => {
    const novo = !aberto;
    setAberto(novo);
    try {
      localStorage.setItem(CHAVE_MENU, novo ? "1" : "0");
    } catch {
      // armazenamento bloqueado: vale só nesta visita
    }
  };
  const aoNavegar = () => setNoCelular(false);
  const abrirOuFechar = (rotulo: string) =>
    setAbertos((lista) => (lista.includes(rotulo) ? lista.filter((r) => r !== rotulo) : [...lista, rotulo]));

  // Com os nomes: aberto no computador, ou o menu do celular. Recolhido, os
  // nomes só aparecem quando o ponteiro (ou o foco) abre o menu por cima.
  const nomes = aberto ? "" : "max-md:inline hidden group-hover/menu:inline group-focus-within/menu:inline";
  const bloco = aberto ? "" : "max-md:block hidden group-hover/menu:block group-focus-within/menu:block";
  const badge = (n: number, classe = "") => (
    <span aria-hidden className={`tnum rounded-full bg-red px-1.5 text-[11px] font-semibold leading-[18px] text-branco ${classe}`}>
      {n > 99 ? "99+" : n}
    </span>
  );
  const rotuloCom = (label: string, n?: number) => (n ? `${label} (${n} pendente${n > 1 ? "s" : ""})` : label);

  const itemSolto = (s: Section, filho = false) => {
    const Icone = ICONE[s.key] ?? Circle;
    const ativo = location === s.path;
    const n = contador[s.key];
    return (
      <li key={s.key}>
        <Link
          href={s.path}
          onClick={aoNavegar}
          aria-label={rotuloCom(s.label, n)}
          aria-current={ativo ? "page" : undefined}
          className={`relative flex h-[42px] items-center gap-2 rounded-lg pr-3 text-[15px] ${filho ? "pl-5" : "pl-3"} ${
            ativo ? "bg-green font-semibold text-on-green shadow-aceso" : "text-ink-2 hover:bg-mist-2"
          }`}
        >
          {filho ? (
            <span aria-hidden className={`mx-2 h-2 w-2 shrink-0 rounded-full ${ativo ? "bg-branco" : "bg-muted"}`} />
          ) : (
            <Icone size={22} className="shrink-0" aria-hidden />
          )}
          <span className={`truncate ${nomes}`}>{s.label}</span>
          {n ? badge(n, aberto ? "ml-auto" : `ml-auto ${nomes}`) : null}
          {n && !aberto && !filho ? badge(n, "absolute right-1 top-1 group-hover/menu:hidden group-focus-within/menu:hidden") : null}
        </Link>
      </li>
    );
  };

  return (
    <div className="painel min-h-screen bg-painel text-ink">
      {noCelular ? (
        <button
          type="button"
          aria-label="Fechar menu"
          onClick={() => setNoCelular(false)}
          className="fixed inset-0 z-30 bg-black/40 md:hidden"
        />
      ) : null}

      <aside
        className={`group/menu fixed inset-y-0 left-0 z-40 flex w-[260px] flex-col bg-painel transition-[width,transform] duration-150 motion-reduce:transition-none max-md:shadow-papel ${
          noCelular ? "" : "max-md:-translate-x-full"
        } ${aberto ? "md:w-[260px]" : "md:w-[72px] md:hover:w-[260px] md:hover:shadow-papel md:focus-within:w-[260px] md:focus-within:shadow-papel"}`}
        style={{ paddingTop: "env(safe-area-inset-top)", paddingBottom: "env(safe-area-inset-bottom)" }}
        aria-label="Menu do painel"
      >
        <div className="flex h-16 shrink-0 items-center gap-2 overflow-hidden px-5">
          <Link href="/" title="Ir para as rifas" className="min-w-0 whitespace-nowrap text-lg">
            {aberto ? (
              <Marca />
            ) : (
              <>
                <span className={`hidden group-hover/menu:inline group-focus-within/menu:inline max-md:inline`}>
                  <Marca />
                </span>
                <span className="font-display text-xl font-extrabold tracking-tight group-hover/menu:hidden group-focus-within/menu:hidden max-md:hidden">
                  {(nomeDaMarca || "r").charAt(0)}<span className="text-marca">.</span>
                </span>
              </>
            )}
          </Link>
          <button
            type="button"
            onClick={() => (telaLarga() ? alternar() : setNoCelular(false))}
            aria-expanded={aberto}
            aria-label={aberto ? "Recolher menu" : "Abrir menu"}
            title={aberto ? "Recolher menu" : "Abrir menu"}
            className={`ml-auto rounded-md p-1.5 text-muted hover:bg-mist-2 hover:text-ink ${nomes}`}
          >
            {aberto ? <ChevronsLeft size={20} aria-hidden /> : <ChevronsRight size={20} aria-hidden />}
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto overflow-x-hidden px-3 pb-2">
          {menu.map((g, gi) => (
            <div key={g.titulo ?? gi}>
              {g.titulo ? (
                <p className="flex h-[34px] items-center gap-4 pt-3 text-[11px] uppercase tracking-[0.1em] text-muted">
                  <span aria-hidden className="h-px w-4 shrink-0 bg-line-2" />
                  <span className={nomes}>{g.titulo}</span>
                </p>
              ) : null}
              <ul className="space-y-1.5">
                {g.itens.map((i) => {
                  if ("secao" in i) {
                    const s = secoes.find((x) => x.key === i.secao);
                    return s ? itemSolto(s) : null;
                  }
                  const Icone = ICONE_DO_GRUPO[i.icone];
                  const filhos = i.filhos.map((f) => secoes.find((x) => x.key === f)).filter((x): x is Section => Boolean(x));
                  const estaAberto = abertos.includes(i.rotulo);
                  const temAtivo = filhos.some((f) => f.path === location);
                  const n = filhos.reduce((soma, f) => soma + (contador[f.key] ?? 0), 0);
                  return (
                    <li key={i.rotulo}>
                      <button
                        type="button"
                        onClick={() => abrirOuFechar(i.rotulo)}
                        aria-expanded={estaAberto}
                        aria-label={rotuloCom(i.rotulo, n || undefined)}
                        className={`relative flex h-[42px] w-full items-center gap-2 rounded-lg pl-3 pr-2 text-left text-[15px] text-ink-2 hover:bg-mist-2 ${
                          temAtivo && !estaAberto ? "bg-mist-2" : ""
                        }`}
                      >
                        <Icone size={22} className="shrink-0" aria-hidden />
                        <span className={`truncate ${nomes}`}>{i.rotulo}</span>
                        {n ? badge(n, `ml-auto ${nomes}`) : null}
                        {n && !aberto ? badge(n, "absolute right-1 top-1 group-hover/menu:hidden group-focus-within/menu:hidden") : null}
                        <ChevronDown
                          size={18}
                          aria-hidden
                          className={`shrink-0 text-muted transition-transform motion-reduce:transition-none ${n ? "" : "ml-auto"} ${estaAberto ? "" : "-rotate-90"} ${nomes}`}
                        />
                      </button>
                      {estaAberto ? <ul className={`mt-1.5 space-y-1.5 ${bloco}`}>{filhos.map((f) => itemSolto(f, true))}</ul> : null}
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>

        <div className="flex h-16 shrink-0 items-center gap-3 overflow-hidden border-t border-line px-4">
          <span aria-hidden className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-green-soft text-sm font-semibold text-green-deep">
            {(session?.user?.name || "?").charAt(0).toUpperCase()}
          </span>
          <span className={`min-w-0 ${nomes}`}>
            <span className="block truncate text-sm font-medium">{session?.user?.name}</span>
            <span className="block truncate text-[11px] text-muted">{session?.organizacao?.nome ?? NOME_DO_PAPEL[session?.role ?? ""] ?? ""}</span>
          </span>
        </div>
      </aside>

      {/* O conteúdo abre espaço para o menu no tablet e no computador; no
          celular o menu passa por cima. */}
      <div className={`flex min-h-screen min-w-0 flex-col ${aberto ? "md:pl-[260px]" : "md:pl-[72px]"}`}>
        <header className="sticky top-0 z-20 flex h-16 items-center gap-3 bg-painel/95 px-4 md:px-6">
          <button
            type="button"
            onClick={() => setNoCelular(true)}
            aria-label="Abrir menu"
            className="-ml-1 rounded-md p-1.5 text-ink-2 hover:bg-mist-2 md:hidden"
          >
            <Menu size={22} aria-hidden />
          </button>
          <BuscaDoPainel secoes={secoes} />
          <TemaCiclo compacto className="rounded-md p-1.5 text-ink-2 hover:bg-mist-2" />
          {session?.role === "admin" || session?.role === "organizer" ? <AssistenteDoPainel /> : null}
          <details
            ref={sino}
            className="relative"
            onToggle={(e) => {
              if ((e.currentTarget as HTMLDetailsElement).open && novos) verAvisos.mutate();
            }}
          >
            <summary
              aria-label={rotuloDoSino(novos, pendenciasNoMenu, mensagensNovas)}
              className="relative flex cursor-pointer list-none rounded-md p-1.5 text-ink-2 hover:bg-mist-2 [&::-webkit-details-marker]:hidden"
            >
              <Bell size={20} aria-hidden />
              {novos || pendenciasNoMenu || mensagensNovas ? (
                <span aria-hidden className={`absolute right-1 top-1 h-2 w-2 rounded-full ${pendenciasNoMenu ? "bg-red" : "bg-green"}`} />
              ) : null}
            </summary>
            <div className="cartao absolute right-0 top-full z-30 mt-1 w-80 max-w-[calc(100vw-2rem)] rounded-lg border border-line bg-white py-1 text-sm">
              <p className="px-3 py-2 text-xs font-medium uppercase tracking-[0.1em] text-ink-2">Avisos</p>
              {caminhoDoAtendimento && pendenciasNoMenu ? (
                <Link href={caminhoDoAtendimento} aria-label={`Atendimento: ${pendenciasNoMenu} pendente${pendenciasNoMenu > 1 ? "s" : ""}`} className="block border-b border-line px-3 py-2 hover:bg-mist">
                  <span className="tnum font-medium">{pendenciasNoMenu}</span> pendente{pendenciasNoMenu > 1 ? "s" : ""} no atendimento
                </Link>
              ) : null}
              {mensagensNovas ? (
                <Link href="/mensagens" aria-label={`Mensagens: ${mensagensNovas} não lida${mensagensNovas > 1 ? "s" : ""}`} className="block border-b border-line px-3 py-2 hover:bg-mist">
                  <span className="tnum font-medium">{mensagensNovas}</span> {mensagensNovas > 1 ? "mensagens" : "mensagem"} não lida{mensagensNovas > 1 ? "s" : ""}
                </Link>
              ) : null}
              {avisos && avisos.length === 0 ? <p className="px-3 py-2 text-muted">Nenhum comentário ainda.</p> : null}
              <ul aria-label="Comentários novos nas suas rifas" className="max-h-80 overflow-y-auto">
                {avisos?.map((a) => (
                  <li key={a.id}>
                    <Link
                      href={caminhoDoAviso(a)}
                      // O menu fechado esconde o texto do leitor de tela: o nome vai no rótulo.
                      aria-label={`${a.lido ? "" : "Novo: "}${a.quem} em ${a.rifa.titulo}: ${a.trecho}`}
                      className={`block px-3 py-2 hover:bg-mist ${a.lido ? "" : "bg-green-soft"}`}
                    >
                      <span className="block truncate">
                        <span className="font-medium">{a.quem}</span> em {a.rifa.titulo}
                        {a.lido ? null : <span className="sr-only"> (novo)</span>}
                      </span>
                      <span className="block truncate text-muted">{a.trecho}</span>
                      <span className="block text-[11px] text-muted">{quandoPublicou(a.createdAt)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          </details>
          <details ref={menuDaConta} className="relative">
            <summary
              aria-label={`Conta de ${session?.user?.name ?? ""}`}
              className="flex h-9 w-9 cursor-pointer list-none items-center justify-center rounded-full bg-green text-sm font-semibold text-on-green [&::-webkit-details-marker]:hidden"
            >
              <span aria-hidden>{(session?.user?.name || "?").charAt(0).toUpperCase()}</span>
            </summary>
            <div className="cartao absolute right-0 top-full z-30 mt-2 w-60 rounded-lg border border-line bg-white py-1 text-sm">
              <p className="truncate px-3 pb-2 pt-1 text-xs text-muted">
                <span className="block truncate font-medium text-ink">{session?.user?.name}</span>
                {session?.user?.email}
              </p>
              {/* O rótulo também no aria-label: fechado, o <details> esconde o texto. */}
              <Link href="/" aria-label="Ir para as rifas" className="flex items-center gap-2 px-3 py-2 hover:bg-mist">
                <Store size={16} aria-hidden /> Ir para as rifas
              </Link>
              <Link href="/conta/senha" aria-label="Trocar senha" className="flex items-center gap-2 px-3 py-2 hover:bg-mist">
                <KeyRound size={16} aria-hidden /> Trocar senha
              </Link>
              <button type="button" aria-label="Sair" onClick={() => logout.mutate()} className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-mist">
                <LogOut size={16} aria-hidden /> Sair
              </button>
            </div>
          </details>
        </header>
        <main className="flex-1 px-4 pb-6 pt-2 md:px-6">
          <h1 className="mb-5 font-display text-xl font-extrabold">{title}</h1>
          {children}
        </main>
        <footer className="flex h-14 flex-wrap items-center justify-between gap-x-6 gap-y-1 px-4 text-xs text-muted md:px-6">
          <span>
            © <span className="tnum">{new Date().getFullYear()}</span> {nomeDaMarca} · {NOME_DO_PAPEL[session?.role ?? ""] ?? "Painel"}
          </span>
          <span className="flex gap-4">
            <Link href="/ajuda" className="inline-flex min-h-6 items-center text-green-deep hover:underline">
              Ajuda
            </Link>
            <Link href="/" className="inline-flex min-h-6 items-center text-green-deep hover:underline">
              Rifas
            </Link>
          </span>
        </footer>
      </div>
    </div>
  );
}

/**
 * O fim da página: o texto livre do rodapé (template), o espaço para o
 * console fixo não cobrir o conteúdo, e o console. O "18+", a ajuda, o tema
 * e os cookies moram na tela do perfil (`/perfil`).
 */
function RodapePublico({ largura, comRodape }: { largura: string; comRodape: boolean }) {
  const t = useTemplate();
  return (
    <>
      {t.textos.rodape ? (
        // Com o rodapé da plataforma (tablet e computador), o texto livre já vai nele.
        <p className={`mx-auto ${largura} whitespace-pre-line border-t border-line px-4 pt-3 text-[11px] text-muted ${comRodape ? "md:hidden" : ""}`}>
          {t.textos.rodape}
        </p>
      ) : null}
      {/* Espaço para o console fixo não cobrir o fim da página (no computador ele é lateral). */}
      <div aria-hidden className="lg:hidden" style={{ height: acimaDoConsole }} />
      <ConsoleDoApp />
      <Marketing />
    </>
  );
}

/** "Cookies": reabre o aviso. Só existe quando há pixel na página e a pessoa já escolheu. */
export function PreferenciaDeCookies({ className }: { className?: string }) {
  const tem = useTemMarketing();
  const escolha = useEscolha();
  if (!tem || !escolha) return null;
  return (
    <button type="button" onClick={reabrirAviso} className={className ?? "shrink-0 underline hover:text-ink"}>
      Preferência de cookies
    </button>
  );
}
