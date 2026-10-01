import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button, Card, Empty, Pill } from "@/components/bits";
import { MestreDetalhe } from "@/components/painel";
import { Conversa, type Mensagem } from "@/components/Conversa";
import { apiRequest } from "@/lib/queryClient";
import { groupNumber } from "@shared/format";
import {
  NOME_STATUS_SOLICITACAO,
  NOME_TIPO_SOLICITACAO,
  PILL_SOLICITACAO,
  type Alteracoes,
  type StatusSolicitacao,
  type TipoSolicitacao,
} from "@shared/solicitacoes";

interface Linha {
  id: string;
  protocolo: string;
  tipo: TipoSolicitacao;
  status: StatusSolicitacao;
  createdAt: string;
  rifa: string;
  organizacao: string;
}

interface Detalhe {
  comentario: { texto: string; autor: string; nomeReal: string; createdAt: string; removido: boolean } | null;
  solicitacao: {
    id: string;
    protocolo: string;
    tipo: TipoSolicitacao;
    status: StatusSolicitacao;
    alteracoes: Alteracoes | null;
    drawAtAtual: string | null;
    drawAtNovo: string | null;
    motivo: string | null;
    decisao: string | null;
    decididoEm: string | null;
    createdAt: string;
  };
  rifa: {
    id: string;
    titulo: string;
    premio: string;
    status: string;
    drawAt: string | null;
    adiamentos: number;
    vendidas: number;
    total: number;
    organizacao: string;
  };
  mensagens: Mensagem[];
  rotulos: Record<string, string>;
}

const FILTROS: { valor: string; rotulo: string }[] = [
  { valor: "em_analise", rotulo: "em análise" },
  { valor: "aprovada", rotulo: "aprovados" },
  { valor: "recusada", rotulo: "recusados" },
  { valor: "", rotulo: "todos" },
];

function StatusPill({ s }: { s: StatusSolicitacao }) {
  return <Pill status={PILL_SOLICITACAO[s]}>{NOME_STATUS_SOLICITACAO[s]}</Pill>;
}

const quando = (d: string | null) => (d ? new Date(d).toLocaleString("pt-BR") : "—");

function valor(v: unknown) {
  if (v === null || v === undefined || v === "") return <span className="text-muted">(vazio)</span>;
  if (typeof v === "number") return <span className="tnum">{groupNumber(v)}</span>;
  return <span className="whitespace-pre-wrap break-words">{String(v)}</span>;
}

/**
 * Pedidos de mudança em rifa publicada (edição e adiamento do sorteio). A
 * mesma tela para os dois lados: a organização pede e conversa; a
 * plataforma conversa e decide. O recorte vem do servidor.
 */
export function SolicitacoesDeRifa({ daPlataforma }: { daPlataforma: boolean }) {
  const qc = useQueryClient();
  const [filtro, setFiltro] = useState("em_analise");
  const [aberto, setAberto] = useState<string | null>(null);
  const { data: lista } = useQuery<Linha[]>({
    queryKey: ["/api/admin/solicitacoes", filtro ? { status: filtro } : {}],
    refetchInterval: 30_000,
  });

  return (
    <>
      <div className="mb-3 flex flex-wrap gap-1" role="tablist" aria-label="Situação dos pedidos">
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

      <MestreDetalhe
        aberto={aberto}
        aoFechar={() => setAberto(null)}
        vazio={
          daPlataforma
            ? "Escolha um pedido para ver o que muda, conversar com a organização e decidir."
            : "Escolha um pedido para acompanhar a análise e conversar com a plataforma."
        }
        lista={
          <Card title="Pedidos de mudança em rifa">
            {lista?.length ? (
              <ul className="divide-y divide-line">
                {lista.map((s) => (
                  <li key={s.id}>
                    <button
                      type="button"
                      onClick={() => setAberto(s.id)}
                      className={`w-full px-4 py-3 text-left hover:bg-mist ${aberto === s.id ? "bg-mist" : ""}`}
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="tnum text-sm font-semibold">{s.protocolo}</span>
                        <StatusPill s={s.status} />
                      </div>
                      <p className="mt-1 text-sm font-medium">{NOME_TIPO_SOLICITACAO[s.tipo]}</p>
                      <p className="text-xs text-muted">
                        {s.rifa}
                        {daPlataforma ? ` · ${s.organizacao}` : ""} ·{" "}
                        <span className="tnum">{new Date(s.createdAt).toLocaleDateString("pt-BR")}</span>
                      </p>
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <Empty>Nenhum pedido aqui.</Empty>
            )}
          </Card>
        }
        detalhe={
          aberto ? (
            <DetalheDaSolicitacao
              id={aberto}
              daPlataforma={daPlataforma}
              aoMudar={() => {
                qc.invalidateQueries({ queryKey: ["/api/admin/solicitacoes"] });
                qc.invalidateQueries({ queryKey: ["/api/admin/campaigns"] });
                qc.invalidateQueries({ queryKey: ["/api/admin/chamados/pendentes"] });
              }}
            />
          ) : null
        }
      />
    </>
  );
}

function DetalheDaSolicitacao({
  id,
  daPlataforma,
  aoMudar,
}: {
  id: string;
  daPlataforma: boolean;
  aoMudar: () => void;
}) {
  const qc = useQueryClient();
  const chave = [`/api/admin/solicitacoes/${id}`];
  const { data } = useQuery<Detalhe>({ queryKey: chave, refetchInterval: 15_000 });
  const [resposta, setResposta] = useState("");
  const [aviso, setAviso] = useState<{ ok: boolean; texto: string } | null>(null);

  const recarregar = () => {
    qc.invalidateQueries({ queryKey: chave });
    aoMudar();
  };
  const falhou = (e: Error) => setAviso({ ok: false, texto: e.message });

  const escrever = useMutation({
    mutationFn: (m: { texto: string }) => apiRequest("POST", `/api/admin/solicitacoes/${id}/mensagens`, m),
    onSuccess: recarregar,
  });
  const decidir = useMutation({
    mutationFn: (aprovar: boolean) =>
      apiRequest("POST", `/api/admin/solicitacoes/${id}/decidir`, { aprovar, resposta }),
    onSuccess: (_r, aprovar) => {
      setResposta("");
      setAviso({
        ok: true,
        texto: aprovar ? "Aprovado: a rifa já está com a mudança." : "Recusado: a organização vê a sua explicação.",
      });
      recarregar();
    },
    onError: falhou,
  });
  const cancelar = useMutation({
    mutationFn: () => apiRequest("POST", `/api/admin/solicitacoes/${id}/cancelar`),
    onSuccess: () => {
      setAviso({ ok: true, texto: "Pedido cancelado." });
      recarregar();
    },
    onError: falhou,
  });

  if (!data) {
    return (
      <Card>
        <Empty>Carregando…</Empty>
      </Card>
    );
  }
  const { solicitacao: s, rifa } = data;
  const emAnalise = s.status === "em_analise";

  return (
    <Card title={`${NOME_TIPO_SOLICITACAO[s.tipo]} · ${s.protocolo}`} right={<StatusPill s={s.status} />}>
      <div className="space-y-3 border-b border-line p-4 text-sm">
        {aviso ? (
          <p className={`rounded-md px-3 py-2 ${aviso.ok ? "bg-green-soft text-green-deep" : "bg-red-soft text-red"}`}>
            {aviso.texto}
          </p>
        ) : null}
        <dl className="grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2">
          <div>
            <dt className="label-xs">Rifa</dt>
            <dd>
              {rifa.titulo} <span className="text-xs text-muted">· {rifa.organizacao}</span>
            </dd>
          </div>
          <div>
            <dt className="label-xs">Prêmio</dt>
            <dd>{rifa.premio}</dd>
          </div>
          <div>
            <dt className="label-xs">Vendidas</dt>
            <dd className="tnum">
              {groupNumber(rifa.vendidas)} de {groupNumber(rifa.total)} (
              {rifa.total ? Math.floor((rifa.vendidas / rifa.total) * 100) : 0}%)
            </dd>
          </div>
          <div>
            <dt className="label-xs">Sorteio agora</dt>
            <dd className="tnum">
              {quando(rifa.drawAt)}
              {rifa.adiamentos ? (
                <span className="font-sans text-xs text-muted"> · adiada {rifa.adiamentos}×</span>
              ) : null}
            </dd>
          </div>
        </dl>

        {s.tipo === "remover_comentario" ? (
          <div className="rounded-md border border-line p-3">
            <p className="label-xs">Comentário que a organização quer remover</p>
            {data.comentario ? (
              <>
                <p className="mt-1 text-xs text-muted">
                  @{data.comentario.autor} ({data.comentario.nomeReal}) ·{" "}
                  <span className="tnum">{quando(data.comentario.createdAt)}</span>
                  {data.comentario.removido ? " · já removido" : ""}
                </p>
                <p className="mt-1 whitespace-pre-wrap break-words">{data.comentario.texto}</p>
              </>
            ) : null}
            {s.motivo ? <p className="mt-2 text-xs text-muted">Motivo da organização: {s.motivo}</p> : null}
            <p className="mt-2 text-[11px] text-muted">
              Comentário pode ser denúncia contra a própria organização. Aprovar tira o comentário (e as respostas) do
              ar; recusar mantém.
            </p>
          </div>
        ) : s.tipo === "adiamento" ? (
          <div className="rounded-md border border-line p-3">
            <p className="label-xs">Datas do sorteio</p>
            <p className="mt-1">
              De <span className="tnum">{quando(s.drawAtAtual)}</span> para{" "}
              <b className="tnum">{quando(s.drawAtNovo)}</b>
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-md border border-line">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-mist">
                  {["Campo", "Antes", "Depois"].map((h) => (
                    <th key={h} className="label-xs px-3 py-2 text-left">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {Object.entries(s.alteracoes ?? {}).map(([campo, v]) => (
                  <tr key={campo} className="border-t border-line align-top">
                    <td className="px-3 py-2 font-medium">{data.rotulos[campo] ?? campo}</td>
                    <td className="px-3 py-2 text-muted">{valor(v?.de)}</td>
                    <td className="px-3 py-2">{valor(v?.para)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {s.decisao ? (
          <p className="text-xs text-muted">
            Resposta da plataforma ({quando(s.decididoEm)}): {s.decisao}
          </p>
        ) : null}

        {emAnalise && daPlataforma ? (
          <div className="space-y-2 rounded-md bg-mist p-3">
            <label htmlFor={`resp-${s.id}`} className="label-xs">
              Resposta à organização (obrigatória para recusar)
            </label>
            <textarea
              id={`resp-${s.id}`}
              rows={2}
              value={resposta}
              onChange={(e) => setResposta(e.target.value)}
              className="w-full rounded-md border border-line-2 px-3 py-2 text-sm"
            />
            {s.tipo === "remover_comentario" ? (
          <div className="rounded-md border border-line p-3">
            <p className="label-xs">Comentário que a organização quer remover</p>
            {data.comentario ? (
              <>
                <p className="mt-1 text-xs text-muted">
                  @{data.comentario.autor} ({data.comentario.nomeReal}) ·{" "}
                  <span className="tnum">{quando(data.comentario.createdAt)}</span>
                  {data.comentario.removido ? " · já removido" : ""}
                </p>
                <p className="mt-1 whitespace-pre-wrap break-words">{data.comentario.texto}</p>
              </>
            ) : null}
            {s.motivo ? <p className="mt-2 text-xs text-muted">Motivo da organização: {s.motivo}</p> : null}
            <p className="mt-2 text-[11px] text-muted">
              Comentário pode ser denúncia contra a própria organização. Aprovar tira o comentário (e as respostas) do
              ar; recusar mantém.
            </p>
          </div>
        ) : s.tipo === "adiamento" ? (
              <p className="text-[11px] text-muted">
                Confira se a autorização SPA/MF da rifa cobre a nova data. Aprovado, quem comprou e quem segue
                recebem o aviso, e as comissões que esperavam o sorteio passam a esperar a data nova.
              </p>
            ) : null}
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => decidir.mutate(true)} disabled={decidir.isPending}>
                Aprovar
              </Button>
              <Button
                variant="ghost"
                className="text-red"
                onClick={() => decidir.mutate(false)}
                disabled={decidir.isPending || resposta.trim().length < 5}
              >
                Recusar
              </Button>
            </div>
          </div>
        ) : null}

        {emAnalise && !daPlataforma ? (
          <Button
            variant="ghost"
            className="text-xs"
            disabled={cancelar.isPending}
            onClick={() => {
              if (window.confirm("Cancelar este pedido? A rifa continua como está.")) cancelar.mutate();
            }}
          >
            Cancelar pedido
          </Button>
        ) : null}
      </div>

      <Conversa
        mensagens={data.mensagens}
        meuLado={daPlataforma ? "plataforma" : "organizacao"}
        anexoBase=""
        podeEscrever={emAnalise}
        enviar={(m) => escrever.mutateAsync({ texto: m.texto })}
        enviando={escrever.isPending}
        comAnexo={false}
        encerrado="Pedido encerrado."
      />
    </Card>
  );
}
