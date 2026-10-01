import { useEffect, useId, useState } from "react";
import { Janela } from "@/components/Janela";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { X } from "lucide-react";
import { Cartelas } from "@/components/Cartelas";
import { avisoDaJuntada, juntarNoCarrinho, lerCarrinho } from "@/lib/carrinho";
import { CARTELA_MAX_NUMEROS, quantidadeNaFaixa } from "@shared/carrinho";
import { priceOrder, type PricingPackage } from "@shared/pricing";
import { formatBRL } from "@shared/format";

interface RifaDaJanela {
  campaign: { prizeTitle: string; totalQuotas: number; priceCents: number; minPerOrder: number; maxPerOrder: number };
  stats: { soldCount: number; reservedCount: number };
  packages: (PricingPackage & { highlight?: boolean })[];
}

/** Os tamanhos de bilhete que a janela oferece, além da quantidade que a pessoa digitar. */
export const TAMANHOS_DE_BILHETE = [5, 10, 25, 50] as const;

/**
 * A janela do "+": só os números. Os tamanhos 5, 10, 25 e 50 (ou uma
 * quantidade digitada) e as cartelas com números sorteados daquele tamanho —
 * a pessoa escolhe uma e ela vai para o carrinho. A cartela é sugestão: nada
 * fica reservado até pagar, e se alguém levar um número no meio o carrinho
 * sorteia outro na compra.
 */
export function EscolherBilhete({
  slug,
  aoFechar,
  aoAdicionar,
}: {
  slug: string;
  aoFechar: () => void;
  aoAdicionar: (quantidade: number) => void;
}) {
  const titulo = useId();
  const { data } = useQuery<RifaDaJanela>({ queryKey: [`/api/public/campaigns/${slug}`] });
  const [quantidade, setQuantidade] = useState(0);
  const [outra, setOutra] = useState("");
  const [cheio, setCheio] = useState(false);

  // Esc fecha, e a página de trás não rola enquanto a janela está aberta.
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => e.key === "Escape" && aoFechar();
    window.addEventListener("keydown", tecla);
    const antes = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", tecla);
      document.body.style.overflow = antes;
    };
  }, [aoFechar]);

  const c = data?.campaign;
  const restam = c && data ? c.totalQuotas - data.stats.soldCount - data.stats.reservedCount : 0;
  const min = c?.minPerOrder ?? 1;
  const max = c ? Math.max(min, Math.min(c.maxPerOrder, restam, CARTELA_MAX_NUMEROS)) : 1;
  const tamanhos = TAMANHOS_DE_BILHETE.filter((t) => t >= min && t <= max);

  // Abre já com um tamanho escolhido: o bloco de números aparece de cara.
  useEffect(() => {
    if (!c || quantidade) return;
    setQuantidade(tamanhos.includes(10) ? 10 : (tamanhos[0] ?? min));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [c]);

  function usarOutra() {
    const n = Number(outra);
    if (!Number.isInteger(n) || n < 1) return;
    setQuantidade(quantidadeNaFaixa(n, min, max));
  }

  return (
    <Janela onFechar={aoFechar} rotuloPor={titulo} largura="sm:max-w-lg" className="p-4">
      <header className="flex items-start gap-2">
        <h2 id={titulo} className="min-w-0 flex-1 font-display text-lg font-extrabold leading-tight">
          {c?.prizeTitle ?? "Escolha seus números"}
        </h2>
        <button type="button" onClick={aoFechar} aria-label="Fechar" className="rounded-md p-1 hover:bg-mist">
          <X size={22} aria-hidden />
        </button>
      </header>

      {!c ? (
        <p className="py-10 text-center text-sm text-muted">Carregando…</p>
      ) : (
        <>
          <p className="mt-1 text-xs text-muted">
            Escolha quantos números quer no bilhete e uma cartela. Os números só ficam seus ao pagar.
          </p>
          <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label="Quantidade de números">
            {tamanhos.map((t) => (
              <button
                key={t}
                type="button"
                aria-pressed={quantidade === t}
                onClick={() => setQuantidade(t)}
                className={`min-w-[64px] rounded-md border px-3 py-2 text-center ${
                  quantidade === t ? "border-green bg-green-soft" : "border-line-2 bg-white"
                }`}
              >
                <span className="tnum block text-sm font-bold">{t}</span>
                <span className="tnum block text-[10px] text-muted">
                  {formatBRL(priceOrder({ quantity: t, unitCents: c.priceCents, packages: data!.packages }).totalCents)}
                </span>
              </button>
            ))}
            <form
              className="flex items-stretch gap-1"
              onSubmit={(e) => {
                e.preventDefault();
                usarOutra();
              }}
            >
              <label htmlFor={`${titulo}-outra`} className="sr-only">
                Outra quantidade ({min} a {max})
              </label>
              <input
                id={`${titulo}-outra`}
                inputMode="numeric"
                placeholder="outra"
                value={outra}
                onChange={(e) => setOutra(e.target.value.replace(/\D/g, ""))}
                className="tnum w-20 rounded-md border border-line-2 bg-white px-2 text-sm"
              />
              <button type="submit" className="rounded-md border border-line-2 px-3 text-xs font-semibold hover:bg-mist">
                OK
              </button>
            </form>
          </div>
          {!tamanhos.includes(quantidade as (typeof TAMANHOS_DE_BILHETE)[number]) && quantidade ? (
            <p className="tnum mt-2 text-xs text-muted">
              Bilhete de {quantidade} números ·{" "}
              {formatBRL(priceOrder({ quantity: quantidade, unitCents: c.priceCents, packages: data!.packages }).totalCents)}
            </p>
          ) : null}

          {cheio ? (
            <p role="alert" className="mt-3 rounded-md bg-red-soft px-3 py-2 text-sm text-red">
              O carrinho já tem 20 rifas. <Link href="/carrinho" className="font-semibold underline">Abra o carrinho</Link> e
              pague ou tire alguma antes.
            </p>
          ) : null}

          {quantidade ? (
            <Cartelas
              slug={slug}
              quantidade={quantidade}
              totalQuotas={c.totalQuotas}
              unitCents={c.priceCents}
              packages={data!.packages}
              escolhida={null}
              pagando={false}
              trocarSinal={null}
              acao="carrinho"
              onPagar={() => {}}
              evitar={() => lerCarrinho().find((i) => i.slug === slug)?.numeros ?? []}
              onCarrinho={(numeros) => {
                // Soma à rifa no carrinho: dá para pôr vários bilhetes; a
                // janela fica aberta e a cartela adicionada dá lugar a outra.
                const r = juntarNoCarrinho(slug, numeros, c.maxPerOrder);
                if (!r.ok && r.motivo === "cheio") setCheio(true);
                if (r.ok) aoAdicionar(r.total);
                return avisoDaJuntada(r, c.maxPerOrder);
              }}
            />
          ) : null}
        </>
      )}
    </Janela>
  );
}
