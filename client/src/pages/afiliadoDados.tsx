import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { PanelShell } from "@/components/AppShell";
import { Button, Campo, Filtros, Pill, TONS_DO_BOTAO } from "@/components/bits";
import { CartaoDoPainel } from "@/components/painel";
import { IconePerfil } from "@/components/Icones";
import { apiRequest } from "@/lib/queryClient";
import { lerFoto } from "@/lib/anexo";
import { VerificacaoCard } from "@/components/Verificacao";
import { formatarCnpj, maskCpf } from "@shared/format";
import { UFS, maskCep } from "@shared/endereco";
import {
  DOCUMENTOS,
  DOCUMENTO_MAX_BYTES,
  STATUS_FISCAL,
  REGIMES_TRIBUTARIOS,
  TIPOS_DE_EMPRESA,
  validarCadastroFiscal,
  type DadosFiscais,
  type StatusFiscal,
  type TipoDeDocumento,
} from "@shared/fiscal";

interface EstadoFiscal {
  status: StatusFiscal;
  motivo: string | null;
  dados: DadosFiscais | null;
  documentos: { tipo: string; mime: string; tamanho: number; createdAt: string }[];
  falta: string[];
  exigido: boolean;
}

const PILL: Record<StatusFiscal, string> = { incompleto: "draft", em_analise: "pending", aprovado: "active", recusado: "blocked" };

const vazio = {
  nomeCompleto: "",
  cpf: "",
  rg: "",
  nascimento: "",
  endereco: { cep: "", logradouro: "", numero: "", complemento: "", bairro: "", cidade: "", uf: "" },
  conta: { banco: "", agencia: "", conta: "", tipo: "corrente" as "corrente" | "poupanca" },
  empresa: {
    tipo: "mei" as "mei" | "empresa",
    cnpj: "",
    razaoSocial: "",
    regime: undefined as "mei" | "simples" | "presumido_real" | undefined,
  },
};

/**
 * Cadastro fiscal do afiliado: quem recebe a comissão, onde mora e em qual
 * conta. Com os documentos, vai para a análise da plataforma. Tudo fica
 * guardado cifrado e o organizador nunca vê — só a plataforma, e cada
 * olhada fica registrada.
 */
export function AfiliadoDados() {
  const qc = useQueryClient();
  const { data } = useQuery<EstadoFiscal>({ queryKey: ["/api/affiliate/fiscal"] });
  const [f, setF] = useState(vazio);
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null);

  useEffect(() => {
    if (!data?.dados) return;
    const d = data.dados;
    setF({
      ...d,
      cpf: maskCpf(d.cpf),
      endereco: { ...d.endereco, cep: maskCep(d.endereco.cep), complemento: d.endereco.complemento ?? "" },
      empresa: d.empresa ? { ...d.empresa, regime: d.empresa.regime, cnpj: formatarCnpj(d.empresa.cnpj) } : vazio.empresa,
    });
  }, [data?.dados]);

  let problema: string | null = null;
  try {
    validarCadastroFiscal(f);
  } catch (e) {
    problema = (e as Error).message;
  }

  const recarregar = () => qc.invalidateQueries({ queryKey: ["/api/affiliate/fiscal"] });
  const salvar = useMutation({
    mutationFn: () => apiRequest("PUT", "/api/affiliate/fiscal", f),
    onSuccess: () => {
      setMsg({ ok: true, texto: "Dados salvos." });
      recarregar();
    },
    onError: (e: Error) => setMsg({ ok: false, texto: e.message }),
  });
  const enviarDoc = useMutation({
    mutationFn: (v: { tipo: TipoDeDocumento; arquivo: string }) =>
      apiRequest("PUT", `/api/affiliate/fiscal/documentos/${v.tipo}`, { arquivo: v.arquivo }),
    onSuccess: recarregar,
    onError: (e: Error) => setMsg({ ok: false, texto: e.message }),
  });

  const campo = (rotulo: string, valor: string, mudar: (v: string) => void, extra: Record<string, unknown> = {}) => (
    <Campo rotulo={rotulo}>
      <input
        value={valor}
        onChange={(e) => {
          setMsg(null);
          mudar(e.target.value);
        }}
        className="campo text-sm"
        {...extra}
      />
    </Campo>
  );
  const end = (k: keyof typeof vazio.endereco) => (v: string) => setF({ ...f, endereco: { ...f.endereco, [k]: v } });
  const conta = (k: keyof typeof vazio.conta) => (v: string) => setF({ ...f, conta: { ...f.conta, [k]: v } as typeof f.conta });
  const status = data?.status ?? "incompleto";

  return (
    <PanelShell title="Meus dados">
      <div className="mb-3 flex flex-wrap items-center gap-2 text-sm">
        <Pill status={PILL[status]}>{STATUS_FISCAL[status]}</Pill>
        {status === "em_analise" ? <span className="text-ink-2">A plataforma confere seus dados e documentos.</span> : null}
        {status === "recusado" && data?.motivo ? <span className="text-red">Motivo: {data.motivo}</span> : null}
      </div>
      {data?.falta.length ? <p className="mb-3 text-sm text-ink-2">Falta: {data.falta.join(", ")}.</p> : null}
      <p className="mb-3 rounded-lg bg-yellow-soft px-3 py-2 text-sm text-yellow-deep">
        A comissão é paga a <strong>MEI ou empresa</strong>: o saque só é liberado com este cadastro aprovado e o CNPJ
        nele, e cada saque vai com a nota fiscal do valor. Não tem CNPJ? O MEI se abre de graça no Portal do
        Empreendedor (gov.br).
      </p>
      <p className="mb-4 text-xs text-muted md:mb-6">
        Seus dados e documentos ficam guardados cifrados. As organizações nunca veem; só a plataforma, para conferir, e
        cada consulta fica registrada. Mudar a conta ou um documento depois de aprovado volta para a análise.
      </p>

      {/*
        No computador, duas colunas: o cadastro fiscal e os documentos dele à
        esquerda; a foto do perfil e a verificação à direita (especificação A07).
        O DOM segue a ordem do celular — dados, documentos, foto, verificação.
      */}
      <div className="grid grid-cols-1 gap-4 md:gap-6 lg:grid-cols-2 lg:items-start">
        <div className="min-w-0 space-y-4 md:space-y-6">
          <CartaoDoPainel titulo="Dados">
            <form
              className="space-y-3 px-5 pb-5"
              onSubmit={(e) => {
                e.preventDefault();
                salvar.mutate();
              }}
            >
              <fieldset className="space-y-3 rounded-lg border border-line-2 p-3">
                <legend className="label-xs px-1">MEI ou empresa que recebe a comissão</legend>
                <Filtros
                  exclusivo
                  rotulo="MEI ou empresa"
                  opcoes={(Object.keys(TIPOS_DE_EMPRESA) as (keyof typeof TIPOS_DE_EMPRESA)[]).map((t) => ({ valor: t, rotulo: TIPOS_DE_EMPRESA[t] }))}
                  ativa={f.empresa.tipo}
                  aoMudar={(t) => setF({ ...f, empresa: { ...f.empresa, tipo: t } })}
                />
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {campo("CNPJ", f.empresa.cnpj, (v) => setF({ ...f, empresa: { ...f.empresa, cnpj: formatarCnpj(v) } }), {
                    inputMode: "numeric",
                    className: "campo tnum text-sm",
                  })}
                  {campo("Razão social", f.empresa.razaoSocial, (v) => setF({ ...f, empresa: { ...f.empresa, razaoSocial: v } }))}
                </div>
                {f.empresa.tipo === "empresa" ? (
                  <fieldset className="space-y-1">
                    <legend className="label-xs">Regime tributário da empresa</legend>
                    <Filtros<"simples" | "presumido_real" | "">
                      exclusivo
                      rotulo="Regime tributário da empresa"
                      opcoes={(["simples", "presumido_real"] as const).map((r) => ({ valor: r, rotulo: REGIMES_TRIBUTARIOS[r] }))}
                      ativa={f.empresa.regime === "simples" || f.empresa.regime === "presumido_real" ? f.empresa.regime : ""}
                      aoMudar={(r) => {
                        if (r) setF({ ...f, empresa: { ...f.empresa, regime: r } });
                      }}
                    />
                    <p className="text-xs text-muted">
                      No Lucro Presumido ou Real, quem paga retém 1,5% de IRRF em cada saque: a nota fiscal é do valor
                      bruto, e cai na sua conta o valor menos a retenção. MEI e Simples Nacional recebem o valor cheio.
                    </p>
                  </fieldset>
                ) : null}
              </fieldset>
              {campo("Nome completo do titular (como no documento)", f.nomeCompleto, (v) => setF({ ...f, nomeCompleto: v }))}
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {campo("CPF", f.cpf, (v) => setF({ ...f, cpf: maskCpf(v) }), { inputMode: "numeric", className: "campo tnum text-sm" })}
                {campo("RG", f.rg, (v) => setF({ ...f, rg: v }))}
              </div>
              {campo("Nascimento", f.nascimento, (v) => setF({ ...f, nascimento: v }), { type: "date" })}
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {campo("CEP", f.endereco.cep, (v) => end("cep")(maskCep(v)), { inputMode: "numeric" })}
                {campo("Rua", f.endereco.logradouro, end("logradouro"))}
              </div>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {campo("Número", f.endereco.numero, end("numero"))}
                {campo("Complemento", f.endereco.complemento, end("complemento"))}
                <div className="col-span-2 sm:col-span-1">{campo("Bairro", f.endereco.bairro, end("bairro"))}</div>
              </div>
              <div className="grid grid-cols-[2fr_1fr] gap-3 sm:grid-cols-2">
                {campo("Cidade", f.endereco.cidade, end("cidade"))}
                <Campo rotulo="UF">
                  <select value={f.endereco.uf} onChange={(e) => end("uf")(e.target.value)} className="campo text-sm">
                    <option value="">—</option>
                    {Object.keys(UFS).map((u) => (
                      <option key={u} value={u}>
                        {u}
                      </option>
                    ))}
                  </select>
                </Campo>
              </div>
              <p className="label-xs pt-2">Conta para receber (no seu CPF)</p>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {campo("Banco", f.conta.banco, conta("banco"), { inputMode: "numeric", placeholder: "3 dígitos, ex. 260" })}
                {campo("Agência", f.conta.agencia, conta("agencia"), { inputMode: "numeric" })}
                <div className="col-span-2 sm:col-span-1">{campo("Conta com dígito", f.conta.conta, conta("conta"))}</div>
              </div>
              <Filtros
                exclusivo
                rotulo="Tipo da conta"
                opcoes={[
                  { valor: "corrente" as const, rotulo: "Corrente" },
                  { valor: "poupanca" as const, rotulo: "Poupança" },
                ]}
                ativa={f.conta.tipo}
                aoMudar={(t) => conta("tipo")(t)}
              />
              {problema && f.nomeCompleto ? <p className="text-xs text-red">{problema}</p> : null}
              {msg ? (
                <p className={`rounded-md px-3 py-2 text-sm ${msg.ok ? "bg-green-soft text-green-deep" : "bg-red-soft text-red"}`}>{msg.texto}</p>
              ) : null}
              <Button type="submit" disabled={Boolean(problema) || salvar.isPending}>
                {salvar.isPending ? "Salvando…" : "Salvar dados"}
              </Button>
            </form>
          </CartaoDoPainel>

          <CartaoDoPainel titulo="Documentos">
            <ul className="divide-y divide-line border-t border-line">
              {(Object.entries(DOCUMENTOS) as [TipoDeDocumento, string][]).map(([tipo, nome]) => {
                const enviado = data?.documentos.find((d) => d.tipo === tipo);
                return (
                  <li key={tipo} className="flex flex-wrap items-center gap-x-2.5 gap-y-2 px-5 py-3 text-sm">
                    <span className="min-w-0 flex-1 basis-full sm:basis-48">
                      <span className="block font-semibold">{nome}</span>
                      <span className="text-xs text-muted">
                        {enviado ? `enviado em ${new Date(enviado.createdAt).toLocaleDateString("pt-BR")}` : "foto nítida ou PDF, até 6 MB"}
                      </span>
                    </span>
                    {enviado ? <Pill status="active">enviado</Pill> : <Pill status="draft">falta</Pill>}
                    <label
                      className={`relative inline-flex h-10 shrink-0 cursor-pointer items-center rounded-lg px-4 text-[13px] font-semibold focus-within:ring-2 focus-within:ring-green ${TONS_DO_BOTAO.cinza}`}
                    >
                      {enviado ? "Trocar" : "Enviar"}
                      <input
                        type="file"
                        accept="image/jpeg,image/png,image/webp,application/pdf"
                        className="sr-only"
                        onChange={(e) => {
                          const arq = e.target.files?.[0];
                          setMsg(null);
                          if (!arq) return;
                          if (arq.size > DOCUMENTO_MAX_BYTES) return setMsg({ ok: false, texto: "O arquivo passa de 6 MB." });
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
          </CartaoDoPainel>
        </div>

        <div className="min-w-0 space-y-4 md:space-y-6">
          <CartaoDoPainel titulo="Foto do perfil">
            <div className="px-5 pb-5">
              <FotoDoAfiliado />
            </div>
          </CartaoDoPainel>
          <VerificacaoCard
            base="/api/affiliate/verificacao"
            sujeito="afiliado"
            foto={<p className="rounded-lg bg-yellow-soft px-3 py-2 text-yellow-deep">Ponha uma foto sua, de rosto, em “Foto do perfil”, acima.</p>}
            extra={<CopiarDoFiscal />}
          />
        </div>
      </div>
    </PanelShell>
  );
}

/** A foto do afiliado — a que a plataforma compara com o documento. */
function FotoDoAfiliado() {
  const qc = useQueryClient();
  const { data } = useQuery<{ affiliate: { foto: string | null; verificado: boolean } }>({ queryKey: ["/api/affiliate/overview"] });
  const [erro, setErro] = useState<string | null>(null);
  const salvar = useMutation({
    mutationFn: (foto: string | null) => apiRequest("PUT", "/api/affiliate/foto", { foto }),
    onSuccess: () => {
      setErro(null);
      qc.invalidateQueries({ queryKey: ["/api/affiliate/overview"] });
      qc.invalidateQueries({ queryKey: ["/api/affiliate/verificacao"] });
    },
    onError: (e: Error) => setErro(e.message),
  });
  const foto = data?.affiliate.foto ?? null;
  const verificado = Boolean(data?.affiliate.verificado);
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-sm">
      {foto ? (
        <img src={foto} alt="Sua foto do perfil" width={44} height={44} className="h-11 w-11 shrink-0 rounded-full border border-line object-cover" />
      ) : (
        <span role="img" aria-label="Sem foto do perfil" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-mist-2 text-ink-2">
          <IconePerfil tamanho={22} />
        </span>
      )}
      <label
        className={`relative inline-flex h-10 shrink-0 cursor-pointer items-center rounded-lg px-4 text-[13px] font-semibold focus-within:ring-2 focus-within:ring-green ${TONS_DO_BOTAO.contorno}`}
      >
        {foto ? "Trocar foto" : "Pôr foto"}
        <input
          type="file"
          accept="image/*"
          className="sr-only"
          onChange={async (e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (!f) return;
            if (verificado && !window.confirm("Trocar a foto tira o selo de verificado até a nova ser conferida. Trocar?")) return;
            try {
              salvar.mutate(await lerFoto(f, 1080));
            } catch (err) {
              setErro((err as Error).message);
            }
          }}
        />
      </label>
      <span className="min-w-0 text-[13px] leading-[18px] text-ink-2">Uma foto sua, de rosto — é ela que comparamos com o documento.</span>
      {erro ? <p className="basis-full text-xs text-red">{erro}</p> : null}
    </div>
  );
}

/** O RG já mandado no cadastro fiscal serve também para a verificação. */
function CopiarDoFiscal() {
  const qc = useQueryClient();
  const [msg, setMsg] = useState<string | null>(null);
  const copiar = useMutation({
    mutationFn: () => apiRequest("POST", "/api/affiliate/verificacao/copiar-do-fiscal"),
    onSuccess: () => {
      setMsg("Documentos copiados do cadastro fiscal.");
      qc.invalidateQueries({ queryKey: ["/api/affiliate/verificacao"] });
    },
    onError: (e: Error) => setMsg(e.message),
  });
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button variant="contorno" disabled={copiar.isPending} onClick={() => copiar.mutate()}>
        Usar os documentos do cadastro fiscal
      </Button>
      {msg ? <span className="text-xs text-muted">{msg}</span> : null}
    </div>
  );
}
