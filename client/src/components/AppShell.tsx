import { Link, useLocation } from "wouter";
import { useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
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
} from "lucide-react";
import type { SectionKey } from "@shared/access";
import { useSession, useLogout } from "@/lib/session";
import { TemaCiclo, TemaEscolha } from "@/components/TemaToggle";

/**
 * Menu do apostador com conta: o círculo com a inicial abre as compras, os
 * reembolsos, a conta e o sair.
 */
function MenuDoApostador({ nome }: { nome: string }) {
  const [aberto, setAberto] = useState(false);
  const [, navigate] = useLocation();
  const qc = useQueryClient();
  const ir = (href: string) => {
    setAberto(false);
    navigate(href);
  };
  const itens: [string, string][] = [
    ["Minhas compras", "/minhas-compras"],
    ["Reembolsos", "/minhas-compras?aba=reembolsos"],
    ["Minha conta", "/minhas-compras?aba=conta"],
    ["Ajuda", "/ajuda"],
  ];
  return (
    <div className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={aberto}
        aria-label="Menu da conta"
        onClick={() => setAberto(!aberto)}
        className="flex items-center gap-2 rounded-full border border-line py-0.5 pl-0.5 pr-3 text-xs font-semibold text-ink-2 hover:bg-mist"
      >
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-green text-on-green">
          {nome.trim().charAt(0).toUpperCase() || "?"}
        </span>
        <span className="max-w-[90px] truncate">{nome.split(" ")[0]}</span>
      </button>
      {aberto ? (
        <>
          <button
            type="button"
            aria-label="Fechar menu"
            className="fixed inset-0 z-30 cursor-default"
            onClick={() => setAberto(false)}
          />
          <div
            role="menu"
            className="absolute right-0 z-40 mt-2 w-48 overflow-hidden rounded-lg border border-line bg-white py-1 shadow-lg"
          >
            {itens.map(([rotulo, href]) => (
              <button
                key={href}
                type="button"
                role="menuitem"
                onClick={() => ir(href)}
                className="block w-full px-4 py-2 text-left text-sm hover:bg-mist"
              >
                {rotulo}
              </button>
            ))}
            <TemaCiclo className="flex w-full items-center gap-2 border-t border-line px-4 py-2 text-left text-sm hover:bg-mist [&>svg]:h-4 [&>svg]:w-4" />
            <button
              type="button"
              role="menuitem"
              onClick={async () => {
                await apiRequest("POST", "/api/public/conta/sair");
                qc.invalidateQueries();
                ir("/");
              }}
              className="block w-full border-t border-line px-4 py-2 text-left text-sm text-red hover:bg-mist"
            >
              Sair
            </button>
          </div>
        </>
      ) : null}
    </div>
  );
}

/** Cabeçalho público: vitrine, rifa, pedido, minhas cotas. */
export function PublicShell({ children }: { children: ReactNode }) {
  const { data: session } = useSession();

  return (
    <div className="min-h-screen bg-white">
      <header className="sticky top-0 z-20 border-b border-line bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3">
          <Link href="/" className="font-display text-lg font-extrabold tracking-tight">
            rifa<span className="text-green">.</span>br
          </Link>
          <nav className="flex items-center gap-3 text-sm">
            {session?.buyer?.conta ? null : (
              <Link href="/minhas-cotas" className="text-ink-2 hover:text-green-deep">
                Minhas cotas
              </Link>
            )}
            {/* Quem é do painel vai para o painel; o apostador com conta vai
                para as cotas dele; os demais veem entrar e cadastrar. */}
            {session?.user ? (
              <Link
                href={session.home}
                className="rounded-md bg-green-soft px-3 py-1.5 text-xs font-semibold text-green-deep"
              >
                Meu painel
              </Link>
            ) : session?.buyer?.conta ? (
              <MenuDoApostador nome={session.buyer.name} />
            ) : (
              <>
                <Link
                  href="/entrar"
                  className="rounded-md border-2 border-green px-3 py-1 text-xs font-semibold text-green-deep hover:bg-green-soft"
                >
                  Entrar
                </Link>
                <Link
                  href="/criar-conta"
                  className="rounded-md border-2 border-green bg-green px-3 py-1 text-xs font-semibold text-on-green hover:brightness-95"
                >
                  Cadastrar
                </Link>
              </>
            )}
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-4 pb-8 pt-4">{children}</main>
      <footer className="mx-auto flex max-w-3xl items-center justify-between gap-3 border-t border-line px-4 pb-28 pt-4 text-xs text-muted">
        <span className="flex items-center gap-3">
          <span>rifa.br</span>
          <Link href="/ajuda" className="underline hover:text-ink">
            Ajuda
          </Link>
        </span>
        <TemaEscolha />
      </footer>
    </div>
  );
}

/** Ícone de cada seção do menu. A lista de seções vem da sessão; o desenho, daqui. */
const ICONE: Partial<Record<SectionKey, LucideIcon>> = {
  afiliadoPainel: LayoutDashboard,
  afiliadoLinks: Link2,
  afiliadoComissoes: Percent,
  afiliadoSaques: Banknote,
  cambistaVenda: ShoppingCart,
  cambistaVendas: ListOrdered,
  cambistaAcerto: HandCoins,
  adminPainel: LayoutDashboard,
  adminCampanhas: Ticket,
  adminPedidos: Receipt,
  adminAtendimento: MessagesSquare,
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

  // Chamado de reembolso tem prazo: o contador no menu é o aviso que o
  // organizador vê sem precisar abrir o Atendimento.
  const temAtendimento = Boolean(session?.sections.some((s) => s.key === "adminAtendimento"));
  const { data: pendentes } = useQuery<{ total: number }>({
    queryKey: ["/api/admin/chamados/pendentes"],
    enabled: temAtendimento,
    refetchInterval: 60_000,
  });
  const contador: Partial<Record<string, number>> = {
    adminAtendimento: pendentes?.total || undefined,
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
            className="px-1 font-display text-lg font-extrabold tracking-tight"
          >
            {aberto ? (
              <>
                rifa<span className="text-green">.</span>br
              </>
            ) : (
              <>
                r<span className="text-green">.</span>
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
