import { useEffect } from "react";
import { Link, useParams } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { PublicShell } from "@/components/AppShell";
import { Button, Card, Money, Pill } from "@/components/bits";
import { formatQuota } from "@shared/format";
import { PixParaPagar, useCountdown } from "@/components/PixParaPagar";
import { printTicket } from "@/lib/pos";
import { compraJaContada, definirOrganizacaoDaPagina } from "@/lib/marketing";
import { useRastreio } from "@/components/Marketing";
import { idDoEventoDeCompra } from "@shared/marketing";

interface OrderView {
  code: number;
  status: "pending" | "paid" | "expired" | "refunded";
  quantity: number;
  amountCents: number;
  discountCents: number;
  expiresAt: string | null;
  paidAt: string | null;
  numbers: number[];
  prizes: { number: number; label: string }[];
  pix: { qr: string | null; copyPaste: string | null };
  campaign: { id: string; title: string; slug: string; totalQuotas: number };
  organizacao: string | null;
  buyer: { name: string };
  /** Pedido do carrinho num Pix só: o Pix é o do carrinho inteiro. */
  carrinho: { codigo: number; totalCents: number } | null;
}

export default function Pedido() {
  const { code } = useParams<{ code: string }>();

  const { data: order } = useQuery<OrderView>({
    queryKey: [`/api/public/orders/${code}`],
    // Enquanto pendente, pergunta a cada 4 s até o webhook chegar.
    refetchInterval: (query) =>
      query.state.data?.status === "pending" ? 4000 : false,
  });

  const countdown = useCountdown(order?.status === "pending" ? order.expiresAt : null);

  // Pixels da promotora nesta página; e a compra conta uma vez, com o mesmo
  // id que o servidor manda — a plataforma de anúncio junta os dois.
  const rastreio = useRastreio();
  const dona = order?.organizacao ?? null;
  useEffect(() => {
    definirOrganizacaoDaPagina(dona);
    return () => definirOrganizacaoDaPagina(null);
  }, [dona]);
  const pago = order?.status === "paid";
  useEffect(() => {
    if (!order || !pago || !rastreio.pronto || compraJaContada(order.code)) return;
    rastreio({
      tipo: "compra",
      campanhaId: order.campaign.id,
      titulo: order.campaign.title,
      valorCents: order.amountCents,
      quantidade: order.quantity,
      idDoEvento: idDoEventoDeCompra(order.code),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pago, rastreio.pronto]);

  if (!order) {
    return (
      <PublicShell>
        <p className="py-20 text-center text-sm text-muted">Carregando pedido…</p>
      </PublicShell>
    );
  }

  return (
    <PublicShell>
      <div className="flex items-center justify-between">
        <h1 className="font-display text-xl font-bold">{order.campaign.title}</h1>
        <span className="tnum text-xs text-muted">pedido #{order.code}</span>
      </div>

      {order.status === "pending" ? (
        <div className="mt-3 rounded-md bg-yellow-soft px-3 py-2 text-center font-mono text-sm text-yellow-deep">
          reserva garantida por <b className="font-medium">{countdown.label}</b>
        </div>
      ) : null}

      {order.status === "paid" ? (
        <div className="mt-3 rounded-md bg-green-soft px-3 py-3 text-center text-sm text-green-deep">
          <p className="font-display text-base font-bold">Pagamento confirmado!</p>
          <p className="mt-1">Seus números estão garantidos. Boa sorte.</p>
        </div>
      ) : null}

      {/* Cota premiada: a revelação é o momento da compra. */}
      {order.status === "paid" && order.prizes.length > 0 ? (
        <div className="mt-3 rounded-md border-2 border-yellow bg-yellow-soft px-3 py-4 text-center">
          <p className="font-display text-lg font-extrabold text-yellow-deep">
            Você tirou cota premiada!
          </p>
          <ul className="mt-2 space-y-1">
            {order.prizes.map((p) => (
              <li key={p.number} className="text-sm text-ink-2">
                Cota{" "}
                <span className="tnum font-medium">
                  {formatQuota(p.number, order.campaign.totalQuotas)}
                </span>{" "}
                — <b>{p.label}</b>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-[11px] text-yellow-deep">
            Vamos falar com você no WhatsApp para combinar a entrega.
          </p>
        </div>
      ) : null}

      {order.status === "expired" ? (
        <div className="mt-3 rounded-md bg-red-soft px-3 py-3 text-center text-sm text-red">
          A reserva expirou e os números voltaram para a rifa. Faça um novo pedido.
        </div>
      ) : null}

      {/* No carrinho num Pix só, o Pix é um para todas as rifas. */}
      {order.status === "pending" && order.carrinho ? (
        <div className="mt-3 rounded-md border border-line px-3 py-3 text-sm">
          <p>
            Este pedido está no carrinho <span className="tnum">#{order.carrinho.codigo}</span>. O Pix é um só, de{" "}
            <Money cents={order.carrinho.totalCents} />, para todas as rifas dele.
          </p>
          <Link href={`/carrinho/pix/${order.carrinho.codigo}`} className="mt-2 inline-block font-semibold text-green-deep underline">
            Pagar o Pix do carrinho
          </Link>
        </div>
      ) : order.status === "pending" && order.pix.copyPaste ? (
        <PixParaPagar
          qr={order.pix.qr}
          copyPaste={order.pix.copyPaste}
          amountCents={order.amountCents}
          pedidoParaSimular={order.code}
        />
      ) : null}

      <Card title="Resumo">
        <div className="space-y-2 p-4 text-sm">
          <div className="flex justify-between">
            <span className="text-ink-2">{order.quantity} cota(s)</span>
            <Money cents={order.amountCents + order.discountCents} />
          </div>
          {order.discountCents > 0 ? (
            <div className="flex justify-between text-green-deep">
              <span>Desconto</span>
              <span className="tnum">− <Money cents={order.discountCents} /></span>
            </div>
          ) : null}
          <div className="flex justify-between font-medium">
            <span>Total</span>
            <Money cents={order.amountCents} />
          </div>
          <div className="flex justify-between pt-1">
            <span className="text-ink-2">Situação</span>
            <Pill status={order.status} />
          </div>
        </div>
      </Card>

      {order.status === "paid" ? (
        <div className="mt-3">
          <Button className="w-full" onClick={() => printTicket(order.code)}>
            Imprimir bilhete
          </Button>
        </div>
      ) : null}

      <Card title={`Seus números (${order.numbers.length})`}>
        <div className="flex flex-wrap gap-1 p-4">
          {order.numbers.map((n) => (
            <span
              key={n}
              className={`tnum rounded-md px-2 py-1 text-xs ${
                order.status === "paid"
                  ? "bg-green text-on-green"
                  : "border border-dashed border-yellow-deep bg-yellow-soft text-yellow-deep"
              }`}
            >
              {formatQuota(n, order.campaign.totalQuotas)}
            </span>
          ))}
        </div>
      </Card>
    </PublicShell>
  );
}
