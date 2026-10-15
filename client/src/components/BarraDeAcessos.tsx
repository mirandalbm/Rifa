import { Link } from "wouter";
import { ArrowRight, Building2, Handshake, ShieldCheck, Store } from "lucide-react";

/**
 * O mapa dos acessos no topo do painel do master. Cada acesso é uma conta
 * com papel próprio: o master vê o painel da plataforma, e os outros
 * painéis entram com a conta de cada um. A barra diz o que cada acesso vê e
 * leva à lista onde esse acesso é criado e gerenciado. Só leitura — não troca
 * de conta.
 */
const ACESSOS = [
  {
    chave: "master",
    titulo: "Master",
    quem: "Administrador geral",
    ve: "Tudo: plataforma, organizações, cobrança e atendimento",
    href: "/admin",
    onde: "Você está aqui",
    Icone: ShieldCheck,
  },
  {
    chave: "organizador",
    titulo: "Organizador",
    quem: "Conta da organização",
    ve: "Só a organização dele: rifas, pedidos, afiliados e cobrança",
    href: "/admin/usuarios",
    onde: "Criar e gerenciar contas",
    Icone: Building2,
  },
  {
    chave: "afiliado",
    titulo: "Afiliado",
    quem: "Conta de afiliado",
    ve: "Meus links, comissões, saques e dados fiscais",
    href: "/admin/afiliados",
    onde: "Ver afiliados",
    Icone: Handshake,
  },
  {
    chave: "cambista",
    titulo: "Cambista",
    quem: "Conta criada pela organização",
    ve: "Nova venda, minhas vendas e meu acerto",
    href: "/admin/cambistas",
    onde: "Ver cambistas",
    Icone: Store,
  },
] as const;

export function BarraDeAcessos({ atual = "master" }: { atual?: (typeof ACESSOS)[number]["chave"] }) {
  return (
    <nav aria-label="Acessos da plataforma" className="mb-4 md:mb-6">
      <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {ACESSOS.map(({ chave, titulo, quem, ve, href, onde, Icone }) => {
          const aqui = chave === atual;
          return (
            <li key={chave}>
              <Link
                href={href}
                aria-current={aqui ? "page" : undefined}
                className={`cartao flex h-full items-start gap-3 rounded-xl border p-4 transition-colors hover:bg-mist ${
                  aqui ? "border-marca bg-green-soft" : "border-line bg-white"
                }`}
              >
                <span aria-hidden className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-mist text-ink">
                  <Icone size={18} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center justify-between gap-2">
                    <strong className="font-semibold text-ink">{titulo}</strong>
                    <span className="truncate text-xs text-ink-2">{quem}</span>
                  </span>
                  <span className="mt-1 block text-sm text-ink-2">{ve}</span>
                  <span className="mt-2 inline-flex items-center gap-1 text-sm font-semibold text-green-deep">
                    {onde}
                    {aqui ? null : <ArrowRight size={14} aria-hidden />}
                  </span>
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
