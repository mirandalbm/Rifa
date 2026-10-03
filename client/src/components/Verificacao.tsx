import { useEffect, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button, Card, Pill } from "@/components/bits";
import { SeloVerificado } from "@/components/SeloVerificado";
import { apiRequest } from "@/lib/queryClient";
import { maskCpf } from "@shared/format";
import {
  DOCUMENTOS_DO_SUJEITO,
  DOCUMENTOS_OPCIONAIS,
  DOCUMENTOS_VERIFICACAO,
  DOCUMENTO_VERIFICACAO_MAX_BYTES,
  NOME_SUJEITO,
  PILL_VERIFICACAO,
  ROTULO_DO_SELO,
  STATUS_VERIFICACAO,
  TIPOS_DE_PIX,
  VANTAGENS_DA_VERIFICACAO,
  validarDadosDaVerificacao,
  type DadosOrganizacao,
  type DadosPessoa,
  type StatusVerificacao,
  type Sujeito,
  type TipoDePix,
} from "@shared/verificacao";

interface Estado {
  sujeito: Sujeito;
  status: StatusVerificacao;
  motivo: string | null;
  verificadoEm: string | null;
  documentosAprovados: boolean;
  comparaFoto: boolean;
  temFoto: boolean;
  dados: DadosPessoa | DadosOrganizacao | null;
  documentos: { tipo: string; mime: string; tamanho: number; createdAt: string }[];
  falta: string[];
  /** Consentimento biométrico: o texto em vigor (com a chave) e o que foi dado. Nulo para organização. */
  consentimento: { texto: string[]; chave: string; dadoEm: string | null; chaveDada: string | null } | null;
}

/**
 * O texto da autorização, destacado do resto do formulário (LGPD, art. 11:
 * consentimento específico e destacado). O texto vem do servidor, e a chave
 * dele volta no pedido — o servidor recusa se o texto mudou.
 */
function TextoDaAutorizacao({ texto }: { texto: string[] }) {
  return (
    <div className="space-y-1.5 text-xs text-ink-2">
      {texto.map((p) => (
        <p key={p}>{p}</p>
      ))}
    </div>
  );
}

/** Autorizar de novo ou revogar, fora do formulário dos dados. */
function AutorizacaoDaFoto({ base, c }: { base: string; c: NonNullable<Estado["consentimento"]> }) {
  const qc = useQueryClient();
  const [marcado, setMarcado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const feito = () => {
    setErro(null);
    setMarcado(false);
    qc.invalidateQueries({ queryKey: [base] });
  };
  const autorizar = useMutation({
    mutationFn: () => apiRequest("POST", `${base}/consentimento`, { consentimentoFoto: true, consentimentoChave: c.chave }),
    onSuccess: feito,
    onError: (e: Error) => setErro(e.message),
  });
  const revogar = useMutation({
    mutationFn: () => apiRequest("DELETE", `${base}/consentimento`),
    onSuccess: feito,
    onError: (e: Error) => setErro(e.message),
  });
  return (
    <section aria-labelledby="titulo-autorizacao-foto" className="rounded-md border border-line p-3">
      <h3 id="titulo-autorizacao-foto" className="text-sm font-semibold">
        Autorização para comparar a foto (dado biométrico)
      </h3>
      {c.dadoEm && c.chaveDada === c.chave ? (
        <>
          <p className="mt-1 text-xs text-muted">
            Você autorizou em <span className="tnum">{new Date(c.dadoEm).toLocaleDateString("pt-BR")}</span>. Pode revogar a
            qualquer momento: o selo sai e a foto deixa de ser comparada.
          </p>
          <Button
            variant="ghost"
            className="mt-2"
            disabled={revogar.isPending}
            onClick={() => {
              if (window.confirm("Revogar a autorização? O selo de verificado sai e a foto deixa de ser comparada.")) revogar.mutate();
            }}
          >
            Revogar autorização
          </Button>
        </>
      ) : (
        <>
          {c.dadoEm ? (
            <p className="mt-1 text-xs text-muted">
              O texto mudou desde a sua autorização (por exemplo, a comparação passou a ser feita por um serviço de
              reconhecimento facial). Leia e autorize de novo para a foto voltar a ser comparada.
            </p>
          ) : null}
          <div className="mt-2 rounded-md bg-mist px-3 py-2">
            <TextoDaAutorizacao texto={c.texto} />
          </div>
          <label className="mt-2 flex items-start gap-2 text-xs">
            <input type="checkbox" checked={marcado} onChange={(e) => setMarcado(e.target.checked)} className="mt-0.5" />
            <span>Li e autorizo a comparação da foto do meu perfil com a do meu documento.</span>
          </label>
          <Button className="mt-2" disabled={!marcado || autorizar.isPending} onClick={() => autorizar.mutate()}>
            Autorizar
          </Button>
        </>
      )}
      {erro ? <p className="mt-2 text-xs text-red">{erro}</p> : null}
    </section>
  );
}

const identificacaoVazia = { nomeCompleto: "", cpf: "", rg: "", nascimento: "" };
const contaVazia = { banco: "", agencia: "", conta: "", tipo: "corrente" as "corrente" | "poupanca" };
const pixVazio = { tipo: "cpf" as TipoDePix, chave: "" };

const EXPLICA: Partial<Record<StatusVerificacao, string>> = {
  em_analise: "A plataforma está conferindo seus dados e documentos.",
  foto_em_analise: "Os documentos estão certos; falta conferir a foto do perfil com a do documento.",
  foto_divergente: "Os documentos estão certos, mas a foto do perfil não é a da pessoa do documento. Troque por uma foto sua, de rosto.",
  recusado: "Corrija o que o motivo diz e envie de novo.",
};

/**
 * A verificação do perfil (selo de trevo), a mesma tela para apostador,
 * afiliado e organização. Destaca, não barra: quem não verifica continua
 * comprando, divulgando e fazendo rifa. Tudo vai cifrado; só a plataforma
 * confere, e cada consulta fica registrada.
 */
export function VerificacaoCard({
  base,
  sujeito,
  foto,
  extra,
}: {
  /** A rota do dono: `/api/public/conta/verificacao`, `/api/affiliate/verificacao`… */
  base: string;
  sujeito: Sujeito;
  /** Onde trocar a foto do perfil (pessoa), mostrado quando ela falta ou não confere. */
  foto?: ReactNode;
  /** Atalhos do sujeito (ex.: copiar documentos do cadastro fiscal). */
  extra?: ReactNode;
}) {
  const qc = useQueryClient();
  const { data } = useQuery<Estado>({ queryKey: [base] });
  const pessoa = sujeito !== "organizacao";
  const [id, setId] = useState(identificacaoVazia);
  const [org, setOrg] = useState({ razaoSocial: "", cnpj: "" });
  const [conta, setConta] = useState(contaVazia);
  const [pix, setPix] = useState(pixVazio);
  const [consentimento, setConsentimento] = useState(false);
  const [abrir, setAbrir] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null);

  useEffect(() => {
    const d = data?.dados;
    if (!d) return;
    const ident = "responsavel" in d ? d.responsavel : d;
    setId({ ...ident, cpf: maskCpf(ident.cpf) });
    if ("razaoSocial" in d) setOrg({ razaoSocial: d.razaoSocial, cnpj: d.cnpj });
    setConta(d.conta);
    setPix(d.pix);
  }, [data?.dados]);

  // Chegou pelo aviso ou pelo "Verificar meu perfil" dos comentários: rola até aqui.
  const carregou = Boolean(data);
  useEffect(() => {
    if (carregou && window.location.hash === "#verificacao") document.getElementById("verificacao")?.scrollIntoView({ block: "start" });
  }, [carregou]);

  const corpo = pessoa
    ? { ...id, conta, pix, consentimentoFoto: consentimento, consentimentoChave: data?.consentimento?.chave }
    : { ...org, responsavel: id, conta, pix };
  let problema: string | null = null;
  try {
    validarDadosDaVerificacao(sujeito, corpo);
  } catch (e) {
    problema = (e as Error).message;
  }

  const recarregar = () => qc.invalidateQueries({ queryKey: [base] });
  const salvar = useMutation({
    mutationFn: () => apiRequest("PUT", base, corpo),
    onSuccess: () => {
      setMsg({ ok: true, texto: "Dados salvos." });
      recarregar();
    },
    onError: (e: Error) => setMsg({ ok: false, texto: e.message }),
  });
  const enviarDoc = useMutation({
    mutationFn: (v: { tipo: string; arquivo: string }) => apiRequest("PUT", `${base}/documentos/${v.tipo}`, { arquivo: v.arquivo }),
    onSuccess: recarregar,
    onError: (e: Error) => setMsg({ ok: false, texto: e.message }),
  });

  const status = data?.status ?? "incompleto";
  const verificado = status === "verificado";
  const mostrarFormulario = !verificado || abrir;

  const campo = (rotulo: string, valor: string, mudar: (v: string) => void, extraProps: Record<string, unknown> = {}) => (
    <label className="block">
      <span className="label-xs">{rotulo}</span>
      <input
        value={valor}
        onChange={(e) => {
          setMsg(null);
          mudar(e.target.value);
        }}
        className="campo text-sm"
        {...extraProps}
      />
    </label>
  );

  return (
    <div id="verificacao" className="scroll-mt-20 space-y-3">
      <Card
        title={pessoa ? "Perfil verificado" : "Organização verificada"}
        right={<Pill status={PILL_VERIFICACAO[status]}>{STATUS_VERIFICACAO[status]}</Pill>}
      >
        <div className="space-y-3 p-4 text-sm">
          <p className="flex items-center gap-2 font-semibold">
            <SeloVerificado sujeito={sujeito} tamanho={22} />
            {verificado ? `${ROTULO_DO_SELO[sujeito]} — o selo já aparece ao lado do nome.` : `O selo de trevo de ${NOME_SUJEITO[sujeito].toLowerCase()} verificado`}
          </p>
          {verificado ? null : (
            <ul className="list-disc space-y-1 pl-5 text-muted">
              {VANTAGENS_DA_VERIFICACAO[sujeito].map((v) => (
                <li key={v}>{v}</li>
              ))}
            </ul>
          )}
          {EXPLICA[status] ? <p>{EXPLICA[status]}</p> : null}
          {data?.motivo && (status === "recusado" || status === "foto_divergente") ? (
            <p className="rounded-md bg-red-soft px-3 py-2 text-red">Motivo: {data.motivo}</p>
          ) : null}
          {data?.falta.length && !verificado ? <p className="text-muted">Falta: {data.falta.join("; ")}.</p> : null}
          {pessoa && (!data?.temFoto || status === "foto_divergente") && foto ? <div>{foto}</div> : null}
          {pessoa && data?.dados && data.consentimento ? <AutorizacaoDaFoto base={base} c={data.consentimento} /> : null}
          <p className="text-xs text-muted">
            {pessoa
              ? "É opcional: sem verificar, você continua comprando e comentando (sem emojis). "
              : "É opcional: sem verificar, a organização continua fazendo rifa normalmente. "}
            Dados e documentos ficam guardados cifrados; só a plataforma confere, e cada consulta fica registrada.
            {pessoa ? " Trocar a foto do perfil depois de verificado tira o selo até a nova ser conferida." : ""}
          </p>
          {verificado ? (
            <button type="button" className="text-xs font-semibold text-marca" onClick={() => setAbrir((a) => !a)} aria-expanded={abrir}>
              {abrir ? "Fechar meus dados" : "Ver ou atualizar meus dados (volta para a análise)"}
            </button>
          ) : null}
        </div>
      </Card>

      {mostrarFormulario ? (
        // Minha conta do apostador é coluna estreita de propósito (texto de leitura):
        // lá dados e documentos vão um embaixo do outro. No painel, lado a lado no computador.
        <div className={`grid grid-cols-1 gap-3 ${sujeito === "apostador" ? "" : "lg:grid-cols-2"}`}>
          <Card title={pessoa ? "Seus dados" : "Dados da organização"}>
            <form
              className="space-y-3 p-4"
              onSubmit={(e) => {
                e.preventDefault();
                salvar.mutate();
              }}
            >
              {pessoa ? null : (
                <>
                  {campo("Razão social (como no cartão CNPJ)", org.razaoSocial, (v) => setOrg({ ...org, razaoSocial: v }))}
                  {campo("CNPJ", org.cnpj, (v) => setOrg({ ...org, cnpj: v }), { inputMode: "numeric", className: "campo tnum text-sm" })}
                  <p className="label-xs pt-2">Dono ou sócio responsável</p>
                </>
              )}
              {campo("Nome completo (como no documento)", id.nomeCompleto, (v) => setId({ ...id, nomeCompleto: v }))}
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {campo("CPF", id.cpf, (v) => setId({ ...id, cpf: maskCpf(v) }), { inputMode: "numeric", className: "campo tnum text-sm" })}
                {campo("RG", id.rg, (v) => setId({ ...id, rg: v }))}
              </div>
              {campo("Nascimento", id.nascimento, (v) => setId({ ...id, nascimento: v }), { type: "date" })}
              <p className="label-xs pt-2">{pessoa ? "Conta bancária (no seu CPF)" : "Conta bancária da organização"}</p>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {campo("Banco", conta.banco, (v) => setConta({ ...conta, banco: v }), { inputMode: "numeric", placeholder: "3 dígitos, ex. 260" })}
                {campo("Agência", conta.agencia, (v) => setConta({ ...conta, agencia: v }), { inputMode: "numeric" })}
                <div className="col-span-2 sm:col-span-1">{campo("Conta com dígito", conta.conta, (v) => setConta({ ...conta, conta: v }))}</div>
              </div>
              <div className="flex gap-4 text-sm">
                {(["corrente", "poupanca"] as const).map((t) => (
                  <label key={t} className="flex items-center gap-1.5">
                    <input type="radio" checked={conta.tipo === t} onChange={() => setConta({ ...conta, tipo: t })} />
                    {t === "corrente" ? "Corrente" : "Poupança"}
                  </label>
                ))}
              </div>
              <div className="grid grid-cols-[1fr_2fr] gap-2">
                <label className="block">
                  <span className="label-xs">Tipo da chave Pix</span>
                  <select
                    value={pix.tipo}
                    onChange={(e) => setPix({ ...pix, tipo: e.target.value as TipoDePix })}
                    className="mt-1 w-full rounded-md border border-line-2 px-2 py-2 text-sm"
                  >
                    {(Object.entries(TIPOS_DE_PIX) as [TipoDePix, string][]).map(([k, v]) => (
                      <option key={k} value={k}>
                        {v}
                      </option>
                    ))}
                  </select>
                </label>
                {campo("Chave Pix", pix.chave, (v) => setPix({ ...pix, chave: v }))}
              </div>
              {pessoa && !data?.dados ? (
                <fieldset className="rounded-md border border-line bg-mist px-3 py-2">
                  <legend className="px-1 text-xs font-semibold">Autorização para comparar a foto (dado biométrico)</legend>
                  {data?.consentimento ? <TextoDaAutorizacao texto={data.consentimento.texto} /> : null}
                  <label className="mt-2 flex items-start gap-2 text-xs">
                    <input type="checkbox" checked={consentimento} onChange={(e) => setConsentimento(e.target.checked)} className="mt-0.5" />
                    <span>Li e autorizo a comparação da foto do meu perfil com a do meu documento.</span>
                  </label>
                </fieldset>
              ) : null}
              {problema && id.nomeCompleto ? <p className="text-xs text-red">{problema}</p> : null}
              {msg ? (
                <p className={`rounded-md px-3 py-2 text-sm ${msg.ok ? "bg-green-soft text-green-deep" : "bg-red-soft text-red"}`}>{msg.texto}</p>
              ) : null}
              <Button type="submit" disabled={Boolean(problema) || salvar.isPending}>
                {salvar.isPending ? "Salvando…" : "Salvar dados"}
              </Button>
            </form>
          </Card>

          <Card title="Documentos">
            {extra ? <div className="border-b border-line px-4 py-3 text-sm">{extra}</div> : null}
            <ul className="divide-y divide-line">
              {DOCUMENTOS_DO_SUJEITO[sujeito].map((tipo) => {
                const enviado = data?.documentos.find((d) => d.tipo === tipo);
                const opcional = DOCUMENTOS_OPCIONAIS.includes(tipo);
                return (
                  <li key={tipo} className="flex flex-wrap items-center gap-3 px-4 py-3 text-sm">
                    <span className="min-w-0 flex-1 basis-full sm:basis-auto">
                      <span className="block font-semibold">{DOCUMENTOS_VERIFICACAO[tipo]}</span>
                      <span className="text-xs text-muted">
                        {enviado
                          ? `enviado em ${new Date(enviado.createdAt).toLocaleDateString("pt-BR")}`
                          : tipo === "identidade_frente" && pessoa
                            ? "foto nítida (JPG, PNG ou WebP), até 6 MB — é nela que comparamos o rosto"
                            : "foto nítida ou PDF, até 6 MB"}
                      </span>
                    </span>
                    {enviado ? <Pill status="active">enviado</Pill> : <Pill status="draft">{opcional ? "opcional" : "falta"}</Pill>}
                    <label className="cursor-pointer rounded-md border border-line-2 px-3 py-1.5 text-xs font-semibold hover:bg-mist">
                      {enviado ? "Trocar" : "Enviar"}
                      <input
                        type="file"
                        accept={tipo === "identidade_frente" && pessoa ? "image/jpeg,image/png,image/webp" : "image/jpeg,image/png,image/webp,application/pdf"}
                        className="sr-only"
                        onChange={(e) => {
                          const arq = e.target.files?.[0];
                          setMsg(null);
                          if (!arq) return;
                          if (arq.size > DOCUMENTO_VERIFICACAO_MAX_BYTES) return setMsg({ ok: false, texto: "O arquivo passa de 6 MB." });
                          const r = new FileReader();
                          r.onload = () => enviarDoc.mutate({ tipo, arquivo: String(r.result) });
                          r.readAsDataURL(arq);
                        }}
                      />
                    </label>
                  </li>
                );
              })}
            </ul>
          </Card>
        </div>
      ) : null}
    </div>
  );
}
