import { useEffect, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Button } from "@/components/bits";
import { apiRequest } from "@/lib/queryClient";
import { UFS, maskCep, soDigitosCep, cepValido, validarEndereco, type Endereco } from "@shared/endereco";

type Campos = Record<keyof Endereco, string>;

const VAZIO: Campos = {
  cep: "",
  logradouro: "",
  numero: "",
  complemento: "",
  bairro: "",
  cidade: "",
  uf: "",
};

/** Aceita endereço pela metade: o cadastro antigo tinha só cidade e UF. */
export type EnderecoParcial = Partial<Record<keyof Endereco, string | null>>;

function paraCampos(e: EnderecoParcial | null | undefined): Campos {
  const c = { ...VAZIO };
  for (const k of Object.keys(VAZIO) as (keyof Campos)[]) c[k] = e?.[k] ?? "";
  c.cep = maskCep(c.cep);
  return c;
}

/**
 * Endereço da organização. O CEP preenche rua, bairro, cidade e UF; o
 * número e o complemento são sempre da pessoa. Se a consulta falhar, tudo
 * continua editável à mão — o CEP é atalho, não porteiro.
 *
 * O mesmo formulário serve ao organizador (Configurações) e ao administrador
 * geral (Organizações): a rota confere de quem é.
 */
export function EnderecoForm({
  organizacaoId,
  atual,
  onSalvo,
}: {
  organizacaoId: string;
  atual: EnderecoParcial | null | undefined;
  onSalvo?: (e: Endereco) => void;
}) {
  const [f, setF] = useState<Campos>(() => paraCampos(atual));
  const [aviso, setAviso] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [salvo, setSalvo] = useState(false);
  const [buscando, setBuscando] = useState(false);

  // Pela chave, não pela referência: quem chama pode montar o objeto a cada
  // render, e aí o formulário apagaria o que a pessoa digita.
  const chave = JSON.stringify(atual ?? null);
  useEffect(() => setF(paraCampos(atual)), [chave]); // eslint-disable-line react-hooks/exhaustive-deps

  async function buscarCep(cep: string) {
    setBuscando(true);
    setAviso(null);
    try {
      const r = await fetch(`/api/public/cep/${cep}`);
      const corpo = await r.json().catch(() => ({}));
      if (!r.ok) {
        setAviso(corpo.message ?? "Não achamos este CEP. Preencha à mão.");
        return;
      }
      setF((atual) => ({
        ...atual,
        logradouro: corpo.logradouro || atual.logradouro,
        bairro: corpo.bairro || atual.bairro,
        cidade: corpo.cidade,
        uf: corpo.uf,
      }));
    } catch {
      setAviso("Sem conexão para consultar o CEP. Preencha à mão.");
    } finally {
      setBuscando(false);
    }
  }

  let problema: string | null = null;
  try {
    validarEndereco(f);
  } catch (e) {
    problema = (e as Error).message;
  }

  const salvar = useMutation({
    mutationFn: async () =>
      (await apiRequest("PUT", `/api/admin/organizacoes/${organizacaoId}/endereco`, f)).json(),
    onSuccess: (e: Endereco) => {
      setErro(null);
      setSalvo(true);
      onSalvo?.(e);
    },
    onError: (e: Error) => setErro(e.message),
  });

  const muda = (campo: keyof Campos, valor: string) => {
    setErro(null);
    setSalvo(false);
    setF((atual) => ({ ...atual, [campo]: valor }));
  };

  const campo = (
    id: keyof Campos,
    rotulo: string,
    { className, ...extra }: React.InputHTMLAttributes<HTMLInputElement> = {},
  ) => (
    <div className={className}>
      <label htmlFor={`end-${organizacaoId}-${id}`} className="label-xs">
        {rotulo}
      </label>
      <input
        id={`end-${organizacaoId}-${id}`}
        value={f[id]}
        onChange={(e) => muda(id, e.target.value)}
        className="mt-1 w-full rounded-md border border-line-2 px-3 py-2 text-sm"
        {...extra}
      />
    </div>
  );

  return (
    <form
      className="grid grid-cols-6 gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        salvar.mutate();
      }}
    >
      <div className="col-span-3 sm:col-span-2">
        <label htmlFor={`end-${organizacaoId}-cep`} className="label-xs">
          CEP
        </label>
        <input
          id={`end-${organizacaoId}-cep`}
          inputMode="numeric"
          autoComplete="postal-code"
          value={f.cep}
          onChange={(e) => {
            const cep = maskCep(e.target.value);
            muda("cep", cep);
            const d = soDigitosCep(cep);
            if (d.length === 8 && cepValido(d)) void buscarCep(d);
          }}
          className="tnum mt-1 w-full rounded-md border border-line-2 px-3 py-2 text-sm"
        />
      </div>
      <div className="col-span-3 flex items-end pb-2 text-xs text-muted sm:col-span-4">
        {buscando ? "Consultando CEP…" : aviso ?? "O CEP preenche o resto."}
      </div>
      {campo("logradouro", "Rua", { className: "col-span-6 sm:col-span-4", autoComplete: "address-line1" })}
      {campo("numero", "Número", { className: "col-span-2", inputMode: "text" })}
      {campo("complemento", "Complemento (opcional)", { className: "col-span-4 sm:col-span-3" })}
      {campo("bairro", "Bairro", { className: "col-span-6 sm:col-span-3" })}
      {campo("cidade", "Cidade", { className: "col-span-4", autoComplete: "address-level2" })}
      <div className="col-span-2">
        <label htmlFor={`end-${organizacaoId}-uf`} className="label-xs">
          UF
        </label>
        <select
          id={`end-${organizacaoId}-uf`}
          value={f.uf}
          onChange={(e) => muda("uf", e.target.value)}
          className="mt-1 w-full rounded-md border border-line-2 bg-white px-2 py-2 text-sm"
        >
          <option value="">—</option>
          {Object.entries(UFS).map(([sigla, nome]) => (
            <option key={sigla} value={sigla} title={nome}>
              {sigla}
            </option>
          ))}
        </select>
      </div>

      <div className="col-span-6 space-y-2">
        {erro ? (
          <p className="rounded-md bg-red-soft px-3 py-2 text-sm text-red">{erro}</p>
        ) : salvo ? (
          <p className="text-xs text-green-deep">Endereço salvo.</p>
        ) : problema && f.cep ? (
          <p className="text-xs text-muted">{problema}</p>
        ) : null}
        <Button type="submit" disabled={Boolean(problema) || salvar.isPending}>
          {salvar.isPending ? "Salvando…" : "Salvar endereço"}
        </Button>
      </div>
    </form>
  );
}
