import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, Empty, Pill } from "@/components/bits";
import { apiRequest } from "@/lib/queryClient";

interface Linha {
  id: string;
  protocolo: string;
  motivoTexto: string;
  automatica: boolean;
  status: string;
  criadaEm: string;
  partes: { tipo: string; nome: string }[];
}
interface Detalhe {
  id: string;
  protocolo: string;
  motivoTexto: string;
  automatica: boolean;
  denunciou: string | null;
  texto: string | null;
  status: string;
  decisao: string | null;
  encerrada: boolean;
  partes: { a: { nome: string; tipo: string }; b: { nome: string; tipo: string } };
  trecho: { de: string; texto: string; em: string; imagem?: string }[];
}

const SITUACAO: Record<string, { rotulo: string; pill: string }> = {
  aberta: { rotulo: "em análise", pill: "pending" },
  procedente: { rotulo: "conversa encerrada", pill: "expired" },
  improcedente: { rotulo: "improcedente", pill: "draft" },
};

/**
 * As conversas denunciadas (Mensagens): a fila não traz texto nenhum; o
 * trecho — só as últimas mensagens anexadas à denúncia — carrega ao abrir, e
 * a leitura entra na auditoria antes de aparecer. Procedente encerra a
 * conversa (ninguém mais escreve); a decisão é de um clique só.
 */
export function ConversasDenunciadasDaPlataforma() {
  const [aberta, setAberta] = useState<string | null>(null);
  const { data } = useQuery<Linha[]>({ queryKey: ["/api/admin/mensagens/denuncias", { status: "aberta" }], refetchInterval: 30_000 });
  return (
    <div className="mt-4">
      <Card title="Conversas denunciadas">
        {data?.length ? (
          <ul className="divide-y divide-line">
            {data.map((d) => (
              <li key={d.id}>
                <button type="button" onClick={() => setAberta(aberta === d.id ? null : d.id)} aria-expanded={aberta === d.id} className="w-full px-4 py-3 text-left hover:bg-mist">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="tnum text-sm font-semibold">{d.protocolo}</span>
                    <Pill status={SITUACAO[d.status]?.pill ?? "draft"}>{SITUACAO[d.status]?.rotulo ?? d.status}</Pill>
                  </div>
                  <p className="mt-1 text-sm">{d.motivoTexto}</p>
                  <p className="text-xs text-muted">
                    {d.partes.map((p) => p.nome).join(" ↔ ")} · {d.automatica ? "varredura automática" : "denúncia de usuário"}
                  </p>
                </button>
                {aberta === d.id ? <DetalheDaConversa id={d.id} /> : null}
              </li>
            ))}
          </ul>
        ) : (
          <Empty>Nenhuma conversa denunciada em análise.</Empty>
        )}
      </Card>
    </div>
  );
}

function DetalheDaConversa({ id }: { id: string }) {
  const qc = useQueryClient();
  const { data: d } = useQuery<Detalhe>({ queryKey: [`/api/admin/mensagens/denuncias/${id}`], staleTime: 0, gcTime: 0 });
  const [resposta, setResposta] = useState("");
  const [aviso, setAviso] = useState<{ ok: boolean; texto: string } | null>(null);
  const decidir = useMutation({
    mutationFn: (decisao: "procedente" | "improcedente") => apiRequest("POST", `/api/admin/mensagens/denuncias/${id}/decidir`, { decisao, resposta }),
    onSuccess: (_r, decisao) => {
      setAviso({ ok: true, texto: decisao === "procedente" ? "Conversa encerrada: ninguém mais escreve nela." : "Denúncia encerrada como improcedente." });
      qc.invalidateQueries({ queryKey: ["/api/admin/mensagens/denuncias"] });
      qc.invalidateQueries({ queryKey: ["/api/admin/chamados/pendentes"] });
    },
    onError: (e: Error) => setAviso({ ok: false, texto: e.message }),
  });
  if (!d) return <p className="px-4 pb-4 text-sm text-muted">Carregando o trecho…</p>;
  const nome = (l: string) => (l === "a" ? d.partes.a.nome : d.partes.b.nome);
  return (
    <div className="space-y-3 border-t border-line bg-mist px-4 py-4 text-sm">
      {d.texto ? <p className="rounded-md bg-white p-3">{d.texto}</p> : null}
      <p className="text-xs text-muted">As últimas {d.trecho.length} mensagens da conversa, guardadas na hora da denúncia.</p>
      <ul className="space-y-1.5">
        {d.trecho.map((m, i) => (
          <li key={i} className="rounded-md bg-white px-3 py-2">
            <span className="text-xs font-semibold">{nome(m.de)}</span>
            <span className="tnum ml-2 text-[11px] text-muted">{new Date(m.em).toLocaleString("pt-BR")}</span>
            {m.imagem ? (
              <p className="text-xs">
                [foto]{" "}
                <a
                  href={`/api/admin/mensagens/denuncias/${id}/fotos/${m.imagem}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-semibold text-green-deep underline"
                >
                  Abrir a foto (abre em outra aba; fica na auditoria)
                </a>
              </p>
            ) : null}
            {m.texto || !m.imagem ? <p className="whitespace-pre-wrap break-words">{m.texto || "(cartão de rifa)"}</p> : null}
          </li>
        ))}
      </ul>
      {d.status === "aberta" ? (
        <div className="space-y-2">
          <label htmlFor={`decisao-${id}`} className="label-xs">
            Explicação (obrigatória para encerrar a conversa)
          </label>
          <textarea id={`decisao-${id}`} className="campo w-full" rows={2} maxLength={1000} value={resposta} onChange={(e) => setResposta(e.target.value)} />
          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={decidir.isPending} onClick={() => decidir.mutate("procedente")} className="rounded-md bg-green px-3 py-1.5 text-sm font-semibold text-on-green disabled:opacity-50">
              Procedente: encerrar a conversa
            </button>
            <button type="button" disabled={decidir.isPending} onClick={() => decidir.mutate("improcedente")} className="rounded-md border border-line bg-white px-3 py-1.5 text-sm font-semibold">
              Improcedente
            </button>
          </div>
        </div>
      ) : (
        <p className="text-xs text-muted">Decidida{d.decisao ? `: ${d.decisao}` : "."}</p>
      )}
      {aviso ? <p role="status" className={`rounded-md px-3 py-2 ${aviso.ok ? "bg-green-soft text-green-deep" : "bg-red-soft text-red"}`}>{aviso.texto}</p> : null}
    </div>
  );
}
