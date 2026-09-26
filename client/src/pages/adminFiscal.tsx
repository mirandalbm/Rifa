import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { PanelShell } from "@/components/AppShell";
import { Button, Card, Empty, Pill } from "@/components/bits";
import { apiRequest } from "@/lib/queryClient";
import { maskCpf } from "@shared/format";
import { enderecoEmUmaLinha } from "@shared/endereco";
import { DOCUMENTOS, STATUS_FISCAL, type DadosFiscais, type StatusFiscal } from "@shared/fiscal";

interface Linha {
  affiliateId: string;
  status: StatusFiscal;
  enviadoEm: string | null;
  decididoEm: string | null;
  motivo: string | null;
  nome: string;
  email: string;
  codigo: string;
}

const PILL: Record<StatusFiscal, string> = { incompleto: "draft", em_analise: "pending", aprovado: "active", recusado: "blocked" };

/**
 * Cadastros fiscais dos afiliados (só a plataforma). Abrir um cadastro ou
 * um documento fica registrado na auditoria — por isso os dados só carregam
 * quando alguém clica em "Conferir", nunca na lista.
 */
export function AdminFiscal() {
  const { data = [] } = useQuery<Linha[]>({ queryKey: ["/api/admin/fiscal"] });
  const [aberto, setAberto] = useState<string | null>(null);
  const fila = data.filter((l) => l.status === "em_analise");
  const resto = data.filter((l) => l.status !== "em_analise");

  const lista = (linhas: Linha[]) => (
    <ul className="divide-y divide-line">
      {linhas.map((l) => (
        <li key={l.affiliateId} className="px-4 py-3 text-sm">
          <div className="flex flex-wrap items-center gap-3">
            <span className="min-w-0 flex-1">
              <span className="font-semibold">{l.nome}</span> · <span className="tnum text-muted">{l.codigo}</span>
              <span className="block text-xs text-muted">{l.email}</span>
            </span>
            <Pill status={PILL[l.status]}>{STATUS_FISCAL[l.status]}</Pill>
            <Button variant="ghost" className="px-3 py-1 text-xs" onClick={() => setAberto(aberto === l.affiliateId ? null : l.affiliateId)}>
              {aberto === l.affiliateId ? "Fechar" : "Conferir"}
            </Button>
          </div>
          {aberto === l.affiliateId ? <Conferencia affiliateId={l.affiliateId} emAnalise={l.status === "em_analise"} /> : null}
        </li>
      ))}
    </ul>
  );

  return (
    <PanelShell title="Cadastros fiscais">
      <div className="space-y-3">
        <Card title="Em análise" right={<Pill status="pending">{`${fila.length}`}</Pill>}>
          {fila.length ? lista(fila) : <Empty>Nenhum cadastro esperando.</Empty>}
        </Card>
        <Card title="Aprovados, recusados e incompletos">{resto.length ? lista(resto) : <Empty>Nenhum outro cadastro.</Empty>}</Card>
      </div>
    </PanelShell>
  );
}

function Conferencia({ affiliateId, emAnalise }: { affiliateId: string; emAnalise: boolean }) {
  const qc = useQueryClient();
  const { data } = useQuery<{ dados: DadosFiscais | null; documentos: { tipo: string; mime: string }[] }>({
    queryKey: [`/api/admin/fiscal/${affiliateId}`],
    staleTime: 0,
    // Cada leitura entra na auditoria: sem releitura ao voltar para a aba.
    refetchOnWindowFocus: false,
  });
  const [motivo, setMotivo] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const decidir = useMutation({
    mutationFn: (status: "aprovado" | "recusado") => apiRequest("POST", `/api/admin/fiscal/${affiliateId}/decidir`, { status, motivo }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/admin/fiscal"] }),
    onError: (e: Error) => setErro(e.message),
  });
  if (!data) return <p className="mt-2 text-xs text-muted">Abrindo…</p>;
  const d = data.dados;
  return (
    <div className="mt-3 space-y-3 rounded-md border border-line bg-mist p-3 text-sm">
      {d ? (
        <dl className="grid gap-2 sm:grid-cols-2">
          <Item rotulo="Nome" valor={d.nomeCompleto} />
          <Item rotulo="CPF" valor={maskCpf(d.cpf)} tnum />
          <Item rotulo="RG" valor={d.rg} tnum />
          <Item rotulo="Nascimento" valor={d.nascimento.split("-").reverse().join("/")} tnum />
          <Item rotulo="Endereço" valor={enderecoEmUmaLinha(d.endereco)} />
          <Item rotulo="Conta" valor={`banco ${d.conta.banco} · ag. ${d.conta.agencia} · ${d.conta.tipo} ${d.conta.conta}`} tnum />
        </dl>
      ) : (
        <p className="text-muted">Sem dados enviados.</p>
      )}
      <div className="flex flex-wrap gap-2">
        {(Object.entries(DOCUMENTOS) as [string, string][]).map(([tipo, nome]) =>
          data.documentos.some((x) => x.tipo === tipo) ? (
            <a
              key={tipo}
              href={`/api/admin/fiscal/${affiliateId}/documentos/${tipo}`}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-md border border-line-2 bg-white px-3 py-1.5 text-xs underline"
            >
              {nome}
            </a>
          ) : (
            <span key={tipo} className="rounded-md border border-dashed border-line-2 px-3 py-1.5 text-xs text-muted">
              {nome}: falta
            </span>
          ),
        )}
      </div>
      {emAnalise ? (
        <div className="space-y-2">
          <input
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            placeholder="Motivo (obrigatório para recusar)"
            className="w-full rounded-md border border-line-2 px-3 py-1.5 text-sm"
          />
          {erro ? <p className="text-xs text-red">{erro}</p> : null}
          <div className="flex gap-2">
            <Button className="px-3 py-1 text-xs" disabled={decidir.isPending} onClick={() => decidir.mutate("aprovado")}>
              Aprovar
            </Button>
            <Button variant="ghost" className="px-3 py-1 text-xs" disabled={decidir.isPending} onClick={() => decidir.mutate("recusado")}>
              Recusar
            </Button>
          </div>
        </div>
      ) : null}
      <p className="text-[11px] text-muted">Esta consulta e cada documento aberto ficam registrados na auditoria.</p>
    </div>
  );
}

function Item({ rotulo, valor, tnum }: { rotulo: string; valor: string; tnum?: boolean }) {
  return (
    <div>
      <dt className="label-xs">{rotulo}</dt>
      <dd className={tnum ? "tnum" : ""}>{valor}</dd>
    </div>
  );
}
