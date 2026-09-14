import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { PanelShell } from "@/components/AppShell";
import { Card, Kpi, Money, Pill, Button, Empty, Progress } from "@/components/bits";
import { apiRequest } from "@/lib/queryClient";
import { MediaManager } from "@/components/MediaManager";
import { CampaignExtras } from "@/components/CampaignExtras";
import { formatBRL, groupNumber, formatQuota } from "@shared/format";
import { MAX_QUOTAS, MIN_QUOTAS } from "@shared/schema";

/* ------------------------------- painel ------------------------------- */

interface AdminOverview {
  revenueCents: number;
  soldCount: number;
  reservedCount: number;
  publishedCampaigns: number;
  publishedQuotas: number;
  commissionToPayCents: number;
  commissionAffiliates: number;
  daily: { day: string; cents: number }[];
  topAffiliates: { code: string; name: string; cents: number }[];
}

function RevenueChart({ data }: { data: { day: string; cents: number }[] }) {
  if (data.length === 0) return <Empty>Sem receita nos últimos 14 dias.</Empty>;
  const max = Math.max(...data.map((d) => d.cents), 1);
  const peak = data.reduce((a, b) => (b.cents > a.cents ? b : a));

  return (
    <div className="flex h-36 items-end gap-1 px-4 pb-3 pt-4">
      {data.map((d) => (
        <div key={d.day} className="flex h-full flex-1 flex-col items-center justify-end gap-1">
          <span className="tnum text-[9px]">
            {d.day === peak.day ? formatBRL(d.cents).replace("R$", "").trim() : ""}
          </span>
          <div
            title={`${new Date(d.day).toLocaleDateString("pt-BR")} · ${formatBRL(d.cents)}`}
            className={`w-full rounded-t ${d.day === peak.day ? "bg-yellow" : "bg-green"}`}
            style={{ height: `${Math.max(4, Math.round((d.cents / max) * 100))}%` }}
          />
        </div>
      ))}
    </div>
  );
}

export function AdminPainel() {
  const { data } = useQuery<AdminOverview>({ queryKey: ["/api/admin/overview"] });

  return (
    <PanelShell title="Painel">
      {!data ? (
        <Empty>Carregando…</Empty>
      ) : (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Kpi label="Receita paga" value={formatBRL(data.revenueCents)} highlight />
            <Kpi
              label="Cotas vendidas"
              value={groupNumber(data.soldCount)}
              hint={`de ${groupNumber(data.publishedQuotas)} publicadas`}
            />
            <Kpi
              label="Reservas abertas"
              value={groupNumber(data.reservedCount)}
              hint="expiram pelo prazo da campanha"
            />
            <Kpi
              label="Comissão a pagar"
              value={formatBRL(data.commissionToPayCents)}
              hint={`${data.commissionAffiliates} afiliado(s)`}
            />
          </div>

          <div className="grid gap-3 lg:grid-cols-[1.5fr_1fr]">
            <Card title="Receita paga por dia" right={<span className="label-xs">14 dias</span>}>
              <RevenueChart data={data.daily} />
            </Card>
            <Card title="Top afiliados">
              {data.topAffiliates.length === 0 ? (
                <Empty>Nenhum afiliado ainda.</Empty>
              ) : (
                <ul className="divide-y divide-line">
                  {data.topAffiliates.map((a, i) => (
                    <li key={a.code} className="flex items-center gap-3 px-4 py-2 text-sm">
                      <span
                        className={`tnum flex h-5 w-5 items-center justify-center rounded text-[10px] ${
                          i === 0 ? "bg-yellow text-[#3B2A00]" : "bg-mist-2 text-muted"
                        }`}
                      >
                        {i + 1}
                      </span>
                      <span className="flex-1">
                        {a.name} · <span className="tnum text-muted">{a.code}</span>
                      </span>
                      <Money cents={a.cents} className="text-ink-2" />
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>
        </div>
      )}
    </PanelShell>
  );
}

/* ----------------------------- campanhas ----------------------------- */

interface CampaignRow {
  campaign: {
    id: string;
    slug: string;
    title: string;
    prizeTitle: string;
    totalQuotas: number;
    priceCents: number;
    status: string;
    drawAt: string | null;
    authorizationCode: string | null;
  };
  stats: { soldCount: number; revenueCents: number } | null;
}

const PRESETS = [1_000, 10_000, 100_000, 1_000_000];

export function AdminCampanhas() {
  const qc = useQueryClient();
  const { data } = useQuery<CampaignRow[]>({ queryKey: ["/api/admin/campaigns"] });
  const [open, setOpen] = useState(false);
  const [mediaFor, setMediaFor] = useState<string | null>(null);
  const [form, setForm] = useState({
    title: "",
    slug: "",
    prizeTitle: "",
    totalQuotas: 1000,
    priceCents: 490,
    commissionPctDefault: 10,
  });
  const [error, setError] = useState<string | null>(null);

  const create = useMutation({
    mutationFn: () => apiRequest("POST", "/api/admin/campaigns", form),
    onSuccess: () => {
      setOpen(false);
      qc.invalidateQueries({ queryKey: ["/api/admin/campaigns"] });
    },
    onError: (err: Error) => setError(err.message),
  });

  const publish = useMutation({
    mutationFn: (id: string) => apiRequest("POST", `/api/admin/campaigns/${id}/publish`),
    onSuccess: () => qc.invalidateQueries(),
    onError: (err: Error) => setError(err.message),
  });

  const digits = String(form.totalQuotas).length;

  return (
    <PanelShell title="Campanhas">
      <div className="mb-4 flex items-center justify-between">
        <p className="text-sm text-muted">{data?.length ?? 0} campanha(s)</p>
        <Button onClick={() => setOpen((v) => !v)}>
          {open ? "Fechar" : "Nova campanha"}
        </Button>
      </div>

      {error ? (
        <p className="mb-3 rounded-md bg-red-soft px-3 py-2 text-sm text-red">{error}</p>
      ) : null}

      {open ? (
        <Card title="Nova campanha" right={<Pill status="draft" />}>
          <div className="space-y-4 p-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label htmlFor="titulo" className="label-xs">Título</label>
                <input
                  id="titulo"
                  value={form.title}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      title: e.target.value,
                      slug: e.target.value
                        .toLowerCase()
                        .normalize("NFD")
                        .replace(/[̀-ͯ]/g, "")
                        .replace(/[^a-z0-9]+/g, "-")
                        .replace(/(^-|-$)/g, ""),
                    })
                  }
                  className="mt-1 w-full rounded-md border border-line-2 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label htmlFor="premio" className="label-xs">Prêmio</label>
                <input
                  id="premio"
                  value={form.prizeTitle}
                  onChange={(e) => setForm({ ...form, prizeTitle: e.target.value })}
                  className="mt-1 w-full rounded-md border border-line-2 px-3 py-2 text-sm"
                />
              </div>
            </div>

            {/* O total trava ao publicar: enquanto é rascunho, é livre. */}
            <div>
              <label htmlFor="total" className="label-xs">Total de cotas</label>
              <input
                id="total"
                type="number"
                min={MIN_QUOTAS}
                max={MAX_QUOTAS}
                value={form.totalQuotas}
                onChange={(e) => setForm({ ...form, totalQuotas: Number(e.target.value) })}
                className="tnum mt-1 w-full rounded-md border-2 border-green px-3 py-2 text-lg"
              />
              <div className="mt-2 grid grid-cols-4 gap-1">
                {PRESETS.map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setForm({ ...form, totalQuotas: p })}
                    className={`tnum rounded border px-2 py-1 text-xs ${
                      form.totalQuotas === p
                        ? "border-green bg-green text-on-green"
                        : "border-line-2 text-ink-2"
                    }`}
                  >
                    {groupNumber(p)}
                  </button>
                ))}
              </div>
              <p className="mt-1 text-[11px] text-muted">
                Numeração de <span className="tnum">{formatQuota(1, form.totalQuotas)}</span> a{" "}
                <span className="tnum">{form.totalQuotas}</span> — {digits} dígitos.
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label htmlFor="preco" className="label-xs">Preço da cota (centavos)</label>
                <input
                  id="preco"
                  type="number"
                  value={form.priceCents}
                  onChange={(e) => setForm({ ...form, priceCents: Number(e.target.value) })}
                  className="tnum mt-1 w-full rounded-md border border-line-2 px-3 py-2 text-sm"
                />
                <p className="mt-1 text-[11px] text-muted">
                  {formatBRL(form.priceCents)} por cota · arrecadação potencial{" "}
                  {formatBRL(form.priceCents * form.totalQuotas)}
                </p>
              </div>
              <div>
                <label htmlFor="comissao" className="label-xs">Comissão padrão (%)</label>
                <input
                  id="comissao"
                  type="number"
                  value={form.commissionPctDefault}
                  onChange={(e) =>
                    setForm({ ...form, commissionPctDefault: Number(e.target.value) })
                  }
                  className="tnum mt-1 w-full rounded-md border border-line-2 px-3 py-2 text-sm"
                />
              </div>
            </div>

            <div className="flex items-start gap-2 rounded-md bg-yellow-soft px-3 py-2 text-xs text-yellow-deep">
              <span aria-hidden>⚠️</span>
              <span>
                <b>O total trava ao publicar.</b> Depois da primeira venda, mudar a quantidade
                alteraria a chance de quem já comprou.
              </span>
            </div>

            <Button onClick={() => create.mutate()} disabled={create.isPending}>
              Criar rascunho
            </Button>
          </div>
        </Card>
      ) : null}

      {mediaFor ? (
        <div className="mt-3 space-y-3">
          <MediaManager campaignId={mediaFor} />
          <CampaignExtras
            campaignId={mediaFor}
            totalQuotas={
              data?.find((c) => c.campaign.id === mediaFor)?.campaign.totalQuotas ?? 1000
            }
          />
        </div>
      ) : null}

      <div className="mt-3">
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="bg-mist">
                  {["Campanha", "Cota", "Progresso", "Arrecadado", "Sorteio", "Status", ""].map(
                    (h) => (
                      <th key={h} className="label-xs px-3 py-2 text-left">
                        {h}
                      </th>
                    ),
                  )}
                </tr>
              </thead>
              <tbody>
                {data?.map(({ campaign, stats }) => (
                  <tr key={campaign.id} className="border-t border-line">
                    <td className="px-3 py-2 font-medium">{campaign.prizeTitle}</td>
                    <td className="px-3 py-2">
                      <Money cents={campaign.priceCents} />
                    </td>
                    <td className="min-w-[130px] px-3 py-2">
                      <Progress value={stats?.soldCount ?? 0} total={campaign.totalQuotas} />
                      <span className="label-xs">
                        {groupNumber(stats?.soldCount ?? 0)}/{groupNumber(campaign.totalQuotas)}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      <Money cents={stats?.revenueCents ?? 0} />
                    </td>
                    <td className="tnum px-3 py-2">
                      {campaign.drawAt
                        ? new Date(campaign.drawAt).toLocaleDateString("pt-BR")
                        : "—"}
                    </td>
                    <td className="px-3 py-2">
                      <Pill status={campaign.status} />
                    </td>
                    <td className="px-3 py-2">
                      <span className="flex gap-1">
                        <Button
                          variant="ghost"
                          className="px-2 py-1 text-xs"
                          onClick={() =>
                            setMediaFor(mediaFor === campaign.id ? null : campaign.id)
                          }
                        >
                          Ajustar
                        </Button>
                        {campaign.status === "draft" ? (
                          <Button
                            className="px-2 py-1 text-xs"
                            onClick={() => publish.mutate(campaign.id)}
                          >
                            Publicar
                          </Button>
                        ) : null}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {data?.length === 0 ? <Empty>Nenhuma campanha criada.</Empty> : null}
        </Card>
      </div>
    </PanelShell>
  );
}

/* ------------------------------ pedidos ------------------------------ */

export function AdminPedidos() {
  const { data } = useQuery<
    {
      order: { code: number; status: string; quantity: number; amountCents: number; createdAt: string };
      buyer: { name: string; phone: string };
      campaign: { title: string };
    }[]
  >({ queryKey: ["/api/admin/orders"] });

  return (
    <PanelShell title="Pedidos">
      <Card>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[620px] text-sm">
            <thead>
              <tr className="bg-mist">
                {["Pedido", "Rifa", "Comprador", "Cotas", "Valor", "Status"].map((h) => (
                  <th key={h} className="label-xs px-3 py-2 text-left">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data?.map((row) => (
                <tr key={row.order.code} className="border-t border-line">
                  <td className="tnum px-3 py-2">#{row.order.code}</td>
                  <td className="px-3 py-2">{row.campaign.title}</td>
                  <td className="px-3 py-2">{row.buyer.name}</td>
                  <td className="tnum px-3 py-2">{row.order.quantity}</td>
                  <td className="px-3 py-2"><Money cents={row.order.amountCents} /></td>
                  <td className="px-3 py-2"><Pill status={row.order.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {data?.length === 0 ? <Empty>Nenhum pedido ainda.</Empty> : null}
      </Card>
    </PanelShell>
  );
}

/* ----------------------------- afiliados ----------------------------- */

export function AdminAfiliados() {
  const qc = useQueryClient();
  const { data } = useQuery<
    {
      affiliate: { id: string; code: string; status: string; commissionPct: number | null; pixKey: string | null };
      user: { name: string; email: string };
      salesCents: number;
    }[]
  >({ queryKey: ["/api/admin/affiliates"] });

  const [form, setForm] = useState({ name: "", email: "", password: "", code: "" });
  const [error, setError] = useState<string | null>(null);

  const create = useMutation({
    mutationFn: () => apiRequest("POST", "/api/admin/affiliates", form),
    onSuccess: () => {
      setForm({ name: "", email: "", password: "", code: "" });
      qc.invalidateQueries({ queryKey: ["/api/admin/affiliates"] });
    },
    onError: (err: Error) => setError(err.message),
  });

  const update = useMutation({
    mutationFn: (vars: { id: string; status: string }) =>
      apiRequest("PATCH", `/api/admin/affiliates/${vars.id}`, { status: vars.status }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/admin/affiliates"] }),
  });

  const pending = data?.filter((r) => r.affiliate.status === "pending") ?? [];

  return (
    <PanelShell title="Afiliados">
      {pending.length > 0 ? (
        <div className="mb-3">
          <Card
            title="Aguardando aprovação"
            right={<Pill status="pending">{`${pending.length} na fila`}</Pill>}
          >
            <ul className="divide-y divide-line">
              {pending.map((row) => (
                <li
                  key={row.affiliate.id}
                  className="flex flex-wrap items-center gap-3 px-4 py-3 text-sm"
                >
                  <span className="flex-1">
                    {row.user.name} · <span className="tnum text-muted">{row.user.email}</span>
                  </span>
                  <span className="tnum text-xs text-muted">
                    código {row.affiliate.code}
                  </span>
                  <Button
                    className="px-3 py-1 text-xs"
                    onClick={() => update.mutate({ id: row.affiliate.id, status: "active" })}
                  >
                    Aprovar
                  </Button>
                  <Button
                    variant="ghost"
                    className="px-3 py-1 text-xs"
                    onClick={() => update.mutate({ id: row.affiliate.id, status: "blocked" })}
                  >
                    Recusar
                  </Button>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      ) : null}

      <div className="mb-3">
        <CouponsCard affiliates={data ?? []} />
      </div>

      <div className="grid gap-3 lg:grid-cols-[1fr_1.6fr]">
        <Card title="Novo afiliado">
          <div className="space-y-3 p-4">
            {(["name", "email", "password", "code"] as const).map((field) => (
              <div key={field}>
                <label htmlFor={field} className="label-xs">
                  {{ name: "Nome", email: "E-mail", password: "Senha", code: "Código" }[field]}
                </label>
                <input
                  id={field}
                  type={field === "password" ? "password" : "text"}
                  value={form[field]}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      [field]: field === "code" ? e.target.value.toUpperCase() : e.target.value,
                    })
                  }
                  className="mt-1 w-full rounded-md border border-line-2 px-3 py-2 text-sm"
                />
              </div>
            ))}
            {error ? (
              <p className="rounded-md bg-red-soft px-3 py-2 text-sm text-red">{error}</p>
            ) : null}
            <Button
              className="w-full"
              disabled={create.isPending}
              onClick={() => {
                setError(null);
                create.mutate();
              }}
            >
              Cadastrar e aprovar
            </Button>
          </div>
        </Card>

        <Card title="Cadastrados">
          <ul className="divide-y divide-line">
            {data?.map((row) => (
              <li key={row.affiliate.id} className="flex items-center gap-3 px-4 py-3 text-sm">
                <span className="flex-1">
                  {row.user.name} · <span className="tnum text-muted">{row.affiliate.code}</span>
                </span>
                <Money cents={row.salesCents} className="text-muted" />
                <Pill status={row.affiliate.status} />
                <Button
                  variant="ghost"
                  className="px-2 py-1 text-xs"
                  onClick={() =>
                    update.mutate({
                      id: row.affiliate.id,
                      status: row.affiliate.status === "active" ? "blocked" : "active",
                    })
                  }
                >
                  {row.affiliate.status === "active" ? "bloquear" : "ativar"}
                </Button>
              </li>
            ))}
          </ul>
          {data?.length === 0 ? <Empty>Nenhum afiliado cadastrado.</Empty> : null}
        </Card>
      </div>
    </PanelShell>
  );
}

/** Cupom do afiliado: desconto para o comprador, atribuição para o afiliado. */
function CouponsCard({
  affiliates,
}: {
  affiliates: { affiliate: { id: string; code: string }; user: { name: string } }[];
}) {
  const qc = useQueryClient();
  const { data } = useQuery<
    {
      coupon: {
        id: string;
        code: string;
        discountPct: number;
        uses: number;
        maxUses: number | null;
      };
      affiliateCode: string | null;
    }[]
  >({ queryKey: ["/api/admin/coupons"] });

  const [form, setForm] = useState({ code: "", discountPct: 10, affiliateId: "" });
  const [error, setError] = useState<string | null>(null);

  const create = useMutation({
    mutationFn: () =>
      apiRequest("POST", "/api/admin/coupons", {
        ...form,
        affiliateId: form.affiliateId || null,
      }),
    onSuccess: () => {
      setForm({ code: "", discountPct: 10, affiliateId: "" });
      setError(null);
      qc.invalidateQueries({ queryKey: ["/api/admin/coupons"] });
    },
    onError: (err: Error) => setError(err.message),
  });

  const remove = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/admin/coupons/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/admin/coupons"] }),
  });

  return (
    <Card title="Cupons">
      <div className="space-y-3 p-4">
        <div className="flex flex-wrap items-end gap-2">
          <div>
            <label htmlFor="coupon-code" className="label-xs">Código</label>
            <input
              id="coupon-code"
              value={form.code}
              onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })}
              className="tnum mt-1 w-32 rounded-md border border-line-2 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label htmlFor="coupon-pct" className="label-xs">Desconto %</label>
            <input
              id="coupon-pct"
              type="number"
              min={1}
              max={50}
              value={form.discountPct}
              onChange={(e) => setForm({ ...form, discountPct: Number(e.target.value) })}
              className="tnum mt-1 w-24 rounded-md border border-line-2 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label htmlFor="coupon-aff" className="label-xs">Afiliado</label>
            <select
              id="coupon-aff"
              value={form.affiliateId}
              onChange={(e) => setForm({ ...form, affiliateId: e.target.value })}
              className="mt-1 rounded-md border border-line-2 px-3 py-2 text-sm"
            >
              <option value="">sem afiliado</option>
              {affiliates.map((a) => (
                <option key={a.affiliate.id} value={a.affiliate.id}>
                  {a.user.name} ({a.affiliate.code})
                </option>
              ))}
            </select>
          </div>
          <Button onClick={() => create.mutate()} disabled={form.code.length < 3}>
            Criar cupom
          </Button>
        </div>

        {error ? (
          <p className="rounded-md bg-red-soft px-3 py-2 text-sm text-red">{error}</p>
        ) : null}

        {data?.length === 0 ? (
          <Empty>Nenhum cupom criado.</Empty>
        ) : (
          <ul className="divide-y divide-line">
            {data?.map((row) => (
              <li key={row.coupon.id} className="flex items-center gap-3 py-2 text-sm">
                <span className="tnum font-medium">{row.coupon.code}</span>
                <span className="text-muted">−{row.coupon.discountPct}%</span>
                <span className="flex-1 text-xs text-muted">
                  {row.affiliateCode ? `afiliado ${row.affiliateCode}` : "sem afiliado"} ·{" "}
                  <span className="tnum">
                    {row.coupon.uses}
                    {row.coupon.maxUses ? `/${row.coupon.maxUses}` : ""} uso(s)
                  </span>
                </span>
                <Button
                  variant="ghost"
                  className="px-2 py-1 text-xs"
                  onClick={() => remove.mutate(row.coupon.id)}
                >
                  remover
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Card>
  );
}

/* ---------------------------- financeiro ---------------------------- */

export function AdminFinanceiro() {
  const qc = useQueryClient();
  const { data } = useQuery<{
    perAffiliate: {
      affiliateId: string;
      code: string;
      name: string;
      pixKey: string | null;
      pendingCents: number;
      availableCents: number;
    }[];
    payoutsRequested: { id: string; amountCents: number; pixKey: string; requestedAt: string }[];
  }>({ queryKey: ["/api/admin/finance"] });

  const release = useMutation({
    mutationFn: () => apiRequest("POST", "/api/admin/finance/release"),
    onSuccess: () => qc.invalidateQueries(),
  });

  const pay = useMutation({
    mutationFn: (id: string) => apiRequest("POST", `/api/admin/payouts/${id}/paid`),
    onSuccess: () => qc.invalidateQueries(),
  });

  return (
    <PanelShell title="Financeiro">
      <div className="mb-3 flex justify-end">
        <Button variant="ghost" onClick={() => release.mutate()}>
          Liberar comissões vencidas
        </Button>
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <Card title="Comissão por afiliado">
          <ul className="divide-y divide-line">
            {data?.perAffiliate.map((a) => (
              <li key={a.affiliateId} className="px-4 py-3 text-sm">
                <div className="flex items-center justify-between">
                  <span>
                    {a.name} · <span className="tnum text-muted">{a.code}</span>
                  </span>
                  <Money cents={a.availableCents} className="text-green-deep" />
                </div>
                <p className="label-xs mt-1">
                  {formatBRL(a.pendingCents)} pendentes · Pix{" "}
                  {a.pixKey ?? "não cadastrado"}
                </p>
              </li>
            ))}
          </ul>
          {data?.perAffiliate.length === 0 ? <Empty>Nada a pagar.</Empty> : null}
        </Card>

        <Card title="Saques solicitados">
          <ul className="divide-y divide-line">
            {data?.payoutsRequested.map((p) => (
              <li key={p.id} className="flex items-center gap-3 px-4 py-3 text-sm">
                <span className="tnum flex-1 truncate text-muted">{p.pixKey}</span>
                <Money cents={p.amountCents} />
                <Button
                  variant="ghost"
                  className="px-2 py-1 text-xs"
                  onClick={() => pay.mutate(p.id)}
                >
                  marcar pago
                </Button>
              </li>
            ))}
          </ul>
          {data?.payoutsRequested.length === 0 ? <Empty>Nenhum saque pendente.</Empty> : null}
        </Card>
      </div>
    </PanelShell>
  );
}

/* ------------------------------ sorteios ----------------------------- */

export function AdminSorteios() {
  const qc = useQueryClient();
  const { data } = useQuery<CampaignRow[]>({ queryKey: ["/api/admin/campaigns"] });
  const [selected, setSelected] = useState<string | null>(null);
  const [contest, setContest] = useState("");
  const [prizes, setPrizes] = useState(["", "", "", "", ""]);
  const [result, setResult] = useState<{ resultNumber: number; seed: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/admin/campaigns/${selected}/draw`, {
        federalContest: Number(contest),
        federalPrizes: prizes,
      });
      return (await res.json()) as { resultNumber: number; seed: string };
    },
    onSuccess: (r) => {
      setResult(r);
      qc.invalidateQueries();
    },
    onError: (err: Error) => setError(err.message),
  });

  const live = data?.filter((c) => c.campaign.status === "published") ?? [];

  return (
    <PanelShell title="Sorteios">
      <Card title="Executar sorteio">
        <div className="space-y-3 p-4">
          <p className="text-sm text-muted">
            O hash da semente foi publicado antes da primeira venda. O número sai de
            HMAC(semente, os 5 prêmios do concurso) — qualquer pessoa refaz a conta.
          </p>

          <div>
            <label htmlFor="campanha" className="label-xs">Campanha</label>
            <select
              id="campanha"
              value={selected ?? ""}
              onChange={(e) => setSelected(e.target.value)}
              className="mt-1 w-full rounded-md border border-line-2 px-3 py-2 text-sm"
            >
              <option value="">selecione</option>
              {live.map((c) => (
                <option key={c.campaign.id} value={c.campaign.id}>
                  {c.campaign.prizeTitle} ({groupNumber(c.campaign.totalQuotas)} cotas)
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="concurso" className="label-xs">Concurso da Loteria Federal</label>
            <input
              id="concurso"
              value={contest}
              onChange={(e) => setContest(e.target.value.replace(/\D/g, ""))}
              className="tnum mt-1 w-full rounded-md border border-line-2 px-3 py-2 text-sm"
            />
          </div>

          <div>
            <span className="label-xs">Os 5 prêmios, na ordem</span>
            <div className="mt-1 grid grid-cols-5 gap-1">
              {prizes.map((p, i) => (
                <input
                  key={i}
                  id={`premio-${i + 1}`}
                  aria-label={`Prêmio ${i + 1}`}
                  value={p}
                  maxLength={5}
                  onChange={(e) => {
                    const next = [...prizes];
                    next[i] = e.target.value.replace(/\D/g, "");
                    setPrizes(next);
                  }}
                  className="tnum rounded-md border border-line-2 px-2 py-2 text-center text-sm"
                />
              ))}
            </div>
          </div>

          {error ? (
            <p className="rounded-md bg-red-soft px-3 py-2 text-sm text-red">{error}</p>
          ) : null}

          <Button
            disabled={!selected || prizes.some((p) => !p) || run.isPending}
            onClick={() => {
              setError(null);
              run.mutate();
            }}
          >
            Executar sorteio
          </Button>

          {result ? (
            <div className="rounded-md bg-green-soft p-3 text-sm text-green-deep">
              <p className="font-display text-lg font-bold">
                Número sorteado: {groupNumber(result.resultNumber)}
              </p>
              <p className="tnum mt-1 break-all text-[11px]">semente: {result.seed}</p>
            </div>
          ) : null}
        </div>
      </Card>
    </PanelShell>
  );
}

/* --------------------------- configurações --------------------------- */

/** Segundo fator: gera o segredo, confirma com um código e só então grava. */
function TwoFactorCard() {
  const qc = useQueryClient();
  const { data } = useQuery<{ enabled: boolean }>({ queryKey: ["/api/admin/2fa"] });
  const [setup, setSetup] = useState<{ secret: string; otpauth: string; qr: string } | null>(null);
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  const start = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/admin/2fa/setup");
      return (await res.json()) as { secret: string; otpauth: string; qr: string };
    },
    onSuccess: setSetup,
    onError: (err: Error) => setError(err.message),
  });

  const enable = useMutation({
    mutationFn: () => apiRequest("POST", "/api/admin/2fa/enable", { code }),
    onSuccess: () => {
      setSetup(null);
      setCode("");
      setError(null);
      qc.invalidateQueries({ queryKey: ["/api/admin/2fa"] });
    },
    onError: (err: Error) => setError(err.message),
  });

  const disable = useMutation({
    mutationFn: () => apiRequest("POST", "/api/admin/2fa/disable", { code, password }),
    onSuccess: () => {
      setCode("");
      setPassword("");
      setError(null);
      qc.invalidateQueries({ queryKey: ["/api/admin/2fa"] });
    },
    onError: (err: Error) => setError(err.message),
  });

  return (
    <Card
      title="Segundo fator"
      right={<Pill status={data?.enabled ? "paid" : "pending"}>
        {data?.enabled ? "ativo" : "desligado"}
      </Pill>}
    >
      <div className="space-y-3 p-4">
        {error ? (
          <p className="rounded-md bg-red-soft px-3 py-2 text-sm text-red">{error}</p>
        ) : null}

        {!data?.enabled && !setup ? (
          <>
            <p className="text-sm text-ink-2">
              A conta do administrador move dinheiro e publica campanha. Com o segundo fator,
              a senha sozinha deixa de ser suficiente para entrar.
            </p>
            <Button onClick={() => start.mutate()}>Ativar segundo fator</Button>
          </>
        ) : null}

        {setup ? (
          <>
            <p className="text-sm text-ink-2">
              Cadastre no aplicativo autenticador e confirme com o código que aparecer.
            </p>
            <div className="flex flex-wrap items-start gap-4 rounded-md bg-mist p-3">
              <img
                src={setup.qr}
                alt="QR Code para cadastrar no aplicativo autenticador"
                className="h-36 w-36 rounded-md border border-line bg-white"
              />
              <div className="min-w-[12rem] flex-1">
                <p className="label-xs">Ou digite esta chave</p>
                <p className="tnum mt-1 break-all text-sm">
                  {setup.secret.replace(/(.{4})/g, "$1 ").trim()}
                </p>
              </div>
            </div>
            <div className="flex gap-2">
              <input
                id="totp-confirm"
                aria-label="Código do autenticador"
                value={code}
                inputMode="numeric"
                maxLength={6}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                className="tnum w-32 rounded-md border border-line-2 px-3 py-2 tracking-[0.2em]"
              />
              <Button onClick={() => enable.mutate()} disabled={code.length !== 6}>
                Confirmar
              </Button>
            </div>
          </>
        ) : null}

        {data?.enabled ? (
          <>
            <p className="text-sm text-ink-2">
              Para desligar, confirme com a senha e um código — sessão roubada não desarma
              o segundo fator sozinha.
            </p>
            <div className="flex flex-wrap gap-2">
              <input
                id="totp-password"
                type="password"
                aria-label="Senha"
                placeholder="senha"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-40 rounded-md border border-line-2 px-3 py-2 text-sm"
              />
              <input
                id="totp-disable"
                aria-label="Código do autenticador"
                value={code}
                inputMode="numeric"
                maxLength={6}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                className="tnum w-32 rounded-md border border-line-2 px-3 py-2 tracking-[0.2em]"
              />
              <Button
                variant="ghost"
                onClick={() => disable.mutate()}
                disabled={code.length !== 6 || password.length < 4}
              >
                Desligar
              </Button>
            </div>
          </>
        ) : null}
      </div>
    </Card>
  );
}

export function AdminConfiguracoes() {
  const { data } = useQuery<
    { id: string; action: string; entity: string; createdAt: string; actorRole: string }[]
  >({ queryKey: ["/api/admin/audit"] });

  return (
    <PanelShell title="Configurações">
      <div className="mb-3">
        <TwoFactorCard />
      </div>
      <Card title="Trilha de auditoria" right={<span className="label-xs">últimas 200 ações</span>}>
        <ul className="divide-y divide-line">
          {data?.map((a) => (
            <li key={a.id} className="flex items-center gap-3 px-4 py-2 text-sm">
              <span className="tnum text-[11px] text-muted">
                {new Date(a.createdAt).toLocaleString("pt-BR")}
              </span>
              <span className="tnum flex-1">{a.action}</span>
              <span className="label-xs">{a.actorRole}</span>
            </li>
          ))}
        </ul>
        {data?.length === 0 ? <Empty>Nenhuma ação registrada.</Empty> : null}
      </Card>
    </PanelShell>
  );
}
