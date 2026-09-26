import { useEffect, useState } from "react";
import { Link } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { PublicShell } from "@/components/AppShell";
import { Button, Card, Money, Pill, Empty } from "@/components/bits";
import { Conversa, type Mensagem } from "@/components/Conversa";
import { apiRequest, ApiError } from "@/lib/queryClient";
import { lerImagem } from "@/lib/anexo";
import { formatQuota, maskPhone, maskCpf, cpfValido } from "@shared/format";
import {
  NOME_STATUS_CHAMADO,
  PILL_CHAMADO,
  bloqueioDoReembolso,
  type StatusChamado,
} from "@shared/chamados";

interface OrderRow {
  order: { code: number; status: string; quantity: number; amountCents: number };
  campaign: { title: string; slug: string; totalQuotas: number; status: string };
  numbers: number[];
}

interface Conta {
  orders: OrderRow[];
  phone: string;
  cliente: string | null;
  reembolso: boolean;
}

interface ChamadoResumo {
  id: string;
  protocolo: string;
  status: StatusChamado;
  pedido: number;
  rifa: string;
  prazoEstornoAte: string | null;
  createdAt: string;
}

/** Sem senha: telefone + código de acesso. */
export default function MinhasCotas() {
  const [conta, setConta] = useState<Conta | null>(null);
  const [restaurando, setRestaurando] = useState(true);

  // Quem já confirmou o telefone nesta sessão não digita o código de novo.
  useEffect(() => {
    apiRequest("GET", "/api/public/my-quotas")
      .then((r) => r.json())
      .then((c: Conta) => setConta(c))
      .catch(() => undefined)
      .finally(() => setRestaurando(false));
  }, []);

  return (
    <PublicShell>
      <h1 className="font-display text-2xl font-extrabold">Minhas cotas</h1>
      <p className="mt-1 text-sm text-muted">
        Sem senha: confirme seu telefone e veja tudo o que você comprou.
      </p>
      {restaurando ? null : conta ? <Painel conta={conta} /> : <Entrar aoEntrar={setConta} />}
    </PublicShell>
  );
}

function Entrar({ aoEntrar }: { aoEntrar: (c: Conta) => void }) {
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [step, setStep] = useState<"phone" | "code">("phone");
  const [devCode, setDevCode] = useState<string | null>(null);
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
      return (await res.json()) as Conta;
    },
    onSuccess: aoEntrar,
    onError: (err: Error) => setError(err.message),
  });

  return (
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

        {error ? <p className="rounded-md bg-red-soft px-3 py-2 text-sm text-red">{error}</p> : null}

        <Button
          className="w-full"
          disabled={request.isPending || verify.isPending}
          onClick={() => (step === "phone" ? request.mutate() : verify.mutate())}
        >
          {step === "phone" ? "Receber código" : "Confirmar"}
        </Button>
      </div>
    </Card>
  );
}

function Painel({ conta }: { conta: Conta }) {
  const qc = useQueryClient();
  const [aba, setAba] = useState<"cotas" | "chamados">("cotas");
  const [pedindo, setPedindo] = useState<OrderRow | null>(null);
  const [chamadoAberto, setChamadoAberto] = useState<string | null>(null);

  const { data: meus } = useQuery<{ cliente: string; chamados: ChamadoResumo[] }>({
    queryKey: ["/api/public/chamados"],
    enabled: Boolean(conta.cliente),
  });
  const chamados = meus?.chamados ?? [];
  const emAndamento = new Set(
    chamados.filter((c) => c.status === "aberto" || c.status === "aprovado").map((c) => c.pedido),
  );

  return (
    <>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-2 text-sm">
        <span className="tnum text-muted">{maskPhone(conta.phone)}</span>
        {conta.cliente ? (
          <span className="rounded-md bg-mist-2 px-2 py-1 text-xs">
            Seu ID de cliente: <strong className="tnum">{conta.cliente}</strong>
          </span>
        ) : null}
      </div>

      <div className="mt-3 flex gap-1" role="tablist">
        {(
          [
            ["cotas", "Minhas compras"],
            ["chamados", `Reembolsos${chamados.length ? ` (${chamados.length})` : ""}`],
          ] as const
        ).map(([v, rotulo]) => (
          <button
            key={v}
            type="button"
            role="tab"
            aria-selected={aba === v}
            onClick={() => {
              setAba(v);
              setChamadoAberto(null);
            }}
            className={
              aba === v
                ? "rounded-md bg-green px-3 py-1.5 text-sm font-semibold text-on-green"
                : "rounded-md px-3 py-1.5 text-sm text-ink-2 hover:bg-mist-2"
            }
          >
            {rotulo}
          </button>
        ))}
      </div>

      {aba === "cotas" ? (
        <>
          {conta.orders.length === 0 ? <Empty>Nenhuma compra neste telefone.</Empty> : null}
          <div className="mt-3 space-y-3">
            {conta.orders.map((row) => {
              const podePedir =
                conta.cliente &&
                !emAndamento.has(row.order.code) &&
                !bloqueioDoReembolso({
                  estornoLigado: conta.reembolso,
                  statusPedido: row.order.status,
                  statusRifa: row.campaign.status,
                });
              return (
                <Card key={row.order.code}>
                  <div className="space-y-2 p-4">
                    <div className="flex items-center justify-between">
                      <Link href={`/r/${row.campaign.slug}`} className="font-display text-sm font-bold">
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
                            row.order.status === "paid" ? "bg-green text-on-green" : "bg-mist-2 text-muted"
                          }`}
                        >
                          {formatQuota(n, row.campaign.totalQuotas)}
                        </span>
                      ))}
                    </div>
                    {emAndamento.has(row.order.code) ? (
                      <p className="text-xs text-yellow-deep">Pedido de reembolso em andamento.</p>
                    ) : podePedir ? (
                      <button
                        type="button"
                        onClick={() => setPedindo(row)}
                        className="text-xs text-muted underline"
                      >
                        Pedir reembolso
                      </button>
                    ) : null}
                  </div>
                </Card>
              );
            })}
          </div>
        </>
      ) : chamadoAberto ? (
        <ChamadoDoComprador id={chamadoAberto} voltar={() => setChamadoAberto(null)} />
      ) : (
        <div className="mt-3">
          <Card>
            {chamados.length ? (
              <ul className="divide-y divide-line">
                {chamados.map((c) => (
                  <li key={c.id}>
                    <button
                      type="button"
                      className="w-full px-4 py-3 text-left hover:bg-mist"
                      onClick={() => setChamadoAberto(c.id)}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="tnum text-sm font-semibold">{c.protocolo}</span>
                        <Pill status={PILL_CHAMADO[c.status]}>{NOME_STATUS_CHAMADO[c.status]}</Pill>
                      </div>
                      <p className="text-xs text-muted">
                        {c.rifa} · pedido <span className="tnum">#{c.pedido}</span>
                      </p>
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <Empty>Nenhum pedido de reembolso.</Empty>
            )}
          </Card>
        </div>
      )}

      {pedindo ? (
        <PedirReembolso
          row={pedindo}
          fechar={() => setPedindo(null)}
          aoAbrir={(id) => {
            setPedindo(null);
            qc.invalidateQueries({ queryKey: ["/api/public/chamados"] });
            setAba("chamados");
            setChamadoAberto(id);
          }}
        />
      ) : null}
    </>
  );
}

function PedirReembolso({
  row,
  fechar,
  aoAbrir,
}: {
  row: OrderRow;
  fechar: () => void;
  aoAbrir: (id: string) => void;
}) {
  const [motivo, setMotivo] = useState("");
  const [cpf, setCpf] = useState("");
  const [pixChave, setPixChave] = useState("");
  const [anexo, setAnexo] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  const abrir = useMutation({
    mutationFn: async () =>
      (await (
        await apiRequest("POST", "/api/public/chamados", {
          orderCode: row.order.code,
          motivo,
          cpf,
          pixChave: pixChave || undefined,
          anexo,
        })
      ).json()) as { id: string; protocolo: string },
    onSuccess: (r) => aoAbrir(r.id),
    onError: (e: Error) => setErro(e instanceof ApiError ? e.message : "Não foi possível enviar."),
  });

  const pronto = motivo.trim().length >= 10 && cpfValido(cpf) && Boolean(anexo);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="titulo-reembolso"
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/30 p-4 sm:items-center"
    >
      <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-lg bg-white p-4 shadow-lg">
        <h2 id="titulo-reembolso" className="font-display text-lg font-bold">
          Pedir reembolso
        </h2>
        <p className="mt-1 text-xs text-muted">
          {row.campaign.title} · pedido <span className="tnum">#{row.order.code}</span> ·{" "}
          <Money cents={row.order.amountCents} />
        </p>
        <p className="mt-2 rounded-md bg-yellow-soft px-3 py-2 text-xs text-yellow-deep">
          A organização da rifa analisa cada pedido. Aprovado, você recebe o protocolo e o prazo de
          devolução aqui. O valor volta para a mesma conta que pagou.
        </p>

        <form
          className="mt-3 space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            setErro(null);
            abrir.mutate();
          }}
        >
          <div>
            <label htmlFor="motivo" className="label-xs">
              Motivo
            </label>
            <textarea
              id="motivo"
              rows={3}
              maxLength={1000}
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              className="mt-1 w-full rounded-md border border-line-2 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label htmlFor="cpf" className="label-xs">
              CPF de quem comprou
            </label>
            <input
              id="cpf"
              inputMode="numeric"
              value={cpf}
              onChange={(e) => setCpf(maskCpf(e.target.value))}
              className="tnum mt-1 w-full rounded-md border border-line-2 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label htmlFor="pix" className="label-xs">
              Chave Pix (opcional — só se a compra não foi por Pix)
            </label>
            <input
              id="pix"
              maxLength={140}
              value={pixChave}
              onChange={(e) => setPixChave(e.target.value)}
              className="mt-1 w-full rounded-md border border-line-2 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label htmlFor="print" className="label-xs">
              Print do bilhete ou do comprovante
            </label>
            <input
              id="print"
              type="file"
              accept="image/*"
              className="mt-1 block text-xs"
              onChange={async (e) => {
                const f = e.target.files?.[0];
                if (!f) return setAnexo(null);
                try {
                  setAnexo(await lerImagem(f));
                  setErro(null);
                } catch (err) {
                  setErro((err as Error).message);
                  e.target.value = "";
                }
              }}
            />
            {anexo ? <img src={anexo} alt="Prévia do print" className="mt-2 max-h-40 rounded-md border border-line" /> : null}
          </div>

          {erro ? <p className="rounded-md bg-red-soft px-3 py-2 text-sm text-red">{erro}</p> : null}

          <div className="flex gap-2">
            <Button type="submit" disabled={!pronto || abrir.isPending}>
              {abrir.isPending ? "Enviando…" : "Enviar pedido"}
            </Button>
            <Button type="button" variant="ghost" onClick={fechar}>
              Cancelar
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

function ChamadoDoComprador({ id, voltar }: { id: string; voltar: () => void }) {
  const qc = useQueryClient();
  const chave = [`/api/public/chamados/${id}`];
  const { data } = useQuery<{
    protocolo: string;
    status: StatusChamado;
    pedido: number;
    rifa: string;
    decisao: string | null;
    prazoEstornoAte: string | null;
    mensagens: Mensagem[];
  }>({ queryKey: chave, refetchInterval: 20_000 });

  const enviar = useMutation({
    mutationFn: (m: { texto: string; anexo?: string }) =>
      apiRequest("POST", `/api/public/chamados/${id}/mensagens`, m),
    onSuccess: () => qc.invalidateQueries({ queryKey: chave }),
  });

  if (!data) return <Empty>Carregando…</Empty>;
  const emAndamento = data.status === "aberto" || data.status === "aprovado";

  return (
    <div className="mt-3">
      <button type="button" onClick={voltar} className="mb-2 text-xs text-muted underline">
        ← todos os pedidos de reembolso
      </button>
      <Card
        title={`Protocolo ${data.protocolo}`}
        right={<Pill status={PILL_CHAMADO[data.status]}>{NOME_STATUS_CHAMADO[data.status]}</Pill>}
      >
        <p className="border-b border-line px-4 py-2 text-xs text-muted">
          {data.rifa} · pedido <span className="tnum">#{data.pedido}</span>
          {data.status === "aprovado" && data.prazoEstornoAte ? (
            <>
              {" "}
              · devolução até{" "}
              <strong className="tnum text-yellow-deep">
                {new Date(data.prazoEstornoAte).toLocaleDateString("pt-BR")}
              </strong>
            </>
          ) : null}
        </p>
        <Conversa
          mensagens={data.mensagens}
          meuLado="comprador"
          anexoBase="/api/public/chamados/anexos"
          podeEscrever={emAndamento}
          enviando={enviar.isPending}
          enviar={(m) => enviar.mutateAsync(m)}
        />
      </Card>
    </div>
  );
}
