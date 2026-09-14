import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { PanelShell } from "@/components/AppShell";
import { Card, Button, Money, Pill, Empty, Kpi } from "@/components/bits";
import { apiRequest } from "@/lib/queryClient";
import { formatBRL, formatQuota, groupNumber } from "@shared/format";
import { pos, inPos, printTicket } from "@/lib/pos";

interface Overview {
  seller: { code: string; commissionPct: number | null };
  /** Só os meios que a administração deixou ligados. */
  meios: ("dinheiro" | "cartao_maquininha" | "pix_maquininha")[];
  campanhas: {
    id: string;
    slug: string;
    title: string;
    prizeTitle: string;
    priceCents: number;
    minPerOrder: number;
    maxPerOrder: number;
    totalQuotas: number;
    pct: number;
  }[];
  hoje: { vendas: number; cotas: number; totalCents: number };
  acerto: {
    orderCount: number;
    grossCents: number;
    commissionCents: number;
    netCents: number;
  };
}

type Etapa = "montando" | "cobrando" | "concluida";

/* ------------------------------ nova venda ------------------------------ */

export function CambistaVenda() {
  const qc = useQueryClient();
  const { data } = useQuery<Overview>({ queryKey: ["/api/seller/overview"] });

  const [campanha, setCampanha] = useState<string>("");
  const [quantidade, setQuantidade] = useState(1);
  const [comprador, setComprador] = useState({ name: "", phone: "", cpf: "" });
  const [etapa, setEtapa] = useState<Etapa>("montando");
  const [venda, setVenda] = useState<{
    code: number;
    numbers: number[];
    amountCents: number;
  } | null>(null);
  const [premios, setPremios] = useState<string[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [cobrando, setCobrando] = useState(false);

  const escolhida =
    data?.campanhas.find((c) => c.id === campanha) ?? data?.campanhas[0] ?? null;

  const reservar = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/seller/sales", {
        campaignId: escolhida!.id,
        quantity: quantidade,
        buyer: {
          name: comprador.name,
          phone: comprador.phone,
          cpf: comprador.cpf || undefined,
        },
      });
      return (await res.json()) as {
        code: number;
        numbers: number[];
        amountCents: number;
      };
    },
    onSuccess: (v) => {
      setVenda(v);
      setEtapa("cobrando");
      setErro(null);
    },
    onError: (err: Error) => setErro(err.message),
  });

  /** Dinheiro e Pix são confirmados na hora; cartão passa pela maquininha. */
  async function confirmar(method: "dinheiro" | "cartao_maquininha" | "pix_maquininha") {
    if (!venda) return;
    setErro(null);
    setCobrando(true);

    try {
      let posAuthCode: string | undefined;
      let posTerminal: string | undefined;

      const ponte = pos();
      if (method === "cartao_maquininha" && ponte) {
        const resultado = await ponte.pay({
          amountCents: venda.amountCents,
          orderCode: venda.code,
          method: "credito",
        });
        if (!resultado.ok) {
          throw new Error(resultado.message ?? "A maquininha recusou o pagamento.");
        }
        posAuthCode = resultado.authCode;
        posTerminal = resultado.terminal;
      }

      const res = await apiRequest(
        "POST",
        `/api/seller/sales/${venda.code}/confirm`,
        { method, posAuthCode, posTerminal },
      );
      const confirmada = (await res.json()) as { prizes: string[] };

      setPremios(confirmada.prizes ?? []);
      setEtapa("concluida");
      qc.invalidateQueries();
      await printTicket(venda.code);
    } catch (err) {
      setErro((err as Error).message);
    } finally {
      setCobrando(false);
    }
  }

  const cancelar = useMutation({
    mutationFn: () => apiRequest("POST", `/api/seller/sales/${venda!.code}/cancel`),
    onSuccess: () => {
      setVenda(null);
      setEtapa("montando");
      setErro(null);
      qc.invalidateQueries();
    },
  });

  function novaVenda() {
    setVenda(null);
    setPremios([]);
    setQuantidade(1);
    setComprador({ name: "", phone: "", cpf: "" });
    setEtapa("montando");
    setErro(null);
  }

  return (
    <PanelShell title="Nova venda">
      {data ? (
        <div className="mb-3 grid gap-2 sm:grid-cols-3">
          <Kpi label="Vendas hoje" value={String(data.hoje.vendas)} />
          <Kpi label="Cotas hoje" value={groupNumber(data.hoje.cotas)} />
          <Kpi
            label="A acertar"
            value={formatBRL(data.acerto.netCents)}
            hint={`${data.acerto.orderCount} venda(s) em aberto`}
            highlight
          />
        </div>
      ) : null}

      {erro ? (
        <p className="mb-3 rounded-md bg-red-soft px-3 py-2 text-sm text-red">{erro}</p>
      ) : null}

      {etapa === "montando" && escolhida ? (
        <Card title="Montar a venda">
          <div className="space-y-4 p-4">
            <div>
              <label htmlFor="campanha" className="label-xs">Rifa</label>
              <select
                id="campanha"
                value={escolhida.id}
                onChange={(e) => setCampanha(e.target.value)}
                className="mt-1 w-full rounded-md border border-line-2 px-3 py-2 text-sm"
              >
                {data?.campanhas.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.prizeTitle} — {formatBRL(c.priceCents)} a cota
                  </option>
                ))}
              </select>
              <p className="label-xs mt-1">sua comissão: {escolhida.pct}%</p>
            </div>

            <div>
              <span className="label-xs">Quantas cotas</span>
              <div className="mt-1 grid grid-cols-4 gap-2">
                {[1, 5, 10, 25].map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setQuantidade(n)}
                    className={`tnum rounded-md border px-2 py-2 text-sm ${
                      quantidade === n
                        ? "border-green bg-green text-on-green"
                        : "border-line-2 bg-white text-ink-2"
                    }`}
                  >
                    {n}
                  </button>
                ))}
              </div>
              <input
                id="quantidade"
                type="number"
                min={escolhida.minPerOrder}
                max={escolhida.maxPerOrder}
                value={quantidade}
                onChange={(e) => setQuantidade(Number(e.target.value))}
                className="tnum mt-2 w-full rounded-md border border-line-2 px-3 py-2 text-lg"
              />
            </div>

            <div className="space-y-2">
              <div>
                <label htmlFor="nome" className="label-xs">Nome do apostador</label>
                <input
                  id="nome"
                  value={comprador.name}
                  onChange={(e) => setComprador({ ...comprador, name: e.target.value })}
                  className="mt-1 w-full rounded-md border border-line-2 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label htmlFor="telefone" className="label-xs">WhatsApp</label>
                <input
                  id="telefone"
                  inputMode="tel"
                  value={comprador.phone}
                  onChange={(e) => setComprador({ ...comprador, phone: e.target.value })}
                  className="tnum mt-1 w-full rounded-md border border-line-2 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label htmlFor="cpf" className="label-xs">CPF (opcional)</label>
                <input
                  id="cpf"
                  inputMode="numeric"
                  value={comprador.cpf}
                  onChange={(e) => setComprador({ ...comprador, cpf: e.target.value })}
                  className="tnum mt-1 w-full rounded-md border border-line-2 px-3 py-2 text-sm"
                />
              </div>
            </div>

            <div className="flex items-center justify-between rounded-md bg-mist px-3 py-2">
              <span className="label-xs">Total a cobrar</span>
              <span className="tnum text-lg">
                {formatBRL(quantidade * escolhida.priceCents)}
              </span>
            </div>

            <Button
              className="w-full"
              disabled={
                reservar.isPending ||
                comprador.name.trim().length < 2 ||
                comprador.phone.replace(/\D/g, "").length < 10
              }
              onClick={() => reservar.mutate()}
            >
              {reservar.isPending ? "Reservando…" : "Reservar cotas"}
            </Button>
            <p className="text-[11px] text-muted">
              As cotas são reservadas antes da cobrança — cartão aprovado com número já
              vendido seria o pior dos mundos.
            </p>
          </div>
        </Card>
      ) : null}

      {etapa === "cobrando" && venda ? (
        <Card title={`Venda #${venda.code}`}>
          <div className="space-y-4 p-4">
            <div className="flex items-baseline justify-between">
              <span className="label-xs">{venda.numbers.length} cota(s) reservada(s)</span>
              <span className="tnum text-2xl text-green-deep">
                {formatBRL(venda.amountCents)}
              </span>
            </div>

            <div className="flex flex-wrap gap-1">
              {venda.numbers.slice(0, 40).map((n) => (
                <span
                  key={n}
                  className="tnum rounded border border-dashed border-yellow-deep bg-yellow-soft px-1.5 py-[2px] text-[11px] text-yellow-deep"
                >
                  {formatQuota(n, escolhida?.totalQuotas ?? 1000)}
                </span>
              ))}
              {venda.numbers.length > 40 ? (
                <span className="text-[11px] text-muted">
                  e mais {venda.numbers.length - 40}
                </span>
              ) : null}
            </div>

            <div className="space-y-2">
              <span className="label-xs">Como o apostador pagou</span>
              {(data?.meios ?? []).map((meio, i) => (
                <Button
                  key={meio}
                  variant={i === 0 ? "primary" : "ghost"}
                  className="w-full"
                  disabled={cobrando}
                  onClick={() => confirmar(meio)}
                >
                  {meio === "dinheiro"
                    ? "Dinheiro"
                    : meio === "pix_maquininha"
                      ? "Pix"
                      : inPos()
                        ? "Cobrar no cartão (maquininha)"
                        : "Cartão — cobrado à parte"}
                </Button>
              ))}
              {(data?.meios ?? []).length === 0 ? (
                <p className="rounded-md bg-red-soft px-3 py-2 text-xs text-red">
                  A administração desligou todos os meios de venda na mão. Fale com ela
                  antes de cobrar.
                </p>
              ) : null}
            </div>

            {!inPos() && (data?.meios ?? []).includes("cartao_maquininha") ? (
              <p className="rounded-md bg-yellow-soft px-3 py-2 text-[11px] text-yellow-deep">
                Este aparelho não tem maquininha integrada. Cobre no aparelho da
                adquirente e confirme aqui — a venda fica registrada igual.
              </p>
            ) : (
              <p className="label-xs">
                maquininha detectada: {pos()?.terminal}
              </p>
            )}

            <Button
              variant="ghost"
              className="w-full"
              disabled={cobrando || cancelar.isPending}
              onClick={() => cancelar.mutate()}
            >
              Cancelar e devolver as cotas
            </Button>
          </div>
        </Card>
      ) : null}

      {etapa === "concluida" && venda ? (
        <Card title="Venda concluída">
          <div className="space-y-3 p-4">
            <div className="rounded-md bg-green-soft px-3 py-3 text-center text-green-deep">
              <p className="font-display text-base font-bold">
                Venda #{venda.code} registrada
              </p>
              <p className="tnum mt-1 text-2xl">{formatBRL(venda.amountCents)}</p>
            </div>

            {premios.length > 0 ? (
              <div className="rounded-md border-2 border-yellow bg-yellow-soft px-3 py-3 text-center text-sm">
                <p className="font-display font-bold text-yellow-deep">
                  O apostador tirou cota premiada!
                </p>
                <ul className="mt-1">
                  {premios.map((p) => (
                    <li key={p} className="tnum text-ink-2">{p}</li>
                  ))}
                </ul>
              </div>
            ) : null}

            <Button className="w-full" onClick={() => printTicket(venda.code)}>
              Imprimir bilhete de novo
            </Button>
            <Button variant="ghost" className="w-full" onClick={novaVenda}>
              Nova venda
            </Button>
          </div>
        </Card>
      ) : null}
    </PanelShell>
  );
}

/* ----------------------------- minhas vendas ----------------------------- */

export function CambistaVendas() {
  const { data } = useQuery<
    {
      code: number;
      status: string;
      method: string;
      quantity: number;
      amountCents: number;
      paidAt: string | null;
      buyerName: string;
      campaignTitle: string;
      settlementId: string | null;
    }[]
  >({ queryKey: ["/api/seller/sales"] });

  const METODO: Record<string, string> = {
    dinheiro: "dinheiro",
    cartao_maquininha: "cartão",
    pix_maquininha: "pix",
    pix_online: "pix online",
  };

  return (
    <PanelShell title="Minhas vendas">
      <Card>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[620px] text-sm">
            <thead>
              <tr className="bg-mist">
                {["Venda", "Apostador", "Rifa", "Cotas", "Valor", "Forma", "Situação", ""].map(
                  (h) => (
                    <th key={h} className="label-xs px-3 py-2 text-left">{h}</th>
                  ),
                )}
              </tr>
            </thead>
            <tbody>
              {data?.map((v) => (
                <tr key={v.code} className="border-t border-line">
                  <td className="tnum px-3 py-2">#{v.code}</td>
                  <td className="px-3 py-2">{v.buyerName}</td>
                  <td className="px-3 py-2 text-ink-2">{v.campaignTitle}</td>
                  <td className="tnum px-3 py-2">{v.quantity}</td>
                  <td className="px-3 py-2"><Money cents={v.amountCents} /></td>
                  <td className="px-3 py-2 text-xs text-muted">{METODO[v.method] ?? v.method}</td>
                  <td className="px-3 py-2">
                    <Pill status={v.status} />
                    {v.settlementId ? (
                      <span className="label-xs ml-1">acertada</span>
                    ) : null}
                  </td>
                  <td className="px-3 py-2">
                    <Button
                      variant="ghost"
                      className="px-2 py-1 text-xs"
                      onClick={() => printTicket(v.code)}
                    >
                      bilhete
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {data?.length === 0 ? <Empty>Nenhuma venda registrada.</Empty> : null}
      </Card>
    </PanelShell>
  );
}

/* ------------------------------- meu acerto ------------------------------ */

export function CambistaAcerto() {
  const { data } = useQuery<{
    aberto: {
      orderCount: number;
      grossCents: number;
      commissionCents: number;
      netCents: number;
    };
    historico: {
      settlement: {
        id: string;
        grossCents: number;
        commissionCents: number;
        netCents: number;
        orderCount: number;
        status: string;
        createdAt: string;
      };
    }[];
  }>({ queryKey: ["/api/seller/settlement"] });

  return (
    <PanelShell title="Meu acerto">
      {!data ? (
        <Empty>Carregando…</Empty>
      ) : (
        <div className="space-y-3">
          <Card title="Em aberto">
            <div className="space-y-2 p-4 text-sm">
              <div className="flex justify-between">
                <span className="text-ink-2">
                  {data.aberto.orderCount} venda(s) recolhida(s)
                </span>
                <Money cents={data.aberto.grossCents} />
              </div>
              <div className="flex justify-between text-green-deep">
                <span>Sua comissão</span>
                <span className="tnum">− {formatBRL(data.aberto.commissionCents)}</span>
              </div>
              <div className="flex justify-between border-t border-line pt-2 font-medium">
                <span>Você entrega à administradora</span>
                <Money cents={data.aberto.netCents} className="text-lg" />
              </div>
              <p className="text-[11px] text-muted">
                O acerto é fechado pela administradora. Depois de fechado, estas vendas
                saem daqui e vão para o histórico.
              </p>
            </div>
          </Card>

          <Card title="Acertos anteriores">
            {data.historico.length === 0 ? (
              <Empty>Nenhum acerto fechado ainda.</Empty>
            ) : (
              <ul className="divide-y divide-line">
                {data.historico.map((h) => (
                  <li
                    key={h.settlement.id}
                    className="flex items-center gap-3 px-4 py-3 text-sm"
                  >
                    <span className="tnum text-xs text-muted">
                      {new Date(h.settlement.createdAt).toLocaleDateString("pt-BR")}
                    </span>
                    <span className="tnum flex-1 text-xs text-muted">
                      {h.settlement.orderCount} venda(s)
                    </span>
                    <Money cents={h.settlement.netCents} />
                    <Pill status={h.settlement.status === "pago" ? "paid" : "pending"}>
                      {h.settlement.status === "pago" ? "entregue" : "em aberto"}
                    </Pill>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      )}
    </PanelShell>
  );
}
