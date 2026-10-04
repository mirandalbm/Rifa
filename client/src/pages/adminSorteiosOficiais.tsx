import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { PanelShell } from "@/components/AppShell";
import { Comentarios } from "@/components/Comentarios";
import { Janela } from "@/components/Janela";
import { Button, Card, Campo, Empty, Pill } from "@/components/bits";
import { apiRequest } from "@/lib/queryClient";
import { useSession } from "@/lib/session";
import { ANTECEDENCIA_DA_TRANSMISSAO_MS, leituraDoLink } from "@shared/aoVivo";
import {
  LOTERIAS,
  ROTULO_DA_SITUACAO,
  type Loteria,
  type SituacaoDoSorteioOficial,
} from "@shared/sorteiosOficiais";

interface RifaNoSorteio {
  id: string;
  titulo: string;
  premio: string;
  status: string;
  /** Lançado o resultado, por que esta rifa ainda não sorteou (o relógio tenta de novo). */
  esperando?: string | null;
  organizacao?: string;
}

interface SorteioNoCalendario {
  id: string;
  loteria: Loteria;
  loteriaNome: string;
  concurso: number;
  sorteioEm: string;
  titulo: string | null;
  nome: string;
  transmissaoUrl: string | null;
  resultado: string[] | null;
  situacao: SituacaoDoSorteioOficial;
  problemaParaIntegrar: string | null;
  rifas: RifaNoSorteio[];
  publicadas?: number;
  /** Comentários no ar na tela do sorteio (a plataforma modera). */
  comentarios: number;
}

interface Campanha {
  campaign: { id: string; prizeTitle: string; title: string; status: string; sorteioOficialId: string | null; modoSorteio: string };
}

const FUSO = "America/Sao_Paulo";
const diaChave = (d: Date) => d.toLocaleDateString("en-CA", { timeZone: FUSO });
const dataHora = (iso: string) =>
  new Date(iso).toLocaleString("pt-BR", { weekday: "short", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: FUSO });
/** `datetime-local` do aparelho para ISO (o painel é usado no Brasil). */
const paraIso = (v: string) => (v ? new Date(v).toISOString() : "");
const paraCampo = (iso: string) => {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
};

const PILL_DA_SITUACAO: Record<SituacaoDoSorteioOficial, string> = {
  agendado: "pending",
  com_resultado: "paid",
  cancelado: "closed",
};

/**
 * Sorteios oficiais: o calendário dos concursos das loterias da Caixa que a
 * plataforma transmite. A plataforma cadastra, muda, cancela e lança o
 * resultado; a organização escolhe o sorteio da rifa em rascunho aqui — a
 * data da rifa passa a ser a do concurso e trava ao publicar.
 */
export function AdminSorteiosOficiais() {
  const { data: sessao } = useSession();
  const plataforma = sessao?.role === "admin";
  const { data: lista = [], isLoading } = useQuery<SorteioNoCalendario[]>({ queryKey: ["/api/admin/sorteios-oficiais"] });
  const [mes, setMes] = useState(() => {
    const h = new Date();
    return new Date(h.getFullYear(), h.getMonth(), 1);
  });
  const [diaEscolhido, setDiaEscolhido] = useState<string | null>(null);

  const porDia = useMemo(() => {
    const m = new Map<string, SorteioNoCalendario[]>();
    for (const s of lista) {
      const k = diaChave(new Date(s.sorteioEm));
      m.set(k, [...(m.get(k) ?? []), s]);
    }
    return m;
  }, [lista]);

  const visiveis = diaEscolhido ? (porDia.get(diaEscolhido) ?? []) : lista.filter((s) => s.situacao !== "cancelado" || plataforma);

  return (
    <PanelShell title="Sorteios oficiais">
      {/* O calendário ocupa a largura toda: é a peça principal da tela. */}
      <Card title="Calendário dos sorteios oficiais">
        <Calendario mes={mes} setMes={setMes} porDia={porDia} escolhido={diaEscolhido} escolher={setDiaEscolhido} />
      </Card>
      <div className="mt-3 grid grid-cols-1 gap-3 xl:grid-cols-[minmax(0,380px)_minmax(0,1fr)]">
        <div className="min-w-0 space-y-3">
          {plataforma ? (
            <>
              <NovoSorteio />
              <CanaisDasLoterias />
            </>
          ) : (
            <p className="px-1 text-xs text-muted">
              Escolha o sorteio da rifa em rascunho: a data da rifa passa a ser a do concurso e trava ao publicar. Depois de
              publicada, mudar só com a plataforma.
            </p>
          )}
        </div>
        <div className="min-w-0 space-y-3">
          <div className="flex items-center justify-between gap-2 px-1">
            <h2 className="text-sm font-bold">
              {diaEscolhido
                ? `Sorteios de ${new Date(`${diaEscolhido}T12:00:00`).toLocaleDateString("pt-BR", { day: "2-digit", month: "long" })}`
                : plataforma
                  ? "Todos os sorteios"
                  : "Sorteios que aceitam rifa e os seus"}
            </h2>
            {diaEscolhido ? (
              <button type="button" className="text-xs font-semibold text-marca" onClick={() => setDiaEscolhido(null)}>
                Ver todos
              </button>
            ) : null}
          </div>
          {isLoading ? <p className="px-1 text-sm text-muted">Carregando…</p> : null}
          {!isLoading && visiveis.length === 0 ? (
            <Card>
              <Empty>{plataforma ? "Nenhum sorteio oficial cadastrado." : "Nenhum sorteio oficial disponível agora."}</Empty>
            </Card>
          ) : null}
          {visiveis.map((s) => (
            <CartaoDoSorteio key={s.id} s={s} plataforma={plataforma} />
          ))}
        </div>
      </div>
    </PanelShell>
  );
}

function Calendario({
  mes,
  setMes,
  porDia,
  escolhido,
  escolher,
}: {
  mes: Date;
  setMes: (d: Date) => void;
  porDia: Map<string, SorteioNoCalendario[]>;
  escolhido: string | null;
  escolher: (d: string | null) => void;
}) {
  const inicio = new Date(mes.getFullYear(), mes.getMonth(), 1);
  const dias = new Date(mes.getFullYear(), mes.getMonth() + 1, 0).getDate();
  const vazios = inicio.getDay();
  const hoje = diaChave(new Date());
  const t = mes.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
  const titulo = t.charAt(0).toUpperCase() + t.slice(1);
  return (
    <div className="p-3">
      <div className="mb-2 flex items-center justify-between">
        <button
          type="button"
          aria-label="Mês anterior"
          className="rounded-md p-1.5 hover:bg-mist"
          onClick={() => setMes(new Date(mes.getFullYear(), mes.getMonth() - 1, 1))}
        >
          <ChevronLeft size={18} aria-hidden />
        </button>
        <p className="text-sm font-bold" aria-live="polite">
          {titulo}
        </p>
        <button
          type="button"
          aria-label="Próximo mês"
          className="rounded-md p-1.5 hover:bg-mist"
          onClick={() => setMes(new Date(mes.getFullYear(), mes.getMonth() + 1, 1))}
        >
          <ChevronRight size={18} aria-hidden />
        </button>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-semibold uppercase text-muted sm:gap-2" aria-hidden>
        {["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"].map((d) => (
          <span key={d}>
            <span className="sm:hidden">{d[0]}</span>
            <span className="hidden sm:inline">{d}</span>
          </span>
        ))}
      </div>
      <div className="mt-1 grid grid-cols-7 gap-1 sm:gap-2">
        {Array.from({ length: vazios }, (_, i) => (
          <span key={`v${i}`} />
        ))}
        {Array.from({ length: dias }, (_, i) => {
          const d = new Date(mes.getFullYear(), mes.getMonth(), i + 1);
          const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(i + 1).padStart(2, "0")}`;
          const doDia = (porDia.get(k) ?? []).filter((s) => s.situacao !== "cancelado");
          const tem = doDia.length > 0;
          const aceso = escolhido === k;
          // A cor do dia é a da loteria do sorteio (a primeira, se houver mais de um).
          const cor = tem ? LOTERIAS[doDia[0].loteria]?.cor : undefined;
          const rotulo = `${i + 1}${tem ? `: ${doDia.map((s) => `${LOTERIAS[s.loteria]?.nome ?? s.loteria}, concurso ${s.concurso}`).join("; ")}` : ""}`;
          return (
            <button
              key={k}
              type="button"
              disabled={!tem}
              aria-pressed={tem ? aceso : undefined}
              aria-label={rotulo}
              onClick={() => escolher(aceso ? null : k)}
              style={cor ? { backgroundColor: cor } : undefined}
              className={`tnum relative flex h-12 flex-col items-start justify-between overflow-hidden rounded-md p-1 text-left sm:h-24 sm:p-2 lg:h-28 ${
                tem ? "text-branco hover:opacity-90" : "border border-line text-muted"
              } ${aceso ? "outline outline-[3px] outline-offset-2 outline-ink" : ""} ${k === hoje && !tem ? "border-ink-2" : ""}`}
            >
              <span className={`text-base font-bold leading-none sm:text-xl ${k === hoje ? "underline underline-offset-4" : ""}`}>{i + 1}</span>
              {tem ? (
                <span className="flex w-full min-w-0 flex-col gap-0.5" aria-hidden>
                  {doDia.slice(0, 2).map((s) => (
                    // O nome da loteria vai num selo branco: lê-se bem sobre qualquer cor da Caixa.
                    <span
                      key={s.id}
                      className="hidden truncate rounded bg-white px-1 py-0.5 text-[11px] font-bold leading-tight text-ink sm:block"
                      style={{ boxShadow: `inset 3px 0 0 ${LOTERIAS[s.loteria]?.cor}` }}
                    >
                      {/* No tablet o dia é estreito: a sigla em cima e o concurso embaixo; do `lg` em diante, o nome e o concurso numa linha. */}
                      <span className="block truncate lg:hidden">{LOTERIAS[s.loteria]?.sigla}</span>
                      <span className="hidden lg:inline">{LOTERIAS[s.loteria]?.curto} </span>
                      <span className="block font-normal text-muted lg:inline">{s.concurso}</span>
                    </span>
                  ))}
                  {doDia.length > 2 ? <span className="hidden text-[11px] font-semibold sm:block">+{doDia.length - 2}</span> : null}
                  <span className="h-1.5 w-1.5 rounded-full bg-branco sm:hidden" />
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
      {/* Legenda: a cor sempre com o nome, nunca sozinha. */}
      <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-2" aria-label="Cores das loterias">
        {(Object.keys(LOTERIAS) as Loteria[]).map((l) => (
          <li key={l} className="flex items-center gap-1.5">
            <span aria-hidden className="h-3 w-3 rounded-sm" style={{ backgroundColor: LOTERIAS[l].cor }} />
            {LOTERIAS[l].nome}
          </li>
        ))}
      </ul>
    </div>
  );
}

function FormularioDoSorteio({
  inicial,
  aoSalvar,
  pendente,
  rotulo,
  travado,
}: {
  inicial?: SorteioNoCalendario;
  aoSalvar: (corpo: Record<string, unknown>) => void;
  pendente: boolean;
  rotulo: string;
  travado?: boolean;
}) {
  const [loteria, setLoteria] = useState<Loteria>(inicial?.loteria ?? "federal");
  const [concurso, setConcurso] = useState(inicial ? String(inicial.concurso) : "");
  const [quando, setQuando] = useState(inicial ? paraCampo(inicial.sorteioEm) : "");
  const [titulo, setTitulo] = useState(inicial?.titulo ?? "");
  const [link, setLink] = useState(inicial?.transmissaoUrl ?? "");
  return (
    <form
      className="space-y-3 p-4"
      onSubmit={(e) => {
        e.preventDefault();
        aoSalvar({
          ...(travado ? {} : { loteria, concurso: Number(concurso), sorteioEm: paraIso(quando) }),
          titulo,
          transmissaoUrl: link,
        });
      }}
    >
      {travado ? (
        <p className="text-xs text-muted">Há rifa publicada neste sorteio: loteria, concurso e data não mudam.</p>
      ) : (
        <>
          <Campo rotulo="Loteria">
            <select value={loteria} onChange={(e) => setLoteria(e.target.value as Loteria)}>
              {(Object.keys(LOTERIAS) as Loteria[]).map((l) => (
                <option key={l} value={l}>
                  {LOTERIAS[l].nome}
                </option>
              ))}
            </select>
          </Campo>
          {/* No computador o cadastro fica na coluna estreita (380 px): concurso e data um embaixo do outro. */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-1">
            <Campo rotulo="Concurso">
              <input inputMode="numeric" value={concurso} onChange={(e) => setConcurso(e.target.value.replace(/\D/g, "").slice(0, 5))} required />
            </Campo>
            <Campo rotulo="Data e hora do sorteio">
              <input type="datetime-local" value={quando} onChange={(e) => setQuando(e.target.value)} required />
            </Campo>
          </div>
        </>
      )}
      <Campo rotulo="Título (opcional)" dica="Sem título, a tela mostra a loteria e o concurso.">
        <input value={titulo} maxLength={80} onChange={(e) => setTitulo(e.target.value)} />
      </Campo>
      <Campo
        rotulo="Link da transmissão (opcional)"
        dica="Cole o link da live do sorteio (não o do canal). YouTube, Vimeo, Twitch ou Facebook tocam dentro da tela; outro link abre em nova aba."
      >
        <input type="url" inputMode="url" placeholder="https://www.youtube.com/live/…" value={link} onChange={(e) => setLink(e.target.value)} />
      </Campo>
      <LeituraDoLinkNaTela link={link} />
      <ComoCopiarOLink />
      <Button type="submit" disabled={pendente}>
        {pendente ? "Salvando…" : rotulo}
      </Button>
    </form>
  );
}

function NovoSorteio() {
  const qc = useQueryClient();
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null);
  const [chave, setChave] = useState(0);
  const criar = useMutation({
    mutationFn: (corpo: Record<string, unknown>) => apiRequest("POST", "/api/admin/sorteios-oficiais", corpo),
    onSuccess: () => {
      setMsg({ ok: true, texto: "Sorteio no calendário. As organizações já podem integrar as rifas." });
      setChave((k) => k + 1);
      qc.invalidateQueries({ queryKey: ["/api/admin/sorteios-oficiais"] });
    },
    onError: (e: Error) => setMsg({ ok: false, texto: e.message }),
  });
  return (
    <Card title="Novo sorteio oficial">
      <FormularioDoSorteio key={chave} aoSalvar={(c) => criar.mutate(c)} pendente={criar.isPending} rotulo="Pôr no calendário" />
      {msg ? (
        <p role="status" className={`px-4 pb-4 text-sm ${msg.ok ? "text-green-deep" : "text-red"}`}>
          {msg.texto}
        </p>
      ) : null}
    </Card>
  );
}

function CartaoDoSorteio({ s, plataforma }: { s: SorteioNoCalendario; plataforma: boolean }) {
  const qc = useQueryClient();
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null);
  const [editando, setEditando] = useState(false);
  const [lancando, setLancando] = useState(false);
  const [moderando, setModerando] = useState(false);
  const recarregar = () => {
    qc.invalidateQueries({ queryKey: ["/api/admin/sorteios-oficiais"] });
    qc.invalidateQueries({ queryKey: ["/api/admin/campaigns"] });
  };
  const erro = (e: Error) => setMsg({ ok: false, texto: e.message });
  const editar = useMutation({
    mutationFn: (corpo: Record<string, unknown>) => apiRequest("PATCH", `/api/admin/sorteios-oficiais/${s.id}`, corpo),
    onSuccess: () => {
      setEditando(false);
      setMsg({ ok: true, texto: "Sorteio atualizado." });
      recarregar();
    },
    onError: erro,
  });
  const cancelar = useMutation({
    mutationFn: () => apiRequest("POST", `/api/admin/sorteios-oficiais/${s.id}/cancelar`),
    onSuccess: () => {
      setMsg({ ok: true, texto: "Sorteio cancelado. As rifas em rascunho saíram dele e ficaram sem data." });
      recarregar();
    },
    onError: erro,
  });
  const passou = new Date(s.sorteioEm).getTime() <= Date.now();

  return (
    <Card
      title={s.nome}
      right={<Pill status={PILL_DA_SITUACAO[s.situacao]}>{ROTULO_DA_SITUACAO[s.situacao]}</Pill>}
    >
      <div className="space-y-3 p-4 text-sm">
        <p className="flex flex-wrap items-center gap-x-1.5 text-ink-2">
          <span aria-hidden className="h-3 w-3 shrink-0 rounded-sm" style={{ backgroundColor: LOTERIAS[s.loteria]?.cor }} />
          {s.loteriaNome} · concurso <span className="tnum">{s.concurso}</span> ·{" "}
          <span className="tnum">{dataHora(s.sorteioEm)}</span>
        </p>
        {s.resultado ? (
          <p>
            <span className="label-xs">Resultado oficial</span>
            <span className="tnum mt-1 flex flex-wrap gap-1.5">
              {s.resultado.map((n, i) => (
                <span key={i} className="rounded-md bg-mist px-2 py-0.5 font-bold">
                  {n}
                </span>
              ))}
            </span>
          </p>
        ) : null}
        {plataforma ? (
          <p className="flex flex-wrap items-center gap-x-3 text-xs text-muted">
            <span>
              <span className="tnum">{s.publicadas ?? 0}</span> rifa(s) publicada(s) neste sorteio.
            </span>
            {s.situacao !== "cancelado" ? (
              <button type="button" className="inline-flex min-h-6 items-center font-semibold text-marca hover:underline" onClick={() => setModerando(true)}>
                Comentários (<span className="tnum">{s.comentarios}</span>)
              </button>
            ) : null}
          </p>
        ) : null}
        {moderando ? <ComentariosDoSorteio s={s} onFechar={() => setModerando(false)} /> : null}

        {s.rifas.length ? (
          <div>
            <p className="label-xs">{plataforma ? "Rifas integradas" : "Suas rifas neste sorteio"}</p>
            <ul className="mt-1 divide-y divide-line rounded-md border border-line">
              {s.rifas.map((r) => (
                <RifaIntegrada key={r.id} r={r} plataforma={plataforma} aoMudar={recarregar} aoErro={erro} />
              ))}
            </ul>
          </div>
        ) : null}

        {!plataforma && s.situacao === "agendado" ? (
          <Integrar s={s} aoMudar={(t) => {
            setMsg({ ok: true, texto: t });
            recarregar();
          }} aoErro={erro} />
        ) : null}

        {plataforma && s.situacao === "agendado" ? (
          <div className="flex flex-wrap gap-2">
            <Button variant="ghost" onClick={() => setEditando((v) => !v)} aria-expanded={editando}>
              {editando ? "Fechar edição" : "Editar"}
            </Button>
            {passou ? (
              <Button onClick={() => setLancando((v) => !v)} aria-expanded={lancando}>
                Lançar resultado oficial
              </Button>
            ) : null}
            <Button
              variant="ghost"
              disabled={cancelar.isPending}
              onClick={() => {
                if (window.confirm("Cancelar este sorteio oficial? As rifas em rascunho saem dele.")) cancelar.mutate();
              }}
            >
              Cancelar sorteio
            </Button>
          </div>
        ) : null}
        {editando ? (
          <div className="rounded-md border border-line">
            <FormularioDoSorteio
              inicial={s}
              travado={(s.publicadas ?? 0) > 0}
              aoSalvar={(c) => editar.mutate(c)}
              pendente={editar.isPending}
              rotulo="Salvar"
            />
          </div>
        ) : null}
        {lancando ? (
          <LancarResultado
            s={s}
            aoLancar={(r) => {
              setLancando(false);
              const partes = ["Resultado oficial lançado."];
              if (r.sorteadas) partes.push(`${r.sorteadas} rifa(s) sorteada(s).`);
              if (r.esperando) partes.push(`${r.esperando} rifa(s) ainda não puderam sortear — o motivo aparece na rifa, e o sistema tenta de novo a cada 5 minutos.`);
              setMsg({ ok: true, texto: partes.join(" ") });
              recarregar();
            }}
          />
        ) : null}
        {msg ? (
          <p role="status" className={`text-sm ${msg.ok ? "text-green-deep" : "text-red"}`}>
            {msg.texto}
          </p>
        ) : null}
      </div>
    </Card>
  );
}

function RifaIntegrada({
  r,
  plataforma,
  aoMudar,
  aoErro,
}: {
  r: RifaNoSorteio;
  plataforma: boolean;
  aoMudar: () => void;
  aoErro: (e: Error) => void;
}) {
  const tirar = useMutation({
    mutationFn: () => apiRequest("PUT", `/api/admin/campaigns/${r.id}/sorteio-oficial`, { sorteioOficialId: null }),
    onSuccess: aoMudar,
    onError: aoErro,
  });
  return (
    <li className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
      <span className="min-w-0">
        <span className="block truncate font-semibold">{r.premio}</span>
        <span className="block truncate text-xs text-muted">
          {r.titulo}
          {r.organizacao ? ` · ${r.organizacao}` : ""}
        </span>
      </span>
      {r.esperando ? (
        <span className="order-last w-full text-xs text-yellow-deep" role="status">
          Ainda não sorteou: {r.esperando}
        </span>
      ) : null}
      <span className="flex items-center gap-2">
        <Pill status={r.status} />
        {r.status === "draft" && !plataforma ? (
          <Button variant="ghost" disabled={tirar.isPending} onClick={() => tirar.mutate()}>
            Tirar do sorteio
          </Button>
        ) : null}
      </span>
      {r.status === "published" && !plataforma && !r.esperando ? (
        <span className="order-last w-full text-xs text-muted">
          Publicada: para trocar de sorteio, peça o adiamento na edição da rifa (a plataforma analisa).
        </span>
      ) : null}
    </li>
  );
}

function Integrar({ s, aoMudar, aoErro }: { s: SorteioNoCalendario; aoMudar: (texto: string) => void; aoErro: (e: Error) => void }) {
  const { data: campanhas = [] } = useQuery<Campanha[]>({ queryKey: ["/api/admin/campaigns"] });
  const [rifa, setRifa] = useState("");
  // Só rascunho entra (a data trava ao publicar); a que já está neste sorteio não repete.
  const rascunhos = campanhas.filter((c) => c.campaign.status === "draft" && c.campaign.sorteioOficialId !== s.id);
  const integrar = useMutation({
    mutationFn: () => apiRequest("PUT", `/api/admin/campaigns/${rifa}/sorteio-oficial`, { sorteioOficialId: s.id }),
    onSuccess: () => {
      setRifa("");
      aoMudar("Rifa integrada: a data do sorteio dela agora é a deste concurso.");
    },
    onError: aoErro,
  });
  if (s.problemaParaIntegrar) return <p className="text-xs text-muted">{s.problemaParaIntegrar}</p>;
  if (!rascunhos.length) {
    return <p className="text-xs text-muted">Para integrar, crie a rifa: só rifa em rascunho escolhe o sorteio.</p>;
  }
  return (
    <form
      className="flex flex-wrap items-end gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (rifa) integrar.mutate();
      }}
    >
      <Campo rotulo="Integrar uma rifa em rascunho" className="min-w-0 flex-1">
        <select value={rifa} onChange={(e) => setRifa(e.target.value)} required>
          <option value="">Escolha a rifa…</option>
          {rascunhos.map((c) => (
            <option key={c.campaign.id} value={c.campaign.id}>
              {c.campaign.prizeTitle}
              {c.campaign.sorteioOficialId ? " (sai do sorteio atual)" : ""}
            </option>
          ))}
        </select>
      </Campo>
      <Button type="submit" disabled={!rifa || integrar.isPending}>
        Integrar
      </Button>
    </form>
  );
}

function LancarResultado({
  s,
  aoLancar,
}: {
  s: SorteioNoCalendario;
  aoLancar: (rifas: { sorteadas: number; esperando: number }) => void;
}) {
  const L = LOTERIAS[s.loteria];
  const [numeros, setNumeros] = useState<string[]>(() => Array.from({ length: L.quantos }, () => ""));
  const [erro, setErro] = useState<string | null>(null);
  const lancar = useMutation({
    mutationFn: async () =>
      (await (await apiRequest("POST", `/api/admin/sorteios-oficiais/${s.id}/resultado`, { numeros })).json()) as {
        rifas: { sorteadas: number; esperando: number };
      },
    onSuccess: (r) => aoLancar(r.rifas),
    onError: (e: Error) => setErro(e.message),
  });
  const largura = L.tipo === "bilhete" ? 5 : 2;
  return (
    <form
      className="space-y-2 rounded-md border border-line p-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (window.confirm("Conferiu os números com o resultado oficial da Caixa? O resultado não muda depois de lançado, e as rifas publicadas neste sorteio são sorteadas na hora.")) lancar.mutate();
      }}
    >
      <fieldset>
        <legend className="label-xs">{L.rotulo}</legend>
        <div className="mt-1 flex flex-wrap gap-1.5">
          {numeros.map((n, i) => (
            <input
              key={i}
              aria-label={`${L.tipo === "bilhete" ? "Prêmio" : "Dezena"} ${i + 1}`}
              inputMode="numeric"
              value={n}
              onChange={(e) => {
                const v = e.target.value.replace(/\D/g, "").slice(0, largura);
                setNumeros((a) => a.map((x, j) => (j === i ? v : x)));
              }}
              className={`campo tnum text-center ${L.tipo === "bilhete" ? "w-24" : "w-14"}`}
            />
          ))}
        </div>
      </fieldset>
      {erro ? (
        <p role="alert" className="text-xs text-red">
          {erro}
        </p>
      ) : null}
      <Button type="submit" disabled={lancar.isPending}>
        {lancar.isPending ? "Lançando…" : "Lançar resultado"}
      </Button>
    </form>
  );
}

/**
 * Os comentários da tela do sorteio, para a plataforma moderar: a mesma
 * lista do apostador, com "Apagar" em todos (a sessão de plataforma).
 */
function ComentariosDoSorteio({ s, onFechar }: { s: SorteioNoCalendario; onFechar: () => void }) {
  return (
    <Janela onFechar={onFechar} rotulo={`Comentários de ${s.nome}`} centralizarEm="lg" largura="max-w-lg" rolar={false} className="flex max-h-[85vh] flex-col">
      <div className="border-b border-line px-4 py-3">
        <h2 className="font-semibold">Comentários · {s.nome}</h2>
        <p className="text-xs text-muted">Quem escreveu e a plataforma apagam. O texto passa pela mesma régua dos comentários da rifa.</p>
      </div>
      <div className="overflow-y-auto px-4 pb-4">
        <Comentarios sorteioOficialId={s.id} dentroDoPainel soModerar />
      </div>
    </Janela>
  );
}

/**
 * Antes de salvar, o painel diz se o link colado vai tocar dentro da tela do
 * sorteio ou só abrir em outra aba (a mesma regra da tela, `leituraDoLink()`).
 * O estado vai em texto, nunca só na cor.
 */
function LeituraDoLinkNaTela({ link }: { link: string }) {
  const leitura = leituraDoLink(link);
  const cor =
    leitura.situacao === "toca"
      ? "bg-green-soft text-green-deep"
      : leitura.situacao === "invalido"
        ? "bg-red-soft text-red"
        : "bg-yellow-soft text-yellow-deep";
  return (
    <p aria-live="polite" className={leitura.situacao === "vazio" ? "sr-only" : `rounded-md px-3 py-2 text-xs ${cor}`}>
      {leitura.situacao === "toca" ? "✓ " : leitura.situacao === "vazio" ? "" : "! "}
      {leitura.texto}
    </p>
  );
}

/** O passo a passo de qual link copiar, para quem cadastra o sorteio. */
function ComoCopiarOLink() {
  return (
    <details className="rounded-md border border-line px-3 py-2 text-xs">
      <summary className="cursor-pointer font-semibold">Qual link copiar?</summary>
      <ol className="mt-2 list-decimal space-y-1 pl-4 text-muted">
        <li>
          No YouTube, abra a <strong className="text-ink">live do sorteio</strong> — das loterias da Caixa, no canal oficial <strong className="text-ink">@caixa</strong>. Cada sorteio é uma live nova, com link novo.
        </li>
        <li>
          Toque em <strong className="text-ink">Compartilhar</strong> e depois em <strong className="text-ink">Copiar link</strong>.
        </li>
        <li>Cole no campo acima: o aviso logo abaixo dele diz se o vídeo vai tocar dentro da tela.</li>
      </ol>
      <p className="mt-2 text-muted">
        Certo: <span className="tnum break-all text-ink">https://www.youtube.com/live/S-4jed6TgNY</span>
        <br />
        Não serve: o link do canal (<span className="tnum break-all">youtube.com/@caixa</span>) — ele só abre o YouTube.
      </p>
      <p className="mt-2 text-muted">
        O vídeo começa sem som; quem assiste toca no player para ouvir. Dá para trocar o link até o resultado. Para não colar
        link a cada sorteio, cadastre uma vez o canal da loteria no cartão "Canal oficial de cada loteria".
      </p>
    </details>
  );
}

/**
 * O canal oficial do YouTube de cada loteria, cadastrado uma vez: sem link
 * colado no sorteio, a tela toca a live que o canal estiver transmitindo, a
 * partir de 30 min antes da hora. Só a plataforma (403 para organizador).
 */
function CanaisDasLoterias() {
  const qc = useQueryClient();
  const { data } = useQuery<{ canais: Partial<Record<Loteria, string>> }>({ queryKey: ["/api/admin/sorteios-oficiais/canais"] });
  const [canais, setCanais] = useState<Partial<Record<Loteria, string>>>({});
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null);
  useEffect(() => {
    if (data) setCanais(data.canais);
  }, [data]);
  const salvar = useMutation({
    mutationFn: () => apiRequest("PUT", "/api/admin/sorteios-oficiais/canais", { canais }),
    onSuccess: () => {
      setMsg({ ok: true, texto: "Canais salvos. Sem link no sorteio, a tela toca a live do canal da loteria." });
      qc.invalidateQueries({ queryKey: ["/api/admin/sorteios-oficiais/canais"] });
    },
    onError: (e: Error) => setMsg({ ok: false, texto: e.message }),
  });
  const minutos = Math.round(ANTECEDENCIA_DA_TRANSMISSAO_MS / 60_000);
  return (
    <Card title="Canal oficial de cada loteria">
      <form
        className="space-y-3 p-4"
        onSubmit={(e) => {
          e.preventDefault();
          setMsg(null);
          salvar.mutate();
        }}
      >
        <p className="text-xs text-muted">
          Cadastre uma vez o canal do YouTube que transmite cada loteria. Sem link colado no sorteio, a tela do sorteio toca a
          live que o canal estiver transmitindo, a partir de <span className="tnum">{minutos}</span> minutos antes da hora. O link
          colado no sorteio vale primeiro.
        </p>
        {(Object.keys(LOTERIAS) as Loteria[]).map((l) => (
          <Campo key={l} rotulo={`Canal da ${LOTERIAS[l].nome} (opcional)`}>
            <input
              value={canais[l] ?? ""}
              placeholder="UC… ou https://www.youtube.com/channel/UC…"
              onChange={(e) => {
                setMsg(null);
                setCanais((c) => ({ ...c, [l]: e.target.value }));
              }}
              autoComplete="off"
              spellCheck={false}
            />
          </Campo>
        ))}
        <details className="rounded-md border border-line px-3 py-2 text-xs">
          <summary className="cursor-pointer font-semibold">Onde achar o id do canal?</summary>
          <ol className="mt-2 list-decimal space-y-1 pl-4 text-muted">
            <li>
              No YouTube, abra o canal (o da Caixa é <strong className="text-ink">@caixa</strong>).
            </li>
            <li>
              Toque em <strong className="text-ink">Mais sobre este canal</strong> → <strong className="text-ink">Compartilhar canal</strong> →{" "}
              <strong className="text-ink">Copiar ID do canal</strong>.
            </li>
            <li>
              Cole aqui: começa com <span className="tnum text-ink">UC</span> e tem <span className="tnum">24</span> caracteres. O endereço com @ não serve.
            </li>
          </ol>
        </details>
        <Button type="submit" disabled={salvar.isPending}>
          {salvar.isPending ? "Salvando…" : "Salvar canais"}
        </Button>
        {msg ? (
          <p role="status" className={`text-sm ${msg.ok ? "text-green-deep" : "text-red"}`}>
            {msg.texto}
          </p>
        ) : null}
      </form>
    </Card>
  );
}
