import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button, Card, Campo, Pill } from "@/components/bits";
import { apiRequest } from "@/lib/queryClient";
import { MODOS_DE_DIVULGACAO, STATUS_DA_DIVULGACAO, type AcaoDaDecisao, type ModoDeDivulgacao, type StatusDaDivulgacao } from "@shared/divulgacao";

interface Linha {
  id: string;
  autor: "afiliado" | "apostador";
  quem: string;
  rifa: string;
  slug: string;
  organizacao: string;
  legenda: string;
  midias: number;
  status: StatusDaDivulgacao;
  motivo: string | null;
  criadaEm: string;
  versao: number;
  editadaEm: string | null;
  /** As fotos do apostador: a organização vê cada uma antes de autorizar. */
  fotos: string[];
}

const PILL_DA_DIVULGACAO: Record<StatusDaDivulgacao, string> = {
  em_analise: "pending",
  publicada: "published",
  recusada: "expired",
  removida: "draft",
};

/**
 * Divulgação de terceiros no painel: o modo do influenciador (publicação
 * direta ou só depois da autorização) e a fila de peças de afiliados e
 * apostadores. É a mesma tela para a organização e para a plataforma — o
 * recorte vem do servidor (`orgOf`). O apostador sempre passa pela fila.
 */
export function DivulgacoesDaOrganizacao({ daOrganizacao }: { daOrganizacao: boolean }) {
  const qc = useQueryClient();
  const config = useQuery<{ modo: ModoDeDivulgacao | null; pendentes: number }>({ queryKey: ["/api/admin/divulgacoes/config"] });
  const fila = useQuery<Linha[]>({ queryKey: ["/api/admin/divulgacoes"] });
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null);
  const [abrindo, setAbrindo] = useState<{ id: string; versao: number; acao: Exclude<AcaoDaDecisao, "aprovar"> } | null>(null);
  const [motivo, setMotivo] = useState("");

  const recarregar = () => {
    qc.invalidateQueries({ queryKey: ["/api/admin/divulgacoes"] });
    qc.invalidateQueries({ queryKey: ["/api/admin/divulgacoes/config"] });
  };
  const trocarModo = useMutation({
    mutationFn: (modo: ModoDeDivulgacao) => apiRequest("PUT", "/api/admin/divulgacoes/config", { modo }),
    onSuccess: () => {
      setMsg({ ok: true, texto: "Modo salvo. Vale para as próximas peças." });
      recarregar();
    },
    onError: (e: Error) => setMsg({ ok: false, texto: e.message }),
  });
  const decidir = useMutation({
    // A versão lida vai junto: editada no meio, o servidor recusa e a lista recarrega.
    mutationFn: (v: { id: string; versao: number; acao: AcaoDaDecisao; motivo?: string }) =>
      apiRequest("POST", `/api/admin/divulgacoes/${v.id}`, { acao: v.acao, motivo: v.motivo, versao: v.versao }),
    onSuccess: () => {
      setAbrindo(null);
      setMotivo("");
      setMsg(null);
      recarregar();
    },
    onError: (e: Error) => {
      setMsg({ ok: false, texto: e.message });
      recarregar();
    },
  });

  const lista = fila.data ?? [];
  const pendentes = config.data?.pendentes ?? 0;
  return (
    <Card
      title="Divulgações de influenciadores e apostadores"
      right={pendentes ? <Pill status="pending">{`${pendentes} esperando`}</Pill> : undefined}
    >
      <div className="space-y-3 p-4 text-sm">
        <p className="text-muted">
          Afiliados com vínculo aprovado publicam com as mídias das suas rifas; apostadores publicam só texto, sobre rifa
          em que compraram, quando a plataforma liga essa opção. Nada altera a rifa, e texto com link, telefone ou
          pedido de Pix por fora é barrado.
        </p>
        {daOrganizacao ? (
          <fieldset>
            <legend className="label-xs">Publicação do influenciador</legend>
            <div className="mt-1 flex flex-wrap gap-4">
              {(Object.keys(MODOS_DE_DIVULGACAO) as ModoDeDivulgacao[]).map((m) => (
                <label key={m} className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="modo-divulgacao"
                    checked={config.data?.modo === m}
                    disabled={trocarModo.isPending}
                    onChange={() => trocarModo.mutate(m)}
                  />
                  {MODOS_DE_DIVULGACAO[m]}
                </label>
              ))}
            </div>
            <p className="mt-1 text-xs text-muted">
              No modo direto a peça do afiliado vai ao ar na hora (você pode retirar depois). A do apostador sempre espera
              a sua autorização.
            </p>
          </fieldset>
        ) : null}
        {msg ? <p className={`rounded-md px-3 py-2 ${msg.ok ? "bg-green-soft text-green-deep" : "bg-red-soft text-red"}`}>{msg.texto}</p> : null}
      </div>
      {lista.length === 0 ? (
        <p className="border-t border-line px-4 py-6 text-center text-sm text-muted">Nenhuma divulgação ainda.</p>
      ) : (
        <ul className="divide-y divide-line border-t border-line">
          {lista.map((l) => (
            <li key={l.id} className="space-y-2 px-4 py-3 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <Pill status={PILL_DA_DIVULGACAO[l.status]}>{STATUS_DA_DIVULGACAO[l.status]}</Pill>
                <span className="font-semibold">{l.quem}</span>
                <span className="text-xs text-muted">
                  {l.autor === "afiliado" ? "influenciador" : "apostador"} · {l.rifa}
                  {daOrganizacao ? "" : ` · ${l.organizacao}`}
                  {l.editadaEm ? " · editada" : ""}
                </span>
              </div>
              {l.legenda ? <p className="whitespace-pre-line break-words">{l.legenda}</p> : null}
              {l.midias ? <p className="tnum text-xs text-muted">{l.midias} mídia(s) da rifa</p> : null}
              {l.fotos.length ? (
                <ul aria-label="Fotos de quem publicou" className="flex flex-wrap gap-2">
                  {l.fotos.map((f, i) => (
                    <li key={f}>
                      <a href={f} target="_blank" rel="noreferrer" aria-label={`Abrir a foto ${i + 1} em outra aba`}>
                        <img src={f} alt={`Foto ${i + 1} de ${l.quem}`} loading="lazy" className="h-20 w-20 rounded-md object-cover" />
                      </a>
                    </li>
                  ))}
                </ul>
              ) : null}
              {l.motivo ? <p className="text-xs text-muted">Motivo: {l.motivo}</p> : null}
              {l.status === "em_analise" ? (
                <div className="flex flex-wrap gap-2">
                  <Button className="px-3 py-1 text-xs" disabled={decidir.isPending} onClick={() => decidir.mutate({ id: l.id, versao: l.versao, acao: "aprovar" })}>
                    Aprovar
                  </Button>
                  <Button variant="ghost" className="px-3 py-1 text-xs" onClick={() => setAbrindo({ id: l.id, versao: l.versao, acao: "recusar" })}>
                    Recusar
                  </Button>
                </div>
              ) : l.status === "publicada" ? (
                <Button variant="ghost" className="px-3 py-1 text-xs" onClick={() => setAbrindo({ id: l.id, versao: l.versao, acao: "remover" })}>
                  Retirar do ar
                </Button>
              ) : null}
              {abrindo?.id === l.id ? (
                <div className="space-y-2 rounded-md bg-mist p-3">
                  <Campo rotulo={abrindo.acao === "recusar" ? "Motivo da recusa" : "Motivo da retirada"} dica="Quem publicou lê isto.">
                    <input type="text" value={motivo} maxLength={300} onChange={(e) => setMotivo(e.target.value)} />
                  </Campo>
                  <div className="flex gap-2">
                    <Button
                      className="px-3 py-1 text-xs"
                      disabled={decidir.isPending || motivo.trim().length < 3}
                      onClick={() => decidir.mutate({ id: l.id, versao: abrindo.versao, acao: abrindo.acao, motivo })}
                    >
                      Confirmar
                    </Button>
                    <Button variant="ghost" className="px-3 py-1 text-xs" onClick={() => setAbrindo(null)}>
                      Cancelar
                    </Button>
                  </div>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
