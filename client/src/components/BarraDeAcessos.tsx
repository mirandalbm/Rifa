import { Link } from "wouter";
import { ArrowRight, Inbox, Megaphone, MessageCircle, Palette, Ticket, Users, Wallet } from "lucide-react";

/**
 * As áreas do menu do master, em atalho no topo do Painel. Cada cartão leva à
 * tela de entrada da área, com as mesmas áreas do menu lateral (`MENUS` em
 * `shared/access.ts`). Só navegação: não mostra dado nem troca de conta.
 */
const AREAS = [
  {
    titulo: "Canal de atendimento",
    descricao: "Chamados, denúncias e verificações que esperam decisão",
    href: "/admin/atendimento",
    Icone: MessageCircle,
  },
  {
    titulo: "Caixa de entrada",
    descricao: "Tudo o que espera a plataforma, numa lista só",
    href: "/admin/caixa",
    Icone: Inbox,
  },
  {
    titulo: "Financeiro",
    descricao: "Vendas, repasses, cobrança e saldo da plataforma",
    href: "/admin/financeiro",
    Icone: Wallet,
  },
  {
    titulo: "Rifas",
    descricao: "Rifas, sorteios, sorteios oficiais e stories",
    href: "/admin/campanhas",
    Icone: Ticket,
  },
  {
    titulo: "Pessoas",
    descricao: "Organizações, usuários, afiliados e cambistas",
    href: "/admin/organizacoes",
    Icone: Users,
  },
  {
    titulo: "Marketing",
    descricao: "Tráfego pago, publicidade, banners e Marketing AI",
    href: "/admin/marketing/trafego",
    Icone: Megaphone,
  },
  {
    titulo: "Plataforma",
    descricao: "Aparência, configurações e regras do app",
    href: "/admin/aparencia",
    Icone: Palette,
  },
] as const;

export function BarraDeAcessos() {
  return (
    <nav aria-label="Áreas da plataforma" className="mb-4 md:mb-6">
      <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {AREAS.map(({ titulo, descricao, href, Icone }) => (
          <li key={titulo}>
            <Link
              href={href}
              className="cartao flex h-full items-start gap-3 rounded-xl border border-line bg-white p-4 transition-colors hover:bg-mist"
            >
              <span aria-hidden className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-mist text-ink">
                <Icone size={18} />
              </span>
              <span className="min-w-0 flex-1">
                <strong className="block font-semibold text-ink">{titulo}</strong>
                <span className="mt-1 block text-sm text-ink-2">{descricao}</span>
                <span className="mt-2 inline-flex items-center gap-1 text-sm font-semibold text-green-deep">
                  Abrir
                  <ArrowRight size={14} aria-hidden />
                </span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
