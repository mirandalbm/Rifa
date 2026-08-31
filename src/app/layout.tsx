import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "Rifa Solidária",
  description: "Rifa beneficente — compre seu número e ajude a nossa causa.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>
        <header className="border-b border-slate-200 bg-white">
          <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-4">
            <Link href="/" className="text-lg font-bold text-marca-700">
              Rifa Solidária
            </Link>
            <nav className="flex gap-4 text-sm">
              <Link href="/meus-numeros" className="text-slate-600 hover:text-marca-700">
                Meus números
              </Link>
              <Link href="/resultado" className="text-slate-600 hover:text-marca-700">
                Resultado
              </Link>
              <Link href="/entrar" className="text-slate-600 hover:text-marca-700">
                Entrar
              </Link>
            </nav>
          </div>
        </header>

        <main className="mx-auto max-w-5xl px-4 py-8">{children}</main>

        <footer className="mt-12 border-t border-slate-200 bg-white py-6">
          <div className="mx-auto max-w-5xl px-4 text-sm text-slate-500">
            Rifa beneficente. O sorteio é feito com base no 1º prêmio da Loteria Federal e pode ser
            conferido publicamente no site da Caixa Econômica Federal.
          </div>
        </footer>
      </body>
    </html>
  );
}
