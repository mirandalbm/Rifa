import { redirect } from "next/navigation";
import Link from "next/link";
import { exigirPerfil } from "@/lib/auth";

const abas = [
  { href: "/organizadora", rotulo: "Visão geral" },
  { href: "/organizadora/rifas", rotulo: "Rifas" },
  { href: "/organizadora/afiliados", rotulo: "Afiliados" },
  { href: "/organizadora/resultado", rotulo: "Resultado" },
];

export default async function LayoutOrganizadora({ children }: { children: React.ReactNode }) {
  const sessao = await exigirPerfil("ORGANIZADORA", "OPERADOR");
  if (!sessao) redirect("/entrar");

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-1">
        <nav className="flex flex-wrap gap-1">
          {abas.map((aba) => (
            <Link
              key={aba.href}
              href={aba.href}
              className="rounded-lg px-3 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-100 hover:text-marca-700"
            >
              {aba.rotulo}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-3 pb-1">
          <span className="text-sm text-slate-500">{sessao.nome}</span>
          <form action="/api/auth/logout" method="post">
            <button className="botao-secundario" type="submit">Sair</button>
          </form>
        </div>
      </div>

      {children}
    </div>
  );
}
