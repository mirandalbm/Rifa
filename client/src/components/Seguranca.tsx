import { useState } from "react";
import { Link } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Flag, ShieldAlert, X } from "lucide-react";
import { Button, Card, Empty, Pill } from "@/components/bits";
import { apiRequest } from "@/lib/queryClient";
import { useSession } from "@/lib/session";
import { maskPhone } from "@shared/format";
import {
  MOTIVOS_DE_DENUNCIA,
  NOME_STATUS_DENUNCIA,
  PILL_DENUNCIA,
  SO_VALE_PELA_PLATAFORMA,
  type MotivoDeDenuncia,
  type StatusDenuncia,
} from "@shared/seguranca";

type Aviso = { ok: boolean; texto: string } | null;

interface EstadoTelefone {
  telefone: string | null;
  confirmadoEm: string | null;
  aprovadoEm: string | null;
}

function PillDoTelefone({ e }: { e: EstadoTelefone }) {
  if (e.aprovadoEm) return <Pill status="paid">aprovado</Pill>;
  if (e.confirmadoEm) return <Pill status="pending">aguardando a plataforma</Pill>;
  if (e.telefone) return <Pill status="pending">falta confirmar</Pill>;
  return <Pill status="draft">sem telefone</Pill>;
}

/**
 * O telefone do organizador: código no WhatsApp e, depois, a aprovação da
 * plataforma. Sem os dois, a rifa não publica. Trocar o número recomeça.
 */
export function TelefoneDoOrganizadorCard() {
  const qc = useQueryClient();
  const { data: org } = useQuery<{ organizacaoId?: string }>({ queryKey: ["/api/admin/organizer"] });
  const id = org?.organizacaoId;
  const chave = [`/api/admin/organizacoes/${id}/telefone`];
  const { data: e } = useQuery<EstadoTelefone>({ queryKey: chave, enabled: Boolean(id) });
  const [telefone, setTelefone] = useState("");
  const [codigo, setCodigo] = useState("");
  const [enviado, setEnviado] = useState(false);
  const [aviso, setAviso] = useState<Aviso>(null);

  const pedir = useMutation({
    mutationFn: async () =>
      (await (await apiRequest("POST", `/api/admin/organizacoes/${id}/telefone`, { telefone })).json()) as {
        devCode?: string;
      },
    onSuccess: (r) => {
      setEnviado(true);
      setAviso({
        ok: true,
        texto: `Código enviado no WhatsApp.${r.devCode ? ` (desenvolvimento: ${r.devCode})` : ""}`,
      });
      qc.invalidateQueries({ queryKey: chave });
    },
    onError: (err: Error) => setAviso({ ok: false, texto: err.message }),
  });
  const confirmar = useMutation({
    mutationFn: () => apiRequest("POST", `/api/admin/organizacoes/${id}/telefone/confirmar`, { codigo }),
    onSuccess: () => {
      setEnviado(false);
      setCodigo("");
      setAviso({ ok: true, texto: "Telefone confirmado. Agora a plataforma aprova — você recebe o aviso." });
      qc.invalidateQueries({ queryKey: chave });
    },
    onError: (err: Error) => setAviso({ ok: false, texto: err.message }),
  });

  if (!id || !e) return null;
  return (
    <Card title="Telefone do organizador" right={<PillDoTelefone e={e} />}>
      <div className="space-y-3 p-4 text-sm">
        <p className="text-xs text-muted">
          É o contato que responde pelas rifas. Precisa ser confirmado com um código no WhatsApp e aprovado pela
          plataforma <b>antes da primeira rifa</b>. Pedir Pix fora da plataforma leva ao banimento.
        </p>
        {e.telefone ? (
          <p>
            Número atual: <span className="tnum font-semibold">{maskPhone(e.telefone)}</span>
          </p>
        ) : null}
        <form
          className="flex flex-wrap items-end gap-2"
          onSubmit={(ev) => {
            ev.preventDefault();
            setAviso(null);
            pedir.mutate();
          }}
        >
          <div className="min-w-0 flex-1">
            <label htmlFor="tel-org" className="label-xs">
              {e.telefone ? "Trocar ou reenviar para o WhatsApp" : "WhatsApp com DDD"}
            </label>
            <input
              id="tel-org"
              inputMode="tel"
              value={telefone}
              placeholder={e.telefone ? maskPhone(e.telefone) : "(11) 91234-5678"}
              onChange={(ev) => setTelefone(ev.target.value)}
              className="tnum mt-1 w-full rounded-md border border-line-2 px-3 py-2"
            />
          </div>
          <Button type="submit" disabled={pedir.isPending || telefone.replace(/\D/g, "").length < 10}>
            Enviar código
          </Button>
        </form>
        {enviado || (e.telefone && !e.confirmadoEm) ? (
          <form
            className="flex flex-wrap items-end gap-2"
            onSubmit={(ev) => {
              ev.preventDefault();
              confirmar.mutate();
            }}
          >
            <div>
              <label htmlFor="cod-org" className="label-xs">
                Código recebido
              </label>
              <input
                id="cod-org"
                inputMode="numeric"
                maxLength={6}
                value={codigo}
                onChange={(ev) => setCodigo(ev.target.value.replace(/\D/g, ""))}
                className="tnum mt-1 w-32 rounded-md border border-line-2 px-3 py-2"
              />
            </div>
            <Button type="submit" disabled={confirmar.isPending || codigo.length !== 6}>
              Confirmar
            </Button>
          </form>
        ) : null}
        {aviso ? <p className={`text-xs ${aviso.ok ? "text-green-deep" : "text-red"}`}>{aviso.texto}</p> : null}
      </div>
    </Card>
  );
}

/** Na lista de organizações (plataforma): o estado do telefone e o botão de aprovar. */
export function AprovarTelefone({
  id,
  telefone,
  confirmadoEm,
  aprovadoEm,
}: {
  id: string;
  telefone: string | null;
  confirmadoEm: string | null;
  aprovadoEm: string | null;
}) {
  const qc = useQueryClient();
  const aprovar = useMutation({
    mutationFn: () => apiRequest("POST", `/api/admin/organizacoes/${id}/telefone/aprovar`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/admin/organizacoes"] }),
    onError: (e: Error) => window.alert(e.message),
  });
  return (
    <span className="flex flex-wrap items-center gap-2">
      <span className="tnum">{telefone ? maskPhone(telefone) : "—"}</span>
      <PillDoTelefone e={{ telefone, confirmadoEm, aprovadoEm }} />
      {confirmadoEm && !aprovadoEm ? (
        <Button
          className="px-2 py-1 text-xs"
          disabled={aprovar.isPending}
          onClick={() => {
            if (window.confirm(`Aprovar o telefone ${maskPhone(telefone ?? "")}? Confira antes (ligue, se preciso).`)) {
              aprovar.mutate();
            }
          }}
        >
          Aprovar telefone
        </Button>
      ) : null}
    </span>
  );
}

/** O aviso perto do botão de comprar: só vale bilhete pago pela plataforma. */
export function SoValePelaPlataforma({ rifa }: { rifa: string }) {
  return (
    <p className="flex items-start gap-2 rounded-md border border-line bg-mist px-3 py-2 text-xs text-ink-2">
      <ShieldAlert size={16} aria-hidden className="mt-0.5 shrink-0" />
      <span>
        {SO_VALE_PELA_PLATAFORMA} <BotaoDenunciar rifa={rifa} comoLink />
      </span>
    </p>
  );
}

/**
 * Denunciar rifa, comentário ou organização. Precisa de conta (o protocolo
 * volta para quem denunciou); a denunciada nunca vê quem foi.
 */
export function BotaoDenunciar({
  rifa,
  organizacao,
  comentario,
  comoLink,
}: {
  rifa?: string;
  organizacao?: string;
  comentario?: string;
  comoLink?: boolean;
}) {
  const [aberto, setAberto] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setAberto(true)}
        className={
          comoLink
            ? "font-semibold underline"
            : "inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-muted hover:bg-mist hover:text-ink"
        }
      >
        {comoLink ? null : <Flag size={14} aria-hidden />}
        Denunciar
      </button>
      {aberto ? (
        <Denunciar rifa={rifa} organizacao={organizacao} comentario={comentario} onFechar={() => setAberto(false)} />
      ) : null}
    </>
  );
}

export function Denunciar({
  rifa,
  organizacao,
  comentario,
  onFechar,
}: {
  rifa?: string;
  organizacao?: string;
  comentario?: string;
  onFechar: () => void;
}) {
  const { data: sessao } = useSession();
  const [motivo, setMotivo] = useState<MotivoDeDenuncia>("pix_fora");
  const [texto, setTexto] = useState("");
  const [aviso, setAviso] = useState<Aviso>(null);
  const enviar = useMutation({
    mutationFn: async () =>
      (await (await apiRequest("POST", "/api/public/denuncias", { rifa, organizacao, comentario, motivo, texto })).json()) as {
        protocolo: string;
      },
    onSuccess: (r) =>
      setAviso({ ok: true, texto: `Denúncia registrada — protocolo ${r.protocolo}. A plataforma vai analisar.` }),
    onError: (e: Error) => setAviso({ ok: false, texto: e.message }),
  });
  const temConta = Boolean(sessao?.buyer?.conta);
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:items-center" onClick={onFechar}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Denunciar"
        className="w-full max-w-md rounded-t-2xl bg-white p-4 sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-2 flex items-center justify-between">
          <h2 className="font-display text-lg font-bold">Denunciar</h2>
          <button type="button" onClick={onFechar} aria-label="Fechar" className="rounded-md p-1 hover:bg-mist">
            <X size={20} aria-hidden />
          </button>
        </div>
        {!temConta ? (
          <p className="text-sm">
            <Link href="/entrar" className="font-semibold text-marca">
              Entre na sua conta
            </Link>{" "}
            para denunciar. A organização nunca fica sabendo quem denunciou.
          </p>
        ) : aviso?.ok ? (
          <p className="rounded-md bg-green-soft px-3 py-2 text-sm text-green-deep">{aviso.texto}</p>
        ) : (
          <form
            className="space-y-3 text-sm"
            onSubmit={(e) => {
              e.preventDefault();
              enviar.mutate();
            }}
          >
            <fieldset className="space-y-1">
              <legend className="label-xs mb-1">O que aconteceu?</legend>
              {(Object.keys(MOTIVOS_DE_DENUNCIA) as MotivoDeDenuncia[]).map((m) => (
                <label key={m} className="flex items-start gap-2">
                  <input type="radio" name="motivo" checked={motivo === m} onChange={() => setMotivo(m)} className="mt-1" />
                  {MOTIVOS_DE_DENUNCIA[m]}
                </label>
              ))}
            </fieldset>
            <div>
              <label htmlFor="den-texto" className="label-xs">
                Conte o que viu (opcional)
              </label>
              <textarea
                id="den-texto"
                rows={3}
                maxLength={1000}
                value={texto}
                onChange={(e) => setTexto(e.target.value)}
                className="mt-1 w-full rounded-md border border-line-2 px-3 py-2"
              />
            </div>
            <p className="text-[11px] text-muted">A organização nunca fica sabendo quem denunciou.</p>
            {aviso ? <p className="text-xs text-red">{aviso.texto}</p> : null}
            <Button type="submit" disabled={enviar.isPending}>
              Enviar denúncia
            </Button>
          </form>
        )}
      </div>
    </div>
  );
}

interface LinhaDenuncia {
  id: string;
  protocolo: string;
  origem: "apostador" | "automatica";
  motivo: MotivoDeDenuncia;
  status: StatusDenuncia;
  createdAt: string;
  organizacao: string;
  rifa: string | null;
}

interface DetalheDenuncia {
  id: string;
  protocolo: string;
  origem: string;
  motivoTexto: string;
  texto: string | null;
  evidencia: string | null;
  status: StatusDenuncia;
  decisao: string | null;
  createdAt: string;
  organizacao: { nome: string; slug: string; telefone: string | null; banidaEm: string | null };
  rifa: { titulo: string; slug: string; travadaEm: string | null } | null;
  comentario: string | null;
  quem: { apelido: string | null; nomeReal: string } | null;
}

const FILTROS = [
  { valor: "aberta", rotulo: "em análise" },
  { valor: "", rotulo: "todas" },
];

/** A fila de denúncias da plataforma (Atendimento › Denúncias). */
export function DenunciasDaPlataforma() {
  const [filtro, setFiltro] = useState("aberta");
  const [aberto, setAberto] = useState<string | null>(null);
  const { data } = useQuery<LinhaDenuncia[]>({
    queryKey: ["/api/admin/denuncias", filtro ? { status: filtro } : {}],
    refetchInterval: 30_000,
  });
  return (
    <>
      <div className="mb-3 flex flex-wrap gap-1" role="tablist" aria-label="Situação das denúncias">
        {FILTROS.map((f) => (
          <button
            key={f.valor || "todas"}
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
        <Card title="Denúncias">
          {data?.length ? (
            <ul className="divide-y divide-line">
              {data.map((d) => (
                <li key={d.id}>
                  <button
                    type="button"
                    onClick={() => setAberto(d.id)}
                    className={`w-full px-4 py-3 text-left hover:bg-mist ${aberto === d.id ? "bg-mist" : ""}`}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="tnum text-sm font-semibold">{d.protocolo}</span>
                      <Pill status={PILL_DENUNCIA[d.status]}>{NOME_STATUS_DENUNCIA[d.status]}</Pill>
                    </div>
                    <p className="mt-1 text-sm">{MOTIVOS_DE_DENUNCIA[d.motivo] ?? d.motivo}</p>
                    <p className="text-xs text-muted">
                      {d.organizacao}
                      {d.rifa ? ` · ${d.rifa}` : ""} · {d.origem === "automatica" ? "automática" : "apostador"}
                    </p>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <Empty>Nenhuma denúncia aqui.</Empty>
          )}
        </Card>
        {aberto ? <DetalheDaDenuncia id={aberto} /> : (
          <Card>
            <Empty>Escolha uma denúncia para ver a evidência e decidir.</Empty>
          </Card>
        )}
      </div>
    </>
  );
}

function DetalheDaDenuncia({ id }: { id: string }) {
  const qc = useQueryClient();
  const { data: d } = useQuery<DetalheDenuncia>({ queryKey: [`/api/admin/denuncias/${id}`] });
  const [resposta, setResposta] = useState("");
  const [aviso, setAviso] = useState<Aviso>(null);
  const decidir = useMutation({
    mutationFn: (acao: "improcedente" | "travar" | "banir") =>
      apiRequest("POST", `/api/admin/denuncias/${id}/decidir`, { acao, resposta }),
    onSuccess: (_r, acao) => {
      setAviso({
        ok: true,
        texto:
          acao === "travar"
            ? "Rifa travada: as vendas pararam e ela saiu da vitrine."
            : acao === "banir"
              ? "Organização banida: a porta fechou e todas as rifas dela travaram."
              : "Denúncia encerrada como improcedente.",
      });
      qc.invalidateQueries({ queryKey: ["/api/admin/denuncias"] });
      qc.invalidateQueries({ queryKey: [`/api/admin/denuncias/${id}`] });
      qc.invalidateQueries({ queryKey: ["/api/admin/chamados/pendentes"] });
    },
    onError: (e: Error) => setAviso({ ok: false, texto: e.message }),
  });
  if (!d) {
    return (
      <Card>
        <Empty>Carregando…</Empty>
      </Card>
    );
  }
  return (
    <Card title={`Denúncia ${d.protocolo}`} right={<Pill status={PILL_DENUNCIA[d.status]}>{NOME_STATUS_DENUNCIA[d.status]}</Pill>}>
      <div className="space-y-3 p-4 text-sm">
        {aviso ? (
          <p className={`rounded-md px-3 py-2 ${aviso.ok ? "bg-green-soft text-green-deep" : "bg-red-soft text-red"}`}>
            {aviso.texto}
          </p>
        ) : null}
        <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
          <div>
            <dt className="label-xs">Organização</dt>
            <dd>
              <Link href={`/o/${d.organizacao.slug}`} className="underline">
                {d.organizacao.nome}
              </Link>
              {d.organizacao.telefone ? <span className="tnum text-xs text-muted"> · {maskPhone(d.organizacao.telefone)}</span> : null}
              {d.organizacao.banidaEm ? (
                <span className="ml-1">
                  <Pill status="expired">banida</Pill>
                </span>
              ) : null}
            </dd>
          </div>
          <div>
            <dt className="label-xs">Rifa</dt>
            <dd>
              {d.rifa ? (
                <>
                  {d.rifa.titulo}
                  {d.rifa.travadaEm ? (
                    <span className="ml-1">
                      <Pill status="expired">travada</Pill>
                    </span>
                  ) : null}
                </>
              ) : (
                "—"
              )}
            </dd>
          </div>
          <div>
            <dt className="label-xs">Motivo</dt>
            <dd>{d.motivoTexto}</dd>
          </div>
          <div>
            <dt className="label-xs">De quem</dt>
            <dd>
              {d.origem === "automatica"
                ? "Varredura automática"
                : d.quem
                  ? `${d.quem.apelido ? `@${d.quem.apelido} · ` : ""}${d.quem.nomeReal}`
                  : "Apostador"}
            </dd>
          </div>
        </dl>
        {d.evidencia ? (
          <p className="rounded-md bg-yellow-soft px-3 py-2 text-xs text-yellow-deep">Trecho que acendeu — {d.evidencia}</p>
        ) : null}
        {d.comentario ? (
          <div className="rounded-md border border-line p-3">
            <p className="label-xs">Comentário</p>
            <p className="mt-1 whitespace-pre-wrap break-words">{d.comentario}</p>
          </div>
        ) : null}
        {d.texto ? (
          <div className="rounded-md border border-line p-3">
            <p className="label-xs">{d.origem === "automatica" ? "Texto do organizador" : "Relato"}</p>
            <p className="mt-1 whitespace-pre-wrap break-words">{d.texto}</p>
          </div>
        ) : null}
        {d.decisao ? <p className="text-xs text-muted">Decisão: {d.decisao}</p> : null}

        {d.status === "aberta" ? (
          <div className="space-y-2 rounded-md bg-mist p-3">
            <label htmlFor={`den-resp-${d.id}`} className="label-xs">
              Motivo da decisão (obrigatório para travar ou banir)
            </label>
            <textarea
              id={`den-resp-${d.id}`}
              rows={2}
              value={resposta}
              onChange={(e) => setResposta(e.target.value)}
              className="w-full rounded-md border border-line-2 px-3 py-2"
            />
            <div className="flex flex-wrap gap-2">
              <Button variant="ghost" onClick={() => decidir.mutate("improcedente")} disabled={decidir.isPending}>
                Improcedente
              </Button>
              {d.rifa ? (
                <Button
                  className="bg-yellow text-on-yellow"
                  disabled={decidir.isPending || resposta.trim().length < 10}
                  onClick={() => window.confirm("Travar a rifa? As vendas param na hora.") && decidir.mutate("travar")}
                >
                  Travar rifa
                </Button>
              ) : null}
              <Button
                variant="ghost"
                className="text-red"
                disabled={decidir.isPending || resposta.trim().length < 10}
                onClick={() =>
                  window.confirm(
                    `Banir ${d.organizacao.nome}? A porta fecha para todos dela e todas as rifas travam.`,
                  ) && decidir.mutate("banir")
                }
              >
                Banir organização
              </Button>
            </div>
          </div>
        ) : null}
      </div>
    </Card>
  );
}
