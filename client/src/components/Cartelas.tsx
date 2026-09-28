import { useEffect, useState } from "react";
import { Link } from "wouter";
import { IconeMais, IconeTrocar } from "@/components/Icones";
import { apiRequest } from "@/lib/queryClient";
import { formatBRL, formatQuota, quotaDigits } from "@shared/format";
import { corDaCasa, letraDoQuadro } from "@/lib/quadro";
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
  onCarrinho,
  evitar,
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
  /**
   * Põe a cartela no carrinho (junta à rifa: dá para pôr várias). Com
   * pagar agora, é o ícone ao lado do Pagar; na janela do "+", é o botão
   * "Adicionar". Devolve o aviso; deu certo, a cartela sai da tela e
   * outra, sorteada, entra no lugar.
   */
  onCarrinho?: (numeros: number[]) => { ok: boolean; texto: string; trocar?: boolean };
  /** Números que a cartela sorteada no lugar deve evitar (os que já estão no carrinho). */
  evitar?: () => number[];
}) {
  const [cartelas, setCartelas] = useState<number[][] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [trocando, setTrocando] = useState<number | null>(null);
  const [aviso, setAviso] = useState<{ i: number; ok: boolean; texto: string } | null>(null);

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
      // Até três tentativas de uma cartela sem número que já está no carrinho.
      // Também os das outras cartelas da tela: cartelas não repetem número entre si.
      const outras = (cartelas ?? []).filter((_, j) => j !== i).flat();
      const fora = new Set([...(evitar?.() ?? []), ...outras]);
      let [nova] = await buscar(slug, quantidade, 1);
      for (let t = 0; t < 2 && nova?.some((n) => fora.has(n)); t++) [nova] = await buscar(slug, quantidade, 1);
      if (nova) setCartelas((atual) => (atual ? atual.map((c, j) => (j === i ? nova : c)) : atual));
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setTrocando(null);
    }
  }

  /** Põe no carrinho; deu certo, a cartela sai e outra entra no lugar. */
  function adicionar(i: number, numeros: number[]) {
    if (!onCarrinho) return;
    const r = onCarrinho(numeros);
    setAviso({ i, ...r });
    if (r.ok || r.trocar) void trocar(i);
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
    <section aria-label={`Cartelas de ${quantidade} números`} className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
      {cartelas.map((numeros, i) => {
        const marcada = escolhida?.join() === numeros.join();
        return (
          <article
            key={i}
            className={`rounded-xl border bg-white p-3 ${marcada ? "border-2 border-green" : "border-line"}`}
          >
            <header className="flex items-baseline justify-between">
              <h3 className="font-display text-sm font-bold">
                Cartela <span className="tnum">{i + 1}</span>
              </h3>
              <span className="tnum text-xs text-muted">{quantidade} números</span>
            </header>
            {/* O mesmo quadriculado do mapa: casas quadradas, azul e verde ao acaso. */}
            <ul className="mt-2 grid grid-cols-5 gap-1.5" aria-label="Números da cartela">
              {numeros.map((n) => (
                <li
                  key={n}
                  className={`tnum quadro ${letraDoQuadro(quotaDigits(totalQuotas))} ${corDaCasa(n)}`}
                >
                  {formatQuota(n, totalQuotas)}
                </li>
              ))}
            </ul>
            {/* Numa linha só: trocar (só o ícone), o carrinho e o pagar, maior, no canto. */}
            <div className="mt-3 flex items-center gap-2">
              <button
                type="button"
                onClick={() => void trocar(i)}
                disabled={trocando === i || pagando}
                aria-label={`Trocar os números da cartela ${i + 1}`}
                title="Trocar números"
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md border border-line-2 hover:bg-mist disabled:opacity-60"
              >
                <IconeTrocar girando={trocando === i} />
              </button>
              {onCarrinho && acao === "pagar" ? (
                <button
                  type="button"
                  onClick={() => adicionar(i, numeros)}
                  disabled={trocando === i || pagando}
                  aria-label={`Pôr a cartela ${i + 1} no carrinho`}
                  title="Pôr no carrinho"
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md border border-line-2 hover:bg-mist disabled:opacity-60"
                >
                  <IconeMais tamanho={24} />
                </button>
              ) : null}
              <button
                type="button"
                onClick={() => (acao === "carrinho" && onCarrinho ? adicionar(i, numeros) : onPagar(numeros))}
                disabled={trocando === i || pagando}
                className="h-11 min-w-0 flex-1 rounded-md bg-green px-3 text-base font-bold text-on-green disabled:opacity-60"
              >
                {acao === "carrinho" ? (
                  <>
                    Adicionar · <span className="tnum">{formatBRL(preco.totalCents)}</span>
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
            {aviso?.i === i ? (
              <p role="status" className={`mt-2 text-xs ${aviso.ok ? "text-green-deep" : "text-red"}`}>
                {aviso.texto}{" "}
                {aviso.ok ? (
                  <Link href="/carrinho" className="font-semibold underline">
                    Ver carrinho
                  </Link>
                ) : null}
              </p>
            ) : null}
          </article>
        );
      })}
    </section>
  );
}
