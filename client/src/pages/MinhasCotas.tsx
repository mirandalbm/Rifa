import { useState } from "react";
import { Link } from "wouter";
import { useMutation } from "@tanstack/react-query";
import { PublicShell } from "@/components/AppShell";
import { Button, Card, Money, Pill, Empty } from "@/components/bits";
import { apiRequest } from "@/lib/queryClient";
import { formatQuota, maskPhone } from "@shared/format";

interface OrderRow {
  order: { code: number; status: string; quantity: number; amountCents: number };
  campaign: { title: string; slug: string; totalQuotas: number };
  numbers: number[];
}

/** Sem senha: telefone + código de acesso. */
export default function MinhasCotas() {
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [step, setStep] = useState<"phone" | "code" | "done">("phone");
  const [devCode, setDevCode] = useState<string | null>(null);
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  const request = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/public/my-quotas/request-code", { phone });
      return (await res.json()) as { devCode?: string };
    },
    onSuccess: (data) => {
      setDevCode(data.devCode ?? null);
      setStep("code");
      setError(null);
    },
    onError: (err: Error) => setError(err.message),
  });

  const verify = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/public/my-quotas/verify", { code });
      return (await res.json()) as { orders: OrderRow[] };
    },
    onSuccess: (data) => {
      setOrders(data.orders);
      setStep("done");
      setError(null);
    },
    onError: (err: Error) => setError(err.message),
  });

  return (
    <PublicShell>
      <h1 className="font-display text-2xl font-extrabold">Minhas cotas</h1>
      <p className="mt-1 text-sm text-muted">
        Sem senha: confirme seu telefone e veja tudo o que você comprou.
      </p>

      {step !== "done" ? (
        <Card>
          <div className="space-y-3 p-4">
            <div>
              <label htmlFor="telefone" className="label-xs">
                WhatsApp
              </label>
              <input
                id="telefone"
                value={phone}
                inputMode="tel"
                disabled={step === "code"}
                onChange={(e) => setPhone(e.target.value)}
                className="tnum mt-1 w-full rounded-md border border-line-2 px-3 py-2 text-sm disabled:bg-mist"
              />
            </div>

            {step === "code" ? (
              <div>
                <label htmlFor="codigo" className="label-xs">
                  Código de 6 dígitos
                </label>
                <input
                  id="codigo"
                  value={code}
                  inputMode="numeric"
                  maxLength={6}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                  className="tnum mt-1 w-full rounded-md border border-line-2 px-3 py-2 text-lg tracking-[0.3em]"
                />
                {devCode ? (
                  <p className="tnum mt-1 text-[11px] text-yellow-deep">
                    desenvolvimento — seu código é {devCode}
                  </p>
                ) : null}
              </div>
            ) : null}

            {error ? (
              <p className="rounded-md bg-red-soft px-3 py-2 text-sm text-red">{error}</p>
            ) : null}

            <Button
              className="w-full"
              disabled={request.isPending || verify.isPending}
              onClick={() => (step === "phone" ? request.mutate() : verify.mutate())}
            >
              {step === "phone" ? "Receber código" : "Confirmar"}
            </Button>
          </div>
        </Card>
      ) : null}

      {step === "done" ? (
        <>
          <p className="mt-4 text-sm text-muted">{maskPhone(phone)}</p>
          {orders.length === 0 ? <Empty>Nenhuma compra neste telefone.</Empty> : null}
          <div className="mt-3 space-y-3">
            {orders.map((row) => (
              <Card key={row.order.code}>
                <div className="space-y-2 p-4">
                  <div className="flex items-center justify-between">
                    <Link
                      href={`/r/${row.campaign.slug}`}
                      className="font-display text-sm font-bold"
                    >
                      {row.campaign.title}
                    </Link>
                    <Pill status={row.order.status} />
                  </div>
                  <div className="flex justify-between text-xs text-muted">
                    <span className="tnum">pedido #{row.order.code}</span>
                    <Money cents={row.order.amountCents} />
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {row.numbers.map((n) => (
                      <span
                        key={n}
                        className={`tnum rounded px-1.5 py-[2px] text-[11px] ${
                          row.order.status === "paid"
                            ? "bg-green text-on-green"
                            : "bg-mist-2 text-muted"
                        }`}
                      >
                        {formatQuota(n, row.campaign.totalQuotas)}
                      </span>
                    ))}
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </>
      ) : null}
    </PublicShell>
  );
}
