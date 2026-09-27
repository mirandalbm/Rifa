import { Link, useParams } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { PublicShell } from "@/components/AppShell";
import { Card, Money, Pill } from "@/components/bits";
import { PixParaPagar, useCountdown } from "@/components/PixParaPagar";
import { agruparPorOrganizacao } from "@shared/carrinho";

interface PedidoDoCarrinho {
  code: number;
  status: "pending" | "paid" | "expired" | "refunded";
  quantity: number;
  amountCents: number;
  rifa: { slug: string; titulo: string };
  organizacao: { slug: string; nome: string };
}

interface CarrinhoView {
  codigo: number;
  totalCents: number;
  expiresAt: string;
  status: "pending" | "paid" | "expired";
  pix: { qr: string | null; copyPaste: string | null };
  pedidos: PedidoDoCarrinho[];
}

/**
 * O Pix do carrinho: um só, para todas as rifas. Pergunta a cada 4 s até o
 * webhook chegar; pago, cada rifa mostra o seu pedido, com os números e o
 * bilhete — a compra continua sendo pedido a pedido.
 */
export default function CarrinhoPix() {
  const { codigo } = useParams<{ codigo: string }>();
  const { data, isError } = useQuery<CarrinhoView>({
    queryKey: [`/api/public/carrinho/pedidos/${codigo}`],
    refetchInterval: (q) => (q.state.data?.status === "pending" ? 4000 : false),
  });
  const countdown = useCountdown(data?.status === "pending" ? data.expiresAt : null);

  if (!data) {
    return (
      <PublicShell>
        <p className="py-20 text-center text-sm text-muted">{isError ? "Carrinho não encontrado." : "Carregando…"}</p>
      </PublicShell>
    );
  }

  const grupos = agruparPorOrganizacao(data.pedidos.map((p) => ({ ...p, organizacao: p.organizacao })));

  return (
    <PublicShell>
      <div className="flex items-center justify-between">
        <h1 className="font-display text-xl font-bold">Carrinho</h1>
        <span className="tnum text-xs text-muted">#{data.codigo}</span>
      </div>

      {data.status === "pending" ? (
        <div className="mt-3 rounded-md bg-yellow-soft px-3 py-2 text-center font-mono text-sm text-yellow-deep">
          reserva garantida por <b className="font-medium">{countdown.label}</b>
        </div>
      ) : data.status === "paid" ? (
        <div className="mt-3 rounded-md bg-green-soft px-3 py-3 text-center text-sm text-green-deep">
          <p className="font-display text-base font-bold">Pagamento confirmado!</p>
          <p className="mt-1">Os números de cada rifa estão no pedido dela, logo abaixo. Boa sorte.</p>
        </div>
      ) : (
        <div className="mt-3 rounded-md bg-red-soft px-3 py-3 text-center text-sm text-red">
          A reserva expirou e os números voltaram para as rifas. Monte o carrinho de novo.
        </div>
      )}

      {data.status === "pending" && data.pix.copyPaste ? (
        <PixParaPagar
          qr={data.pix.qr}
          copyPaste={data.pix.copyPaste}
          amountCents={data.totalCents}
          pedidoParaSimular={data.pedidos[0]?.code}
        />
      ) : null}

      <Card title={`Rifas (${data.pedidos.length})`}>
        <div className="divide-y divide-line">
          {grupos.map((g) => (
            <section key={g.slug} aria-label={g.itens[0].organizacao.nome} className="px-4 py-3">
              <p className="text-xs font-semibold text-muted">{g.itens[0].organizacao.nome}</p>
              <ul className="mt-1 space-y-2">
                {g.itens.map((p) => (
                  <li key={p.code} className="flex items-center gap-2 text-sm">
                    <Link href={`/pedido/${p.code}`} className="min-w-0 flex-1">
                      <span className="block truncate font-medium">{p.rifa.titulo}</span>
                      <span className="tnum text-xs text-muted">
                        {p.quantity} cota(s) · pedido #{p.code}
                      </span>
                    </Link>
                    <Money cents={p.amountCents} className="text-sm" />
                    <Pill status={p.status} />
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
        <div className="flex justify-between border-t border-line px-4 py-3 text-sm font-medium">
          <span>Total do Pix</span>
          <Money cents={data.totalCents} className="text-green-deep" />
        </div>
      </Card>
    </PublicShell>
  );
}
