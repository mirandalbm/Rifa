import { Link, useParams } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { ShieldCheck } from "lucide-react";
import { PublicShell } from "@/components/AppShell";
import { Card, Money } from "@/components/bits";
import { PixParaPagar, PrazoDaReserva, SituacaoDoPedido } from "@/components/PixParaPagar";

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
 * bilhete — a compra continua sendo pedido a pedido. Tudo o que aparece
 * (valores, situação, prazo) vem do servidor.
 */
export default function CarrinhoPix() {
  const { codigo } = useParams<{ codigo: string }>();
  const { data, isError } = useQuery<CarrinhoView>({
    queryKey: [`/api/public/carrinho/pedidos/${codigo}`],
    refetchInterval: (q) => (q.state.data?.status === "pending" ? 4000 : false),
  });

  if (!data) {
    return (
      <PublicShell>
        <p className="py-20 text-center text-sm text-muted">{isError ? "Carrinho não encontrado." : "Carregando…"}</p>
      </PublicShell>
    );
  }

  const pendente = data.status === "pending";

  return (
    <PublicShell>
      <div className="space-y-3.5">
        <div className="flex items-baseline justify-between gap-3">
          <h1 className="min-w-0 font-display text-2xl font-extrabold">{pendente ? "Pague com Pix" : "Carrinho"}</h1>
          <span className="tnum shrink-0 font-mono text-xs text-muted">carrinho #{data.codigo}</span>
        </div>

        {pendente ? (
          <PrazoDaReserva expiresAt={data.expiresAt} />
        ) : data.status === "paid" && data.pedidos.every((p) => p.status === "refunded") ? (
          // A situação do carrinho é "paga" também quando todos os pedidos voltaram.
          <div className="rounded-lg bg-mist px-3 py-3 text-center text-sm text-ink-2">
            <p className="font-semibold text-ink">Pedidos estornados.</p>
            <p className="mt-1">O valor deste Pix voltou para a conta que pagou.</p>
          </div>
        ) : data.status === "paid" ? (
          <div className="rounded-lg bg-green-soft px-3 py-3 text-center text-sm text-green-deep">
            <p className="font-display text-lg font-bold">Pagamento confirmado!</p>
            <p className="mt-1">Os números de cada rifa estão no pedido dela, logo abaixo. Boa sorte.</p>
          </div>
        ) : (
          <div className="rounded-lg bg-mist px-3 py-3 text-center text-sm text-ink-2">
            <p className="font-semibold text-ink">A reserva venceu.</p>
            <p className="mt-1">Os números voltaram para as rifas. Não pague mais este Pix: se você já pagou, o valor volta para a conta que pagou.
              Monte o carrinho de novo.</p>
            <Link href="/" className="mt-2 inline-block min-h-6 font-semibold text-green-deep underline">
              Ver rifas no ar
            </Link>
          </div>
        )}

        {pendente && data.pix.copyPaste ? (
          <PixParaPagar
            qr={data.pix.qr}
            copyPaste={data.pix.copyPaste}
            amountCents={data.totalCents}
            expiresAt={data.expiresAt}
            pedidoParaSimular={data.pedidos[0]?.code}
          />
        ) : null}

        <Card title={pendente ? "Neste Pix" : `Rifas (${data.pedidos.length})`}>
          <ul className="divide-y divide-line px-4">
            {data.pedidos.map((p) => (
              <li key={p.code} className="flex items-center gap-3 py-3 text-sm">
                <Link href={`/pedido/${p.code}`} className="min-w-0 flex-1">
                  <span className="block font-medium leading-snug">
                    {p.rifa.titulo} · <span className="tnum">{p.quantity}</span> cota{p.quantity === 1 ? "" : "s"}
                  </span>
                  <span className="mt-0.5 block text-xs text-muted">
                    {p.organizacao.nome} · pedido <span className="tnum">#{p.code}</span>
                  </span>
                </Link>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  <Money cents={p.amountCents} className="font-medium" />
                  {/* No Pix ainda em aberto todos esperam juntos; depois, cada pedido diz a sua situação. */}
                  {pendente ? null : <SituacaoDoPedido status={p.status} />}
                </div>
              </li>
            ))}
          </ul>
          <div className="flex justify-between border-t border-line px-4 py-3 text-sm font-semibold">
            <span>{pendente ? "Total" : "Total do Pix"}</span>
            <Money cents={data.totalCents} className="text-green-deep" />
          </div>
        </Card>

        {pendente ? (
          <p className="flex items-start gap-2.5 rounded-lg bg-green-soft px-3 py-3 text-[13px] leading-5 text-green-deep">
            <ShieldCheck size={16} aria-hidden className="mt-0.5 shrink-0" />
            <span>
              O Pix é sempre da plataforma, nunca da organização. Assim que cair, os números de cada rifa aparecem no
              pedido dela e vão para o seu WhatsApp.
            </span>
          </p>
        ) : null}
      </div>
    </PublicShell>
  );
}
