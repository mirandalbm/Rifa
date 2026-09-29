import { Link, useLocation } from "wouter";
import { useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { RodapeDaPlataforma } from "@/components/RodapeDaPlataforma";
import { Marketing, useTemMarketing } from "@/components/Marketing";
import { ALTURA_DO_CONSOLE, BotaoPublicar, ConsoleDoApp, TrevoDeAvisos, acimaDoConsole } from "@/components/Console";
import { reabrirAviso, useEscolha } from "@/lib/marketing";
import {
  Banknote,
  Building2,
  Circle,
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
  PanelLeftClose,
  PanelLeftOpen,
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
  Rocket,
  Target,
} from "lucide-react";
import type { SectionKey } from "@shared/access";
import { useSession, useLogout } from "@/lib/session";
import { TemaCiclo } from "@/components/TemaToggle";
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
  adminBonus: Gift,
  adminPatrocinio: Rocket,
  adminMarketing: Target,
};

const CHAVE_MENU = "rifa.menu.aberto";

function telaLarga(): boolean {
  return typeof window !== "undefined" && window.matchMedia?.("(min-width: 768px)").matches;
}

/**
 * Aberto ou recolhido. No computador, lembra a última escolha. No celular
 * começa sempre recolhido: aberto, o menu cobre a tela, e abrir cada página
 * com a tela coberta seria pior que não ter menu.
 */
function menuInicial(): boolean {
  if (!telaLarga()) return false;
  try {
    const guardado = localStorage.getItem(CHAVE_MENU);
    return guardado === null ? true : guardado === "1";
  } catch {
    return true;
  }
}

/**
 * Casca dos painéis. O menu vem da sessão — não há lista fixa no cliente.
 *
 * O menu fica sempre na lateral esquerda, em qualquer tela. Recolhido, mostra
 * só os ícones (o nome aparece ao segurar/passar o mouse e é lido pelo leitor
 * de tela); aberto, ícone e nome. No celular, aberto passa por cima do
 * conteúdo e fecha ao escolher uma página.
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
  const nomeDaMarca = useTemplate().identidade.nome;

  // Chamado de reembolso tem prazo: o contador no menu é o aviso que o
  // organizador vê sem precisar abrir o Atendimento.
  const temAtendimento = Boolean(session?.sections.some((s) => s.key === "adminAtendimento"));
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

  const alternar = () => {
    const novo = !aberto;
    setAberto(novo);
    if (telaLarga()) {
      try {
        localStorage.setItem(CHAVE_MENU, novo ? "1" : "0");
      } catch {
        // armazenamento bloqueado: vale só nesta visita
      }
    }
  };
  const aoNavegar = () => {
    if (!telaLarga()) setAberto(false);
  };

  const item = (ativo: boolean) =>
    `flex items-center gap-3 rounded-md px-2.5 py-2 text-sm ${
      ativo ? "bg-green font-semibold text-on-green" : "text-ink-2 hover:bg-mist-2"
    } ${aberto ? "" : "justify-center"}`;

  return (
    <div className="min-h-screen bg-white">
      {aberto ? (
        <button
          type="button"
          aria-label="Fechar menu"
          onClick={() => setAberto(false)}
          className="fixed inset-0 z-30 bg-black/30 md:hidden"
        />
      ) : null}

      <aside
        className={`fixed inset-y-0 left-0 z-40 flex flex-col border-r border-line bg-mist transition-[width] duration-200 ${
          aberto ? "w-[220px]" : "w-14"
        }`}
        style={{ paddingTop: "env(safe-area-inset-top)", paddingBottom: "env(safe-area-inset-bottom)" }}
        aria-label="Menu do painel"
      >
        <div className={`flex items-center gap-2 px-2 pb-2 pt-3 ${aberto ? "justify-between" : "flex-col"}`}>
          <Link
            href="/"
            title="Ir para as rifas"
            className="min-w-[24px] px-1 text-center font-display text-lg font-extrabold tracking-tight"
          >
            {aberto ? (
              <Marca />
            ) : (
              <>
                {(nomeDaMarca || "r").charAt(0)}<span className="text-marca">.</span>
              </>
            )}
          </Link>
          <button
            type="button"
            onClick={alternar}
            aria-expanded={aberto}
            aria-label={aberto ? "Recolher menu" : "Abrir menu"}
            title={aberto ? "Recolher menu" : "Abrir menu"}
            className="rounded-md p-1.5 text-ink-2 hover:bg-mist-2"
          >
            {aberto ? <PanelLeftClose size={18} /> : <PanelLeftOpen size={18} />}
          </button>
        </div>

        <nav className="flex flex-1 flex-col gap-0.5 overflow-y-auto px-2 py-1">
          {session?.sections.map((s) => {
            const Icone = ICONE[s.key] ?? Circle;
            const ativo = location === s.path;
            const n = contador[s.key];
            const rotulo = n ? `${s.label} (${n} pendente${n > 1 ? "s" : ""})` : s.label;
            return (
              <Link
                key={s.key}
                href={s.path}
                onClick={aoNavegar}
                title={aberto ? undefined : rotulo}
                aria-label={rotulo}
                aria-current={ativo ? "page" : undefined}
                className={`relative ${item(ativo)}`}
              >
                <Icone size={18} className="shrink-0" aria-hidden />
                {aberto ? <span className="truncate">{s.label}</span> : null}
                {n ? (
                  <span
                    aria-hidden
                    className={`tnum rounded-full bg-yellow px-1.5 text-[11px] font-semibold leading-[18px] text-on-yellow ${
                      aberto ? "ml-auto" : "absolute -right-0.5 -top-0.5"
                    }`}
                  >
                    {n > 99 ? "99+" : n}
                  </span>
                ) : null}
              </Link>
            );
          })}
        </nav>

        <div className="border-t border-line px-2 py-2">
          {aberto ? (
            <p className="truncate px-2.5 pb-1 font-mono text-[11px] text-muted">
              {session?.user?.name}
            </p>
          ) : null}
          <Link
            href="/conta/senha"
            onClick={aoNavegar}
            title={aberto ? undefined : "Trocar senha"}
            aria-label="Trocar senha"
            className={item(location === "/conta/senha")}
          >
            <KeyRound size={18} className="shrink-0" aria-hidden />
            {aberto ? <span>Trocar senha</span> : null}
          </Link>
          <TemaCiclo compacto={!aberto} className={`${item(false)} w-full`} />
          <button
            type="button"
            onClick={() => logout.mutate()}
            title={aberto ? undefined : "Sair"}
            aria-label="Sair"
            className={`${item(false)} w-full`}
          >
            <LogOut size={18} className="shrink-0" aria-hidden />
            {aberto ? <span>Sair</span> : null}
          </button>
        </div>
      </aside>

      {/* O conteúdo abre espaço para o menu: recolhido em qualquer tela; aberto
          só no computador — no celular o menu aberto passa por cima. */}
      <div className={`min-w-0 pl-14 ${aberto ? "md:pl-[220px]" : ""}`}>
        <header className="border-b border-line px-4 py-4 md:px-5">
          <h1 className="font-display text-xl font-bold">{title}</h1>
        </header>
        <main className="px-4 py-5 md:px-5">{children}</main>
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
