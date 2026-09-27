import { useEffect, useState } from "react";
import { Link, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Minus, Plus, Trash2 } from "lucide-react";
import { PublicShell } from "@/components/AppShell";
import { Button, Money, Pill } from "@/components/bits";
import { FotoDoPerfil } from "@/components/Seguir";
import { SeloVerificado } from "@/components/SeloVerificado";
import { apiRequest } from "@/lib/queryClient";
import { porNoCarrinho, tirarDoCarrinho, useCarrinho } from "@/lib/carrinho";
import { agruparPorOrganizacao, quantidadeNaFaixa } from "@shared/carrinho";
import { formatBRL } from "@shared/format";

interface Item {
  slug: string;
  indisponivel: false;
  prizeTitle: string;
  priceCents: number;
  minPerOrder: number;
  maxPerOrder: number;
  quantidade: number;
  totalCents: number;
  vende: boolean;
  status: string;
  capa: { url: string; lqip?: string | null; role: string } | null;
  organizacao: { slug: string; nome: string; foto: string | null; verificada: boolean };
}
type Resposta = { itens: (Item | { slug: string; indisponivel: true })[] };

/**
 * O carrinho, separado por organização: cada promotora tem a própria
 * autorização, o próprio bilhete e o próprio Pix. O total de cada item é o
 * do servidor; aqui só se escolhe a quantidade. Comprar leva à rifa com a
 * compra rápida aberta naquele tamanho — a cota só é tomada ao pagar.
 */
export default function Carrinho() {
  const itens = useCarrinho();
  const [, navegar] = useLocation();
  const { data, isLoading } = useQuery<Resposta>({
    queryKey: ["/api/public/carrinho", itens],
    queryFn: async () => (await apiRequest("POST", "/api/public/carrinho", { itens })).json(),
    enabled: itens.length > 0,
    placeholderData: (antes) => antes,
  });

  // Rifa que saiu do ar (ou de promotora arquivada) sai do carrinho sozinha.
  useEffect(() => {
    data?.itens.forEach((i) => {
      if (i.indisponivel) tirarDoCarrinho(i.slug);
    });
  }, [data]);

  const validos = (data?.itens ?? []).filter((i): i is Item => !i.indisponivel && itens.some((x) => x.slug === i.slug));
  const grupos = agruparPorOrganizacao(validos);
  const aVenda = validos.filter((i) => i.vende);
  const total = aVenda.reduce((s, i) => s + i.totalCents, 0);

  return (
    <PublicShell>
      <h1 className="font-display text-xl font-extrabold">Carrinho</h1>
      {itens.length === 0 ? (
        <div className="mt-8 text-center">
          <p className="text-sm text-muted">Seu carrinho está vazio.</p>
          <Link href="/" className="mt-3 inline-block text-sm font-semibold text-green-deep underline">
            Ver rifas no ar
          </Link>
        </div>
      ) : isLoading && !data ? (
        <p className="py-10 text-center text-sm text-muted">Carregando…</p>
      ) : (
        <>
          <p className="mt-1 text-xs text-muted">
            Cada rifa é paga no Pix dela, com a autorização e o bilhete da promotora. Os números só ficam seus ao pagar.
          </p>
          <div className="mt-4 space-y-5">
            {grupos.map((g) => {
              const org = g.itens[0].organizacao;
              const subtotal = g.itens.filter((i) => i.vende).reduce((s, i) => s + i.totalCents, 0);
              return (
                <section key={g.slug} aria-label={org.nome} className="rounded-xl border border-line">
                  <header className="flex items-center gap-2 border-b border-line px-3 py-2">
                    <Link href={`/o/${org.slug}`} className="flex min-w-0 flex-1 items-center gap-2">
                      <FotoDoPerfil nome={org.nome} foto={org.foto} tamanho={28} />
                      <span className="truncate text-sm font-semibold">{org.nome}</span>
                      {org.verificada ? <SeloVerificado sujeito="organizacao" tamanho={14} /> : null}
                    </Link>
                    <Money cents={subtotal} className="text-sm text-green-deep" />
                  </header>
                  <ul className="divide-y divide-line">
                    {g.itens.map((i) => (
                      <ItemDoCarrinho key={i.slug} item={i} aoComprar={() => navegar(`/o/${org.slug}/r/${i.slug}?pacote=${i.quantidade}`)} />
                    ))}
                  </ul>
                </section>
              );
            })}
          </div>
          <div className="mt-5 flex items-baseline justify-between border-t border-line pt-3">
            <span className="text-sm">
              Total de <span className="tnum">{aVenda.length}</span> rifa{aVenda.length === 1 ? "" : "s"}
            </span>
            <Money cents={total} className="text-lg font-bold text-green-deep" />
          </div>
        </>
      )}
    </PublicShell>
  );
}

function ItemDoCarrinho({ item: i, aoComprar }: { item: Item; aoComprar: () => void }) {
  const [texto, setTexto] = useState(String(i.quantidade));
  useEffect(() => setTexto(String(i.quantidade)), [i.quantidade]);
  const mudar = (q: number) => porNoCarrinho(i.slug, quantidadeNaFaixa(q, i.minPerOrder, i.maxPerOrder));

  return (
    <li className="flex gap-3 p-3">
      <Link href={`/o/${i.organizacao.slug}/r/${i.slug}`} className="h-20 w-16 shrink-0 overflow-hidden rounded-md bg-mist">
        {i.capa && i.capa.role !== "video" ? <img src={i.capa.url} alt="" className="h-full w-full object-cover" /> : null}
      </Link>
      <div className="min-w-0 flex-1">
        <div className="flex items-start gap-2">
          <Link href={`/o/${i.organizacao.slug}/r/${i.slug}`} className="min-w-0 flex-1 text-sm font-semibold leading-tight">
            {i.prizeTitle}
          </Link>
          <button
            type="button"
            onClick={() => tirarDoCarrinho(i.slug)}
            aria-label={`Tirar ${i.prizeTitle} do carrinho`}
            className="rounded-md p-1 text-muted hover:bg-mist hover:text-ink"
          >
            <Trash2 size={16} aria-hidden />
          </button>
        </div>
        <p className="mt-0.5 text-xs text-muted">
          <span className="tnum">{formatBRL(i.priceCents)}</span> por cota
        </p>
        {i.vende ? (
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <div className="flex items-center rounded-md border border-line-2">
              <button
                type="button"
                aria-label="Menos cotas"
                disabled={i.quantidade <= i.minPerOrder}
                onClick={() => mudar(i.quantidade - 1)}
                className="p-1.5 disabled:opacity-40"
              >
                <Minus size={14} aria-hidden />
              </button>
              <input
                aria-label={`Cotas de ${i.prizeTitle}`}
                inputMode="numeric"
                value={texto}
                onChange={(e) => setTexto(e.target.value.replace(/\D/g, ""))}
                onBlur={() => mudar(Number(texto))}
                onKeyDown={(e) => {
                  if (e.key === "Enter") mudar(Number(texto));
                }}
                className="tnum w-14 border-x border-line-2 bg-white py-1 text-center text-sm"
              />
              <button
                type="button"
                aria-label="Mais cotas"
                disabled={i.quantidade >= i.maxPerOrder}
                onClick={() => mudar(i.quantidade + 1)}
                className="p-1.5 disabled:opacity-40"
              >
                <Plus size={14} aria-hidden />
              </button>
            </div>
            <Money cents={i.totalCents} className="text-sm text-green-deep" />
            <Button className="ml-auto px-3 py-1.5 text-xs" onClick={aoComprar}>
              Comprar
            </Button>
          </div>
        ) : (
          <div className="mt-2">
            <Pill status="closed">{i.status === "published" ? "Sem venda no momento" : "Vendas encerradas"}</Pill>
          </div>
        )}
      </div>
    </li>
  );
}
