import { Link, useLocation } from "wouter";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  Bookmark,
  FileText,
  Gift,
  ChevronRight,
  HelpCircle,
  LayoutDashboard,
  LogIn,
  LogOut,
  Lock,
  ReceiptText,
  Ticket,
  UserPlus,
  UserRound,
  ShieldCheck,
  type LucideIcon,
} from "lucide-react";
import { PreferenciaDeCookies, PublicShell } from "@/components/AppShell";
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
 * As configurações do perfil (`/perfil/configuracoes`), atrás da engrenagem
 * do perfil — como no Instagram: o menu da conta (compras, reembolsos,
 * conta, painel, ajuda, termos e privacidade), o tema, os cookies e o aviso
 * de jogo responsável (o "18+" mora aqui). O perfil em si é `/perfil`.
 */
export default function Configuracoes() {
  const qc = useQueryClient();
  const [, navegar] = useLocation();
  const { data: sessao } = useSession();
  const logout = useLogout();
  const t = useTemplate();
  const conta = Boolean(sessao?.buyer?.conta);
  // O item "Bônus" só existe com o programa ligado pela plataforma (nasce desligado).
  const { data: bonus } = useQuery<{ ligado: boolean; saldo?: number }>({ queryKey: ["/api/public/bonus"], enabled: conta });

  async function sair() {
    if (sessao?.buyer) await apiRequest("POST", "/api/public/conta/sair").catch(() => {});
    if (sessao?.user) await logout.mutateAsync().catch(() => {});
    qc.invalidateQueries();
    navegar("/");
  }

  return (
    <PublicShell>
      <div className="flex items-center gap-3 py-2">
        <Link href="/perfil" className="inline-flex min-h-6 items-center rounded-md p-1 hover:bg-mist" aria-label="Voltar ao perfil">
          <ArrowLeft size={20} aria-hidden />
        </Link>
        <h1 className="font-display text-xl font-extrabold">Configurações</h1>
      </div>

      <ul className="mt-2 divide-y divide-line border-y border-line">
        {!sessao?.user && !sessao?.buyer ? (
          <>
            <Item href="/entrar" icone={LogIn} rotulo="Entrar" />
            <Item href="/criar-conta" icone={UserPlus} rotulo="Criar conta" />
            <Item href="/minhas-cotas" icone={Ticket} rotulo="Ver meus bilhetes pelo WhatsApp" detalhe="Sem conta: com o código que chega no seu número" />
          </>
        ) : null}
        {sessao?.buyer ? (
          <>
            <Item href="/minhas-compras" icone={Ticket} rotulo="Minhas compras" detalhe="As rifas em que você está jogando" />
            {conta ? (
              <>
                <Item href="/perfil/bilhetes" icone={Lock} rotulo="Meus bilhetes privados" detalhe="Cada compra como publicação, só para você" />
                {bonus?.ligado ? (
                  <Item
                    href="/minhas-compras?aba=bonus"
                    icone={Gift}
                    rotulo="Bônus"
                    detalhe={bonus.saldo ? `${bonus.saldo} cota(s) de bônus` : "Metas, indicação e cotas grátis"}
                  />
                ) : null}
                <Item href="/minhas-compras?aba=reembolsos" icone={ReceiptText} rotulo="Reembolsos" />
                <Item href="/minhas-compras?aba=salvos" icone={Bookmark} rotulo="Salvos" />
                <Item href="/minhas-compras?aba=conta" icone={UserRound} rotulo="Minha conta" detalhe="Apelido, foto, senha e verificação" />
              </>
            ) : null}
          </>
        ) : null}
        {sessao?.user ? <Item href={sessao.home} icone={LayoutDashboard} rotulo="Meu painel" /> : null}
                <Item href="/ajuda" icone={HelpCircle} rotulo="Central de ajuda" />
        <Item href="/termos" icone={FileText} rotulo="Termos de uso" />
        <Item href="/privacidade" icone={ShieldCheck} rotulo="Política de privacidade" detalhe="Que dados guardamos, para quê, e os seus direitos" />
      </ul>

      <section className="mt-6 space-y-3">
        <div className="flex items-center justify-between gap-3">
          <span className="text-sm font-semibold">Tema</span>
          <TemaEscolha />
        </div>
        <PreferenciaDeCookies className="text-sm underline hover:text-ink" />
      </section>

      {sessao?.user || sessao?.buyer ? (
        <button type="button" onClick={sair} className="mt-6 flex min-h-6 items-center gap-2 text-sm font-semibold text-red">
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
