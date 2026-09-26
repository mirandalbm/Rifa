import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { PanelShell } from "@/components/AppShell";
import { Card, Button, Pill, Empty, Money } from "@/components/bits";
import { Conversa, type Mensagem } from "@/components/Conversa";
import { apiRequest } from "@/lib/queryClient";
import { formatBRL } from "@shared/format";
import { NOME_STATUS_CHAMADO, PILL_CHAMADO, type StatusChamado } from "@shared/chamados";
import { NOME_TIPO_REEMBOLSO, type TipoReembolso } from "@shared/reembolso";

interface Linha {
  id: string;
  protocolo: string;
  status: StatusChamado;
  pedido: number;
  valorCents: number;
  rifa: string;
  cliente: string | null;
  nome: string;
  prazoEstornoAte: string | null;
  createdAt: string;
  organizacao: string;
}

interface Detalhe {
  chamado: {
    id: string;
    protocolo: string;
    status: StatusChamado;
    motivo: string;
    pixChave: string | null;
    decisao: string | null;
    prazoEstornoAte: string | null;
    formaDevolucao: string | null;
    tipoReembolso: TipoReembolso | null;
    taxaPct: number | null;
    taxaCents: number | null;
    devolverCents: number | null;
  };
  pedido: {
    code: number;
    status: string;
    valorCents: number;
    quantidade: number;
    pagoEm: string | null;
    provedor: string | null;
    rifa: string;
    rifaStatus: string;
  };
  cliente: {
    codigo: string | null;
    nome: string;
    telefone: string | null;
    cpf: string | null;
    cpfConfirmado: boolean;
    /** Falso: cliente da plataforma — o organizador o vê só pelo ID. */
    completo: boolean;
  };
  historico: { protocolo: string; status: StatusChamado }[];
  mensagens: Mensagem[];
}

const FILTROS: { valor: string; rotulo: string }[] = [
  { valor: "aberto", rotulo: "em análise" },
  { valor: "aprovado", rotulo: "aguardando devolução" },
  { valor: "estornado", rotulo: "devolvidos" },
  { valor: "recusado", rotulo: "recusados" },
  { valor: "", rotulo: "todos" },
];

function StatusPill({ s }: { s: StatusChamado }) {
  return <Pill status={PILL_CHAMADO[s]}>{NOME_STATUS_CHAMADO[s]}</Pill>;
}

/** Prazo de devolução: quantos dias faltam, ou há quantos venceu. */
function Prazo({ ate }: { ate: string | null }) {
  if (!ate) return null;
  const dias = Math.ceil((new Date(ate).getTime() - Date.now()) / 86_400_000);
  return (
    <span className={`tnum text-xs ${dias < 0 ? "text-red" : "text-yellow-deep"}`}>
      {dias < 0 ? `prazo vencido há ${-dias} dia(s)` : `devolver em até ${dias} dia(s)`} (
      {new Date(ate).toLocaleDateString("pt-BR")})
    </span>
  );
}

/**
 * Atendimento — os pedidos de reembolso da organização, cada um com a
 * conversa, o print do bilhete e a decisão. O reembolso só existe por aqui:
 * aprovado, o protocolo e o prazo de devolução saem sozinhos.
 */
export function AdminAtendimento() {
  const qc = useQueryClient();
  const [filtro, setFiltro] = useState("aberto");
  const [aberto, setAberto] = useState<string | null>(null);

  const { data: lista } = useQuery<Linha[]>({
    queryKey: ["/api/admin/chamados", filtro ? { status: filtro } : {}],
    refetchInterval: 30_000,
  });

  return (
    <PanelShell title="Atendimento">
      <div className="mb-3 flex flex-wrap gap-1" role="tablist" aria-label="Situação dos chamados">
        {FILTROS.map((f) => (
          <button
            key={f.valor || "todos"}
            type="button"
            role="tab"
            aria-selected={filtro === f.valor}
            onClick={() => {
              setFiltro(f.valor);
              setAberto(null);
            }}
            className={
              filtro === f.valor
                ? "rounded-md bg-green px-3 py-1.5 text-sm font-semibold text-on-green"
                : "rounded-md px-3 py-1.5 text-sm text-ink-2 hover:bg-mist-2"
            }
          >
            {f.rotulo}
          </button>
        ))}
      </div>

      <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
        <Card title="Chamados">
          {lista?.length ? (
            <ul className="divide-y divide-line">
              {lista.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => setAberto(c.id)}
                    className={`w-full px-4 py-3 text-left hover:bg-mist ${aberto === c.id ? "bg-mist" : ""}`}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="tnum text-sm font-semibold">{c.protocolo}</span>
                      <StatusPill s={c.status} />
                    </div>
                    <p className="mt-1 text-sm">
                      {c.nome} <span className="tnum text-xs text-muted">· {c.cliente ?? "sem ID"}</span>
                    </p>
                    <p className="text-xs text-muted">
                      {c.rifa} · pedido <span className="tnum">#{c.pedido}</span> ·{" "}
                      <span className="tnum">{formatBRL(c.valorCents)}</span>
                    </p>
                    {c.status === "aprovado" ? <Prazo ate={c.prazoEstornoAte} /> : null}
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <Empty>Nenhum chamado aqui.</Empty>
          )}
        </Card>

        {aberto ? (
          <DetalheChamado
            id={aberto}
            aoMudar={() => qc.invalidateQueries({ queryKey: ["/api/admin/chamados"] })}
          />
        ) : (
          <Card>
            <Empty>Escolha um chamado para ver a conversa e decidir.</Empty>
          </Card>
        )}
      </div>
    </PanelShell>
  );
}

function DetalheChamado({ id, aoMudar }: { id: string; aoMudar: () => void }) {
  const qc = useQueryClient();
  const chave = [`/api/admin/chamados/${id}`];
  const { data } = useQuery<Detalhe>({ queryKey: chave, refetchInterval: 15_000 });
  const [resposta, setResposta] = useState("");
  const [aviso, setAviso] = useState<{ ok: boolean; texto: string } | null>(null);

  const recarregar = () => {
    qc.invalidateQueries({ queryKey: chave });
    aoMudar();
  };
  const falhou = (e: Error) => setAviso({ ok: false, texto: e.message });

  const responder = useMutation({
    mutationFn: (m: { texto: string; anexo?: string }) =>
      apiRequest("POST", `/api/admin/chamados/${id}/mensagens`, m),
    onSuccess: recarregar,
  });

  const concluir = useMutation({
    mutationFn: (decisao: "aprovado" | "recusado") =>
      apiRequest("POST", `/api/admin/chamados/${id}/concluir`, { decisao, resposta }),
    onSuccess: () => {
      setResposta("");
      setAviso(null);
      recarregar();
    },
    onError: falhou,
  });

  const estornar = useMutation({
    mutationFn: async () =>
      (await (await apiRequest("POST", `/api/admin/chamados/${id}/estornar`)).json()) as {
        protocolo: string;
        forma: string;
        cotasLiberadas: number;
        cotasCongeladas: boolean;
        comissaoJaPagaCents: number;
      },
    onSuccess: (r) => {
      setAviso({
        ok: true,
        texto: [
          `Reembolso ${r.protocolo} feito.`,
          r.forma === "manual"
            ? "Venda sem Pix online: devolva o valor à mão (caixa ou Pix informado)."
            : "O valor volta para a mesma conta que pagou.",
          r.cotasCongeladas ? "" : `${r.cotasLiberadas} cota(s) voltaram ao estoque.`,
          r.comissaoJaPagaCents > 0
            ? `Atenção: ${formatBRL(r.comissaoJaPagaCents)} de comissão já tinham sido pagos.`
            : "",
        ]
          .filter(Boolean)
          .join(" "),
      });
      recarregar();
    },
    onError: falhou,
  });

  if (!data) return <Card><Empty>Carregando…</Empty></Card>;
  const { chamado, pedido, cliente } = data;
  const emAndamento = chamado.status === "aberto" || chamado.status === "aprovado";

  return (
    <Card
      title={`Chamado ${chamado.protocolo}`}
      right={<StatusPill s={chamado.status} />}
    >
      <div className="space-y-3 border-b border-line p-4 text-sm">
        {aviso ? (
          <p className={`rounded-md px-3 py-2 ${aviso.ok ? "bg-green-soft text-green-deep" : "bg-red-soft text-red"}`}>
            {aviso.texto}
          </p>
        ) : null}
        <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
          <div>
            <dt className="label-xs">Cliente</dt>
            <dd>
              {cliente.nome} · <span className="tnum">{cliente.codigo ?? "sem ID"}</span>
            </dd>
          </div>
          <div>
            <dt className="label-xs">WhatsApp / CPF</dt>
            <dd className="tnum">
              {cliente.completo ? (
                <>
                  {cliente.telefone} · {cliente.cpf ?? "sem CPF"}
                </>
              ) : (
                <span className="font-sans text-xs text-muted">
                  cliente da plataforma — os dados ficam com ela; converse por aqui
                </span>
              )}
            </dd>
          </div>
          <div>
            <dt className="label-xs">Pedido</dt>
            <dd>
              <span className="tnum">#{pedido.code}</span> · {pedido.quantidade} cota(s) ·{" "}
              <Money cents={pedido.valorCents} />
            </dd>
          </div>
          <div>
            <dt className="label-xs">Pagamento</dt>
            <dd>
              {pedido.provedor ? `Pix (${pedido.provedor})` : "venda do cambista"}
              {pedido.pagoEm ? (
                <span className="tnum text-muted"> · {new Date(pedido.pagoEm).toLocaleString("pt-BR")}</span>
              ) : null}
            </dd>
          </div>
          <div>
            <dt className="label-xs">Rifa</dt>
            <dd>
              {pedido.rifa}
              {pedido.rifaStatus === "drawn" ? <span className="text-red"> · já sorteada</span> : null}
            </dd>
          </div>
          {chamado.devolverCents !== null ? (
            <div>
              <dt className="label-xs">A devolver</dt>
              <dd>
                <Money cents={chamado.devolverCents} />
                <span className="block text-xs text-muted">
                  {chamado.tipoReembolso ? NOME_TIPO_REEMBOLSO[chamado.tipoReembolso] : ""}
                  {chamado.taxaCents ? (
                    <span className="tnum">
                      {" "}
                      · taxa {chamado.taxaPct}%: {formatBRL(chamado.taxaCents)}
                    </span>
                  ) : null}
                </span>
              </dd>
            </div>
          ) : null}
          {chamado.pixChave ? (
            <div>
              <dt className="label-xs">Chave Pix informada</dt>
              <dd className="tnum break-all">{chamado.pixChave}</dd>
            </div>
          ) : null}
        </dl>
        {data.historico.length ? (
          <p className="rounded-md bg-yellow-soft px-3 py-2 text-xs text-yellow-deep">
            Este cliente já tem {data.historico.length} outro(s) pedido(s) de reembolso:{" "}
            {data.historico.map((h) => `${h.protocolo} (${NOME_STATUS_CHAMADO[h.status]})`).join(", ")}.
          </p>
        ) : null}
        {chamado.status === "aprovado" ? <Prazo ate={chamado.prazoEstornoAte} /> : null}
      </div>

      <Conversa
        mensagens={data.mensagens}
        meuLado="organizacao"
        anexoBase="/api/admin/chamados/anexos"
        podeEscrever={emAndamento}
        enviando={responder.isPending}
        enviar={(m) => responder.mutateAsync(m)}
      />

      {chamado.status === "aberto" ? (
        <div className="space-y-2 border-t border-line p-4">
          <label htmlFor="resposta" className="label-xs">
            Decisão (a resposta vai para o cliente)
          </label>
          <textarea
            id="resposta"
            rows={2}
            value={resposta}
            onChange={(e) => setResposta(e.target.value)}
            className="w-full rounded-md border border-line-2 px-3 py-2 text-sm"
          />
          <div className="flex flex-wrap gap-2">
            <Button
              onClick={() => concluir.mutate("aprovado")}
              disabled={resposta.trim().length < 5 || concluir.isPending}
            >
              Aprovar reembolso
            </Button>
            <Button
              variant="ghost"
              onClick={() => concluir.mutate("recusado")}
              disabled={resposta.trim().length < 5 || concluir.isPending}
            >
              Recusar
            </Button>
          </div>
          <p className="text-[11px] text-muted">
            Aprovado, o protocolo e o prazo de devolução da organização são registrados sozinhos.
          </p>
        </div>
      ) : null}

      {chamado.status === "aprovado" ? (
        <div className="space-y-2 border-t border-line p-4">
          <Button
            onClick={() => {
              if (
                window.confirm(
                  `Devolver ${formatBRL(chamado.devolverCents ?? pedido.valorCents)} do pedido #${pedido.code}` +
                    (chamado.taxaCents ? ` (taxa retida: ${formatBRL(chamado.taxaCents)})` : "") +
                    `? Cotas, comissão e taxa da venda são desfeitas.`,
                )
              ) {
                estornar.mutate();
              }
            }}
            disabled={estornar.isPending}
          >
            {estornar.isPending ? "Devolvendo…" : "Fazer a devolução"}
          </Button>
          <p className="text-[11px] text-muted">
            {pedido.provedor
              ? "Com Pix, o valor volta pelo provedor para a mesma conta que pagou."
              : "Venda do cambista: o sistema registra a devolução; o valor é devolvido à mão."}
          </p>
        </div>
      ) : null}

      {chamado.decisao && !emAndamento ? (
        <p className="border-t border-line px-4 py-3 text-xs text-muted">Decisão: {chamado.decisao}</p>
      ) : null}
    </Card>
  );
}
