import { useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { formatBRL, formatQuota } from "@shared/format";
import { priceOrder, type PricingPackage } from "@shared/pricing";

/** Quantas cartelas aparecem por pacote. */
export const CARTELAS_NA_TELA = 3;

async function buscar(slug: string, quantidade: number, cartelas: number): Promise<number[][]> {
  const res = await apiRequest(
    "GET",
    `/api/public/campaigns/${slug}/cartelas?quantidade=${quantidade}&cartelas=${cartelas}`,
  );
  return ((await res.json()) as { cartelas: number[][] }).cartelas;
}

/**
 * Compra rápida em cartelas: cada pacote (5, 10, 25, 50) vira algumas
 * cartelas com os números já sorteados, para o comprador ver antes de pagar
 * e trocar os que não gostar. A cartela é só sugestão — nada fica reservado
 * até o pagamento, e a compra passa pela mesma reserva de sempre.
 */
export function Cartelas({
  slug,
  quantidade,
  totalQuotas,
  unitCents,
  packages,
  escolhida,
  pagando,
  onPagar,
  trocarSinal,
  acao = "pagar",
}: {
  slug: string;
  quantidade: number;
  totalQuotas: number;
  unitCents: number;
  packages: PricingPackage[];
  /** Números da cartela que está indo para o pagamento (para marcar o cartão). */
  escolhida: number[] | null;
  pagando: boolean;
  onPagar: (numeros: number[]) => void;
  /** Muda quando a compra de uma cartela falhou por número levado: troca aquela. */
  trocarSinal: { numeros: number[]; vez: number } | null;
  /** O que o botão da cartela faz: pagar agora ou pôr no carrinho (janela do "+"). */
  acao?: "pagar" | "carrinho";
}) {
  const [cartelas, setCartelas] = useState<number[][] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [trocando, setTrocando] = useState<number | null>(null);

  useEffect(() => {
    let vivo = true;
    setCartelas(null);
    setErro(null);
    buscar(slug, quantidade, CARTELAS_NA_TELA)
      .then((c) => vivo && setCartelas(c))
      .catch((e: Error) => vivo && setErro(e.message));
    return () => {
      vivo = false;
    };
  }, [slug, quantidade]);

  async function trocar(i: number) {
    setTrocando(i);
    try {
      const [nova] = await buscar(slug, quantidade, 1);
      if (nova) setCartelas((atual) => (atual ? atual.map((c, j) => (j === i ? nova : c)) : atual));
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setTrocando(null);
    }
  }

  // Compra recusada porque alguém levou um número: a cartela é trocada sozinha.
  useEffect(() => {
    if (!trocarSinal || !cartelas) return;
    const i = cartelas.findIndex((c) => c.join() === trocarSinal.numeros.join());
    if (i >= 0) void trocar(i);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trocarSinal?.vez]);

  const preco = priceOrder({ quantity: quantidade, unitCents, packages });

  if (erro) return <p className="mt-3 rounded-md bg-red-soft px-3 py-2 text-sm text-red">{erro}</p>;
  if (!cartelas) return <p className="mt-3 py-4 text-center text-sm text-muted">Sorteando suas cartelas…</p>;
  if (cartelas.length === 0) {
    return <p className="mt-3 py-4 text-center text-sm text-muted">Não há números livres suficientes para este pacote.</p>;
  }

  return (
    <section aria-label={`Cartelas de ${quantidade} números`} className="mt-3 grid gap-3 sm:grid-cols-2">
      {cartelas.map((numeros, i) => {
        const marcada = escolhida?.join() === numeros.join();
        return (
          <article
            key={i}
            className={`rounded-xl border bg-white p-3 ${marcada ? "border-2 border-green" : "border-line"}`}
          >
            <header className="flex items-baseline justify-between">
              <h3 className="font-display text-sm font-bold">Cartela {i + 1}</h3>
              <span className="tnum text-xs text-muted">{quantidade} números</span>
            </header>
            <ul className="mt-2 flex flex-wrap gap-1" aria-label="Números da cartela">
              {numeros.map((n) => (
                <li
                  key={n}
                  className="tnum fundo-numero rounded-md px-1.5 py-0.5 text-xs font-bold"
                >
                  {formatQuota(n, totalQuotas)}
                </li>
              ))}
            </ul>
            <div className="mt-3 grid grid-cols-[auto_1fr] gap-2">
              <button
                type="button"
                onClick={() => void trocar(i)}
                disabled={trocando === i || pagando}
                className="flex items-center gap-1 rounded-md border border-line-2 px-3 py-2 text-xs font-semibold hover:bg-mist disabled:opacity-60"
              >
                <RefreshCw size={13} aria-hidden className={trocando === i ? "animate-spin" : ""} />
                Trocar números
              </button>
              <button
                type="button"
                onClick={() => onPagar(numeros)}
                disabled={trocando === i || pagando}
                className="rounded-md bg-green px-3 py-2 text-sm font-semibold text-on-green disabled:opacity-60"
              >
                {acao === "carrinho" ? (
                  <>
                    Pôr no carrinho · <span className="tnum">{formatBRL(preco.totalCents)}</span>
                  </>
                ) : pagando && marcada ? (
                  "Reservando…"
                ) : (
                  <>
                    Pagar <span className="tnum">{formatBRL(preco.totalCents)}</span>
                  </>
                )}
              </button>
            </div>
          </article>
        );
      })}
    </section>
  );
}
