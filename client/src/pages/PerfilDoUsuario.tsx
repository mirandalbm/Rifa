import { Link, useLocation } from "wouter";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
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
  Store,
  Ticket,
  UserPlus,
  UserRound,
  ShieldCheck,
  type LucideIcon,
} from "lucide-react";
import { PreferenciaDeCookies, PublicShell } from "@/components/AppShell";
import { usePendencias } from "@/components/Console";
import { FotoDoApostador } from "@/components/PerfilDoApostador";
import { FOTO_COMO_NO_INSTAGRAM } from "@/components/Seguir";
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
 * Os bilhetes como publicações privadas moram em `/perfil/bilhetes`.
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
  // O item "Bônus" só existe com o programa ligado pela plataforma (nasce desligado).
  const { data: bonus } = useQuery<{ ligado: boolean; saldo?: number }>({ queryKey: ["/api/public/bonus"], enabled: conta });
  const pendencias = usePendencias();
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
        <FotoDoApostador nome={perfil?.apelido ?? nome ?? "?"} foto={perfil?.foto ?? null} tamanho={FOTO_COMO_NO_INSTAGRAM} />
        <div className="min-w-0">
          <h1 className="truncate font-display text-xl font-extrabold">{nome ?? "Visitante"}</h1>
          {perfil?.apelido ? <p className="truncate text-sm text-muted">@{perfil.apelido}</p> : null}
          {!nome ? <p className="text-sm text-muted">Entre para comprar, comentar e acompanhar seus bilhetes.</p> : null}
        </div>
      </section>

      {pendencias.length ? (
        <section aria-label="Complete sua conta" className="mt-3 rounded-lg border border-green bg-green-soft p-3 text-sm">
          <p className="font-semibold text-green-deep">Complete sua conta</p>
          <ul className="mt-1 list-disc pl-5 text-ink-2">
            {pendencias.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
          <Link href="/minhas-compras?aba=conta" className="mt-2 inline-block font-semibold text-green-deep underline">
            Ir para Minha conta
          </Link>
        </section>
      ) : null}

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
        {sessao?.organizacao ? <Item href={`/o/${sessao.organizacao.slug}`} icone={Store} rotulo="Meu perfil público" detalhe={sessao.organizacao.nome} /> : null}
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
