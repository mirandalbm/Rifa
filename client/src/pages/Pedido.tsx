import { useEffect, useState } from "react";
import { useParams } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { PublicShell } from "@/components/AppShell";
import { Button, Card, Money, Pill } from "@/components/bits";
import { formatQuota } from "@shared/format";
import { apiRequest } from "@/lib/queryClient";
import { printTicket } from "@/lib/pos";

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
  campaign: { title: string; slug: string; totalQuotas: number };
  buyer: { name: string };
}

function useCountdown(until: string | null) {
  const [left, setLeft] = useState(0);
  useEffect(() => {
    if (!until) return;
    const tick = () =>
      setLeft(Math.max(0, Math.floor((new Date(until).getTime() - Date.now()) / 1000)));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [until]);
  const mm = String(Math.floor(left / 60)).padStart(2, "0");
  const ss = String(left % 60).padStart(2, "0");
  return { left, label: `${mm}:${ss}` };
}

export default function Pedido() {
  const { code } = useParams<{ code: string }>();
  const [copied, setCopied] = useState(false);

  const { data: order } = useQuery<OrderView>({
    queryKey: [`/api/public/orders/${code}`],
    // Enquanto pendente, pergunta a cada 4 s até o webhook chegar.
    refetchInterval: (query) =>
      query.state.data?.status === "pending" ? 4000 : false,
  });

  const countdown = useCountdown(order?.status === "pending" ? order.expiresAt : null);

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

      {order.status === "pending" && order.pix.copyPaste ? (
        <Card title="Pague com Pix">
          <div className="space-y-3 p-4">
            {order.pix.qr ? (
              <img
                src={order.pix.qr}
                alt="QR Code do Pix"
                className="mx-auto h-44 w-44 rounded-lg border border-line"
              />
            ) : null}

            <div className="flex items-center gap-2 rounded-md border border-line-2 px-3 py-2">
              <span className="tnum flex-1 truncate text-[11px] text-muted">
                {order.pix.copyPaste}
              </span>
              <Button
                variant="ghost"
                className="px-3 py-1 text-xs"
                onClick={async () => {
                  await navigator.clipboard.writeText(order.pix.copyPaste!);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 2000);
                }}
              >
                {copied ? "copiado" : "copiar"}
              </Button>
            </div>

            <ol className="space-y-2 text-sm text-ink-2">
              <li>1. Abra o app do banco e escolha <b>Pix Copia e Cola</b>.</li>
              <li>
                2. Cole o código e confirme os <Money cents={order.amountCents} />.
              </li>
              <li>3. A confirmação chega no seu WhatsApp em segundos.</li>
            </ol>

            {import.meta.env.DEV ? (
              <Button
                variant="yellow"
                className="w-full"
                onClick={async () => {
                  await apiRequest("POST", `/api/dev/pay/${order.code}`);
                }}
              >
                simular pagamento (desenvolvimento)
              </Button>
            ) : null}
          </div>
        </Card>
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
