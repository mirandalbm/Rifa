import { EntidadesDaPlataforma } from "@/components/EntidadesDaPlataforma";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { PanelShell } from "@/components/AppShell";
import { Button, Campo, Caixa, Empty, Filtros, Money, Pill } from "@/components/bits";
import { Abas, CartaoDoPainel, MestreDetalhe } from "@/components/painel";
import { Conversa, type Mensagem } from "@/components/Conversa";
import { SolicitacoesDeRifa } from "@/components/SolicitacoesDeRifa";
import { DenunciasDaPlataforma } from "@/components/Seguranca";
import { VerificacoesDaPlataforma } from "@/components/VerificacoesDaPlataforma";
import { apiRequest } from "@/lib/queryClient";
import { useSession } from "@/lib/session";
import { formatBRL } from "@shared/format";
import {
  NOME_STATUS_DISPUTA,
  PILL_DISPUTA,
  situacaoDoChamado,
  devolucaoAConferir,
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
  formaDevolucao: string | null;
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
  historico: { protocolo: string; status: StatusChamado; formaDevolucao: string | null }[];
  mensagens: Mensagem[];
}

const FILTROS: { valor: string; rotulo: string }[] = [
  { valor: "aberto", rotulo: "em análise" },
  { valor: "aprovado", rotulo: "aguardando devolução" },
  { valor: "estornado", rotulo: "devolvidos" },
  // O pedido de devolução saiu e o provedor não confirmou: a plataforma confere.
  { valor: "a_conferir", rotulo: "a conferir no provedor" },
  { valor: "recusado", rotulo: "recusados" },
  // Levados à plataforma pelo comprador: a palavra final é dela.
  { valor: "disputa", rotulo: "em disputa" },
  { valor: "", rotulo: "todos" },
];

function StatusPill({ s, disputa, forma }: { s: StatusChamado; disputa?: StatusDisputa | null; forma?: string | null }) {
  if (disputa === "aberta") return <Pill status={PILL_DISPUTA.aberta}>{NOME_STATUS_DISPUTA.aberta}</Pill>;
  // "Devolução a conferir no provedor", nunca "devolvido", enquanto ninguém conferiu.
  const situacao = situacaoDoChamado({ status: s, formaDevolucao: forma });
  return <Pill status={situacao.pill}>{situacao.rotulo}</Pill>;
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
  // A Caixa de entrada leva direto a uma fila (`?status=a_conferir`); só valor conhecido.
  const [escolhido, setFiltro] = useState<string | null>(() => {
    const daUrl = typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("status") : null;
    return FILTROS.some((f) => f.valor === daUrl) ? daUrl : null;
  });
  const filtro = escolhido ?? (daPlataforma ? "disputa" : "aberto");
  const [aberto, setAberto] = useState<string | null>(null);

  // As filas do atendimento, uma aba cada (a aba vai na URL, `?aba=`): reembolso
  // (chamados dos compradores) e pedidos de mudança em rifa publicada (edição e
  // adiamento, que a plataforma analisa); denúncias, verificações e entidades
  // são só da plataforma — a denunciada nunca vê.
  const { data: pendentes } = useQuery<{
    total: number;
    disputas?: number;
    solicitacoes?: number;
    denuncias?: number;
    verificacoes?: number;
  }>({
    queryKey: ["/api/admin/chamados/pendentes"],
  });
  // O título da aba é texto (`Abas` do kit): o contador vai escrito, nunca só numa bolinha.
  const comContador = (titulo: string, n?: number) => (n ? `${titulo} (${n} em análise)` : titulo);

  const reembolsos = (
    <>
      <Filtros
        exclusivo
        rotulo="Situação dos chamados"
        className="mb-3"
        ativa={filtro}
        aoMudar={(v) => {
          setFiltro(v);
          setAberto(null);
        }}
        opcoes={FILTROS.map((f) => ({ valor: f.valor, rotulo: f.rotulo }))}
      />
      <ListaDeChamados filtro={filtro} aberto={aberto} setAberto={setAberto} daPlataforma={daPlataforma} aoMudar={() => qc.invalidateQueries({ queryKey: ["/api/admin/chamados"] })} />
    </>
  );

  return (
    <PanelShell title="Atendimento">
      {/* Remonta quando o papel chega: as abas só da plataforma não existem antes, e a aba da URL se perderia. */}
      <Abas
        key={daPlataforma ? "plataforma" : "organizacao"}
        rotulo="Filas do atendimento"
        abas={[
          { id: "reembolsos", titulo: "Reembolsos", conteudo: reembolsos },
          {
            id: "rifas",
            titulo: comContador("Rifas (edição e adiamento)", pendentes?.solicitacoes),
            conteudo: <SolicitacoesDeRifa daPlataforma={daPlataforma} />,
          },
          ...(daPlataforma
            ? [
                { id: "denuncias", titulo: comContador("Denúncias", pendentes?.denuncias), conteudo: <DenunciasDaPlataforma /> },
                { id: "verificacoes", titulo: comContador("Verificações", pendentes?.verificacoes), conteudo: <VerificacoesDaPlataforma /> },
                { id: "entidades", titulo: "Entidades", conteudo: <EntidadesDaPlataforma /> },
              ]
            : []),
        ]}
      />
      {daPlataforma ? <OQueAPlataformaDecide /> : null}
    </PanelShell>
  );
}

/** O que só a plataforma decide no Atendimento (Figma, P23): a régua de cada fila, em uma linha. */
function OQueAPlataformaDecide() {
  return (
    <CartaoDoPainel titulo="O que a plataforma decide aqui" className="mt-4 md:mt-6">
      <ul className="space-y-2 px-5 pb-5 text-[13px] leading-[18px] text-ink-2">
        <li>
          • Disputa de reembolso: procedente vira aprovado com o prazo da organização; improcedente mantém a recusa.
          &quot;Plataforma&quot; aparece para os dois lados; a pessoa fica na auditoria.
        </li>
        <li>
          • Denúncias: improcedente, travar a rifa ou banir a organização (motivo obrigatório; retenção cautelar nasce no
          banimento).
        </li>
        <li>• Verificações: documentos e foto, com a autorização biométrica conferida; a semelhança decide e é descartada.</li>
        <li>• Entidades beneficiadas: CNPJ e documentos abertos com auditoria antes; decide a versão que abriu.</li>
      </ul>
    </CartaoDoPainel>
  );
}

/** A lista dos chamados e o item aberto (`MestreDetalhe`): de `xl` lado a lado; abaixo, uma coisa por vez. */
function ListaDeChamados({
  filtro,
  aberto,
  setAberto,
  daPlataforma,
  aoMudar,
}: {
  filtro: string;
  aberto: string | null;
  setAberto: (id: string | null) => void;
  daPlataforma: boolean;
  aoMudar: () => void;
}) {
  const { data: lista } = useQuery<Linha[]>({
    queryKey: ["/api/admin/chamados", filtro ? { status: filtro } : {}],
    refetchInterval: 30_000,
  });
  return (
    <MestreDetalhe
      aberto={aberto}
      aoFechar={() => setAberto(null)}
      vazio="Escolha um chamado para ver a conversa e decidir."
      lista={
        <CartaoDoPainel titulo="Chamados">
          {lista?.length ? (
            <ul className="divide-y divide-line border-t border-line">
              {lista.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => setAberto(c.id)}
                    aria-current={aberto === c.id ? "true" : undefined}
                    className={`w-full px-5 py-3 text-left hover:bg-mist ${aberto === c.id ? "bg-mist" : ""}`}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="tnum text-sm font-semibold">{c.protocolo}</span>
                      <StatusPill s={c.status} disputa={c.disputa} forma={c.formaDevolucao} />
                    </div>
                    {/* A plataforma vê todas as organizações: na lista, quem pediu vai só pelo ID do cliente (o nome, ao abrir). */}
                    <p className="mt-1 text-sm">
                      {daPlataforma ? (
                        <>
                          {c.organizacao} <span className="tnum text-xs text-muted">· Cliente {c.cliente ?? "sem ID"}</span>
                        </>
                      ) : (
                        <>
                          {c.nome} <span className="tnum text-xs text-muted">· {c.cliente ?? "sem ID"}</span>
                        </>
                      )}
                    </p>
                    <p className="text-xs text-muted">
                      {c.rifa} · pedido <span className="tnum">#{c.pedido}</span> · <span className="tnum">{formatBRL(c.valorCents)}</span>
                    </p>
                    {c.status === "aprovado" ? <Prazo ate={c.prazoEstornoAte} /> : null}
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <Empty>Nenhum chamado aqui.</Empty>
          )}
        </CartaoDoPainel>
      }
      detalhe={aberto ? <DetalheChamado id={aberto} daPlataforma={daPlataforma} aoMudar={aoMudar} /> : null}
    />
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

  // Só a plataforma reconhece a falha dela: a taxa Pix volta à promotora (cláusula X.10).
  const [falhaDaPlataforma, setFalhaDaPlataforma] = useState(false);
  const estornar = useMutation({
    mutationFn: async () =>
      (await (await apiRequest("POST", `/api/admin/chamados/${id}/estornar`, daPlataforma ? { falhaDaPlataforma } : {})).json()) as {
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

  if (!data)
    return (
      <CartaoDoPainel titulo="Chamado">
        <Empty>Carregando…</Empty>
      </CartaoDoPainel>
    );
  const { chamado, pedido, cliente } = data;
  const emDisputa = chamado.disputa === "aberta";
  const emAndamento = chamado.status === "aberto" || chamado.status === "aprovado" || emDisputa;

  return (
    <CartaoDoPainel titulo={`Chamado ${chamado.protocolo}`} acao={<StatusPill s={chamado.status} disputa={chamado.disputa} forma={chamado.formaDevolucao} />}>
      <div className="space-y-3 border-b border-t border-line px-5 py-4 text-sm">
        {aviso ? (
          <p className={`rounded-md px-3 py-2 ${aviso.ok ? "bg-green-soft text-green-deep" : "bg-red-soft text-red"}`}>
            {aviso.texto}
          </p>
        ) : null}
        <dl className="grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2">
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
            {data.historico.map((h) => `${h.protocolo} (${situacaoDoChamado(h).rotulo})`).join(", ")}.
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
        <div className="space-y-2 border-t border-line px-5 py-4">
          <Campo rotulo="Decisão (a resposta vai para o cliente)">
            <textarea id="resposta" rows={2} value={resposta} onChange={(e) => setResposta(e.target.value)} />
          </Campo>
          <div className="flex flex-wrap gap-2">
            <Button
              onClick={() => concluir.mutate("aprovado")}
              disabled={resposta.trim().length < 5 || concluir.isPending}
            >
              Aprovar reembolso
            </Button>
            <Button
              variant="cinza"
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
        <div className="space-y-2 border-t border-line px-5 py-4">
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
          {daPlataforma ? (
            <Caixa
              marcada={falhaDaPlataforma}
              aoMudar={setFalhaDaPlataforma}
              sub="Sem marcar, ela só volta no arrependimento (até 7 dias); no reembolso com taxa e no adiamento, fica com a plataforma."
            >
              Falha da plataforma: a taxa Pix volta à organização.
            </Caixa>
          ) : null}
          <p className="text-[11px] text-muted">
            {pedido.provedor
              ? "Com Pix, o valor volta pelo provedor para a mesma conta que pagou."
              : "Venda do cambista: o sistema registra a devolução; o valor é devolvido à mão."}
          </p>
        </div>
      ) : null}

      {devolucaoAConferir(chamado) ? (
        <ConferenciaDaDevolucao id={id} daPlataforma={daPlataforma} provedor={pedido.provedor} aoDecidir={recarregar} />
      ) : null}

      {chamado.decisao && !emAndamento ? (
        <p className="border-t border-line px-5 py-3 text-xs text-muted">Decisão: {chamado.decisao}</p>
      ) : null}
    </CartaoDoPainel>
  );
}

/**
 * A devolução a conferir no provedor: o pedido de devolução saiu e o provedor
 * não confirmou o valor. Só a plataforma decide, depois de olhar o painel do
 * provedor, com a observação do que conferiu; a organização só lê.
 */
function ConferenciaDaDevolucao({
  id,
  daPlataforma,
  provedor,
  aoDecidir,
}: {
  id: string;
  daPlataforma: boolean;
  provedor: string | null;
  aoDecidir: () => void;
}) {
  const [observacao, setObservacao] = useState("");
  const [aviso, setAviso] = useState<{ ok: boolean; texto: string } | null>(null);
  const decidir = useMutation({
    mutationFn: async (devolveu: boolean) =>
      (await (await apiRequest("POST", `/api/admin/chamados/${id}/conferencia`, { devolveu, observacao })).json()) as {
        status: string;
        cotasLiberadas: number;
      },
    onSuccess: (r, devolveu) => {
      setObservacao("");
      setAviso({
        ok: true,
        texto: devolveu
          ? `Devolução confirmada: o pedido foi desfeito no sistema (${r.cotasLiberadas} cota(s) voltaram ao estoque).`
          : "Devolução não saiu: o chamado voltou a aprovado e pode ser devolvido de novo.",
      });
      aoDecidir();
    },
    onError: (e: Error) => setAviso({ ok: false, texto: e.message }),
  });
  return (
    <div className="space-y-2 border-t border-line px-5 py-4 text-sm">
      <p className="rounded-md bg-yellow-soft px-3 py-2 text-xs text-yellow-deep">
        O pedido de devolução saiu{provedor ? ` para o ${provedor}` : ""}, mas o provedor não confirmou o valor. Nada foi
        desfeito no sistema e a comissão do pedido está segura até a conferência.
        {daPlataforma ? " Confira a cobrança no painel do provedor e diga o que viu." : " A plataforma confere no provedor e decide."}
      </p>
      {aviso ? (
        <p className={`rounded-md px-3 py-2 ${aviso.ok ? "bg-green-soft text-green-deep" : "bg-red-soft text-red"}`}>{aviso.texto}</p>
      ) : null}
      {daPlataforma ? (
        <>
          <Campo rotulo="O que você conferiu no provedor (obrigatório)">
            <textarea id="conferencia" rows={2} value={observacao} onChange={(e) => setObservacao(e.target.value)} />
          </Campo>
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => decidir.mutate(true)} disabled={observacao.trim().length < 5 || decidir.isPending}>
              O dinheiro voltou: desfazer o pedido
            </Button>
            <Button variant="cinza" onClick={() => decidir.mutate(false)} disabled={observacao.trim().length < 5 || decidir.isPending}>
              Não voltou: reabrir a devolução
            </Button>
          </div>
        </>
      ) : null}
    </div>
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
    <div className="space-y-2 border-b border-line px-5 py-4 text-sm">
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
          <Campo rotulo="Decisão (vai para o comprador e para a organização)">
            <textarea id="decisao-disputa" rows={3} value={decisao} onChange={(e) => setDecisao(e.target.value)} />
          </Campo>
          {erro ? <p className="text-xs text-red">{erro}</p> : null}
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => decidir.mutate("procedente")} disabled={decisao.trim().length < 10 || decidir.isPending}>
              Procedente: reembolsar
            </Button>
            <Button
              variant="cinza"
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
