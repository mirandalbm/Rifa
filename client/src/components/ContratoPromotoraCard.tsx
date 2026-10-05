import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, Pill } from "@/components/bits";
import { apiRequest } from "@/lib/queryClient";
import { CONTRATO_MAX, CONTRATO_MIN } from "@shared/contratoPromotora";

type DaOrganizacao = {
  contrato: { versao: number; texto: string; publicadoEm: string } | null;
  ultimoAceite: { versao: number; aceitoEm: string; aceitoPor: string | null } | null;
  pendente: boolean;
};
type DaPlataforma = {
  contrato: { versao: number; texto: string; publicadoEm: string } | null;
  versoes: { versao: number; publicadoEm: string; aceites: number }[];
  organizacoesAtivas: number;
};

const CHAVE = ["/api/admin/contrato-promotora"];
const data = (iso: string) => new Date(iso).toLocaleDateString("pt-BR");

/**
 * Contrato da plataforma com a promotora. A organização lê e aceita a versão
 * em vigor — sem o aceite, não publica rifa. A plataforma cola o texto do
 * advogado e publica versões.
 */
export function ContratoPromotoraCard({ plataforma }: { plataforma: boolean }) {
  // A âncora `#contrato` (o aviso de publicação aponta para cá) abre esta aba e rola até o cartão.
  return <div id="contrato" className="scroll-mt-20">{plataforma ? <DaPlataformaCard /> : <DaOrganizacaoCard />}</div>;
}

function TextoDoContrato({ texto, id }: { texto: string; id: string }) {
  return (
    <pre
      id={id}
      tabIndex={0}
      className="max-h-72 overflow-y-auto whitespace-pre-wrap rounded bg-mist p-3 font-sans text-xs text-ink-2"
    >
      {texto}
    </pre>
  );
}

function DaOrganizacaoCard() {
  const qc = useQueryClient();
  const { data: d } = useQuery<DaOrganizacao>({ queryKey: CHAVE });
  const [li, setLi] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null);
  const aceitar = useMutation({
    mutationFn: () => apiRequest("POST", "/api/admin/contrato-promotora/aceite", { versao: d?.contrato?.versao }),
    onSuccess: () => {
      setMsg({ ok: true, texto: "Contrato aceito. As rifas já podem ser publicadas." });
      setLi(false);
      qc.invalidateQueries({ queryKey: CHAVE });
    },
    onError: (e: Error) => {
      setMsg({ ok: false, texto: e.message });
      qc.invalidateQueries({ queryKey: CHAVE });
    },
  });
  const c = d?.contrato ?? null;

  return (
    <Card
      title="Contrato da plataforma"
      right={
        !c ? null : d?.pendente ? (
          <Pill status="pending">falta aceitar</Pill>
        ) : (
          <Pill status="closed">aceito</Pill>
        )
      }
    >
      <div className="space-y-3 p-4 text-sm">
        {!c ? (
          <p className="text-muted">A plataforma ainda não publicou o contrato com as organizações.</p>
        ) : (
          <>
            <p className="text-muted">
              É o contrato entre a sua organização e a plataforma.{" "}
              {d?.pendente
                ? "Sem o aceite da versão em vigor, nenhuma rifa sua é publicada."
                : "Uma versão nova pede um novo aceite."}
            </p>
            <p className="tnum text-xs text-muted">
              Versão {c.versao} · publicada em {data(c.publicadoEm)}
              {d?.ultimoAceite && !d.pendente
                ? ` · aceita em ${data(d.ultimoAceite.aceitoEm)}${d.ultimoAceite.aceitoPor ? ` por ${d.ultimoAceite.aceitoPor}` : ""}`
                : ""}
            </p>
            <TextoDoContrato texto={c.texto} id="contrato-texto" />
            {d?.pendente ? (
              <>
                <label className="flex items-start gap-2">
                  <input
                    type="checkbox"
                    checked={li}
                    onChange={(e) => {
                      setMsg(null);
                      setLi(e.target.checked);
                    }}
                    className="mt-1 h-5 w-5"
                    aria-describedby="contrato-texto"
                  />
                  <span>
                    Li o contrato (versão <span className="tnum">{c.versao}</span>) e aceito em nome da organização.
                  </span>
                </label>
                <button
                  type="button"
                  disabled={!li || aceitar.isPending}
                  onClick={() => aceitar.mutate()}
                  className="rounded-md bg-green px-4 py-2 font-semibold text-on-green disabled:opacity-50"
                >
                  {aceitar.isPending ? "Aceitando…" : "Aceitar o contrato"}
                </button>
              </>
            ) : null}
          </>
        )}
        {msg ? (
          <p role="status" className={`rounded-md px-3 py-2 ${msg.ok ? "bg-green-soft text-green-deep" : "bg-red-soft text-red"}`}>
            {msg.texto}
          </p>
        ) : null}
      </div>
    </Card>
  );
}

function DaPlataformaCard() {
  const qc = useQueryClient();
  const { data: d } = useQuery<DaPlataforma>({ queryKey: CHAVE });
  const [texto, setTexto] = useState("");
  const [ver, setVer] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null);
  const publicar = useMutation({
    mutationFn: () => apiRequest("POST", "/api/admin/contrato-promotora", { texto }),
    onSuccess: () => {
      setMsg({ ok: true, texto: "Versão publicada. Cada organização precisa aceitá-la antes da próxima rifa." });
      setTexto("");
      qc.invalidateQueries({ queryKey: CHAVE });
    },
    onError: (e: Error) => setMsg({ ok: false, texto: e.message }),
  });
  const c = d?.contrato ?? null;
  const tamanho = texto.trim().length;
  const atual = d?.versoes[0];

  return (
    <Card
      title="Contrato com as organizações"
      right={c ? <span className="tnum text-xs text-muted">versão {c.versao}</span> : <Pill status="pending">sem contrato</Pill>}
    >
      <div className="space-y-3 p-4 text-sm">
        <p className="text-muted">
          Cole o texto do advogado. Cada publicação é uma versão nova: as organizações precisam aceitá-la antes de
          publicar a próxima rifa. As rifas que já estão no ar seguem como estão.
        </p>
        {atual ? (
          <p className="tnum text-xs text-muted">
            Versão {atual.versao}: aceita por {atual.aceites} de {d?.organizacoesAtivas ?? 0} organizações ativas.
          </p>
        ) : null}
        {c ? (
          <button type="button" onClick={() => setVer(!ver)} className="block text-xs text-ink-2 underline">
            {ver ? "Esconder" : "Ver"} o texto em vigor
          </button>
        ) : null}
        {ver && c ? <TextoDoContrato texto={c.texto} id="contrato-em-vigor" /> : null}
        <div>
          <label htmlFor="contrato-novo" className="label-xs">
            {c ? "Texto da versão seguinte" : "Texto do contrato"}
          </label>
          <textarea
            id="contrato-novo"
            rows={8}
            maxLength={CONTRATO_MAX}
            value={texto}
            onChange={(e) => {
              setMsg(null);
              setTexto(e.target.value);
            }}
            className="campo"
            aria-describedby="contrato-novo-dica"
          />
          <p id="contrato-novo-dica" className="tnum mt-1 text-[11px] text-muted">
            {tamanho} caracteres · mínimo {CONTRATO_MIN}
          </p>
        </div>
        <button
          type="button"
          disabled={tamanho < CONTRATO_MIN || publicar.isPending}
          onClick={() => {
            if (window.confirm("Publicar esta versão? Todas as organizações vão precisar aceitá-la antes da próxima rifa.")) {
              publicar.mutate();
            }
          }}
          className="rounded-md bg-green px-4 py-2 font-semibold text-on-green disabled:opacity-50"
        >
          {publicar.isPending ? "Publicando…" : c ? `Publicar a versão ${c.versao + 1}` : "Publicar a versão 1"}
        </button>
        {d && d.versoes.length > 1 ? (
          <ul className="divide-y divide-line rounded border border-line">
            {d.versoes.map((v) => (
              <li key={v.versao} className="tnum flex justify-between gap-3 px-3 py-2 text-xs">
                <span>Versão {v.versao} · {data(v.publicadoEm)}</span>
                <span className="text-muted">{v.aceites} aceites</span>
              </li>
            ))}
          </ul>
        ) : null}
        {msg ? (
          <p role="status" className={`rounded-md px-3 py-2 ${msg.ok ? "bg-green-soft text-green-deep" : "bg-red-soft text-red"}`}>
            {msg.texto}
          </p>
        ) : null}
      </div>
    </Card>
  );
}
