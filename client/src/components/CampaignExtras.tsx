import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, Button, Empty, Pill } from "@/components/bits";
import { apiRequest } from "@/lib/queryClient";
import { formatQuota, groupNumber } from "@shared/format";

interface Pkg {
  id?: string;
  quantity: number;
  discountPct: number;
  highlight: boolean;
}

interface Prized {
  id: string;
  number: number;
  prizeLabel: string;
  claimedByOrderId: string | null;
}

/** Pacotes com desconto e cotas premiadas — as duas alavancas de conversão. */
export function CampaignExtras({
  campaignId,
  totalQuotas,
}: {
  campaignId: string;
  totalQuotas: number;
}) {
  const qc = useQueryClient();
  const [error, setError] = useState<string | null>(null);

  /* ----------------------------- pacotes ----------------------------- */

  // Os pacotes atuais chegam na página pública da rifa; aqui o admin
  // define o conjunto novo e o PUT substitui o anterior inteiro.
  const [packages, setPackages] = useState<Pkg[]>([
    { quantity: 5, discountPct: 0, highlight: false },
    { quantity: 10, discountPct: 5, highlight: true },
    { quantity: 25, discountPct: 8, highlight: false },
    { quantity: 50, discountPct: 12, highlight: false },
  ]);

  const savePackages = useMutation({
    mutationFn: () =>
      apiRequest("PUT", `/api/admin/campaigns/${campaignId}/packages`, { packages }),
    onSuccess: () => {
      setError(null);
      qc.invalidateQueries();
    },
    onError: (err: Error) => setError(err.message),
  });

  /* ------------------------- cotas premiadas ------------------------- */

  const { data: prized } = useQuery<Prized[]>({
    queryKey: [`/api/admin/campaigns/${campaignId}/prized`],
  });

  const [prize, setPrize] = useState({ prizeLabel: "", quantity: 1 });

  const drawPrized = useMutation({
    mutationFn: () =>
      apiRequest("POST", `/api/admin/campaigns/${campaignId}/prized`, prize),
    onSuccess: () => {
      setPrize({ prizeLabel: "", quantity: 1 });
      setError(null);
      qc.invalidateQueries({ queryKey: [`/api/admin/campaigns/${campaignId}/prized`] });
    },
    onError: (err: Error) => setError(err.message),
  });

  const removePrized = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/admin/prized/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: [`/api/admin/campaigns/${campaignId}/prized`] }),
    onError: (err: Error) => setError(err.message),
  });

  const claimed = prized?.filter((p) => p.claimedByOrderId).length ?? 0;

  return (
    <div className="grid gap-3 lg:grid-cols-2">
      <Card title="Pacotes com desconto">
        <div className="space-y-3 p-4">
          <p className="text-xs text-muted">
            O maior pacote que a quantidade alcança é o que vale: quem leva 37 cotas
            paga o desconto do pacote de 25.
          </p>

          {packages.map((p, i) => (
            <div key={i} className="flex items-center gap-2">
              <label htmlFor={`pkg-qty-${i}`} className="label-xs w-16">
                cotas
              </label>
              <input
                id={`pkg-qty-${i}`}
                type="number"
                min={1}
                value={p.quantity}
                onChange={(e) => {
                  const next = [...packages];
                  next[i] = { ...p, quantity: Number(e.target.value) };
                  setPackages(next);
                }}
                className="tnum w-24 rounded-md border border-line-2 px-2 py-1.5 text-sm"
              />
              <label htmlFor={`pkg-pct-${i}`} className="label-xs">
                desconto %
              </label>
              <input
                id={`pkg-pct-${i}`}
                type="number"
                min={0}
                max={50}
                value={p.discountPct}
                onChange={(e) => {
                  const next = [...packages];
                  next[i] = { ...p, discountPct: Number(e.target.value) };
                  setPackages(next);
                }}
                className="tnum w-20 rounded-md border border-line-2 px-2 py-1.5 text-sm"
              />
              <label className="flex items-center gap-1 text-xs text-muted">
                <input
                  type="checkbox"
                  checked={p.highlight}
                  onChange={(e) => {
                    const next = packages.map((x, j) => ({
                      ...x,
                      highlight: j === i ? e.target.checked : false,
                    }));
                    setPackages(next);
                  }}
                />
                destaque
              </label>
              <Button
                variant="ghost"
                className="px-2 py-1 text-xs"
                onClick={() => setPackages(packages.filter((_, j) => j !== i))}
              >
                −
              </Button>
            </div>
          ))}

          <div className="flex gap-2">
            <Button
              variant="ghost"
              className="px-3 py-1 text-xs"
              onClick={() =>
                setPackages([...packages, { quantity: 100, discountPct: 15, highlight: false }])
              }
            >
              adicionar pacote
            </Button>
            <Button onClick={() => savePackages.mutate()} className="px-3 py-1 text-xs">
              Salvar pacotes
            </Button>
          </div>
        </div>
      </Card>

      <Card
        title="Cotas premiadas"
        right={
          prized && prized.length > 0 ? (
            <Pill status={claimed > 0 ? "paid" : "pending"}>
              {`${prized.length - claimed} de ${prized.length} em jogo`}
            </Pill>
          ) : null
        }
      >
        <div className="space-y-3 p-4">
          <p className="text-xs text-muted">
            Os números são sorteados aqui e ficam escondidos do público — quem soubesse
            qual é compraria só aquele.
          </p>

          <div className="flex flex-wrap items-end gap-2">
            <div>
              <label htmlFor="prize-label" className="label-xs">Prêmio</label>
              <input
                id="prize-label"
                value={prize.prizeLabel}
                placeholder="R$ 100 no Pix"
                onChange={(e) => setPrize({ ...prize, prizeLabel: e.target.value })}
                className="mt-1 w-44 rounded-md border border-line-2 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label htmlFor="prize-qty" className="label-xs">Quantas cotas</label>
              <input
                id="prize-qty"
                type="number"
                min={1}
                max={500}
                value={prize.quantity}
                onChange={(e) => setPrize({ ...prize, quantity: Number(e.target.value) })}
                className="tnum mt-1 w-24 rounded-md border border-line-2 px-3 py-2 text-sm"
              />
            </div>
            <Button
              onClick={() => drawPrized.mutate()}
              disabled={prize.prizeLabel.length < 2 || drawPrized.isPending}
            >
              Sortear
            </Button>
          </div>

          {error ? (
            <p className="rounded-md bg-red-soft px-3 py-2 text-sm text-red">{error}</p>
          ) : null}

          {!prized?.length ? (
            <Empty>Nenhuma cota premiada nesta rifa.</Empty>
          ) : (
            <ul className="max-h-56 divide-y divide-line overflow-y-auto">
              {prized.map((p) => (
                <li key={p.id} className="flex items-center gap-2 py-1.5 text-sm">
                  <span className="tnum w-24">{formatQuota(p.number, totalQuotas)}</span>
                  <span className="flex-1 text-ink-2">{p.prizeLabel}</span>
                  {p.claimedByOrderId ? (
                    <Pill status="paid">ganha</Pill>
                  ) : (
                    <Button
                      variant="ghost"
                      className="px-2 py-0.5 text-[11px]"
                      onClick={() => removePrized.mutate(p.id)}
                    >
                      remover
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          )}

          <p className="text-[11px] text-muted">
            Faixa desta rifa: {formatQuota(1, totalQuotas)} a {groupNumber(totalQuotas)}.
          </p>
        </div>
      </Card>
    </div>
  );
}
