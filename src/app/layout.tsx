import type { Metadata } from "next";
import Link from "next/link";
import { lerSessaoApostador } from "@/lib/auth";
import "./globals.css";

export const metadata: Metadata = {
  title: "Rifa Solidária",
  description: "Rifa beneficente — compre seu número e ajude a nossa causa.",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // O menu muda com quem está olhando: "Entrar" levava ao login da equipe, e um
  // comprador que clicasse ali caía numa tela que não é dele.
  const apostador = await lerSessaoApostador();

  return (
    <html lang="pt-BR">
      <body>
        <header className="border-b border-slate-200 bg-white">
          <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-4">
            <Link href="/" className="text-lg font-bold text-marca-700">
              Rifa Solidária
            </Link>
            <nav className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
              <Link href="/resultado" className="text-slate-600 hover:text-marca-700">
                Resultado
              </Link>
              <Link href="/meus-numeros" className="text-slate-600 hover:text-marca-700">
                Consultar por código
              </Link>

              {apostador ? (
                <Link href="/minha-conta" className="font-medium text-marca-700 hover:underline">
                  Minha conta
                </Link>
              ) : (
                <Link href="/apostador" className="font-medium text-marca-700 hover:underline">
                  Entrar
                </Link>
              )}
            </nav>
          </div>
        </header>

        <main className="mx-auto max-w-5xl px-4 py-8">{children}</main>

        <footer className="mt-12 border-t border-slate-200 bg-white py-6">
          <div className="mx-auto max-w-5xl px-4 text-sm text-slate-500">
            <p>
              Rifa beneficente. O sorteio é feito com base no 1º prêmio da Loteria Federal e pode ser
              conferido publicamente no site da Caixa Econômica Federal.
            </p>
            {/* Acesso da equipe fica no rodapé: é de uso interno, e no topo
                competia com o "Entrar" do comprador. */}
            <p className="mt-2">
              <Link href="/entrar" className="text-slate-400 hover:text-marca-700">
                Acesso da organização
              </Link>
            </p>
          </div>
        </footer>
      </body>
    </html>
  );
}
