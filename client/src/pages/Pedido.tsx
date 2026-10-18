import { useEffect } from "react";
import { FileText } from "lucide-react";
import { Link, useParams } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { PublicShell } from "@/components/AppShell";
import { Button, Card, Money, TONS_DO_BOTAO } from "@/components/bits";
import { ApiError } from "@/lib/queryClient";
import { formatQuota } from "@shared/format";
import { PixParaPagar, PrazoDaReserva, SituacaoDoPedido } from "@/components/PixParaPagar";
import { printTicket } from "@/lib/pos";
import { compraJaContada, definirOrganizacaoDaPagina } from "@/lib/marketing";
import { useRastreio } from "@/components/Marketing";
import { idDoEventoDeCompra } from "@shared/marketing";

interface OrderView {
  code: number;
  status: "pending" | "paid" | "expired" | "refunded";
  quantity: number;
  amountCents: number;
  /** A parte que a plataforma pagou (presente). */
  presenteCents: number;
  discountCents: number;
  expiresAt: string | null;
  paidAt: string | null;
  numbers: number[];
  prizes: { number: number; label: string }[];
  pix: { qr: string | null; copyPaste: string | null };
  campaign: {
    id: string;
    title: string;
    slug: string;
    totalQuotas: number;
    numeracaoZero?: boolean;
  };
  organizacao: string | null;
  buyer: { name: string };
  /** Pedido do carrinho num Pix só: o Pix é o do carrinho inteiro. */
  carrinho: { codigo: number; totalCents: number } | null;
}

export default function Pedido() {
  const { code } = useParams<{ code: string }>();

  const { data: order, isError, error } = useQuery<OrderView>({
    queryKey: [`/api/public/orders/${code}`],
    // Enquanto pendente, pergunta a cada 4 s até o webhook chegar.
    refetchInterval: (query) => (query.state.data?.status === "pending" ? 4000 : false),
  });

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
        {isError ? (
          // Código que não existe (ou muita consulta seguida): dizer, em vez de "Carregando" para sempre.
          <div className="py-20 text-center">
            <p className="text-sm text-muted">
              {error instanceof ApiError && error.status === 429 ? error.message : "Pedido não encontrado. Confira o código."}
            </p>
            <Link href="/minhas-cotas" className="mt-3 inline-flex h-10 items-center text-sm font-semibold text-green-deep underline">
              Ver minhas compras
            </Link>
          </div>
        ) : (
          <p className="py-20 text-center text-sm text-muted">Carregando pedido…</p>
        )}
      </PublicShell>
    );
  }

  const zero = order.campaign.numeracaoZero === true;
  const voltar = `/r/${order.campaign.slug}`;

  return (
    <PublicShell>
      <div className="space-y-3.5">
        <div className="flex items-baseline justify-between gap-3">
          <h1 className="min-w-0 break-words font-display text-2xl font-extrabold">{order.campaign.title}</h1>
          <span className="tnum shrink-0 font-mono text-xs text-muted">pedido #{order.code}</span>
        </div>

        {order.status === "pending" ? <PrazoDaReserva expiresAt={order.expiresAt} /> : null}

        {order.status === "paid" ? (
          <div className="rounded-lg bg-green-soft px-3 py-3 text-center text-sm text-green-deep">
            <p className="font-display text-lg font-bold">Pagamento confirmado!</p>
            <p className="mt-1">Seus números estão garantidos. Boa sorte.</p>
          </div>
        ) : null}

        {/* Cota premiada: a revelação é o momento da compra — só a que este pedido já reclamou. */}
        {order.status === "paid" && order.prizes.length > 0 ? (
          <div className="rounded-lg border-2 border-yellow bg-yellow-soft px-3 py-4 text-center">
            <p className="font-display text-lg font-extrabold text-yellow-deep">Você tirou cota premiada!</p>
            <ul className="mt-2 space-y-1">
              {order.prizes.map((p) => (
                <li key={p.number} className="text-sm text-ink-2">
                  Cota{" "}
                  <span className="tnum font-medium">{formatQuota(p.number, order.campaign.totalQuotas, zero)}</span> —{" "}
                  <b>{p.label}</b>
                </li>
              ))}
            </ul>
            <p className="mt-2 text-[11px] text-yellow-deep">
              Vamos falar com você no WhatsApp para combinar a entrega.
            </p>
          </div>
        ) : null}

        {order.status === "expired" ? (
          <div className="rounded-lg bg-mist px-3 py-3 text-center text-sm text-ink-2">
            <p className="font-semibold text-ink">A reserva venceu.</p>
            <p className="mt-1">
              Os números voltaram para a rifa. Não pague mais este Pix: se você já pagou, o valor volta para a conta que
              pagou. Faça um novo pedido.
            </p>
          </div>
        ) : null}

        {order.status === "refunded" ? (
          <div className="rounded-lg bg-mist px-3 py-3 text-center text-sm text-ink-2">
            <p className="font-semibold text-ink">Pedido estornado.</p>
          </div>
        ) : null}

        {/* No carrinho num Pix só, o Pix é um para todas as rifas. */}
        {order.status === "pending" && order.carrinho ? (
          <div className="rounded-lg border border-line px-3 py-3 text-sm">
            <p>
              Este pedido está no carrinho <span className="tnum">#{order.carrinho.codigo}</span>. O Pix é um só, de{" "}
              <Money cents={order.carrinho.totalCents} />, para todas as rifas dele.
            </p>
            <Link
              href={`/carrinho/pix/${order.carrinho.codigo}`}
              className="mt-2 inline-block min-h-6 font-semibold text-green-deep underline"
            >
              Pagar o Pix do carrinho
            </Link>
          </div>
        ) : order.status === "pending" && order.pix.copyPaste ? (
          <PixParaPagar
            qr={order.pix.qr}
            copyPaste={order.pix.copyPaste}
            amountCents={order.amountCents}
            expiresAt={order.expiresAt}
            pedidoParaSimular={order.code}
          />
        ) : null}

        <Card title="Resumo">
          <div className="space-y-2 p-4 text-sm">
            <div className="flex justify-between">
              <span className="text-ink-2">
                <span className="tnum">{order.quantity}</span> cota(s)
              </span>
              <Money cents={order.amountCents + order.presenteCents + order.discountCents} />
            </div>
            {order.discountCents > 0 ? (
              <div className="flex justify-between text-green-deep">
                <span>Desconto</span>
                <span className="tnum">
                  − <Money cents={order.discountCents} />
                </span>
              </div>
            ) : null}
            {order.presenteCents > 0 ? (
              <div className="flex justify-between text-green-deep">
                <span>Presente (pago pela plataforma)</span>
                <span className="tnum">
                  − <Money cents={order.presenteCents} />
                </span>
              </div>
            ) : null}
            <div className="flex justify-between font-medium">
              <span>Total</span>
              <Money cents={order.amountCents} />
            </div>
            <div className="flex items-center justify-between pt-1">
              <span className="text-ink-2">Situação</span>
              <SituacaoDoPedido status={order.status} />
            </div>
          </div>
        </Card>

        {order.status === "paid" ? (
          <Button className="w-full" icone={<FileText />} onClick={() => printTicket(order.code)}>
            Imprimir bilhete
          </Button>
        ) : null}

        <Card title={`Seus números (${order.numbers.length})`}>
          {order.numbers.length === 0 ? (
            <p className="p-4 text-sm text-muted">Nenhum número neste pedido: eles voltaram para a rifa.</p>
          ) : (
            <ul className="flex flex-wrap gap-2 p-4" aria-label="Seus números">
              {order.numbers.map((n) => (
                <li
                  key={n}
                  className={`tnum rounded-md px-2.5 py-1.5 text-xs ${
                    order.status === "paid"
                      ? "bg-green text-on-green"
                      : order.status === "pending"
                        ? "border border-dashed border-yellow-deep bg-yellow-soft text-yellow-deep"
                        : "bg-mist-2 text-muted"
                  }`}
                >
                  {formatQuota(n, order.campaign.totalQuotas, zero)}
                </li>
              ))}
            </ul>
          )}
        </Card>

        {order.status === "paid" ? (
          <p className="text-xs leading-[18px] text-muted">
            Os seus números (até 10 na mensagem) e o link deste pedido também vão para o seu WhatsApp. Guarde o código do
            pedido para consultar depois.
          </p>
        ) : null}

        <Link
          href={voltar}
          className={`flex h-10 w-full items-center justify-center rounded-lg px-4 text-[13px] font-semibold ${TONS_DO_BOTAO.cinza}`}
        >
          Voltar para a rifa
        </Link>
      </div>
    </PublicShell>
  );
}
