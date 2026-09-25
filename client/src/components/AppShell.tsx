import { Link, useLocation } from "wouter";
import type { ReactNode } from "react";
import { useSession, useLogout } from "@/lib/session";

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
            <Link href="/minhas-cotas" className="text-ink-2 hover:text-green-deep">
              Minhas cotas
            </Link>
            {session?.role === "admin" || session?.role === "affiliate" ? (
              <Link
                href={session.home}
                className="rounded-md bg-green-soft px-2 py-1 text-xs font-medium text-green-deep"
              >
                Meu painel
              </Link>
            ) : null}
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-4 pb-24 pt-4">{children}</main>
    </div>
  );
}

/** Casca dos painéis. O menu vem da sessão — não há lista fixa no cliente. */
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

  return (
    <div className="min-h-screen bg-white md:grid md:grid-cols-[220px_1fr]">
      <aside className="border-b border-line bg-mist p-3 md:border-b-0 md:border-r">
        <Link
          href="/"
          className="block px-2 pb-4 pt-1 font-display text-lg font-extrabold tracking-tight"
        >
          rifa<span className="text-green">.</span>br
        </Link>
        <nav className="flex flex-wrap gap-1 md:flex-col">
          {session?.sections.map((s) => {
            const active = location === s.path;
            return (
              <Link
                key={s.key}
                href={s.path}
                className={
                  active
                    ? "rounded-md bg-green px-3 py-2 text-sm font-semibold text-on-green"
                    : "rounded-md px-3 py-2 text-sm text-ink-2 hover:bg-mist-2"
                }
              >
                {s.label}
              </Link>
            );
          })}
        </nav>
        <div className="mt-6 px-2 text-[11px] text-muted">
          <p className="font-mono">{session?.user?.name}</p>
          <div className="mt-1 flex gap-3">
            <Link href="/conta/senha" className="text-green-deep underline">
              trocar senha
            </Link>
            <button
              type="button"
              onClick={() => logout.mutate()}
              className="text-green-deep underline"
            >
              sair
            </button>
          </div>
        </div>
      </aside>

      <div className="min-w-0">
        <header className="border-b border-line px-5 py-4">
          <h1 className="font-display text-xl font-bold">{title}</h1>
        </header>
        <main className="px-5 py-5">{children}</main>
      </div>
    </div>
  );
}
