import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { PanelShell } from "@/components/AppShell";
import { Card, Button, Money, Pill, Empty } from "@/components/bits";
import { apiRequest } from "@/lib/queryClient";
import { formatBRL } from "@shared/format";

interface SaldoAberto {
  sellerId: string;
  code: string;
  name: string;
  orderCount: number;
  grossCents: number;
  commissionCents: number;
  netCents: number;
}

/**
 * Cambistas e acertos.
 *
 * O cambista está com o dinheiro na mão: esta tela é a cobrança. Fechar o
 * acerto carimba as vendas incluídas, para nenhuma entrar em dois acertos.
 */
export function AdminCambistas() {
  const qc = useQueryClient();
  const { data } = useQuery<{
    emAberto: SaldoAberto[];
    historico: {
      settlement: {
        id: string;
        netCents: number;
        grossCents: number;
        commissionCents: number;
        orderCount: number;
        status: string;
        createdAt: string;
      };
      sellerCode: string;
      sellerName: string;
    }[];
  }>({ queryKey: ["/api/admin/settlements"] });

  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "",
    code: "",
    phone: "",
    commissionPct: "",
  });
  const [erro, setErro] = useState<string | null>(null);

  const criar = useMutation({
    mutationFn: () => apiRequest("POST", "/api/admin/sellers", form),
    onSuccess: () => {
      setForm({ name: "", email: "", password: "", code: "", phone: "", commissionPct: "" });
      setErro(null);
      qc.invalidateQueries();
    },
    onError: (err: Error) => setErro(err.message),
  });

  const fechar = useMutation({
    mutationFn: (sellerId: string) =>
      apiRequest("POST", `/api/admin/settlements/${sellerId}/close`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/admin/settlements"] }),
    onError: (err: Error) => setErro(err.message),
  });

  const receber = useMutation({
    mutationFn: (id: string) => apiRequest("POST", `/api/admin/settlements/${id}/paid`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/admin/settlements"] }),
  });

  const totalAberto =
    data?.emAberto.reduce((soma, s) => soma + s.netCents, 0) ?? 0;

  return (
    <PanelShell title="Cambistas">
      {erro ? (
        <p className="mb-3 rounded-md bg-red-soft px-3 py-2 text-sm text-red">{erro}</p>
      ) : null}

      <div className="grid gap-3 lg:grid-cols-[1.4fr_1fr]">
        <Card
          title="A receber dos cambistas"
          right={<span className="tnum text-sm text-green-deep">{formatBRL(totalAberto)}</span>}
        >
          {data?.emAberto.length === 0 ? (
            <Empty>Nenhuma venda física em aberto.</Empty>
          ) : (
            <ul className="divide-y divide-line">
              {data?.emAberto.map((s) => (
                <li key={s.sellerId} className="px-4 py-3 text-sm">
                  <div className="flex items-center justify-between">
                    <span>
                      {s.name} · <span className="tnum text-muted">{s.code}</span>
                    </span>
                    <Money cents={s.netCents} className="text-green-deep" />
                  </div>
                  <div className="mt-1 flex items-center justify-between">
                    <span className="label-xs">
                      {s.orderCount} venda(s) · recolheu {formatBRL(s.grossCents)} · comissão{" "}
                      {formatBRL(s.commissionCents)}
                    </span>
                    <Button
                      variant="ghost"
                      className="px-2 py-1 text-xs"
                      onClick={() => fechar.mutate(s.sellerId)}
                    >
                      fechar acerto
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="Novo cambista">
          <div className="space-y-3 p-4">
            {(
              [
                ["name", "Nome"],
                ["email", "E-mail"],
                ["phone", "WhatsApp"],
                ["password", "Senha"],
                ["code", "Código"],
                ["commissionPct", "Comissão % (opcional)"],
              ] as const
            ).map(([campo, rotulo]) => (
              <div key={campo}>
                <label htmlFor={`cambista-${campo}`} className="label-xs">
                  {rotulo}
                </label>
                <input
                  id={`cambista-${campo}`}
                  type={campo === "password" ? "password" : "text"}
                  value={form[campo]}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      [campo]:
                        campo === "code" ? e.target.value.toUpperCase() : e.target.value,
                    })
                  }
                  className={`mt-1 w-full rounded-md border border-line-2 px-3 py-2 text-sm ${
                    campo === "commissionPct" || campo === "phone" ? "tnum" : ""
                  }`}
                />
              </div>
            ))}
            <Button
              className="w-full"
              disabled={criar.isPending}
              onClick={() => {
                setErro(null);
                criar.mutate();
              }}
            >
              Cadastrar cambista
            </Button>
            <p className="text-[11px] text-muted">
              O cambista entra no mesmo app, com acesso só à tela de venda, às vendas dele
              e ao próprio acerto.
            </p>
          </div>
        </Card>
      </div>

      <div className="mt-3">
        <Card title="Acertos fechados">
          {data?.historico.length === 0 ? (
            <Empty>Nenhum acerto fechado.</Empty>
          ) : (
            <ul className="divide-y divide-line">
              {data?.historico.map((h) => (
                <li key={h.settlement.id} className="flex items-center gap-3 px-4 py-3 text-sm">
                  <span className="tnum text-xs text-muted">
                    {new Date(h.settlement.createdAt).toLocaleDateString("pt-BR")}
                  </span>
                  <span className="flex-1">
                    {h.sellerName} · <span className="tnum text-muted">{h.sellerCode}</span>
                  </span>
                  <span className="label-xs">{h.settlement.orderCount} venda(s)</span>
                  <Money cents={h.settlement.netCents} />
                  <Pill status={h.settlement.status === "pago" ? "paid" : "pending"}>
                    {h.settlement.status === "pago" ? "recebido" : "a receber"}
                  </Pill>
                  {h.settlement.status !== "pago" ? (
                    <Button
                      variant="ghost"
                      className="px-2 py-1 text-xs"
                      onClick={() => receber.mutate(h.settlement.id)}
                    >
                      recebi
                    </Button>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </PanelShell>
  );
}
