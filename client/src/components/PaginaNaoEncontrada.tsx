import { Link } from "wouter";

/**
 * A página do 404 (tela 26). Rota que não existe, rifa em rascunho pelo
 * endereço público e o dado do vizinho respondem igual: a mesma página, sem
 * dizer se o endereço existia — "existe, mas não é sua" já entregaria que o
 * endereço é válido. Sem casca, a mensagem no centro e a volta para a vitrine,
 * nas três larguras.
 */
export function PaginaNaoEncontrada() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-[416px] flex-col items-center justify-center gap-2 px-4 text-center">
      <h1 className="font-display text-2xl font-extrabold">Página não encontrada</h1>
      <Link href="/" className="inline-flex min-h-6 items-center text-[13px] text-green-deep underline">
        voltar para as rifas
      </Link>
    </main>
  );
}
