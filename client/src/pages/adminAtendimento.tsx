import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { PanelShell } from "@/components/AppShell";
import { Card, Button, Pill, Empty, Money } from "@/components/bits";
import { MestreDetalhe } from "@/components/painel";
import { Conversa, type Mensagem } from "@/components/Conversa";
import { SolicitacoesDeRifa } from "@/components/SolicitacoesDeRifa";
import { DenunciasDaPlataforma } from "@/components/Seguranca";
import { VerificacoesDaPlataforma } from "@/components/VerificacoesDaPlataforma";
import { apiRequest } from "@/lib/queryClient";
import { useSession } from "@/lib/session";
import { formatBRL } from "@shared/format";
import {
  NOME_STATUS_CHAMADO,
  NOME_STATUS_DISPUTA,
  PILL_CHAMADO,
  PILL_DISPUTA,
  type StatusChamado,
  type StatusDisputa,
} from "@shared/chamados";
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
  disputa: StatusDisputa | null;
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
    disputa: StatusDisputa | null;
    disputaMotivo: string | null;
    disputaAbertaEm: string | null;
    disputaDecisao: string | null;
  };
  sorteioEm: string | null;
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
  // Levados à plataforma pelo comprador: a palavra final é dela.
  { valor: "disputa", rotulo: "em disputa" },
  { valor: "", rotulo: "todos" },
];

function StatusPill({ s, disputa }: { s: StatusChamado; disputa?: StatusDisputa | null }) {
  if (disputa === "aberta") return <Pill status={PILL_DISPUTA.aberta}>{NOME_STATUS_DISPUTA.aberta}</Pill>;
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
  const { data: sessao } = useSession();
  const daPlataforma = sessao?.role === "admin";
  // A plataforma abre na fila que só ela resolve.
  const [escolhido, setFiltro] = useState<string | null>(null);
  const filtro = escolhido ?? (daPlataforma ? "disputa" : "aberto");
  const [aberto, setAberto] = useState<string | null>(null);

  // Duas filas: reembolso (chamados dos compradores) e pedidos de mudança em
  // rifa publicada (edição e adiamento, que a plataforma analisa).
  const [area, setArea] = useState<"reembolsos" | "rifas" | "denuncias" | "verificacoes">(() => {
    const aba = new URLSearchParams(window.location.search).get("aba");
    return aba === "rifas" || aba === "denuncias" || aba === "verificacoes" ? aba : "reembolsos";
  });
  const { data: pendentes } = useQuery<{
    total: number;
    disputas?: number;
    solicitacoes?: number;
    denuncias?: number;
    verificacoes?: number;
  }>({
    queryKey: ["/api/admin/chamados/pendentes"],
  });
  const { data: lista } = useQuery<Linha[]>({
    queryKey: ["/api/admin/chamados", filtro ? { status: filtro } : {}],
    refetchInterval: 30_000,
    enabled: area === "reembolsos",
  });

  const abas = (
    // No celular as abas rolam para o lado (sem empurrar a página para fora da
    // tela). Cada aba é `relative`: o `sr-only` do contador é absoluto e, sem
    // ancestral posicionado dentro da faixa, escaparia dela e alargaria a página.
    <div
      className="-mx-4 mb-4 flex gap-1 overflow-x-auto border-b border-line px-4 sm:mx-0 sm:px-0"
      style={{ scrollbarWidth: "none" }}
      role="tablist"
      aria-label="Filas do atendimento"
    >
      {(
        [
          ["reembolsos", "Reembolsos"],
          ["rifas", "Rifas (edição e adiamento)"],
          // Denúncias são só da plataforma: a denunciada nunca vê.
          ...(daPlataforma ? ([["denuncias", "Denúncias"], ["verificacoes", "Verificações"]] as const) : []),
        ] as const
      ).map(([valor, rotulo]) => (
        <button
          key={valor}
          type="button"
          role="tab"
          aria-selected={area === valor}
          onClick={() => setArea(valor)}
          className={`relative -mb-px shrink-0 whitespace-nowrap border-b-2 px-3 py-2 text-sm ${
            area === valor ? "border-green font-semibold text-ink" : "border-transparent text-ink-2 hover:text-ink"
          }`}
        >
          {rotulo}
          {valor === "denuncias" && pendentes?.denuncias ? (
            <span className="tnum ml-1 rounded-full bg-yellow-soft px-1.5 text-[11px] text-yellow-deep">
              {pendentes.denuncias}
              <span className="sr-only"> em análise</span>
            </span>
          ) : null}
          {valor === "verificacoes" && pendentes?.verificacoes ? (
            <span className="tnum ml-1 rounded-full bg-yellow-soft px-1.5 text-[11px] text-yellow-deep">
              {pendentes.verificacoes}
              <span className="sr-only"> em análise</span>
            </span>
          ) : null}
          {valor === "rifas" && pendentes?.solicitacoes ? (
            <span className="tnum ml-1 rounded-full bg-yellow-soft px-1.5 text-[11px] text-yellow-deep">
              {pendentes.solicitacoes}
              <span className="sr-only"> em análise</span>
            </span>
          ) : null}
        </button>
      ))}
    </div>
  );

  if (area === "denuncias" && daPlataforma) {
    return (
      <PanelShell title="Atendimento">
        {abas}
        <DenunciasDaPlataforma />
      </PanelShell>
    );
  }

  if (area === "verificacoes" && daPlataforma) {
    return (
      <PanelShell title="Atendimento">
        {abas}
        <VerificacoesDaPlataforma />
      </PanelShell>
    );
  }

  if (area === "rifas") {
    return (
      <PanelShell title="Atendimento">
        {abas}
        <SolicitacoesDeRifa daPlataforma={daPlataforma} />
      </PanelShell>
    );
  }

  return (
    <PanelShell title="Atendimento">
      {abas}
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

      <MestreDetalhe
        aberto={aberto}
        aoFechar={() => setAberto(null)}
        vazio="Escolha um chamado para ver a conversa e decidir."
        lista={
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
                        <StatusPill s={c.status} disputa={c.disputa} />
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
        }
        detalhe={
          aberto ? (
            <DetalheChamado
              id={aberto}
              daPlataforma={daPlataforma}
              aoMudar={() => qc.invalidateQueries({ queryKey: ["/api/admin/chamados"] })}
            />
          ) : null
        }
      />
    </PanelShell>
  );
}

function DetalheChamado({ id, aoMudar, daPlataforma }: { id: string; aoMudar: () => void; daPlataforma: boolean }) {
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
  const emDisputa = chamado.disputa === "aberta";
  const emAndamento = chamado.status === "aberto" || chamado.status === "aprovado" || emDisputa;

  return (
    <Card
      title={`Chamado ${chamado.protocolo}`}
      right={<StatusPill s={chamado.status} disputa={chamado.disputa} />}
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

      {chamado.disputa ? (
        <DisputaDoChamado
          id={id}
          chamado={chamado}
          sorteioEm={data.sorteioEm}
          daPlataforma={daPlataforma}
          aoDecidir={recarregar}
        />
      ) : null}

      <Conversa
        mensagens={data.mensagens}
        meuLado={daPlataforma && emDisputa ? "plataforma" : "organizacao"}
        anexoBase="/api/admin/chamados/anexos"
        podeEscrever={emAndamento}
        enviando={responder.isPending}
        enviar={(m) => responder.mutateAsync(m)}
      />

      {chamado.status === "aberto" && !emDisputa ? (
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

/**
 * A disputa: o que o comprador contestou e, para a plataforma, a decisão.
 * A organização vê e pode argumentar na conversa, mas não decide.
 */
function DisputaDoChamado({
  id,
  chamado,
  sorteioEm,
  daPlataforma,
  aoDecidir,
}: {
  id: string;
  chamado: Detalhe["chamado"];
  sorteioEm: string | null;
  daPlataforma: boolean;
  aoDecidir: () => void;
}) {
  const [decisao, setDecisao] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const decidir = useMutation({
    mutationFn: (resultado: "procedente" | "improcedente") =>
      apiRequest("POST", `/api/admin/chamados/${id}/disputa/decidir`, { resultado, decisao }),
    onSuccess: () => {
      setDecisao("");
      setErro(null);
      aoDecidir();
    },
    onError: (e: Error) => setErro(e.message),
  });
  const aberta = chamado.disputa === "aberta";

  return (
    <div className="space-y-2 border-b border-line p-4 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <span className="label-xs">Disputa</span>
        {chamado.disputa ? (
          <Pill status={PILL_DISPUTA[chamado.disputa]}>{NOME_STATUS_DISPUTA[chamado.disputa]}</Pill>
        ) : null}
        {chamado.disputaAbertaEm ? (
          <span className="tnum text-xs text-muted">aberta em {new Date(chamado.disputaAbertaEm).toLocaleString("pt-BR")}</span>
        ) : null}
      </div>
      {chamado.disputaMotivo ? (
        <p className="rounded-md bg-mist px-3 py-2">
          <span className="label-xs block">O comprador contesta</span>
          {chamado.disputaMotivo}
        </p>
      ) : null}
      {chamado.disputaDecisao ? <p className="text-xs text-muted">Decisão da plataforma: {chamado.disputaDecisao}</p> : null}

      {aberta && !daPlataforma ? (
        <p className="text-xs text-muted">
          A decisão é da plataforma. Você pode explicar o seu lado na conversa acima.
        </p>
      ) : null}

      {aberta && daPlataforma ? (
        <div className="space-y-2">
          {sorteioEm ? (
            <p className="text-xs text-muted">
              Sorteio em <span className="tnum">{new Date(sorteioEm).toLocaleString("pt-BR")}</span>. Procedente, o
              chamado vira aprovado com o prazo de devolução da organização; a devolução segue pelo botão de sempre.
            </p>
          ) : null}
          <label htmlFor="decisao-disputa" className="label-xs">
            Decisão (vai para o comprador e para a organização)
          </label>
          <textarea
            id="decisao-disputa"
            rows={3}
            value={decisao}
            onChange={(e) => setDecisao(e.target.value)}
            className="w-full rounded-md border border-line-2 px-3 py-2 text-sm"
          />
          {erro ? <p className="text-xs text-red">{erro}</p> : null}
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => decidir.mutate("procedente")} disabled={decisao.trim().length < 10 || decidir.isPending}>
              Procedente: reembolsar
            </Button>
            <Button
              variant="ghost"
              onClick={() => decidir.mutate("improcedente")}
              disabled={decisao.trim().length < 10 || decidir.isPending}
            >
              Improcedente: manter a recusa
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
