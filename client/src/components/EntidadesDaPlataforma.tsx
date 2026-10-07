import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button, Card, Campo, Pill } from "@/components/bits";
import { MestreDetalhe } from "@/components/painel";
import { apiRequest } from "@/lib/queryClient";
import { formatarCnpj } from "@shared/format";
import { DOCUMENTOS_DA_ENTIDADE, documentosQueFaltam, type DocumentoDaEntidade } from "@shared/bannerDivulgacao";

interface Linha {
  campaignId: string;
  nome: string;
  cnpj: string | null;
  site: string | null;
  versao: string;
  rifa: string;
  organizacao: string;
  documentos: { tipo: DocumentoDaEntidade; mime: string; tamanho: number; em: string }[];
}

/**
 * A fila das entidades beneficiadas (resposta 2.5 do advogado): a entidade só
 * aparece na rifa depois que a plataforma confere o CNPJ ativo, a ata da
 * diretoria e a certidão de regularidade fiscal. Abrir um documento entra na
 * auditoria antes de o arquivo sair; a decisão é sobre a versão aberta.
 */
export function EntidadesDaPlataforma() {
  const qc = useQueryClient();
  const chave = ["/api/admin/entidades"];
  const { data } = useQuery<Linha[]>({ queryKey: chave, refetchInterval: 30_000 });
  const [aberto, setAberto] = useState<string | null>(null);
  const [motivo, setMotivo] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null);
  const item = data?.find((l) => l.campaignId === aberto) ?? null;

  const decidir = useMutation({
    mutationFn: (status: "aprovado" | "recusado") =>
      apiRequest("POST", `/api/admin/entidades/${aberto}/decidir`, { status, motivo, versao: item?.versao }),
    onSuccess: (_r, status) => {
      setMsg({ ok: true, texto: status === "aprovado" ? "Aprovada: a entidade aparece na rifa." : "Recusada: a organização lê o motivo." });
      setMotivo("");
      setAberto(null);
      qc.invalidateQueries({ queryKey: chave });
      qc.invalidateQueries({ queryKey: ["/api/admin/caixa-de-entrada"] });
    },
    onError: (e: Error) => setMsg({ ok: false, texto: e.message.replace(/^\d+:\s*/, "") }),
  });

  return (
    <MestreDetalhe
      aberto={item ? aberto : null}
      aoFechar={() => setAberto(null)}
      vazio="Escolha uma entidade para conferir os documentos."
      lista={
        <Card title="Entidades beneficiadas">
          {msg && !item ? (
            <p role="status" className={`px-4 pt-3 text-sm ${msg.ok ? "text-green-deep" : "text-red"}`}>
              {msg.texto}
            </p>
          ) : null}
          {data?.length ? (
            <ul className="divide-y divide-line">
              {data.map((l) => (
                <li key={l.campaignId}>
                  <button
                    type="button"
                    onClick={() => {
                      setMsg(null);
                      setMotivo("");
                      setAberto(l.campaignId);
                    }}
                    className={`w-full px-4 py-3 text-left hover:bg-mist ${aberto === l.campaignId ? "bg-mist" : ""}`}
                  >
                    <span className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-sm font-semibold">{l.nome}</span>
                      <Pill status="pending">em análise</Pill>
                    </span>
                    <span className="mt-1 block text-xs text-muted">
                      {l.organizacao} · rifa {l.rifa}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="p-4 text-sm text-muted">Nenhuma entidade esperando conferência.</p>
          )}
        </Card>
      }
      detalhe={
        item ? (
          <Card title={item.nome}>
            <div className="space-y-3 p-4 text-sm">
              <dl className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <div>
                  <dt className="label-xs">CNPJ</dt>
                  <dd className="tnum">{item.cnpj ? formatarCnpj(item.cnpj) : "—"}</dd>
                </div>
                <div>
                  <dt className="label-xs">Organização e rifa</dt>
                  <dd>
                    {item.organizacao} · {item.rifa}
                  </dd>
                </div>
                {item.site ? (
                  <div className="sm:col-span-2">
                    <dt className="label-xs">Site</dt>
                    <dd className="break-all">{item.site}</dd>
                  </div>
                ) : null}
              </dl>
              <p className="text-xs text-muted">
                Confira: o CNPJ ativo é desta entidade, a ata traz a diretoria em exercício e a certidão está válida. O
                nome na rifa tem de ser o do CNPJ.
              </p>
              <ul className="space-y-1">
                {(Object.keys(DOCUMENTOS_DA_ENTIDADE) as DocumentoDaEntidade[]).map((tipo) => {
                  const d = item.documentos.find((x) => x.tipo === tipo);
                  return (
                    <li key={tipo} className="flex flex-wrap items-center justify-between gap-2">
                      <span>{DOCUMENTOS_DA_ENTIDADE[tipo]}</span>
                      {d ? (
                        <a
                          href={`/api/admin/entidades/${item.campaignId}/documentos/${tipo}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-marca underline"
                        >
                          Abrir ({d.mime === "application/pdf" ? "PDF" : "foto"})
                        </a>
                      ) : (
                        <span className="text-xs text-muted">não enviado</span>
                      )}
                    </li>
                  );
                })}
              </ul>
              {documentosQueFaltam(item.documentos.map((d) => d.tipo)).length ? (
                <p className="text-xs text-red">Falta documento obrigatório: recuse e diga o que mandar.</p>
              ) : null}
              <Campo rotulo="Motivo (obrigatório para recusar)" dica="A organização lê este texto.">
                <textarea rows={3} maxLength={500} value={motivo} onChange={(e) => setMotivo(e.target.value)} />
              </Campo>
              {msg ? (
                <p role="status" className={`text-sm ${msg.ok ? "text-green-deep" : "text-red"}`}>
                  {msg.texto}
                </p>
              ) : null}
              <div className="flex flex-wrap gap-2">
                <Button
                  disabled={decidir.isPending || documentosQueFaltam(item.documentos.map((d) => d.tipo)).length > 0}
                  onClick={() => decidir.mutate("aprovado")}
                >
                  Aprovar a entidade
                </Button>
                <Button variant="ghost" disabled={decidir.isPending || motivo.trim().length < 5} onClick={() => decidir.mutate("recusado")}>
                  Recusar
                </Button>
              </div>
            </div>
          </Card>
        ) : null
      }
    />
  );
}
