import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { PanelShell } from "@/components/AppShell";
import { Card, Kpi, Money, Pill, Button, Empty } from "@/components/bits";
import { apiRequest } from "@/lib/queryClient";
import { formatBRL } from "@shared/format";

interface Overview {
  affiliate: { code: string; pixKey: string | null; commissionPct: number | null; status: string };
  clicks: number;
  sales: number;
  conversion: number;
  revenueCents: number;
  commission: {
    pendingCents: number;
    availableCents: number;
    paidCents: number;
    reversedCents: number;
  };
  daily: { day: string; sales: number }[];
}

/** Gráfico de uma série só: sem legenda, com o pico rotulado. */
function SalesChart({ data }: { data: { day: string; sales: number }[] }) {
  if (data.length === 0) {
    return <Empty>Sem vendas nos últimos 14 dias.</Empty>;
  }
  const max = Math.max(...data.map((d) => d.sales), 1);
  const peak = data.reduce((a, b) => (b.sales > a.sales ? b : a));

  return (
    <div className="flex h-32 items-end gap-1 px-4 pb-3 pt-4">
      {data.map((d) => {
        const h = Math.round((d.sales / max) * 100);
        const isPeak = d.day === peak.day;
        return (
          <div key={d.day} className="flex h-full flex-1 flex-col items-center justify-end gap-1">
            <span className="tnum text-[9px] text-ink">{isPeak ? d.sales : ""}</span>
            <div
              title={`${new Date(d.day).toLocaleDateString("pt-BR")} · ${d.sales} venda(s)`}
              className={`w-full rounded-t ${isPeak ? "bg-yellow" : "bg-green"}`}
              style={{ height: `${Math.max(4, h)}%` }}
            />
          </div>
        );
      })}
    </div>
  );
}

export function AfiliadoPainel() {
  const { data } = useQuery<Overview>({ queryKey: ["/api/affiliate/overview"] });

  return (
    <PanelShell title="Visão geral">
      {!data ? (
        <Empty>Carregando…</Empty>
      ) : (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Kpi label="Cliques" value={String(data.clicks)} />
            <Kpi
              label="Vendas"
              value={String(data.sales)}
              hint={`conversão de ${(data.conversion * 100).toFixed(1)}%`}
            />
            <Kpi label="Receita gerada" value={formatBRL(data.revenueCents)} />
            <Kpi
              label="Comissão"
              value={formatBRL(
                data.commission.pendingCents + data.commission.availableCents,
              )}
              hint={`${formatBRL(data.commission.availableCents)} já liberados`}
              highlight
            />
          </div>

          <div className="grid gap-3 lg:grid-cols-[1.5fr_1fr]">
            <Card title="Vendas por dia" right={<span className="label-xs">últimos 14 dias</span>}>
              <SalesChart data={data.daily} />
            </Card>

            <Card title="Saldo" right={<Pill status={data.affiliate.pixKey ? "paid" : "pending"}>
              {data.affiliate.pixKey ? "Pix cadastrado" : "sem chave Pix"}
            </Pill>}>
              <div className="p-4">
                <p className="label-xs">Disponível para saque</p>
                <p className="tnum my-1 text-2xl text-green-deep">
                  {formatBRL(data.commission.availableCents)}
                </p>
                <p className="text-[11px] text-muted">
                  {formatBRL(data.commission.pendingCents)} ficam pendentes até passar a carência
                  contra estorno.
                </p>
              </div>
            </Card>
          </div>
        </div>
      )}
    </PanelShell>
  );
}

interface LinkKit {
  slug: string;
  title: string;
  pct: number;
  url: string;
  qr: string;
  coupon: { code: string; discountPct: number } | null;
  texts: string[];
}

export function AfiliadoLinks() {
  const { data } = useQuery<LinkKit[]>({ queryKey: ["/api/affiliate/links"] });
  const [copied, setCopied] = useState<string | null>(null);

  async function copy(id: string, text: string) {
    await navigator.clipboard.writeText(text);
    setCopied(id);
    setTimeout(() => setCopied(null), 2000);
  }

  return (
    <PanelShell title="Meus links">
      <div className="space-y-3">
        {data?.length === 0 ? <Empty>Nenhuma rifa no ar agora.</Empty> : null}
        {data?.map((l) => (
          <Card key={l.slug}>
            <div className="space-y-3 p-4">
              <div className="flex items-center justify-between">
                <h3 className="font-display text-sm font-bold">{l.title}</h3>
                <span className="label-xs">comissão de {l.pct}%</span>
              </div>

              <div className="flex items-center gap-2 rounded-md border-2 border-dashed border-green bg-green-soft px-3 py-2">
                <span className="tnum flex-1 truncate text-xs text-green-deep">{l.url}</span>
                <Button
                  variant="ghost"
                  className="px-3 py-1 text-xs"
                  onClick={() => copy(l.slug, l.url)}
                >
                  {copied === l.slug ? "copiado" : "copiar"}
                </Button>
              </div>

              {l.coupon ? (
                <p className="rounded-md bg-yellow-soft px-3 py-2 text-xs text-yellow-deep">
                  Seu cupom <b className="tnum">{l.coupon.code}</b> dá{" "}
                  {l.coupon.discountPct}% de desconto ao comprador — e credita a venda a você
                  mesmo que a pessoa não tenha entrado pelo seu link.
                </p>
              ) : null}

              <div className="grid gap-3 sm:grid-cols-[132px_1fr]">
                <div className="space-y-1">
                  <span className="label-xs">QR do seu link</span>
                  <img
                    src={l.qr}
                    alt={`QR Code do link de afiliado para ${l.title}`}
                    className="w-32 rounded-md border border-line"
                  />
                  <a
                    href={l.qr}
                    download={`qr-${l.slug}.png`}
                    className="block text-center text-[11px] text-green-deep underline"
                  >
                    baixar
                  </a>
                </div>

                <div className="space-y-1">
                  <span className="label-xs">Textos prontos</span>
                  {l.texts.map((t, i) => (
                    <div
                      key={i}
                      className="flex items-start gap-2 rounded-md border border-line px-2 py-1.5"
                    >
                      <p className="flex-1 text-[11px] leading-snug text-ink-2">{t}</p>
                      <Button
                        variant="ghost"
                        className="px-2 py-0.5 text-[10px]"
                        onClick={() => copy(`${l.slug}-${i}`, t)}
                      >
                        {copied === `${l.slug}-${i}` ? "ok" : "copiar"}
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </Card>
        ))}
      </div>
    </PanelShell>
  );
}

export function AfiliadoComissoes() {
  const { data } = useQuery<
    {
      id: string;
      amountCents: number;
      pct: number;
      status: string;
      orderCode: number;
      orderAmountCents: number;
      quantity: number;
      buyerName: string;
      campaignTitle: string;
    }[]
  >({ queryKey: ["/api/affiliate/commissions"] });

  return (
    <PanelShell title="Comissões">
      <Card>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-sm">
            <thead>
              <tr className="bg-mist">
                {["Pedido", "Comprador", "Cotas", "Venda", "Comissão", "Status"].map((h) => (
                  <th key={h} className="label-xs px-3 py-2 text-left">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data?.map((c) => (
                <tr key={c.id} className="border-t border-line">
                  <td className="tnum px-3 py-2">#{c.orderCode}</td>
                  <td className="px-3 py-2">{c.buyerName}</td>
                  <td className="tnum px-3 py-2">{c.quantity}</td>
                  <td className="px-3 py-2">
                    <Money cents={c.orderAmountCents} />
                  </td>
                  <td className="px-3 py-2">
                    <Money cents={c.amountCents} />
                  </td>
                  <td className="px-3 py-2">
                    <Pill status={c.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {data?.length === 0 ? <Empty>Nenhuma comissão ainda.</Empty> : null}
      </Card>
    </PanelShell>
  );
}

export function AfiliadoSaques() {
  const qc = useQueryClient();
  const { data: overview } = useQuery<Overview>({ queryKey: ["/api/affiliate/overview"] });
  const { data: payouts } = useQuery<
    { id: string; amountCents: number; status: string; requestedAt: string }[]
  >({ queryKey: ["/api/affiliate/payouts"] });

  const [pixKey, setPixKey] = useState("");
  const [error, setError] = useState<string | null>(null);

  const savePix = useMutation({
    mutationFn: () => apiRequest("PATCH", "/api/affiliate/pix-key", { pixKey }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/affiliate/overview"] }),
  });

  const request = useMutation({
    mutationFn: () => apiRequest("POST", "/api/affiliate/payouts"),
    onSuccess: () => qc.invalidateQueries(),
    onError: (err: Error) => setError(err.message),
  });

  return (
    <PanelShell title="Saques">
      <div className="grid gap-3 lg:grid-cols-2">
        <Card title="Chave Pix">
          <div className="space-y-3 p-4">
            <p className="text-sm text-muted">
              Atual: <span className="tnum">{overview?.affiliate.pixKey ?? "não cadastrada"}</span>
            </p>
            <input
              id="pix-key"
              value={pixKey}
              onChange={(e) => setPixKey(e.target.value)}
              placeholder="e-mail, CPF, telefone ou chave aleatória"
              className="w-full rounded-md border border-line-2 px-3 py-2 text-sm"
            />
            <Button onClick={() => savePix.mutate()} disabled={pixKey.length < 5}>
              Salvar chave
            </Button>
          </div>
        </Card>

        <Card title="Sacar">
          <div className="space-y-3 p-4">
            <p className="label-xs">Disponível</p>
            <p className="tnum text-2xl text-green-deep">
              {formatBRL(overview?.commission.availableCents ?? 0)}
            </p>
            {error ? (
              <p className="rounded-md bg-red-soft px-3 py-2 text-sm text-red">{error}</p>
            ) : null}
            <Button
              className="w-full"
              disabled={request.isPending || (overview?.commission.availableCents ?? 0) <= 0}
              onClick={() => {
                setError(null);
                request.mutate();
              }}
            >
              Solicitar saque via Pix
            </Button>
          </div>
        </Card>
      </div>

      <div className="mt-3">
        <Card title="Histórico">
          {payouts?.length === 0 ? (
            <Empty>Nenhum saque solicitado.</Empty>
          ) : (
            <ul className="divide-y divide-line">
              {payouts?.map((p) => (
                <li key={p.id} className="flex items-center justify-between px-4 py-3 text-sm">
                  <span className="tnum text-muted">
                    {new Date(p.requestedAt).toLocaleDateString("pt-BR")}
                  </span>
                  <Money cents={p.amountCents} />
                  <Pill status={p.status === "requested" ? "pending" : p.status} />
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </PanelShell>
  );
}
