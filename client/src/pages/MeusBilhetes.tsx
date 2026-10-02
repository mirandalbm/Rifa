import { Link } from "wouter";
import { ArrowLeft, Lock } from "lucide-react";
import { PublicShell } from "@/components/AppShell";
import { BilheteComoPublicacao, type BilheteDaConta } from "@/components/BilheteComoPublicacao";
import { Empty } from "@/components/bits";
import { useListaPaginada } from "@/lib/paginada";
import { useSession } from "@/lib/session";

/**
 * `/perfil/bilhetes`: os bilhetes de quem tem conta, como publicações
 * privadas — uma por compra paga, com a capa da rifa, o prêmio, a data e a
 * hora e os números. Só a própria pessoa vê (a sessão decide no servidor);
 * não há versão pública nem em `/u/<apelido>`. Dez por
 * vez: a página seguinte começa depois da última vista (`X-Proximo`).
 */
export default function MeusBilhetes() {
  const { data: sessao } = useSession();
  const conta = Boolean(sessao?.buyer?.conta);
  const lista = useListaPaginada<BilheteDaConta[]>("/api/public/conta/bilhetes");
  const bilhetes = lista.paginas.flat();

  return (
    <PublicShell>
      <div className="flex items-center gap-3 py-2">
        <Link href="/perfil" className="inline-flex min-h-6 items-center rounded-md p-1 hover:bg-mist" aria-label="Voltar ao perfil">
          <ArrowLeft size={20} aria-hidden />
        </Link>
        <div className="min-w-0">
          <h1 className="font-display text-xl font-extrabold">Meus bilhetes</h1>
          <p className="flex items-center gap-1 text-xs text-muted">
            <Lock size={12} aria-hidden /> Só você vê estes bilhetes
          </p>
        </div>
      </div>

      {!conta ? (
        <Empty>
          Os bilhetes ficam na sua conta.{" "}
          <Link href="/entrar?volta=%2Fperfil%2Fbilhetes" className="font-semibold text-green-deep underline">
            Entre ou crie uma conta
          </Link>{" "}
          para vê-los aqui, ou use <Link href="/minhas-cotas" className="font-semibold text-green-deep underline">Minhas cotas</Link> com o código do WhatsApp.
        </Empty>
      ) : lista.isLoading ? (
        <p className="py-8 text-center text-sm text-muted" role="status">
          Carregando bilhetes…
        </p>
      ) : lista.isError ? (
        <p className="py-8 text-center text-sm text-red" role="alert">
          Não foi possível carregar os bilhetes. Tente de novo em instantes.
        </p>
      ) : bilhetes.length === 0 ? (
        <Empty>
          Você ainda não tem bilhete pago. Quando comprar uma rifa, ele aparece aqui, com a data, a hora e os seus números.
        </Empty>
      ) : (
        <>
          <div className="mt-2 space-y-6">
            {bilhetes.map((b) => (
              <BilheteComoPublicacao key={b.id} bilhete={b} />
            ))}
          </div>
          {lista.hasNextPage ? (
            <div className="py-6 text-center">
              <button
                type="button"
                onClick={() => lista.fetchNextPage()}
                disabled={lista.isFetchingNextPage}
                className="inline-flex min-h-9 items-center rounded-md border-2 border-green px-4 text-sm font-semibold text-green-deep hover:bg-green-soft disabled:opacity-50"
              >
                {lista.isFetchingNextPage ? "Carregando…" : "Ver mais bilhetes"}
              </button>
            </div>
          ) : (
            <p className="py-6 text-center text-xs text-muted">
              <span className="tnum">{bilhetes.length}</span> {bilhetes.length === 1 ? "bilhete" : "bilhetes"} — é tudo
            </p>
          )}
        </>
      )}
    </PublicShell>
  );
}
