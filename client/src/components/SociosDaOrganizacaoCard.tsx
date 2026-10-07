import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button, Campo, Card, Pill } from "@/components/bits";
import { apiRequest } from "@/lib/queryClient";
import { cpfValido, maskCpf } from "@shared/format";
import { CARGOS_DO_SOCIO, DECLARACAO_DOS_SOCIOS, type CargoDoSocio } from "@shared/socios";

interface Lista {
  socios: { id: string; nome: string; cargo: CargoDoSocio; cpf: string }[];
  declaradaEm: string | null;
  maximo: number;
}

/**
 * Sócios e diretores da organização (resposta 5.6 do advogado): não podem
 * participar das rifas autorizadas dela, e a compra com o CPF de um deles é
 * recusada. A organização declara a lista completa; mexer nela apaga a
 * declaração. Só a organização vê este cartão (a plataforma só consulta).
 */
export function SociosDaOrganizacaoCard() {
  const qc = useQueryClient();
  const { data: org } = useQuery<{ organizacaoId?: string }>({ queryKey: ["/api/admin/organizer"] });
  const id = org?.organizacaoId;
  const chave = [`/api/admin/organizacoes/${id}/socios`];
  const { data } = useQuery<Lista>({ queryKey: chave, enabled: Boolean(id) });

  const [nome, setNome] = useState("");
  const [cpf, setCpf] = useState("");
  const [cargo, setCargo] = useState<CargoDoSocio>("socio");
  const [erroCpf, setErroCpf] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null);

  const recarregar = () => qc.invalidateQueries({ queryKey: chave });
  const falhou = (e: Error) => setMsg({ ok: false, texto: e.message.replace(/^\d+:\s*/, "") });

  const adicionar = useMutation({
    mutationFn: () => apiRequest("POST", `/api/admin/organizacoes/${id}/socios`, { nome, cpf, cargo }),
    onSuccess: () => {
      setNome("");
      setCpf("");
      setMsg({ ok: true, texto: "Pessoa incluída. Declare a lista completa de novo." });
      recarregar();
    },
    onError: falhou,
  });
  const remover = useMutation({
    mutationFn: (socioId: string) => apiRequest("DELETE", `/api/admin/organizacoes/${id}/socios/${socioId}`),
    onSuccess: () => {
      setMsg({ ok: true, texto: "Pessoa removida. Declare a lista completa de novo." });
      recarregar();
    },
    onError: falhou,
  });
  const declarar = useMutation({
    mutationFn: () => apiRequest("POST", `/api/admin/organizacoes/${id}/socios/declarar`),
    onSuccess: () => {
      setMsg({ ok: true, texto: "Lista declarada completa." });
      recarregar();
    },
    onError: falhou,
  });

  if (!id) return null;
  const socios = data?.socios ?? [];
  const cheia = socios.length >= (data?.maximo ?? 30);

  return (
    <Card
      title="Sócios e diretores"
      right={data?.declaradaEm ? <Pill status="published">declarada</Pill> : <Pill status="pending">falta declarar</Pill>}
    >
      <div className="space-y-3 p-4">
        <p className="text-xs text-muted">
          Pelo regulamento, a promotora, seus sócios e diretores não podem participar das rifas autorizadas. Cadastre
          todos e declare a lista completa: sem a declaração, a rifa autorizada não publica, e a compra com o CPF de
          um deles é recusada. O CPF fica guardado só como impressão — a tela mostra apenas o final.
        </p>

        {socios.length ? (
          <ul className="divide-y divide-line rounded-lg border border-line">
            {socios.map((s) => (
              <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm">
                <span className="min-w-0">
                  <span className="block font-medium">{s.nome}</span>
                  <span className="block text-xs text-muted">
                    {CARGOS_DO_SOCIO[s.cargo] ?? s.cargo} · CPF <span className="tnum">{s.cpf}</span>
                  </span>
                </span>
                <Button
                  variant="ghost"
                  className="!px-3 !py-1 text-xs"
                  disabled={remover.isPending}
                  aria-label={`Remover ${s.nome} da lista`}
                  onClick={() => {
                    setMsg(null);
                    remover.mutate(s.id);
                  }}
                >
                  Remover
                </Button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted">Nenhuma pessoa cadastrada ainda.</p>
        )}

        {cheia ? null : (
          <form
            className="grid grid-cols-1 gap-3 sm:grid-cols-2"
            onSubmit={(e) => {
              e.preventDefault();
              setMsg(null);
              if (!cpfValido(cpf)) {
                setErroCpf("CPF inválido.");
                return;
              }
              adicionar.mutate();
            }}
          >
            <Campo rotulo="Nome completo" className="sm:col-span-2">
              <input value={nome} maxLength={120} autoComplete="off" onChange={(e) => setNome(e.target.value)} />
            </Campo>
            <Campo rotulo="CPF" erro={erroCpf}>
              <input
                value={cpf}
                inputMode="numeric"
                autoComplete="off"
                className="campo tnum text-sm"
                onChange={(e) => {
                  setErroCpf(null);
                  setCpf(maskCpf(e.target.value));
                }}
              />
            </Campo>
            <Campo rotulo="Cargo">
              <select value={cargo} onChange={(e) => setCargo(e.target.value as CargoDoSocio)}>
                {Object.entries(CARGOS_DO_SOCIO).map(([valor, rotulo]) => (
                  <option key={valor} value={valor}>
                    {rotulo}
                  </option>
                ))}
              </select>
            </Campo>
            <div className="sm:col-span-2">
              <Button type="submit" variant="ghost" disabled={adicionar.isPending || nome.trim().length < 3}>
                Incluir na lista
              </Button>
            </div>
          </form>
        )}

        <div className="rounded-lg bg-mist p-3">
          <p className="text-sm">{DECLARACAO_DOS_SOCIOS}</p>
          {data?.declaradaEm ? (
            <p className="mt-2 text-xs text-muted">
              Declarada em <span className="tnum">{new Date(data.declaradaEm).toLocaleString("pt-BR")}</span>.
            </p>
          ) : (
            <Button className="mt-2" disabled={declarar.isPending || socios.length === 0} onClick={() => declarar.mutate()}>
              Declarar a lista completa
            </Button>
          )}
        </div>

        {msg ? (
          <p role="status" className={`text-sm ${msg.ok ? "text-green-deep" : "text-red"}`}>
            {msg.texto}
          </p>
        ) : null}
      </div>
    </Card>
  );
}
