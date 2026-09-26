import { useEffect, useState } from "react";
import { Link, useSearch } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { PublicShell } from "@/components/AppShell";
import { Button, Card, Money, Pill, Empty } from "@/components/bits";
import { Conversa, type Mensagem } from "@/components/Conversa";
import { apiRequest, ApiError } from "@/lib/queryClient";
import { lerImagem } from "@/lib/anexo";
import { formatQuota, maskPhone, maskCpf, cpfValido, formatBRL } from "@shared/format";
import { calcularReembolso, NOME_TIPO_REEMBOLSO } from "@shared/reembolso";
import {
  NOME_STATUS_CHAMADO,
  PILL_CHAMADO,
  bloqueioDoReembolso,
  type StatusChamado,
} from "@shared/chamados";

interface OrderRow {
  order: {
    code: number;
    status: string;
    quantity: number;
    amountCents: number;
    createdAt: string;
    paidAt?: string | null;
    method?: string;
    sellerId?: string | null;
  };
  campaign: {
    title: string;
    slug: string;
    totalQuotas: number;
    status: string;
    drawAt?: string | null;
    prizeTitle?: string;
  };
  organizador?: { nome: string | null; slug: string | null };
  numbers: number[];
}

interface Conta {
  orders: OrderRow[];
  phone: string;
  cliente: string | null;
  reembolso: boolean;
  /** Taxa administrativa do reembolso fora dos 7 dias (shared/reembolso.ts). */
  taxaReembolsoPct?: number;
  /**
   * Sobrou compra antiga, feita só pelo telefone e sem CPF gravado, que a
   * conta ainda não provou ser dela. É o único caso em que a tela oferece o
   * código do WhatsApp.
   */
  comprasAntigasOcultas?: boolean;
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
      <h1 className="font-display text-2xl font-extrabold">Minhas compras</h1>
      <p className="mt-1 text-sm text-muted">
        Suas cotas em cada rifa, com a segunda via do bilhete.
      </p>
      {restaurando ? null : conta ? (
        <Painel conta={conta} aoMudar={setConta} />
      ) : (
        <>
          <Entrar aoEntrar={setConta} />
          <p className="mt-3 text-center text-sm text-muted">
            Tem conta?{" "}
            <Link href="/entrar" className="text-green-deep underline">
              entre com a senha
            </Link>{" "}
            ·{" "}
            <Link href="/criar-conta" className="text-green-deep underline">
              criar conta
            </Link>
          </p>
        </>
      )}
    </PublicShell>
  );
}

function Entrar({
  aoEntrar,
  telefoneFixo,
  rotulo = "Confirmar",
}: {
  aoEntrar: (c: Conta) => void;
  /** Confirmação do telefone da própria conta: o número não se escolhe. */
  telefoneFixo?: string;
  rotulo?: string;
}) {
  const [phone, setPhone] = useState(telefoneFixo ?? "");
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
            disabled={step === "code" || Boolean(telefoneFixo)}
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
          {step === "phone" ? "Receber código" : rotulo}
        </Button>
      </div>
    </Card>
  );
}

function Painel({ conta, aoMudar }: { conta: Conta; aoMudar: (c: Conta | null) => void }) {
  const qc = useQueryClient();
  // O menu do apostador abre direto numa aba (?aba=reembolsos, ?aba=conta) —
  // e troca de aba mesmo já estando nesta página.
  const busca = useSearch();
  const abaDaUrl = (): "cotas" | "chamados" | "conta" => {
    const q = new URLSearchParams(busca).get("aba");
    return q === "conta" ? "conta" : q === "reembolsos" ? "chamados" : "cotas";
  };
  const [aba, setAba] = useState(abaDaUrl);
  useEffect(() => setAba(abaDaUrl()), [busca]);
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
            ["conta", "Minha conta"],
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

      {conta.comprasAntigasOcultas ? (
        <div className="mt-3 rounded-md border border-yellow bg-yellow-soft px-3 py-2 text-sm text-yellow-deep">
          <p className="font-semibold">Há compras antigas deste telefone para trazer</p>
          <p className="text-xs">
            Foram feitas antes da conta e sem CPF, então não dá para provar que são suas pelo
            cadastro. Confirme o número pelo código do WhatsApp e elas aparecem aqui.
          </p>
          <div className="mt-2">
            <Entrar aoEntrar={aoMudar} telefoneFixo={conta.phone} rotulo="Confirmar telefone" />
          </div>
        </div>
      ) : null}

      {aba === "conta" ? (
        <MinhaConta aoSair={() => aoMudar(null)} />
      ) : aba === "cotas" ? (
        <>
          {conta.orders.length === 0 ? (
            <Empty>
              Nenhuma compra ainda.{" "}
              <Link href="/" className="text-green-deep underline">
                ver as rifas
              </Link>
            </Empty>
          ) : null}
          <ComprasPorRifa
            orders={conta.orders}
            podePedir={(row) =>
              Boolean(
                conta.cliente &&
                  !emAndamento.has(row.order.code) &&
                  !bloqueioDoReembolso({
                    estornoLigado: conta.reembolso,
                    statusPedido: row.order.status,
                    statusRifa: row.campaign.status,
                    sorteioEm: row.campaign.drawAt ? new Date(row.campaign.drawAt) : null,
                  }),
              )
            }
            emAndamento={emAndamento}
            pedir={setPedindo}
          />
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
          taxaPct={conta.taxaReembolsoPct ?? 10}
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
  taxaPct,
  fechar,
  aoAbrir,
}: {
  row: OrderRow;
  taxaPct: number;
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
        {(() => {
          // O mesmo cálculo que o servidor grava ao receber o pedido.
          const c = calcularReembolso({
            pagoCents: row.order.amountCents,
            vendaOnline: !row.order.sellerId && (row.order.method ?? "pix_online") === "pix_online",
            compradoEm: new Date(row.order.paidAt ?? row.order.createdAt),
            pedidoEm: new Date(),
            taxaPct,
          });
          return (
            <div className="mt-2 rounded-md border border-line bg-mist px-3 py-2 text-sm">
              <p>
                Você recebe <strong className="tnum">{formatBRL(c.devolverCents)}</strong>
                {c.taxaCents > 0 ? (
                  <>
                    {" "}
                    (taxa administrativa de <span className="tnum">{c.taxaPct}%</span>:{" "}
                    <span className="tnum">{formatBRL(c.taxaCents)}</span>)
                  </>
                ) : null}
              </p>
              <p className="text-xs text-muted">{NOME_TIPO_REEMBOLSO[c.tipo]}</p>
            </div>
          );
        })()}
        <p className="mt-2 rounded-md bg-yellow-soft px-3 py-2 text-xs text-yellow-deep">
          A organização da rifa analisa cada pedido. Aprovado, você recebe o protocolo e o prazo de
          devolução aqui. Com Pix, o valor volta para a mesma conta que pagou.
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
    devolverCents: number | null;
    taxaCents: number | null;
    taxaPct: number | null;
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
          {data.devolverCents !== null ? (
            <>
              {" "}
              · a devolver <strong className="tnum">{formatBRL(data.devolverCents)}</strong>
              {data.taxaCents ? (
                <span className="tnum"> (taxa {data.taxaPct}%: {formatBRL(data.taxaCents)})</span>
              ) : null}
            </>
          ) : null}
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

interface DadosConta {
  nome: string;
  telefone: string;
  cpf: string | null;
  email: string | null;
  codigo: string | null;
  temSenha: boolean;
  telefoneConfirmado: boolean;
  sessaoConfirmada: boolean;
}

/** Dados da conta, senha, sair e exclusão (LGPD). */
function MinhaConta({ aoSair }: { aoSair: () => void }) {
  const qc = useQueryClient();
  const { data } = useQuery<DadosConta>({ queryKey: ["/api/public/conta"] });
  const [atual, setAtual] = useState("");
  const [nova, setNova] = useState("");
  const [senhaExcluir, setSenhaExcluir] = useState("");
  const [confirmaExcluir, setConfirmaExcluir] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null);

  const sair = useMutation({
    mutationFn: () => apiRequest("POST", "/api/public/conta/sair"),
    onSuccess: () => {
      qc.invalidateQueries();
      aoSair();
    },
  });
  const trocar = useMutation({
    mutationFn: () => apiRequest("PUT", "/api/public/conta/senha", { atual, nova }),
    onSuccess: () => {
      setAtual("");
      setNova("");
      setMsg({ ok: true, texto: "Senha salva." });
      qc.invalidateQueries({ queryKey: ["/api/public/conta"] });
    },
    onError: (e: Error) => setMsg({ ok: false, texto: e.message }),
  });
  const excluir = useMutation({
    mutationFn: () => apiRequest("POST", "/api/public/conta/excluir", { senha: senhaExcluir }),
    onSuccess: () => {
      qc.invalidateQueries();
      aoSair();
    },
    onError: (e: Error) => setMsg({ ok: false, texto: e.message }),
  });

  if (!data) return <Empty>Carregando…</Empty>;
  const pedeAtual = data.temSenha && !data.sessaoConfirmada;

  return (
    <div className="mt-3 space-y-3">
      <Card title="Meus dados">
        <dl className="grid gap-3 p-4 text-sm sm:grid-cols-2">
          <div>
            <dt className="label-xs">Nome</dt>
            <dd>{data.nome}</dd>
          </div>
          <div>
            <dt className="label-xs">ID de cliente</dt>
            <dd className="tnum">{data.codigo ?? "—"}</dd>
          </div>
          <div>
            <dt className="label-xs">WhatsApp</dt>
            <dd className="tnum">
              {maskPhone(data.telefone)}{" "}
              <Pill status={data.telefoneConfirmado ? "paid" : "pending"}>
                {data.telefoneConfirmado ? "confirmado" : "não confirmado"}
              </Pill>
            </dd>
          </div>
          <div>
            <dt className="label-xs">CPF</dt>
            <dd className="tnum">{data.cpf ? maskCpf(data.cpf) : "—"}</dd>
          </div>
          <div>
            <dt className="label-xs">E-mail</dt>
            <dd>{data.email ?? "—"}</dd>
          </div>
        </dl>
      </Card>

      {msg ? (
        <p className={`rounded-md px-3 py-2 text-sm ${msg.ok ? "bg-green-soft text-green-deep" : "bg-red-soft text-red"}`}>
          {msg.texto}
        </p>
      ) : null}

      <Card title={data.temSenha ? "Trocar senha" : "Criar senha"}>
        <form
          className="space-y-2 p-4"
          onSubmit={(e) => {
            e.preventDefault();
            setMsg(null);
            trocar.mutate();
          }}
        >
          {pedeAtual ? (
            <div>
              <label htmlFor="senha-atual" className="label-xs">
                Senha atual
              </label>
              <input
                id="senha-atual"
                type="password"
                autoComplete="current-password"
                value={atual}
                onChange={(e) => setAtual(e.target.value)}
                className="mt-1 w-full rounded-md border border-line-2 px-3 py-2 text-sm"
              />
            </div>
          ) : null}
          <div>
            <label htmlFor="senha-nova" className="label-xs">
              Nova senha (mínimo 8 caracteres)
            </label>
            <input
              id="senha-nova"
              type="password"
              autoComplete="new-password"
              value={nova}
              onChange={(e) => setNova(e.target.value)}
              className="mt-1 w-full rounded-md border border-line-2 px-3 py-2 text-sm"
            />
          </div>
          <Button type="submit" disabled={trocar.isPending || nova.length < 8 || (pedeAtual && !atual)}>
            Salvar senha
          </Button>
        </form>
      </Card>

      <Button variant="ghost" className="w-full" onClick={() => sair.mutate()}>
        Sair da conta
      </Button>

      <Card title="Excluir conta">
        <div className="space-y-2 p-4 text-sm">
          <p className="text-xs text-muted">
            Seus dados pessoais (nome, WhatsApp, CPF, e-mail e senha) são apagados. As compras,
            bilhetes e recibos continuam guardados pelo prazo que a lei exige, sem ligação com você.
            Cotas de rifas que ainda não foram sorteadas continuam valendo, mas você não conseguirá
            mais acessá-las por aqui.
          </p>
          {confirmaExcluir ? (
            <>
              {!data.sessaoConfirmada ? (
                <input
                  type="password"
                  aria-label="Senha para confirmar"
                  placeholder="sua senha, para confirmar"
                  value={senhaExcluir}
                  onChange={(e) => setSenhaExcluir(e.target.value)}
                  className="w-full rounded-md border border-line-2 px-3 py-2 text-sm"
                />
              ) : null}
              <div className="flex gap-2">
                <Button
                  onClick={() => excluir.mutate()}
                  disabled={excluir.isPending || (!data.sessaoConfirmada && !senhaExcluir)}
                  className="bg-red hover:brightness-95"
                >
                  Excluir definitivamente
                </Button>
                <Button variant="ghost" onClick={() => setConfirmaExcluir(false)}>
                  Cancelar
                </Button>
              </div>
            </>
          ) : (
            <button type="button" onClick={() => setConfirmaExcluir(true)} className="text-xs text-red underline">
              Quero excluir minha conta
            </button>
          )}
        </div>
      </Card>
    </div>
  );
}

/** A inicial do organizador no círculo — a foto de perfil entra com o perfil (Fase 5). */
function AvatarOrganizador({ nome }: { nome: string }) {
  return (
    <span
      aria-hidden
      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-green text-sm font-bold text-on-green ring-2 ring-green-soft ring-offset-2"
    >
      {nome.trim().charAt(0).toUpperCase() || "?"}
    </span>
  );
}

/**
 * As compras agrupadas por rifa: o organizador no topo, o prêmio e a data do
 * sorteio, todos os números pagos juntos, e cada pedido com a segunda via do
 * bilhete.
 */
function ComprasPorRifa({
  orders,
  podePedir,
  emAndamento,
  pedir,
}: {
  orders: OrderRow[];
  podePedir: (row: OrderRow) => boolean;
  emAndamento: Set<number>;
  pedir: (row: OrderRow) => void;
}) {
  const grupos = new Map<string, OrderRow[]>();
  for (const o of orders) {
    const g = grupos.get(o.campaign.slug) ?? [];
    g.push(o);
    grupos.set(o.campaign.slug, g);
  }

  return (
    <div className="mt-3 space-y-4">
      {[...grupos.values()].map((pedidos) => {
        const c = pedidos[0].campaign;
        const org = pedidos[0].organizador?.nome ?? "Organizador";
        const pagos = pedidos
          .filter((p) => p.order.status === "paid")
          .flatMap((p) => p.numbers)
          .sort((a, b) => a - b);
        return (
          <Card key={c.slug}>
            <div className="flex items-center gap-3 border-b border-line px-4 py-3">
              <AvatarOrganizador nome={org} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-bold">{org}</p>
                <Link href={`/r/${c.slug}`} className="block truncate text-xs text-muted underline">
                  {c.title}
                </Link>
              </div>
              <Pill status={c.status} />
            </div>
            <div className="space-y-3 p-4">
              <div className="flex flex-wrap justify-between gap-2 text-xs text-muted">
                <span>{c.prizeTitle}</span>
                <span className="tnum">
                  sorteio {c.drawAt ? new Date(c.drawAt).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : "a definir"}
                </span>
              </div>

              <div>
                <p className="label-xs">
                  Suas cotas pagas · <span className="tnum">{pagos.length}</span>
                </p>
                {pagos.length ? (
                  <div className="mt-1 flex flex-wrap gap-1">
                    {pagos.map((n) => (
                      <span key={n} className="tnum rounded bg-green px-1.5 py-[2px] text-[11px] text-on-green">
                        {formatQuota(n, c.totalQuotas)}
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="mt-1 text-xs text-muted">Nenhuma cota paga nesta rifa ainda.</p>
                )}
              </div>

              <ul className="divide-y divide-line rounded-md border border-line">
                {pedidos.map((row) => (
                  <li key={row.order.code} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 text-xs">
                    <span className="tnum font-semibold">#{row.order.code}</span>
                    <Pill status={row.order.status} />
                    <span className="tnum text-muted">
                      {row.order.quantity} cota(s) · <Money cents={row.order.amountCents} />
                    </span>
                    <span className="ml-auto flex gap-3">
                      {row.order.status === "paid" ? (
                        <Link href={`/bilhete/${row.order.code}`} className="text-green-deep underline">
                          2ª via do bilhete
                        </Link>
                      ) : row.order.status === "pending" ? (
                        <Link href={`/pedido/${row.order.code}`} className="text-yellow-deep underline">
                          pagar
                        </Link>
                      ) : null}
                      {emAndamento.has(row.order.code) ? (
                        <span className="text-yellow-deep">reembolso em andamento</span>
                      ) : podePedir(row) ? (
                        <button type="button" onClick={() => pedir(row)} className="text-muted underline">
                          pedir reembolso
                        </button>
                      ) : null}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </Card>
        );
      })}
    </div>
  );
}
