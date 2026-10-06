import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, Pill } from "@/components/bits";
import { apiRequest } from "@/lib/queryClient";
import { CAMPOS_DO_CONTRATO, CONTRATO_MAX, CONTRATO_MIN, NOMES_DOS_CAMPOS } from "@shared/contratoPromotora";

type DaOrganizacao = {
  contrato: { versao: number; texto: string; publicadoEm: string; hash: string } | null;
  ultimoAceite: { versao: number; aceitoEm: string; aceitoPor: string | null; hash: string } | null;
  pendente: boolean;
};
type DaPlataforma = {
  contrato: { versao: number; texto: string; modelo: string | null; publicadoEm: string; hash: string; desatualizado: boolean } | null;
  versoes: { versao: number; publicadoEm: string; aceites: number; hash: string }[];
  organizacoesAtivas: number;
};
type Previa = { texto: string; problema: string | null; hash: string };

const CHAVE = ["/api/admin/contrato-promotora"];
const data = (iso: string) => new Date(iso).toLocaleDateString("pt-BR");

/**
 * A impressão (SHA-256) do texto: o que prova qual versão foi lida e aceita.
 * Vai inteira, em fonte de largura fixa, quebrando onde precisar.
 */
function Impressao({ rotulo, hash }: { rotulo: string; hash: string }) {
  return (
    <p className="text-[11px] text-muted">
      {rotulo}: <code className="tnum break-all">{hash}</code>
    </p>
  );
}

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
            <Impressao
              rotulo={d?.ultimoAceite && !d.pendente ? "Impressão (SHA-256) do texto aceito" : "Impressão (SHA-256) desta versão"}
              hash={d?.ultimoAceite && !d.pendente ? d.ultimoAceite.hash : c.hash}
            />
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
  const [previa, setPrevia] = useState<Previa | null>(null);
  const campo = useRef<HTMLTextAreaElement>(null);
  const mudou = (t: string) => {
    setMsg(null);
    setPrevia(null);
    setTexto(t);
  };
  // O campo entra onde está o cursor (ou no fim), e o foco volta ao texto.
  const inserir = (nome: string) => {
    const el = campo.current;
    const marcador = `{{${nome}}}`;
    const ini = el?.selectionStart ?? texto.length;
    const fim = el?.selectionEnd ?? texto.length;
    mudou(texto.slice(0, ini) + marcador + texto.slice(fim));
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(ini + marcador.length, ini + marcador.length);
    });
  };
  const verPrevia = useMutation({
    mutationFn: async (t: string) => (await apiRequest("POST", "/api/admin/contrato-promotora/previa", { texto: t })).json() as Promise<Previa>,
    onSuccess: (p) => setPrevia(p),
    onError: (e: Error) => setMsg({ ok: false, texto: e.message }),
  });
  const publicar = useMutation({
    mutationFn: (t: string) => apiRequest("POST", "/api/admin/contrato-promotora", { texto: t }),
    onSuccess: () => {
      setMsg({ ok: true, texto: "Versão publicada. Cada organização precisa aceitá-la antes da próxima rifa." });
      setTexto("");
      setPrevia(null);
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
        <p className="text-xs text-muted">
          Os dados da plataforma não se digitam no texto: use os campos abaixo (os colchetes do advogado, como
          [RAZÃO SOCIAL DA PLATAFORMA], também são reconhecidos). Na publicação, eles são preenchidos com os Dados da
          empresa publicados em Aparência → Rodapé e empresa.
        </p>
        {c?.desatualizado ? (
          <div role="status" className="space-y-2 rounded-md bg-yellow-soft px-3 py-2 text-xs text-yellow-deep">
            <p>
              Os Dados da empresa mudaram depois da versão {c.versao}: o texto em vigor ainda mostra os dados antigos. Publique a
              versão seguinte — o aceite vale para o texto que cada organização leu.
            </p>
            {c.modelo ? (
              <button
                type="button"
                disabled={publicar.isPending}
                onClick={() => {
                  if (window.confirm(`Publicar a versão ${c.versao + 1} com os dados atuais? Todas as organizações vão precisar aceitá-la.`)) {
                    publicar.mutate(c.modelo!);
                  }
                }}
                className="rounded-md border border-current px-3 py-1 font-semibold"
              >
                Publicar a versão {c.versao + 1} com os dados atuais
              </button>
            ) : null}
          </div>
        ) : null}
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
        {c ? <Impressao rotulo="Impressão (SHA-256) da versão em vigor" hash={c.hash} /> : null}
        <div>
          <label htmlFor="contrato-novo" className="label-xs">
            {c ? "Texto da versão seguinte" : "Texto do contrato"}
          </label>
          <div className="mb-2 flex flex-wrap gap-2" role="group" aria-label="Inserir campo da empresa no texto">
            {NOMES_DOS_CAMPOS.map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => inserir(n)}
                className="rounded-full border border-line px-3 py-1 text-xs hover:bg-mist"
              >
                + {CAMPOS_DO_CONTRATO[n].rotulo}
              </button>
            ))}
          </div>
          <textarea
            id="contrato-novo"
            ref={campo}
            rows={8}
            maxLength={CONTRATO_MAX}
            value={texto}
            onChange={(e) => mudou(e.target.value)}
            className="campo"
            aria-describedby="contrato-novo-dica"
          />
          <p id="contrato-novo-dica" className="tnum mt-1 text-[11px] text-muted">
            {tamanho} caracteres · mínimo {CONTRATO_MIN}
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <button
            type="button"
            disabled={tamanho < CONTRATO_MIN || verPrevia.isPending}
            onClick={() => verPrevia.mutate(texto)}
            className="rounded-md border border-line px-4 py-2 font-semibold disabled:opacity-50"
          >
            {verPrevia.isPending ? "Preenchendo…" : "Ver como fica"}
          </button>
          <button
            type="button"
            disabled={tamanho < CONTRATO_MIN || publicar.isPending || !previa || Boolean(previa.problema)}
            onClick={() => {
              if (window.confirm("Publicar esta versão? Todas as organizações vão precisar aceitá-la antes da próxima rifa.")) {
                publicar.mutate(texto);
              }
            }}
            className="rounded-md bg-green px-4 py-2 font-semibold text-on-green disabled:opacity-50"
          >
            {publicar.isPending ? "Publicando…" : c ? `Publicar a versão ${c.versao + 1}` : "Publicar a versão 1"}
          </button>
        </div>
        {!previa && tamanho >= CONTRATO_MIN ? (
          <p className="text-[11px] text-muted">Veja como fica antes de publicar: é o texto que as organizações vão aceitar.</p>
        ) : null}
        {previa ? (
          <div className="space-y-2">
            {previa.problema ? (
              <p role="alert" className="rounded-md bg-red-soft px-3 py-2 text-xs text-red">
                {previa.problema}
              </p>
            ) : (
              <p className="text-xs text-green-deep">Todos os campos preenchidos. É este o texto que vai ao ar:</p>
            )}
            <TextoDoContrato texto={previa.texto} id="contrato-previa" />
            {!previa.problema ? <Impressao rotulo="Impressão (SHA-256) que esta versão terá" hash={previa.hash} /> : null}
          </div>
        ) : null}
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
