import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { formatBRL } from "@shared/format";
import {
  AJUSTE_IA_MAX_CREDITOS,
  MOTIVO_AJUSTE_MAX,
  PERIODOS_DO_RELATORIO_IA,
  validarAjusteIA,
  type LancamentoIAPublico,
  type LinhaDoRelatorioIA,
  type RelatorioIA,
} from "@shared/iaCobranca";
import { Button, Card } from "@/components/bits";
import { TabelaOuCartoes } from "@/components/painel";
import { apiRequest } from "@/lib/queryClient";

const dia = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("pt-BR") : "—");
const quando = (iso: string) =>
  new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

const NOME_DO_MOTIVO: Record<string, string> = {
  assinatura: "Assinatura",
  avulso: "Pacote avulso",
  uso: "Mensagem",
  vencimento: "Franquia vencida",
  estorno: "Pix estornado",
  ajuste: "Ajuste da plataforma",
};

/** Uma nova identificação por ajuste: dois cliques no mesmo envio lançam uma vez só. */
function novaChave(): string {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  // Fora de contexto seguro não há randomUUID: o mesmo formato (versão 4) com getRandomValues.
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

type Alvo = { titularTipo: "organizacao" | "afiliado"; titular: string; nome: string };

/**
 * Uso e receita do assistente, por quem paga (organização ou afiliado), e o
 * ajuste de crédito pela plataforma. Só nome público da organização ou código
 * do afiliado — nunca dado de pessoa. Só a plataforma vê (a rota é 403 para o
 * organizador).
 */
export function UsoDoAssistenteCard() {
  const [dias, setDias] = useState<number>(30);
  const { data, error, isLoading } = useQuery<RelatorioIA>({ queryKey: [`/api/admin/ia/relatorio?dias=${dias}`] });
  const [alvo, setAlvo] = useState<Alvo | null>(null);
  const [extrato, setExtrato] = useState<Alvo | null>(null);
  const t = data?.totais;

  return (
    <div className="mb-3">
      <Card title="Uso e receita do assistente">
        <div className="space-y-4 p-4 text-sm">
          <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Período">
            {PERIODOS_DO_RELATORIO_IA.map((d) => (
              <button
                key={d}
                type="button"
                aria-pressed={dias === d}
                onClick={() => setDias(d)}
                className={`rounded-full border px-3 py-1 text-xs font-semibold ${dias === d ? "border-green bg-green text-on-green" : "border-line text-ink-2 hover:bg-mist"}`}
              >
                <span className="tnum">{d}</span> dias
              </button>
            ))}
          </div>
          {isLoading ? <p className="text-muted">Carregando…</p> : null}
          {error ? <p className="text-red">{(error as Error).message}</p> : null}
          {t ? (
            <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <Numero rotulo="Receita (Pix pagos)" valor={formatBRL(t.receitaCents)} dica={<><span className="tnum">{t.pixPagos}</span> Pix · <span className="tnum">{formatBRL(t.estornadosCents)}</span> pagos e depois estornados</>} tom="text-green-deep" />
              <Numero rotulo="Mensagens" valor={t.mensagens.toLocaleString("pt-BR")} dica={t.semMedida ? <><span className="tnum">{t.semMedida}</span> sem medida do Chatbase</> : "todas medidas"} />
              <Numero rotulo="Créditos consumidos" valor={t.creditosUsados.toLocaleString("pt-BR")} dica={<><span className="tnum">{t.creditosDaPlataforma.toLocaleString("pt-BR")}</span> do master (custo)</>} />
              <Numero rotulo="Assinaturas ativas" valor={t.contasAtivas.toLocaleString("pt-BR")} dica="hoje" />
            </dl>
          ) : null}

          {data && data.linhas.length === 0 ? <p className="text-muted">Nenhuma conta usou ou pagou o assistente ainda.</p> : null}
          {data && data.linhas.length > 0 ? (
            <div className="-mx-4 border-t border-line">
              <TabelaOuCartoes<LinhaDoRelatorioIA>
                aria="Uso e receita por conta"
                itens={data.linhas}
                chave={(l) => `${l.titularTipo}:${l.titular}`}
                colunas={[
                  { titulo: "Conta", celula: (l) => <Conta l={l} /> },
                  { titulo: "Mensagens", celula: (l) => <span className="tnum">{l.mensagens}</span>, direita: true },
                  { titulo: "Créditos usados", celula: (l) => <span className="tnum">{l.creditosUsados}</span>, direita: true },
                  { titulo: "Receita", celula: (l) => <span className="tnum text-green-deep">{formatBRL(l.receitaCents)}</span>, direita: true },
                  { titulo: "Saldo", celula: (l) => <Saldo l={l} />, direita: true },
                  { titulo: "Ações", celula: (l) => <Acoes l={l} onAjustar={setAlvo} onExtrato={setExtrato} /> },
                ]}
                cartao={(l) => (
                  <div className="space-y-1">
                    <Conta l={l} />
                    <p className="text-xs text-muted">
                      <span className="tnum">{l.mensagens}</span> mensagem(ns) · <span className="tnum">{l.creditosUsados}</span> crédito(s) usados ·{" "}
                      <span className="tnum text-green-deep">{formatBRL(l.receitaCents)}</span>
                    </p>
                    <Saldo l={l} />
                    <Acoes l={l} onAjustar={setAlvo} onExtrato={setExtrato} />
                  </div>
                )}
              />
            </div>
          ) : null}

          {data?.cortada ? (
            <p className="text-xs text-muted">
              Mostrando as <span className="tnum">200</span> contas com mais receita e uso; os totais acima contam todas.
            </p>
          ) : null}
          {extrato ? <Extrato alvo={extrato} onFechar={() => setExtrato(null)} /> : null}
          <AjusteDeCredito key={alvo ? `${alvo.titularTipo}:${alvo.titular}` : "livre"} alvo={alvo} onLimpar={() => setAlvo(null)} />
        </div>
      </Card>
    </div>
  );
}

function Numero({ rotulo, valor, dica, tom = "text-ink" }: { rotulo: string; valor: string; dica: React.ReactNode; tom?: string }) {
  return (
    <div className="min-w-0 rounded-lg border border-line p-3">
      <dt className="text-xs text-muted">{rotulo}</dt>
      <dd className={`tnum truncate text-lg font-semibold ${tom}`}>{valor}</dd>
      <dd className="text-xs text-muted">{dica}</dd>
    </div>
  );
}

function Conta({ l }: { l: LinhaDoRelatorioIA }) {
  return (
    <p className="min-w-0">
      <span className="font-semibold">{l.nome}</span>{" "}
      <span className="text-xs text-muted">{l.titularTipo === "organizacao" ? `organização · ${l.titular}` : "afiliado"}</span>
    </p>
  );
}

function Saldo({ l }: { l: LinhaDoRelatorioIA }) {
  return (
    <p className="text-xs">
      {l.ativa ? (
        <>
          <span className="tnum font-semibold">{l.franquiaCreditos + l.avulsoCreditos}</span> crédito(s), até{" "}
          <span className="tnum">{dia(l.cicloAte)}</span>
        </>
      ) : (
        <span className="text-muted">
          Sem assinatura{l.avulsoCreditos !== 0 ? <> · <span className="tnum">{l.avulsoCreditos}</span> avulso(s)</> : null}
        </span>
      )}
    </p>
  );
}

function Acoes({ l, onAjustar, onExtrato }: { l: LinhaDoRelatorioIA; onAjustar: (a: Alvo) => void; onExtrato: (a: Alvo) => void }) {
  const a: Alvo = { titularTipo: l.titularTipo, titular: l.titular, nome: l.nome };
  return (
    <div className="flex gap-2">
      <button type="button" onClick={() => onExtrato(a)} className="rounded-md px-2 py-1 text-xs font-semibold text-green-deep hover:bg-mist">
        Extrato<span className="sr-only"> de {l.nome}</span>
      </button>
      <button type="button" onClick={() => onAjustar(a)} className="rounded-md px-2 py-1 text-xs font-semibold text-green-deep hover:bg-mist">
        Ajustar<span className="sr-only"> créditos de {l.nome}</span>
      </button>
    </div>
  );
}

function Extrato({ alvo, onFechar }: { alvo: Alvo; onFechar: () => void }) {
  const url = `/api/admin/ia/lancamentos?tipo=${alvo.titularTipo}&titular=${encodeURIComponent(alvo.titular)}`;
  const { data, error } = useQuery<{ nome: string; lancamentos: LancamentoIAPublico[] }>({ queryKey: [url] });
  return (
    <section aria-label={`Extrato de ${alvo.nome}`} className="space-y-2 rounded-lg border border-line p-3">
      <div className="flex items-center gap-2">
        <h3 className="flex-1 font-semibold">Extrato de {alvo.nome}</h3>
        <button type="button" onClick={onFechar} className="rounded-md px-2 py-1 text-xs font-semibold text-ink-2 hover:bg-mist">
          Fechar
        </button>
      </div>
      {error ? <p className="text-red">{(error as Error).message}</p> : null}
      {data && data.lancamentos.length === 0 ? <p className="text-muted">Nenhum lançamento.</p> : null}
      <ul className="divide-y divide-line text-xs">
        {data?.lancamentos.map((l, i) => {
          const total = l.franquiaCreditos + l.avulsoCreditos;
          return (
            <li key={i} className="flex flex-wrap items-baseline gap-x-3 py-1.5">
              <span className="tnum text-muted">{quando(l.criadoEm)}</span>
              <span className="font-semibold">{NOME_DO_MOTIVO[l.motivo] ?? l.motivo}</span>
              <span className={`tnum ${total >= 0 ? "text-green-deep" : "text-ink"}`}>
                {total >= 0 ? "+" : "−"}
                {Math.abs(total)} crédito(s)
              </span>
              {l.descricao ? <span className="min-w-0 basis-full break-words text-muted">{l.descricao}</span> : null}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function AjusteDeCredito({ alvo, onLimpar }: { alvo: Alvo | null; onLimpar: () => void }) {
  const qc = useQueryClient();
  const [titularTipo, setTitularTipo] = useState<"organizacao" | "afiliado">(alvo?.titularTipo ?? "organizacao");
  const [titular, setTitular] = useState(alvo?.titular ?? "");
  const [creditos, setCreditos] = useState("");
  const [motivo, setMotivo] = useState("");
  // A identificação do ajuste nasce com o formulário e só muda depois de um envio que entrou.
  const [chave, setChave] = useState(novaChave);
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null);
  // Mudou um campo, é outro ajuste: identificação nova. Reenviar sem mudar nada (a rede caiu) repete a mesma.
  const mudou = (f: () => void) => {
    f();
    setChave(novaChave());
  };
  const enviar = useMutation({
    mutationFn: async () => {
      const corpo = { titularTipo, titular, creditos: Number(creditos), motivo, idempotencia: chave };
      const v = validarAjusteIA(corpo);
      if (!v.ok) throw new Error(v.erro);
      return (await (await apiRequest("POST", "/api/admin/ia/ajustes", corpo)).json()) as {
        repetido: boolean;
        conta: { franquiaCreditos: number; avulsoCreditos: number };
      };
    },
    onMutate: () => setMsg(null),
    onSuccess: (r) => {
      setMsg({
        ok: true,
        texto: r.repetido
          ? "Este ajuste já tinha sido lançado."
          : `Lançado. Agora: ${r.conta.franquiaCreditos} da franquia e ${r.conta.avulsoCreditos} avulso(s).`,
      });
      setCreditos("");
      setMotivo("");
      setChave(novaChave());
      qc.invalidateQueries({ predicate: (q) => String(q.queryKey[0]).startsWith("/api/admin/ia/") });
    },
    onError: (e: Error) => setMsg({ ok: false, texto: e.message }),
  });
  return (
    <form
      className="space-y-3 rounded-lg border border-line p-3"
      aria-labelledby="titulo-ajuste-ia"
      onSubmit={(e) => {
        e.preventDefault();
        if (!enviar.isPending) enviar.mutate();
      }}
    >
      <div className="flex items-center gap-2">
        <h3 id="titulo-ajuste-ia" className="flex-1 font-semibold">
          Ajustar créditos{alvo ? <> de {alvo.nome}</> : null}
        </h3>
        {alvo ? (
          <button type="button" onClick={onLimpar} className="rounded-md px-2 py-1 text-xs font-semibold text-ink-2 hover:bg-mist">
            Outra conta
          </button>
        ) : null}
      </div>
      <p className="text-xs text-muted">
        Cortesia (para mais) ou correção (para menos). Entra nos créditos avulsos, que não vencem e valem com a assinatura
        ativa; a correção não tira mais do que a conta tem. O motivo fica no extrato e na auditoria.
      </p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor="ajuste-tipo" className="label-xs">Conta de</label>
          <select id="ajuste-tipo" className="campo" value={titularTipo} disabled={!!alvo} onChange={(e) => mudou(() => setTitularTipo(e.target.value as "organizacao" | "afiliado"))}>
            <option value="organizacao">Organização</option>
            <option value="afiliado">Afiliado</option>
          </select>
        </div>
        <div>
          <label htmlFor="ajuste-titular" className="label-xs">{titularTipo === "organizacao" ? "Endereço da organização" : "Código do afiliado"}</label>
          <input id="ajuste-titular" className="campo" autoComplete="off" spellCheck={false} value={titular} disabled={!!alvo} onChange={(e) => mudou(() => setTitular(e.target.value))} />
        </div>
        <div>
          <label htmlFor="ajuste-creditos" className="label-xs">Créditos (use − para tirar)</label>
          <input
            id="ajuste-creditos"
            className="campo tnum"
            inputMode="numeric"
            value={creditos}
            onChange={(e) => mudou(() => setCreditos(e.target.value.replace(/[^\d-]/g, "")))}
            aria-describedby="ajuste-creditos-dica"
          />
          <p id="ajuste-creditos-dica" className="mt-1 text-xs text-muted">
            Até <span className="tnum">{AJUSTE_IA_MAX_CREDITOS.toLocaleString("pt-BR")}</span> por vez.
          </p>
        </div>
        <div>
          <label htmlFor="ajuste-motivo" className="label-xs">Motivo</label>
          <input id="ajuste-motivo" className="campo" maxLength={MOTIVO_AJUSTE_MAX} value={motivo} onChange={(e) => mudou(() => setMotivo(e.target.value))} />
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={enviar.isPending || !titular.trim() || !creditos || !motivo.trim()}>
          {enviar.isPending ? "Lançando…" : "Lançar ajuste"}
        </Button>
        {msg ? (
          <p role="status" className={`text-xs ${msg.ok ? "text-green-deep" : "text-red"}`}>
            {msg.texto}
          </p>
        ) : null}
      </div>
    </form>
  );
}
