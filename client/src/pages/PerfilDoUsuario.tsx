import { Link, useLocation } from "wouter";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Bookmark,
  ChevronRight,
  HelpCircle,
  LayoutDashboard,
  LogIn,
  LogOut,
  ReceiptText,
  Store,
  Ticket,
  UserPlus,
  UserRound,
  type LucideIcon,
} from "lucide-react";
import { PreferenciaDeCookies, PublicShell } from "@/components/AppShell";
import { FotoDoApostador } from "@/components/PerfilDoApostador";
import { TemaEscolha } from "@/components/TemaToggle";
import { apiRequest } from "@/lib/queryClient";
import { useLogout, useSession } from "@/lib/session";
import { useTemplate } from "@/lib/template";

function Item({ href, icone: Icone, rotulo, detalhe }: { href: string; icone: LucideIcon; rotulo: string; detalhe?: string }) {
  return (
    <li>
      <Link href={href} className="flex items-center gap-3 px-1 py-3 hover:bg-mist">
        <Icone size={22} strokeWidth={1.75} aria-hidden className="shrink-0" />
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold">{rotulo}</span>
          {detalhe ? <span className="block text-xs text-muted">{detalhe}</span> : null}
        </span>
        <ChevronRight size={18} aria-hidden className="text-muted" />
      </Link>
    </li>
  );
}

/**
 * O botão de perfil do console: quem é você e o menu da conta — compras
 * (os bilhetes), reembolsos, conta, painel, ajuda, tema e cookies — e o
 * aviso de jogo responsável (o "18+" mora aqui, não mais numa faixa fixa).
 * A tela que mostra os bilhetes como publicações vem na etapa do perfil.
 */
export default function PerfilDoUsuario() {
  const qc = useQueryClient();
  const [, navegar] = useLocation();
  const { data: sessao } = useSession();
  const logout = useLogout();
  const t = useTemplate();
  const conta = Boolean(sessao?.buyer?.conta);
  const { data: perfil } = useQuery<{ foto: string | null; apelido: string | null; nomeReal: string }>({
    queryKey: ["/api/public/conta/perfil"],
    enabled: conta,
  });
  const nome = sessao?.user?.name ?? perfil?.nomeReal ?? sessao?.buyer?.name ?? null;

  async function sair() {
    if (sessao?.buyer) await apiRequest("POST", "/api/public/conta/sair").catch(() => {});
    if (sessao?.user) await logout.mutateAsync().catch(() => {});
    qc.invalidateQueries();
    navegar("/");
  }

  return (
    <PublicShell>
      <section className="flex items-center gap-4 py-2">
        <FotoDoApostador nome={perfil?.apelido ?? nome ?? "?"} foto={perfil?.foto ?? null} tamanho={72} />
        <div className="min-w-0">
          <h1 className="truncate font-display text-xl font-extrabold">{nome ?? "Visitante"}</h1>
          {perfil?.apelido ? <p className="truncate text-sm text-muted">@{perfil.apelido}</p> : null}
          {!nome ? <p className="text-sm text-muted">Entre para comprar, comentar e acompanhar seus bilhetes.</p> : null}
        </div>
      </section>

      <ul className="mt-4 divide-y divide-line border-y border-line">
        {!sessao?.user && !sessao?.buyer ? (
          <>
            <Item href="/entrar" icone={LogIn} rotulo="Entrar" />
            <Item href="/criar-conta" icone={UserPlus} rotulo="Criar conta" />
            <Item href="/minhas-cotas" icone={Ticket} rotulo="Ver meus bilhetes pelo WhatsApp" detalhe="Sem conta: com o código que chega no seu número" />
          </>
        ) : null}
        {sessao?.buyer ? (
          <>
            <Item href="/minhas-compras" icone={Ticket} rotulo="Meus bilhetes" detalhe="As rifas em que você está jogando" />
            {conta ? (
              <>
                <Item href="/minhas-compras?aba=reembolsos" icone={ReceiptText} rotulo="Reembolsos" />
                <Item href="/minhas-compras?aba=salvos" icone={Bookmark} rotulo="Salvos" />
                <Item href="/minhas-compras?aba=conta" icone={UserRound} rotulo="Minha conta" detalhe="Apelido, foto, senha e verificação" />
              </>
            ) : null}
          </>
        ) : null}
        {sessao?.user ? <Item href={sessao.home} icone={LayoutDashboard} rotulo="Meu painel" /> : null}
        {sessao?.organizacao ? <Item href={`/o/${sessao.organizacao.slug}`} icone={Store} rotulo="Meu perfil público" detalhe={sessao.organizacao.nome} /> : null}
        <Item href="/ajuda" icone={HelpCircle} rotulo="Central de ajuda" />
      </ul>

      <section className="mt-6 space-y-3">
        <div className="flex items-center justify-between gap-3">
          <span className="text-sm font-semibold">Tema</span>
          <TemaEscolha />
        </div>
        <PreferenciaDeCookies className="text-sm underline hover:text-ink" />
      </section>

      {sessao?.user || sessao?.buyer ? (
        <button type="button" onClick={sair} className="mt-6 flex items-center gap-2 text-sm font-semibold text-red">
          <LogOut size={18} aria-hidden />
          Sair
        </button>
      ) : null}

      <p className="mt-8 flex items-start gap-2 border-t border-line pt-4 text-xs text-muted">
        <span className="tnum shrink-0 rounded border border-line-2 px-1 font-semibold text-ink-2">18+</span>
        <span>{t.textos.jogoResponsavel}</span>
      </p>
      {/* A Solar pede crédito (CC BY 4.0); as outras duas vão junto. */}
      <p className="mt-3 text-[11px] text-muted">
        Ícones: Solar, de 480 Design (CC BY 4.0); Tabler e Iconoir (MIT).
      </p>
    </PublicShell>
  );
}
