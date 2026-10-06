import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, Pill } from "@/components/bits";
import { apiRequest } from "@/lib/queryClient";
import { CAMPOS_DO_CONTRATO, CONTRATO_MAX, CONTRATO_MIN, NOMES_DOS_CAMPOS } from "@shared/contratoPromotora";
import { ANEXO_MIN, MODALIDADES, MODALIDADES_DE_ANEXO, TITULO_MAX, type ModalidadeDeAnexo } from "@shared/contratoAnexos";

type DaOrganizacao = {
  contrato: { versao: number; texto: string; publicadoEm: string; hash: string } | null;
  ultimoAceite: { versao: number; aceitoEm: string; aceitoPor: string | null; hash: string } | null;
  pendente: boolean;
  anexos: AnexoDaOrganizacao[];
};
type AnexoDaOrganizacao = {
  modalidade: ModalidadeDeAnexo;
  quando: string;
  titulo: string;
  versao: number;
  texto: string;
  hash: string;
  aceitoEm: string | null;
};
type AnexoDaPlataforma = {
  modalidade: ModalidadeDeAnexo;
  rotulo: string;
  quando: string;
  anexo: {
    titulo: string;
    versao: number;
    texto: string;
    modelo: string | null;
    publicadoEm: string;
    hash: string;
    aceites: number;
    desatualizado: boolean;
  } | null;
};
type DaPlataforma = {
  contrato: { versao: number; texto: string; modelo: string | null; publicadoEm: string; hash: string; desatualizado: boolean } | null;
  versoes: { versao: number; publicadoEm: string; aceites: number; hash: string }[];
  organizacoesAtivas: number;
  anexos: AnexoDaPlataforma[];
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
        {d?.anexos.length ? <AnexosDaOrganizacao anexos={d.anexos} /> : null}
      </div>
    </Card>
  );
}

/**
 * Os anexos por modalidade (cláusula 7): cada um vale só para a rifa que usa
 * aquela modalidade — o sistema sabe pelos dados da rifa. Sem o aceite, a
 * rifa daquela modalidade não publica.
 */
function AnexosDaOrganizacao({ anexos }: { anexos: AnexoDaOrganizacao[] }) {
  const qc = useQueryClient();
  const [li, setLi] = useState<Record<string, boolean>>({});
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null);
  const aceitar = useMutation({
    mutationFn: (a: AnexoDaOrganizacao) => apiRequest("POST", "/api/admin/contrato-promotora/anexos/aceite", { modalidade: a.modalidade, versao: a.versao }),
    onSuccess: () => {
      setMsg({ ok: true, texto: "Anexo aceito." });
      qc.invalidateQueries({ queryKey: CHAVE });
    },
    onError: (e: Error) => {
      setMsg({ ok: false, texto: e.message });
      qc.invalidateQueries({ queryKey: CHAVE });
    },
  });
  return (
    <section className="space-y-2 border-t border-line pt-3" aria-labelledby="anexos-titulo">
      <h3 id="anexos-titulo" className="font-semibold">
        Anexos por modalidade
      </h3>
      <p className="text-xs text-muted">
        Cada anexo vale só para a rifa que usa aquela modalidade — o sistema vê isso pelos dados da rifa. Sem o aceite, a
        rifa da modalidade não é publicada.
      </p>
      <ul className="space-y-2">
        {anexos.map((a) => {
          const id = `anexo-${a.modalidade}`;
          return (
            <li key={a.modalidade} className="space-y-2 rounded-md border border-line p-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-medium">{a.titulo}</p>
                  <p className="text-xs text-muted">
                    Vale para: {a.quando} · <span className="tnum">versão {a.versao}</span>
                  </p>
                </div>
                {a.aceitoEm ? <Pill status="closed">aceito</Pill> : <Pill status="pending">falta aceitar</Pill>}
              </div>
              <details>
                <summary className="cursor-pointer text-xs font-semibold">Ler o anexo</summary>
                <div className="mt-2">
                  <TextoDoContrato texto={a.texto} id={id} />
                </div>
              </details>
              <Impressao rotulo="Impressão (SHA-256)" hash={a.hash} />
              {!a.aceitoEm ? (
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                  <label className="flex items-start gap-2 text-sm">
                    <input
                      type="checkbox"
                      className="mt-1 h-5 w-5"
                      checked={li[a.modalidade] === true}
                      onChange={(e) => {
                        setMsg(null);
                        setLi({ ...li, [a.modalidade]: e.target.checked });
                      }}
                      aria-describedby={id}
                    />
                    <span>
                      Li o anexo (versão <span className="tnum">{a.versao}</span>) e aceito em nome da organização.
                    </span>
                  </label>
                  <button
                    type="button"
                    disabled={li[a.modalidade] !== true || aceitar.isPending}
                    onClick={() => aceitar.mutate(a)}
                    className="rounded-md bg-green px-4 py-2 font-semibold text-on-green disabled:opacity-50"
                  >
                    Aceitar o anexo
                  </button>
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
      {msg ? (
        <p role="status" className={`rounded-md px-3 py-2 text-sm ${msg.ok ? "bg-green-soft text-green-deep" : "bg-red-soft text-red"}`}>
          {msg.texto}
        </p>
      ) : null}
    </section>
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
                <span className="text-muted">{v.aceites} {v.aceites === 1 ? "aceite" : "aceites"}</span>
              </li>
            ))}
          </ul>
        ) : null}
        {msg ? (
          <p role="status" className={`rounded-md px-3 py-2 ${msg.ok ? "bg-green-soft text-green-deep" : "bg-red-soft text-red"}`}>
            {msg.texto}
          </p>
        ) : null}
        {d ? <AnexosDaPlataforma anexos={d.anexos} /> : null}
      </div>
    </Card>
  );
}

/**
 * Os anexos por modalidade, do lado da plataforma: a versão em vigor de cada
 * um, quantas organizações aceitaram e o formulário da versão seguinte (com
 * os mesmos campos da empresa e a mesma prévia do contrato).
 */
function AnexosDaPlataforma({ anexos }: { anexos: AnexoDaPlataforma[] }) {
  const qc = useQueryClient();
  const [modalidade, setModalidade] = useState<ModalidadeDeAnexo>(MODALIDADES[0]);
  const [titulo, setTitulo] = useState("");
  const [texto, setTexto] = useState("");
  const [previa, setPrevia] = useState<Previa | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null);
  const atual = anexos.find((a) => a.modalidade === modalidade)?.anexo ?? null;
  const corpo = { modalidade, titulo, texto };
  const mudou = () => {
    setMsg(null);
    setPrevia(null);
  };
  const verPrevia = useMutation({
    mutationFn: async () => (await apiRequest("POST", "/api/admin/contrato-promotora/anexos/previa", corpo)).json() as Promise<Previa>,
    onSuccess: (p) => setPrevia(p),
    onError: (e: Error) => setMsg({ ok: false, texto: e.message }),
  });
  const publicar = useMutation({
    mutationFn: (c: typeof corpo) => apiRequest("POST", "/api/admin/contrato-promotora/anexos", c),
    onSuccess: () => {
      setMsg({ ok: true, texto: "Anexo publicado. As organizações aceitam antes da próxima rifa desta modalidade." });
      setTitulo("");
      setTexto("");
      setPrevia(null);
      qc.invalidateQueries({ queryKey: CHAVE });
    },
    onError: (e: Error) => setMsg({ ok: false, texto: e.message }),
  });
  const pronto = titulo.trim().length >= 3 && texto.trim().length >= ANEXO_MIN;

  return (
    <section className="space-y-3 border-t border-line pt-3" aria-labelledby="anexos-plataforma">
      <h3 id="anexos-plataforma" className="font-semibold">
        Anexos por modalidade (cláusula 7)
      </h3>
      <p className="text-xs text-muted">
        Cada anexo vale só para a rifa daquela modalidade, lida dos dados da rifa — a organização não escolhe. Ela aceita
        a versão em vigor antes de publicar a rifa (ou de pôr cota premiada ou entidade beneficiada numa rifa no ar).
      </p>
      <ul className="divide-y divide-line rounded border border-line">
        {anexos.map((a) => (
          <li key={a.modalidade} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-xs">
            <span className="min-w-0">
              <span className="font-semibold">{a.rotulo}</span>
              <span className="block text-muted">{a.anexo ? `${a.anexo.titulo} · versão ${a.anexo.versao}` : "sem anexo"}</span>
            </span>
            {a.anexo ? (
              <span className="tnum text-muted">
                {a.anexo.aceites} {a.anexo.aceites === 1 ? "aceite" : "aceites"}{a.anexo.desatualizado ? " · dados da empresa mudaram" : ""}
              </span>
            ) : null}
          </li>
        ))}
      </ul>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <label className="block min-w-0">
          <span className="label-xs">Modalidade</span>
          <select
            className="campo"
            value={modalidade}
            onChange={(e) => {
              mudou();
              setModalidade(e.target.value as ModalidadeDeAnexo);
            }}
          >
            {MODALIDADES.map((m) => (
              <option key={m} value={m}>
                {MODALIDADES_DE_ANEXO[m].rotulo}
              </option>
            ))}
          </select>
        </label>
        <label className="block min-w-0">
          <span className="label-xs">Título do anexo</span>
          <input
            className="campo"
            maxLength={TITULO_MAX}
            value={titulo}
            onChange={(e) => {
              mudou();
              setTitulo(e.target.value);
            }}
          />
        </label>
      </div>
      <p className="text-[11px] text-muted">
        Vale para: {MODALIDADES_DE_ANEXO[modalidade].quando}.{" "}
        {atual ? `Em vigor: versão ${atual.versao}. Publicar cria a versão ${atual.versao + 1}.` : "Ainda sem anexo: publicar cria a versão 1."}
      </p>
      {atual?.desatualizado && atual.modelo ? (
        <button
          type="button"
          className="rounded-md border border-line px-3 py-1 text-xs font-semibold"
          onClick={() => {
            mudou();
            setTitulo(atual.titulo);
            setTexto(atual.modelo!);
          }}
        >
          Os dados da empresa mudaram: carregar o anexo em vigor para publicar de novo
        </button>
      ) : null}
      <label className="block">
        <span className="label-xs">Texto do anexo</span>
        <textarea
          className="campo"
          rows={6}
          maxLength={CONTRATO_MAX}
          value={texto}
          onChange={(e) => {
            mudou();
            setTexto(e.target.value);
          }}
        />
      </label>
      <p className="text-[11px] text-muted">
        Os campos da empresa valem aqui também: {NOMES_DOS_CAMPOS.map((n) => `{{${n}}}`).join(", ")} e os colchetes do advogado.
      </p>
      <div className="flex flex-col gap-2 sm:flex-row">
        <button
          type="button"
          disabled={!pronto || verPrevia.isPending}
          onClick={() => verPrevia.mutate()}
          className="rounded-md border border-line px-4 py-2 font-semibold disabled:opacity-50"
        >
          Ver como fica
        </button>
        <button
          type="button"
          disabled={!pronto || !previa || Boolean(previa.problema) || publicar.isPending}
          onClick={() => {
            if (window.confirm("Publicar este anexo? As organizações vão precisar aceitá-lo antes da próxima rifa desta modalidade.")) {
              publicar.mutate(corpo);
            }
          }}
          className="rounded-md bg-green px-4 py-2 font-semibold text-on-green disabled:opacity-50"
        >
          {atual ? `Publicar a versão ${atual.versao + 1} do anexo` : "Publicar o anexo"}
        </button>
      </div>
      {previa ? (
        <div className="space-y-2">
          {previa.problema ? (
            <p role="alert" className="rounded-md bg-red-soft px-3 py-2 text-xs text-red">
              {previa.problema}
            </p>
          ) : null}
          <TextoDoContrato texto={previa.texto} id="anexo-previa" />
          {!previa.problema ? <Impressao rotulo="Impressão (SHA-256) que este anexo terá" hash={previa.hash} /> : null}
        </div>
      ) : null}
      {msg ? (
        <p role="status" className={`rounded-md px-3 py-2 text-sm ${msg.ok ? "bg-green-soft text-green-deep" : "bg-red-soft text-red"}`}>
          {msg.texto}
        </p>
      ) : null}
    </section>
  );
}
