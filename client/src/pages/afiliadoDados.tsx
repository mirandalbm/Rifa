import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { PanelShell } from "@/components/AppShell";
import { Button, Card, Pill } from "@/components/bits";
import { apiRequest } from "@/lib/queryClient";
import { lerImagem } from "@/lib/anexo";
import { VerificacaoCard } from "@/components/Verificacao";
import { maskCpf } from "@shared/format";
import { UFS, maskCep } from "@shared/endereco";
import {
  DOCUMENTOS,
  DOCUMENTO_MAX_BYTES,
  STATUS_FISCAL,
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
    <label className="block">
      <span className="label-xs">{rotulo}</span>
      <input
        value={valor}
        onChange={(e) => {
          setMsg(null);
          mudar(e.target.value);
        }}
        className="mt-1 w-full rounded-md border border-line-2 px-3 py-2 text-sm"
        {...extra}
      />
    </label>
  );
  const end = (k: keyof typeof vazio.endereco) => (v: string) => setF({ ...f, endereco: { ...f.endereco, [k]: v } });
  const conta = (k: keyof typeof vazio.conta) => (v: string) => setF({ ...f, conta: { ...f.conta, [k]: v } as typeof f.conta });
  const status = data?.status ?? "incompleto";

  return (
    <PanelShell title="Meus dados">
      <div className="mb-3 flex flex-wrap items-center gap-2 text-sm">
        <Pill status={PILL[status]}>{STATUS_FISCAL[status]}</Pill>
        {status === "em_analise" ? <span className="text-muted">A plataforma confere seus dados e documentos.</span> : null}
        {status === "recusado" && data?.motivo ? <span className="text-red">Motivo: {data.motivo}</span> : null}
        {data?.falta.length ? <span className="text-muted">Falta: {data.falta.join(", ")}.</span> : null}
      </div>
      {data?.exigido && status !== "aprovado" ? (
        <p className="mb-3 rounded-md bg-yellow-soft px-3 py-2 text-sm text-yellow-deep">
          O saque de comissão só é liberado com este cadastro aprovado.
        </p>
      ) : null}
      <p className="mb-3 text-xs text-muted">
        Seus dados e documentos ficam guardados cifrados. As organizações nunca veem; só a plataforma, para conferir, e
        cada consulta fica registrada. Mudar a conta ou um documento depois de aprovado volta para a análise.
      </p>

      <div className="grid gap-3 lg:grid-cols-2">
        <Card title="Dados">
          <form
            className="space-y-3 p-4"
            onSubmit={(e) => {
              e.preventDefault();
              salvar.mutate();
            }}
          >
            {campo("Nome completo (como no documento)", f.nomeCompleto, (v) => setF({ ...f, nomeCompleto: v }))}
            <div className="grid gap-2 sm:grid-cols-2">
              {campo("CPF", f.cpf, (v) => setF({ ...f, cpf: maskCpf(v) }), { inputMode: "numeric", className: "tnum mt-1 w-full rounded-md border border-line-2 px-3 py-2 text-sm" })}
              {campo("RG", f.rg, (v) => setF({ ...f, rg: v }))}
            </div>
            {campo("Nascimento", f.nascimento, (v) => setF({ ...f, nascimento: v }), { type: "date" })}
            <div className="grid gap-2 sm:grid-cols-[1fr_2fr]">
              {campo("CEP", f.endereco.cep, (v) => end("cep")(maskCep(v)), { inputMode: "numeric" })}
              {campo("Rua", f.endereco.logradouro, end("logradouro"))}
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {campo("Número", f.endereco.numero, end("numero"))}
              {campo("Complemento", f.endereco.complemento, end("complemento"))}
              <div className="col-span-2 sm:col-span-1">{campo("Bairro", f.endereco.bairro, end("bairro"))}</div>
            </div>
            <div className="grid grid-cols-[2fr_1fr] gap-2">
              {campo("Cidade", f.endereco.cidade, end("cidade"))}
              <label className="block">
                <span className="label-xs">UF</span>
                <select value={f.endereco.uf} onChange={(e) => end("uf")(e.target.value)} className="mt-1 w-full rounded-md border border-line-2 px-2 py-2 text-sm">
                  <option value="">—</option>
                  {Object.keys(UFS).map((u) => (
                    <option key={u} value={u}>
                      {u}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <p className="label-xs pt-2">Conta para receber (no seu CPF)</p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {campo("Banco", f.conta.banco, conta("banco"), { inputMode: "numeric", placeholder: "3 dígitos, ex. 260" })}
              {campo("Agência", f.conta.agencia, conta("agencia"), { inputMode: "numeric" })}
              <div className="col-span-2 sm:col-span-1">{campo("Conta com dígito", f.conta.conta, conta("conta"))}</div>
            </div>
            <div className="flex gap-4 text-sm">
              {(["corrente", "poupanca"] as const).map((t) => (
                <label key={t} className="flex items-center gap-1.5">
                  <input type="radio" checked={f.conta.tipo === t} onChange={() => conta("tipo")(t)} />
                  {t === "corrente" ? "Corrente" : "Poupança"}
                </label>
              ))}
            </div>
            {problema && f.nomeCompleto ? <p className="text-xs text-red">{problema}</p> : null}
            {msg ? (
              <p className={`rounded-md px-3 py-2 text-sm ${msg.ok ? "bg-green-soft text-green-deep" : "bg-red-soft text-red"}`}>{msg.texto}</p>
            ) : null}
            <Button type="submit" disabled={Boolean(problema) || salvar.isPending}>
              {salvar.isPending ? "Salvando…" : "Salvar dados"}
            </Button>
          </form>
        </Card>

        <Card title="Documentos">
          <ul className="divide-y divide-line">
            {(Object.entries(DOCUMENTOS) as [TipoDeDocumento, string][]).map(([tipo, nome]) => {
              const enviado = data?.documentos.find((d) => d.tipo === tipo);
              return (
                <li key={tipo} className="flex flex-wrap items-center gap-3 px-4 py-3 text-sm">
                  <span className="min-w-0 flex-1 basis-full sm:basis-auto">
                    <span className="block font-semibold">{nome}</span>
                    <span className="text-xs text-muted">
                      {enviado ? `enviado em ${new Date(enviado.createdAt).toLocaleDateString("pt-BR")}` : "foto nítida ou PDF, até 6 MB"}
                    </span>
                  </span>
                  {enviado ? <Pill status="active">enviado</Pill> : <Pill status="draft">falta</Pill>}
                  <label className="cursor-pointer rounded-md border border-line-2 px-3 py-1.5 text-xs font-semibold hover:bg-mist">
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
        </Card>
      </div>

      <div className="mt-6 space-y-3">
        <Card title="Foto do perfil">
          <div className="p-4">
            <FotoDoAfiliado />
          </div>
        </Card>
        <VerificacaoCard
          base="/api/affiliate/verificacao"
          sujeito="afiliado"
          foto={<p className="rounded-md bg-yellow-soft px-3 py-2 text-yellow-deep">Ponha uma foto sua, de rosto, em “Foto do perfil”, acima.</p>}
          extra={<CopiarDoFiscal />}
        />
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
    <div className="flex flex-wrap items-center gap-3 text-sm">
      {foto ? (
        <img src={foto} alt="Sua foto do perfil" width={56} height={56} className="h-14 w-14 rounded-full border border-line object-cover" />
      ) : (
        <span className="flex h-14 w-14 items-center justify-center rounded-full bg-mist-2 text-xs text-muted">sem foto</span>
      )}
      <label className="cursor-pointer rounded-md border border-line-2 px-3 py-1.5 text-xs font-semibold hover:bg-mist">
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
              salvar.mutate(await lerImagem(f));
            } catch (err) {
              setErro((err as Error).message);
            }
          }}
        />
      </label>
      <span className="text-xs text-muted">Uma foto sua, de rosto — é ela que comparamos com o documento.</span>
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
      <Button variant="ghost" className="text-xs" disabled={copiar.isPending} onClick={() => copiar.mutate()}>
        Usar os documentos do cadastro fiscal
      </Button>
      {msg ? <span className="text-xs text-muted">{msg}</span> : null}
    </div>
  );
}
